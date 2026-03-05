import { promises as fs } from "node:fs";

const DEFAULT_DDR_PATH = "/Users/deffenda/Downloads/Assets.xml";

type TagBlock = {
  start: number;
  end: number;
  full: string;
  inner: string;
  startTag: string;
};

export type RelationshipJoinPredicate = {
  id: string;
  operator: string;
  leftFieldName: string;
  leftTableOccurrenceId: string;
  leftTableOccurrenceName: string;
  rightFieldName: string;
  rightTableOccurrenceId: string;
  rightTableOccurrenceName: string;
};

export type RelationshipGraphNode = {
  id: string;
  name: string;
  view: string;
  baseTableId: string;
  baseTableName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fields: string[];
};

export type RelationshipGraphEdge = {
  id: string;
  leftTableOccurrenceId: string;
  leftTableOccurrenceName: string;
  rightTableOccurrenceId: string;
  rightTableOccurrenceName: string;
  predicates: RelationshipJoinPredicate[];
};

export type RelationshipGraphTable = {
  id: string;
  name: string;
  source: string;
  comment: string;
  creationIndex: number;
};

export type RelationshipGraphField = {
  id: string;
  name: string;
  type: string;
  fieldType: string;
  options: string;
  comment: string;
  creationIndex: number;
};

export type RelationshipGraphPayload = {
  source: "ddr" | "mock";
  databaseName: string;
  ddrPath: string;
  baseTables: RelationshipGraphTable[];
  fieldsByBaseTableId: Record<string, RelationshipGraphField[]>;
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
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

function findTopLevelTagBlocks(xml: string, tagName: string): TagBlock[] {
  const tokenPattern = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}>`, "g");
  const blocks: TagBlock[] = [];
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

function firstMatchValue(xml: string, pattern: RegExp, group = 1): string {
  const match = xml.match(pattern);
  return match ? decodeXmlEntities(match[group] ?? "") : "";
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readAsXml(rawBuffer: Buffer): string {
  const utf16Candidate = rawBuffer.toString("utf16le");
  if (utf16Candidate.includes("<FMSaveAsXML")) {
    return utf16Candidate.charCodeAt(0) === 0xfeff ? utf16Candidate.slice(1) : utf16Candidate;
  }
  const utf8Candidate = rawBuffer.toString("utf8");
  return utf8Candidate.charCodeAt(0) === 0xfeff ? utf8Candidate.slice(1) : utf8Candidate;
}

function inferDatabaseName(xml: string): string {
  const rootFile = firstMatchValue(xml, /<FMSaveAsXML\b[^>]*\bFile="([^"]+)"/i).trim();
  if (rootFile) {
    return rootFile.replace(/\.fmp12$/i, "").trim() || "FileMaker";
  }
  return process.env.FILEMAKER_DATABASE?.trim() || "FileMaker";
}

function parseBaseTables(xml: string): RelationshipGraphTable[] {
  const tables: RelationshipGraphTable[] = [];
  const catalogBlock = firstMatchValue(xml, /<BaseTableCatalog\b[\s\S]*?<\/BaseTableCatalog>/i, 0);
  if (!catalogBlock) {
    return tables;
  }

  const blocks = findTopLevelTagBlocks(catalogBlock, "BaseTable");
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const attrs = parseAttributes(block.startTag);
    const id = (attrs.id ?? "").trim();
    const name = (attrs.name ?? "").trim();
    if (id && name) {
      tables.push({
        id,
        name,
        source: "FileMaker",
        comment: (attrs.comment ?? "").trim(),
        creationIndex: index + 1
      });
    }
  }
  return tables;
}

function wordsFromToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return wordsFromToken(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeFieldDisplayType(fieldType: string, dataType: string): string {
  const normalizedFieldType = fieldType.trim().toLowerCase();
  const normalizedDataType = dataType.trim().toLowerCase();
  if (normalizedFieldType === "summary") {
    return "Summary";
  }
  if (normalizedDataType === "binary") {
    return "Container";
  }
  if (normalizedDataType === "timestamp") {
    return "Timestamp";
  }
  if (normalizedDataType === "number") {
    return "Number";
  }
  if (normalizedDataType === "date") {
    return "Date";
  }
  if (normalizedDataType === "time") {
    return "Time";
  }
  if (normalizedDataType === "text") {
    return "Text";
  }
  if (normalizedDataType) {
    return titleCase(normalizedDataType);
  }
  if (normalizedFieldType) {
    return titleCase(normalizedFieldType);
  }
  return "Text";
}

function autoEnterTypeLabel(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "calculated") {
    return "Auto-enter Calculation";
  }
  if (normalized === "creationaccountname") {
    return "Creation Account Name";
  }
  if (normalized === "modificationaccountname") {
    return "Modification Account Name";
  }
  if (normalized === "creationtimestamp") {
    return "Creation Timestamp";
  }
  if (normalized === "modificationtimestamp") {
    return "Modification Timestamp";
  }
  if (normalized === "looked_up" || normalized === "lookup") {
    return "Looked up value";
  }
  return titleCase(type);
}

function summaryOperationLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  return titleCase(normalized);
}

function fieldOptionsSummary(fieldXml: string, fieldType: string): string {
  const options: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push(normalized);
  };

  if (fieldType.trim().toLowerCase() === "summary") {
    const operation = summaryOperationLabel(firstMatchValue(fieldXml, /<SummaryInfo\b[^>]*operation="([^"]+)"/i));
    const summaryField = firstMatchValue(
      fieldXml,
      /<SummaryInfo\b[\s\S]*?<SummaryField>[\s\S]*?<FieldReference\b[^>]*name="([^"]+)"/i
    ).trim();
    if (operation && summaryField) {
      push(`= ${operation} of ${summaryField}`);
    } else if (operation) {
      push(`= ${operation}`);
    }
  }

  const storageTag = firstMatchValue(fieldXml, /<Storage\b[^>]*>/i, 0);
  if (storageTag) {
    const storageAttrs = parseAttributes(storageTag);
    const indexMode = (storageAttrs.index ?? "").trim();
    if (indexMode && indexMode.toLowerCase() !== "none") {
      push("Indexed");
    }
    if ((storageAttrs.global ?? "").trim().toLowerCase() === "true") {
      push("Global");
    }
    const repetitions = Number.parseInt(storageAttrs.maxRepetitions ?? "", 10);
    if (Number.isFinite(repetitions) && repetitions > 1) {
      push(`Repeating (${repetitions})`);
    }
    if ((storageAttrs.storeCalculationResults ?? "").trim().toLowerCase() === "false") {
      push("Unstored Calculation");
    }
  }

  const autoEnterTag = firstMatchValue(fieldXml, /<AutoEnter\b[^>]*>/i, 0);
  if (autoEnterTag) {
    const autoEnterAttrs = parseAttributes(autoEnterTag);
    push(autoEnterTypeLabel(autoEnterAttrs.type ?? ""));
    if ((autoEnterAttrs.prohibitModification ?? "").trim().toLowerCase() === "true") {
      push("Can't Modify Auto-Enter Value");
    }
  }

  const validationTag = firstMatchValue(fieldXml, /<Validation\b[^>]*>/i, 0);
  if (validationTag) {
    const validationAttrs = parseAttributes(validationTag);
    if ((validationAttrs.notEmpty ?? "").trim().toLowerCase() === "true") {
      push("Required Value");
    }
    if ((validationAttrs.unique ?? "").trim().toLowerCase() === "true") {
      push("Unique Value");
    }
    if ((validationAttrs.allowOverride ?? "").trim().toLowerCase() === "false") {
      push("Strict Validation");
    }
  }

  return options.join(", ");
}

function parseFieldsByBaseTable(xml: string): Map<string, RelationshipGraphField[]> {
  const fieldsByBaseTableId = new Map<string, RelationshipGraphField[]>();
  const fieldsForTables = firstMatchValue(xml, /<FieldsForTables\b[\s\S]*?<\/FieldsForTables>/i, 0);
  if (!fieldsForTables) {
    return fieldsByBaseTableId;
  }

  const fieldCatalogBlocks = findTopLevelTagBlocks(fieldsForTables, "FieldCatalog");
  for (const fieldCatalog of fieldCatalogBlocks) {
    const baseTableReferenceTag = firstMatchValue(fieldCatalog.full, /<BaseTableReference\b[^>]*>/i, 0);
    if (!baseTableReferenceTag) {
      continue;
    }
    const baseAttrs = parseAttributes(baseTableReferenceTag);
    const baseTableId = (baseAttrs.id ?? "").trim();
    if (!baseTableId) {
      continue;
    }

    const fields: RelationshipGraphField[] = [];
    const fieldBlocks = findTopLevelTagBlocks(fieldCatalog.full, "Field");
    for (let index = 0; index < fieldBlocks.length; index += 1) {
      const fieldBlock = fieldBlocks[index];
      const fieldAttrs = parseAttributes(fieldBlock.startTag);
      const name = (fieldAttrs.name ?? "").trim();
      if (!name) {
        continue;
      }
      const fieldType = (fieldAttrs.fieldtype ?? "").trim() || "Normal";
      const dataType = (fieldAttrs.datatype ?? "").trim();
      fields.push({
        id: (fieldAttrs.id ?? "").trim() || String(index + 1),
        name,
        type: normalizeFieldDisplayType(fieldType, dataType),
        fieldType,
        options: fieldOptionsSummary(fieldBlock.full, fieldType),
        comment: (fieldAttrs.comment ?? "").trim(),
        creationIndex: index + 1
      });
    }
    fieldsByBaseTableId.set(baseTableId, fields);
  }

  return fieldsByBaseTableId;
}

function parseTableOccurrences(
  xml: string,
  baseTablesById: Map<string, string>,
  fieldsByBaseTableId: Map<string, RelationshipGraphField[]>
): RelationshipGraphNode[] {
  const catalogBlock = firstMatchValue(xml, /<TableOccurrenceCatalog\b[\s\S]*?<\/TableOccurrenceCatalog>/i, 0);
  if (!catalogBlock) {
    return [];
  }

  const blocks = findTopLevelTagBlocks(catalogBlock, "TableOccurrence");
  const nodes: RelationshipGraphNode[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const attrs = parseAttributes(block.startTag);
    const id = (attrs.id ?? "").trim() || `to-${index + 1}`;
    const name = (attrs.name ?? "").trim() || `Table ${index + 1}`;
    const view = (attrs.View ?? "").trim();

    const baseRefTag = firstMatchValue(block.inner, /<BaseTableReference\b[^>]*>/i, 0);
    const baseRefAttrs = baseRefTag ? parseAttributes(baseRefTag) : {};
    const baseTableId = (baseRefAttrs.id ?? "").trim();
    const baseTableName =
      (baseRefAttrs.name ?? "").trim() || (baseTableId ? baseTablesById.get(baseTableId) ?? "" : "");

    const coordRectTag = firstMatchValue(block.inner, /<CoordRect\b[^>]*>/i, 0);
    const coordRectAttrs = coordRectTag ? parseAttributes(coordRectTag) : {};
    const fallbackLeft = 56 + (index % 4) * 240;
    const fallbackTop = 56 + Math.floor(index / 4) * 220;
    const left = numberOr(coordRectAttrs.left, fallbackLeft);
    const top = numberOr(coordRectAttrs.top, fallbackTop);
    const right = numberOr(coordRectAttrs.right, left + 160);
    const bottom = numberOr(coordRectAttrs.bottom, top + 120);
    const width = Math.max(132, Math.round(right - left));

    const tableFieldEntries = baseTableId ? fieldsByBaseTableId.get(baseTableId) ?? [] : [];
    const tableFields = tableFieldEntries.map((entry) => entry.name);
    const preferredHeight = 36 + Math.min(16, tableFields.length) * 14 + 12;
    const rawHeight = Math.max(74, Math.round(bottom - top));
    const height = Math.max(rawHeight, preferredHeight);

    nodes.push({
      id,
      name,
      view,
      baseTableId,
      baseTableName,
      x: Math.round(left),
      y: Math.round(top),
      width,
      height,
      fields: tableFields
    });
  }

  return nodes;
}

function parseTableOccurrenceReference(xml: string): { id: string; name: string } | null {
  const tableOccurrenceTag = firstMatchValue(xml, /<TableOccurrenceReference\b[^>]*>/i, 0);
  if (!tableOccurrenceTag) {
    return null;
  }
  const attrs = parseAttributes(tableOccurrenceTag);
  const id = (attrs.id ?? "").trim();
  const name = (attrs.name ?? "").trim();
  if (!id && !name) {
    return null;
  }
  return {
    id: id || name,
    name: name || id
  };
}

function parseJoinPredicates(relationshipBlock: string, relationshipId: string): RelationshipJoinPredicate[] {
  const joinPredicateListBlock = firstMatchValue(
    relationshipBlock,
    /<JoinPredicateList\b[\s\S]*?<\/JoinPredicateList>/i,
    0
  );
  if (!joinPredicateListBlock) {
    return [];
  }

  const joinPredicateBlocks = findTopLevelTagBlocks(joinPredicateListBlock, "JoinPredicate");
  const predicates: RelationshipJoinPredicate[] = [];
  for (let index = 0; index < joinPredicateBlocks.length; index += 1) {
    const joinPredicateBlock = joinPredicateBlocks[index];
    const attrs = parseAttributes(joinPredicateBlock.startTag);
    const operator = (attrs.type ?? "").trim() || "Equal";

    const leftFieldBlock = firstMatchValue(joinPredicateBlock.full, /<LeftField>[\s\S]*?<\/LeftField>/i, 0);
    const rightFieldBlock = firstMatchValue(joinPredicateBlock.full, /<RightField>[\s\S]*?<\/RightField>/i, 0);

    const leftFieldTag = leftFieldBlock ? firstMatchValue(leftFieldBlock, /<FieldReference\b[^>]*>/i, 0) : "";
    const rightFieldTag = rightFieldBlock ? firstMatchValue(rightFieldBlock, /<FieldReference\b[^>]*>/i, 0) : "";
    const leftFieldAttrs = leftFieldTag ? parseAttributes(leftFieldTag) : {};
    const rightFieldAttrs = rightFieldTag ? parseAttributes(rightFieldTag) : {};
    const leftFieldTable = leftFieldBlock ? parseTableOccurrenceReference(leftFieldBlock) : null;
    const rightFieldTable = rightFieldBlock ? parseTableOccurrenceReference(rightFieldBlock) : null;

    predicates.push({
      id: `${relationshipId}-predicate-${index + 1}`,
      operator,
      leftFieldName: (leftFieldAttrs.name ?? "").trim(),
      leftTableOccurrenceId: leftFieldTable?.id ?? "",
      leftTableOccurrenceName: leftFieldTable?.name ?? "",
      rightFieldName: (rightFieldAttrs.name ?? "").trim(),
      rightTableOccurrenceId: rightFieldTable?.id ?? "",
      rightTableOccurrenceName: rightFieldTable?.name ?? ""
    });
  }

  return predicates;
}

function parseRelationships(xml: string): RelationshipGraphEdge[] {
  const relationshipCatalogBlock = firstMatchValue(xml, /<RelationshipCatalog\b[\s\S]*?<\/RelationshipCatalog>/i, 0);
  if (!relationshipCatalogBlock) {
    return [];
  }

  const relationshipBlocks = findTopLevelTagBlocks(relationshipCatalogBlock, "Relationship");
  const edges: RelationshipGraphEdge[] = [];
  for (let index = 0; index < relationshipBlocks.length; index += 1) {
    const relationshipBlock = relationshipBlocks[index];
    const attrs = parseAttributes(relationshipBlock.startTag);
    const relationshipId = `relationship-${(attrs.id ?? "").trim() || index + 1}`;
    const leftTableBlock = firstMatchValue(relationshipBlock.full, /<LeftTable\b[\s\S]*?<\/LeftTable>/i, 0);
    const rightTableBlock = firstMatchValue(relationshipBlock.full, /<RightTable\b[\s\S]*?<\/RightTable>/i, 0);
    const leftTableOccurrence = leftTableBlock ? parseTableOccurrenceReference(leftTableBlock) : null;
    const rightTableOccurrence = rightTableBlock ? parseTableOccurrenceReference(rightTableBlock) : null;

    if (!leftTableOccurrence || !rightTableOccurrence) {
      continue;
    }

    edges.push({
      id: relationshipId,
      leftTableOccurrenceId: leftTableOccurrence.id,
      leftTableOccurrenceName: leftTableOccurrence.name,
      rightTableOccurrenceId: rightTableOccurrence.id,
      rightTableOccurrenceName: rightTableOccurrence.name,
      predicates: parseJoinPredicates(relationshipBlock.full, relationshipId)
    });
  }

  return edges;
}

function resolveDdrPath(candidate?: string): string {
  const fromArgs = (candidate ?? "").trim();
  if (fromArgs) {
    return fromArgs;
  }
  const fromEnv = (process.env.FILEMAKER_DDR_PATH ?? "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_DDR_PATH;
}

export async function getDdrRelationshipGraph(options?: {
  ddrPath?: string;
}): Promise<RelationshipGraphPayload> {
  const ddrPath = resolveDdrPath(options?.ddrPath);
  const rawBuffer = await fs.readFile(ddrPath);
  const xml = readAsXml(rawBuffer);

  const baseTables = parseBaseTables(xml);
  const baseTablesById = new Map(baseTables.map((table) => [table.id, table.name]));
  const fieldsByBaseTableId = parseFieldsByBaseTable(xml);
  const nodes = parseTableOccurrences(xml, baseTablesById, fieldsByBaseTableId);
  const edges = parseRelationships(xml);
  const fieldsByBaseTableIdJson = Object.fromEntries(
    [...fieldsByBaseTableId.entries()].map(([baseTableId, fields]) => [baseTableId, fields])
  );

  return {
    source: "ddr",
    databaseName: inferDatabaseName(xml),
    ddrPath,
    baseTables,
    fieldsByBaseTableId: fieldsByBaseTableIdJson,
    nodes,
    edges
  };
}
