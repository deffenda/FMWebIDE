import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type ActionCoverage = {
  exact: Set<string>;
  startsWith: Set<string>;
};

function loadFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function extractTopMenuCalls(source: string): Set<string> {
  const calls = new Set<string>();
  const callPattern = /handleTopMenubarAction\((["'`])([^"'`]+)\1\)/g;
  let match = callPattern.exec(source);
  while (match) {
    const raw = (match[2] ?? "").trim();
    if (raw.length > 0) {
      const variableMarkerIndex = raw.indexOf("${");
      calls.add(variableMarkerIndex >= 0 ? raw.slice(0, variableMarkerIndex) : raw);
    }
    match = callPattern.exec(source);
  }
  return calls;
}

function extractActionCoverage(source: string): ActionCoverage {
  const exact = new Set<string>();
  const startsWith = new Set<string>();

  const exactPattern = /actionId\s*===\s*["']([^"']+)["']/g;
  let exactMatch = exactPattern.exec(source);
  while (exactMatch) {
    const token = (exactMatch[1] ?? "").trim();
    if (token) {
      exact.add(token);
    }
    exactMatch = exactPattern.exec(source);
  }

  const startsWithPattern = /actionId\.startsWith\(\s*["']([^"']+)["']\s*\)/g;
  let startsWithMatch = startsWithPattern.exec(source);
  while (startsWithMatch) {
    const token = (startsWithMatch[1] ?? "").trim();
    if (token) {
      startsWith.add(token);
    }
    startsWithMatch = startsWithPattern.exec(source);
  }

  return { exact, startsWith };
}

function isActionHandled(actionId: string, coverage: ActionCoverage): boolean {
  if (coverage.exact.has(actionId)) {
    return true;
  }
  for (const prefix of coverage.startsWith) {
    if (actionId.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function extractFunctionBlock(source: string, functionToken: string): string {
  const tokenIndex = source.indexOf(functionToken);
  assert.notEqual(tokenIndex, -1, `Could not find ${functionToken}`);
  const openBraceIndex = source.indexOf("{", tokenIndex);
  assert.notEqual(openBraceIndex, -1, `Could not find opening brace for ${functionToken}`);

  let depth = 1;
  for (let index = openBraceIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(tokenIndex, index + 1);
      }
    }
  }

  throw new Error(`Unterminated function block for ${functionToken}`);
}

function assertTopMenuActionsHandled(filePath: string): void {
  const source = loadFile(filePath);
  const calls = extractTopMenuCalls(source);
  const coverage = extractActionCoverage(source);
  // Calls may include template-string prefixes (e.g. "scripts-run:${...}").
  // `isActionHandled` accounts for those by matching startsWith handlers too.
  const missing = [...calls].filter((actionId) => !isActionHandled(actionId, coverage));
  assert.deepEqual(missing, [], `${path.basename(filePath)} has unhandled top menubar actions: ${missing.join(", ")}`);
}

function assertNoTopMenuStubMessage(filePath: string): void {
  const source = loadFile(filePath);
  const block = extractFunctionBlock(source, "const handleTopMenubarAction");
  assert.equal(
    block.includes("not implemented yet"),
    false,
    `${path.basename(filePath)} top menubar handler still has \"not implemented yet\" messaging`
  );
}

test("layout-mode top menubar calls are handled", () => {
  const layoutModePath = path.resolve(process.cwd(), "components/layout-mode.tsx");
  assertTopMenuActionsHandled(layoutModePath);
  assertNoTopMenuStubMessage(layoutModePath);
});

test("browse-mode top menubar calls are handled", () => {
  const browseModePath = path.resolve(process.cwd(), "components/browse-mode.tsx");
  assertTopMenuActionsHandled(browseModePath);
  assertNoTopMenuStubMessage(browseModePath);
});
