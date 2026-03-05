import { NextResponse } from "next/server";
import { getValueLists, isUsingMockData } from "@/src/server/filemaker-client";
import { workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

function getTableOccurrence(url: URL): string | undefined {
  const value = url.searchParams.get("tableOccurrence");
  return value ? value.trim() : undefined;
}

function getScope(url: URL): "database" | "layout" {
  const raw = (url.searchParams.get("scope") ?? "").trim().toLowerCase();
  return raw === "layout" ? "layout" : "database";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = workspaceIdFromUrl(url);
  try {
    const scope = getScope(url);
    const tableOccurrence = getTableOccurrence(url);
    const payload = await getValueLists({
      scope,
      tableOccurrence,
      workspaceId
    });

    return NextResponse.json({
      workspaceId,
      scope,
      tableOccurrence,
      source: payload.source,
      valueLists: payload.valueLists
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load value lists",
        workspaceId,
        source: isUsingMockData({ workspaceId }) ? "mock" : "filemaker"
      },
      { status: 500 }
    );
  }
}
