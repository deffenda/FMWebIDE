export type BrowseViewMode = "form" | "list" | "table";
export type BrowseLaunchMode = "browse" | "find" | "preview";

export function parseBrowseViewModeToken(raw: string | null | undefined): BrowseViewMode | null {
  const token = String(raw ?? "").trim().toLowerCase();
  if (token === "form" || token === "list" || token === "table") {
    return token;
  }
  return null;
}

export function parseBrowseLaunchModeToken(raw: string | null | undefined): BrowseLaunchMode | null {
  const token = String(raw ?? "").trim().toLowerCase();
  if (token === "browse" || token === "find" || token === "preview") {
    return token;
  }
  return null;
}

function normalizeLayoutRouteName(layoutRouteName: string): string {
  const trimmed = layoutRouteName.trim();
  return trimmed || "default";
}

export function buildBrowseRouteHref(
  layoutRouteName: string,
  currentQuery: string | URLSearchParams | { toString(): string },
  updates: {
    viewMode?: BrowseViewMode | null;
    launchMode?: BrowseLaunchMode | null;
  }
): string {
  const params = new URLSearchParams(
    typeof currentQuery === "string" ? currentQuery : currentQuery.toString()
  );

  if (updates.viewMode !== undefined) {
    if (!updates.viewMode || updates.viewMode === "form") {
      params.delete("view");
    } else {
      params.set("view", updates.viewMode);
    }
  }

  if (updates.launchMode !== undefined) {
    if (!updates.launchMode || updates.launchMode === "browse") {
      params.delete("mode");
    } else {
      params.set("mode", updates.launchMode);
    }
  }

  const query = params.toString();
  const encodedLayoutRouteName = encodeURIComponent(normalizeLayoutRouteName(layoutRouteName));
  return `/layouts/${encodedLayoutRouteName}/browse${query ? `?${query}` : ""}`;
}

