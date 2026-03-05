import { NextResponse } from "next/server";
import {
  ensureWorkspaceStorage,
  listWorkspaceIds,
  normalizeWorkspaceId,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/src/server/workspace-context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ids = await listWorkspaceIds();
    const workspaces = await Promise.all(
      ids.map(async (id) => {
        const config = await readWorkspaceConfig(id);
        const filemaker = config?.filemaker;
        return {
          id,
          name: config?.name || id,
          filemaker: {
            host: filemaker?.host || null,
            database: filemaker?.database || null,
            username: filemaker?.username || null,
            hasPassword: Boolean(filemaker?.password),
            ddrPath: filemaker?.ddrPath || null,
            summaryPath: filemaker?.summaryPath || null,
            sourceFileName: filemaker?.sourceFileName || null,
            solutionName: filemaker?.solutionName || null,
            dependsOn: filemaker?.dependsOn ?? [],
            externalDataSources: filemaker?.externalDataSources ?? []
          }
        };
      })
    );

    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list workspaces"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      workspaceId?: string;
      name?: string;
      filemaker?: {
        host?: string;
        database?: string;
        username?: string;
        password?: string;
        ddrPath?: string;
        summaryPath?: string;
        sourceFileName?: string;
        solutionName?: string;
        dependsOn?: string[];
        externalDataSources?: string[];
      };
    };

    const derivedIdToken = (payload.workspaceId ?? payload.name ?? "").trim() || `workspace-${Date.now()}`;
    const workspaceId = normalizeWorkspaceId(derivedIdToken);
    await ensureWorkspaceStorage(workspaceId);

    const saved = await writeWorkspaceConfig(workspaceId, {
      name: payload.name?.trim() || workspaceId,
      filemaker: payload.filemaker
    });

    return NextResponse.json({ workspace: saved }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create workspace"
      },
      { status: 500 }
    );
  }
}
