import { NextResponse } from "next/server";
import { getDdrRelationshipGraph } from "@/src/server/ddr-relationship-graph";
import { readWorkspaceConfig, workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

const DEFAULT_DDR_PATH = "/Users/deffenda/Downloads/Assets.xml";

async function resolvePath(url: URL, workspaceId: string): Promise<string> {
  const fromQuery = (url.searchParams.get("ddrPath") ?? "").trim();
  if (fromQuery) {
    return fromQuery;
  }
  const workspaceConfig = await readWorkspaceConfig(workspaceId);
  const fromWorkspace = workspaceConfig?.filemaker?.ddrPath?.trim();
  if (fromWorkspace) {
    return fromWorkspace;
  }
  const fromEnv = (process.env.FILEMAKER_DDR_PATH ?? "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_DDR_PATH;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = workspaceIdFromUrl(url);
  const ddrPath = await resolvePath(url, workspaceId);

  try {
    const payload = await getDdrRelationshipGraph({ ddrPath });
    return NextResponse.json({
      ...payload,
      workspaceId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load DDR relationships";
    return NextResponse.json(
      {
        source: "mock",
        workspaceId,
        databaseName: process.env.FILEMAKER_DATABASE?.trim() || "FileMaker",
        ddrPath,
        baseTables: [],
        fieldsByBaseTableId: {},
        nodes: [],
        edges: [],
        error: message
      },
      { status: 500 }
    );
  }
}
