import { NextResponse } from "next/server";
import { loadLayoutByFileMakerLayout } from "@/src/server/layout-storage";
import { workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name")?.trim() ?? "";
    const workspaceId = workspaceIdFromUrl(url);

    if (!name) {
      return NextResponse.json({ error: "name query parameter is required" }, { status: 400 });
    }

    const layout = await loadLayoutByFileMakerLayout(name, workspaceId);
    return NextResponse.json({ workspaceId, layout });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load layout for FileMaker layout"
      },
      { status: 500 }
    );
  }
}
