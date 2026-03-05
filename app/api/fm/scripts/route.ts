import { NextResponse } from "next/server";
import { getAvailableScripts, isUsingMockData, runScript } from "@/src/server/filemaker-client";
import { workspaceIdFromPayload, workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceIdFromUrl(new URL(request.url));
    const payload = await getAvailableScripts({ workspaceId });
    return NextResponse.json({
      workspaceId,
      source: payload.source,
      scripts: payload.scripts
    });
  } catch (error) {
    const workspaceId = workspaceIdFromUrl(new URL(request.url));
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load scripts",
        workspaceId,
        source: isUsingMockData({ workspaceId }) ? "mock" : "filemaker"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      tableOccurrence?: string;
      script?: string;
      parameter?: string;
      workspaceId?: string;
    };
    const workspaceId = workspaceIdFromPayload(payload);

    if (!payload.script) {
      return NextResponse.json({ error: "script is required" }, { status: 400 });
    }

    const result = await runScript(payload.tableOccurrence ?? "Customers", payload.script, payload.parameter, {
      workspaceId
    });
    return NextResponse.json({ workspaceId, result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute script"
      },
      { status: 500 }
    );
  }
}
