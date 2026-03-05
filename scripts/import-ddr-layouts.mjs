#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DDR_PATH = "/Users/deffenda/Downloads/Assets.xml";

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
  const attrPattern = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let match = attrPattern.exec(tag);
  while (match) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
    match = attrPattern.exec(tag);
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

function stripTopLevelLayoutObjects(xml) {
  const objectBlocks = findTopLevelTagBlocks(xml, "LayoutObject");
  if (objectBlocks.length === 0) {
    return xml;
  }

  let cursor = 0;
  const parts = [];
  for (const block of objectBlocks) {
    parts.push(xml.slice(cursor, block.start));
    cursor = block.end;
  }
  parts.push(xml.slice(cursor));
  return parts.join("");
}

function numberOr(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBounds(layoutObjectXml) {
  const tagMatch = layoutObjectXml.match(/<Bounds\b[^>]*>/i);
  if (!tagMatch) {
    return {
      top: 0,
      left: 0,
      bottom: 40,
      right: 200
    };
  }
  const attrs = parseAttributes(tagMatch[0]);
  return {
    top: numberOr(attrs.top, 0),
    left: numberOr(attrs.left, 0),
    bottom: numberOr(attrs.bottom, 40),
    right: numberOr(attrs.right, 200)
  };
}

function firstMatchValue(xml, pattern, group = 1) {
  const match = xml.match(pattern);
  return match ? match[group] : "";
}

function cleanQuotedCalculation(value) {
  const collapsed = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!collapsed) {
    return "";
  }
  const quoted = collapsed.match(/^"([\s\S]*)"$/);
  if (quoted) {
    return quoted[1].replace(/""/g, "\"").trim();
  }
  return collapsed;
}

function extractTooltip(layoutObjectXml) {
  const fmsaveRaw = firstMatchValue(
    layoutObjectXml,
    /<Tooltip>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Tooltip>/i
  );
  if (fmsaveRaw) {
    return cleanQuotedCalculation(fmsaveRaw);
  }

  const ddrRaw = firstMatchValue(
    layoutObjectXml,
    /<ToolTip>[\s\S]*?<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>[\s\S]*?<\/ToolTip>/i
  );
  if (ddrRaw) {
    return cleanQuotedCalculation(ddrRaw);
  }

  return "";
}

function extractPlaceholder(layoutObjectXml) {
  const fmsaveRaw = firstMatchValue(
    layoutObjectXml,
    /<Placeholder\b[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Placeholder>/i
  );
  if (fmsaveRaw) {
    return cleanQuotedCalculation(fmsaveRaw);
  }

  const ddrRaw = firstMatchValue(
    layoutObjectXml,
    /<PlaceholderText\b[\s\S]*?<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>[\s\S]*?<\/PlaceholderText>/i
  );
  if (ddrRaw) {
    return cleanQuotedCalculation(ddrRaw);
  }

  return "";
}

function extractTextLabel(layoutObjectXml) {
  const fmsaveStyledTextData = firstMatchValue(
    layoutObjectXml,
    /<Text>[\s\S]*?<StyledText>[\s\S]*?<Data><!\[CDATA\[([\s\S]*?)\]\]><\/Data>/i
  );
  if (fmsaveStyledTextData) {
    return fmsaveStyledTextData.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  const fmsaveCalcText = firstMatchValue(
    layoutObjectXml,
    /<Text>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>/i
  );
  if (fmsaveCalcText) {
    return cleanQuotedCalculation(fmsaveCalcText);
  }

  const ddrCharacterData = firstMatchValue(
    layoutObjectXml,
    /<TextObj\b[\s\S]*?<CharacterStyleVector>[\s\S]*?<Style>[\s\S]*?<Data>([\s\S]*?)<\/Data>/i
  );
  if (ddrCharacterData) {
    const decoded = decodeXmlEntities(ddrCharacterData).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (decoded) {
      return decoded;
    }
  }

  const ddrCalculationText = firstMatchValue(
    layoutObjectXml,
    /<LabelCalc>[\s\S]*?<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>[\s\S]*?<\/LabelCalc>/i
  );
  if (ddrCalculationText) {
    return cleanQuotedCalculation(ddrCalculationText);
  }

  return "";
}

function extractButtonLabel(layoutObjectXml) {
  const fmsaveStyledTextLabel = firstMatchValue(
    layoutObjectXml,
    /<Button>[\s\S]*?<Label>[\s\S]*?<StyledText>[\s\S]*?<Data><!\[CDATA\[([\s\S]*?)\]\]><\/Data>/i
  );
  if (fmsaveStyledTextLabel) {
    return fmsaveStyledTextLabel.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  const fmsavePlainTextLabel = firstMatchValue(
    layoutObjectXml,
    /<Button>[\s\S]*?<Label>[\s\S]*?<Text>[\s\S]*?<StyledText>[\s\S]*?<Data><!\[CDATA\[([\s\S]*?)\]\]><\/Data>/i
  );
  if (fmsavePlainTextLabel) {
    return fmsavePlainTextLabel.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  const fmsaveCalcLabel = firstMatchValue(
    layoutObjectXml,
    /<Button>[\s\S]*?<Label>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>/i
  );
  if (fmsaveCalcLabel) {
    return cleanQuotedCalculation(fmsaveCalcLabel);
  }

  const ddrCalcLabel = firstMatchValue(
    layoutObjectXml,
    /<LabelCalc>[\s\S]*?<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>[\s\S]*?<\/LabelCalc>/i
  );
  if (ddrCalcLabel) {
    return cleanQuotedCalculation(ddrCalcLabel);
  }

  const ddrTextLabel = extractTextLabel(layoutObjectXml);
  if (ddrTextLabel) {
    return ddrTextLabel;
  }

  return "";
}

function extractWebViewerUrl(layoutObjectXml) {
  const fmsaveCalc = firstMatchValue(
    layoutObjectXml,
    /<WebViewer>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>/i
  );
  if (fmsaveCalc) {
    const cleaned = cleanQuotedCalculation(fmsaveCalc);
    if (/^https?:\/\//i.test(cleaned)) {
      return cleaned;
    }
  }

  const ddrCalc = firstMatchValue(
    layoutObjectXml,
    /<WebViewerObj\b[\s\S]*?<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>/i
  );
  if (ddrCalc) {
    const cleaned = cleanQuotedCalculation(ddrCalc);
    if (/^https?:\/\//i.test(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function extractActionCalculation(layoutObjectXml) {
  const fmsaveRaw = firstMatchValue(
    layoutObjectXml,
    /<action>[\s\S]*?<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>/i
  );
  if (fmsaveRaw) {
    return cleanQuotedCalculation(fmsaveRaw);
  }

  const ddrRaw = firstMatchValue(
    layoutObjectXml,
    /<Step\b[\s\S]*?<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>/i
  );
  if (ddrRaw) {
    return cleanQuotedCalculation(ddrRaw);
  }

  return "";
}

function extractActionScriptName(layoutObjectXml) {
  const fmsaveName = firstMatchValue(
    layoutObjectXml,
    /<action>[\s\S]*?<ScriptReference\b[^>]*name="([^"]+)"/i
  ).trim();
  if (fmsaveName) {
    return fmsaveName;
  }
  return firstMatchValue(layoutObjectXml, /<Step\b[\s\S]*?<Script\b[^>]*name="([^"]+)"/i).trim();
}

function extractActionStepName(layoutObjectXml) {
  const fmsaveName = firstMatchValue(
    layoutObjectXml,
    /<action>[\s\S]*?<Step\b[^>]*name="([^"]+)"/i
  ).trim();
  if (fmsaveName) {
    return fmsaveName;
  }
  return firstMatchValue(layoutObjectXml, /<Step\b[^>]*name="([^"]+)"/i).trim();
}

function extractActionGoToLayoutName(layoutObjectXml) {
  const fmsaveName = firstMatchValue(
    layoutObjectXml,
    /<action>[\s\S]*?<Step\b[\s\S]*?<LayoutReference\b[^>]*name="([^"]+)"/i
  ).trim();
  if (fmsaveName) {
    return fmsaveName;
  }
  return firstMatchValue(layoutObjectXml, /<Step\b[\s\S]*?<Layout\b[^>]*name="([^"]+)"/i).trim();
}

function extractOnClickEvent(layoutObjectXml) {
  const stepName = extractActionStepName(layoutObjectXml).toLowerCase();
  if (stepName === "go to layout") {
    const layoutName = extractActionGoToLayoutName(layoutObjectXml);
    return {
      action: "goToLayout",
      layoutName: layoutName || undefined
    };
  }
  if (stepName === "delete portal row") {
    return {
      action: "deletePortalRow"
    };
  }

  const scriptName = extractActionScriptName(layoutObjectXml);
  if (!scriptName) {
    return undefined;
  }

  const parameter = extractActionCalculation(layoutObjectXml);
  return {
    action: "runScript",
    script: scriptName,
    parameter: parameter || undefined
  };
}

function extractValueListName(layoutObjectXml) {
  const fmsaveValueList = firstMatchValue(layoutObjectXml, /<ValueListReference\b[^>]*name="([^"]+)"/i).trim();
  if (fmsaveValueList) {
    return fmsaveValueList;
  }
  const ddrValueList = firstMatchValue(layoutObjectXml, /<FieldObj\b[\s\S]*?<ValueList>([^<]+)<\/ValueList>/i).trim();
  if (ddrValueList) {
    return decodeXmlEntities(ddrValueList).trim();
  }
  return firstMatchValue(layoutObjectXml, /<DDRInfo\b[\s\S]*?<ValueList\b[^>]*name="([^"]+)"/i).trim();
}

function extractFieldBinding(layoutObjectXml) {
  const fieldRef = layoutObjectXml.match(/<FieldReference\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/FieldReference>/i);
  if (fieldRef) {
    const field = decodeXmlEntities(fieldRef[1]).trim();
    const inner = fieldRef[2];
    const tableOccurrence = firstMatchValue(inner, /<TableOccurrenceReference\b[^>]*name="([^"]+)"/i).trim();
    return {
      field,
      tableOccurrence
    };
  }

  const ddrFieldNameRef = firstMatchValue(layoutObjectXml, /<FieldObj\b[\s\S]*?<Name>([^<]+)<\/Name>/i).trim();
  if (ddrFieldNameRef) {
    const decoded = decodeXmlEntities(ddrFieldNameRef);
    const split = decoded.split("::");
    if (split.length >= 2) {
      const tableOccurrence = split.shift()?.trim() ?? "";
      const field = split.join("::").trim();
      if (field) {
        return {
          field,
          tableOccurrence
        };
      }
    }
  }

  const ddrFieldName = firstMatchValue(layoutObjectXml, /<DDRInfo\b[\s\S]*?<Field\b[^>]*name="([^"]+)"/i).trim();
  const ddrTableOccurrence = firstMatchValue(
    layoutObjectXml,
    /<DDRInfo\b[\s\S]*?<Field\b[^>]*table="([^"]+)"/i
  ).trim();
  return {
    field: ddrFieldName,
    tableOccurrence: ddrTableOccurrence
  };
}

function extractStyleName(layoutObjectXml) {
  const fromFmsave = firstMatchValue(layoutObjectXml, /<LocalCSS\b[^>]*displayName="([^"]*)"/i).trim();
  if (fromFmsave) {
    return fromFmsave;
  }
  const fromDdr = firstMatchValue(layoutObjectXml, /<Styles\b[\s\S]*?<CustomStyles>[\s\S]*?<Name>([^<]*)<\/Name>/i).trim();
  return decodeXmlEntities(fromDdr);
}

function extractTabOrder(layoutObjectXml) {
  const rawValue = firstMatchValue(
    layoutObjectXml,
    /<TabOrder\b[\s\S]*?<Location\b[^>]*>([^<]+)<\/Location>/i
  ).trim();
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractFieldDisplayStyle(layoutObjectXml) {
  const fmsaveStyleValue = firstMatchValue(
    layoutObjectXml,
    /<Display\b[^>]*\bStyle="([^"]+)"/i
  ).trim();
  if (fmsaveStyleValue) {
    const parsed = Number.parseInt(fmsaveStyleValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const ddrStyleValue = firstMatchValue(layoutObjectXml, /<FieldObj\b[^>]*\bdisplayType="([^"]+)"/i).trim();
  const parsed = Number.parseInt(ddrStyleValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFieldDisplayRepetitions(layoutObjectXml) {
  const showValue = firstMatchValue(
    layoutObjectXml,
    /<Display\b[^>]*\bshow="([^"]+)"/i
  ).trim();
  if (showValue) {
    const parsed = Number.parseInt(showValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const ddrValue = firstMatchValue(layoutObjectXml, /<FieldObj\b[^>]*\bnumOfReps="([^"]+)"/i).trim();
  const parsed = Number.parseInt(ddrValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function extractFieldReferenceRepetition(layoutObjectXml) {
  const repetitionValue = firstMatchValue(
    layoutObjectXml,
    /<FieldReference\b[^>]*\brepetition="([^"]+)"/i
  ).trim();
  if (repetitionValue) {
    const parsed = Number.parseInt(repetitionValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const ddrValue = firstMatchValue(layoutObjectXml, /<DDRInfo\b[\s\S]*?<Field\b[^>]*repetition="([^"]+)"/i).trim();
  const parsed = Number.parseInt(ddrValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function extractPlaceholderFindMode(layoutObjectXml) {
  return /<Placeholder\b[^>]*\bfindMode="True"/i.test(layoutObjectXml)
    || /<PlaceholderText\b[^>]*\bfindMode="True"/i.test(layoutObjectXml);
}

function extractUsageInputMode(layoutObjectXml) {
  const fmsaveMode = firstMatchValue(
    layoutObjectXml,
    /<Usage\b[^>]*\binputMode="([^"]+)"/i
  ).trim();
  const ddrMode = firstMatchValue(layoutObjectXml, /<FieldObj\b[^>]*\binputMode="([^"]+)"/i).trim();
  const mode = fmsaveMode || ddrMode;
  if (!mode) {
    return "";
  }
  if (mode === "0") {
    return "Automatic";
  }
  if (mode === "1") {
    return "ASCII";
  }
  if (mode === "2") {
    return "Native";
  }
  return `Mode ${mode}`;
}

function extractUsageType(layoutObjectXml) {
  const fmsaveType = firstMatchValue(
    layoutObjectXml,
    /<Usage\b[^>]*\btype="([^"]+)"/i
  ).trim();
  const ddrType = firstMatchValue(layoutObjectXml, /<FieldObj\b[^>]*\bkeyboardType="([^"]+)"/i).trim();
  const type = fmsaveType || ddrType;
  if (!type) {
    return "";
  }
  if (type === "0" || type === "1") {
    return "Default for Data Type";
  }
  if (type === "2") {
    return "Number Pad";
  }
  if (type === "3") {
    return "Email";
  }
  if (type === "4") {
    return "URL";
  }
  return `Type ${type}`;
}

function extractHideObjectWhenCalculation(layoutObjectXml) {
  const conditionBlocks = [...layoutObjectXml.matchAll(/<Condition\b[\s\S]*?<\/Condition>/gi)];
  for (const entry of conditionBlocks) {
    const conditionXml = entry[0];
    const rawOptions = firstMatchValue(conditionXml, /<Options\b[^>]*>([^<]*)<\/Options>/i).trim();
    const optionsValue = Number.parseInt(rawOptions, 10);
    // DDR option 5 represents "Hide object when" in this file's exported conditions.
    if (Number.isFinite(optionsValue) && optionsValue !== 5) {
      continue;
    }
    const calculation = firstMatchValue(
      conditionXml,
      /<Calculation>[\s\S]*?<Text><!\[CDATA\[([\s\S]*?)\]\]><\/Text>[\s\S]*?<\/Calculation>/i
    );
    const ddrCalculation = firstMatchValue(
      conditionXml,
      /<Calculation><!\[CDATA\[([\s\S]*?)\]\]><\/Calculation>/i
    );
    const cleaned = cleanQuotedCalculation(calculation || ddrCalculation);
    if (cleaned) {
      return cleaned;
    }
  }
  return "";
}

function extractIncludeInQuickFind(layoutObjectXml) {
  const ddrQuickFind = firstMatchValue(layoutObjectXml, /<FieldObj\b[^>]*\bquickFind="([^"]+)"/i).trim();
  if (!ddrQuickFind) {
    return undefined;
  }
  return ddrQuickFind !== "0";
}

function controlTypeFromDisplayStyle(style, objectType) {
  if (style === 6) {
    return "date";
  }
  if (style === 4) {
    return "radio";
  }
  if (style === 3) {
    return "checkbox";
  }
  if (style === 2) {
    return "popup";
  }
  if (style === 1) {
    return "dropdown";
  }
  if (style === 7) {
    return "concealed";
  }
  const normalized = objectType.toLowerCase();
  if (normalized.includes("calendar") || normalized.includes("date")) {
    return "date";
  }
  if (normalized.includes("radio")) {
    return "radio";
  }
  if (normalized.includes("checkbox")) {
    return "checkbox";
  }
  if (normalized.includes("drop-down") || normalized.includes("dropdown")) {
    return "dropdown";
  }
  if (normalized.includes("pop-up") || normalized.includes("popup")) {
    return "popup";
  }
  if (normalized.includes("concealed")) {
    return "concealed";
  }
  return "text";
}

function shapeTypeFromObjectType(objectType) {
  const normalized = objectType
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "line") {
    return "line";
  }
  if (normalized === "rectangle") {
    return "rectangle";
  }
  if (
    normalized === "rounded rectangle" ||
    normalized === "round rectangle"
  ) {
    return "roundedRectangle";
  }
  if (normalized === "oval" || normalized === "circle") {
    return "oval";
  }
  return "";
}

function extractPortalTableOccurrence(layoutObjectXml) {
  const fmsaveTableOccurrence = firstMatchValue(
    layoutObjectXml,
    /<Portal\b[\s\S]*?<TableOccurrenceReference\b[^>]*name="([^"]+)"/i
  ).trim();
  if (fmsaveTableOccurrence) {
    return fmsaveTableOccurrence;
  }

  const ddrAlias = firstMatchValue(layoutObjectXml, /<PortalObj\b[\s\S]*?<TableAliasKey>([^<]+)<\/TableAliasKey>/i).trim();
  if (ddrAlias) {
    return decodeXmlEntities(ddrAlias).trim();
  }

  return firstMatchValue(layoutObjectXml, /<PortalObj\b[\s\S]*?<FieldList>\s*<Field\b[^>]*table="([^"]+)"/i).trim();
}

function detectLayoutObjectTagName(xml) {
  if (/<LayoutObject\b/i.test(xml)) {
    return "LayoutObject";
  }
  if (/<Object\b/i.test(xml)) {
    return "Object";
  }
  return "LayoutObject";
}

function extractPortalRowFields(layoutObjectXml) {
  const fmsavePortalBlock = firstMatchValue(layoutObjectXml, /<Portal\b[\s\S]*?<\/Portal>/i, 0);
  const ddrPortalBlock = firstMatchValue(layoutObjectXml, /<PortalObj\b[\s\S]*?<\/PortalObj>/i, 0);
  const portalBlock = fmsavePortalBlock || ddrPortalBlock || layoutObjectXml;

  const ddrFieldList = [...portalBlock.matchAll(/<Field\b[^>]*name="([^"]+)"/gi)]
    .map((entry) => decodeXmlEntities(entry[1] ?? "").trim())
    .filter((entry) => entry.length > 0);
  if (ddrFieldList.length > 0) {
    const deduped = [];
    const seen = new Set();
    for (const name of ddrFieldList) {
      const token = name.toLowerCase();
      if (seen.has(token)) {
        continue;
      }
      seen.add(token);
      deduped.push(name);
    }
    if (deduped.length > 0) {
      return deduped;
    }
  }

  const collectedRows = [];
  const objectTagName = detectLayoutObjectTagName(portalBlock);
  function walkPortalObjects(xml, parentOffsetLeft, parentOffsetTop) {
    const objectBlocks = findTopLevelTagBlocks(xml, objectTagName);
    for (const block of objectBlocks) {
      const attrs = parseAttributes(block.startTag);
      const objectType = attrs.type?.trim() || "";
      const bounds = parseBounds(block.full);
      const absoluteLeft = parentOffsetLeft + bounds.left;
      const absoluteTop = parentOffsetTop + bounds.top;
      const binding = extractFieldBinding(block.full);
      if (binding.field) {
        collectedRows.push({
          field: binding.field,
          left: absoluteLeft,
          top: absoluteTop,
          index: collectedRows.length
        });
      }
      if (!shouldSkipChildTraversal(objectType)) {
        walkPortalObjects(block.inner, absoluteLeft, absoluteTop);
      }
    }
  }
  walkPortalObjects(portalBlock, 0, 0);

  if (collectedRows.length > 0) {
    collectedRows.sort((left, right) => {
      const verticalDelta = left.top - right.top;
      if (Math.abs(verticalDelta) > 0.5) {
        return verticalDelta;
      }
      const horizontalDelta = left.left - right.left;
      if (Math.abs(horizontalDelta) > 0.5) {
        return horizontalDelta;
      }
      return left.index - right.index;
    });

    const names = [];
    const seen = new Set();
    for (const row of collectedRows) {
      const name = row.field.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) {
        continue;
      }
      seen.add(key);
      names.push(name);
    }
    if (names.length > 0) {
      return names;
    }
  }

  const names = [];
  const seen = new Set();
  const fieldRefPattern = /<FieldReference\b[^>]*name="([^"]+)"/gi;
  let match = fieldRefPattern.exec(portalBlock);
  while (match) {
    const name = decodeXmlEntities(match[1]).trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
    match = fieldRefPattern.exec(portalBlock);
  }
  return names;
}

function extractPortalDisplayOptions(layoutObjectXml) {
  const optionsTag = firstMatchValue(
    layoutObjectXml,
    /<Portal\b[\s\S]*?<Options\b[^>]*>/i,
    0
  );
  if (optionsTag) {
    const attrs = parseAttributes(optionsTag);
    const initialRow = Number.parseInt(attrs.index ?? "", 10);
    const rows = Number.parseInt(attrs.show ?? "", 10);
    return {
      initialRow: Number.isFinite(initialRow) && initialRow > 0 ? initialRow : 1,
      rows: Number.isFinite(rows) && rows > 0 ? rows : 6
    };
  }

  const portalObjTag = firstMatchValue(layoutObjectXml, /<PortalObj\b[^>]*>/i, 0);
  const attrs = portalObjTag ? parseAttributes(portalObjTag) : {};
  const initialRow = Number.parseInt(attrs.initialRow ?? "", 10);
  const rows = Number.parseInt(attrs.numOfRows ?? "", 10);
  return {
    initialRow: Number.isFinite(initialRow) && initialRow > 0 ? initialRow : 1,
    rows: Number.isFinite(rows) && rows > 0 ? rows : 6
  };
}

function shouldSkipChildTraversal(objectType, options = {}) {
  const normalized = objectType.toLowerCase();
  const includePortalChildren = options.includePortalChildren === true;
  return normalized === "portal" && !includePortalChildren;
}

function normalizeObjectTypeToken(objectType) {
  return objectType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGroupId(layoutId, pathSegments) {
  const tail = pathSegments.join("-");
  const safeTail = tail.replace(/[^A-Za-z0-9-]/g, "-");
  return `ddr-group-${layoutId}-${safeTail}`;
}

function isLayoutObjectGroupContainer({
  objectType,
  childCount,
  layoutObjectXml
}) {
  if (childCount <= 0) {
    return false;
  }

  const normalizedType = normalizeObjectTypeToken(objectType);
  if (!normalizedType) {
    return false;
  }

  // Explicit DDR group wrappers should always be treated as groups.
  if (
    normalizedType === "group" ||
    normalizedType === "object group" ||
    normalizedType === "button bar" ||
    /<Group\b/i.test(layoutObjectXml) ||
    /<ObjectGroup\b/i.test(layoutObjectXml)
  ) {
    return true;
  }

  // Known container nodes are not object groups.
  const knownContainers = new Set(["portal", "tab control", "slide control", "popover"]);
  if (knownContainers.has(normalizedType)) {
    return false;
  }

  // Known renderable node types are not groups even when they contain nested data.
  const knownRenderableTypes = new Set([
    "button",
    "group button",
    "popover button",
    "text",
    "field",
    "edit box",
    "drop down list",
    "drop down calendar",
    "pop up menu",
    "pop up list",
    "checkbox set",
    "radio button set",
    "container",
    "rectangle",
    "rounded rectangle",
    "round rectangle",
    "oval",
    "line",
    "web viewer",
    "chart"
  ]);
  if (knownRenderableTypes.has(normalizedType)) {
    return false;
  }

  // Heuristic fallback: unknown wrapper with children is likely a grouped-object container.
  return true;
}

function toSlug(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "layout";
}

function baseLayoutIdForFileMakerLayout(fileMakerLayoutName, key) {
  const slug = toSlug(fileMakerLayoutName).slice(0, 48);
  const hash = Buffer.from(key).toString("base64url").slice(0, 8);
  return `fm-${slug}-${hash}`;
}

function formatThemeName(themeToken) {
  if (!themeToken) {
    return "Universal Touch";
  }
  const tail = themeToken.includes(".") ? themeToken.split(".").pop() : themeToken;
  return tail
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeComponentId(layoutId, pathSegments) {
  const tail = pathSegments.join("-");
  const safeTail = tail.replace(/[^A-Za-z0-9-]/g, "-");
  return `ddr-${layoutId}-${safeTail}`;
}

function componentFromLayoutObject({
  layoutId,
  layoutTheme,
  pathSegments,
  objectType,
  objectName,
  objectAttrs,
  absoluteBounds,
  layoutObjectXml,
  portalContext
}) {
  const { field, tableOccurrence } = extractFieldBinding(layoutObjectXml);
  const placeholder = extractPlaceholder(layoutObjectXml);
  const tooltip = extractTooltip(layoutObjectXml);
  const styleName = extractStyleName(layoutObjectXml);
  const valueList = extractValueListName(layoutObjectXml);
  const textLabel = extractTextLabel(layoutObjectXml);
  const buttonLabel = extractButtonLabel(layoutObjectXml);
  const onClickEvent = extractOnClickEvent(layoutObjectXml);
  const webViewerUrl = extractWebViewerUrl(layoutObjectXml);
  const fieldDisplayStyle = extractFieldDisplayStyle(layoutObjectXml);
  const fieldDisplayRepetitions = extractFieldDisplayRepetitions(layoutObjectXml);
  const fieldReferenceRepetition = extractFieldReferenceRepetition(layoutObjectXml);
  const tabOrder = extractTabOrder(layoutObjectXml);
  const showPlaceholderInFindMode = extractPlaceholderFindMode(layoutObjectXml);
  const usageInputMode = extractUsageInputMode(layoutObjectXml);
  const usageType = extractUsageType(layoutObjectXml);
  const hideObjectWhen = extractHideObjectWhenCalculation(layoutObjectXml);
  const includeInQuickFind = extractIncludeInQuickFind(layoutObjectXml);
  const scriptEvent = onClickEvent
    ? {
        onClick: onClickEvent
      }
    : undefined;

  const componentId = normalizeComponentId(layoutId, pathSegments);
  const width = Math.max(8, Math.round(absoluteBounds.right - absoluteBounds.left));
  const height = Math.max(8, Math.round(absoluteBounds.bottom - absoluteBounds.top));
  const normalizedType = normalizeObjectTypeToken(objectType);
  const rotation = Number.parseFloat(String(objectAttrs?.rotation ?? ""));
  const locked = String(objectAttrs?.locked ?? "").trim().toLowerCase() === "true";
  const portalParentComponentId = portalContext?.componentId?.trim() || "";
  const portalParentDdrPath = portalContext?.ddrObjectPath?.trim() || "";
  const portalParentTableOccurrence = portalContext?.tableOccurrence?.trim() || "";

  const baseComponent = {
    id: componentId,
    position: {
      x: Math.max(0, Math.round(absoluteBounds.left)),
      y: Math.max(0, Math.round(absoluteBounds.top)),
      width,
      height,
      z: 0
    },
    props: {
      tooltip: tooltip || undefined,
      hideObjectWhen: hideObjectWhen || undefined,
      styleTheme: layoutTheme || undefined,
      styleName: styleName || undefined,
      ddrObjectPath: pathSegments.join(".") || undefined,
      portalParentComponentId:
        normalizedType !== "portal" && portalParentComponentId ? portalParentComponentId : undefined,
      portalParentDdrPath:
        normalizedType !== "portal" && portalParentDdrPath ? portalParentDdrPath : undefined,
      portalParentTableOccurrence:
        normalizedType !== "portal" && portalParentTableOccurrence ? portalParentTableOccurrence : undefined,
      tabOrder,
      locked: locked || undefined,
      rotation: Number.isFinite(rotation) ? rotation : undefined
    }
  };

  if (normalizedType === "button bar") {
    return {
      ...baseComponent,
      type: "button",
      props: {
        ...baseComponent.props,
        label: buttonLabel || objectName || "Button Bar",
        buttonMode: "bar",
        variant: "secondary"
      },
      events: scriptEvent
    };
  }

  const shapeType = shapeTypeFromObjectType(objectType);
  if (shapeType) {
    return {
      ...baseComponent,
      type: "shape",
      props: {
        ...baseComponent.props,
        label: "",
        shapeType,
        fillType: shapeType === "line" ? "none" : "solid",
        fillColor: shapeType === "line" ? "transparent" : "#ffffff",
        lineStyle: "solid",
        lineWidth: shapeType === "line" ? 2 : 1,
        lineColor: "#94a3b8",
        cornerRadius: shapeType === "roundedRectangle" ? 12 : 0
      },
      events: scriptEvent
    };
  }

  if (normalizedType === "portal") {
    const portalTableOccurrence = extractPortalTableOccurrence(layoutObjectXml);
    const portalRowFields = extractPortalRowFields(layoutObjectXml);
    const portalDisplayOptions = extractPortalDisplayOptions(layoutObjectXml);
    return {
      ...baseComponent,
      type: "portal",
      binding: {
        tableOccurrence: portalTableOccurrence || undefined
      },
      props: {
        ...baseComponent.props,
        label: objectName || "Portal",
        portalSortRecords: false,
        portalFilterRecords: false,
        portalFilterCalculation: "",
        portalAllowDelete: false,
        portalAllowVerticalScrolling: true,
        portalScrollBar: "always",
        portalResetScrollOnExit: false,
        portalInitialRow: portalDisplayOptions.initialRow,
        repetitionsFrom: 1,
        repetitionsTo: portalDisplayOptions.rows,
        portalUseAlternateRowState: false,
        portalUseActiveRowState: true,
        portalRowFields
      },
      events: scriptEvent
    };
  }

  const isFieldType =
    Boolean(field) ||
    normalizedType === "field" ||
    normalizedType === "edit box" ||
    normalizedType === "drop down list" ||
    normalizedType === "drop-down list" ||
    normalizedType === "drop down calendar" ||
    normalizedType === "drop-down calendar" ||
    normalizedType === "pop up menu" ||
    normalizedType === "pop-up menu" ||
    normalizedType === "pop up list" ||
    normalizedType === "pop-up list" ||
    normalizedType === "checkbox set" ||
    normalizedType === "radio button set" ||
    normalizedType === "container";

  if (normalizedType === "web viewer") {
    return {
      ...baseComponent,
      type: "webViewer",
      props: {
        ...baseComponent.props,
        label: objectName || "Web Viewer",
        webViewerUrlTemplate: webViewerUrl || "about:blank"
      },
      events: scriptEvent
    };
  }

  if (normalizedType === "button" || normalizedType === "group button" || normalizedType === "popover button") {
    const label = buttonLabel || objectName || tooltip || "Button";
    return {
      ...baseComponent,
      type: "button",
      props: {
        ...baseComponent.props,
        label,
        variant: "secondary"
      },
      events: scriptEvent
    };
  }

  if (normalizedType === "text") {
    const label = textLabel || objectName || "Text";
    return {
      ...baseComponent,
      type: "label",
      props: {
        ...baseComponent.props,
        label
      },
      events: scriptEvent
    };
  }

  if (isFieldType && field) {
    const isContainerObject = normalizedType === "container";
    return {
      ...baseComponent,
      type: "field",
      binding: {
        field,
        tableOccurrence: tableOccurrence || portalParentTableOccurrence || undefined
      },
      props: {
        ...baseComponent.props,
        label: "",
        labelPlacement: "none",
        placeholder: placeholder || field,
        controlType: controlTypeFromDisplayStyle(fieldDisplayStyle, objectType),
        valueList: valueList || undefined,
        showPlaceholderInFindMode,
        repetitionsFrom: fieldReferenceRepetition ?? 1,
        repetitionsTo: fieldDisplayRepetitions ?? 1,
        inputMethod: usageInputMode || undefined,
        keyboardType: usageType || undefined,
        includeInQuickFind: isContainerObject ? false : includeInQuickFind,
        containerFormat: isContainerObject ? "reduceToFit" : undefined,
        containerMaintainProportions: isContainerObject ? true : undefined,
        containerAlignHorizontal: isContainerObject ? "center" : undefined,
        containerAlignVertical: isContainerObject ? "middle" : undefined,
        containerOptimizeFor: isContainerObject ? "images" : undefined
      },
      events: scriptEvent
    };
  }

  const fallbackLabel = objectName ? `${objectType}: ${objectName}` : `[${objectType}]`;
  return {
    ...baseComponent,
    type: "label",
    props: {
      ...baseComponent.props,
      label: fallbackLabel
    },
    events: scriptEvent
  };
}

function collectLayoutComponents(layoutBlock, layoutId, layoutTheme) {
  const components = [];
  let arrangeOrderCounter = 1;
  const objectTagName = detectLayoutObjectTagName(layoutBlock.inner);

  function walk(xml, parentOffsetX, parentOffsetY, pathPrefix, inheritedGroupId, inheritedPortalContext) {
    const objectBlocks = findTopLevelTagBlocks(xml, objectTagName);
    for (let index = 0; index < objectBlocks.length; index += 1) {
      const block = objectBlocks[index];
      const attrs = parseAttributes(block.startTag);
      const objectType = attrs.type?.trim() || "Unknown";
      const normalizedObjectType = normalizeObjectTypeToken(objectType);
      const objectName = attrs.name?.trim() || "";
      const objectId = attrs.id?.trim() || attrs.key?.trim() || String(index + 1);
      const pathSegments = [...pathPrefix, objectId];
      const childLayoutObjects = findTopLevelTagBlocks(block.inner, objectTagName);
      const bounds = parseBounds(block.full);
      const absoluteBounds = {
        left: parentOffsetX + bounds.left,
        top: parentOffsetY + bounds.top,
        right: parentOffsetX + bounds.right,
        bottom: parentOffsetY + bounds.bottom
      };
      const groupForChildren = isLayoutObjectGroupContainer({
        objectType,
        childCount: childLayoutObjects.length,
        layoutObjectXml: block.full
      })
        ? normalizeGroupId(layoutId, pathSegments)
        : undefined;
      const suppressComponentForGroupContainer = Boolean(groupForChildren);
      const portalContextForComponent =
        normalizedObjectType === "portal" ? inheritedPortalContext : inheritedPortalContext;
      const portalContextForChildren =
        normalizedObjectType === "portal"
          ? {
              componentId: normalizeComponentId(layoutId, pathSegments),
              ddrObjectPath: pathSegments.join("."),
              tableOccurrence:
                extractPortalTableOccurrence(block.full).trim() ||
                inheritedPortalContext?.tableOccurrence?.trim() ||
                ""
            }
          : inheritedPortalContext;

      const component = suppressComponentForGroupContainer
        ? null
        : componentFromLayoutObject({
            layoutId,
            layoutTheme,
            pathSegments,
            objectType,
            objectName,
            objectAttrs: attrs,
            absoluteBounds,
            layoutObjectXml: block.full,
            portalContext: portalContextForComponent
          });
      if (component) {
        if (inheritedGroupId) {
          component.props.groupId = inheritedGroupId;
        }
        const arrangeOrder = arrangeOrderCounter;
        component.position.z = arrangeOrder;
        component.props.ddrArrangeOrder = arrangeOrder;
        arrangeOrderCounter += 1;
        components.push(component);
      }

      if (!shouldSkipChildTraversal(objectType, { includePortalChildren: true })) {
        const nextGroupId = groupForChildren || inheritedGroupId;
        walk(
          block.inner,
          absoluteBounds.left,
          absoluteBounds.top,
          pathSegments,
          nextGroupId,
          portalContextForChildren
        );
      }
    }
  }

  walk(layoutBlock.inner, 0, 0, [], undefined, undefined);
  return components;
}

function maxLayoutBounds(layoutBlock) {
  let maxRight = 0;
  let maxBottom = 0;

  const boundsPattern = /<Bounds\b[^>]*>/g;
  let match = boundsPattern.exec(layoutBlock.full);
  while (match) {
    const attrs = parseAttributes(match[0]);
    maxRight = Math.max(maxRight, numberOr(attrs.right, 0));
    maxBottom = Math.max(maxBottom, numberOr(attrs.bottom, 0));
    match = boundsPattern.exec(layoutBlock.full);
  }

  const partDefPattern = /<Definition\b[^>]*size="([^"]+)"[^>]*absolute="([^"]+)"/g;
  let part = partDefPattern.exec(layoutBlock.full);
  while (part) {
    maxBottom = Math.max(maxBottom, numberOr(part[1], 0) + numberOr(part[2], 0));
    part = partDefPattern.exec(layoutBlock.full);
  }

  return { maxRight, maxBottom };
}

function normalizePartType(partTypeToken) {
  const normalized = partTypeToken
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  if (normalized === "top navigation") {
    return "topNavigation";
  }
  if (normalized === "title header") {
    return "titleHeader";
  }
  if (normalized === "header") {
    return "header";
  }
  if (normalized === "leading grand summary") {
    return "leadingGrandSummary";
  }
  if (normalized.startsWith("sub summary")) {
    return "subSummary";
  }
  if (normalized === "body") {
    return "body";
  }
  if (normalized === "trailing grand summary") {
    return "trailingGrandSummary";
  }
  if (normalized === "footer") {
    return "footer";
  }
  if (normalized === "title footer") {
    return "titleFooter";
  }
  if (normalized === "bottom navigation") {
    return "bottomNavigation";
  }
  return "";
}

function defaultPartLabel(partType, sortByField) {
  if (partType === "topNavigation") {
    return "Top Navigation";
  }
  if (partType === "titleHeader") {
    return "Title Header";
  }
  if (partType === "header") {
    return "Header";
  }
  if (partType === "leadingGrandSummary") {
    return "Leading Grand Summary";
  }
  if (partType === "subSummary") {
    return sortByField ? `Sub-summary (${sortByField})` : "Sub-summary";
  }
  if (partType === "body") {
    return "Body";
  }
  if (partType === "trailingGrandSummary") {
    return "Trailing Grand Summary";
  }
  if (partType === "footer") {
    return "Footer";
  }
  if (partType === "titleFooter") {
    return "Title Footer";
  }
  if (partType === "bottomNavigation") {
    return "Bottom Navigation";
  }
  return "Part";
}

function extractLayoutParts(layoutBlock, layoutId) {
  const partsListBlock = firstMatchValue(layoutBlock.full, /<PartsList\b[\s\S]*?<\/PartsList>/i, 0);
  if (!partsListBlock) {
    return [];
  }

  const partBlocks = findTopLevelTagBlocks(partsListBlock, "Part");
  if (partBlocks.length === 0) {
    return [];
  }

  const extracted = [];
  for (let index = 0; index < partBlocks.length; index += 1) {
    const partBlock = partBlocks[index];
    const partAttrs = parseAttributes(partBlock.startTag);
    const partTypeToken = (partAttrs.type ?? "").trim();
    const partType = normalizePartType(partTypeToken);
    if (!partType) {
      continue;
    }

    const definitionTag = firstMatchValue(partBlock.full, /<Definition\b[^>]*>/i, 0);
    const definitionAttrs = definitionTag ? parseAttributes(definitionTag) : {};
    const height = Math.max(20, Math.round(numberOr(definitionAttrs.size, 20)));
    const absolute = Math.max(0, Math.round(numberOr(definitionAttrs.absolute, index * 20)));
    const sortByField = firstMatchValue(
      partBlock.full,
      /<Definition\b[\s\S]*?<FieldReference\b[^>]*name="([^"]+)"/i
    ).trim();

    extracted.push({
      absolute,
      index,
      part: {
        id: `ddr-part-${layoutId}-${index + 1}`,
        type: partType,
        label: defaultPartLabel(partType, sortByField),
        height,
        sortByField: partType === "subSummary" ? (sortByField || undefined) : undefined,
        pageBreakBeforeEachOccurrence: false,
        pageBreakAfterEveryOccurrences: null,
        restartPageNumbersAfterEachOccurrence: false,
        allowPartToBreakAcrossPageBoundaries: false,
        discardRemainderBeforeNewPage: false,
        useAlternateRowState: false,
        useActiveRowState: partType === "body"
      }
    });
  }

  return extracted
    .sort((left, right) => {
      if (left.absolute !== right.absolute) {
        return left.absolute - right.absolute;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.part);
}

export function inferDatabaseScope(xml) {
  const saveAsXmlFile = firstMatchValue(xml, /<FMSaveAsXML\b[^>]*\bFile="([^"]+)"/i).trim();
  if (saveAsXmlFile) {
    return saveAsXmlFile.replace(/\.fmp12$/i, "").trim() || "default";
  }
  const ddrFile = firstMatchValue(xml, /<File\b[^>]*\bname="([^"]+)"/i).trim();
  if (ddrFile) {
    return ddrFile.replace(/\.fmp12$/i, "").trim() || "default";
  }
  return "default";
}

export function inferSourceFileName(xml) {
  const saveAsXmlFile = firstMatchValue(xml, /<FMSaveAsXML\b[^>]*\bFile="([^"]+)"/i).trim();
  if (saveAsXmlFile) {
    return saveAsXmlFile;
  }
  return firstMatchValue(xml, /<File\b[^>]*\bname="([^"]+)"/i).trim();
}

export function readAsXml(rawBuffer) {
  const utf16Candidate = rawBuffer.toString("utf16le");
  if (utf16Candidate.includes("<FMSaveAsXML") || utf16Candidate.includes("<FMPReport")) {
    return utf16Candidate.charCodeAt(0) === 0xfeff ? utf16Candidate.slice(1) : utf16Candidate;
  }
  const utf8Candidate = rawBuffer.toString("utf8");
  return utf8Candidate.charCodeAt(0) === 0xfeff ? utf8Candidate.slice(1) : utf8Candidate;
}

function normalizeWorkspaceId(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "default";
}

export function normalizeDatabaseToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.fmp12$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeHostHint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const cleaned = raw.replace(/^["']|["']$/g, "").trim();
  if (!cleaned) {
    return "";
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned.replace(/\/+$/, "");
  }

  const fmProtocol = cleaned.match(/^(?:fmnet|fmp):\/+([^/\s?#:]+(?::\d+)?)/i);
  if (fmProtocol) {
    return `https://${fmProtocol[1]}`;
  }

  const token = cleaned.split(/[/?#]/)[0].trim();
  if (!token || /^[a-z]:$/i.test(token)) {
    return "";
  }

  if (token === "localhost" || /^[\w.-]+\.[a-z]{2,}$/i.test(token) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(token)) {
    return `https://${token}`;
  }

  return "";
}

export function extractHostHintFromXml(xml) {
  const candidates = [
    firstMatchValue(xml, /<FMPReport\b[^>]*\bpath="([^"]+)"/i),
    firstMatchValue(xml, /<File\b[^>]*\bpath="([^"]+)"/i),
    firstMatchValue(xml, /<FileReference\b[^>]*\bpath="([^"]+)"/i)
  ];

  for (const candidate of candidates) {
    const host = normalizeHostHint(candidate);
    if (host) {
      return host;
    }
  }

  return "";
}

export function parseSummaryFileEntries(summaryXml, summaryPath, workspacePrefix) {
  const summaryDir = path.dirname(summaryPath);
  const fileTagPattern = /<File\b[^>]*>/gi;
  const entries = [];
  const seenByPath = new Set();

  let match = fileTagPattern.exec(summaryXml);
  while (match) {
    const attrs = parseAttributes(match[0]);
    const linkToken = String(attrs.link ?? "").trim();
    const fileName = String(attrs.name ?? "").trim();
    if (!linkToken && !fileName) {
      match = fileTagPattern.exec(summaryXml);
      continue;
    }

    const cleanedLink = linkToken.replace(/^\.\/+/, "").replace(/^\/+/, "");
    const fallbackName = fileName ? fileName.replace(/\.fmp12$/i, "_fmp12.xml") : "";
    const relativeCandidate = cleanedLink || fallbackName;
    if (!relativeCandidate) {
      match = fileTagPattern.exec(summaryXml);
      continue;
    }

    const resolvedPath = path.resolve(summaryDir, relativeCandidate);
    const normalizedPath = path.normalize(resolvedPath);
    if (seenByPath.has(normalizedPath)) {
      match = fileTagPattern.exec(summaryXml);
      continue;
    }
    seenByPath.add(normalizedPath);

    const databaseName = fileName.replace(/\.fmp12$/i, "").trim() || path.basename(relativeCandidate).replace(/_fmp12\.xml$/i, "");
    const baseWorkspaceId = normalizeWorkspaceId(databaseName);
    const workspaceId = workspacePrefix
      ? normalizeWorkspaceId(`${workspacePrefix}-${baseWorkspaceId}`)
      : baseWorkspaceId;

    entries.push({
      ddrPath: normalizedPath,
      fileName,
      databaseName,
      workspaceId,
      hostHint: normalizeHostHint(attrs.path)
    });

    match = fileTagPattern.exec(summaryXml);
  }

  return entries;
}

function extractFileReferenceNames(xml) {
  const names = [];
  const seen = new Set();
  const pattern = /<FileReference\b[^>]*\bname="([^"]+)"/gi;
  let match = pattern.exec(xml);
  while (match) {
    const name = decodeXmlEntities(match[1] ?? "").trim();
    const token = normalizeDatabaseToken(name);
    if (!name || !token || seen.has(token)) {
      match = pattern.exec(xml);
      continue;
    }
    seen.add(token);
    names.push(name);
    match = pattern.exec(xml);
  }
  return names;
}

function resolveDependencyWorkspaceIds({
  fileReferenceNames,
  workspaceByDatabaseToken,
  currentWorkspaceId
}) {
  const deps = [];
  const seen = new Set();
  for (const name of fileReferenceNames) {
    const token = normalizeDatabaseToken(name);
    if (!token) {
      continue;
    }
    const workspaceId = workspaceByDatabaseToken[token];
    if (!workspaceId || workspaceId === currentWorkspaceId || seen.has(workspaceId)) {
      continue;
    }
    seen.add(workspaceId);
    deps.push(workspaceId);
  }
  return deps;
}

export function parseCliArgs(argv) {
  const args = [...argv];
  let ddrPath = "";
  let workspaceId = process.env.WORKSPACE_ID || "default";
  let summaryPath = process.env.DDR_SUMMARY_PATH || "";
  let workspacePrefix = process.env.WORKSPACE_PREFIX || "";

  while (args.length > 0) {
    const token = String(args.shift() ?? "");
    if (!token) {
      continue;
    }
    if (token === "--workspace" || token === "-w") {
      const next = String(args.shift() ?? "").trim();
      if (next) {
        workspaceId = next;
      }
      continue;
    }
    if (token.startsWith("--workspace=")) {
      const raw = token.slice("--workspace=".length).trim();
      if (raw) {
        workspaceId = raw;
      }
      continue;
    }
    if (token === "--summary" || token === "-s") {
      const next = String(args.shift() ?? "").trim();
      if (next) {
        summaryPath = next;
      }
      continue;
    }
    if (token.startsWith("--summary=")) {
      const raw = token.slice("--summary=".length).trim();
      if (raw) {
        summaryPath = raw;
      }
      continue;
    }
    if (token === "--workspace-prefix") {
      const next = String(args.shift() ?? "").trim();
      if (next) {
        workspacePrefix = next;
      }
      continue;
    }
    if (token.startsWith("--workspace-prefix=")) {
      const raw = token.slice("--workspace-prefix=".length).trim();
      if (raw) {
        workspacePrefix = raw;
      }
      continue;
    }
    if (!token.startsWith("-") && !ddrPath) {
      if (/summary\.xml$/i.test(token)) {
        summaryPath = token;
      } else {
        ddrPath = token;
      }
    }
  }

  return {
    ddrPath: ddrPath || process.env.DDR_PATH || DEFAULT_DDR_PATH,
    workspaceId: normalizeWorkspaceId(workspaceId),
    summaryPath: summaryPath.trim(),
    workspacePrefix: workspacePrefix.trim()
  };
}

export async function importDdrToWorkspace({
  cwd,
  ddrPath,
  workspaceId,
  summaryPath,
  solutionName,
  workspaceByDatabaseToken,
  hostHint
}) {
  const workspaceRoot =
    workspaceId === "default"
      ? path.join(cwd, "data")
      : path.join(cwd, "data", "workspaces", workspaceId);
  const layoutsDir = workspaceId === "default" ? path.join(cwd, "data", "layouts") : path.join(workspaceRoot, "layouts");
  const layoutMapPath =
    workspaceId === "default"
      ? path.join(cwd, "data", "layout-fm-map.json")
      : path.join(workspaceRoot, "layout-fm-map.json");
  const workspaceConfigPath = path.join(cwd, "data", "workspaces", workspaceId, "workspace.json");

  const rawDdr = await fs.readFile(ddrPath);
  const xml = readAsXml(rawDdr);
  const catalogBlock = firstMatchValue(xml, /<LayoutCatalog\b[\s\S]*?<\/LayoutCatalog>/i, 0);
  if (!catalogBlock) {
    throw new Error("Unable to find <LayoutCatalog> in DDR XML");
  }

  const layoutBlocks = findTopLevelTagBlocks(catalogBlock, "Layout");
  if (layoutBlocks.length === 0) {
    throw new Error("No <Layout> blocks found in DDR XML");
  }

  const inferredScope = process.env.FILEMAKER_DATABASE?.trim() || inferDatabaseScope(xml);
  const sourceFileName = inferSourceFileName(xml);
  const inferredHostHint = normalizeHostHint(hostHint) || extractHostHintFromXml(xml);
  const fileReferenceNames = extractFileReferenceNames(xml);
  const dependencyWorkspaceIds = resolveDependencyWorkspaceIds({
    fileReferenceNames,
    workspaceByDatabaseToken: workspaceByDatabaseToken ?? {},
    currentWorkspaceId: workspaceId
  });
  const scopePrefix = `${inferredScope}::`;
  const importedLayoutNames = [];

  await fs.mkdir(layoutsDir, { recursive: true });
  await fs.mkdir(path.dirname(workspaceConfigPath), { recursive: true });

  let existingMap = {
    version: 1,
    byFileMakerLayoutKey: {}
  };
  try {
    const rawMap = await fs.readFile(layoutMapPath, "utf8");
    const parsedMap = JSON.parse(rawMap);
    if (parsedMap && parsedMap.version === 1 && parsedMap.byFileMakerLayoutKey) {
      existingMap = parsedMap;
    }
  } catch {
    // Start with a new map if none exists.
  }

  const previousEntries = existingMap.byFileMakerLayoutKey;
  const previousScopeEntries = {};
  const preservedOtherScopes = {};
  for (const [key, value] of Object.entries(previousEntries)) {
    if (!key.startsWith(scopePrefix)) {
      preservedOtherScopes[key] = value;
    } else {
      previousScopeEntries[key] = value;
    }
  }

  const nextScopeEntries = {};

  for (const layoutBlock of layoutBlocks) {
    const attrs = parseAttributes(layoutBlock.startTag);
    const layoutName = (attrs.name || "").trim();
    const isFolder = attrs.isFolder === "True";
    const isSeparatorLikeName = /^-+$/.test(layoutName.replace(/\s+/g, ""));
    const isSeparatorItem = attrs.isSeparatorItem === "True" || isSeparatorLikeName;

    if (!layoutName || isFolder || isSeparatorItem) {
      continue;
    }

    const mapKey = `${inferredScope}::${layoutName}`;
    const mappedId =
      previousEntries[mapKey] || baseLayoutIdForFileMakerLayout(layoutName, mapKey);
    const layoutThemeToken = firstMatchValue(
      layoutBlock.full,
      /<LayoutThemeReference\b[^>]*name="([^"]+)"/i
    ).trim() || firstMatchValue(layoutBlock.full, /<Theme\b[^>]*name="([^"]+)"/i).trim();
    const layoutTheme = formatThemeName(layoutThemeToken);
    const components = collectLayoutComponents(layoutBlock, mappedId, layoutTheme);
    const parts = extractLayoutParts(layoutBlock, mappedId);
    const { maxRight, maxBottom } = maxLayoutBounds(layoutBlock);
    const widthHint = numberOr(attrs.width, 0);
    const canvasWidth = Math.max(480, Math.round(Math.max(widthHint, maxRight + 24)));
    const partsHeight = parts.reduce((sum, part) => sum + Math.max(20, Math.round(numberOr(part.height, 20))), 0);
    const canvasHeight = Math.max(600, Math.round(Math.max(maxBottom + 40, partsHeight + 24)));

    const layoutPayload = {
      id: mappedId,
      name: layoutName,
      // This project uses defaultTableOccurrence as the Data API layout selector.
      // Keep this as the FM layout name so /layouts/{name} endpoints work.
      defaultTableOccurrence: layoutName,
      canvas: {
        width: canvasWidth,
        height: canvasHeight,
        gridSize: 8,
        showGrid: false,
        snapToGrid: false
      },
      parts: parts.length > 0 ? parts : undefined,
      components,
      actions: []
    };

    await fs.writeFile(
      path.join(layoutsDir, `${mappedId}.json`),
      JSON.stringify(layoutPayload, null, 2),
      "utf8"
    );

    nextScopeEntries[mapKey] = mappedId;
    importedLayoutNames.push(layoutName);
  }

  const nextMap = {
    version: 1,
    byFileMakerLayoutKey: {
      ...preservedOtherScopes,
      ...nextScopeEntries
    }
  };

  await fs.writeFile(layoutMapPath, JSON.stringify(nextMap, null, 2), "utf8");
  let existingWorkspaceConfig = null;
  try {
    existingWorkspaceConfig = JSON.parse(await fs.readFile(workspaceConfigPath, "utf8"));
  } catch {
    existingWorkspaceConfig = null;
  }
  const existingFilemaker =
    existingWorkspaceConfig && typeof existingWorkspaceConfig.filemaker === "object"
      ? existingWorkspaceConfig.filemaker
      : {};

  await fs.writeFile(
    workspaceConfigPath,
    JSON.stringify(
      {
        version: 1,
        id: workspaceId,
        name:
          (typeof existingWorkspaceConfig?.name === "string" && existingWorkspaceConfig.name.trim()) ||
          inferredScope ||
          workspaceId,
        filemaker: {
          host:
            (typeof existingFilemaker.host === "string" && existingFilemaker.host.trim()) ||
            inferredHostHint ||
            undefined,
          database: inferredScope || undefined,
          username:
            (typeof existingFilemaker.username === "string" && existingFilemaker.username.trim()) || undefined,
          password:
            (typeof existingFilemaker.password === "string" && existingFilemaker.password.trim()) || undefined,
          ddrPath,
          summaryPath: summaryPath || undefined,
          sourceFileName: sourceFileName || undefined,
          solutionName: solutionName || undefined,
          dependsOn: dependencyWorkspaceIds.length > 0 ? dependencyWorkspaceIds : undefined,
          externalDataSources: fileReferenceNames.length > 0 ? fileReferenceNames : undefined
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const nextMappedIds = new Set(Object.values(nextScopeEntries));
  const usedByOtherScopes = new Set(Object.values(preservedOtherScopes));
  for (const staleId of Object.values(previousScopeEntries)) {
    if (nextMappedIds.has(staleId) || usedByOtherScopes.has(staleId)) {
      continue;
    }
    if (!staleId.startsWith("fm-")) {
      continue;
    }
    const stalePath = path.join(layoutsDir, `${staleId}.json`);
    try {
      await fs.unlink(stalePath);
    } catch {
      // Ignore stale files that no longer exist.
    }
  }

  const allMappedIds = new Set(Object.values(nextMap.byFileMakerLayoutKey));
  const layoutFiles = await fs.readdir(layoutsDir);
  for (const fileName of layoutFiles) {
    if (!fileName.endsWith(".json")) {
      continue;
    }
    if (!fileName.startsWith("fm-")) {
      continue;
    }
    const id = fileName.slice(0, -5);
    if (allMappedIds.has(id)) {
      continue;
    }
    try {
      await fs.unlink(path.join(layoutsDir, fileName));
    } catch {
      // Ignore files that can no longer be removed.
    }
  }

  importedLayoutNames.sort((a, b) => a.localeCompare(b));
  return {
    workspaceId,
    database: inferredScope,
    sourceFileName,
    importedLayoutNames
  };
}

async function main() {
  const cwd = process.cwd();
  const args = parseCliArgs(process.argv.slice(2));

  if (args.summaryPath) {
    const rawSummary = await fs.readFile(args.summaryPath);
    const summaryXml = readAsXml(rawSummary);
    const solutionName = path.basename(path.dirname(args.summaryPath)) || "FileMaker Solution";
    const summaryEntries = parseSummaryFileEntries(summaryXml, args.summaryPath, args.workspacePrefix);
    if (summaryEntries.length === 0) {
      throw new Error("No DDR files were found in Summary.xml");
    }

    const workspaceByDatabaseToken = {};
    for (const entry of summaryEntries) {
      if (entry.databaseName) {
        workspaceByDatabaseToken[normalizeDatabaseToken(entry.databaseName)] = entry.workspaceId;
      }
      if (entry.fileName) {
        workspaceByDatabaseToken[normalizeDatabaseToken(entry.fileName)] = entry.workspaceId;
      }
    }

    const results = [];
    for (const entry of summaryEntries) {
      const result = await importDdrToWorkspace({
        cwd,
        ddrPath: entry.ddrPath,
        workspaceId: entry.workspaceId,
        summaryPath: args.summaryPath,
        solutionName,
        workspaceByDatabaseToken,
        hostHint: entry.hostHint
      });
      results.push(result);
    }

    let totalLayouts = 0;
    for (const result of results) {
      totalLayouts += result.importedLayoutNames.length;
      console.log(`Imported ${result.importedLayoutNames.length} layout(s) from DDR.`);
      console.log(`Workspace: ${result.workspaceId}`);
      console.log(`Database scope: ${result.database}`);
    }
    console.log(`Solution import complete: ${results.length} workspace(s), ${totalLayouts} total layout(s).`);
    return;
  }

  const result = await importDdrToWorkspace({
    cwd,
    ddrPath: args.ddrPath,
    workspaceId: args.workspaceId,
    summaryPath: "",
    solutionName: "",
    workspaceByDatabaseToken: {},
    hostHint: ""
  });

  const importedLayoutNames = result.importedLayoutNames;
  console.log(`Imported ${importedLayoutNames.length} layout(s) from DDR.`);
  console.log(`Workspace: ${result.workspaceId}`);
  console.log(`Database scope: ${result.database}`);
  for (const name of importedLayoutNames) {
    console.log(`- ${name}`);
  }
}

const isCliInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCliInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
