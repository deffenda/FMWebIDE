import { NextResponse } from "next/server";
import { getStyleCatalog, isUsingMockData } from "@/src/server/filemaker-client";
import { workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

function getLayoutName(url: URL): string {
  return url.searchParams.get("layout") ?? "Customers";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = workspaceIdFromUrl(url);
  try {
    const layout = getLayoutName(url);
    const payload = await getStyleCatalog(layout, { workspaceId });

    return NextResponse.json({
      workspaceId,
      source: payload.source,
      themes: payload.themes,
      styles: payload.styles,
      stylesByTheme: payload.stylesByTheme,
      styleTargetsByTheme: payload.styleTargetsByTheme,
      activeTheme: payload.activeTheme
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load styles/themes",
        workspaceId,
        source: isUsingMockData({ workspaceId }) ? "mock" : "filemaker"
      },
      { status: 500 }
    );
  }
}
