import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import { listLayouts } from "@/src/server/layout-storage";
import { normalizeWorkspaceId } from "@/src/server/workspace-context";

export const runtime = "nodejs";

type ImportedWorkspaceResult = {
  workspaceId: string;
  database: string;
  sourceFileName: string;
  importedLayoutNames: string[];
};

type DdrImporterModule = {
  readAsXml: (rawBuffer: Buffer) => string;
  parseSummaryFileEntries: (
    summaryXml: string,
    summaryPath: string,
    workspacePrefix: string
  ) => Array<{
    ddrPath: string;
    fileName: string;
    databaseName: string;
    workspaceId: string;
    hostHint?: string;
  }>;
  normalizeDatabaseToken: (value: string) => string;
  extractHostHintFromXml: (xml: string) => string;
  inferDatabaseScope: (xml: string) => string;
  inferSourceFileName: (xml: string) => string;
  importDdrToWorkspace: (options: {
    cwd: string;
    ddrPath: string;
    workspaceId: string;
    summaryPath: string;
    solutionName: string;
    workspaceByDatabaseToken: Record<string, string>;
    hostHint: string;
  }) => Promise<ImportedWorkspaceResult>;
};

const uploadedSolutionsRoot = path.join(process.cwd(), "data", "uploaded-solutions");

function normalizeUploadedName(name: string): string {
  const base = path.basename(String(name || "upload.xml")).trim() || "upload.xml";
  return base.replace(/[^\w.\- ]+/g, "_");
}

function isXmlUpload(entry: FormDataEntryValue): entry is File {
  return typeof entry === "object" && entry !== null && "arrayBuffer" in entry && "name" in entry;
}

function looksLikeDdrXml(xml: string): boolean {
  return /<FMSaveAsXML\b|<FMPReport\b/i.test(xml);
}

function makeBatchSolutionName(explicitName: string, databases: string[]): string {
  const trimmed = explicitName.trim();
  if (trimmed) {
    return trimmed;
  }
  if (databases.length === 1) {
    return databases[0] || "Imported Solution";
  }
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  return `Uploaded Solution ${stamp}`;
}

async function loadDdrImporter(): Promise<DdrImporterModule> {
  const importerPath = pathToFileURL(path.join(process.cwd(), "scripts", "import-ddr-layouts.mjs")).href;
  return (await import(importerPath)) as DdrImporterModule;
}

async function writeUploadedFiles(files: File[], targetDir: string): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true });
  const usedNames = new Set<string>();
  const paths: string[] = [];

  for (const file of files) {
    const original = normalizeUploadedName(file.name);
    const ext = path.extname(original);
    const stem = ext ? original.slice(0, -ext.length) : original;
    let candidate = original;
    let index = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${stem}-${index}${ext}`;
      index += 1;
    }
    usedNames.add(candidate.toLowerCase());
    const filePath = path.join(targetDir, candidate);
    const raw = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, raw);
    paths.push(filePath);
  }

  return paths;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const workspacePrefix = String(formData.get("workspacePrefix") ?? "").trim();
    const explicitSolutionName = String(formData.get("solutionName") ?? "").trim();
    const fileEntries = formData.getAll("files").filter(isXmlUpload).filter((file) => file.size > 0);

    if (fileEntries.length === 0) {
      return NextResponse.json(
        {
          error: "No files selected. Choose one or more FMSaveAsXML or FMPReport DDR XML files."
        },
        { status: 400 }
      );
    }

    const importId = `solution-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const importDir = path.join(uploadedSolutionsRoot, importId);
    const uploadedFilePaths = await writeUploadedFiles(fileEntries, importDir);
    const importer = await loadDdrImporter();

    const fileXmlInfo: Array<{ filePath: string; xml: string }> = [];
    for (const filePath of uploadedFilePaths) {
      const raw = await fs.readFile(filePath);
      const xml = importer.readAsXml(raw);
      if (!looksLikeDdrXml(xml) && path.basename(filePath).toLowerCase() !== "summary.xml") {
        return NextResponse.json(
          {
            error: `Unsupported XML: ${path.basename(
              filePath
            )}. Expected a FileMaker DDR XML in FMSaveAsXML or FMPReport format.`
          },
          { status: 400 }
        );
      }
      fileXmlInfo.push({ filePath, xml });
    }

    const summaryCandidate = uploadedFilePaths.find((filePath) => path.basename(filePath).toLowerCase() === "summary.xml");
    const workspaceByDatabaseToken: Record<string, string> = {};
    const results: ImportedWorkspaceResult[] = [];

    if (summaryCandidate) {
      const summaryXml = fileXmlInfo.find((entry) => entry.filePath === summaryCandidate)?.xml || "";
      const summaryEntries = importer.parseSummaryFileEntries(summaryXml, summaryCandidate, workspacePrefix);
      if (summaryEntries.length === 0) {
        return NextResponse.json({ error: "Summary.xml did not reference any DDR files." }, { status: 400 });
      }

      const referencedPaths = new Set(summaryEntries.map((entry) => path.normalize(entry.ddrPath)));
      const missing = [...referencedPaths].filter(
        (ddrPath) => !uploadedFilePaths.some((uploaded) => path.normalize(uploaded) === ddrPath)
      );
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Summary.xml references files that were not uploaded: ${missing
              .map((entry) => path.basename(entry))
              .join(", ")}`
          },
          { status: 400 }
        );
      }

      for (const entry of summaryEntries) {
        if (entry.databaseName) {
          workspaceByDatabaseToken[importer.normalizeDatabaseToken(entry.databaseName)] = entry.workspaceId;
        }
        if (entry.fileName) {
          workspaceByDatabaseToken[importer.normalizeDatabaseToken(entry.fileName)] = entry.workspaceId;
        }
      }

      const solutionName =
        explicitSolutionName || path.basename(path.dirname(summaryCandidate)).trim() || "Imported Solution";
      for (const entry of summaryEntries) {
        const result = await importer.importDdrToWorkspace({
          cwd: process.cwd(),
          ddrPath: entry.ddrPath,
          workspaceId: entry.workspaceId,
          summaryPath: summaryCandidate,
          solutionName,
          workspaceByDatabaseToken,
          hostHint: String(entry.hostHint ?? "")
        });
        results.push(result);
      }
    } else {
      const databaseNames: string[] = [];
      const fileImports: Array<{ filePath: string; workspaceId: string; hostHint: string }> = [];

      for (const { filePath, xml } of fileXmlInfo) {
        if (!looksLikeDdrXml(xml)) {
          continue;
        }
        const database = importer.inferDatabaseScope(xml);
        const sourceFileName = importer.inferSourceFileName(xml);
        const workspaceIdBase = normalizeWorkspaceId(database || sourceFileName || path.basename(filePath, ".xml"));
        const workspaceId = workspacePrefix
          ? normalizeWorkspaceId(`${workspacePrefix}-${workspaceIdBase}`)
          : workspaceIdBase;
        fileImports.push({ filePath, workspaceId, hostHint: importer.extractHostHintFromXml(xml) });
        databaseNames.push(database || workspaceId);
        workspaceByDatabaseToken[importer.normalizeDatabaseToken(database)] = workspaceId;
        workspaceByDatabaseToken[importer.normalizeDatabaseToken(sourceFileName)] = workspaceId;
      }

      if (fileImports.length === 0) {
        return NextResponse.json(
          {
            error: "No DDR XML files detected. Select FileMaker DDR XML files in FMSaveAsXML or FMPReport format."
          },
          { status: 400 }
        );
      }

      const solutionName = makeBatchSolutionName(explicitSolutionName, databaseNames);
      for (const entry of fileImports) {
        const result = await importer.importDdrToWorkspace({
          cwd: process.cwd(),
          ddrPath: entry.filePath,
          workspaceId: entry.workspaceId,
          summaryPath: "",
          solutionName,
          workspaceByDatabaseToken,
          hostHint: entry.hostHint
        });
        results.push(result);
      }
    }

    const firstWorkspaceId = results[0]?.workspaceId || "default";
    const layouts = await listLayouts(firstWorkspaceId);
    const nextLayoutId = layouts[0]?.id || "default";
    const totalLayouts = results.reduce((sum, entry) => sum + entry.importedLayoutNames.length, 0);

    return NextResponse.json({
      ok: true,
      importId,
      uploadedFileCount: uploadedFilePaths.length,
      importedWorkspaceCount: results.length,
      importedLayoutCount: totalLayouts,
      workspaces: results.map((entry) => ({
        workspaceId: entry.workspaceId,
        database: entry.database,
        sourceFileName: entry.sourceFileName,
        importedLayoutCount: entry.importedLayoutNames.length
      })),
      nextWorkspaceId: firstWorkspaceId,
      nextLayoutId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import solution"
      },
      { status: 500 }
    );
  }
}
