import { NextResponse } from "next/server";
import { getScriptWorkspacePayload } from "@/src/server/script-workspace";
import { workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const workspaceId = workspaceIdFromUrl(new URL(request.url));
  try {
    const payload = await getScriptWorkspacePayload({ workspaceId });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load script workspace",
        workspaceId
      },
      { status: 500 }
    );
  }
}
