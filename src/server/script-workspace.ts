import { promises as fs } from "node:fs";
import { getAvailableScripts } from "@/src/server/filemaker-client";
import { normalizeWorkspaceId, readWorkspaceConfig } from "@/src/server/workspace-context";

type ScriptCatalogTagBlock = {
  start: number;
  end: number;
  full: string;
  inner: string;
  startTag: string;
};

type ScriptWorkspaceSource = "ddr" | "filemaker" | "mock";
type StepCatalogSource = "claris-help" | "fallback";

export type ScriptWorkspaceStep = {
  id: string;
  name: string;
  text: string;
  enabled: boolean;
};

export type ScriptWorkspaceScript = {
  id: string;
  name: string;
  folderPath: string[];
  includeInMenu: boolean;
  runFullAccess: boolean;
  steps: ScriptWorkspaceStep[];
};

export type ScriptWorkspaceFolder = {
  id: string;
  name: string;
  collapsed: boolean;
  folders: ScriptWorkspaceFolder[];
  scriptIds: string[];
};

export type ScriptWorkspaceStepGroup = {
  id: string;
  label: string;
  steps: string[];
  source: "catalog" | "ddr";
};

export type ScriptWorkspacePayload = {
  workspaceId: string;
  source: ScriptWorkspaceSource;
  databaseName: string;
  scripts: ScriptWorkspaceScript[];
  rootFolders: ScriptWorkspaceFolder[];
  ungroupedScriptIds: string[];
  stepCatalogSource: StepCatalogSource;
  stepGroups: ScriptWorkspaceStepGroup[];
};

type ScriptStepCatalogGroup = {
  id: string;
  label: string;
  steps: string[];
};

const SCRIPT_STEP_CATEGORY_PAGES: Array<{ id: string; label: string; page: string }> = [
  { id: "control", label: "Control", page: "control-script-steps.html" },
  { id: "navigation", label: "Navigation", page: "navigation-script-steps.html" },
  { id: "editing", label: "Editing", page: "editing-script-steps.html" },
  { id: "fields", label: "Fields", page: "fields-script-steps.html" },
  { id: "records", label: "Records", page: "records-script-steps.html" },
  { id: "found-sets", label: "Found Sets", page: "found-sets-script-steps.html" },
  { id: "windows", label: "Windows", page: "windows-script-steps.html" },
  { id: "files", label: "Files", page: "files-script-steps.html" },
  { id: "accounts", label: "Accounts", page: "accounts-script-steps.html" },
  { id: "ai", label: "Artificial Intelligence", page: "artificial-intelligence-script-steps.html" },
  { id: "spelling", label: "Spelling", page: "spelling-script-steps.html" },
  { id: "open-menu-item", label: "Open Menu Item", page: "open-menu-item-script-steps.html" },
  { id: "misc", label: "Miscellaneous", page: "miscellaneous-script-steps.html" }
];

const FALLBACK_STEP_CATALOG: ScriptStepCatalogGroup[] = [
  {
    id: "favorites",
    label: "Favorites",
    steps: ["# (comment)", "If", "Set Field", "Set Variable", "Perform Script"]
  },
  {
    id: "control",
    label: "Control",
    steps: [
      "Allow User Abort",
      "Else",
      "Else If",
      "End If",
      "End Loop",
      "Exit Loop If",
      "Exit Script",
      "Halt Script",
      "If",
      "Install OnTimer Script",
      "Loop",
      "Pause/Resume Script",
      "Perform Script",
      "Perform Script On Server",
      "Set Error Capture",
      "Set Variable"
    ]
  },
  {
    id: "navigation",
    label: "Navigation",
    steps: [
      "Go to Field",
      "Go to Layout",
      "Go to Object",
      "Go to Portal Row",
      "Go to Record/Request/Page",
      "Go to Related Record",
      "New Window",
      "Refresh Object",
      "Refresh Portal",
      "Refresh Window",
      "Scroll Window",
      "Select Window"
    ]
  },
  {
    id: "editing",
    label: "Editing",
    steps: ["Copy", "Cut", "Paste", "Paste [No Style]", "Select All", "Undo/Redo", "Clear"]
  },
  {
    id: "fields",
    label: "Fields",
    steps: ["Export Field Contents", "Insert from Device", "Insert from URL", "Insert Picture", "Replace Field Contents", "Set Field"]
  },
  {
    id: "records",
    label: "Records",
    steps: [
      "Delete Record/Request",
      "Delete All Records",
      "Duplicate Record/Request",
      "Import Records",
      "New Record/Request",
      "Omit Record",
      "Omit Multiple Records",
      "Re-lookup Field Contents",
      "Revert Record/Request",
      "Show All Records"
    ]
  },
  {
    id: "found-sets",
    label: "Found Sets",
    steps: [
      "Constrain Found Set",
      "Enter Find Mode",
      "Extend Found Set",
      "Perform Find",
      "Restore Find Requests",
      "Save Records as Snapshot Link",
      "Show Omitted Only",
      "Sort Records",
      "Unsort Records"
    ]
  },
  {
    id: "windows",
    label: "Windows",
    steps: ["Arrange All Windows", "Close Window", "Freeze Window", "Move/Resize Window", "New Window", "Select Window"]
  },
  {
    id: "files",
    label: "Files",
    steps: ["Close File", "Export Records", "Open File", "Print", "Save Records as PDF", "Save Records as Excel", "Send Event"]
  },
  {
    id: "accounts",
    label: "Accounts",
    steps: ["Change Password", "Log In", "Log Out", "Re-Authenticate", "Reset Account Password", "Enable Account"]
  },
  {
    id: "ai",
    label: "Artificial Intelligence",
    steps: ["Configure AI Account", "Create Embeddings", "Generate Text", "Perform Semantic Find"]
  },
  {
    id: "spelling",
    label: "Spelling",
    steps: ["Check Spelling", "Edit Dictionary", "Spelling Options"]
  },
  {
    id: "open-menu-item",
    label: "Open Menu Item",
    steps: ["Open Menu Item", "Open Preferences", "Show/Hide Menubar", "Toggle Status Toolbar"]
  },
  {
    id: "misc",
    label: "Miscellaneous",
    steps: [
      "Allow Formatting Bar",
      "Beep",
      "Install Plug-In File",
      "Open URL",
      "Perform AppleScript",
      "Perform JavaScript in Web Viewer",
      "Set Multi-User",
      "Show Custom Dialog",
      "Speak",
      "Wait"
    ]
  }
];

let stepCatalogCache:
  | {
      expiresAt: number;
      source: StepCatalogSource;
      groups: ScriptStepCatalogGroup[];
    }
  | null = null;

function decodeXmlEntities(value: string): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#13;/g, "\n")
    .replace(/&#10;/g, "\n")
    .replace(/&#9;/g, "\t")
    .replace(/&#(\d+);/g, (_, token: string) => {
      const codePoint = Number.parseInt(token, 10);
      if (!Number.isFinite(codePoint)) {
        return "";
      }
      return String.fromCodePoint(codePoint);
    });
}

function stripHtml(value: string): string {
  return decodeXmlEntities(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return decodeXmlEntities(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let match = attrPattern.exec(tag);
  while (match) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
    match = attrPattern.exec(tag);
  }
  return attrs;
}

function firstMatchValue(xml: string, pattern: RegExp, group = 1): string {
  const match = xml.match(pattern);
  if (!match) {
    return "";
  }
  return decodeXmlEntities(match[group] ?? "");
}

function toBoolean(value: string | undefined): boolean {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "true";
}

function readAsXml(rawBuffer: Buffer): string {
  const utf16Candidate = rawBuffer.toString("utf16le");
  if (utf16Candidate.includes("<FMSaveAsXML") || utf16Candidate.includes("<FMPReport")) {
    return utf16Candidate.charCodeAt(0) === 0xfeff ? utf16Candidate.slice(1) : utf16Candidate;
  }
  const utf8Candidate = rawBuffer.toString("utf8");
  return utf8Candidate.charCodeAt(0) === 0xfeff ? utf8Candidate.slice(1) : utf8Candidate;
}

function findTopLevelTagBlocks(xml: string, tagName: string): ScriptCatalogTagBlock[] {
  const tokenPattern = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}>`, "g");
  const blocks: ScriptCatalogTagBlock[] = [];
  let depth = 0;
  let start = -1;
  let startTag = "";
  let startTagEnd = -1;

  let token = tokenPattern.exec(xml);
  while (token) {
    const value = token[0];
    const index = token.index;

    if (value.startsWith(`</${tagName}>`)) {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const end = index + value.length;
          blocks.push({
            start,
            end,
            full: xml.slice(start, end),
            inner: xml.slice(startTagEnd, index),
            startTag
          });
          start = -1;
          startTag = "";
          startTagEnd = -1;
        }
      }
      token = tokenPattern.exec(xml);
      continue;
    }

    if (depth === 0) {
      start = index;
      startTag = value;
      startTagEnd = index + value.length;
    }
    depth += 1;
    token = tokenPattern.exec(xml);
  }

  return blocks;
}

function filterTopLevelScriptBlocks(
  scriptBlocks: ScriptCatalogTagBlock[],
  groupBlocks: ScriptCatalogTagBlock[]
): ScriptCatalogTagBlock[] {
  return scriptBlocks.filter((candidate, candidateIndex) => {
    for (const group of groupBlocks) {
      if (candidate.start >= group.start && candidate.end <= group.end) {
        return false;
      }
    }

    for (let index = 0; index < scriptBlocks.length; index += 1) {
      if (index === candidateIndex) {
        continue;
      }
      const other = scriptBlocks[index];
      if (other.start < candidate.start && other.end >= candidate.end) {
        return false;
      }
    }

    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function parseScriptSteps(scriptXml: string): ScriptWorkspaceStep[] {
  const stepListBlock = firstMatchValue(scriptXml, /<StepList\b[\s\S]*?<\/StepList>/i, 0);
  if (!stepListBlock) {
    return [];
  }

  const stepBlocks = findTopLevelTagBlocks(stepListBlock, "Step");
  const steps: ScriptWorkspaceStep[] = [];

  for (let index = 0; index < stepBlocks.length; index += 1) {
    const block = stepBlocks[index];
    const attrs = parseAttributes(block.startTag);
    const stepName = attrs.name?.trim() || `Step ${index + 1}`;
    const stepText = normalizeText(firstMatchValue(block.full, /<StepText>([\s\S]*?)<\/StepText>/i));
    steps.push({
      id: `step-${attrs.id?.trim() || index + 1}-${index + 1}`,
      name: stepName,
      text: stepText || stepName,
      enabled: !attrs.enable || toBoolean(attrs.enable)
    });
  }

  return steps;
}

function makeSafeId(prefix: string, value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${normalized || "item"}`;
}

function parseScriptCatalog(xml: string): {
  scripts: ScriptWorkspaceScript[];
  rootFolders: ScriptWorkspaceFolder[];
  ungroupedScriptIds: string[];
  inUseStepNames: string[];
} {
  const scriptCatalogBlock = firstMatchValue(xml, /<ScriptCatalog\b[\s\S]*?<\/ScriptCatalog>/i, 0);
  if (!scriptCatalogBlock) {
    return {
      scripts: [],
      rootFolders: [],
      ungroupedScriptIds: [],
      inUseStepNames: []
    };
  }

  const scripts: ScriptWorkspaceScript[] = [];
  const usedScriptIds = new Set<string>();
  const usedFolderIds = new Set<string>();

  const nextScriptId = (preferred: string, fallbackName: string) => {
    let candidate = preferred.trim() || makeSafeId("script", fallbackName);
    if (!usedScriptIds.has(candidate)) {
      usedScriptIds.add(candidate);
      return candidate;
    }
    let counter = 2;
    while (usedScriptIds.has(`${candidate}-${counter}`)) {
      counter += 1;
    }
    const uniqueCandidate = `${candidate}-${counter}`;
    usedScriptIds.add(uniqueCandidate);
    return uniqueCandidate;
  };

  const nextFolderId = (preferred: string, fallbackName: string) => {
    let candidate = preferred.trim() || makeSafeId("folder", fallbackName);
    if (!usedFolderIds.has(candidate)) {
      usedFolderIds.add(candidate);
      return candidate;
    }
    let counter = 2;
    while (usedFolderIds.has(`${candidate}-${counter}`)) {
      counter += 1;
    }
    const uniqueCandidate = `${candidate}-${counter}`;
    usedFolderIds.add(uniqueCandidate);
    return uniqueCandidate;
  };

  const parseSegment = (
    segmentXml: string,
    folderPath: string[]
  ): {
    folders: ScriptWorkspaceFolder[];
    scriptIds: string[];
  } => {
    const groupBlocks = findTopLevelTagBlocks(segmentXml, "Group");
    const scriptBlocks = filterTopLevelScriptBlocks(findTopLevelTagBlocks(segmentXml, "Script"), groupBlocks);
    const orderedEntries = [
      ...groupBlocks.map((block) => ({ type: "group" as const, block })),
      ...scriptBlocks.map((block) => ({ type: "script" as const, block }))
    ].sort((a, b) => a.block.start - b.block.start);

    const folders: ScriptWorkspaceFolder[] = [];
    const scriptIds: string[] = [];

    for (const entry of orderedEntries) {
      if (entry.type === "script") {
        const attrs = parseAttributes(entry.block.startTag);
        const scriptName = attrs.name?.trim() || "Untitled Script";
        const scriptId = nextScriptId(
          attrs.id?.trim() ? `script-${attrs.id.trim()}` : "",
          `${folderPath.join("-")}-${scriptName}`
        );
        const script: ScriptWorkspaceScript = {
          id: scriptId,
          name: scriptName,
          folderPath,
          includeInMenu: toBoolean(attrs.includeInMenu),
          runFullAccess: toBoolean(attrs.runFullAccess),
          steps: parseScriptSteps(entry.block.full)
        };
        scripts.push(script);
        scriptIds.push(scriptId);
        continue;
      }

      const attrs = parseAttributes(entry.block.startTag);
      const groupName = attrs.name?.trim() || "Folder";
      const nested = parseSegment(entry.block.inner, [...folderPath, groupName]);
      const folderId = nextFolderId(
        attrs.id?.trim() ? `group-${attrs.id.trim()}` : "",
        `${folderPath.join("-")}-${groupName}`
      );
      folders.push({
        id: folderId,
        name: groupName,
        collapsed: toBoolean(attrs.groupCollapsed),
        folders: nested.folders,
        scriptIds: nested.scriptIds
      });
    }

    return { folders, scriptIds };
  };

  const parsed = parseSegment(scriptCatalogBlock, []);
  const inUseStepNames = uniqueStrings(
    scripts.flatMap((script) => script.steps.map((step) => step.name).filter((stepName) => stepName.length > 0))
  );

  return {
    scripts,
    rootFolders: parsed.folders,
    ungroupedScriptIds: parsed.scriptIds,
    inUseStepNames
  };
}

function parseCategoryStepsFromHelpHtml(html: string): string[] {
  const selectedCategoryIndex = html.indexOf("tree-node-selected");
  if (selectedCategoryIndex < 0) {
    return [];
  }

  const selectedCategoryListStart = html.indexOf("<ul class=\"'vertical menu accordion-menu'\">", selectedCategoryIndex);
  if (selectedCategoryListStart < 0) {
    return [];
  }

  const selectedCategoryListEnd = html.indexOf("</ul>", selectedCategoryListStart);
  if (selectedCategoryListEnd < 0) {
    return [];
  }

  const selectedCategoryBlock = html.slice(selectedCategoryListStart, selectedCategoryListEnd);
  const matches = selectedCategoryBlock.matchAll(
    /<li class="tree-node tree-node-preloaded">\s*<a[^>]*>([\s\S]*?)<\/a>/gi
  );

  const steps: string[] = [];
  for (const match of matches) {
    const label = stripHtml(match[1] ?? "");
    if (label) {
      steps.push(label);
    }
  }

  return uniqueStrings(steps);
}

async function fetchHelpPage(url: string): Promise<string> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 5_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "FMWebIDE/1.0 (+https://github.com)"
      },
      signal: abortController.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadLatestStepCatalog(): Promise<{ source: StepCatalogSource; groups: ScriptStepCatalogGroup[] }> {
  const now = Date.now();
  if (stepCatalogCache && stepCatalogCache.expiresAt > now) {
    return {
      source: stepCatalogCache.source,
      groups: stepCatalogCache.groups
    };
  }

  const parsedGroups: ScriptStepCatalogGroup[] = [];
  for (const category of SCRIPT_STEP_CATEGORY_PAGES) {
    try {
      const html = await fetchHelpPage(`https://help.claris.com/en/pro-help/content/${category.page}`);
      const steps = parseCategoryStepsFromHelpHtml(html);
      if (steps.length > 0) {
        parsedGroups.push({
          id: category.id,
          label: category.label,
          steps
        });
      }
    } catch {
      // Continue; we'll fallback if too many groups fail to load.
    }
  }

  if (parsedGroups.length >= 6) {
    const result = { source: "claris-help" as const, groups: parsedGroups };
    stepCatalogCache = {
      ...result,
      expiresAt: now + 6 * 60 * 60 * 1000
    };
    return result;
  }

  const fallback = { source: "fallback" as const, groups: FALLBACK_STEP_CATALOG };
  stepCatalogCache = {
    ...fallback,
    expiresAt: now + 10 * 60 * 1000
  };
  return fallback;
}

function convertStepCatalogToWorkspaceGroups(
  catalogGroups: ScriptStepCatalogGroup[],
  inUseStepNames: string[]
): ScriptWorkspaceStepGroup[] {
  const groups: ScriptWorkspaceStepGroup[] = [];
  const inUse = uniqueStrings(inUseStepNames);
  if (inUse.length > 0) {
    groups.push({
      id: "in-use-ddr",
      label: "In Use (DDR)",
      steps: inUse,
      source: "ddr"
    });
  }

  for (const group of catalogGroups) {
    groups.push({
      id: group.id,
      label: group.label,
      steps: uniqueStrings(group.steps),
      source: "catalog"
    });
  }

  return groups;
}

export async function getScriptWorkspacePayload(options?: {
  workspaceId?: string;
}): Promise<ScriptWorkspacePayload> {
  const workspaceId = normalizeWorkspaceId(options?.workspaceId);
  const workspaceConfig = await readWorkspaceConfig(workspaceId);
  const databaseName =
    workspaceConfig?.filemaker?.database?.trim() ||
    workspaceConfig?.name?.trim() ||
    workspaceId;

  const stepCatalog = await loadLatestStepCatalog();
  const ddrPath = workspaceConfig?.filemaker?.ddrPath?.trim();

  if (ddrPath) {
    try {
      const rawXmlBuffer = await fs.readFile(ddrPath);
      const xml = readAsXml(rawXmlBuffer);
      const parsed = parseScriptCatalog(xml);
      if (parsed.scripts.length > 0 || parsed.rootFolders.length > 0 || parsed.ungroupedScriptIds.length > 0) {
        return {
          workspaceId,
          source: "ddr",
          databaseName,
          scripts: parsed.scripts,
          rootFolders: parsed.rootFolders,
          ungroupedScriptIds: parsed.ungroupedScriptIds,
          stepCatalogSource: stepCatalog.source,
          stepGroups: convertStepCatalogToWorkspaceGroups(stepCatalog.groups, parsed.inUseStepNames)
        };
      }
    } catch {
      // Fall through to API script name list when DDR parse isn't available.
    }
  }

  const scriptsFromApi = await getAvailableScripts({ workspaceId });
  const scripts: ScriptWorkspaceScript[] = scriptsFromApi.scripts.map((scriptName, index) => ({
    id: `script-${index + 1}`,
    name: scriptName,
    folderPath: [],
    includeInMenu: false,
    runFullAccess: false,
    steps: []
  }));

  return {
    workspaceId,
    source: scriptsFromApi.source,
    databaseName,
    scripts,
    rootFolders: [],
    ungroupedScriptIds: scripts.map((script) => script.id),
    stepCatalogSource: stepCatalog.source,
    stepGroups: convertStepCatalogToWorkspaceGroups(stepCatalog.groups, [])
  };
}
