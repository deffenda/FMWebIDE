import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_WORKSPACE_ID = "default";

export type WorkspaceFileMakerConfig = {
  host?: string;
  database?: string;
  username?: string;
  password?: string;
  ddrPath?: string;
  summaryPath?: string;
  sourceFileName?: string;
  solutionName?: string;
  dependsOn?: string[];
  externalDataSources?: string[];
};

export type WorkspaceConfig = {
  version: 1;
  id: string;
  name?: string;
  filemaker?: WorkspaceFileMakerConfig;
};

const dataDir = path.join(process.cwd(), "data");
const workspacesDir = path.join(dataDir, "workspaces");

function cleanWorkspaceId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeWorkspaceId(value?: string | null): string {
  const cleaned = cleanWorkspaceId(String(value ?? ""));
  return cleaned || DEFAULT_WORKSPACE_ID;
}

export function workspaceIdFromUrl(url: URL): string {
  return normalizeWorkspaceId(url.searchParams.get("workspace"));
}

export function workspaceIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return DEFAULT_WORKSPACE_ID;
  }
  const raw = (payload as { workspaceId?: unknown }).workspaceId;
  if (typeof raw !== "string") {
    return DEFAULT_WORKSPACE_ID;
  }
  return normalizeWorkspaceId(raw);
}

export function workspaceIdFromFormData(formData: FormData): string {
  const token = formData.get("workspaceId");
  return typeof token === "string" ? normalizeWorkspaceId(token) : DEFAULT_WORKSPACE_ID;
}

export function workspaceRootPath(workspaceId?: string): string {
  return path.join(workspacesDir, normalizeWorkspaceId(workspaceId));
}

export function workspaceConfigPath(workspaceId?: string): string {
  return path.join(workspaceRootPath(workspaceId), "workspace.json");
}

export function workspaceLayoutsDirPath(workspaceId?: string): string {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (normalized === DEFAULT_WORKSPACE_ID) {
    return path.join(dataDir, "layouts");
  }
  return path.join(workspaceRootPath(normalized), "layouts");
}

export function workspaceLayoutMapPath(workspaceId?: string): string {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (normalized === DEFAULT_WORKSPACE_ID) {
    return path.join(dataDir, "layout-fm-map.json");
  }
  return path.join(workspaceRootPath(normalized), "layout-fm-map.json");
}

export function workspaceMockRecordsDirPath(workspaceId?: string): string {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (normalized === DEFAULT_WORKSPACE_ID) {
    return path.join(dataDir, "mock-records");
  }
  return path.join(workspaceRootPath(normalized), "mock-records");
}

export async function ensureWorkspaceStorage(workspaceId?: string): Promise<string> {
  const normalized = normalizeWorkspaceId(workspaceId);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(workspacesDir, { recursive: true });
  await fs.mkdir(workspaceRootPath(normalized), { recursive: true });
  await fs.mkdir(workspaceLayoutsDirPath(normalized), { recursive: true });
  await fs.mkdir(workspaceMockRecordsDirPath(normalized), { recursive: true });
  return normalized;
}

function parseWorkspaceConfig(raw: string): WorkspaceConfig | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceConfig>;
    if (!parsed || parsed.version !== 1 || typeof parsed.id !== "string") {
      return null;
    }
    const id = normalizeWorkspaceId(parsed.id);
    const filemaker =
      parsed.filemaker && typeof parsed.filemaker === "object"
        ? {
            host: typeof parsed.filemaker.host === "string" ? parsed.filemaker.host.trim() : undefined,
            database:
              typeof parsed.filemaker.database === "string" ? parsed.filemaker.database.trim() : undefined,
            username:
              typeof parsed.filemaker.username === "string" ? parsed.filemaker.username.trim() : undefined,
            password:
              typeof parsed.filemaker.password === "string" ? parsed.filemaker.password.trim() : undefined,
            ddrPath: typeof parsed.filemaker.ddrPath === "string" ? parsed.filemaker.ddrPath.trim() : undefined,
            summaryPath:
              typeof parsed.filemaker.summaryPath === "string"
                ? parsed.filemaker.summaryPath.trim()
                : undefined,
            sourceFileName:
              typeof parsed.filemaker.sourceFileName === "string"
                ? parsed.filemaker.sourceFileName.trim()
                : undefined,
            solutionName:
              typeof parsed.filemaker.solutionName === "string"
                ? parsed.filemaker.solutionName.trim()
                : undefined,
            dependsOn: Array.isArray(parsed.filemaker.dependsOn)
              ? parsed.filemaker.dependsOn
                  .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                  .filter((entry) => entry.length > 0)
              : undefined,
            externalDataSources: Array.isArray(parsed.filemaker.externalDataSources)
              ? parsed.filemaker.externalDataSources
                  .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                  .filter((entry) => entry.length > 0)
              : undefined
          }
        : undefined;
    return {
      version: 1,
      id,
      name: typeof parsed.name === "string" ? parsed.name.trim() : undefined,
      filemaker
    };
  } catch {
    return null;
  }
}

export async function readWorkspaceConfig(workspaceId?: string): Promise<WorkspaceConfig | null> {
  const normalized = normalizeWorkspaceId(workspaceId);
  const filePath = workspaceConfigPath(normalized);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseWorkspaceConfig(raw);
  } catch {
    return null;
  }
}

export function readWorkspaceConfigSync(workspaceId?: string): WorkspaceConfig | null {
  const normalized = normalizeWorkspaceId(workspaceId);
  const filePath = workspaceConfigPath(normalized);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return parseWorkspaceConfig(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export async function writeWorkspaceConfig(
  workspaceId: string,
  config: Omit<WorkspaceConfig, "version" | "id"> & { id?: string }
): Promise<WorkspaceConfig> {
  const normalized = normalizeWorkspaceId(workspaceId);
  await ensureWorkspaceStorage(normalized);

  const payload: WorkspaceConfig = {
    version: 1,
    id: normalized,
    name: config.name?.trim() || normalized,
    filemaker: {
      host: config.filemaker?.host?.trim() || undefined,
      database: config.filemaker?.database?.trim() || undefined,
      username: config.filemaker?.username?.trim() || undefined,
      password: config.filemaker?.password?.trim() || undefined,
      ddrPath: config.filemaker?.ddrPath?.trim() || undefined,
      summaryPath: config.filemaker?.summaryPath?.trim() || undefined,
      sourceFileName: config.filemaker?.sourceFileName?.trim() || undefined,
      solutionName: config.filemaker?.solutionName?.trim() || undefined,
      dependsOn:
        config.filemaker?.dependsOn
          ?.map((entry) => entry.trim())
          .filter((entry) => entry.length > 0) || undefined,
      externalDataSources:
        config.filemaker?.externalDataSources
          ?.map((entry) => entry.trim())
          .filter((entry) => entry.length > 0) || undefined
    }
  };

  await fs.writeFile(workspaceConfigPath(normalized), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function listWorkspaceIds(): Promise<string[]> {
  await fs.mkdir(workspacesDir, { recursive: true });
  const ids = new Set<string>([DEFAULT_WORKSPACE_ID]);
  const entries = await fs.readdir(workspacesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    ids.add(normalizeWorkspaceId(entry.name));
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export async function deleteWorkspaceStorage(workspaceId?: string): Promise<string> {
  const normalized = normalizeWorkspaceId(workspaceId);

  if (normalized === DEFAULT_WORKSPACE_ID) {
    await fs.rm(workspaceRootPath(normalized), { recursive: true, force: true });
    await fs.rm(workspaceLayoutsDirPath(normalized), { recursive: true, force: true });
    await fs.rm(workspaceMockRecordsDirPath(normalized), { recursive: true, force: true });
    await fs.rm(workspaceLayoutMapPath(normalized), { force: true });

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(workspacesDir, { recursive: true });
    await fs.mkdir(workspaceRootPath(normalized), { recursive: true });
    await fs.mkdir(workspaceLayoutsDirPath(normalized), { recursive: true });
    await fs.mkdir(workspaceMockRecordsDirPath(normalized), { recursive: true });
    await fs.writeFile(path.join(workspaceLayoutsDirPath(normalized), ".gitkeep"), "", "utf8");
    return normalized;
  }

  await fs.rm(workspaceRootPath(normalized), { recursive: true, force: true });
  return normalized;
}
