#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_DDR_PATH = "/Users/deffenda/Downloads/Assets.xml";
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "data", "ddr-inspector-mapping-report.json");

function readAsXml(rawBuffer) {
  const utf16Candidate = rawBuffer.toString("utf16le");
  if (utf16Candidate.includes("<FMSaveAsXML")) {
    return utf16Candidate.charCodeAt(0) === 0xfeff ? utf16Candidate.slice(1) : utf16Candidate;
  }
  const utf8Candidate = rawBuffer.toString("utf8");
  return utf8Candidate.charCodeAt(0) === 0xfeff ? utf8Candidate.slice(1) : utf8Candidate;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(tag) {
  const attrs = {};
  const pattern = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let match = pattern.exec(tag);
  while (match) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
    match = pattern.exec(tag);
  }
  return attrs;
}

function findTopLevelTagBlocks(xml, tagName) {
  const tokenPattern = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}>`, "g");
  const blocks = [];
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

function firstMatchValue(xml, pattern, group = 1) {
  const match = xml.match(pattern);
  return match ? decodeXmlEntities(match[group] ?? "") : "";
}

function pushSample(target, value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    return;
  }
  if (!target.includes(cleaned) && target.length < 5) {
    target.push(cleaned);
  }
}

const inspectorPropBySemantic = {
  "LayoutObject.type": [{ prop: "type", tab: "system" }],
  "LayoutObject.name": [{ prop: "label", tab: "data" }],
  "Bounds.top": [{ prop: "position.y", tab: "position" }],
  "Bounds.left": [{ prop: "position.x", tab: "position" }],
  "Bounds.bottom": [{ prop: "position.height", tab: "position" }],
  "Bounds.right": [{ prop: "position.width", tab: "position" }],
  "TabOrder.Location": [{ prop: "tabOrder", tab: "position" }],
  "FieldReference.name": [{ prop: "binding.field", tab: "data" }],
  "FieldReference.TableOccurrenceReference.name": [{ prop: "binding.tableOccurrence", tab: "data" }],
  "FieldReference.repetition": [{ prop: "repetitionsFrom", tab: "data" }],
  "Display.Style": [{ prop: "controlType", tab: "data" }],
  "Display.show": [{ prop: "repetitionsTo", tab: "data" }],
  "Placeholder.Text": [{ prop: "placeholder", tab: "data" }],
  "Placeholder.findMode": [{ prop: "showPlaceholderInFindMode", tab: "data" }],
  "Usage.inputMode": [{ prop: "inputMethod", tab: "data" }],
  "Usage.type": [{ prop: "keyboardType", tab: "data" }],
  "ValueListReference.name": [{ prop: "valueList", tab: "data" }],
  "Tooltip.Calculation.Text": [{ prop: "tooltip", tab: "position" }],
  "LocalCSS.displayName": [{ prop: "styleName", tab: "styles" }],
  "LocalCSS.name": [{ prop: "styleName", tab: "styles" }],
  "Portal.TableOccurrenceReference.name": [{ prop: "binding.tableOccurrence", tab: "data" }],
  "Portal.Options.index": [{ prop: "portalInitialRow", tab: "data" }],
  "Portal.Options.show": [{ prop: "repetitionsTo", tab: "data" }],
  "Portal.FieldReference.name": [{ prop: "portalRowFields", tab: "data" }],
  "ScriptReference.name": [{ prop: "events.onClick.script", tab: "data" }],
  "action.Step.name": [{ prop: "events.onClick.action", tab: "data" }],
  "action.Step.LayoutReference.name": [{ prop: "events.onClick.layoutName", tab: "data" }],
  "action.Calculation.Text": [{ prop: "events.onClick.parameter", tab: "data" }],
  "WebViewer.Calculation.Text": [{ prop: "webViewerUrlTemplate", tab: "data" }],
  "Condition.Options=5.Calculation.Text": [{ prop: "hideObjectWhen", tab: "position" }],
  "Part.type": [{ prop: "parts[].type", tab: "layout" }],
  "Part.Definition.size": [{ prop: "parts[].height", tab: "layout" }],
  "Part.Definition.absolute": [{ prop: "parts[].absolute", tab: "layout" }],
  "Part.Definition.FieldReference.name": [{ prop: "parts[].sortByField", tab: "layout" }]
};

function createSemanticAccumulator() {
  return new Map(
    Object.keys(inspectorPropBySemantic).map((semanticKey) => [
      semanticKey,
      {
        count: 0,
        samples: []
      }
    ])
  );
}

function bumpSemantic(accumulator, semanticKey, value) {
  const entry = accumulator.get(semanticKey);
  if (!entry) {
    return;
  }
  entry.count += 1;
  pushSample(entry.samples, value);
}

async function main() {
  const ddrPath = process.argv[2] || process.env.DDR_PATH || DEFAULT_DDR_PATH;
  const outputPath = process.argv[3] || process.env.DDR_INSPECTOR_REPORT_PATH || DEFAULT_OUTPUT_PATH;

  const raw = await fs.readFile(ddrPath);
  const xml = readAsXml(raw);
  const layoutCatalog = firstMatchValue(xml, /<LayoutCatalog\b[\s\S]*?<\/LayoutCatalog>/i, 0);
  if (!layoutCatalog) {
    throw new Error("Unable to find LayoutCatalog in DDR.");
  }

  const layouts = findTopLevelTagBlocks(layoutCatalog, "Layout");
  const semantic = createSemanticAccumulator();
  const layoutObjectAttrs = new Map();
  const nestedTagAttrs = new Map();
  let layoutObjectCount = 0;

  for (const layoutBlock of layouts) {
    const layoutAttrs = parseAttributes(layoutBlock.startTag);
    const isFolder = layoutAttrs.isFolder === "True";
    const isSeparator = layoutAttrs.isSeparatorItem === "True";
    if (isFolder || isSeparator) {
      continue;
    }

    const objectBlocks = findTopLevelTagBlocks(layoutBlock.full, "LayoutObject");
    for (const block of objectBlocks) {
      layoutObjectCount += 1;
      const attrs = parseAttributes(block.startTag);
      for (const [name, value] of Object.entries(attrs)) {
        const key = `LayoutObject.${name}`;
        if (!layoutObjectAttrs.has(key)) {
          layoutObjectAttrs.set(key, { count: 0, samples: [] });
        }
        const entry = layoutObjectAttrs.get(key);
        entry.count += 1;
        pushSample(entry.samples, value);
      }

      bumpSemantic(semantic, "LayoutObject.type", attrs.type ?? "");
      bumpSemantic(semantic, "LayoutObject.name", attrs.name ?? "");

      const inspectTag = (tagName, attrNamePrefix = tagName) => {
        for (const match of block.full.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))) {
          const tag = match[0];
          const tagAttrs = parseAttributes(tag);
          for (const [name, value] of Object.entries(tagAttrs)) {
            const key = `${attrNamePrefix}.${name}`;
            if (!nestedTagAttrs.has(key)) {
              nestedTagAttrs.set(key, { count: 0, samples: [] });
            }
            const entry = nestedTagAttrs.get(key);
            entry.count += 1;
            pushSample(entry.samples, value);
          }
        }
      };

      inspectTag("Bounds");
      inspectTag("Display");
      inspectTag("Placeholder");
      inspectTag("Usage");
      inspectTag("LocalCSS");
      inspectTag("TabOrder");
      inspectTag("Location", "TabOrder.Location");
      inspectTag("FieldReference");
      inspectTag("TableOccurrenceReference", "FieldReference.TableOccurrenceReference");
      inspectTag("ValueListReference");
      inspectTag("ScriptReference");
      inspectTag("Options", "Options");

      const tooltipCalc = firstMatchValue(
        block.full,
        /<Tooltip>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Calculation>[\s\S]*?<\/Tooltip>/i
      );
      if (tooltipCalc.trim()) {
        bumpSemantic(semantic, "Tooltip.Calculation.Text", tooltipCalc);
      }

      const placeholderCalc = firstMatchValue(
        block.full,
        /<Placeholder\b[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Calculation>[\s\S]*?<\/Placeholder>/i
      );
      if (placeholderCalc.trim()) {
        bumpSemantic(semantic, "Placeholder.Text", placeholderCalc);
      }

      const webViewerCalc = firstMatchValue(
        block.full,
        /<WebViewer>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Calculation>[\s\S]*?<\/WebViewer>/i
      );
      if (webViewerCalc.trim()) {
        bumpSemantic(semantic, "WebViewer.Calculation.Text", webViewerCalc);
      }

      const portalTableOccurrence = firstMatchValue(
        block.full,
        /<Portal\b[\s\S]*?<TableOccurrenceReference\b[^>]*name="([^"]+)"/i
      );
      if (portalTableOccurrence.trim()) {
        bumpSemantic(semantic, "Portal.TableOccurrenceReference.name", portalTableOccurrence);
      }

      const portalIndex = firstMatchValue(block.full, /<Portal\b[\s\S]*?<Options\b[^>]*index="([^"]+)"/i);
      if (portalIndex.trim()) {
        bumpSemantic(semantic, "Portal.Options.index", portalIndex);
      }
      const portalShow = firstMatchValue(block.full, /<Portal\b[\s\S]*?<Options\b[^>]*show="([^"]+)"/i);
      if (portalShow.trim()) {
        bumpSemantic(semantic, "Portal.Options.show", portalShow);
      }

      const actionStepName = firstMatchValue(block.full, /<action>[\s\S]*?<Step\b[^>]*name="([^"]+)"/i);
      if (actionStepName.trim()) {
        bumpSemantic(semantic, "action.Step.name", actionStepName);
      }
      const actionStepLayoutName = firstMatchValue(
        block.full,
        /<action>[\s\S]*?<Step\b[\s\S]*?<LayoutReference\b[^>]*name="([^"]+)"/i
      );
      if (actionStepLayoutName.trim()) {
        bumpSemantic(semantic, "action.Step.LayoutReference.name", actionStepLayoutName);
      }
      const actionCalc = firstMatchValue(
        block.full,
        /<action>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>/i
      );
      if (actionCalc.trim()) {
        bumpSemantic(semantic, "action.Calculation.Text", actionCalc);
      }

      for (const match of block.full.matchAll(/<Portal\b[\s\S]*?<FieldReference\b[^>]*name="([^"]+)"/gi)) {
        bumpSemantic(semantic, "Portal.FieldReference.name", match[1]);
      }

      const conditionBlocks = [...block.full.matchAll(/<Condition\b[\s\S]*?<\/Condition>/gi)];
      for (const conditionEntry of conditionBlocks) {
        const conditionXml = conditionEntry[0];
        const optionsValue = firstMatchValue(conditionXml, /<Options\b[^>]*>([^<]+)<\/Options>/i).trim();
        const calc = firstMatchValue(
          conditionXml,
          /<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Calculation>/i
        );
        if (optionsValue === "5" && calc.trim()) {
          bumpSemantic(semantic, "Condition.Options=5.Calculation.Text", calc);
        }
      }

      const fieldRefName = firstMatchValue(block.full, /<FieldReference\b[^>]*name="([^"]+)"/i);
      if (fieldRefName.trim()) {
        bumpSemantic(semantic, "FieldReference.name", fieldRefName);
      }
      const fieldRefTO = firstMatchValue(
        block.full,
        /<FieldReference\b[\s\S]*?<TableOccurrenceReference\b[^>]*name="([^"]+)"/i
      );
      if (fieldRefTO.trim()) {
        bumpSemantic(semantic, "FieldReference.TableOccurrenceReference.name", fieldRefTO);
      }
      const fieldRefRepetition = firstMatchValue(block.full, /<FieldReference\b[^>]*repetition="([^"]+)"/i);
      if (fieldRefRepetition.trim()) {
        bumpSemantic(semantic, "FieldReference.repetition", fieldRefRepetition);
      }
      const displayStyle = firstMatchValue(block.full, /<Display\b[^>]*Style="([^"]+)"/i);
      if (displayStyle.trim()) {
        bumpSemantic(semantic, "Display.Style", displayStyle);
      }
      const displayShow = firstMatchValue(block.full, /<Display\b[^>]*show="([^"]+)"/i);
      if (displayShow.trim()) {
        bumpSemantic(semantic, "Display.show", displayShow);
      }
      const findMode = firstMatchValue(block.full, /<Placeholder\b[^>]*findMode="([^"]+)"/i);
      if (findMode.trim()) {
        bumpSemantic(semantic, "Placeholder.findMode", findMode);
      }
      const inputMode = firstMatchValue(block.full, /<Usage\b[^>]*inputMode="([^"]+)"/i);
      if (inputMode.trim()) {
        bumpSemantic(semantic, "Usage.inputMode", inputMode);
      }
      const usageType = firstMatchValue(block.full, /<Usage\b[^>]*type="([^"]+)"/i);
      if (usageType.trim()) {
        bumpSemantic(semantic, "Usage.type", usageType);
      }
      const valueListName = firstMatchValue(block.full, /<ValueListReference\b[^>]*name="([^"]+)"/i);
      if (valueListName.trim()) {
        bumpSemantic(semantic, "ValueListReference.name", valueListName);
      }
      const scriptName = firstMatchValue(block.full, /<ScriptReference\b[^>]*name="([^"]+)"/i);
      if (scriptName.trim()) {
        bumpSemantic(semantic, "ScriptReference.name", scriptName);
      }
      const styleDisplayName = firstMatchValue(block.full, /<LocalCSS\b[^>]*displayName="([^"]*)"/i);
      if (styleDisplayName.trim()) {
        bumpSemantic(semantic, "LocalCSS.displayName", styleDisplayName);
      }
      const styleName = firstMatchValue(block.full, /<LocalCSS\b[^>]*name="([^"]*)"/i);
      if (styleName.trim()) {
        bumpSemantic(semantic, "LocalCSS.name", styleName);
      }
      const tabOrderLocation = firstMatchValue(block.full, /<TabOrder\b[\s\S]*?<Location\b[^>]*>([^<]+)<\/Location>/i);
      if (tabOrderLocation.trim()) {
        bumpSemantic(semantic, "TabOrder.Location", tabOrderLocation);
      }
      const boundsTag = firstMatchValue(block.full, /<Bounds\b[^>]*>/i, 0);
      if (boundsTag) {
        const boundsAttrs = parseAttributes(boundsTag);
        if (boundsAttrs.top) {
          bumpSemantic(semantic, "Bounds.top", boundsAttrs.top);
        }
        if (boundsAttrs.left) {
          bumpSemantic(semantic, "Bounds.left", boundsAttrs.left);
        }
        if (boundsAttrs.bottom) {
          bumpSemantic(semantic, "Bounds.bottom", boundsAttrs.bottom);
        }
        if (boundsAttrs.right) {
          bumpSemantic(semantic, "Bounds.right", boundsAttrs.right);
        }
      }
    }

    const partsList = firstMatchValue(layoutBlock.full, /<PartsList\b[\s\S]*?<\/PartsList>/i, 0);
    if (partsList) {
      const partBlocks = findTopLevelTagBlocks(partsList, "Part");
      for (const partBlock of partBlocks) {
        const partAttrs = parseAttributes(partBlock.startTag);
        if ((partAttrs.type ?? "").trim()) {
          bumpSemantic(semantic, "Part.type", partAttrs.type ?? "");
        }

        const definitionTag = firstMatchValue(partBlock.full, /<Definition\b[^>]*>/i, 0);
        if (definitionTag) {
          const definitionAttrs = parseAttributes(definitionTag);
          if ((definitionAttrs.size ?? "").trim()) {
            bumpSemantic(semantic, "Part.Definition.size", definitionAttrs.size ?? "");
          }
          if ((definitionAttrs.absolute ?? "").trim()) {
            bumpSemantic(semantic, "Part.Definition.absolute", definitionAttrs.absolute ?? "");
          }
        }

        const sortByField = firstMatchValue(
          partBlock.full,
          /<Definition\b[\s\S]*?<FieldReference\b[^>]*name="([^"]+)"/i
        );
        if (sortByField.trim()) {
          bumpSemantic(semantic, "Part.Definition.FieldReference.name", sortByField);
        }
      }
    }
  }

  const semanticRows = [...semantic.entries()].map(([semanticKey, value]) => {
    const mapping = inspectorPropBySemantic[semanticKey] ?? [];
    return {
      semanticKey,
      count: value.count,
      samples: value.samples,
      mappedTo: mapping
    };
  });

  const missingSemantics = semanticRows.filter((row) => row.count > 0 && row.mappedTo.length === 0);
  const report = {
    generatedAt: new Date().toISOString(),
    ddrPath,
    totals: {
      layoutObjectCount,
      semanticKeysDetected: semanticRows.filter((row) => row.count > 0).length,
      semanticKeysMapped: semanticRows.filter((row) => row.count > 0 && row.mappedTo.length > 0).length,
      semanticKeysMissing: missingSemantics.length
    },
    semanticCoverage: semanticRows
      .filter((row) => row.count > 0)
      .sort((a, b) => a.semanticKey.localeCompare(b.semanticKey)),
    missingSemantics,
    observedLayoutObjectAttributes: [...layoutObjectAttrs.entries()]
      .map(([attribute, entry]) => ({
        attribute,
        count: entry.count,
        samples: entry.samples
      }))
      .sort((a, b) => a.attribute.localeCompare(b.attribute)),
    observedNestedAttributes: [...nestedTagAttrs.entries()]
      .map(([attribute, entry]) => ({
        attribute,
        count: entry.count,
        samples: entry.samples
      }))
      .sort((a, b) => a.attribute.localeCompare(b.attribute))
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote DDR inspector mapping report: ${outputPath}`);
  console.log(
    `Detected ${report.totals.semanticKeysDetected} semantic key(s); mapped ${report.totals.semanticKeysMapped}; missing ${report.totals.semanticKeysMissing}.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
