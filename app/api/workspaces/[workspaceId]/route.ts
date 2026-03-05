import { NextResponse } from "next/server";
import {
  ensureWorkspaceStorage,
  normalizeWorkspaceId,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/src/server/workspace-context";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const workspaceId = normalizeWorkspaceId(params.workspaceId);
    await ensureWorkspaceStorage(workspaceId);
    const config = await readWorkspaceConfig(workspaceId);
    const filemaker = config?.filemaker;

    return NextResponse.json({
      workspace: {
        id: workspaceId,
        name: config?.name || workspaceId,
        filemaker: {
          host: filemaker?.host || "",
          database: filemaker?.database || "",
          username: filemaker?.username || "",
          hasPassword: Boolean(filemaker?.password),
          ddrPath: filemaker?.ddrPath || "",
          summaryPath: filemaker?.summaryPath || "",
          sourceFileName: filemaker?.sourceFileName || "",
          solutionName: filemaker?.solutionName || "",
          dependsOn: filemaker?.dependsOn ?? [],
          externalDataSources: filemaker?.externalDataSources ?? []
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load workspace settings"
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const workspaceId = normalizeWorkspaceId(params.workspaceId);
    await ensureWorkspaceStorage(workspaceId);
    const existing = await readWorkspaceConfig(workspaceId);

    const payload = (await request.json()) as {
      name?: string;
      filemaker?: {
        host?: string;
        database?: string;
        username?: string;
        password?: string;
        clearPassword?: boolean;
      };
    };

    const existingFilemaker = existing?.filemaker ?? {};
    const nextHost = (payload.filemaker?.host ?? existingFilemaker.host ?? "").trim();
    const nextDatabase = (payload.filemaker?.database ?? existingFilemaker.database ?? "").trim();
    const nextUsername = (payload.filemaker?.username ?? existingFilemaker.username ?? "").trim();
    const nextPasswordRaw = String(payload.filemaker?.password ?? "").trim();
    const clearPassword = payload.filemaker?.clearPassword === true;
    const nextPassword = clearPassword
      ? ""
      : nextPasswordRaw || String(existingFilemaker.password ?? "").trim();

    const saved = await writeWorkspaceConfig(workspaceId, {
      name: (payload.name ?? existing?.name ?? workspaceId).trim() || workspaceId,
      filemaker: {
        host: nextHost || undefined,
        database: nextDatabase || undefined,
        username: nextUsername || undefined,
        password: nextPassword || undefined,
        ddrPath: existingFilemaker.ddrPath || undefined,
        summaryPath: existingFilemaker.summaryPath || undefined,
        sourceFileName: existingFilemaker.sourceFileName || undefined,
        solutionName: existingFilemaker.solutionName || undefined,
        dependsOn: existingFilemaker.dependsOn ?? undefined,
        externalDataSources: existingFilemaker.externalDataSources ?? undefined
      }
    });

    return NextResponse.json({
      workspace: {
        id: saved.id,
        name: saved.name || saved.id,
        filemaker: {
          host: saved.filemaker?.host || "",
          database: saved.filemaker?.database || "",
          username: saved.filemaker?.username || "",
          hasPassword: Boolean(saved.filemaker?.password),
          ddrPath: saved.filemaker?.ddrPath || "",
          summaryPath: saved.filemaker?.summaryPath || "",
          sourceFileName: saved.filemaker?.sourceFileName || "",
          solutionName: saved.filemaker?.solutionName || "",
          dependsOn: saved.filemaker?.dependsOn ?? [],
          externalDataSources: saved.filemaker?.externalDataSources ?? []
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save workspace settings"
      },
      { status: 500 }
    );
  }
}
