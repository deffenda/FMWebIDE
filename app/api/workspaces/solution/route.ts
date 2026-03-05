import path from "node:path";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import {
  DEFAULT_WORKSPACE_ID,
  deleteWorkspaceStorage,
  listWorkspaceIds,
  normalizeWorkspaceId,
  readWorkspaceConfig
} from "@/src/server/workspace-context";

export const runtime = "nodejs";
const uploadedSolutionsRoot = path.resolve(process.cwd(), "data", "uploaded-solutions");

type WorkspaceSummary = {
  id: string;
  filemaker: {
    summaryPath: string;
    solutionName: string;
    ddrPath: string;
  };
};

function normalizeTextToken(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePathToken(value: string | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  return path.normalize(raw).replace(/\\/g, "/").toLowerCase();
}

function resolveUploadedSolutionDir(filePath: string | undefined): string | null {
  const raw = String(filePath ?? "").trim();
  if (!raw) {
    return null;
  }
  const absolute = path.resolve(raw);
  if (
    absolute !== uploadedSolutionsRoot &&
    !absolute.startsWith(`${uploadedSolutionsRoot}${path.sep}`)
  ) {
    return null;
  }
  const relative = path.relative(uploadedSolutionsRoot, absolute);
  if (!relative || relative.startsWith("..")) {
    return null;
  }
  const topLevel = relative.split(path.sep)[0] ?? "";
  if (!topLevel) {
    return null;
  }
  return path.join(uploadedSolutionsRoot, topLevel);
}

async function listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  const ids = await listWorkspaceIds();
  return Promise.all(
    ids.map(async (id) => {
      const config = await readWorkspaceConfig(id);
      return {
        id,
        filemaker: {
          summaryPath: normalizePathToken(config?.filemaker?.summaryPath),
          solutionName: normalizeTextToken(config?.filemaker?.solutionName),
          ddrPath: normalizePathToken(config?.filemaker?.ddrPath)
        }
      };
    })
  );
}

function resolveSolutionWorkspaceIds(workspaces: WorkspaceSummary[], currentWorkspaceId: string): string[] {
  const anchor = workspaces.find((entry) => entry.id === currentWorkspaceId);
  if (!anchor) {
    return [currentWorkspaceId];
  }

  const summaryToken = anchor.filemaker.summaryPath;
  const solutionToken = anchor.filemaker.solutionName;
  const ddrToken = anchor.filemaker.ddrPath;

  const result = new Set<string>([currentWorkspaceId]);

  for (const workspace of workspaces) {
    if (workspace.id === currentWorkspaceId) {
      result.add(workspace.id);
      continue;
    }

    // Keep the default workspace unless it is the explicit anchor the user is deleting.
    if (workspace.id === DEFAULT_WORKSPACE_ID) {
      continue;
    }

    if (summaryToken) {
      if (workspace.filemaker.summaryPath && workspace.filemaker.summaryPath === summaryToken) {
        result.add(workspace.id);
      }
      continue;
    }

    if (solutionToken) {
      if (workspace.filemaker.solutionName && workspace.filemaker.solutionName === solutionToken) {
        result.add(workspace.id);
      }
      continue;
    }

    if (ddrToken) {
      if (workspace.filemaker.ddrPath && workspace.filemaker.ddrPath === ddrToken) {
        result.add(workspace.id);
      }
      continue;
    }
  }

  return [...result].sort((a, b) => a.localeCompare(b));
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceFromQuery = url.searchParams.get("workspace");
    const workspaceIdFromQuery = url.searchParams.get("workspaceId");
    const currentWorkspaceId = normalizeWorkspaceId(
      workspaceFromQuery ?? workspaceIdFromQuery ?? DEFAULT_WORKSPACE_ID
    );
    const workspaces = await listWorkspaceSummaries();
    const targetWorkspaceIds = resolveSolutionWorkspaceIds(workspaces, currentWorkspaceId);
    const uploadedImportDirs = new Set<string>();

    for (const workspaceId of targetWorkspaceIds) {
      const config = await readWorkspaceConfig(workspaceId);
      const fromSummary = resolveUploadedSolutionDir(config?.filemaker?.summaryPath);
      const fromDdr = resolveUploadedSolutionDir(config?.filemaker?.ddrPath);
      if (fromSummary) {
        uploadedImportDirs.add(fromSummary);
      }
      if (fromDdr) {
        uploadedImportDirs.add(fromDdr);
      }
    }

    for (const workspaceId of targetWorkspaceIds) {
      await deleteWorkspaceStorage(workspaceId);
    }
    for (const dir of uploadedImportDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }

    return NextResponse.json({
      ok: true,
      workspaceId: currentWorkspaceId,
      deletedWorkspaceIds: targetWorkspaceIds,
      deletedUploadedSolutionDirs: [...uploadedImportDirs],
      nextWorkspaceId: DEFAULT_WORKSPACE_ID,
      note: "Imported workspace metadata and generated layout data were deleted. Uploaded DDR/XML copies stored in FM Web IDE were removed. Original source files outside FM Web IDE were not deleted."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete solution"
      },
      { status: 500 }
    );
  }
}
