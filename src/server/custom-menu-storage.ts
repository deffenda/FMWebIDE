import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureWorkspaceStorage, normalizeWorkspaceId, workspaceRootPath } from "@/src/server/workspace-context";

export type CustomMenuKey =
  | "filemaker"
  | "file"
  | "edit"
  | "view"
  | "insert"
  | "format"
  | "layouts"
  | "arrange"
  | "scripts"
  | "tools"
  | "window"
  | "help";

export type CustomMenuDefinition = {
  id: string;
  name: string;
  displayTitle?: string;
  menuKey: CustomMenuKey;
  comment?: string;
  creationOrder?: number;
  locked?: boolean;
};

export type CustomMenuSetDefinition = {
  id: string;
  name: string;
  menuIds: string[];
  comment?: string;
  creationOrder?: number;
  locked?: boolean;
};

export type CustomMenuConfig = {
  customMenus: CustomMenuDefinition[];
  menuSets: CustomMenuSetDefinition[];
  defaultMenuSetId: string;
};

const customMenuKeyOptions: Array<{ key: CustomMenuKey; label: string }> = [
  { key: "filemaker", label: "FileMaker Pro" },
  { key: "file", label: "File" },
  { key: "edit", label: "Edit" },
  { key: "view", label: "View" },
  { key: "insert", label: "Insert" },
  { key: "format", label: "Format" },
  { key: "layouts", label: "Layouts" },
  { key: "arrange", label: "Arrange" },
  { key: "scripts", label: "Scripts" },
  { key: "tools", label: "Tools" },
  { key: "window", label: "Window" },
  { key: "help", label: "Help" }
];

function customMenusPath(workspaceId?: string): string {
  return path.join(workspaceRootPath(workspaceId), "custom-menus.json");
}

function buildDefaultCustomMenuConfig(): CustomMenuConfig {
  const customMenus: CustomMenuDefinition[] = customMenuKeyOptions.map((entry, index) => ({
    id: `menu-${entry.key}`,
    name: entry.label,
    displayTitle: entry.label,
    menuKey: entry.key,
    creationOrder: index + 1,
    locked: true
  }));
  const standardMenuSet: CustomMenuSetDefinition = {
    id: "standard-filemaker-menus",
    name: "[Standard FileMaker Menus]",
    menuIds: customMenus.map((entry) => entry.id),
    creationOrder: 1,
    locked: true
  };
  const minimalMenuSet: CustomMenuSetDefinition = {
    id: "minimal",
    name: "Minimal",
    menuIds: customMenus
      .filter((entry) =>
        new Set<CustomMenuKey>(["filemaker", "file", "edit", "format", "scripts", "window", "help"]).has(
          entry.menuKey
        )
      )
      .map((entry) => entry.id),
    creationOrder: 2
  };
  return {
    customMenus,
    menuSets: [standardMenuSet, minimalMenuSet],
    defaultMenuSetId: standardMenuSet.id
  };
}

function normalizeCustomMenuConfig(raw: Partial<CustomMenuConfig> | null | undefined): CustomMenuConfig {
  const fallback = buildDefaultCustomMenuConfig();
  const keySet = new Set(customMenuKeyOptions.map((entry) => entry.key));
  const customMenus = Array.isArray(raw?.customMenus)
    ? raw.customMenus
        .map((entry, index) => {
          const id = String(entry?.id ?? "").trim() || `menu-${index + 1}`;
          const keyCandidate = String(entry?.menuKey ?? "").trim() as CustomMenuKey;
          const menuKey = keySet.has(keyCandidate) ? keyCandidate : customMenuKeyOptions[0].key;
          const fallbackLabel =
            customMenuKeyOptions.find((option) => option.key === menuKey)?.label ?? "Menu";
          const normalizedName = String(entry?.name ?? "").trim() || `Menu ${index + 1}`;
          return {
            id,
            name: normalizedName,
            displayTitle: String(entry?.displayTitle ?? "").trim() || normalizedName || fallbackLabel,
            menuKey,
            comment: String(entry?.comment ?? "").trim() || undefined,
            creationOrder:
              typeof entry?.creationOrder === "number" && Number.isFinite(entry.creationOrder)
                ? Math.max(1, Math.round(entry.creationOrder))
                : index + 1,
            locked: Boolean(entry?.locked)
          } satisfies CustomMenuDefinition;
        })
        .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
    : [];

  const normalizedMenus = customMenus.length > 0 ? customMenus : fallback.customMenus;
  const menuIdSet = new Set(normalizedMenus.map((entry) => entry.id));

  const menuSets = Array.isArray(raw?.menuSets)
    ? raw.menuSets
        .map((entry, index) => {
          const id = String(entry?.id ?? "").trim() || `menu-set-${index + 1}`;
          const menuIds = Array.isArray(entry?.menuIds)
            ? [...new Set(entry.menuIds.map((menuId) => String(menuId ?? "").trim()).filter((menuId) => menuIdSet.has(menuId)))]
            : [];
          return {
            id,
            name: String(entry?.name ?? "").trim() || `Menu Set ${index + 1}`,
            menuIds: menuIds.length > 0 ? menuIds : normalizedMenus.map((menu) => menu.id),
            comment: String(entry?.comment ?? "").trim() || undefined,
            creationOrder:
              typeof entry?.creationOrder === "number" && Number.isFinite(entry.creationOrder)
                ? Math.max(1, Math.round(entry.creationOrder))
                : index + 1,
            locked: Boolean(entry?.locked)
          } satisfies CustomMenuSetDefinition;
        })
        .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
    : [];

  const normalizedMenuSets = menuSets.length > 0 ? menuSets : fallback.menuSets;
  const defaultMenuSetId =
    normalizedMenuSets.find((entry) => entry.id === raw?.defaultMenuSetId)?.id ??
    normalizedMenuSets[0]?.id ??
    fallback.defaultMenuSetId;

  return {
    customMenus: normalizedMenus,
    menuSets: normalizedMenuSets,
    defaultMenuSetId
  };
}

export async function readCustomMenuConfig(workspaceId?: string): Promise<CustomMenuConfig> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  await ensureWorkspaceStorage(normalizedWorkspaceId);
  const filePath = customMenusPath(normalizedWorkspaceId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CustomMenuConfig>;
    return normalizeCustomMenuConfig(parsed);
  } catch {
    const defaults = buildDefaultCustomMenuConfig();
    await fs.writeFile(filePath, JSON.stringify(defaults, null, 2), "utf8");
    return defaults;
  }
}

export async function writeCustomMenuConfig(
  workspaceId: string,
  config: Partial<CustomMenuConfig>
): Promise<CustomMenuConfig> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  await ensureWorkspaceStorage(normalizedWorkspaceId);
  const normalized = normalizeCustomMenuConfig(config);
  await fs.writeFile(customMenusPath(normalizedWorkspaceId), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
