import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultLayout } from "@/src/lib/layout-utils";
import type { LayoutDefinition } from "@/src/lib/layout-model";
import {
  ensureWorkspaceStorage,
  normalizeWorkspaceId,
  readWorkspaceConfigSync,
  workspaceLayoutMapPath,
  workspaceLayoutsDirPath
} from "@/src/server/workspace-context";

type LayoutFileMakerIndex = {
  version: 1;
  byFileMakerLayoutKey: Record<string, string>;
};

type LayoutStoragePaths = {
  workspaceId: string;
  layoutsDir: string;
  layoutIndexPath: string;
};

function resolveLayoutStoragePaths(workspaceId?: string): LayoutStoragePaths {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return {
    workspaceId: normalizedWorkspaceId,
    layoutsDir: workspaceLayoutsDirPath(normalizedWorkspaceId),
    layoutIndexPath: workspaceLayoutMapPath(normalizedWorkspaceId)
  };
}

function layoutPath(paths: LayoutStoragePaths, id: string): string {
  return path.join(paths.layoutsDir, `${id}.json`);
}

async function tryLoadLayoutByExactId(id: string, workspaceId?: string): Promise<LayoutDefinition | null> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureLayoutDir(paths.workspaceId);
  try {
    const raw = await fs.readFile(layoutPath(paths, id), "utf8");
    return JSON.parse(raw) as LayoutDefinition;
  } catch {
    return null;
  }
}

function normalizeFileMakerLayoutName(fileMakerLayoutName: string): string {
  const trimmed = fileMakerLayoutName.trim();
  if (!trimmed) {
    throw new Error("FileMaker layout name is required");
  }
  return trimmed;
}

function fileMakerDatabaseScope(workspaceId?: string): string {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const fromWorkspace = readWorkspaceConfigSync(normalizedWorkspaceId)?.filemaker?.database?.trim();
  if (fromWorkspace) {
    return fromWorkspace;
  }
  const fromEnv = process.env.FILEMAKER_DATABASE?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return normalizedWorkspaceId;
}

function fileMakerLayoutKey(fileMakerLayoutName: string, workspaceId?: string): string {
  return `${fileMakerDatabaseScope(workspaceId)}::${fileMakerLayoutName}`;
}

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "layout";
}

function baseLayoutIdForFileMakerLayout(fileMakerLayoutName: string, key: string): string {
  const slug = toSlug(fileMakerLayoutName).slice(0, 48);
  const hash = Buffer.from(key).toString("base64url").slice(0, 8);
  return `fm-${slug}-${hash}`;
}

function isLegacySeededTemplate(layout: LayoutDefinition): boolean {
  if (layout.components.length !== 5) {
    return false;
  }

  const label = layout.components.find(
    (component) => component.type === "label" && component.props.label === "Customer Profile"
  );
  const firstNameField = layout.components.find(
    (component) =>
      component.type === "field" &&
      component.binding?.field === "FirstName" &&
      component.props.placeholder === "First Name"
  );
  const emailField = layout.components.find(
    (component) =>
      component.type === "field" &&
      component.binding?.field === "Email" &&
      component.props.placeholder === "Email"
  );
  const refreshButton = layout.components.find(
    (component) =>
      component.type === "button" &&
      component.props.label === "Refresh Score" &&
      component.events?.onClick?.script === "RefreshCustomerScore"
  );
  const webViewer = layout.components.find(
    (component) =>
      component.type === "webViewer" &&
      component.props.webViewerUrlTemplate === "https://example.com/profile/{{recordId}}"
  );

  return Boolean(label && firstNameField && emailField && refreshButton && webViewer);
}

function isBlankStarterLayout(layout: LayoutDefinition): boolean {
  return (
    layout.name === "Untitled Layout" &&
    layout.defaultTableOccurrence === "Customers" &&
    Array.isArray(layout.components) &&
    layout.components.length === 0
  );
}

async function clearLegacySeedIfNeeded(
  layout: LayoutDefinition,
  workspaceId?: string
): Promise<LayoutDefinition> {
  if (!isLegacySeededTemplate(layout)) {
    return layout;
  }

  return saveLayout(
    layout.id,
    {
      ...layout,
      components: []
    },
    workspaceId
  );
}

export async function ensureLayoutDir(workspaceId?: string): Promise<void> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureWorkspaceStorage(paths.workspaceId);
  await fs.mkdir(paths.layoutsDir, { recursive: true });
}

async function loadLayoutIndex(workspaceId?: string): Promise<LayoutFileMakerIndex> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureWorkspaceStorage(paths.workspaceId);

  try {
    const raw = await fs.readFile(paths.layoutIndexPath, "utf8");
    const payload = JSON.parse(raw) as Partial<LayoutFileMakerIndex>;
    if (payload && payload.version === 1 && payload.byFileMakerLayoutKey) {
      return {
        version: 1,
        byFileMakerLayoutKey: payload.byFileMakerLayoutKey
      };
    }
  } catch {
    // Ignore read/parse errors and initialize a new index.
  }

  return {
    version: 1,
    byFileMakerLayoutKey: {}
  };
}

async function saveLayoutIndex(index: LayoutFileMakerIndex, workspaceId?: string): Promise<void> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureWorkspaceStorage(paths.workspaceId);
  await fs.writeFile(paths.layoutIndexPath, JSON.stringify(index, null, 2), "utf8");
}

export async function listLayouts(workspaceId?: string): Promise<LayoutDefinition[]> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureLayoutDir(paths.workspaceId);
  const files = await fs.readdir(paths.layoutsDir);
  const jsonFiles = files.filter((entry) => entry.endsWith(".json"));

  const layouts = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const filePath = path.join(paths.layoutsDir, fileName);
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as LayoutDefinition;
    })
  );

  return layouts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadLayout(id: string, workspaceId?: string): Promise<LayoutDefinition> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureLayoutDir(paths.workspaceId);
  const filePath = layoutPath(paths, id);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as LayoutDefinition;

    if (id === "default" && isBlankStarterLayout(parsed)) {
      const customerFormPath = layoutPath(paths, "customer-form");
      try {
        const customerRaw = await fs.readFile(customerFormPath, "utf8");
        const customerLayout = JSON.parse(customerRaw) as LayoutDefinition;
        if (!isBlankStarterLayout(customerLayout)) {
          const migrated = {
            ...customerLayout,
            id: "default"
          } satisfies LayoutDefinition;
          await saveLayout("default", migrated, paths.workspaceId);
          return migrated;
        }
      } catch {
        // Ignore migration fallback errors and continue with parsed default layout.
      }
    }

    return parsed;
  } catch {
    const initial = defaultLayout(id);
    await saveLayout(id, initial, paths.workspaceId);
    return initial;
  }
}

export async function saveLayout(
  id: string,
  layout: LayoutDefinition,
  workspaceId?: string
): Promise<LayoutDefinition> {
  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureLayoutDir(paths.workspaceId);
  const payload = {
    ...layout,
    id
  } satisfies LayoutDefinition;

  await fs.writeFile(layoutPath(paths, id), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function resolveLayoutIdByRouteToken(
  routeToken: string,
  workspaceId?: string
): Promise<string | null> {
  const normalizedToken = routeToken.trim();
  if (!normalizedToken) {
    return "default";
  }

  const byId = await tryLoadLayoutByExactId(normalizedToken, workspaceId);
  if (byId) {
    return byId.id;
  }

  const key = fileMakerLayoutKey(normalizedToken, workspaceId);
  const index = await loadLayoutIndex(workspaceId);
  const mappedId = index.byFileMakerLayoutKey[key];
  if (mappedId) {
    const mappedLayout = await tryLoadLayoutByExactId(mappedId, workspaceId);
    if (mappedLayout) {
      return mappedLayout.id;
    }
  }

  const existingLayouts = await listLayouts(workspaceId);
  const normalizedLower = normalizedToken.toLowerCase();
  const existingMatch = existingLayouts.find((candidate) => {
    const candidateName = candidate.name?.trim().toLowerCase() ?? "";
    const candidateTable = candidate.defaultTableOccurrence?.trim().toLowerCase() ?? "";
    return candidateName === normalizedLower || candidateTable === normalizedLower;
  });
  if (existingMatch) {
    return existingMatch.id;
  }

  return null;
}

export async function deleteLayoutById(id: string, workspaceId?: string): Promise<boolean> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return false;
  }

  const paths = resolveLayoutStoragePaths(workspaceId);
  await ensureLayoutDir(paths.workspaceId);
  const filePath = layoutPath(paths, normalizedId);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }
    throw error;
  }

  const index = await loadLayoutIndex(paths.workspaceId);
  let changed = false;
  for (const [key, mappedId] of Object.entries(index.byFileMakerLayoutKey)) {
    if (mappedId === normalizedId) {
      delete index.byFileMakerLayoutKey[key];
      changed = true;
    }
  }
  if (changed) {
    await saveLayoutIndex(index, paths.workspaceId);
  }

  return true;
}

export async function mapFileMakerLayoutToLayoutId(
  fileMakerLayoutName: string,
  id: string,
  workspaceId?: string
): Promise<void> {
  const normalizedName = normalizeFileMakerLayoutName(fileMakerLayoutName);
  const key = fileMakerLayoutKey(normalizedName, workspaceId);
  const index = await loadLayoutIndex(workspaceId);

  if (index.byFileMakerLayoutKey[key] === id) {
    return;
  }

  index.byFileMakerLayoutKey[key] = id;
  await saveLayoutIndex(index, workspaceId);
}

export async function loadLayoutByFileMakerLayout(
  fileMakerLayoutName: string,
  workspaceId?: string
): Promise<LayoutDefinition> {
  const normalizedName = normalizeFileMakerLayoutName(fileMakerLayoutName);
  const key = fileMakerLayoutKey(normalizedName, workspaceId);
  const index = await loadLayoutIndex(workspaceId);
  const mappedId = index.byFileMakerLayoutKey[key];

  if (mappedId) {
    const loaded = await loadLayout(mappedId, workspaceId);
    return clearLegacySeedIfNeeded(loaded, workspaceId);
  }

  // Migration path for existing data created before index mapping existed.
  const existingLayouts = await listLayouts(workspaceId);
  const normalizedLower = normalizedName.toLowerCase();
  const existingMatch = existingLayouts.find((candidate) => {
    const candidateName = candidate.name?.trim().toLowerCase() ?? "";
    const candidateTable = candidate.defaultTableOccurrence?.trim().toLowerCase() ?? "";
    return candidateName === normalizedLower || candidateTable === normalizedLower;
  });
  if (existingMatch) {
    index.byFileMakerLayoutKey[key] = existingMatch.id;
    await saveLayoutIndex(index, workspaceId);
    return clearLegacySeedIfNeeded(existingMatch, workspaceId);
  }

  let id = baseLayoutIdForFileMakerLayout(normalizedName, key);
  let suffix = 2;
  const paths = resolveLayoutStoragePaths(workspaceId);
  while (true) {
    try {
      await fs.access(layoutPath(paths, id));
      id = `${baseLayoutIdForFileMakerLayout(normalizedName, key)}-${suffix}`;
      suffix += 1;
    } catch {
      break;
    }
  }

  const initial = defaultLayout(id);
  initial.name = normalizedName;
  initial.defaultTableOccurrence = normalizedName;
  const created = await saveLayout(id, initial, workspaceId);

  index.byFileMakerLayoutKey[key] = created.id;
  await saveLayoutIndex(index, workspaceId);
  return created;
}

export async function loadLayoutByRouteToken(
  routeToken: string,
  workspaceId?: string
): Promise<LayoutDefinition> {
  const normalizedToken = routeToken.trim();
  if (!normalizedToken) {
    return loadLayout("default", workspaceId);
  }

  const byId = await tryLoadLayoutByExactId(normalizedToken, workspaceId);
  if (byId) {
    return clearLegacySeedIfNeeded(byId, workspaceId);
  }

  return loadLayoutByFileMakerLayout(normalizedToken, workspaceId);
}

