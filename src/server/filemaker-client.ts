import { promises as fs } from "node:fs";
import path from "node:path";
import type { FMRecord } from "../lib/layout-model.ts";
import {
  createRecord as createMockRecord,
  deleteRecord as deleteMockRecord,
  loadRecords,
  updateRecord as updateMockRecord
} from "./mock-record-storage.ts";
import { readWorkspaceConfigSync } from "./workspace-context.ts";

type FileMakerEnv = {
  host?: string;
  database?: string;
  username?: string;
  password?: string;
};

type FileMakerContext = {
  workspaceId?: string;
};

type TokenState = {
  token: string;
  expiresAt: number;
};

const tokenCache: Record<string, TokenState> = {};
const DEFAULT_FILEMAKER_TIMEOUT_MS = 15_000;

function readEnv(context?: FileMakerContext): FileMakerEnv {
  const workspaceConfig = readWorkspaceConfigSync(context?.workspaceId);
  const fileMakerOverrides = workspaceConfig?.filemaker;
  return {
    host: fileMakerOverrides?.host || process.env.FILEMAKER_HOST,
    database: fileMakerOverrides?.database || process.env.FILEMAKER_DATABASE,
    username: fileMakerOverrides?.username || process.env.FILEMAKER_USERNAME,
    password: fileMakerOverrides?.password || process.env.FILEMAKER_PASSWORD
  };
}

function hasRealConfig(env: FileMakerEnv): env is Required<FileMakerEnv> {
  return Boolean(env.host && env.database && env.username && env.password);
}

function hostBase(host: string): string {
  return host.replace(/\/+$/, "");
}

function tokenCacheKey(env: Required<FileMakerEnv>): string {
  return `${env.host}:${env.database}:${env.username}`;
}

function fileMakerTimeoutMs(): number {
  const raw = Number.parseInt(String(process.env.FILEMAKER_REQUEST_TIMEOUT_MS ?? ""), 10);
  if (!Number.isFinite(raw)) {
    return DEFAULT_FILEMAKER_TIMEOUT_MS;
  }
  return Math.min(Math.max(raw, 1_000), 120_000);
}

function summarizeErrorBody(rawBody: string): string {
  const normalized = rawBody.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 320) {
    return normalized;
  }
  return `${normalized.slice(0, 320)}...`;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return summarizeErrorBody(text);
  } catch {
    return "";
  }
}

function errorCauseSummary(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error ?? "Unknown error");
  }

  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;

  while (current && depth < 6 && !seen.has(current)) {
    seen.add(current);
    depth += 1;

    if (current instanceof Error) {
      const errorWithCode = current as Error & { code?: unknown; errno?: unknown; syscall?: unknown; cause?: unknown };
      const extras = [errorWithCode.code, errorWithCode.errno, errorWithCode.syscall]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
      const message = current.message.trim() || current.name;
      const detail = extras.length > 0 ? `${message} [${extras.join(", ")}]` : message;
      if (!parts.includes(detail)) {
        parts.push(detail);
      }
      current = errorWithCode.cause;
      continue;
    }

    if (typeof current === "object" && current !== null) {
      const maybeCause = (current as { cause?: unknown }).cause;
      const detail = String(current);
      if (detail && !parts.includes(detail)) {
        parts.push(detail);
      }
      current = maybeCause;
      continue;
    }

    const detail = String(current);
    if (detail && !parts.includes(detail)) {
      parts.push(detail);
    }
    break;
  }

  return parts.join(" -> ");
}

function networkHint(summary: string, timeoutMs: number): string {
  const normalized = summary.toLowerCase();
  if (
    normalized.includes("self-signed") ||
    normalized.includes("unable to verify") ||
    normalized.includes("certificate")
  ) {
    return "TLS certificate trust failed (common with self-signed local LAN certs).";
  }
  if (normalized.includes("econnrefused")) {
    return "Connection refused. Verify FileMaker Server/Data API host and port are reachable.";
  }
  if (normalized.includes("enotfound") || normalized.includes("eai_again")) {
    return "Host name lookup failed. Verify FILEMAKER_HOST.";
  }
  if (
    normalized.includes("timed out") ||
    normalized.includes("etimedout") ||
    normalized.includes("aborterror")
  ) {
    return `Request timed out after ${timeoutMs}ms.`;
  }
  return "";
}

async function fmHttpFetch(url: string, init: RequestInit, context: string): Promise<Response> {
  const timeoutMs = fileMakerTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? controller.signal
    });
  } catch (fetchError) {
    const summary = errorCauseSummary(fetchError);
    const hint = networkHint(summary, timeoutMs);
    throw new Error(`${context} failed: ${summary}${hint ? ` | Hint: ${hint}` : ""}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fmFetch<T>(env: Required<FileMakerEnv>, endpoint: string, init: RequestInit): Promise<T> {
  const key = tokenCacheKey(env);
  const request = async () => {
    const token = await getToken(env);
    return fmHttpFetch(
      `${hostBase(env.host)}${endpoint}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {})
        }
      },
      "FileMaker Data API request"
    );
  };

  let response = await request();
  if (response.status === 401) {
    delete tokenCache[key];
    response = await request();
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `FileMaker request failed: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`
    );
  }

  return (await response.json()) as T;
}

async function getToken(env: Required<FileMakerEnv>): Promise<string> {
  const key = tokenCacheKey(env);
  const cached = tokenCache[key];

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const auth = Buffer.from(`${env.username}:${env.password}`).toString("base64");
  const response = await fmHttpFetch(
    `${hostBase(env.host)}/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      }
    },
    "FileMaker authentication request"
  );

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `Failed to authenticate with FileMaker: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`
    );
  }

  const payload = (await response.json()) as {
    response?: {
      token?: string;
    };
  };

  const token = payload.response?.token;
  if (!token) {
    throw new Error("FileMaker auth response did not include token");
  }

  tokenCache[key] = {
    token,
    expiresAt: Date.now() + 14 * 60_000
  };

  return token;
}

function resolveContainerUrl(env: Required<FileMakerEnv>, raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Container URL is required");
  }

  const host = hostBase(env.host);
  const allowedOrigin = new URL(host).origin;

  if (trimmed.startsWith("/")) {
    return new URL(`${host}${trimmed}`);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (parsed.origin !== allowedOrigin) {
      throw new Error("Container URL host does not match FileMaker host");
    }
    return parsed;
  }

  // Fallback for relative-like FileMaker paths without a leading slash.
  return new URL(`${host}/${trimmed.replace(/^\/+/, "")}`);
}

export async function fetchContainerAsset(
  rawUrl: string,
  context?: FileMakerContext
): Promise<{
  source: "filemaker" | "mock";
  body: ArrayBuffer;
  contentType: string;
  contentDisposition?: string;
}> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    return {
      source: "mock",
      body: new ArrayBuffer(0),
      contentType: "application/octet-stream"
    };
  }

  const targetUrl = resolveContainerUrl(env, rawUrl);
  const key = tokenCacheKey(env);

  const fetchWithAuth = async () => {
    const token = await getToken(env);
    return fmHttpFetch(
      targetUrl.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      "FileMaker container fetch"
    );
  };

  let response = await fetchWithAuth();

  if (response.status === 401) {
    delete tokenCache[key];
    response = await fetchWithAuth();
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `Failed to fetch container: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`
    );
  }

  return {
    source: "filemaker",
    body: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition") ?? undefined
  };
}

type GetRecordsParams = {
  tableOccurrence: string;
  limit?: number;
  workspaceId?: string;
};

type FieldCatalogEntry = {
  name: string;
  type: string;
};

type StyleCatalog = {
  source: "mock" | "filemaker";
  themes: string[];
  styles: string[];
  stylesByTheme: Record<string, string[]>;
  styleTargetsByTheme: Record<string, Record<string, string[]>>;
  activeTheme: string;
};

type InstalledThemeCatalog = {
  version: number;
  generatedAt: string;
  sourceApp: {
    name: string;
    path: string;
    themesPath: string;
  };
  themes: Array<{
    id: string;
    token: string;
    name: string;
    group: string;
    platform: string;
    version: string;
    cssFile: string;
    preview: string;
    styles: string[];
  }>;
  themeNames: string[];
  stylesByTheme: Record<string, string[]>;
  styleTargetsByTheme?: Record<string, Record<string, string[]>>;
  allStyles: string[];
};

type ValueListEntry = {
  name: string;
  values: string[];
  items?: Array<{
    value: string;
    displayValue: string;
  }>;
  source?: string;
  sourceFields?: string[];
  creationOrder?: number;
};

type ValueListCatalog = {
  source: "mock" | "filemaker";
  valueLists: ValueListEntry[];
};

type LayoutFolderGroup = {
  folder: string | null;
  layouts: string[];
};

const fallbackThemes = ["Universal Touch"];
const fallbackStyles = [
  "Default",
  "Border | Knockout",
  "Border | Secondary",
  "Fill | Inverted",
  "Fill | Low Shadow | Inverted",
  "Fill | Secondary",
  "Underline | Knockout"
];
const fileMakerThemeCatalogPath = path.join(process.cwd(), "data", "filemaker-theme-catalog.json");
const fileMakerThemeMirrorPath = path.join(process.cwd(), "data", "filemaker-themes");
let installedThemeCatalogCache: {
  mtimeMs: number;
  catalog: InstalledThemeCatalog;
} | null = null;

function inferFieldTypeFromValue(value: unknown): string {
  if (typeof value === "number") {
    return "Number";
  }
  if (typeof value === "boolean") {
    return "Boolean";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
      return "Date";
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return "Time";
    }
  }
  return "Text";
}

function normalizeFieldType(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) {
    return "Text";
  }

  const lowered = value.toLowerCase();
  if (lowered.includes("timestamp")) {
    return "Timestamp";
  }
  if (lowered.includes("container")) {
    return "Container";
  }
  if (lowered.includes("summary")) {
    return "Summary";
  }
  if (lowered.includes("calc")) {
    return "Calculation";
  }
  if (lowered === "normal") {
    return "Text";
  }
  if (lowered.includes("date")) {
    return "Date";
  }
  if (lowered === "time" || lowered.includes(" time")) {
    return "Time";
  }
  if (lowered.includes("number") || lowered.includes("numeric") || lowered.includes("integer")) {
    return "Number";
  }
  if (lowered.includes("bool")) {
    return "Boolean";
  }
  if (lowered.includes("text") || lowered.includes("string")) {
    return "Text";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fieldCatalogFromRecords(records: FMRecord[]): FieldCatalogEntry[] {
  const byName = new Map<string, string>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (key === "recordId" || key === "modId" || key === "portalData") {
        continue;
      }

      const inferredType = inferFieldTypeFromValue(value);
      const existing = byName.get(key);
      if (!existing || existing === "Text") {
        byName.set(key, inferredType);
      }
    }
  }

  return [...byName.entries()]
    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
    .map(([name, type]) => ({
      name,
      type: type || "Text"
    }));
}

function fieldTypeFromMetaEntry(entry: unknown): string {
  if (!entry) {
    return "Text";
  }
  if (typeof entry === "string") {
    return normalizeFieldType(entry);
  }
  if (typeof entry !== "object") {
    return "Text";
  }

  const candidate = entry as Record<string, unknown>;
  return normalizeFieldType(candidate.dataType ?? candidate.result ?? candidate.type ?? candidate.fieldType ?? "Text");
}

function pushNamedOption(target: Set<string>, value: unknown): void {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (cleaned && cleaned !== "-") {
      target.add(cleaned);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  const candidate =
    (typeof record.name === "string" && record.name) ||
    (typeof record.styleName === "string" && record.styleName) ||
    (typeof record.themeName === "string" && record.themeName) ||
    "";
  if (candidate && candidate !== "-") {
    target.add(candidate);
  }
}

function toCleanString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) {
      continue;
    }
    const token = cleaned.toLowerCase();
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    next.push(cleaned);
  }
  return next;
}

function sortCaseInsensitive(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeLookupToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeStyleList(values: string[]): string[] {
  const deduped = dedupeCaseInsensitive(values);
  const nonDefault = sortCaseInsensitive(deduped.filter((entry) => entry.toLowerCase() !== "default"));
  return ["Default", ...nonDefault];
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function mapNamedStyleTokenToTargets(token: string): string[] {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const targets = new Set<string>();
  if (normalized.includes("background")) {
    targets.add("Layout Background");
  }
  if (normalized.includes("-part") || normalized.includes("subsummary") || normalized.includes("sub-summary")) {
    targets.add("Part");
  }
  if (normalized.includes("-line")) {
    targets.add("Line");
  }
  if (normalized.includes("-shape")) {
    targets.add("Shape");
  }
  if (normalized.includes("-edit")) {
    targets.add("Edit Box");
  }
  if (normalized.includes("-dropdown")) {
    targets.add("Drop-down List");
  }
  if (normalized.includes("-popup")) {
    targets.add("Pop-up Menu");
  }
  if (normalized.includes("-checkbox")) {
    targets.add("Checkbox Set");
  }
  if (normalized.includes("-radio")) {
    targets.add("Radio Button Set");
  }
  if (normalized.includes("-calendar")) {
    targets.add("Drop-down Calendar");
  }
  if (normalized.includes("-container")) {
    targets.add("Container");
  }
  if (normalized.includes("-portal")) {
    targets.add("Portal");
  }
  if (normalized.includes("-tab")) {
    targets.add("Tab Control");
  }
  if (normalized.includes("-slide")) {
    targets.add("Slide Control");
  }
  if (normalized.includes("-web")) {
    targets.add("Web Viewer");
  }
  if (normalized.includes("-chart")) {
    targets.add("Chart");
  }
  if (normalized.includes("-text")) {
    targets.add("Text");
  }
  if (normalized.includes("-buttonbar") || normalized.includes("-button-bar")) {
    targets.add("Button Bar");
  } else if (normalized.includes("-button")) {
    targets.add("Button");
  }

  return [...targets];
}

function parseNamedStyleTargetsFromManifest(xml: string): Record<string, string[]> {
  const block = xml.match(/<namedstyles>([\s\S]*?)<\/namedstyles>/i);
  if (!block) {
    return {};
  }

  const styleTargets = new Map<string, Set<string>>();
  const stylePattern = /<([A-Za-z_][\w:.-]*)>([\s\S]*?)<\/\1>/g;
  let match = stylePattern.exec(block[1]);
  while (match) {
    const token = match[1]?.trim() ?? "";
    const rawValue = match[2]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const styleName = decodeXmlEntities(rawValue);
    if (!styleName) {
      match = stylePattern.exec(block[1]);
      continue;
    }

    const targets = mapNamedStyleTokenToTargets(token);
    if (targets.length === 0) {
      match = stylePattern.exec(block[1]);
      continue;
    }

    const existing = styleTargets.get(styleName) ?? new Set<string>();
    for (const target of targets) {
      existing.add(target);
    }
    styleTargets.set(styleName, existing);

    match = stylePattern.exec(block[1]);
  }

  const serialized: Record<string, string[]> = {};
  for (const [styleName, targets] of styleTargets.entries()) {
    serialized[styleName] = sortCaseInsensitive([...targets]);
  }
  return serialized;
}

async function loadStyleTargetsByThemeFromMirror(
  catalog: InstalledThemeCatalog
): Promise<Record<string, Record<string, string[]>>> {
  const byTheme: Record<string, Record<string, string[]>> = {};
  for (const theme of catalog.themes) {
    const themeName = theme.name.trim();
    const themeToken = theme.token.trim();
    if (!themeName || !themeToken) {
      continue;
    }
    const manifestPath = path.join(fileMakerThemeMirrorPath, themeToken, "manifest.xml");
    try {
      const manifestXml = await fs.readFile(manifestPath, "utf8");
      byTheme[themeName] = parseNamedStyleTargetsFromManifest(manifestXml);
    } catch {
      byTheme[themeName] = {};
    }
  }
  return byTheme;
}

function ensureStylesByThemeEntry(
  stylesByTheme: Map<string, Set<string>>,
  themeName: string,
  seedStyles: string[]
): Set<string> {
  const cleanedThemeName = themeName.trim();
  if (!cleanedThemeName) {
    return new Set<string>(["Default"]);
  }

  const existing = stylesByTheme.get(cleanedThemeName);
  if (existing) {
    return existing;
  }

  const seeded = new Set<string>(normalizeStyleList(seedStyles));
  stylesByTheme.set(cleanedThemeName, seeded);
  return seeded;
}

function findMatchingThemeName(candidate: string, availableThemes: Iterable<string>): string {
  const cleaned = candidate.trim();
  if (!cleaned) {
    return "";
  }

  const names = [...availableThemes];
  if (names.length === 0) {
    return cleaned;
  }

  const byExactLower = new Map<string, string>();
  const byToken = new Map<string, string>();
  for (const name of names) {
    const lowered = name.trim().toLowerCase();
    if (lowered) {
      byExactLower.set(lowered, name);
    }
    const token = normalizeLookupToken(name);
    if (token) {
      byToken.set(token, name);
    }
  }

  const direct = byExactLower.get(cleaned.toLowerCase());
  if (direct) {
    return direct;
  }

  const variants = new Set<string>([
    cleaned,
    cleaned.replace(/_/g, " "),
    cleaned.replace(/_/g, ""),
    cleaned.includes(".") ? cleaned.split(".").pop() ?? "" : ""
  ]);

  for (const variant of variants) {
    const token = normalizeLookupToken(variant);
    if (!token) {
      continue;
    }
    const resolved = byToken.get(token);
    if (resolved) {
      return resolved;
    }
  }

  return cleaned;
}

async function loadInstalledThemeCatalog(): Promise<InstalledThemeCatalog | null> {
  try {
    const stat = await fs.stat(fileMakerThemeCatalogPath);
    if (installedThemeCatalogCache && installedThemeCatalogCache.mtimeMs === stat.mtimeMs) {
      return installedThemeCatalogCache.catalog;
    }

    const raw = await fs.readFile(fileMakerThemeCatalogPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<InstalledThemeCatalog>;
    if (
      !parsed ||
      !Array.isArray(parsed.themeNames) ||
      !parsed.stylesByTheme ||
      typeof parsed.stylesByTheme !== "object"
    ) {
      return null;
    }

    const catalog = parsed as InstalledThemeCatalog;
    if (!catalog.styleTargetsByTheme || typeof catalog.styleTargetsByTheme !== "object") {
      catalog.styleTargetsByTheme = await loadStyleTargetsByThemeFromMirror(catalog);
    }
    installedThemeCatalogCache = {
      mtimeMs: stat.mtimeMs,
      catalog
    };
    return catalog;
  } catch {
    return null;
  }
}

function valueListNameFromMetaEntry(entry: unknown): string {
  if (!entry || typeof entry !== "object") {
    return "";
  }
  const candidate = entry as Record<string, unknown>;
  return (
    toCleanString(candidate.valueListName) ||
    toCleanString(candidate.valueList) ||
    toCleanString(candidate.listName) ||
    toCleanString(candidate.valueListNameDisplay) ||
    ""
  );
}

function parseFieldValueListBindings(fieldMetaData: unknown): Array<{ fieldName: string; valueListName: string }> {
  const bindings: Array<{ fieldName: string; valueListName: string }> = [];
  const pushBinding = (fieldNameRaw: unknown, metaEntry: unknown) => {
    const fieldName = toCleanString(fieldNameRaw);
    const valueListName = valueListNameFromMetaEntry(metaEntry);
    if (!fieldName || !valueListName) {
      return;
    }
    bindings.push({ fieldName, valueListName });
  };

  if (fieldMetaData && typeof fieldMetaData === "object" && !Array.isArray(fieldMetaData)) {
    for (const [fieldName, entry] of Object.entries(fieldMetaData as Record<string, unknown>)) {
      pushBinding(fieldName, entry);
    }
  }

  if (Array.isArray(fieldMetaData)) {
    for (const entry of fieldMetaData) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const candidate = entry as Record<string, unknown>;
      const fieldName = toCleanString(candidate.name) || toCleanString(candidate.fieldName);
      pushBinding(fieldName, candidate);
    }
  }

  return bindings;
}

type ValueListItem = {
  value: string;
  displayValue: string;
};

function dedupeValueListItems(items: ValueListItem[]): ValueListItem[] {
  const deduped: ValueListItem[] = [];
  const seen = new Set<string>();
  for (const entry of items) {
    const value = toCleanString(entry.value);
    const displayValue = toCleanString(entry.displayValue);
    const normalizedValue = value.toLowerCase();
    if (!value || seen.has(normalizedValue)) {
      continue;
    }
    seen.add(normalizedValue);
    deduped.push({
      value,
      displayValue: displayValue || value
    });
  }
  return deduped;
}

function extractValueListItem(entry: unknown): ValueListItem | null {
  if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
    const token = String(entry).trim();
    return token
      ? {
          value: token,
          displayValue: token
        }
      : null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Record<string, unknown>;
  const value =
    toCleanString(candidate.value) ||
    toCleanString(candidate.data) ||
    toCleanString(candidate.id) ||
    toCleanString(candidate.key) ||
    toCleanString(candidate.code) ||
    "";
  const displayValue =
    toCleanString(candidate.displayValue) ||
    toCleanString(candidate.text) ||
    toCleanString(candidate.label) ||
    toCleanString(candidate.name) ||
    value;
  const resolvedValue = value || displayValue;
  const resolvedDisplayValue = displayValue || resolvedValue;

  if (!resolvedValue) {
    return null;
  }

  return {
    value: resolvedValue,
    displayValue: resolvedDisplayValue
  };
}

function extractValueListItems(raw: unknown): ValueListItem[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    const items = raw
      .map((entry) => extractValueListItem(entry))
      .filter((entry): entry is ValueListItem => Boolean(entry));
    return dedupeValueListItems(items);
  }

  if (typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;
    const nestedValues =
      candidate.values ??
      candidate.valueList ??
      candidate.valueListValues ??
      candidate.items ??
      candidate.data ??
      candidate.entries ??
      null;
    if (nestedValues != null) {
      return extractValueListItems(nestedValues);
    }
    const single = extractValueListItem(candidate);
    return single ? [single] : [];
  }

  const text = toCleanString(raw);
  return text
    ? [
        {
          value: text,
          displayValue: text
        }
      ]
    : [];
}

function extractValueListValues(raw: unknown): string[] {
  return dedupeCaseInsensitive(extractValueListItems(raw).map((entry) => entry.displayValue));
}

function mergeValueListValues(target: Map<string, string[]>, name: string, values: string[]): void {
  const cleanedName = name.trim();
  if (!cleanedName || values.length === 0) {
    return;
  }
  const existing = target.get(cleanedName) ?? [];
  target.set(cleanedName, dedupeCaseInsensitive([...existing, ...values]));
}

function mergeValueListItems(target: Map<string, ValueListItem[]>, name: string, items: ValueListItem[]): void {
  const cleanedName = name.trim();
  if (!cleanedName || items.length === 0) {
    return;
  }
  const existing = target.get(cleanedName) ?? [];
  target.set(cleanedName, dedupeValueListItems([...existing, ...items]));
}

function parseNamedValueListEntries(raw: unknown): ValueListEntry[] {
  const entries: ValueListEntry[] = [];

  if (!Array.isArray(raw)) {
    if (raw && typeof raw === "object") {
      const candidate = raw as Record<string, unknown>;
      const name =
        toCleanString(candidate.name) ||
        toCleanString(candidate.valueListName) ||
        toCleanString(candidate.listName);
      if (name) {
        const items = extractValueListItems(
          candidate.values ??
            candidate.valueList ??
            candidate.valueListValues ??
            candidate.items ??
            candidate.data ??
            []
        );
        entries.push({
          name,
          values: items.map((entry) => entry.displayValue),
          items
        });
      }
    }
    return entries;
  }

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const name =
      toCleanString(candidate.name) ||
      toCleanString(candidate.valueListName) ||
      toCleanString(candidate.listName);
    if (!name) {
      continue;
    }
    const items = extractValueListItems(
      candidate.values ??
        candidate.valueList ??
        candidate.valueListValues ??
        candidate.items ??
        candidate.data ??
        []
    );
    entries.push({
      name,
      values: items.map((entry) => entry.displayValue),
      items
    });
  }

  return entries;
}

function recordValueByField(record: FMRecord, fieldName: string): unknown {
  if (record[fieldName] != null) {
    return record[fieldName];
  }
  const unqualified = fieldName.includes("::") ? fieldName.split("::").pop() ?? fieldName : fieldName;
  if (record[unqualified] != null) {
    return record[unqualified];
  }
  return "";
}

async function mockValueListsForTable(tableOccurrence: string): Promise<ValueListEntry[]> {
  const records = await loadRecords(tableOccurrence);
  if (records.length === 0) {
    return [];
  }

  const fieldNames = fieldCatalogFromRecords(records).map((field) => field.name);
  const valueLists: ValueListEntry[] = [];
  for (const fieldName of fieldNames) {
    const values: string[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      const token = toCleanString(record[fieldName]);
      if (!token) {
        continue;
      }
      const normalized = token.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      values.push(token);
      if (values.length >= 200) {
        break;
      }
    }
    if (values.length > 0) {
      valueLists.push({
        name: fieldName,
        values,
        items: values.map((value) => ({
          value,
          displayValue: value
        })),
        source: "From Field",
        sourceFields: [`${tableOccurrence}::${fieldName}`]
      });
    }
  }

  return valueLists.map((entry, index) => ({
    ...entry,
    creationOrder: index + 1
  }));
}

async function fetchSingleValueListValues(
  env: Required<FileMakerEnv>,
  tableOccurrence: string,
  valueListName: string
): Promise<ValueListItem[]> {
  const encodedDatabase = encodeURIComponent(env.database);
  const encodedLayout = encodeURIComponent(tableOccurrence);
  const encodedList = encodeURIComponent(valueListName);
  const endpoints = [
    `/fmi/data/vLatest/databases/${encodedDatabase}/layouts/${encodedLayout}/value-lists/${encodedList}`,
    `/fmi/data/vLatest/databases/${encodedDatabase}/layouts/${encodedLayout}/valueLists/${encodedList}`,
    `/fmi/data/vLatest/databases/${encodedDatabase}/layouts/${encodedLayout}/value-lists?name=${encodedList}`,
    `/fmi/data/vLatest/databases/${encodedDatabase}/layouts/${encodedLayout}/valueLists?name=${encodedList}`
  ];

  for (const endpoint of endpoints) {
    try {
      const payload = await fmFetch<{ response?: Record<string, unknown> }>(env, endpoint, {
        method: "GET"
      });
      const response = payload.response;
      if (!response || typeof response !== "object") {
        continue;
      }

      const responseRecord = response as Record<string, unknown>;
      const directCandidates = [
        extractValueListItems(responseRecord.values),
        extractValueListItems(responseRecord.valueListValues),
        extractValueListItems(responseRecord.valueList)
      ];
      const direct = directCandidates.find((entry) => entry.length > 0) ?? [];
      if (direct.length > 0) {
        return direct;
      }

      const namedEntries = parseNamedValueListEntries(
        responseRecord.valueLists ?? responseRecord.data ?? responseRecord.valueList
      );
      const matched = namedEntries.find((entry) => entry.name.toLowerCase() === valueListName.toLowerCase());
      if (matched && (matched.items?.length ?? 0) > 0) {
        return matched.items ?? [];
      }
      if (matched && matched.values.length > 0) {
        return matched.values.map((value) => ({
          value,
          displayValue: value
        }));
      }
    } catch {
      // Keep trying compatible FileMaker endpoint variants.
    }
  }

  return [];
}

async function getValueListsForLayoutContext(
  tableOccurrence: string,
  context?: FileMakerContext
): Promise<ValueListCatalog> {
  const env = readEnv(context);
  const normalizedTableOccurrence = tableOccurrence.trim() || "Customers";

  if (!hasRealConfig(env)) {
    return {
      source: "mock",
      valueLists: await mockValueListsForTable(normalizedTableOccurrence)
    };
  }

  const payload = await fmFetch<{
    response?: {
      fieldMetaData?: unknown;
      valueLists?: unknown;
      layoutMetaData?: unknown;
    };
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      normalizedTableOccurrence
    )}`,
    {
      method: "GET"
    }
  );

  const response = payload.response;
  const listNames = new Set<string>();
  const valuesByName = new Map<string, string[]>();
  const itemsByName = new Map<string, ValueListItem[]>();
  const fieldsByValueList = new Map<string, Set<string>>();

  const registerListName = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) {
      return;
    }
    listNames.add(cleaned);
  };

  if (response && typeof response === "object") {
    const responseRecord = response as Record<string, unknown>;
    const namedEntries = parseNamedValueListEntries(
      responseRecord.valueLists ??
        (responseRecord.layoutMetaData &&
        typeof responseRecord.layoutMetaData === "object" &&
        !Array.isArray(responseRecord.layoutMetaData)
          ? (responseRecord.layoutMetaData as Record<string, unknown>).valueLists
          : [])
    );
    for (const entry of namedEntries) {
      registerListName(entry.name);
      mergeValueListValues(valuesByName, entry.name, entry.values);
      mergeValueListItems(itemsByName, entry.name, entry.items ?? []);
    }

    const fieldBindings = parseFieldValueListBindings(responseRecord.fieldMetaData);
    for (const binding of fieldBindings) {
      registerListName(binding.valueListName);
      const existing = fieldsByValueList.get(binding.valueListName) ?? new Set<string>();
      existing.add(binding.fieldName);
      fieldsByValueList.set(binding.valueListName, existing);
    }
  }

  for (const valueListName of listNames) {
    if ((valuesByName.get(valueListName)?.length ?? 0) > 0) {
      continue;
    }
    const fetchedItems = await fetchSingleValueListValues(env, normalizedTableOccurrence, valueListName);
    if (fetchedItems.length > 0) {
      mergeValueListItems(itemsByName, valueListName, fetchedItems);
      mergeValueListValues(
        valuesByName,
        valueListName,
        fetchedItems.map((entry) => entry.displayValue)
      );
    }
  }

  const namesWithoutValues = [...listNames].filter((name) => (valuesByName.get(name)?.length ?? 0) === 0);
  if (namesWithoutValues.length > 0) {
    const records = await getRecords({
      tableOccurrence: normalizedTableOccurrence,
      limit: 250,
      workspaceId: context?.workspaceId
    });
    for (const valueListName of namesWithoutValues) {
      const fieldsForList = [...(fieldsByValueList.get(valueListName) ?? [])];
      if (fieldsForList.length === 0) {
        continue;
      }
      const values: string[] = [];
      const seen = new Set<string>();
      for (const record of records) {
        for (const fieldName of fieldsForList) {
          const token = toCleanString(recordValueByField(record, fieldName));
          if (!token) {
            continue;
          }
          const normalized = token.toLowerCase();
          if (seen.has(normalized)) {
            continue;
          }
          seen.add(normalized);
          values.push(token);
          if (values.length >= 200) {
            break;
          }
        }
        if (values.length >= 200) {
          break;
        }
      }
      mergeValueListValues(valuesByName, valueListName, values);
      mergeValueListItems(
        itemsByName,
        valueListName,
        values.map((value) => ({
          value,
          displayValue: value
        }))
      );
    }
  }

  const valueLists = [...listNames].map((name, index) => {
    const sourceFields = [...(fieldsByValueList.get(name) ?? [])]
      .map((fieldName) => fieldName.trim())
      .filter((fieldName) => fieldName.length > 0);
    const items = dedupeValueListItems(
      itemsByName.get(name) ??
        (valuesByName.get(name) ?? []).map((value) => ({
          value,
          displayValue: value
        }))
    );
    const values = items.length > 0 ? items.map((entry) => entry.displayValue) : valuesByName.get(name) ?? [];
    const source = sourceFields.length > 0 ? "From Field" : values.length > 0 ? "Custom Values" : "Unknown";
    return {
      name,
      values,
      items,
      source,
      sourceFields: sourceFields.length > 0 ? sourceFields : undefined,
      creationOrder: index + 1
    };
  });

  return {
    source: "filemaker",
    valueLists
  };
}

function mergeValueListCatalogEntries(entries: ValueListEntry[]): ValueListEntry[] {
  const byName = new Map<string, ValueListEntry>();
  const order: string[] = [];

  for (const entry of entries) {
    const name = toCleanString(entry.name);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    const current = byName.get(key);
    if (!current) {
      order.push(key);
      const initialItems = dedupeValueListItems([
        ...(entry.items ?? []),
        ...(entry.values ?? []).map((value) => ({ value, displayValue: value }))
      ]);
      byName.set(key, {
        name,
        values:
          initialItems.length > 0
            ? initialItems.map((item) => item.displayValue)
            : dedupeCaseInsensitive(entry.values ?? []),
        items: initialItems,
        source: toCleanString(entry.source) || undefined,
        sourceFields: entry.sourceFields ? dedupeCaseInsensitive(entry.sourceFields) : undefined,
        creationOrder: order.length
      });
      continue;
    }

    const mergedItems = dedupeValueListItems([
      ...(current.items ?? []),
      ...(current.values ?? []).map((value) => ({ value, displayValue: value })),
      ...(entry.items ?? []),
      ...(entry.values ?? []).map((value) => ({ value, displayValue: value }))
    ]);
    const mergedValues =
      mergedItems.length > 0
        ? mergedItems.map((item) => item.displayValue)
        : dedupeCaseInsensitive([...(current.values ?? []), ...(entry.values ?? [])]);
    const mergedSourceFields = dedupeCaseInsensitive([
      ...(current.sourceFields ?? []),
      ...(entry.sourceFields ?? [])
    ]);
    const mergedSource =
      mergedSourceFields.length > 0
        ? "From Field"
        : toCleanString(current.source) || toCleanString(entry.source) || undefined;

    byName.set(key, {
      ...current,
      values: mergedValues,
      items: mergedItems,
      sourceFields: mergedSourceFields.length > 0 ? mergedSourceFields : undefined,
      source: mergedSource
    });
  }

  return order.map((key, index) => {
    const entry = byName.get(key);
    return {
      name: entry?.name ?? "",
      values: entry?.values ?? [],
      items: entry?.items ?? [],
      source: entry?.source,
      sourceFields: entry?.sourceFields,
      creationOrder: index + 1
    };
  });
}

export async function getValueLists(options?: {
  scope?: "database" | "layout";
  tableOccurrence?: string;
  workspaceId?: string;
}): Promise<ValueListCatalog> {
  const context: FileMakerContext = {
    workspaceId: options?.workspaceId
  };
  const env = readEnv(context);
  const scope = options?.scope === "layout" ? "layout" : "database";
  const requestedTableOccurrence = options?.tableOccurrence?.trim() || "Customers";

  if (scope === "layout") {
    return getValueListsForLayoutContext(requestedTableOccurrence, context);
  }

  if (!hasRealConfig(env)) {
    const catalog = await getValueListsForLayoutContext(requestedTableOccurrence, context);
    return {
      source: "mock",
      valueLists: mergeValueListCatalogEntries(catalog.valueLists)
    };
  }

  const layoutsPayload = await getAvailableLayouts(context);
  const layoutCandidates = dedupeCaseInsensitive([
    ...layoutsPayload.layouts,
    requestedTableOccurrence
  ]);
  if (layoutCandidates.length === 0) {
    return {
      source: "filemaker",
      valueLists: []
    };
  }

  const collected: ValueListEntry[] = [];
  for (const layoutName of layoutCandidates) {
    try {
      const catalog = await getValueListsForLayoutContext(layoutName, context);
      collected.push(...catalog.valueLists);
    } catch {
      // Continue so one invalid layout context doesn't block global value list catalog.
    }
  }

  return {
    source: "filemaker",
    valueLists: mergeValueListCatalogEntries(collected)
  };
}

export async function getRecords(params: GetRecordsParams): Promise<FMRecord[]> {
  const env = readEnv({ workspaceId: params.workspaceId });

  if (!hasRealConfig(env)) {
    return loadRecords(params.tableOccurrence, params.workspaceId);
  }

  const payload = await fmFetch<{
    response: {
      data: Array<{
        recordId: string;
        modId: string;
        fieldData: Record<string, unknown>;
        portalData?: Record<string, Array<Record<string, unknown>>>;
      }>;
    };
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      params.tableOccurrence
    )}/records?_limit=${params.limit ?? 100}`,
    {
      method: "GET"
    }
  );

  return payload.response.data.map((row) => {
    const flattenedRelated: Record<string, unknown> = {};
    const normalizedPortalData: Record<string, Array<Record<string, unknown>>> = {};
    if (row.portalData && typeof row.portalData === "object") {
      for (const [portalName, portalRows] of Object.entries(row.portalData)) {
        if (!Array.isArray(portalRows) || portalRows.length === 0) {
          continue;
        }
        const normalizedRows = portalRows.filter(
          (portalRow): portalRow is Record<string, unknown> =>
            Boolean(portalRow) && typeof portalRow === "object" && !Array.isArray(portalRow)
        );
        if (normalizedRows.length === 0) {
          continue;
        }

        normalizedPortalData[portalName] = normalizedRows;
        const preferredRow = normalizedRows[normalizedRows.length - 1] ?? normalizedRows[0];
        for (const [fieldName, value] of Object.entries(preferredRow)) {
          const qualified = `${portalName}::${fieldName}`;
          if (flattenedRelated[qualified] == null) {
            flattenedRelated[qualified] = value;
          }
        }
      }
    }

    return {
      recordId: row.recordId,
      modId: row.modId,
      ...row.fieldData,
      ...flattenedRelated,
      portalData: normalizedPortalData
    };
  });
}

export async function getLayoutFields(
  tableOccurrence: string,
  context?: FileMakerContext
): Promise<{ source: "mock" | "filemaker"; fields: FieldCatalogEntry[] }> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    const records = await loadRecords(tableOccurrence, context?.workspaceId);
    return {
      source: "mock",
      fields: fieldCatalogFromRecords(records)
    };
  }

  const payload = await fmFetch<{
    response?: {
      fieldMetaData?: unknown;
    };
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      tableOccurrence
    )}`,
    {
      method: "GET"
    }
  );

  const fieldMetaData = payload.response?.fieldMetaData;
  const byName = new Map<string, string>();

  const registerField = (name: string, type: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const normalizedType = normalizeFieldType(type);
    const existing = byName.get(trimmed);
    if (!existing || existing === "Text") {
      byName.set(trimmed, normalizedType || "Text");
    }
  };

  if (fieldMetaData && typeof fieldMetaData === "object" && !Array.isArray(fieldMetaData)) {
    for (const [name, entry] of Object.entries(fieldMetaData as Record<string, unknown>)) {
      registerField(name, fieldTypeFromMetaEntry(entry));
    }
  }

  if (Array.isArray(fieldMetaData)) {
    for (const entry of fieldMetaData) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const candidate = entry as Record<string, unknown>;
      const name = String(candidate.name ?? candidate.fieldName ?? "");
      registerField(name, fieldTypeFromMetaEntry(candidate));
    }
  }

  if (byName.size === 0) {
    // Fallback when layout metadata response omits fieldMetaData in some FM versions/configs.
    const records = await getRecords({
      tableOccurrence,
      limit: 1,
      workspaceId: context?.workspaceId
    });
    for (const field of fieldCatalogFromRecords(records)) {
      registerField(field.name, field.type);
    }
  }

  return {
    source: "filemaker",
    fields: [...byName.entries()]
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      .map(([name, type]) => ({
        name,
        type: type || "Text"
      }))
  };
}

function pushUnique(target: string[], name: string): void {
  if (!target.includes(name)) {
    target.push(name);
  }
}

function collectLayoutName(candidate: Record<string, unknown>): string {
  const raw =
    (typeof candidate.name === "string" && candidate.name) ||
    (typeof candidate.layoutName === "string" && candidate.layoutName) ||
    (typeof candidate.layout === "string" && candidate.layout) ||
    "";
  return raw.trim();
}

function parseLayoutCatalog(entries: unknown): { layouts: string[]; layoutFolders: LayoutFolderGroup[] } {
  const layouts: string[] = [];
  const ungroupedLayouts: string[] = [];
  const folders = new Map<string, string[]>();

  const ensureFolder = (folderName: string): string[] => {
    const normalized = folderName.trim();
    if (!folders.has(normalized)) {
      folders.set(normalized, []);
    }
    return folders.get(normalized) ?? [];
  };

  const addLayout = (layoutName: string, folderName?: string | null) => {
    const normalizedLayoutName = layoutName.trim();
    if (!normalizedLayoutName || normalizedLayoutName === "-") {
      return;
    }
    pushUnique(layouts, normalizedLayoutName);
    const normalizedFolderName = (folderName ?? "").trim();
    if (normalizedFolderName) {
      const folderLayouts = ensureFolder(normalizedFolderName);
      pushUnique(folderLayouts, normalizedLayoutName);
      return;
    }
    pushUnique(ungroupedLayouts, normalizedLayoutName);
  };

  const walk = (rawEntries: unknown, parentFolder?: string | null) => {
    if (!Array.isArray(rawEntries)) {
      return;
    }

    for (const entry of rawEntries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const candidate = entry as Record<string, unknown>;
      const layoutName = collectLayoutName(candidate);
      const explicitFolderName =
        (typeof candidate.folderName === "string" && candidate.folderName.trim()) ||
        (typeof candidate.parentFolderName === "string" && candidate.parentFolderName.trim()) ||
        "";
      const isFolder = candidate.isFolder === true || candidate.type === "folder";
      const effectiveParentFolder = explicitFolderName || parentFolder || null;

      if (isFolder) {
        const folderName = layoutName || explicitFolderName;
        const nestedEntries =
          candidate.folderLayoutNames ??
          candidate.layouts ??
          candidate.folderLayouts ??
          candidate.folderLayoutsNames ??
          [];
        if (folderName) {
          ensureFolder(folderName);
          walk(nestedEntries, folderName);
        } else {
          walk(nestedEntries, effectiveParentFolder);
        }
        continue;
      }

      if (layoutName) {
        addLayout(layoutName, effectiveParentFolder);
      }

      const nestedEntries =
        candidate.folderLayoutNames ??
        candidate.layouts ??
        candidate.folderLayouts ??
        candidate.folderLayoutsNames;
      if (Array.isArray(nestedEntries)) {
        walk(nestedEntries, effectiveParentFolder);
      }
    }
  };

  walk(entries);

  const layoutFolders: LayoutFolderGroup[] = [];
  if (ungroupedLayouts.length > 0) {
    layoutFolders.push({
      folder: null,
      layouts: [...ungroupedLayouts]
    });
  }
  for (const [folder, folderLayouts] of folders.entries()) {
    if (folderLayouts.length === 0) {
      continue;
    }
    layoutFolders.push({
      folder,
      layouts: [...folderLayouts]
    });
  }

  return {
    layouts,
    layoutFolders
  };
}

export async function getAvailableLayouts(context?: FileMakerContext): Promise<{
  source: "mock" | "filemaker";
  layouts: string[];
  layoutFolders: LayoutFolderGroup[];
}> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    return {
      source: "mock",
      layouts: ["Customers"],
      layoutFolders: [
        {
          folder: null,
          layouts: ["Customers"]
        }
      ]
    };
  }

  const payload = await fmFetch<{
    response?: {
      layouts?: unknown;
    };
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts`,
    {
      method: "GET"
    }
  );

  const entries = payload.response?.layouts;
  const parsed = parseLayoutCatalog(entries);

  return {
    source: "filemaker",
    layouts: parsed.layouts,
    layoutFolders: parsed.layoutFolders
  };
}

export async function getStyleCatalog(
  layoutName: string,
  context?: FileMakerContext
): Promise<StyleCatalog> {
  const env = readEnv(context);
  const normalizedLayoutName = layoutName.trim() || "Customers";
  const installedThemeCatalog = await loadInstalledThemeCatalog();

  if (!hasRealConfig(env)) {
    const mockStylesByTheme: Record<string, string[]> = {};
    const mockStyleTargetsByTheme: Record<string, Record<string, string[]>> = {};
    const mockThemes =
      installedThemeCatalog && installedThemeCatalog.themeNames.length > 0
        ? sortCaseInsensitive(installedThemeCatalog.themeNames)
        : [...fallbackThemes];

    if (installedThemeCatalog) {
      for (const themeName of mockThemes) {
        mockStylesByTheme[themeName] = normalizeStyleList(installedThemeCatalog.stylesByTheme[themeName] ?? ["Default"]);
        mockStyleTargetsByTheme[themeName] = installedThemeCatalog.styleTargetsByTheme?.[themeName] ?? {};
      }
    } else {
      for (const themeName of fallbackThemes) {
        mockStylesByTheme[themeName] = normalizeStyleList(fallbackStyles);
        mockStyleTargetsByTheme[themeName] = {};
      }
    }

    const activeTheme = findMatchingThemeName(fallbackThemes[0], mockThemes) || mockThemes[0] || fallbackThemes[0];
    return {
      source: "mock",
      themes: mockThemes,
      styles: mockStylesByTheme[activeTheme] ?? normalizeStyleList(fallbackStyles),
      stylesByTheme: mockStylesByTheme,
      styleTargetsByTheme: mockStyleTargetsByTheme,
      activeTheme
    };
  }

  const payload = await fmFetch<{
    response?: Record<string, unknown>;
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      normalizedLayoutName
    )}`,
    {
      method: "GET"
    }
  );

  const response = payload.response;
  const themes = new Set<string>(fallbackThemes);
  const stylesByTheme = new Map<string, Set<string>>();
  const styleTargetsByTheme: Record<string, Record<string, string[]>> = {};
  const activeThemeCandidates: string[] = [];
  const activeThemeStyles = new Set<string>();

  for (const themeName of fallbackThemes) {
    ensureStylesByThemeEntry(stylesByTheme, themeName, fallbackStyles);
  }

  if (installedThemeCatalog) {
    for (const themeName of installedThemeCatalog.themeNames) {
      const resolvedThemeName = themeName.trim();
      if (!resolvedThemeName) {
        continue;
      }
      themes.add(resolvedThemeName);
      const themeStyles = installedThemeCatalog.stylesByTheme[resolvedThemeName] ?? ["Default"];
      ensureStylesByThemeEntry(stylesByTheme, resolvedThemeName, themeStyles);
      styleTargetsByTheme[resolvedThemeName] = installedThemeCatalog.styleTargetsByTheme?.[resolvedThemeName] ?? {};
    }
  }

  if (response && typeof response === "object") {
    const layoutMetaData = response.layoutMetaData;
    if (layoutMetaData && typeof layoutMetaData === "object" && !Array.isArray(layoutMetaData)) {
      const meta = layoutMetaData as Record<string, unknown>;
      const themeCandidates = [toCleanString(meta.theme), toCleanString(meta.themeName), toCleanString(meta.layoutTheme)];
      for (const candidate of themeCandidates) {
        const resolved = findMatchingThemeName(candidate, themes);
        if (!resolved) {
          continue;
        }
        themes.add(resolved);
        ensureStylesByThemeEntry(stylesByTheme, resolved, fallbackStyles);
        activeThemeCandidates.push(resolved);
      }

      pushNamedOption(activeThemeStyles, meta.style);
      pushNamedOption(activeThemeStyles, meta.styleName);

      if (Array.isArray(meta.styles)) {
        for (const entry of meta.styles) {
          pushNamedOption(activeThemeStyles, entry);
        }
      }
    }

    const fieldMetaData = response.fieldMetaData;
    if (Array.isArray(fieldMetaData)) {
      for (const entry of fieldMetaData) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const candidate = entry as Record<string, unknown>;
        pushNamedOption(activeThemeStyles, candidate.style);
        pushNamedOption(activeThemeStyles, candidate.styleName);
        pushNamedOption(activeThemeStyles, candidate.textStyle);
      }
    }
  }

  const sortedThemes = sortCaseInsensitive([...themes]);
  if (sortedThemes.length === 0) {
    sortedThemes.push(...fallbackThemes);
  }

  let activeTheme =
    activeThemeCandidates.find((candidate) => candidate.trim().length > 0) ??
    findMatchingThemeName(fallbackThemes[0], sortedThemes) ??
    sortedThemes[0] ??
    fallbackThemes[0];
  activeTheme = findMatchingThemeName(activeTheme, sortedThemes) || fallbackThemes[0];

  const selectedThemeStyles = ensureStylesByThemeEntry(stylesByTheme, activeTheme, fallbackStyles);
  if (activeThemeStyles.size > 0) {
    for (const style of activeThemeStyles) {
      selectedThemeStyles.add(style);
    }
  }

  const serializedStylesByTheme: Record<string, string[]> = {};
  const serializedStyleTargetsByTheme: Record<string, Record<string, string[]>> = {};
  for (const themeName of sortedThemes) {
    const list = stylesByTheme.get(themeName);
    serializedStylesByTheme[themeName] = normalizeStyleList(list ? [...list] : ["Default"]);
    serializedStyleTargetsByTheme[themeName] = styleTargetsByTheme[themeName] ?? {};
  }

  const sortedStyles = serializedStylesByTheme[activeTheme] ?? normalizeStyleList(fallbackStyles);
  return {
    source: "filemaker",
    themes: sortedThemes,
    styles: sortedStyles,
    stylesByTheme: serializedStylesByTheme,
    styleTargetsByTheme: serializedStyleTargetsByTheme,
    activeTheme
  };
}

export async function createRecord(
  tableOccurrence: string,
  fieldData: Record<string, unknown>,
  context?: FileMakerContext
): Promise<FMRecord> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    return createMockRecord(tableOccurrence, fieldData, context?.workspaceId);
  }

  const payload = await fmFetch<{
    response: {
      recordId: string;
      modId: string;
    };
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      tableOccurrence
    )}/records`,
    {
      method: "POST",
      body: JSON.stringify({
        fieldData
      })
    }
  );

  return {
    recordId: payload.response.recordId,
    modId: payload.response.modId,
    ...fieldData
  };
}

export async function updateRecord(
  tableOccurrence: string,
  recordId: string,
  fieldData: Record<string, unknown>,
  context?: FileMakerContext & {
    portalData?: Record<string, Array<Record<string, unknown>>>;
    modId?: string;
  }
): Promise<FMRecord> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    return updateMockRecord(tableOccurrence, recordId, fieldData, context?.workspaceId);
  }

  const updatePayload: Record<string, unknown> = {};
  const normalizedFieldData = fieldData ?? {};
  if (Object.keys(normalizedFieldData).length > 0) {
    updatePayload.fieldData = normalizedFieldData;
  }
  if (context?.portalData && Object.keys(context.portalData).length > 0) {
    updatePayload.portalData = context.portalData;
  }
  const normalizedModId = String(context?.modId ?? "").trim();
  if (normalizedModId) {
    updatePayload.modId = normalizedModId;
  }
  if (Object.keys(updatePayload).length === 0) {
    updatePayload.fieldData = {};
  }

  await fmFetch(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      tableOccurrence
    )}/records/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updatePayload)
    }
  );

  return {
    recordId,
    ...fieldData
  };
}

export async function uploadContainerField(
  tableOccurrence: string,
  recordId: string,
  fieldName: string,
  payload: {
    fileName: string;
    mimeType?: string;
    data: ArrayBuffer;
  },
  context?: FileMakerContext
): Promise<{ source: "mock" | "filemaker" }> {
  const env = readEnv(context);
  const normalizedFieldName = fieldName.trim();
  const safeFileName = payload.fileName.trim() || "upload.bin";
  const mimeType = payload.mimeType?.trim() || "application/octet-stream";

  if (!normalizedFieldName) {
    throw new Error("Container field name is required");
  }

  if (!hasRealConfig(env)) {
    await updateMockRecord(tableOccurrence, recordId, {
      [normalizedFieldName]: safeFileName
    }, context?.workspaceId);
    return { source: "mock" };
  }

  const makeBody = () => {
    const body = new FormData();
    body.append("upload", new Blob([payload.data], { type: mimeType }), safeFileName);
    return body;
  };

  const key = tokenCacheKey(env);
  const endpoint = `${hostBase(env.host)}/fmi/data/vLatest/databases/${encodeURIComponent(
    env.database
  )}/layouts/${encodeURIComponent(tableOccurrence)}/records/${encodeURIComponent(
    recordId
  )}/containers/${encodeURIComponent(normalizedFieldName)}/1`;

  const uploadWithToken = async () => {
    const token = await getToken(env);
    return fmHttpFetch(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: makeBody()
      },
      "FileMaker container upload"
    );
  };

  let response = await uploadWithToken();
  if (response.status === 401) {
    delete tokenCache[key];
    response = await uploadWithToken();
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `Failed to upload container: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`
    );
  }

  return { source: "filemaker" };
}

export async function deleteRecord(
  tableOccurrence: string,
  recordId: string,
  context?: FileMakerContext
): Promise<void> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    await deleteMockRecord(tableOccurrence, recordId, context?.workspaceId);
    return;
  }

  await fmFetch(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      tableOccurrence
    )}/records/${encodeURIComponent(recordId)}`,
    {
      method: "DELETE"
    }
  );
}

export async function getAvailableScripts(
  context?: FileMakerContext
): Promise<{ source: "mock" | "filemaker"; scripts: string[] }> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    return {
      source: "mock",
      scripts: ["DeleteCurrentRecord", "GoToRelatedRecord", "RefreshCustomerScore"]
    };
  }

  const payload = await fmFetch<{
    response?: {
      scripts?: unknown;
    };
  }>(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/scripts`,
    {
      method: "GET"
    }
  );

  const names = new Set<string>();
  const collectScriptNames = (entry: unknown): void => {
    if (!entry) {
      return;
    }

    if (typeof entry === "string") {
      const normalized = entry.trim();
      if (normalized && normalized !== "-") {
        names.add(normalized);
      }
      return;
    }

    if (typeof entry !== "object") {
      return;
    }

    const candidate = entry as Record<string, unknown>;
    const name =
      (typeof candidate.name === "string" && candidate.name) ||
      (typeof candidate.scriptName === "string" && candidate.scriptName) ||
      (typeof candidate.script === "string" && candidate.script) ||
      "";
    const isFolder = candidate.isFolder === true;
    if (name && name !== "-" && !isFolder) {
      names.add(name);
    }

    const nestedScriptNames = candidate.folderScriptNames;
    if (Array.isArray(nestedScriptNames)) {
      for (const nested of nestedScriptNames) {
        collectScriptNames(nested);
      }
    }

    const nestedScripts = candidate.scripts;
    if (Array.isArray(nestedScripts)) {
      for (const nested of nestedScripts) {
        collectScriptNames(nested);
      }
    }
  };

  const scripts = payload.response?.scripts;
  if (Array.isArray(scripts)) {
    for (const script of scripts) {
      collectScriptNames(script);
    }
  }

  return {
    source: "filemaker",
    scripts: [...names].sort((a, b) => a.localeCompare(b))
  };
}

export async function runScript(
  tableOccurrence: string,
  script: string,
  parameter?: string,
  context?: FileMakerContext
): Promise<{ success: boolean; source: "filemaker" | "mock" }> {
  const env = readEnv(context);

  if (!hasRealConfig(env)) {
    return { success: true, source: "mock" };
  }

  await fmFetch(
    env,
    `/fmi/data/vLatest/databases/${encodeURIComponent(env.database)}/layouts/${encodeURIComponent(
      tableOccurrence
    )}/script/${encodeURIComponent(script)}${
      parameter ? `?script.param=${encodeURIComponent(parameter)}` : ""
    }`,
    {
      method: "GET"
    }
  );

  return { success: true, source: "filemaker" };
}

export function isUsingMockData(context?: FileMakerContext): boolean {
  return !hasRealConfig(readEnv(context));
}
