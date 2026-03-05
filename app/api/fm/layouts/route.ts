import { NextResponse } from "next/server";
import { getAvailableLayouts, isUsingMockData } from "@/src/server/filemaker-client";
import { workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceIdFromUrl(new URL(request.url));
    const payload = await getAvailableLayouts({ workspaceId });

    return NextResponse.json({
      workspaceId,
      source: payload.source,
      layouts: payload.layouts,
      layoutFolders: payload.layoutFolders
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load FileMaker layouts",
        source: isUsingMockData({ workspaceId: workspaceIdFromUrl(new URL(request.url)) }) ? "mock" : "filemaker"
      },
      { status: 500 }
    );
  }
}
