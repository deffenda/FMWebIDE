"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { sortComponentsByArrangeOrder } from "@/src/lib/layout-arrange";
import { runtimeThemeCssVars } from "@/src/lib/theme-palettes";
import {
  type BrowseLaunchMode,
  type BrowseViewMode,
  buildBrowseRouteHref,
  parseBrowseLaunchModeToken,
  parseBrowseViewModeToken
} from "@/src/lib/browse-url-state";
import { templateString } from "@/src/lib/layout-utils";
import type {
  FMRecord,
  LayoutBrowseChartSnapshot,
  LayoutComponent,
  LayoutDefinition,
  LayoutEventBindings
} from "@/src/lib/layout-model";

type BrowseModeProps = {
  layoutId: string;
  workspaceId?: string;
};

type BrowseTopMenubarMenuId =
  | "filemaker-pro"
  | "file"
  | "edit"
  | "view"
  | "insert"
  | "format"
  | "records"
  | "scripts"
  | "tools"
  | "window"
  | "help";
type BrowseMenuSubmenuId = "goToLayout" | "goToRecord" | "savedFinds" | "showWindow";
type FindRequestState = {
  id: string;
  criteria: FindCriteriaMap;
  omit: boolean;
};
type SavedFindEntry = {
  id: string;
  name: string;
  requests: FindRequestState[];
  createdAt?: number;
  lastRunAt?: number;
  layoutId?: string;
};

type RecordPayload = {
  records: FMRecord[];
  source: "mock" | "filemaker";
};

type LayoutCatalogPayload = {
  layouts: string[];
  layoutFolders?: Array<{
    folder: string | null;
    layouts: string[];
  }>;
  source: "mock" | "filemaker";
};

type WorkspaceCatalogEntry = {
  id: string;
  name: string;
  filemaker?: {
    host?: string | null;
    database?: string | null;
    solutionName?: string | null;
  };
};

type WorkspaceCatalogPayload = {
  workspaces: WorkspaceCatalogEntry[];
};

type FieldCatalogPayload = {
  fields: Array<{ name: string; type: string } | string>;
  source: "mock" | "filemaker";
};

type RelationshipGraphPayload = {
  nodes: Array<{
    name: string;
  }>;
  edges: Array<{
    leftTableOccurrenceName: string;
    rightTableOccurrenceName: string;
  }>;
};

type ValueListPayload = {
  valueLists: Array<{
    name: string;
    values: string[];
    items?: Array<{
      value: string;
      displayValue: string;
    }>;
  }>;
  source: "mock" | "filemaker";
};

type ValueListItem = {
  value: string;
  displayValue: string;
};

type RecordErrorPayload = {
  error?: string;
  source?: "mock" | "filemaker";
};

type FieldSaveState = "saving" | "saved" | "error";
type FieldControlType = "text" | "concealed" | "dropdown" | "popup" | "radio" | "checkbox" | "date";
type PopupMenuSettings = {
  includeArrow: boolean;
  allowOtherValues: boolean;
  allowEditing: boolean;
  overrideFormatting: boolean;
};
type DateControlSettings = {
  includeIcon: boolean;
  autoCompleteExisting: boolean;
};
type TableSortDirection = "asc" | "desc";
type TableSortMode = "standard" | "valueList";
type TableSummaryOperation = "count" | "sum" | "avg" | "min" | "max";
type TableSubtotalPosition = "leading" | "trailing";
type FileMakerChartType =
  | "column"
  | "bar"
  | "line"
  | "area"
  | "stackedColumn"
  | "stackedBar"
  | "positiveNegative"
  | "pie"
  | "donut"
  | "scatter"
  | "bubble";
type FileMakerChartSummaryType =
  | "total"
  | "average"
  | "count"
  | "minimum"
  | "maximum"
  | "stdDev"
  | "stdDevP"
  | "fractionOfTotal";

type TableSortEntry = {
  field: string;
  direction: TableSortDirection;
  mode: TableSortMode;
  valueList?: string[];
  valueListName?: string;
};

type ColumnMenuState = {
  field: string;
  x: number;
  y: number;
};

type ColumnSubmenuKind =
  | "sortByValueList"
  | "leadingSubtotals"
  | "trailingSubtotals"
  | "field"
  | "tableView";

type ColumnSubmenuState = {
  kind: ColumnSubmenuKind;
  x: number;
  y: number;
};

type ContainerMenuAction =
  | "cut"
  | "copy"
  | "paste"
  | "insert-picture"
  | "insert-pdf"
  | "insert-file"
  | "export";

type ContainerMenuState = {
  x: number;
  y: number;
  stateKey: string;
  recordId?: string;
  fieldName: string;
  rawUrl: string;
  label: string;
};

type ContainerUploadTarget = {
  stateKey: string;
  recordId?: string;
  fieldName: string;
};

type TableViewOptions = {
  showRowNumbers: boolean;
  alternatingRows: boolean;
  compactRows: boolean;
};

type RuntimeCanvasSize = {
  width: number;
  height: number;
};

type RuntimeComponentFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type QuickChartSeries = {
  id: string;
  name: string;
  field: string;
  summary: FileMakerChartSummaryType;
  color: string;
};

type QuickChartConfig = {
  title: string;
  type: FileMakerChartType;
  xAxisField: string;
  xAxisTitle: string;
  yAxisTitle: string;
  showLegend: boolean;
  labelField: string;
  bubbleRadiusField: string;
  series: QuickChartSeries[];
};

type TableDisplayRow =
  | {
      kind: "record";
      key: string;
      record: FMRecord;
      originalIndex: number;
    }
  | {
      kind: "group";
      key: string;
      label: string;
      variant: "leading" | "trailing";
    }
  | {
      kind: "summary";
      key: string;
      label: string;
      values: Record<string, string>;
      variant: "leading" | "trailing" | "grand-leading" | "grand-trailing";
    };

type FindCriteriaMap = Record<string, string>;

const SORT_CONTEXT_CURRENT_LAYOUT = "__sort_current_layout__";
const SORT_CONTEXT_CURRENT_TABLE = "__sort_current_table__";
const SORT_CONTEXT_MANAGE_DATABASE = "__sort_manage_database__";
const FIND_INSERT_OPERATOR_OPTIONS: Array<{ token: string; label: string }> = [
  { token: "==", label: "Exact Match (==)" },
  { token: "=", label: "Match Whole Word (=)" },
  { token: "!", label: "Duplicate Values (!)" },
  { token: ">", label: "Greater Than (>)" },
  { token: ">=", label: "Greater Than or Equal (>=)" },
  { token: "<", label: "Less Than (<)" },
  { token: "<=", label: "Less Than or Equal (<=)" },
  { token: "...", label: "Range (...)" },
  { token: "//", label: "Current Date (//)" },
  { token: "?", label: "Invalid Date/Time (?)" },
  { token: "\"\"", label: "Match Phrase from Word Start (\"\")" },
  { token: "*\"\"", label: "Match Phrase from Anywhere (*\"\")" },
  { token: "\\", label: "Escape Next Character (\\)" },
  { token: "*", label: "Any Characters (*)" },
  { token: "@", label: "Any Character (@)" },
  { token: "#", label: "Any Digit (#)" }
];

const MAX_RECENT_FINDS = 10;
const SAVED_FINDS_STORAGE_KEY = "fmwebide.saved-finds.v1";
const RECENT_FINDS_STORAGE_KEY = "fmwebide.recent-finds.v1";

const DEFAULT_POPUP_MENU_SETTINGS: PopupMenuSettings = {
  includeArrow: true,
  allowOtherValues: false,
  allowEditing: false,
  overrideFormatting: false
};

const DEFAULT_DATE_CONTROL_SETTINGS: DateControlSettings = {
  includeIcon: true,
  autoCompleteExisting: false
};

const FILEMAKER_CONTAINER_SUPPORTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
  "svg",
  "pdf",
  "txt",
  "csv",
  "tab",
  "tsv",
  "rtf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "mp3",
  "wav",
  "aif",
  "aiff",
  "m4a",
  "aac",
  "mp4",
  "m4v",
  "mov",
  "avi",
  "mpeg",
  "mpg",
  "webm",
  "zip"
] as const;

const FILEMAKER_CONTAINER_ACCEPT_ATTRIBUTE = FILEMAKER_CONTAINER_SUPPORTED_EXTENSIONS.map(
  (ext) => `.${ext}`
).join(",");

const FILEMAKER_CONTAINER_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
  "svg"
] as const;

const FILEMAKER_CONTAINER_IMAGE_ACCEPT_ATTRIBUTE = FILEMAKER_CONTAINER_IMAGE_EXTENSIONS.map(
  (ext) => `.${ext}`
).join(",");

const FILEMAKER_CONTAINER_PDF_ACCEPT_ATTRIBUTE = ".pdf";
const PREVIEW_READ_ONLY_STATUS = "Preview Mode is read-only";

const MIME_EXTENSION_OVERRIDES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tif",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

const FILEMAKER_CHART_TYPE_OPTIONS: Array<{ value: FileMakerChartType; label: string }> = [
  { value: "column", label: "Column" },
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "stackedColumn", label: "Stacked Column" },
  { value: "stackedBar", label: "Stacked Bar" },
  { value: "positiveNegative", label: "Positive/Negative Column" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "scatter", label: "Scatter" },
  { value: "bubble", label: "Bubble" }
];

const FILEMAKER_CHART_SUMMARY_OPTIONS: Array<{ value: FileMakerChartSummaryType; label: string }> = [
  { value: "total", label: "Total" },
  { value: "average", label: "Average" },
  { value: "count", label: "Count" },
  { value: "minimum", label: "Minimum" },
  { value: "maximum", label: "Maximum" },
  { value: "stdDev", label: "Standard Deviation" },
  { value: "stdDevP", label: "Population Standard Deviation" },
  { value: "fractionOfTotal", label: "Fraction Of Total" }
];

const QUICK_CHART_SERIES_COLORS = [
  "#a66e24",
  "#d58a2a",
  "#bfd11b",
  "#5a87c6",
  "#7c4abf",
  "#d46c8c",
  "#2f9e7a",
  "#d47f3a"
] as const;
const FILEMAKER_CHART_TYPE_SET = new Set<FileMakerChartType>(
  FILEMAKER_CHART_TYPE_OPTIONS.map((option) => option.value)
);
const FILEMAKER_CHART_SUMMARY_SET = new Set<FileMakerChartSummaryType>(
  FILEMAKER_CHART_SUMMARY_OPTIONS.map((option) => option.value)
);

const QUICK_CHART_MAX_CATEGORIES = 40;
const QUICK_CHART_MAX_POINTS = 500;
const QUICK_CHART_LAYOUT_SNAPSHOT_MAX_ROWS = 500;

function stripSystemFields(record: FMRecord): Record<string, unknown> {
  const fieldData = { ...record };
  delete fieldData.recordId;
  delete fieldData.modId;
  delete fieldData.portalData;
  return fieldData;
}

function cloneLayout(layout: LayoutDefinition): LayoutDefinition {
  return JSON.parse(JSON.stringify(layout)) as LayoutDefinition;
}

function nextChartLayoutId(layoutName: string): string {
  const token = styleToken(layoutName).slice(0, 44);
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `chart-${token}-${stamp}-${random}`;
}

function snapshotPrimitiveValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return mergeDisplayValue(value);
}

function fieldSaveKey(recordId: string | undefined, field: string): string {
  return `${recordId ?? "no-record"}::${field}`;
}

function emptyRecordFromLayout(layout: LayoutDefinition): FMRecord {
  return layout.components
    .filter((component) => component.type === "field" && component.binding?.field)
    .reduce<FMRecord>((acc, component) => {
      if (component.binding?.field) {
        acc[component.binding.field] = "";
      }
      return acc;
    }, {});
}

function styleToken(value: string | undefined): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) {
    return "default";
  }
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function isUniversalTouchTheme(value: string | undefined): boolean {
  return (value ?? "").toLowerCase().includes("universal touch");
}

function mergeDisplayValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = mergeDisplayValue(entry).trim();
      if (token) {
        return token;
      }
    }
    return "";
  }
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    const preferred =
      candidate.displayValue ??
      candidate.value ??
      candidate.text ??
      candidate.name ??
      candidate.label ??
      "";
    const resolved = mergeDisplayValue(preferred).trim();
    if (resolved) {
      return resolved;
    }
    return "";
  }
  return "";
}

function mergeFieldValue(record: FMRecord | null, rawToken: string, tableOccurrenceHint?: string): unknown {
  if (!record) {
    return "";
  }
  const token = rawToken.trim();
  if (!token) {
    return "";
  }

  const tokenNormalized = token.toLowerCase();
  const tokenUnqualified = unqualifiedFieldToken(token);

  if (record[token] != null) {
    return record[token];
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === tokenNormalized && value != null) {
      return value;
    }
  }

  const unqualified = token.includes("::") ? token.split("::").pop() ?? token : token;
  if (record[unqualified] != null) {
    return record[unqualified];
  }
  const preferredRelation = (
    token.includes("::")
      ? token.split("::")[0]?.trim().toLowerCase() ?? ""
      : tableOccurrenceHint?.trim().toLowerCase() ?? ""
  ).trim();

  if (preferredRelation) {
    for (const [key, value] of Object.entries(record)) {
      if (value == null || !key.includes("::")) {
        continue;
      }
      const keyRelation = key.split("::")[0]?.trim().toLowerCase() ?? "";
      if (keyRelation !== preferredRelation) {
        continue;
      }
      if (unqualifiedFieldToken(key) === tokenUnqualified) {
        return value;
      }
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (unqualifiedFieldToken(key) === tokenUnqualified && value != null) {
      return value;
    }
  }

  const rawPortalData = (record as Record<string, unknown>).portalData;
  if (rawPortalData && typeof rawPortalData === "object" && !Array.isArray(rawPortalData)) {
    const portalData = rawPortalData as Record<string, unknown>;
    const relationToken = preferredRelation;
    const fieldToken = token.includes("::") ? tokenUnqualified : tokenNormalized;

    for (const [portalName, portalRows] of Object.entries(portalData)) {
      const portalNameNormalized = portalName.trim().toLowerCase();
      if (relationToken && relationToken !== portalNameNormalized) {
        continue;
      }
      if (!Array.isArray(portalRows) || portalRows.length === 0) {
        continue;
      }
      const firstRow = portalRows[0];
      if (!firstRow || typeof firstRow !== "object") {
        continue;
      }
      for (const [fieldName, value] of Object.entries(firstRow as Record<string, unknown>)) {
        if (fieldName.trim().toLowerCase() === fieldToken || unqualifiedFieldToken(fieldName) === fieldToken) {
          return value;
        }
      }
    }
  }
  return "";
}

function resolveMergeText(text: string | undefined, record: FMRecord | null): string {
  const template = text ?? "";
  if (!template) {
    return "";
  }
  return template.replace(/<<\s*([^>]+)\s*>>/g, (_match, token: string) => {
    const value = mergeFieldValue(record, token);
    return mergeDisplayValue(value);
  });
}

function templateStringWithEncoding(
  template: string | undefined,
  record: Record<string, unknown> | null | undefined,
  encodeValues: boolean
): string {
  const source = template ?? "";
  if (!record) {
    return source;
  }
  return source.replace(/{{\s*([\w.:]+)\s*}}/g, (_match, key: string) => {
    const value = (record as Record<string, unknown>)[key];
    const normalized = value == null ? "" : String(value);
    return encodeValues ? encodeURIComponent(normalized) : normalized;
  });
}

function componentClasses(component: LayoutComponent): string {
  const classes = [
    "runtime-item",
    `runtime-item-type-${component.type}`,
    `runtime-style-${styleToken(component.props.styleName)}`
  ];
  if (component.type === "button") {
    classes.push(`runtime-button-mode-${component.props.buttonMode ?? "standard"}`);
  }
  if (component.type === "panel") {
    classes.push(`runtime-panel-type-${component.props.panelType ?? "tab"}`);
  }
  if (isUniversalTouchTheme(component.props.styleTheme)) {
    classes.push("runtime-theme-universal-touch");
  }
  return classes.join(" ");
}

function shapeRuntimeStyle(component: LayoutComponent, frame?: RuntimeComponentFrame): CSSProperties {
  const shapeType = component.props.shapeType ?? "rectangle";
  const lineWidth = Math.max(1, Number(component.props.lineWidth ?? (shapeType === "line" ? 2 : 1)));
  const lineStyle = component.props.lineStyle ?? "solid";
  const lineColor = component.props.lineColor || "#94a3b8";
  const fillType = component.props.fillType ?? (shapeType === "line" ? "none" : "solid");
  const fillColor = component.props.fillColor || "#f8fafc";
  const cornerRadius = Number(component.props.cornerRadius ?? (shapeType === "roundedRectangle" ? 12 : 0));
  const fillStyle = (() => {
    if (fillType === "none") {
      return {
        background: "transparent",
        backgroundImage: "none"
      } satisfies CSSProperties;
    }
    if (fillType === "gradient") {
      const start = component.props.fillGradientStartColor || fillColor || "#f8fafc";
      const end = component.props.fillGradientEndColor || fillColor || "#e2e8f0";
      const rawAngle = Number(component.props.fillGradientAngle ?? 180);
      const safeAngle = Number.isFinite(rawAngle) ? Math.max(0, Math.min(360, Math.round(rawAngle))) : 180;
      return {
        background: `linear-gradient(${safeAngle}deg, ${start} 0%, ${end} 100%)`
      } satisfies CSSProperties;
    }
    if (fillType === "image") {
      const imageUrl = (component.props.fillImageUrl ?? "").trim();
      if (imageUrl.length > 0) {
        const escaped = imageUrl.replace(/"/g, '\\"');
        return {
          backgroundColor: fillColor || "#f8fafc",
          backgroundImage: `url("${escaped}")`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center"
        } satisfies CSSProperties;
      }
      return {
        background: fillColor
      } satisfies CSSProperties;
    }
    return {
      background: fillColor
    } satisfies CSSProperties;
  })();

  if (shapeType === "line") {
    const width = frame?.width ?? component.position.width;
    const height = frame?.height ?? component.position.height;
    const horizontal = width >= height;
    if (horizontal) {
      return {
        background: "transparent",
        borderTopStyle: lineStyle === "none" ? "solid" : lineStyle,
        borderTopWidth: lineStyle === "none" ? 0 : lineWidth,
        borderTopColor: lineColor,
        borderRadius: 0
      };
    }
    return {
      background: "transparent",
      borderLeftStyle: lineStyle === "none" ? "solid" : lineStyle,
      borderLeftWidth: lineStyle === "none" ? 0 : lineWidth,
      borderLeftColor: lineColor,
      borderRadius: 0
    };
  }

  return {
    borderStyle: lineStyle === "none" ? "none" : lineStyle,
    borderWidth: lineStyle === "none" ? 0 : lineWidth,
    borderColor: lineColor,
    ...fillStyle,
    borderRadius: shapeType === "oval" ? 9999 : cornerRadius
  };
}

function componentTextStyle(component: LayoutComponent): CSSProperties {
  const style: CSSProperties = {};
  if (component.props.fontFamily?.trim()) {
    style.fontFamily = component.props.fontFamily;
  }
  if (Number.isFinite(component.props.fontSize)) {
    style.fontSize = Math.max(1, Number(component.props.fontSize));
  }
  if (component.props.textColor?.trim()) {
    style.color = component.props.textColor;
  }
  if (component.props.textAlign) {
    style.textAlign = component.props.textAlign;
  }
  if (component.props.textUnderline) {
    style.textDecoration = "underline";
  }
  if (Number.isFinite(component.props.lineSpacingHeight) && component.props.lineSpacingUnits === "pt") {
    style.lineHeight = `${Math.max(0, Number(component.props.lineSpacingHeight))}pt`;
  } else if (Number.isFinite(component.props.lineSpacingHeight)) {
    style.lineHeight = String(Math.max(0.5, Number(component.props.lineSpacingHeight)));
  }

  if (component.props.fontWeight === "bold" || component.props.fontWeight === "boldItalic") {
    style.fontWeight = 700;
  }
  if (component.props.fontWeight === "italic" || component.props.fontWeight === "boldItalic") {
    style.fontStyle = "italic";
  }

  if (component.props.baseline === "superscript") {
    style.verticalAlign = "super";
  } else if (component.props.baseline === "subscript") {
    style.verticalAlign = "sub";
  }

  if (Number.isFinite(component.props.baselineOffset) && Number(component.props.baselineOffset) !== 0) {
    style.position = "relative";
    style.top = `${-1 * Number(component.props.baselineOffset)}px`;
  }

  return style;
}

function isContainerLikeField(component: LayoutComponent): boolean {
  if (component.type !== "field") {
    return false;
  }
  const fieldName = (component.binding?.field ?? "").toLowerCase();
  const hasContainerStyleProps =
    typeof component.props.containerFormat === "string" ||
    typeof component.props.containerOptimizeFor === "string" ||
    typeof component.props.containerAlignHorizontal === "string" ||
    typeof component.props.containerAlignVertical === "string" ||
    component.props.containerPreservePdfTransparency === true;
  const looksLikeContainerField =
    fieldName.includes("image") ||
    fieldName.includes("logo") ||
    fieldName.includes("photo") ||
    fieldName.includes("picture") ||
    fieldName.includes("document") ||
    fieldName.includes("container");
  return hasContainerStyleProps || looksLikeContainerField || component.position.height >= 90;
}

function isContainerFieldForRuntime(
  fieldName: string | undefined,
  resolvedFieldType: string | undefined,
  component: LayoutComponent | null | undefined
): boolean {
  if (isContainerType(resolvedFieldType)) {
    return true;
  }
  if (component && isContainerLikeField(component)) {
    return true;
  }
  const loweredFieldName = (fieldName ?? "").toLowerCase();
  return (
    loweredFieldName.includes("image") ||
    loweredFieldName.includes("photo") ||
    loweredFieldName.includes("picture") ||
    loweredFieldName.includes("logo") ||
    loweredFieldName.includes("container")
  );
}

function normalizedFieldToken(value: string): string {
  return value.trim().toLowerCase();
}

function unqualifiedFieldToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.includes("::")) {
    return trimmed.toLowerCase();
  }
  return (trimmed.split("::").pop() ?? trimmed).toLowerCase();
}

function primaryEntityToken(layout: LayoutDefinition | null | undefined): string {
  const source = (layout?.name ?? layout?.defaultTableOccurrence ?? "").trim();
  if (!source) {
    return "";
  }
  const words = source
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/g)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0);
  const filtered = words.filter(
    (word) =>
      word !== "details" &&
      word !== "detail" &&
      word !== "list" &&
      word !== "form" &&
      word !== "layout" &&
      word !== "mode"
  );
  const first = filtered[0] ?? words[0] ?? "";
  if (!first) {
    return "";
  }
  if (first.endsWith("ies") && first.length > 3) {
    return `${first.slice(0, -3)}y`;
  }
  if (first.endsWith("s") && first.length > 3) {
    return first.slice(0, -1);
  }
  return first;
}

function portalRowCountForTable(record: FMRecord | null | undefined, tableOccurrence: string): number {
  const normalizedTableOccurrence = tableOccurrence.trim().toLowerCase();
  if (!record || !normalizedTableOccurrence) {
    return 0;
  }
  const rawPortalData = (record as Record<string, unknown>).portalData;
  if (!rawPortalData || typeof rawPortalData !== "object" || Array.isArray(rawPortalData)) {
    return 0;
  }
  for (const [portalName, rows] of Object.entries(rawPortalData as Record<string, unknown>)) {
    if (portalName.trim().toLowerCase() !== normalizedTableOccurrence) {
      continue;
    }
    if (Array.isArray(rows)) {
      return rows.length;
    }
    return 0;
  }
  return 0;
}

function splitQualifiedFieldToken(rawFieldName: string): { tableOccurrence: string; fieldName: string } | null {
  const token = rawFieldName.trim();
  const marker = token.indexOf("::");
  if (marker <= 0) {
    return null;
  }
  const tableOccurrence = token.slice(0, marker).trim();
  const fieldName = token.slice(marker + 2).trim();
  if (!tableOccurrence || !fieldName) {
    return null;
  }
  return {
    tableOccurrence,
    fieldName
  };
}

function normalizeEntityToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function singularEntityToken(value: string): string {
  const token = value.trim().toLowerCase();
  if (token.endsWith("ies") && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function resolveWriteLayoutCandidate(
  rawTableOccurrence: string,
  availableLayouts: string[]
): string {
  const requested = rawTableOccurrence.trim();
  if (!requested) {
    return "";
  }
  if (!Array.isArray(availableLayouts) || availableLayouts.length === 0) {
    return requested;
  }

  const exact = availableLayouts.find(
    (layoutName) => layoutName.trim().toLowerCase() === requested.toLowerCase()
  );
  if (exact) {
    return exact;
  }

  const normalizedRequested = normalizeEntityToken(requested);
  const singularRequested = singularEntityToken(normalizedRequested);
  if (!normalizedRequested) {
    return "";
  }

  let bestMatch = "";
  let bestScore = -1;

  for (const layoutName of availableLayouts) {
    const normalizedLayout = normalizeEntityToken(layoutName);
    if (!normalizedLayout) {
      continue;
    }
    const singularLayout = singularEntityToken(normalizedLayout);
    let score = 0;

    if (normalizedLayout === normalizedRequested) {
      score += 100;
    }
    if (singularLayout === singularRequested && singularRequested) {
      score += 60;
    }
    if (
      normalizedLayout.includes(normalizedRequested) ||
      normalizedRequested.includes(normalizedLayout)
    ) {
      score += 20;
    }
    if (
      singularRequested &&
      (normalizedLayout.includes(singularRequested) ||
        singularRequested.includes(normalizedLayout) ||
        singularLayout.includes(singularRequested) ||
        singularRequested.includes(singularLayout))
    ) {
      score += 15;
    }

    const lowerName = layoutName.trim().toLowerCase();
    if (lowerName.includes("detail") || lowerName.includes("form")) {
      score += 4;
    }
    if (lowerName.includes("list")) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = layoutName;
    }
  }

  return bestScore >= 20 ? bestMatch : "";
}

type PortalRowUpdateContext = {
  portalName: string;
  rowRecordId: string;
  rowModId?: string;
  rowFieldKey: string;
};

function resolvePortalRowUpdateContext(
  record: FMRecord | null | undefined,
  tableOccurrence: string,
  fieldName: string,
  preferredRecordId?: string
): PortalRowUpdateContext | null {
  const normalizedTableOccurrence = tableOccurrence.trim().toLowerCase();
  const normalizedFieldName = unqualifiedFieldToken(fieldName);
  if (!record || !normalizedTableOccurrence || !normalizedFieldName) {
    return null;
  }

  const rawPortalData = (record as Record<string, unknown>).portalData;
  if (!rawPortalData || typeof rawPortalData !== "object" || Array.isArray(rawPortalData)) {
    return null;
  }

  const normalizedPreferredRecordId = String(preferredRecordId ?? "").trim();
  let best: (PortalRowUpdateContext & { score: number; rowIndex: number }) | null = null;
  const portalEntries = Object.entries(rawPortalData as Record<string, unknown>);

  for (const [portalName, rows] of portalEntries) {
    if (!Array.isArray(rows)) {
      continue;
    }
    const normalizedPortalName = portalName.trim().toLowerCase();
    const preferredPortalRecordId = String(
      (record as Record<string, unknown>)[`${portalName}::recordId`] ?? ""
    ).trim();

    rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return;
      }

      const rowRecord = row as Record<string, unknown>;
      const rowRecordId = String(rowRecord.recordId ?? rowRecord["recordId"] ?? "").trim();
      if (!rowRecordId) {
        return;
      }

      let matchedFieldKey = "";
      let hasRelationMatch = false;
      for (const key of Object.keys(rowRecord)) {
        if (unqualifiedFieldToken(key) !== normalizedFieldName) {
          continue;
        }
        if (!matchedFieldKey) {
          matchedFieldKey = key;
        }
        if (key.includes("::")) {
          const relationToken = key.split("::")[0]?.trim().toLowerCase() ?? "";
          if (relationToken === normalizedTableOccurrence) {
            matchedFieldKey = key;
            hasRelationMatch = true;
            break;
          }
        }
      }

      if (!matchedFieldKey) {
        return;
      }

      let score = 0;
      if (normalizedPortalName === normalizedTableOccurrence) {
        score += 10;
      }
      if (hasRelationMatch) {
        score += 8;
      }
      if (preferredPortalRecordId && rowRecordId === preferredPortalRecordId) {
        score += 6;
      }
      if (normalizedPreferredRecordId && rowRecordId === normalizedPreferredRecordId) {
        score += 12;
      }
      if (matchedFieldKey === normalizedFieldName || matchedFieldKey.endsWith(`::${fieldName}`)) {
        score += 1;
      }

      const candidate = {
        portalName,
        rowRecordId,
        rowModId: String(rowRecord.modId ?? rowRecord["modId"] ?? "").trim() || undefined,
        rowFieldKey: matchedFieldKey,
        score,
        rowIndex
      } satisfies PortalRowUpdateContext & { score: number; rowIndex: number };

      if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.rowIndex > best.rowIndex)) {
        best = candidate;
      }
    });
  }

  const resolvedBest = best as (PortalRowUpdateContext & {
    score: number;
    rowIndex: number;
  }) | null;
  if (!resolvedBest) {
    return null;
  }

  return {
    portalName: resolvedBest.portalName,
    rowRecordId: resolvedBest.rowRecordId,
    rowModId: resolvedBest.rowModId,
    rowFieldKey: resolvedBest.rowFieldKey
  };
}

function extractFirstQualifiedFieldToken(
  rawValue: string
): { tableOccurrence: string; fieldName: string } | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }
  for (const match of value.matchAll(/<<\s*([^>]+)\s*>>/g)) {
    const candidate = splitQualifiedFieldToken(match[1] ?? "");
    if (candidate) {
      return candidate;
    }
  }
  const plain = value.match(/([A-Za-z0-9_ ]+::[A-Za-z0-9_ ]+)/);
  if (plain) {
    return splitQualifiedFieldToken(plain[1] ?? "");
  }
  return null;
}

function portalRowRecordIdForTable(
  record: FMRecord | null | undefined,
  tableOccurrence: string,
  preferredFieldName?: string
): string {
  const normalizedTableOccurrence = tableOccurrence.trim().toLowerCase();
  const preferredFieldToken = unqualifiedFieldToken(preferredFieldName ?? "");
  if (!record || !normalizedTableOccurrence) {
    return "";
  }
  const rawPortalData = (record as Record<string, unknown>).portalData;
  if (!rawPortalData || typeof rawPortalData !== "object" || Array.isArray(rawPortalData)) {
    return "";
  }

  const entries = Object.entries(rawPortalData as Record<string, unknown>);
  const rowMatchesField = (row: Record<string, unknown>): boolean => {
    if (!preferredFieldToken) {
      return true;
    }
    for (const fieldName of Object.keys(row)) {
      if (unqualifiedFieldToken(fieldName) === preferredFieldToken) {
        return true;
      }
    }
    return false;
  };

  const rowMatchesTableOccurrence = (row: Record<string, unknown>): boolean => {
    for (const fieldName of Object.keys(row)) {
      const relation = fieldName.includes("::")
        ? (fieldName.split("::")[0]?.trim().toLowerCase() ?? "")
        : "";
      if (relation === normalizedTableOccurrence) {
        return true;
      }
    }
    return false;
  };

  const findRecordIdInRows = (rows: unknown): string => {
    if (!Array.isArray(rows)) {
      return "";
    }
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
      const row = rows[rowIndex];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const rowRecord = row as Record<string, unknown>;
      if (!rowMatchesField(rowRecord)) {
        continue;
      }
      const resolvedRecordId =
        String(rowRecord.recordId ?? "").trim() ||
        String(rowRecord["recordId"] ?? "").trim();
      if (resolvedRecordId) {
        return resolvedRecordId;
      }
    }
    return "";
  };

  // Primary path: portal key exactly matches target TO.
  for (const [portalName, rows] of entries) {
    if (portalName.trim().toLowerCase() !== normalizedTableOccurrence) {
      continue;
    }
    const recordId = findRecordIdInRows(rows);
    if (recordId) {
      return recordId;
    }
  }

  // Fallback: some FileMaker solutions use portal object names that differ from TO names.
  for (const [_portalName, rows] of entries) {
    if (!Array.isArray(rows)) {
      continue;
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const rowRecord = row as Record<string, unknown>;
      if (!rowMatchesTableOccurrence(rowRecord) || !rowMatchesField(rowRecord)) {
        continue;
      }
      const resolvedRecordId = String(rowRecord.recordId ?? "").trim();
      if (resolvedRecordId) {
        return resolvedRecordId;
      }
    }
  }

  // Last fallback: first row with a recordId in any portal collection.
  for (const [_portalName, rows] of entries) {
    if (!Array.isArray(rows)) {
      continue;
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const resolvedRecordId = String((row as Record<string, unknown>).recordId ?? "").trim();
      if (resolvedRecordId) {
        return resolvedRecordId;
      }
    }
  }

  return "";
}

function resolvePortalRowsForComponent(
  record: FMRecord | null | undefined,
  component: LayoutComponent
): Array<Record<string, unknown>> {
  if (!record || component.type !== "portal") {
    return [];
  }
  const rawPortalData = (record as Record<string, unknown>).portalData;
  if (!rawPortalData || typeof rawPortalData !== "object" || Array.isArray(rawPortalData)) {
    return [];
  }

  const tableOccurrenceToken = (component.binding?.tableOccurrence ?? "").trim().toLowerCase();
  const portalNameToken = (component.props.label ?? "").trim().toLowerCase();
  const entries = Object.entries(rawPortalData as Record<string, unknown>);

  const normalizeRows = (rows: unknown): Array<Record<string, unknown>> => {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row)
    );
  };

  const byPortalName = entries.find(
    ([portalName, rows]) =>
      portalNameToken.length > 0 &&
      portalName.trim().toLowerCase() === portalNameToken &&
      Array.isArray(rows) &&
      rows.length > 0
  );
  if (byPortalName) {
    return normalizeRows(byPortalName[1]);
  }

  const byTableOccurrence = entries.find(
    ([portalName, rows]) =>
      tableOccurrenceToken.length > 0 &&
      portalName.trim().toLowerCase() === tableOccurrenceToken &&
      Array.isArray(rows) &&
      rows.length > 0
  );
  if (byTableOccurrence) {
    return normalizeRows(byTableOccurrence[1]);
  }

  if (tableOccurrenceToken) {
    for (const [, rows] of entries) {
      const normalizedRows = normalizeRows(rows);
      if (normalizedRows.length === 0) {
        continue;
      }
      const matchesRelation = normalizedRows.some((row) =>
        Object.keys(row).some((fieldName) => {
          const relationToken = fieldName.includes("::")
            ? (fieldName.split("::")[0]?.trim().toLowerCase() ?? "")
            : "";
          return relationToken === tableOccurrenceToken;
        })
      );
      if (matchesRelation) {
        return normalizedRows;
      }
    }
  }

  for (const [, rows] of entries) {
    const normalizedRows = normalizeRows(rows);
    if (normalizedRows.length > 0) {
      return normalizedRows;
    }
  }

  return [];
}

function portalRowFieldValue(
  row: Record<string, unknown>,
  rowField: string,
  tableOccurrence: string | undefined,
  portalName: string | undefined
): unknown {
  const fieldToken = rowField.trim();
  if (!fieldToken) {
    return "";
  }
  const normalizedFieldToken = fieldToken.toLowerCase();
  const normalizedUnqualifiedToken = unqualifiedFieldToken(fieldToken);
  const tableToken = (tableOccurrence ?? "").trim();
  const portalToken = (portalName ?? "").trim();

  const candidates = [
    fieldToken,
    `${tableToken}::${fieldToken}`,
    `${portalToken}::${fieldToken}`
  ].filter((token) => token.trim().length > 0);

  for (const key of candidates) {
    const value = row[key];
    if (value != null) {
      return value;
    }
  }

  for (const [key, value] of Object.entries(row)) {
    if (value == null) {
      continue;
    }
    if (key.trim().toLowerCase() === normalizedFieldToken) {
      return value;
    }
    if (unqualifiedFieldToken(key) === normalizedUnqualifiedToken) {
      return value;
    }
  }

  return "";
}

function popupMenuListId(fieldName: string, keySuffix: string): string {
  const normalizedField = fieldName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const normalizedSuffix = keySuffix.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `popup-vl-${normalizedField || "field"}-${normalizedSuffix || "entry"}`;
}

function findModeFieldHint(fieldName: string | undefined, labelHint?: string): string {
  const cleanLabelHint = (labelHint ?? "").trim();
  const preferredLabel = /<<\s*[^>]+\s*>>/.test(cleanLabelHint) ? "" : cleanLabelHint;
  const fromField = unqualifiedFieldToken(fieldName ?? "");
  const base = preferredLabel || fromField || (fieldName ?? "").trim() || "Field";
  return `Find: ${base}`;
}

function bindingFieldKey(
  fieldName: string | undefined,
  tableOccurrence: string | undefined,
  defaultTableOccurrence: string | undefined
): string {
  const normalizedFieldName = (fieldName ?? "").trim();
  if (!normalizedFieldName) {
    return "";
  }
  if (normalizedFieldName.includes("::")) {
    return normalizedFieldName;
  }
  const normalizedTableOccurrence = (tableOccurrence ?? "").trim();
  const normalizedDefault = (defaultTableOccurrence ?? "").trim();
  if (
    normalizedTableOccurrence &&
    (!normalizedDefault ||
      normalizedTableOccurrence.toLowerCase() !== normalizedDefault.toLowerCase())
  ) {
    return `${normalizedTableOccurrence}::${normalizedFieldName}`;
  }
  return normalizedFieldName;
}

function resolveFieldType(fieldName: string | undefined, fieldTypeByName: Record<string, string>): string {
  if (!fieldName) {
    return "";
  }

  const exact = fieldTypeByName[normalizedFieldToken(fieldName)];
  if (exact) {
    return exact;
  }

  const unqualified = fieldTypeByName[unqualifiedFieldToken(fieldName)];
  return unqualified ?? "";
}

function isContainerType(fieldType: string | undefined): boolean {
  return (fieldType ?? "").toLowerCase().includes("container");
}

function containerSourceFromValue(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return containerSourceFromValue(parsed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (!value || typeof value !== "object") {
    return "";
  }

  const candidate = value as Record<string, unknown>;
  const fromKnownKey =
    candidate.src ??
    candidate.url ??
    candidate.href ??
    candidate.value ??
    "";
  return typeof fromKnownKey === "string" ? fromKnownKey.trim() : "";
}

function normalizeWorkspaceToken(value: string | undefined): string {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "default";
}

function withWorkspaceQuery(pathname: string, workspaceId: string): string {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}workspace=${encodeURIComponent(workspaceId)}`;
}

function replaceWorkspaceQuery(pathname: string, workspaceId: string): string {
  const [path, rawQuery = ""] = pathname.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("workspace", normalizeWorkspaceToken(workspaceId));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function dedupeWorkspaceIds(values: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeWorkspaceToken(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function workspaceHostLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  try {
    const normalized = raw.includes("://") ? raw : `https://${raw}`;
    const parsed = new URL(normalized);
    return parsed.host || raw;
  } catch {
    const withoutProtocol = raw.replace(/^[a-z]+:\/\//i, "");
    const host = withoutProtocol.split(/[/?#]/)[0]?.trim() ?? "";
    return host || raw;
  }
}

function resolveAnchorEnabled(value: boolean | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value;
}

function resolveRuntimeCanvasDimension(
  baseDimension: number,
  availableDimension: number,
  anchorEnabled: boolean
): number {
  const normalizedBase = Math.max(64, Math.round(Number(baseDimension) || 0));
  if (!anchorEnabled) {
    return normalizedBase;
  }
  const normalizedAvailable = Math.max(0, Math.round(Number(availableDimension) || 0));
  if (normalizedAvailable <= 0) {
    return normalizedBase;
  }
  return Math.max(64, normalizedAvailable);
}

function resolveRuntimeComponentFrame(
  component: LayoutComponent,
  baseCanvas: RuntimeCanvasSize,
  runtimeCanvas: RuntimeCanvasSize
): RuntimeComponentFrame {
  const baseWidth = Math.max(64, Math.round(Number(baseCanvas.width) || 0));
  const baseHeight = Math.max(64, Math.round(Number(baseCanvas.height) || 0));
  const runtimeWidth = Math.max(64, Math.round(Number(runtimeCanvas.width) || 0));
  const runtimeHeight = Math.max(64, Math.round(Number(runtimeCanvas.height) || 0));
  const deltaWidth = runtimeWidth - baseWidth;
  const deltaHeight = runtimeHeight - baseHeight;

  const x = Math.round(Number(component.position.x) || 0);
  const y = Math.round(Number(component.position.y) || 0);
  const width = Math.max(8, Math.round(Number(component.position.width) || 0));
  const height = Math.max(8, Math.round(Number(component.position.height) || 0));

  let nextX = x;
  let nextY = y;
  let nextWidth = width;
  let nextHeight = height;

  const anchorLeft = resolveAnchorEnabled(component.props.autosizeLeft, true);
  const anchorRight = resolveAnchorEnabled(component.props.autosizeRight, false);
  const anchorTop = resolveAnchorEnabled(component.props.autosizeTop, true);
  const anchorBottom = resolveAnchorEnabled(component.props.autosizeBottom, false);

  // Match FileMaker autosizing behavior: both anchors stretch, single anchor pins, no anchors recenters.
  if (anchorLeft && anchorRight) {
    nextWidth = Math.max(8, width + deltaWidth);
  } else if (!anchorLeft && anchorRight) {
    nextX = Math.round(x + deltaWidth);
  } else if (!anchorLeft && !anchorRight) {
    nextX = Math.round(x + deltaWidth / 2);
  }

  if (anchorTop && anchorBottom) {
    nextHeight = Math.max(8, height + deltaHeight);
  } else if (!anchorTop && anchorBottom) {
    nextY = Math.round(y + deltaHeight);
  } else if (!anchorTop && !anchorBottom) {
    nextY = Math.round(y + deltaHeight / 2);
  }

  return {
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight
  };
}

function containerProxySrc(rawUrl: string, workspaceId?: string): string {
  return withWorkspaceQuery(`/api/fm/container?url=${encodeURIComponent(rawUrl)}`, normalizeWorkspaceToken(workspaceId));
}

function containerObjectFit(component: LayoutComponent | null | undefined): "contain" | "cover" | "fill" | "none" {
  const format = component?.props.containerFormat ?? "reduceToFit";
  const maintainProportions = component?.props.containerMaintainProportions !== false;

  if (format === "originalSize") {
    return "none";
  }
  if (format === "cropToFit") {
    return maintainProportions ? "cover" : "fill";
  }
  return maintainProportions ? "contain" : "fill";
}

function containerObjectPosition(component: LayoutComponent | null | undefined): string {
  const horizontal = component?.props.containerAlignHorizontal ?? "center";
  const vertical = component?.props.containerAlignVertical ?? "middle";
  const horizontalCss = horizontal === "left" ? "left" : horizontal === "right" ? "right" : "center";
  const verticalCss = vertical === "top" ? "top" : vertical === "bottom" ? "bottom" : "center";
  return `${horizontalCss} ${verticalCss}`;
}

function looksLikeInteractiveContainer(rawUrl: string): boolean {
  const value = rawUrl.trim().toLowerCase();
  if (!value) {
    return false;
  }
  return (
    value.includes(".pdf") ||
    value.includes(".mp3") ||
    value.includes(".mp4") ||
    value.includes(".mov") ||
    value.includes(".wav") ||
    value.includes("application/pdf") ||
    value.includes("audio/") ||
    value.includes("video/")
  );
}

function containerUploadFieldName(rawFieldName: string): string {
  const token = rawFieldName.trim();
  if (!token) {
    return "";
  }
  if (!token.includes("::")) {
    return token;
  }
  return (token.split("::").pop() ?? token).trim();
}

function resolveContainerUploadTarget(
  rawFieldName: string,
  defaultTableOccurrence: string
): { tableOccurrence: string; fieldName: string } | null {
  const qualified = splitQualifiedFieldToken(rawFieldName);
  if (qualified) {
    return {
      tableOccurrence: qualified.tableOccurrence,
      fieldName: qualified.fieldName
    };
  }

  const fieldName = containerUploadFieldName(rawFieldName);
  const tableOccurrence = defaultTableOccurrence.trim();
  if (!fieldName || !tableOccurrence) {
    return null;
  }
  return {
    tableOccurrence,
    fieldName
  };
}

function fileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized.includes(".")) {
    return "";
  }
  return normalized.split(".").pop() ?? "";
}

function isSupportedContainerUploadFile(file: File): boolean {
  const extension = fileExtension(file.name);
  if (extension && FILEMAKER_CONTAINER_SUPPORTED_EXTENSIONS.includes(extension as (typeof FILEMAKER_CONTAINER_SUPPORTED_EXTENSIONS)[number])) {
    return true;
  }
  const mime = file.type.trim().toLowerCase();
  if (!mime) {
    return false;
  }
  if (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")) {
    return true;
  }
  return (
    mime === "application/pdf" ||
    mime === "text/plain" ||
    mime === "text/csv" ||
    mime === "application/rtf" ||
    mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/zip"
  );
}

function inferFileExtensionFromMimeType(rawMimeType: string): string {
  const mimeType = rawMimeType.trim().toLowerCase();
  if (!mimeType) {
    return "";
  }
  const mapped = MIME_EXTENSION_OVERRIDES[mimeType];
  if (mapped) {
    return mapped;
  }
  const slashIndex = mimeType.lastIndexOf("/");
  if (slashIndex === -1 || slashIndex === mimeType.length - 1) {
    return "";
  }
  const token = mimeType.slice(slashIndex + 1).replace(/[^a-z0-9]+/gi, "");
  return token.toLowerCase();
}

function fileNameFromContainerSource(rawUrl: string, fallbackBaseName: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return fallbackBaseName;
  }
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const fromPath = (value: string) => {
    const withoutQuery = value.split("?")[0] ?? value;
    const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
    const normalized = withoutHash.replace(/\\/g, "/");
    const token = normalized.split("/").pop() ?? "";
    return decode(token.trim());
  };

  try {
    const parsed = new URL(trimmed);
    const token = fromPath(parsed.pathname);
    if (token) {
      return token;
    }
  } catch {
    const token = fromPath(trimmed);
    if (token) {
      return token;
    }
  }
  return fallbackBaseName;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "button"
  );
}

function parseRecordSelectionSpec(raw: string, maxCount: number): number[] {
  if (maxCount <= 0) {
    return [];
  }
  const selected = new Set<number>();
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  for (const token of tokens) {
    const normalized = token.replace(/\s+/g, "");
    if (!normalized) {
      continue;
    }
    if (normalized.includes("-")) {
      const [leftRaw, rightRaw] = normalized.split("-", 2);
      const left = Number.parseInt(leftRaw, 10);
      const right = Number.parseInt(rightRaw, 10);
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        continue;
      }
      const start = Math.max(1, Math.min(left, right));
      const end = Math.min(maxCount, Math.max(left, right));
      for (let pointer = start; pointer <= end; pointer += 1) {
        selected.add(pointer - 1);
      }
      continue;
    }
    const index = Number.parseInt(normalized, 10);
    if (!Number.isFinite(index) || index < 1 || index > maxCount) {
      continue;
    }
    selected.add(index - 1);
  }
  return [...selected].sort((left, right) => left - right);
}

function normalizeFindCriteriaMap(criteria: FindCriteriaMap): FindCriteriaMap {
  return Object.fromEntries(
    Object.entries(criteria)
      .map(([field, value]) => [field.trim(), String(value ?? "").trim()])
      .filter(([field, value]) => field.length > 0 && value.length > 0)
  );
}

function summarizeFindRequests(requests: FindRequestState[]): string {
  const summaries: string[] = [];
  for (const request of requests) {
    const criteria = normalizeFindCriteriaMap(request.criteria);
    const pairs = Object.entries(criteria);
    if (pairs.length === 0) {
      if (request.omit) {
        summaries.push("Omit <empty>");
      }
      continue;
    }
    const criteriaSummary = pairs
      .map(([fieldName, value]) => `${fieldName}: ${value}`)
      .join(", ");
    summaries.push(request.omit ? `Omit (${criteriaSummary})` : `Include (${criteriaSummary})`);
  }
  if (summaries.length === 0) {
    return "<No criteria>";
  }
  return summaries.join(" OR ");
}

function findCriteriaMapsEqual(left: FindCriteriaMap, right: FindCriteriaMap): boolean {
  const leftNormalized = normalizeFindCriteriaMap(left);
  const rightNormalized = normalizeFindCriteriaMap(right);
  const leftEntries = Object.entries(leftNormalized).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(rightNormalized).sort(([a], [b]) => a.localeCompare(b));
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  for (let index = 0; index < leftEntries.length; index += 1) {
    const [leftField, leftValue] = leftEntries[index] ?? ["", ""];
    const [rightField, rightValue] = rightEntries[index] ?? ["", ""];
    if (leftField !== rightField || leftValue !== rightValue) {
      return false;
    }
  }
  return true;
}

function comparableValue(value: unknown): { kind: "empty" | "number" | "text"; numberValue?: number; textValue?: string } {
  if (value == null || value === "") {
    return { kind: "empty" };
  }

  if (typeof value === "number") {
    return { kind: "number", numberValue: value };
  }

  if (typeof value === "boolean") {
    return { kind: "number", numberValue: value ? 1 : 0 };
  }

  const textValue = String(value).trim();
  if (!textValue) {
    return { kind: "empty" };
  }

  const numeric = Number(textValue.replace(/,/g, ""));
  if (Number.isFinite(numeric)) {
    return { kind: "number", numberValue: numeric };
  }

  return { kind: "text", textValue: textValue.toLowerCase() };
}

function compareComparableValues(
  left: ReturnType<typeof comparableValue>,
  right: ReturnType<typeof comparableValue>
): number {
  if (left.kind === "empty" && right.kind === "empty") {
    return 0;
  }
  if (left.kind === "empty") {
    return 1;
  }
  if (right.kind === "empty") {
    return -1;
  }

  if (left.kind === "number" && right.kind === "number") {
    return (left.numberValue ?? 0) - (right.numberValue ?? 0);
  }

  if (left.kind === "text" && right.kind === "text") {
    return (left.textValue ?? "").localeCompare(right.textValue ?? "", undefined, { numeric: true, sensitivity: "base" });
  }

  if (left.kind === "number") {
    return -1;
  }
  return 1;
}

function normalizeFindCriterionValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "";
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry.length > 0)
      .join("\n");
  }
  return mergeDisplayValue(value);
}

function escapeRegexToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareFindValues(left: string, right: string): number {
  const leftDate = parseFindDateToken(left);
  const rightDate = parseFindDateToken(right);
  if (leftDate != null && rightDate != null) {
    return leftDate - rightDate;
  }
  return compareComparableValues(comparableValue(left), comparableValue(right));
}

function parseFindDateToken(value: string): number | null {
  const token = value.trim();
  if (!token) {
    return null;
  }
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function buildWildcardFindPattern(term: string): RegExp {
  let pattern = "^";
  for (let index = 0; index < term.length; index += 1) {
    const token = term[index] ?? "";
    if (token === "\\") {
      const nextToken = term[index + 1];
      if (nextToken) {
        pattern += escapeRegexToken(nextToken);
        index += 1;
      } else {
        pattern += "\\\\";
      }
      continue;
    }
    if (token === "*") {
      pattern += ".*";
      continue;
    }
    if (token === "@") {
      pattern += ".";
      continue;
    }
    if (token === "#") {
      pattern += "\\d";
      continue;
    }
    pattern += escapeRegexToken(token);
  }
  pattern += "$";
  return new RegExp(pattern, "i");
}

function buildDuplicateFindFieldValueMap(
  records: FMRecord[],
  criteria: FindCriteriaMap
): Map<string, Set<string>> {
  const duplicateFields = Object.entries(criteria)
    .filter(([, criterion]) => String(criterion ?? "").trim() === "!")
    .map(([fieldName]) => fieldName);
  if (duplicateFields.length === 0) {
    return new Map();
  }
  const byField = new Map<string, Set<string>>();
  for (const fieldName of duplicateFields) {
    const counts = new Map<string, number>();
    for (const record of records) {
      const value = normalizeFindCriterionValue(mergeFieldValue(record, fieldName)).trim().toLowerCase();
      if (!value) {
        continue;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const duplicates = new Set<string>();
    for (const [value, count] of counts.entries()) {
      if (count > 1) {
        duplicates.add(value);
      }
    }
    byField.set(fieldName, duplicates);
  }
  return byField;
}

function matchesSingleFindTerm(rawValue: string, rawTerm: string): boolean {
  const value = rawValue.trim();
  const term = rawTerm.trim();
  if (!term) {
    return true;
  }

  if (term === "?") {
    return value.length > 0 && parseFindDateToken(value) == null;
  }

  if (term.startsWith("!") && term.length > 1) {
    return !matchesSingleFindTerm(value, term.slice(1));
  }

  if (term === "//") {
    const valueDate = parseFindDateToken(value);
    if (valueDate == null) {
      return false;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return valueDate === today;
  }

  const phraseAnywhereMatch = term.match(/^\*"(.*)"$/);
  if (phraseAnywhereMatch) {
    const phrase = (phraseAnywhereMatch[1] ?? "").trim();
    if (!phrase) {
      return false;
    }
    return value.toLowerCase().includes(phrase.toLowerCase());
  }

  const phraseWordStartMatch = term.match(/^"(.*)"$/);
  if (phraseWordStartMatch) {
    const phrase = (phraseWordStartMatch[1] ?? "").trim();
    if (!phrase) {
      return false;
    }
    const wordStartPattern = new RegExp(`(^|\\b)${escapeRegexToken(phrase)}`, "i");
    return wordStartPattern.test(value);
  }

  if (term.startsWith("'") && term.endsWith("'") && term.length >= 2) {
    const exact = term.slice(1, -1).trim();
    if (!exact) {
      return false;
    }
    return value.toLowerCase() === exact.toLowerCase();
  }

  const rangeIndex = term.indexOf("...");
  if (rangeIndex >= 0) {
    const from = term.slice(0, rangeIndex).trim();
    const to = term.slice(rangeIndex + 3).trim();
    if (!from && !to) {
      return true;
    }
    if (from && compareFindValues(value, from) < 0) {
      return false;
    }
    if (to && compareFindValues(value, to) > 0) {
      return false;
    }
    return true;
  }

  const comparisonMatch = term.match(/^(<=|>=|<|>)(.*)$/);
  if (comparisonMatch) {
    const operator = comparisonMatch[1];
    const compareToken = comparisonMatch[2]?.trim() ?? "";
    if (!compareToken) {
      return false;
    }
    const comparison = compareFindValues(value, compareToken);
    if (operator === "<=") {
      return comparison <= 0;
    }
    if (operator === ">=") {
      return comparison >= 0;
    }
    if (operator === "<") {
      return comparison < 0;
    }
    return comparison > 0;
  }

  if (term.startsWith("==")) {
    const exact = term.slice(2).trim().toLowerCase();
    return value.toLowerCase() === exact;
  }

  if (term.startsWith("=")) {
    const wholeWord = term.slice(1).trim();
    if (!wholeWord) {
      return value.length === 0;
    }
    const wholeWordPattern = new RegExp(`(^|\\b)${escapeRegexToken(wholeWord)}(\\b|$)`, "i");
    return wholeWordPattern.test(value);
  }

  if (term.includes("\\") || term.includes("*") || term.includes("@") || term.includes("#")) {
    return buildWildcardFindPattern(term).test(value);
  }

  return value.toLowerCase().includes(term.toLowerCase());
}

function matchesFindCriterion(value: unknown, criterion: string): boolean {
  const normalizedCriterion = String(criterion ?? "").trim();
  if (!normalizedCriterion) {
    return true;
  }

  const valueText = normalizeFindCriterionValue(value);
  const terms = normalizedCriterion
    .split(/\r?\n/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (terms.length === 0) {
    return true;
  }

  return terms.some((term) => matchesSingleFindTerm(valueText, term));
}

function recordMatchesFindCriteria(
  record: FMRecord,
  criteria: FindCriteriaMap,
  duplicateFieldValueMap?: Map<string, Set<string>>
): boolean {
  for (const [fieldName, criterion] of Object.entries(criteria)) {
    const normalizedCriterion = String(criterion ?? "").trim();
    if (!normalizedCriterion) {
      continue;
    }
    const fieldValue = mergeFieldValue(record, fieldName);
    if (normalizedCriterion === "!") {
      const duplicates = duplicateFieldValueMap?.get(fieldName);
      const normalizedFieldValue = normalizeFindCriterionValue(fieldValue).trim().toLowerCase();
      if (!duplicates || !normalizedFieldValue || !duplicates.has(normalizedFieldValue)) {
        return false;
      }
      continue;
    }
    if (!matchesFindCriterion(fieldValue, normalizedCriterion)) {
      return false;
    }
  }
  return true;
}

function dedupeCaseInsensitiveStrings(values: string[]): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = value.trim();
    if (!token) {
      continue;
    }
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(token);
  }
  return next;
}

function dedupeValueListItems(items: ValueListItem[]): ValueListItem[] {
  const next: ValueListItem[] = [];
  const seen = new Set<string>();
  for (const entry of items) {
    const value = String(entry.value ?? "").trim();
    const displayValue = String(entry.displayValue ?? "").trim();
    const normalized = value.toLowerCase();
    if (!value || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push({
      value,
      displayValue: displayValue || value
    });
  }
  return next;
}

function normalizeFieldNames(fields: Array<{ name: string; type: string } | string>): string[] {
  const names: string[] = [];
  for (const field of fields) {
    if (typeof field === "string") {
      const name = field.trim();
      if (name) {
        names.push(name);
      }
      continue;
    }
    const name = String(field?.name ?? "").trim();
    if (name) {
      names.push(name);
    }
  }
  return dedupeCaseInsensitiveStrings(names).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function parseMultiSelectTokens(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return dedupeCaseInsensitiveStrings(raw.map((entry) => String(entry ?? "")));
  }
  const text = String(raw ?? "");
  if (!text.trim()) {
    return [];
  }
  const tokens = text
    .split(/\r?\n|,|;/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return dedupeCaseInsensitiveStrings(tokens);
}

function normalizeLayoutFolderGroups(
  groups: Array<{ folder: string | null; layouts: string[] }> | undefined
): Array<{ folder: string | null; layouts: string[] }> {
  if (!groups || groups.length === 0) {
    return [];
  }
  const normalizedGroups: Array<{ folder: string | null; layouts: string[] }> = [];
  for (const group of groups) {
    const layouts = Array.isArray(group.layouts)
      ? [...new Set(group.layouts.map((name) => String(name ?? "").trim()).filter((name) => name.length > 0))]
      : [];
    if (layouts.length === 0) {
      continue;
    }
    const folderName = typeof group.folder === "string" ? group.folder.trim() : "";
    normalizedGroups.push({
      folder: folderName ? folderName : null,
      layouts
    });
  }
  return normalizedGroups;
}

function numericValues(records: FMRecord[], field: string): number[] {
  const values: number[] = [];
  for (const record of records) {
    const raw = mergeFieldValue(record, field);
    if (raw == null || raw === "") {
      continue;
    }
    const parsed = Number(String(raw).replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      values.push(parsed);
    }
  }
  return values;
}

function subtotalLabel(operation: TableSummaryOperation): string {
  if (operation === "count") {
    return "Count";
  }
  if (operation === "sum") {
    return "Sum";
  }
  if (operation === "avg") {
    return "Average";
  }
  if (operation === "min") {
    return "Min";
  }
  return "Max";
}

function chartSummaryLabel(summary: FileMakerChartSummaryType): string {
  const entry = FILEMAKER_CHART_SUMMARY_OPTIONS.find((option) => option.value === summary);
  return entry?.label ?? "Count";
}

function chartTypeLabel(type: FileMakerChartType): string {
  const entry = FILEMAKER_CHART_TYPE_OPTIONS.find((option) => option.value === type);
  return entry?.label ?? "Column";
}

function chartSeriesColor(index: number): string {
  return QUICK_CHART_SERIES_COLORS[index % QUICK_CHART_SERIES_COLORS.length];
}

function chartIsCategoryType(type: FileMakerChartType): boolean {
  return type !== "scatter" && type !== "bubble";
}

function parseChartNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function sampleStdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function populationStdDev(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function summarizeChartBucket(rawValues: unknown[], summary: FileMakerChartSummaryType): { value: number; fractionBase: number } {
  const nonEmpty = rawValues.filter((value) => value != null && String(value).trim() !== "");
  const numbers = nonEmpty
    .map((value) => parseChartNumber(value))
    .filter((value): value is number => value != null);
  const numericTotal = numbers.reduce((sum, value) => sum + value, 0);
  const count = nonEmpty.length;

  if (summary === "count") {
    return { value: count, fractionBase: count };
  }
  if (summary === "total") {
    return { value: numericTotal, fractionBase: numbers.length > 0 ? numericTotal : count };
  }
  if (summary === "average") {
    return {
      value: numbers.length > 0 ? numericTotal / numbers.length : 0,
      fractionBase: numbers.length > 0 ? numericTotal : count
    };
  }
  if (summary === "minimum") {
    return {
      value: numbers.length > 0 ? Math.min(...numbers) : 0,
      fractionBase: numbers.length > 0 ? numericTotal : count
    };
  }
  if (summary === "maximum") {
    return {
      value: numbers.length > 0 ? Math.max(...numbers) : 0,
      fractionBase: numbers.length > 0 ? numericTotal : count
    };
  }
  if (summary === "stdDev") {
    return {
      value: sampleStdDev(numbers),
      fractionBase: numbers.length > 0 ? numericTotal : count
    };
  }
  if (summary === "stdDevP") {
    return {
      value: populationStdDev(numbers),
      fractionBase: numbers.length > 0 ? numericTotal : count
    };
  }

  // Fraction of total: derive from numeric total when available, otherwise from count.
  const base = numbers.length > 0 ? numericTotal : count;
  return { value: base, fractionBase: base };
}

type CategoryChartPreview = {
  kind: "category";
  categories: string[];
  series: Array<{ id: string; name: string; color: string; values: number[]; summary: FileMakerChartSummaryType }>;
  truncated: boolean;
};

type ScatterChartPreview = {
  kind: "scatter";
  series: Array<{
    id: string;
    name: string;
    color: string;
    points: Array<{ x: number; y: number; r: number; label: string }>;
  }>;
  truncated: boolean;
};

type QuickChartPreviewData = CategoryChartPreview | ScatterChartPreview;

function buildCategoryChartPreview(records: FMRecord[], config: QuickChartConfig): CategoryChartPreview {
  const grouped = new Map<string, unknown[][]>();
  const categories: string[] = [];
  let truncated = false;

  for (const record of records) {
    const rawCategory = mergeFieldValue(record, config.xAxisField);
    const category = mergeDisplayValue(rawCategory).trim() || "(blank)";
    if (!grouped.has(category)) {
      if (categories.length >= QUICK_CHART_MAX_CATEGORIES) {
        truncated = true;
        continue;
      }
      categories.push(category);
      grouped.set(
        category,
        Array.from({ length: Math.max(1, config.series.length) }, () => [])
      );
    }
    const buckets = grouped.get(category);
    if (!buckets) {
      continue;
    }
    config.series.forEach((series, index) => {
      buckets[index].push(mergeFieldValue(record, series.field));
    });
  }

  const series = config.series.map((seriesConfig, seriesIndex) => {
    const rawByCategory = categories.map((category) => grouped.get(category)?.[seriesIndex] ?? []);
    const summarized = rawByCategory.map((bucket) =>
      summarizeChartBucket(bucket, seriesConfig.summary)
    );

    if (seriesConfig.summary === "fractionOfTotal") {
      const total = summarized.reduce((sum, entry) => sum + entry.fractionBase, 0);
      const values = summarized.map((entry) => (total > 0 ? entry.fractionBase / total : 0));
      return {
        id: seriesConfig.id,
        name: seriesConfig.name,
        color: seriesConfig.color,
        values,
        summary: seriesConfig.summary
      };
    }

    return {
      id: seriesConfig.id,
      name: seriesConfig.name,
      color: seriesConfig.color,
      values: summarized.map((entry) => entry.value),
      summary: seriesConfig.summary
    };
  });

  return {
    kind: "category",
    categories,
    series,
    truncated
  };
}

function buildScatterChartPreview(records: FMRecord[], config: QuickChartConfig): ScatterChartPreview {
  const series = config.series.map((seriesConfig) => {
    const points: Array<{ x: number; y: number; r: number; label: string }> = [];
    for (const [index, record] of records.entries()) {
      if (points.length >= QUICK_CHART_MAX_POINTS) {
        break;
      }
      const rawX = mergeFieldValue(record, config.xAxisField);
      const rawY = mergeFieldValue(record, seriesConfig.field);
      const x = parseChartNumber(rawX);
      const y = parseChartNumber(rawY);
      if (y == null) {
        continue;
      }
      const effectiveX = x == null ? index + 1 : x;
      const rawRadius = config.bubbleRadiusField
        ? mergeFieldValue(record, config.bubbleRadiusField)
        : rawY;
      const radius = parseChartNumber(rawRadius);
      points.push({
        x: effectiveX,
        y,
        r: Math.abs(radius ?? y),
        label: mergeDisplayValue(mergeFieldValue(record, config.labelField || config.xAxisField)).trim()
      });
    }
    points.sort((left, right) => left.x - right.x);
    return {
      id: seriesConfig.id,
      name: seriesConfig.name,
      color: seriesConfig.color,
      points
    };
  });

  const pointCount = series.reduce((sum, entry) => sum + entry.points.length, 0);
  return {
    kind: "scatter",
    series,
    truncated: pointCount >= QUICK_CHART_MAX_POINTS
  };
}

type QuickChartRendererProps = {
  config: QuickChartConfig;
  preview: QuickChartPreviewData;
};

function polarPoint(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function pieArcPath(
  cx: number,
  cy: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  innerRadius: number
): string {
  const startOuter = polarPoint(cx, cy, outerRadius, startAngle);
  const endOuter = polarPoint(cx, cy, outerRadius, endAngle);
  const arcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  if (innerRadius <= 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${arcFlag} 1 ${endOuter.x} ${endOuter.y}`,
      "Z"
    ].join(" ");
  }
  const endInner = polarPoint(cx, cy, innerRadius, endAngle);
  const startInner = polarPoint(cx, cy, innerRadius, startAngle);
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${arcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${arcFlag} 0 ${startInner.x} ${startInner.y}`,
    "Z"
  ].join(" ");
}

function axisTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0];
  }
  if (max === min) {
    return [min];
  }
  const step = (max - min) / Math.max(1, count - 1);
  const ticks: number[] = [];
  for (let index = 0; index < count; index += 1) {
    ticks.push(min + step * index);
  }
  return ticks;
}

function formatChartNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 1
    });
  }
  if (Math.abs(value) >= 10) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 2
    });
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 4
  });
}

function QuickChartRenderer({ config, preview }: QuickChartRendererProps) {
  const chartWidth = 900;
  const chartHeight = 420;

  if (preview.kind === "scatter") {
    const points = preview.series.flatMap((series) => series.points);
    if (points.length === 0) {
      return <div className="runtime-empty">No numeric chart data available for this configuration.</div>;
    }
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const paddedMinX = minX === maxX ? minX - 1 : minX;
    const paddedMaxX = minX === maxX ? maxX + 1 : maxX;
    const paddedMinY = minY === maxY ? minY - 1 : minY;
    const paddedMaxY = minY === maxY ? maxY + 1 : maxY;

    const left = 72;
    const right = chartWidth - 24;
    const top = 28;
    const bottom = chartHeight - 56;
    const plotWidth = right - left;
    const plotHeight = bottom - top;
    const maxRadiusRaw = Math.max(1, ...points.map((point) => point.r));

    const xFor = (value: number) => left + ((value - paddedMinX) / (paddedMaxX - paddedMinX)) * plotWidth;
    const yFor = (value: number) => bottom - ((value - paddedMinY) / (paddedMaxY - paddedMinY)) * plotHeight;

    const xTicks = axisTicks(paddedMinX, paddedMaxX, 5);
    const yTicks = axisTicks(paddedMinY, paddedMaxY, 5);

    return (
      <div className="browse-chart-preview-canvas">
        <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={config.title}>
          <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#ffffff" />
          <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#94a3b8" />
          <line x1={left} y1={top} x2={left} y2={bottom} stroke="#94a3b8" />
          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={`y-tick-${tick}`}>
                <line x1={left} y1={y} x2={right} y2={y} stroke="#e2e8f0" />
                <text x={left - 8} y={y + 4} textAnchor="end" className="browse-chart-tick">
                  {formatChartNumber(tick)}
                </text>
              </g>
            );
          })}
          {xTicks.map((tick) => {
            const x = xFor(tick);
            return (
              <g key={`x-tick-${tick}`}>
                <line x1={x} y1={top} x2={x} y2={bottom} stroke="#f1f5f9" />
                <text x={x} y={bottom + 18} textAnchor="middle" className="browse-chart-tick">
                  {formatChartNumber(tick)}
                </text>
              </g>
            );
          })}
          {preview.series.map((series) =>
            series.points.map((point, index) => {
              const radius = config.type === "bubble" ? 4 + (Math.abs(point.r) / maxRadiusRaw) * 14 : 5;
              return (
                <circle
                  key={`${series.id}-point-${index}`}
                  cx={xFor(point.x)}
                  cy={yFor(point.y)}
                  r={radius}
                  fill={series.color}
                  fillOpacity={config.type === "bubble" ? 0.45 : 0.78}
                  stroke={series.color}
                  strokeWidth={1}
                />
              );
            })
          )}
          <text x={chartWidth / 2} y={18} textAnchor="middle" className="browse-chart-title">
            {config.title}
          </text>
          <text x={chartWidth / 2} y={chartHeight - 14} textAnchor="middle" className="browse-chart-axis-label">
            {config.xAxisTitle}
          </text>
          <text
            x={18}
            y={chartHeight / 2}
            transform={`rotate(-90 18 ${chartHeight / 2})`}
            textAnchor="middle"
            className="browse-chart-axis-label"
          >
            {config.yAxisTitle}
          </text>
        </svg>
        {config.showLegend ? (
          <div className="browse-chart-legend">
            {preview.series.map((series) => (
              <span key={`scatter-legend-${series.id}`}>
                <i style={{ backgroundColor: series.color }} />
                {series.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (preview.categories.length === 0 || preview.series.length === 0) {
    return <div className="runtime-empty">No chart data available for this field yet.</div>;
  }

  if (config.type === "pie" || config.type === "donut") {
    const firstSeries = preview.series[0];
    const rawValues = firstSeries.values.map((value) => Math.max(0, value));
    const total = rawValues.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return <div className="runtime-empty">No positive values available to draw this chart type.</div>;
    }
    const cx = 300;
    const cy = 210;
    const outerRadius = 160;
    const innerRadius = config.type === "donut" ? 78 : 0;
    let currentAngle = -Math.PI / 2;

    return (
      <div className="browse-chart-preview-canvas pie">
        <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={config.title}>
          <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#ffffff" />
          {rawValues.map((value, index) => {
            const sliceAngle = (value / total) * Math.PI * 2;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sliceAngle;
            currentAngle = endAngle;
            const color = chartSeriesColor(index);
            return (
              <path
                key={`slice-${preview.categories[index]}`}
                d={pieArcPath(cx, cy, outerRadius, startAngle, endAngle, innerRadius)}
                fill={color}
                stroke="#ffffff"
                strokeWidth={1}
              />
            );
          })}
          <text x={chartWidth / 2} y={24} textAnchor="middle" className="browse-chart-title">
            {config.title}
          </text>
        </svg>
        {config.showLegend ? (
          <div className="browse-chart-legend vertical">
            {preview.categories.map((category, index) => {
              const value = rawValues[index] ?? 0;
              const percent = total > 0 ? (value / total) * 100 : 0;
              return (
                <span key={`pie-legend-${category}-${index}`}>
                  <i style={{ backgroundColor: chartSeriesColor(index) }} />
                  {category}: {formatChartNumber(value)} ({percent.toFixed(1)}%)
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  const left = 72;
  const right = chartWidth - 24;
  const top = 28;
  const bottom = chartHeight - 58;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const categoryCount = preview.categories.length;
  const seriesCount = Math.max(1, preview.series.length);
  const categoryBand = categoryCount > 0 ? plotWidth / categoryCount : plotWidth;

  const stacked = config.type === "stackedColumn" || config.type === "stackedBar";
  const horizontal = config.type === "bar" || config.type === "stackedBar";
  const positiveNegative = config.type === "positiveNegative";
  const lineChart = config.type === "line" || config.type === "area";

  const categoryStackExtents = preview.categories.map((_, categoryIndex) =>
    preview.series.reduce(
      (acc, series) => {
        const value = series.values[categoryIndex] ?? 0;
        if (value >= 0) {
          acc.positive += value;
        } else {
          acc.negative += value;
        }
        return acc;
      },
      { positive: 0, negative: 0 }
    )
  );
  const allValues = preview.series.flatMap((series) => series.values);
  const maxValue = stacked
    ? Math.max(0, ...categoryStackExtents.map((entry) => entry.positive))
    : Math.max(0, ...allValues);
  const minValue =
    positiveNegative || stacked
      ? Math.min(
          0,
          ...(stacked
            ? categoryStackExtents.map((entry) => entry.negative)
            : allValues)
        )
      : 0;
  const normalizedMax = maxValue === minValue ? maxValue + 1 : maxValue;
  const normalizedMin = maxValue === minValue ? minValue - 1 : minValue;

  const yFor = (value: number) =>
    top + ((normalizedMax - value) / (normalizedMax - normalizedMin)) * plotHeight;
  const xFor = (value: number) =>
    left + ((value - normalizedMin) / (normalizedMax - normalizedMin)) * plotWidth;
  const baselineY = yFor(0);
  const baselineX = xFor(0);
  const yTicks = axisTicks(normalizedMin, normalizedMax, 6);
  const categoryLabelStep = categoryCount > 14 ? 2 : 1;

  return (
    <div className="browse-chart-preview-canvas">
      <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={config.title}>
        <rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#ffffff" />
        {horizontal ? (
          <>
            <line x1={left} y1={top} x2={left} y2={bottom} stroke="#94a3b8" />
            <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#94a3b8" />
            {yTicks.map((tick) => {
              const x = xFor(tick);
              return (
                <g key={`x-grid-${tick}`}>
                  <line x1={x} y1={top} x2={x} y2={bottom} stroke="#e2e8f0" />
                  <text x={x} y={bottom + 18} textAnchor="middle" className="browse-chart-tick">
                    {formatChartNumber(tick)}
                  </text>
                </g>
              );
            })}
          </>
        ) : (
          <>
            <line x1={left} y1={top} x2={left} y2={bottom} stroke="#94a3b8" />
            <line x1={left} y1={baselineY} x2={right} y2={baselineY} stroke="#94a3b8" />
            {yTicks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={`y-grid-${tick}`}>
                  <line x1={left} y1={y} x2={right} y2={y} stroke="#e2e8f0" />
                  <text x={left - 8} y={y + 4} textAnchor="end" className="browse-chart-tick">
                    {formatChartNumber(tick)}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {lineChart ? (
          preview.series.map((series) => {
            const points = preview.categories.map((_, categoryIndex) => {
              const centerX = left + categoryBand * categoryIndex + categoryBand / 2;
              const value = series.values[categoryIndex] ?? 0;
              return {
                x: centerX,
                y: yFor(value)
              };
            });
            const path = points
              .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
              .join(" ");
            const areaPath =
              config.type === "area"
                ? `${path} L ${left + categoryBand * (categoryCount - 1) + categoryBand / 2} ${baselineY} L ${
                    left + categoryBand / 2
                  } ${baselineY} Z`
                : "";
            return (
              <g key={`line-series-${series.id}`}>
                {config.type === "area" ? (
                  <path d={areaPath} fill={series.color} fillOpacity={0.18} stroke="none" />
                ) : null}
                <path d={path} fill="none" stroke={series.color} strokeWidth={2} />
                {points.map((point, index) => (
                  <circle key={`${series.id}-${index}`} cx={point.x} cy={point.y} r={3} fill={series.color} />
                ))}
              </g>
            );
          })
        ) : horizontal ? (
          preview.categories.map((category, categoryIndex) => {
            const rowTop = top + categoryIndex * (plotHeight / categoryCount);
            const rowHeight = Math.max(10, plotHeight / categoryCount - 8);
            if (stacked) {
              let cumulativePositive = 0;
              let cumulativeNegative = 0;
              return (
                <g key={`bar-stack-${category}`}>
                  {preview.series.map((series) => {
                    const value = series.values[categoryIndex] ?? 0;
                    const startValue = value >= 0 ? cumulativePositive : cumulativeNegative;
                    const endValue = startValue + value;
                    if (value >= 0) {
                      cumulativePositive = endValue;
                    } else {
                      cumulativeNegative = endValue;
                    }
                    const startX = xFor(startValue);
                    const endX = xFor(endValue);
                    const x = Math.min(startX, endX);
                    const width = Math.max(0.5, Math.abs(endX - startX));
                    return (
                      <rect
                        key={`${series.id}-${category}`}
                        x={x}
                        y={rowTop}
                        width={width}
                        height={rowHeight}
                        fill={series.color}
                        fillOpacity={0.85}
                      />
                    );
                  })}
                </g>
              );
            }
            const barHeight = rowHeight / seriesCount;
            return (
              <g key={`bar-group-${category}`}>
                {preview.series.map((series, seriesIndex) => {
                  const value = series.values[categoryIndex] ?? 0;
                  const target = xFor(value);
                  const x = Math.min(baselineX, target);
                  const width = Math.max(0.5, Math.abs(target - baselineX));
                  return (
                    <rect
                      key={`${series.id}-${category}`}
                      x={x}
                      y={rowTop + barHeight * seriesIndex}
                      width={width}
                      height={barHeight - 2}
                      fill={series.color}
                      fillOpacity={0.86}
                    />
                  );
                })}
              </g>
            );
          })
        ) : (
          preview.categories.map((category, categoryIndex) => {
            const groupLeft = left + categoryBand * categoryIndex;
            const groupWidth = categoryBand * 0.74;
            const groupOffset = (categoryBand - groupWidth) / 2;
            if (stacked) {
              let cumulativePositive = 0;
              let cumulativeNegative = 0;
              return (
                <g key={`column-stack-${category}`}>
                  {preview.series.map((series) => {
                    const value = series.values[categoryIndex] ?? 0;
                    const startValue = value >= 0 ? cumulativePositive : cumulativeNegative;
                    const endValue = startValue + value;
                    if (value >= 0) {
                      cumulativePositive = endValue;
                    } else {
                      cumulativeNegative = endValue;
                    }
                    const startY = yFor(startValue);
                    const endY = yFor(endValue);
                    const y = Math.min(startY, endY);
                    const height = Math.max(0.5, Math.abs(endY - startY));
                    return (
                      <rect
                        key={`${series.id}-${category}`}
                        x={groupLeft + groupOffset}
                        y={y}
                        width={groupWidth}
                        height={height}
                        fill={series.color}
                        fillOpacity={0.86}
                      />
                    );
                  })}
                </g>
              );
            }
            const barWidth = Math.max(6, groupWidth / seriesCount);
            return (
              <g key={`column-group-${category}`}>
                {preview.series.map((series, seriesIndex) => {
                  const rawValue = series.values[categoryIndex] ?? 0;
                  const value = positiveNegative ? rawValue : Math.max(0, rawValue);
                  const topY = yFor(value);
                  const y = Math.min(topY, baselineY);
                  const height = Math.max(0.5, Math.abs(baselineY - topY));
                  const color = positiveNegative && rawValue < 0 ? "#d97706" : series.color;
                  return (
                    <rect
                      key={`${series.id}-${category}`}
                      x={groupLeft + groupOffset + barWidth * seriesIndex}
                      y={y}
                      width={barWidth - 2}
                      height={height}
                      fill={color}
                      fillOpacity={0.86}
                    />
                  );
                })}
              </g>
            );
          })
        )}

        {horizontal
          ? preview.categories.map((category, index) => {
              if (index % categoryLabelStep !== 0) {
                return null;
              }
              const rowCenter = top + index * (plotHeight / categoryCount) + plotHeight / categoryCount / 2;
              return (
                <text key={`cat-y-${category}`} x={left - 10} y={rowCenter + 4} textAnchor="end" className="browse-chart-tick">
                  {category}
                </text>
              );
            })
          : preview.categories.map((category, index) => {
              if (index % categoryLabelStep !== 0) {
                return null;
              }
              const centerX = left + categoryBand * index + categoryBand / 2;
              return (
                <text key={`cat-x-${category}`} x={centerX} y={bottom + 18} textAnchor="middle" className="browse-chart-tick">
                  {category}
                </text>
              );
            })}

        <text x={chartWidth / 2} y={18} textAnchor="middle" className="browse-chart-title">
          {config.title}
        </text>
        <text x={chartWidth / 2} y={chartHeight - 12} textAnchor="middle" className="browse-chart-axis-label">
          {config.xAxisTitle}
        </text>
        <text
          x={18}
          y={chartHeight / 2}
          transform={`rotate(-90 18 ${chartHeight / 2})`}
          textAnchor="middle"
          className="browse-chart-axis-label"
        >
          {config.yAxisTitle}
        </text>
      </svg>
      {config.showLegend ? (
        <div className="browse-chart-legend">
          {preview.series.map((series) => (
            <span key={`legend-${series.id}`}>
              <i style={{ backgroundColor: series.color }} />
              {series.name} ({chartSummaryLabel(series.summary)})
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BrowseMode({ layoutId, workspaceId }: BrowseModeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentWorkspaceId = useMemo(() => normalizeWorkspaceToken(workspaceId), [workspaceId]);
  const withWorkspaceForApi = useCallback(
    (pathname: string) => withWorkspaceQuery(pathname, currentWorkspaceId),
    [currentWorkspaceId]
  );
  const withWorkspaceForRoute = useCallback(
    (pathname: string) => withWorkspaceQuery(pathname, currentWorkspaceId),
    [currentWorkspaceId]
  );
  useEffect(() => {
    setWorkspaceTabs((previous) => dedupeWorkspaceIds([...previous, currentWorkspaceId]));
  }, [currentWorkspaceId]);
  const [layout, setLayout] = useState<LayoutDefinition | null>(null);
  const [records, setRecords] = useState<FMRecord[]>([]);
  const [allRecords, setAllRecords] = useState<FMRecord[]>([]);
  const [isFindMode, setIsFindMode] = useState(false);
  const [findCriteria, setFindCriteria] = useState<FindCriteriaMap>({});
  const [findRequestStates, setFindRequestStates] = useState<FindRequestState[]>([
    {
      id: "find-request-1",
      criteria: {},
      omit: false
    }
  ]);
  const [activeFindRequestIndex, setActiveFindRequestIndex] = useState(0);
  const [findRequestInsertMenuOpen, setFindRequestInsertMenuOpen] = useState(false);
  const [findRequestSavedMenuOpen, setFindRequestSavedMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<BrowseViewMode>("form");
  const [source, setSource] = useState<"mock" | "filemaker">("mock");
  const [valueListsByName, setValueListsByName] = useState<Record<string, string[]>>({});
  const [valueListItemsByName, setValueListItemsByName] = useState<Record<string, ValueListItem[]>>({});
  const [valueListsSource, setValueListsSource] = useState<"mock" | "filemaker">("mock");
  const [valueListsError, setValueListsError] = useState<string | null>(null);
  const [availableLayouts, setAvailableLayouts] = useState<string[]>([]);
  const [availableLayoutFolders, setAvailableLayoutFolders] = useState<
    Array<{ folder: string | null; layouts: string[] }>
  >([]);
  const [workspaceCatalog, setWorkspaceCatalog] = useState<WorkspaceCatalogEntry[]>([]);
  const [workspaceCatalogLoading, setWorkspaceCatalogLoading] = useState(false);
  const [workspaceTabs, setWorkspaceTabs] = useState<string[]>([currentWorkspaceId]);
  const [availableScripts, setAvailableScripts] = useState<string[]>([]);
  const [scriptsSource, setScriptsSource] = useState<"mock" | "filemaker">("mock");
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [layoutsLoading, setLayoutsLoading] = useState(false);
  const [layoutsError, setLayoutsError] = useState<string | null>(null);
  const [activeLayoutName, setActiveLayoutName] = useState("");
  const [topMenubarOpenMenu, setTopMenubarOpenMenu] = useState<BrowseTopMenubarMenuId | null>(null);
  const [topMenubarSubmenu, setTopMenubarSubmenu] = useState<BrowseMenuSubmenuId | null>(null);
  const [showStatusToolbar, setShowStatusToolbar] = useState(true);
  const [showFormattingBar, setShowFormattingBar] = useState(false);
  const [browseZoomPercent, setBrowseZoomPercent] = useState(100);
  const [spellingEnabled, setSpellingEnabled] = useState(true);
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [recordJumpInput, setRecordJumpInput] = useState("0");
  const [status, setStatus] = useState("Loading browse mode...");
  const [error, setError] = useState<string | null>(null);
  const [fileMakerConnectionFailed, setFileMakerConnectionFailed] = useState(false);
  const [fieldTypeByName, setFieldTypeByName] = useState<Record<string, string>>({});
  const [containerLoadFailed, setContainerLoadFailed] = useState<Record<string, true>>({});
  const [containerUploadState, setContainerUploadState] = useState<Record<string, "uploading">>({});
  const [fieldSaveStatus, setFieldSaveStatus] = useState<Record<string, FieldSaveState>>({});
  const [tableSort, setTableSort] = useState<TableSortEntry[]>([]);
  const [keepRecordsInSortedOrder, setKeepRecordsInSortedOrder] = useState(true);
  const [sortDialogOpen, setSortDialogOpen] = useState(false);
  const [sortDialogContext, setSortDialogContext] = useState(SORT_CONTEXT_CURRENT_LAYOUT);
  const [sortDialogRelatedTableOccurrences, setSortDialogRelatedTableOccurrences] = useState<string[]>([]);
  const [sortDialogUnrelatedTableOccurrences, setSortDialogUnrelatedTableOccurrences] = useState<string[]>([]);
  const [sortDialogFieldsByTableOccurrence, setSortDialogFieldsByTableOccurrence] = useState<Record<string, string[]>>(
    {}
  );
  const [sortDialogFieldsLoading, setSortDialogFieldsLoading] = useState(false);
  const [sortDialogFieldsError, setSortDialogFieldsError] = useState<string | null>(null);
  const [sortDialogAvailableField, setSortDialogAvailableField] = useState("");
  const [sortDialogRulesDraft, setSortDialogRulesDraft] = useState<TableSortEntry[]>([]);
  const [sortDialogSelectedIndex, setSortDialogSelectedIndex] = useState(-1);
  const [sortDialogDraftDirection, setSortDialogDraftDirection] = useState<TableSortDirection>("asc");
  const [sortDialogDraftMode, setSortDialogDraftMode] = useState<TableSortMode>("standard");
  const [sortDialogDraftValueListName, setSortDialogDraftValueListName] = useState("");
  const [sortDialogDraftKeepRecordsSorted, setSortDialogDraftKeepRecordsSorted] = useState(true);
  const [sortDialogDraftReorderBySummary, setSortDialogDraftReorderBySummary] = useState(false);
  const [sortDialogDraftSummaryField, setSortDialogDraftSummaryField] = useState("");
  const [sortDialogDraftOverrideLanguage, setSortDialogDraftOverrideLanguage] = useState(false);
  const [sortDialogDraftLanguage, setSortDialogDraftLanguage] = useState("English");
  const [leadingGrandSummary, setLeadingGrandSummary] = useState(false);
  const [trailingGrandSummary, setTrailingGrandSummary] = useState(false);
  const [leadingGroupField, setLeadingGroupField] = useState<string | null>(null);
  const [trailingGroupField, setTrailingGroupField] = useState<string | null>(null);
  const [leadingSubtotals, setLeadingSubtotals] = useState<Record<string, TableSummaryOperation[]>>({});
  const [trailingSubtotals, setTrailingSubtotals] = useState<Record<string, TableSummaryOperation[]>>({});
  const [hiddenTableFields, setHiddenTableFields] = useState<string[]>([]);
  const [tableViewOptions, setTableViewOptions] = useState<TableViewOptions>({
    showRowNumbers: true,
    alternatingRows: true,
    compactRows: false
  });
  const [containerMenu, setContainerMenu] = useState<ContainerMenuState | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const [columnSubmenu, setColumnSubmenu] = useState<ColumnSubmenuState | null>(null);
  const [quickChartOpen, setQuickChartOpen] = useState(false);
  const [quickChartConfig, setQuickChartConfig] = useState<QuickChartConfig | null>(null);
  const [savedFinds, setSavedFinds] = useState<SavedFindEntry[]>([]);
  const [recentFindIds, setRecentFindIds] = useState<string[]>([]);
  const [lastFindRequests, setLastFindRequests] = useState<FindRequestState[]>([]);
  const [lastFindLayoutId, setLastFindLayoutId] = useState("");
  const [findOptionsMenuOpen, setFindOptionsMenuOpen] = useState(false);
  const [saveFindDialogOpen, setSaveFindDialogOpen] = useState(false);
  const [saveFindDialogName, setSaveFindDialogName] = useState("");
  const [saveFindDialogRequests, setSaveFindDialogRequests] = useState<FindRequestState[]>([]);
  const [saveFindDialogEditingId, setSaveFindDialogEditingId] = useState<string | null>(null);
  const [findAdvancedDialogOpen, setFindAdvancedDialogOpen] = useState(false);
  const [findAdvancedRequestsDraft, setFindAdvancedRequestsDraft] = useState<FindRequestState[]>([]);
  const [findAdvancedSelectedRequestIndex, setFindAdvancedSelectedRequestIndex] = useState(0);
  const [findAdvancedSelectedField, setFindAdvancedSelectedField] = useState("");
  const [findAdvancedFieldValue, setFindAdvancedFieldValue] = useState("");
  const [findAdvancedSelectedCriteriaField, setFindAdvancedSelectedCriteriaField] = useState("");
  const [editSavedFindsDialogOpen, setEditSavedFindsDialogOpen] = useState(false);
  const [editSavedFindsSelectionId, setEditSavedFindsSelectionId] = useState("");
  const [editSavedFindsSortMode, setEditSavedFindsSortMode] = useState<"creation" | "name">("creation");
  const [omittedRecordIds, setOmittedRecordIds] = useState<string[]>([]);
  const [showingOmittedOnly, setShowingOmittedOnly] = useState(false);
  const clearIndicatorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const quickChartSeriesIdRef = useRef(1);
  const launchModeAppliedRef = useRef("");
  const pendingContainerUploadTargetRef = useRef<ContainerUploadTarget | null>(null);
  const containerPictureInputRef = useRef<HTMLInputElement | null>(null);
  const containerPdfInputRef = useRef<HTMLInputElement | null>(null);
  const containerFileInputRef = useRef<HTMLInputElement | null>(null);
  const runtimeCanvasWrapRef = useRef<HTMLDivElement | null>(null);
  const topMenubarRef = useRef<HTMLDivElement | null>(null);
  const findRequestInsertMenuRef = useRef<HTMLDivElement | null>(null);
  const findRequestSavedMenuRef = useRef<HTMLDivElement | null>(null);
  const findOptionsMenuRef = useRef<HTMLDivElement | null>(null);
  const containerMenuRef = useRef<HTMLDivElement | null>(null);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const columnSubmenuRef = useRef<HTMLDivElement | null>(null);
  const [runtimeCanvasViewportSize, setRuntimeCanvasViewportSize] = useState<RuntimeCanvasSize>({
    width: 0,
    height: 0
  });
  const layoutRouteName = useMemo(() => {
    return layoutId.trim() || "default";
  }, [layoutId]);
  const encodedLayoutRouteName = useMemo(
    () => encodeURIComponent(layoutRouteName),
    [layoutRouteName]
  );
  const savedFindsStorageKey = useMemo(
    () => `${SAVED_FINDS_STORAGE_KEY}.${currentWorkspaceId}`,
    [currentWorkspaceId]
  );
  const recentFindsStorageKey = useMemo(
    () => `${RECENT_FINDS_STORAGE_KEY}.${currentWorkspaceId}`,
    [currentWorkspaceId]
  );
  const launchMode = useMemo(() => {
    return parseBrowseLaunchModeToken(searchParams.get("mode")) ?? "browse";
  }, [searchParams]);
  const requestedViewMode = useMemo(() => {
    return parseBrowseViewModeToken(searchParams.get("view"));
  }, [searchParams]);
  const isPreviewMode = useMemo(() => launchMode === "preview" && !isFindMode, [isFindMode, launchMode]);
  const setPreviewReadOnlyStatus = useCallback(() => {
    setStatus(PREVIEW_READ_ONLY_STATUS);
  }, []);
  const browseScale = useMemo(() => Math.max(0.25, Math.min(3, browseZoomPercent / 100)), [browseZoomPercent]);
  const browseZoomStyle = useMemo<CSSProperties>(
    () => ({
      zoom: browseScale
    }),
    [browseScale]
  );

  useEffect(() => {
    const node = runtimeCanvasWrapRef.current;
    if (!node) {
      return;
    }

    // The runtime canvas follows available viewport space; object geometry is then adjusted by anchors.
    const measure = () => {
      const styles = window.getComputedStyle(node);
      const paddingLeft = Number.parseFloat(styles.paddingLeft || "0") || 0;
      const paddingRight = Number.parseFloat(styles.paddingRight || "0") || 0;
      const paddingTop = Number.parseFloat(styles.paddingTop || "0") || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom || "0") || 0;
      const width = Math.max(0, Math.round(node.clientWidth - paddingLeft - paddingRight));
      const height = Math.max(0, Math.round(node.clientHeight - paddingTop - paddingBottom));
      setRuntimeCanvasViewportSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    };

    measure();
    const frameId = window.requestAnimationFrame(measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(node);
    }
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [layout?.id, viewMode]);

  const restoreBrowseChartSnapshot = useCallback(
    (snapshot: LayoutBrowseChartSnapshot, fetchedRecords: FMRecord[]) => {
      const viewModeToken = String(snapshot.context?.viewMode ?? "").trim();
      if (viewModeToken === "form" || viewModeToken === "list" || viewModeToken === "table") {
        setViewMode(viewModeToken);
      }

      const normalizeSubtotals = (source: unknown): Record<string, TableSummaryOperation[]> => {
        const next: Record<string, TableSummaryOperation[]> = {};
        if (!source || typeof source !== "object" || Array.isArray(source)) {
          return next;
        }
        for (const [fieldName, rawOperations] of Object.entries(source as Record<string, unknown>)) {
          const normalizedField = fieldName.trim();
          if (!normalizedField) {
            continue;
          }
          if (!Array.isArray(rawOperations)) {
            continue;
          }
          const normalizedOperations: TableSummaryOperation[] = [];
          for (const rawOperation of rawOperations) {
            const token = String(rawOperation ?? "").trim();
            if (token === "count" || token === "sum" || token === "avg" || token === "min" || token === "max") {
              normalizedOperations.push(token);
            }
          }
          if (normalizedOperations.length > 0) {
            next[normalizedField] = normalizedOperations;
          }
        }
        return next;
      };

      const normalizedSort: TableSortEntry[] = [];
      for (const rawEntry of snapshot.sort ?? []) {
        const fieldName = String(rawEntry?.field ?? "").trim();
        if (!fieldName) {
          continue;
        }
        const direction: TableSortDirection = rawEntry.direction === "desc" ? "desc" : "asc";
        const mode: TableSortMode = rawEntry.mode === "valueList" ? "valueList" : "standard";
        const valueListValues =
          mode === "valueList" && Array.isArray(rawEntry.valueList)
            ? dedupeCaseInsensitiveStrings(rawEntry.valueList.map((entry) => String(entry ?? "")))
            : undefined;
        const valueListName = mode === "valueList" ? String(rawEntry.valueListName ?? "").trim() : "";
        normalizedSort.push({
          field: fieldName,
          direction,
          mode,
          valueList: mode === "valueList" ? valueListValues : undefined,
          valueListName: mode === "valueList" ? valueListName || undefined : undefined
        });
      }
      setTableSort(normalizedSort);
      setKeepRecordsInSortedOrder(snapshot.keepRecordsInSortedOrder !== false);

      const hiddenFields = Array.isArray(snapshot.tableView?.hiddenFields)
        ? dedupeCaseInsensitiveStrings(snapshot.tableView.hiddenFields.map((entry) => String(entry ?? "")))
        : [];
      setHiddenTableFields(hiddenFields);
      setTableViewOptions({
        showRowNumbers: snapshot.tableView?.options?.showRowNumbers !== false,
        alternatingRows: snapshot.tableView?.options?.alternatingRows !== false,
        compactRows: Boolean(snapshot.tableView?.options?.compactRows)
      });
      setLeadingGrandSummary(Boolean(snapshot.tableView?.leadingGrandSummary));
      setTrailingGrandSummary(Boolean(snapshot.tableView?.trailingGrandSummary));
      setLeadingGroupField(String(snapshot.tableView?.leadingGroupField ?? "").trim() || null);
      setTrailingGroupField(String(snapshot.tableView?.trailingGroupField ?? "").trim() || null);
      setLeadingSubtotals(normalizeSubtotals(snapshot.tableView?.leadingSubtotals));
      setTrailingSubtotals(normalizeSubtotals(snapshot.tableView?.trailingSubtotals));

      const rawChartConfig = snapshot.chart?.config;
      if (rawChartConfig) {
        const chartTypeToken = String(rawChartConfig.type ?? "").trim() as FileMakerChartType;
        const chartType = FILEMAKER_CHART_TYPE_SET.has(chartTypeToken) ? chartTypeToken : "column";
        const normalizedSeries: QuickChartSeries[] = Array.isArray(rawChartConfig.series)
          ? rawChartConfig.series
              .map((series, index) => {
                const fieldName = String(series?.field ?? "").trim();
                if (!fieldName) {
                  return null;
                }
                const summaryToken = String(series.summary ?? "").trim() as FileMakerChartSummaryType;
                const summary = FILEMAKER_CHART_SUMMARY_SET.has(summaryToken) ? summaryToken : "count";
                return {
                  id: String(series.id ?? `saved-series-${index}`),
                  name: String(series.name ?? "").trim() || fieldName,
                  field: fieldName,
                  summary,
                  color: String(series.color ?? "").trim() || chartSeriesColor(index)
                } satisfies QuickChartSeries;
              })
              .filter((series): series is QuickChartSeries => Boolean(series))
          : [];
        if (normalizedSeries.length > 0) {
          setQuickChartConfig({
            title: String(rawChartConfig.title ?? "").trim() || `${normalizedSeries[0].field} Chart`,
            type: chartType,
            xAxisField: String(rawChartConfig.xAxisField ?? "").trim() || normalizedSeries[0].field,
            xAxisTitle: String(rawChartConfig.xAxisTitle ?? "").trim() || String(rawChartConfig.xAxisField ?? "").trim(),
            yAxisTitle: String(rawChartConfig.yAxisTitle ?? "").trim() || "Value",
            showLegend: rawChartConfig.showLegend !== false,
            labelField: String(rawChartConfig.labelField ?? "").trim() || String(rawChartConfig.xAxisField ?? "").trim(),
            bubbleRadiusField: String(rawChartConfig.bubbleRadiusField ?? "").trim() || normalizedSeries[0].field,
            series: normalizedSeries
          });
        }
      }
      setQuickChartOpen(false);

      const rawFindCriteria = snapshot.context?.findCriteria ?? {};
      const normalizedFindCriteria: FindCriteriaMap = {};
      for (const [fieldName, criterion] of Object.entries(rawFindCriteria)) {
        const normalizedField = fieldName.trim();
        const normalizedCriterion = String(criterion ?? "").trim();
        if (!normalizedField || !normalizedCriterion) {
          continue;
        }
        normalizedFindCriteria[normalizedField] = normalizedCriterion;
      }

      const snapshotRecordIds =
        Array.isArray(snapshot.foundSet?.recordIds)
          ? snapshot.foundSet.recordIds
              .map((entry) => String(entry ?? "").trim())
              .filter((entry) => entry.length > 0)
          : [];
      let visibleRecords = fetchedRecords;
      if (snapshotRecordIds.length > 0) {
        const byId = new Map<string, FMRecord>();
        for (const record of fetchedRecords) {
          const recordId = String(record.recordId ?? "").trim();
          if (recordId) {
            byId.set(recordId, record);
          }
        }
        const matched = snapshotRecordIds
          .map((recordId) => byId.get(recordId))
          .filter((record): record is FMRecord => Boolean(record));
        if (matched.length > 0) {
          visibleRecords = matched;
        }
      }
      if (visibleRecords.length === 0 && Object.keys(normalizedFindCriteria).length > 0) {
        const duplicateFieldValueMap = buildDuplicateFindFieldValueMap(fetchedRecords, normalizedFindCriteria);
        visibleRecords = fetchedRecords.filter((record) =>
          recordMatchesFindCriteria(record, normalizedFindCriteria, duplicateFieldValueMap)
        );
      }
      if (visibleRecords.length === 0 && Array.isArray(snapshot.foundSet?.snapshotRows)) {
        const snapshotRows = snapshot.foundSet.snapshotRows;
        visibleRecords = snapshotRows.map((row, rowIndex) => ({
          recordId: row.recordId || `snapshot-${rowIndex + 1}`,
          ...row.values
        }));
      }

      const requestedIndex = Number(snapshot.context?.currentRecordIndex ?? 0);
      const initialIndex =
        Number.isFinite(requestedIndex) && visibleRecords.length > 0
          ? Math.max(0, Math.min(visibleRecords.length - 1, Math.trunc(requestedIndex)))
          : 0;

      return {
        visibleRecords,
        initialIndex,
        hasSnapshot: true
      };
    },
    []
  );

  const loadAll = useCallback(async (options?: { indexMode?: "preserve" | "last" }) => {
    setStatus("Loading layout and records...");
    setError(null);
    setFileMakerConnectionFailed(false);
    setFieldSaveStatus({});
    setContainerLoadFailed({});
    setContainerUploadState({});
    setSortDialogFieldsByTableOccurrence({});
    setSortDialogRelatedTableOccurrences([]);
    setSortDialogUnrelatedTableOccurrences([]);
    setSortDialogFieldsError(null);

    const layoutRes = await fetch(withWorkspaceForApi(`/api/layouts/${encodeURIComponent(layoutId)}`), {
      cache: "no-store"
    });
    if (!layoutRes.ok) {
      const body = await layoutRes.text();
      setError(`Layout load failed: ${body}`);
      return null;
    }

    const layoutPayload = (await layoutRes.json()) as {
      layout: LayoutDefinition;
    };

    setLayout(layoutPayload.layout);
    setActiveLayoutName(
      layoutPayload.layout.name?.trim() ||
      layoutPayload.layout.defaultTableOccurrence?.trim() ||
      layoutId.trim()
    );

    try {
      const fieldsRes = await fetch(
        withWorkspaceForApi(`/api/fm/fields?tableOccurrence=${encodeURIComponent(layoutPayload.layout.defaultTableOccurrence)}`),
        { cache: "no-store" }
      );
      if (fieldsRes.ok) {
        const fieldsPayload = (await fieldsRes.json()) as FieldCatalogPayload;
        const nextFieldTypes: Record<string, string> = {};
        for (const fieldEntry of fieldsPayload.fields) {
          if (typeof fieldEntry === "string") {
            const normalized = normalizedFieldToken(fieldEntry);
            if (normalized) {
              nextFieldTypes[normalized] = "Text";
            }
            continue;
          }
          const normalized = normalizedFieldToken(fieldEntry.name);
          if (!normalized) {
            continue;
          }
          nextFieldTypes[normalized] = fieldEntry.type || "Text";
          const unqualified = unqualifiedFieldToken(fieldEntry.name);
          if (unqualified && !nextFieldTypes[unqualified]) {
            nextFieldTypes[unqualified] = fieldEntry.type || "Text";
          }
        }
        setFieldTypeByName(nextFieldTypes);
      } else {
        setFieldTypeByName({});
      }
    } catch {
      setFieldTypeByName({});
    }

    try {
      const valueListsRes = await fetch(withWorkspaceForApi("/api/fm/value-lists?scope=database"), { cache: "no-store" });
      if (valueListsRes.ok) {
        const valueListsPayload = (await valueListsRes.json()) as ValueListPayload;
        const byName: Record<string, string[]> = {};
        const itemsByName: Record<string, ValueListItem[]> = {};
        for (const entry of valueListsPayload.valueLists) {
          const name = String(entry.name ?? "").trim();
          if (!name) {
            continue;
          }
          const normalizedItems = dedupeValueListItems(
            Array.isArray(entry.items)
              ? entry.items
                  .map((item) => ({
                    value: String(item?.value ?? "").trim(),
                    displayValue: String(item?.displayValue ?? "").trim()
                  }))
                  .filter((item) => item.value.length > 0 || item.displayValue.length > 0)
              : []
          );
          const fallbackValues = Array.isArray(entry.values)
            ? entry.values.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)
            : [];
          const items =
            normalizedItems.length > 0
              ? normalizedItems
              : dedupeValueListItems(
                  fallbackValues.map((value) => ({
                    value,
                    displayValue: value
                  }))
                );
          byName[name] = dedupeCaseInsensitiveStrings(items.map((item) => item.displayValue));
          itemsByName[name] = items;
        }
        setValueListsByName(byName);
        setValueListItemsByName(itemsByName);
        setValueListsSource(valueListsPayload.source);
        setValueListsError(null);
      } else {
        let message = "Failed to load value lists";
        try {
          const errorPayload = (await valueListsRes.json()) as { error?: string };
          if (errorPayload.error) {
            message = errorPayload.error;
          }
        } catch {
          message = await valueListsRes.text();
        }
        setValueListsByName({});
        setValueListItemsByName({});
        setValueListsError(message);
      }
    } catch {
      setValueListsByName({});
      setValueListItemsByName({});
      setValueListsError("Failed to fetch value lists");
    }

    const recordRes = await fetch(
      withWorkspaceForApi(`/api/fm/records?tableOccurrence=${encodeURIComponent(layoutPayload.layout.defaultTableOccurrence)}`),
      { cache: "no-store" }
    );

    if (!recordRes.ok) {
      let sourceHint: "mock" | "filemaker" | undefined;
      let message = "";
      try {
        const payload = (await recordRes.json()) as RecordErrorPayload;
        sourceHint = payload.source;
        message = payload.error ?? JSON.stringify(payload);
      } catch {
        message = await recordRes.text();
      }

      if (sourceHint) {
        setSource(sourceHint);
      }
      if (sourceHint === "filemaker") {
        setFileMakerConnectionFailed(true);
        setStatus("FileMaker connection failed (not mock mode)");
      }

      setError(`Record load failed: ${message}`);
      return null;
    }

    const recordPayload = (await recordRes.json()) as RecordPayload;
    const snapshot = layoutPayload.layout.browseChartSnapshot;
    const restored = snapshot ? restoreBrowseChartSnapshot(snapshot, recordPayload.records) : null;
    const visibleRecords = restored?.visibleRecords ?? recordPayload.records;
    setRecords(visibleRecords);
    setAllRecords(recordPayload.records);
    setFindCriteria({});
    setIsFindMode(false);
    setOmittedRecordIds([]);
    setShowingOmittedOnly(false);
    setSource(recordPayload.source);
    if (restored) {
      setIndex(restored.initialIndex);
    } else {
      setIndex((currentIndex) => {
        if (options?.indexMode === "last") {
          return Math.max(0, visibleRecords.length - 1);
        }
        const last = Math.max(0, visibleRecords.length - 1);
        return Math.min(currentIndex, last);
      });
    }
    setFileMakerConnectionFailed(false);
    setStatus(
      restored
        ? `Loaded ${visibleRecords.length} record(s) from saved chart layout`
        : `Loaded ${recordPayload.records.length} record(s)`
    );

    return {
      layout: layoutPayload.layout,
      records: recordPayload.records
    };
  }, [layoutId, restoreBrowseChartSnapshot, withWorkspaceForApi]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const rawSavedFinds = window.localStorage.getItem(savedFindsStorageKey);
      if (rawSavedFinds) {
        const parsed = JSON.parse(rawSavedFinds) as unknown;
        if (Array.isArray(parsed)) {
          const normalized: SavedFindEntry[] = [];
          for (const rawEntry of parsed) {
            if (!rawEntry || typeof rawEntry !== "object") {
              continue;
            }
            const candidate = rawEntry as Record<string, unknown>;
            const id = String(candidate.id ?? "").trim();
            const name = String(candidate.name ?? "").trim();
            const rawRequests = Array.isArray(candidate.requests) ? candidate.requests : [];
            const requests = rawRequests
              .filter((request) => Boolean(request) && typeof request === "object")
              .map((request) => {
                const requestCandidate = request as Record<string, unknown>;
                const criteria =
                  requestCandidate.criteria && typeof requestCandidate.criteria === "object"
                    ? normalizeFindCriteriaMap(requestCandidate.criteria as FindCriteriaMap)
                    : {};
                return {
                  id: String(requestCandidate.id ?? crypto.randomUUID()).trim() || crypto.randomUUID(),
                  criteria,
                  omit: Boolean(requestCandidate.omit)
                } satisfies FindRequestState;
              });
            if (!id || !name || requests.length === 0) {
              continue;
            }
            normalized.push({
              id,
              name,
              requests,
              createdAt:
                typeof candidate.createdAt === "number"
                  ? candidate.createdAt
                  : Date.now(),
              lastRunAt:
                typeof candidate.lastRunAt === "number"
                  ? candidate.lastRunAt
                  : undefined,
              layoutId: String(candidate.layoutId ?? "").trim() || undefined
            });
          }
          if (normalized.length > 0) {
            setSavedFinds(normalized);
          }
        }
      }

      const rawRecentFindIds = window.localStorage.getItem(recentFindsStorageKey);
      if (rawRecentFindIds) {
        const parsed = JSON.parse(rawRecentFindIds) as unknown;
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((entry) => String(entry ?? "").trim())
            .filter((entry) => entry.length > 0)
            .slice(0, MAX_RECENT_FINDS);
          if (normalized.length > 0) {
            setRecentFindIds(normalized);
          }
        }
      }
    } catch {
      // ignore local storage parsing errors
    }
  }, [recentFindsStorageKey, savedFindsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(savedFindsStorageKey, JSON.stringify(savedFinds));
    } catch {
      // ignore local storage write failures
    }
  }, [savedFinds, savedFindsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(recentFindsStorageKey, JSON.stringify(recentFindIds.slice(0, MAX_RECENT_FINDS)));
    } catch {
      // ignore local storage write failures
    }
  }, [recentFindIds, recentFindsStorageKey]);

  const loadWorkspaceCatalog = useCallback(async () => {
    setWorkspaceCatalogLoading(true);
    try {
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      if (!response.ok) {
        setWorkspaceCatalog((previous) =>
          previous.length > 0
            ? previous
            : [
                {
                  id: currentWorkspaceId,
                  name: currentWorkspaceId
                }
              ]
        );
        setWorkspaceCatalogLoading(false);
        return;
      }

      const payload = (await response.json()) as WorkspaceCatalogPayload;
      const entries = Array.isArray(payload.workspaces)
        ? payload.workspaces
            .map((entry) => ({
              id: normalizeWorkspaceToken(entry.id),
              name: String(entry.name ?? "").trim() || normalizeWorkspaceToken(entry.id),
              filemaker: {
                host: entry.filemaker?.host ?? null,
                database: entry.filemaker?.database ?? null,
                solutionName: entry.filemaker?.solutionName ?? null
              }
            }))
            .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
        : [];

      const withCurrent =
        entries.some((entry) => entry.id === currentWorkspaceId)
          ? entries
          : [
              ...entries,
              {
                id: currentWorkspaceId,
                name: currentWorkspaceId
              }
            ];
      setWorkspaceCatalog(withCurrent);
      setWorkspaceTabs((previous) => dedupeWorkspaceIds([...previous, currentWorkspaceId]));
      setWorkspaceCatalogLoading(false);
    } catch {
      setWorkspaceCatalog((previous) =>
        previous.length > 0
          ? previous
          : [
              {
                id: currentWorkspaceId,
                name: currentWorkspaceId
              }
            ]
      );
      setWorkspaceCatalogLoading(false);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    void loadWorkspaceCatalog();
  }, [loadWorkspaceCatalog]);

  const loadLayoutCatalog = useCallback(async () => {
    setLayoutsLoading(true);
    setLayoutsError(null);
    try {
      const response = await fetch(withWorkspaceForApi("/api/fm/layouts"), { cache: "no-store" });
      if (!response.ok) {
        let message = "";
        try {
          const payload = (await response.json()) as { error?: string };
          message = payload.error ?? "Failed to load layout list";
        } catch {
          message = await response.text();
        }
        setAvailableLayouts([]);
        setAvailableLayoutFolders([]);
        setLayoutsError(message);
        setLayoutsLoading(false);
        return;
      }

      const payload = (await response.json()) as LayoutCatalogPayload;
      const normalizedFolders = normalizeLayoutFolderGroups(payload.layoutFolders);
      const normalizedLayouts =
        payload.layouts && payload.layouts.length > 0
          ? [...new Set(payload.layouts.map((name) => String(name ?? "").trim()).filter((name) => name.length > 0))]
          : normalizedFolders.flatMap((group) => group.layouts);
      setAvailableLayouts(normalizedLayouts);
      setAvailableLayoutFolders(normalizedFolders);
      setLayoutsLoading(false);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch layout list";
      setAvailableLayouts([]);
      setAvailableLayoutFolders([]);
      setLayoutsError(message);
      setLayoutsLoading(false);
    }
  }, [withWorkspaceForApi]);

  useEffect(() => {
    void loadLayoutCatalog();
  }, [loadLayoutCatalog]);

  const loadScriptCatalog = useCallback(async () => {
    setScriptsLoading(true);
    setScriptsError(null);
    try {
      const response = await fetch(withWorkspaceForApi("/api/fm/scripts"), { cache: "no-store" });
      if (!response.ok) {
        let message = "";
        let sourceHint: "mock" | "filemaker" | undefined;
        try {
          const payload = (await response.json()) as { error?: string; source?: "mock" | "filemaker" };
          message = payload.error ?? "Failed to load scripts";
          sourceHint = payload.source;
        } catch {
          message = await response.text();
        }
        if (sourceHint) {
          setScriptsSource(sourceHint);
        }
        setAvailableScripts([]);
        setScriptsError(message);
        setScriptsLoading(false);
        return;
      }

      const payload = (await response.json()) as {
        source: "mock" | "filemaker";
        scripts: string[];
      };
      const normalizedScripts = dedupeCaseInsensitiveStrings(
        Array.isArray(payload.scripts) ? payload.scripts.map((entry) => String(entry ?? "").trim()) : []
      );
      setAvailableScripts(normalizedScripts);
      setScriptsSource(payload.source);
      setScriptsLoading(false);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch scripts";
      setAvailableScripts([]);
      setScriptsError(message);
      setScriptsLoading(false);
    }
  }, [withWorkspaceForApi]);

  useEffect(() => {
    void loadScriptCatalog();
  }, [loadScriptCatalog]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(clearIndicatorTimers.current)) {
        clearTimeout(timer);
      }
      clearIndicatorTimers.current = {};
    };
  }, []);

  const findRequestRecord = useMemo<FMRecord>(() => {
    return {
      recordId: "__find_request__",
      ...findCriteria
    };
  }, [findCriteria]);

  const currentRecord = useMemo(() => {
    if (isFindMode) {
      return findRequestRecord;
    }
    if (!records.length) {
      return null;
    }

    return records[Math.min(index, records.length - 1)] ?? null;
  }, [findRequestRecord, index, isFindMode, records]);

  const sortedComponents = useMemo(() => {
    if (!layout) {
      return [];
    }

    return sortComponentsByArrangeOrder(layout.components);
  }, [layout]);
  const layoutRuntimeClass = useMemo(
    () => (layout ? `runtime-layout-${styleToken(layout.name)}` : ""),
    [layout]
  );
  const runtimeCanvasBaseSize = useMemo<RuntimeCanvasSize>(
    () => ({
      width: Math.max(64, Math.round(Number(layout?.canvas.width ?? 1200) || 1200)),
      height: Math.max(64, Math.round(Number(layout?.canvas.height ?? 900) || 900))
    }),
    [layout?.canvas.height, layout?.canvas.width]
  );
  const runtimeCanvasSize = useMemo<RuntimeCanvasSize>(() => {
    const canvas = layout?.canvas;
    const width = resolveRuntimeCanvasDimension(
      runtimeCanvasBaseSize.width,
      runtimeCanvasViewportSize.width,
      resolveAnchorEnabled(canvas?.autosizeRight, true)
    );
    const height = resolveRuntimeCanvasDimension(
      runtimeCanvasBaseSize.height,
      runtimeCanvasViewportSize.height,
      resolveAnchorEnabled(canvas?.autosizeBottom, true)
    );
    return { width, height };
  }, [
    layout?.canvas?.autosizeBottom,
    layout?.canvas?.autosizeRight,
    runtimeCanvasBaseSize.height,
    runtimeCanvasBaseSize.width,
    runtimeCanvasViewportSize.height,
    runtimeCanvasViewportSize.width
  ]);
  const runtimeComponentFrames = useMemo(() => {
    const frames: Record<string, RuntimeComponentFrame> = {};
    for (const component of sortedComponents) {
      frames[component.id] = resolveRuntimeComponentFrame(component, runtimeCanvasBaseSize, runtimeCanvasSize);
    }
    return frames;
  }, [runtimeCanvasBaseSize, runtimeCanvasSize, sortedComponents]);

  const boundFieldNames = useMemo(() => {
    const names = new Set<string>();
    for (const component of sortedComponents) {
      if (component.type === "field" && component.binding?.field) {
        const key = bindingFieldKey(
          component.binding.field,
          component.binding.tableOccurrence,
          layout?.defaultTableOccurrence
        );
        if (key) {
          names.add(key);
        }
      }
    }
    return [...names];
  }, [layout?.defaultTableOccurrence, sortedComponents]);

  const fieldControlTypeByName = useMemo(() => {
    const byName: Record<string, FieldControlType> = {};
    for (const component of sortedComponents) {
      if (component.type !== "field") {
        continue;
      }
      const fieldName = component.binding?.field;
      if (!fieldName) {
        continue;
      }
      const fieldKey = bindingFieldKey(
        fieldName,
        component.binding?.tableOccurrence,
        layout?.defaultTableOccurrence
      );
      const controlType = component.props.controlType ?? "text";
      byName[fieldKey] = controlType;
      byName[normalizedFieldToken(fieldKey)] = controlType;
      byName[fieldName] = controlType;
      byName[normalizedFieldToken(fieldName)] = controlType;
      const unqualified = unqualifiedFieldToken(fieldKey);
      if (!byName[unqualified]) {
        byName[unqualified] = controlType;
      }
    }
    return byName;
  }, [layout?.defaultTableOccurrence, sortedComponents]);

  const fieldComponentByName = useMemo(() => {
    const byName: Record<string, LayoutComponent> = {};
    for (const component of sortedComponents) {
      if (component.type !== "field") {
        continue;
      }
      const fieldName = component.binding?.field;
      if (!fieldName) {
        continue;
      }
      const fieldKey = bindingFieldKey(
        fieldName,
        component.binding?.tableOccurrence,
        layout?.defaultTableOccurrence
      );
      const register = (key: string) => {
        const normalized = key.trim();
        if (!normalized) {
          return;
        }
        const lowered = normalizedFieldToken(normalized);
        if (!byName[normalized]) {
          byName[normalized] = component;
        }
        if (!byName[lowered]) {
          byName[lowered] = component;
        }
      };
      register(fieldKey);
      register(fieldName);
      register(unqualifiedFieldToken(fieldKey));
    }
    return byName;
  }, [layout?.defaultTableOccurrence, sortedComponents]);

  const fieldValueListNameByField = useMemo(() => {
    const byName: Record<string, string> = {};
    for (const component of sortedComponents) {
      if (component.type !== "field") {
        continue;
      }
      const fieldName = component.binding?.field;
      const valueListName = (component.props.valueList ?? "").trim();
      if (!fieldName || !valueListName) {
        continue;
      }
      const fieldKey = bindingFieldKey(
        fieldName,
        component.binding?.tableOccurrence,
        layout?.defaultTableOccurrence
      );
      byName[fieldKey] = valueListName;
      byName[normalizedFieldToken(fieldKey)] = valueListName;
      byName[fieldName] = valueListName;
      byName[normalizedFieldToken(fieldName)] = valueListName;
      const unqualified = unqualifiedFieldToken(fieldKey);
      if (!byName[unqualified]) {
        byName[unqualified] = valueListName;
      }
    }
    return byName;
  }, [layout?.defaultTableOccurrence, sortedComponents]);

  const popupSettingsByField = useMemo(() => {
    const byName: Record<string, PopupMenuSettings> = {};
    for (const component of sortedComponents) {
      if (component.type !== "field") {
        continue;
      }
      const fieldName = component.binding?.field;
      if (!fieldName) {
        continue;
      }
      const fieldKey = bindingFieldKey(
        fieldName,
        component.binding?.tableOccurrence,
        layout?.defaultTableOccurrence
      );
      const settings: PopupMenuSettings = {
        includeArrow: component.props.valueListIncludeArrow !== false,
        allowOtherValues: Boolean(component.props.valueListAllowOtherValues),
        allowEditing: Boolean(component.props.valueListAllowEditing),
        overrideFormatting: Boolean(component.props.valueListOverrideFormatting)
      };
      byName[fieldKey] = settings;
      byName[normalizedFieldToken(fieldKey)] = settings;
      byName[fieldName] = settings;
      byName[normalizedFieldToken(fieldName)] = settings;
      const unqualified = unqualifiedFieldToken(fieldKey);
      if (!byName[unqualified]) {
        byName[unqualified] = settings;
      }
    }
    return byName;
  }, [layout?.defaultTableOccurrence, sortedComponents]);

  const dateSettingsByField = useMemo(() => {
    const byName: Record<string, DateControlSettings> = {};
    for (const component of sortedComponents) {
      if (component.type !== "field") {
        continue;
      }
      const fieldName = component.binding?.field;
      if (!fieldName) {
        continue;
      }
      const fieldKey = bindingFieldKey(
        fieldName,
        component.binding?.tableOccurrence,
        layout?.defaultTableOccurrence
      );
      const settings: DateControlSettings = {
        includeIcon: component.props.calendarIncludeIcon !== false,
        autoCompleteExisting: Boolean(component.props.dateAutoCompleteExisting)
      };
      byName[fieldKey] = settings;
      byName[normalizedFieldToken(fieldKey)] = settings;
      byName[fieldName] = settings;
      byName[normalizedFieldToken(fieldName)] = settings;
      const unqualified = unqualifiedFieldToken(fieldKey);
      if (!byName[unqualified]) {
        byName[unqualified] = settings;
      }
    }
    return byName;
  }, [layout?.defaultTableOccurrence, sortedComponents]);

  const resolveControlTypeForField = useCallback(
    (fieldName: string): FieldControlType => {
      return (
        fieldControlTypeByName[fieldName] ??
        fieldControlTypeByName[normalizedFieldToken(fieldName)] ??
        fieldControlTypeByName[unqualifiedFieldToken(fieldName)] ??
        "text"
      );
    },
    [fieldControlTypeByName]
  );

  const resolveValueListNameForField = useCallback(
    (fieldName: string): string => {
      return (
        fieldValueListNameByField[fieldName] ??
        fieldValueListNameByField[normalizedFieldToken(fieldName)] ??
        fieldValueListNameByField[unqualifiedFieldToken(fieldName)] ??
        ""
      );
    },
    [fieldValueListNameByField]
  );

  const resolveDisplayValueForField = useCallback(
    (fieldName: string, storedValue: unknown): string => {
      const text = String(storedValue ?? "").trim();
      if (!text) {
        return "";
      }
      const valueListName = resolveValueListNameForField(fieldName);
      if (!valueListName) {
        return text;
      }
      const entries = valueListItemsByName[valueListName] ?? [];
      const direct = entries.find((entry) => entry.value === text);
      if (direct) {
        return direct.displayValue;
      }
      const normalized = text.toLowerCase();
      const insensitive = entries.find((entry) => entry.value.toLowerCase() === normalized);
      return insensitive?.displayValue ?? text;
    },
    [resolveValueListNameForField, valueListItemsByName]
  );

  const resolveStoredValueForField = useCallback(
    (fieldName: string, displayValue: unknown): string => {
      const text = String(displayValue ?? "").trim();
      if (!text) {
        return "";
      }
      const valueListName = resolveValueListNameForField(fieldName);
      if (!valueListName) {
        return text;
      }
      const entries = valueListItemsByName[valueListName] ?? [];
      const direct = entries.find((entry) => entry.displayValue === text);
      if (direct) {
        return direct.value;
      }
      const normalized = text.toLowerCase();
      const insensitive = entries.find((entry) => entry.displayValue.toLowerCase() === normalized);
      return insensitive?.value ?? text;
    },
    [resolveValueListNameForField, valueListItemsByName]
  );

  const resolveValueListOptionsForField = useCallback(
    (fieldName: string, currentValue: unknown): string[] => {
      const valueListName = resolveValueListNameForField(fieldName);
      const fromItems = valueListName ? valueListItemsByName[valueListName] ?? [] : [];
      const fromList =
        fromItems.length > 0
          ? fromItems.map((entry) => entry.displayValue)
          : valueListName
            ? valueListsByName[valueListName] ?? []
            : [];
      const withCurrent = [...fromList];
      const currentText = resolveDisplayValueForField(fieldName, currentValue);
      if (currentText) {
        withCurrent.unshift(currentText);
      }
      return dedupeCaseInsensitiveStrings(withCurrent);
    },
    [resolveDisplayValueForField, resolveValueListNameForField, valueListItemsByName, valueListsByName]
  );

  const resolvePopupSettingsForField = useCallback(
    (fieldName: string): PopupMenuSettings => {
      const resolved =
        popupSettingsByField[fieldName] ??
        popupSettingsByField[normalizedFieldToken(fieldName)] ??
        popupSettingsByField[unqualifiedFieldToken(fieldName)];
      return resolved ?? DEFAULT_POPUP_MENU_SETTINGS;
    },
    [popupSettingsByField]
  );

  const resolveDateSettingsForField = useCallback(
    (fieldName: string): DateControlSettings => {
      const resolved =
        dateSettingsByField[fieldName] ??
        dateSettingsByField[normalizedFieldToken(fieldName)] ??
        dateSettingsByField[unqualifiedFieldToken(fieldName)];
      return resolved ?? DEFAULT_DATE_CONTROL_SETTINGS;
    },
    [dateSettingsByField]
  );

  const existingValuesByField = useMemo(() => {
    const byName: Record<string, string[]> = {};

    const addValue = (fieldKey: string, raw: unknown) => {
      const value = String(raw ?? "").trim();
      if (!value) {
        return;
      }
      const keys = [
        fieldKey,
        normalizedFieldToken(fieldKey),
        unqualifiedFieldToken(fieldKey)
      ].filter((entry) => entry.length > 0);
      for (const key of keys) {
        const current = byName[key] ?? [];
        current.push(value);
        byName[key] = current;
      }
    };

    for (const record of records) {
      for (const [fieldName, value] of Object.entries(record)) {
        if (fieldName === "recordId" || fieldName === "modId" || fieldName === "portalData") {
          continue;
        }
        addValue(fieldName, value);
      }
      for (const fieldName of boundFieldNames) {
        addValue(fieldName, mergeFieldValue(record, fieldName));
      }
    }

    const normalized: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(byName)) {
      normalized[key] = dedupeCaseInsensitiveStrings(values);
    }
    return normalized;
  }, [boundFieldNames, records]);

  const resolveExistingValuesForField = useCallback(
    (fieldName: string, currentValue: unknown): string[] => {
      const fromMap =
        existingValuesByField[fieldName] ??
        existingValuesByField[normalizedFieldToken(fieldName)] ??
        existingValuesByField[unqualifiedFieldToken(fieldName)] ??
        [];
      const currentText = String(currentValue ?? "").trim();
      return currentText
        ? dedupeCaseInsensitiveStrings([currentText, ...fromMap])
        : fromMap;
    },
    [existingValuesByField]
  );

  const viewFieldNames = useMemo(() => {
    if (boundFieldNames.length > 0) {
      return boundFieldNames;
    }

    const names = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (key === "recordId" || key === "modId" || key === "portalData") {
          continue;
        }
        names.add(key);
      }
    }
    return [...names];
  }, [boundFieldNames, records]);

  const tableFieldNames = useMemo(() => {
    if (hiddenTableFields.length === 0) {
      return viewFieldNames;
    }
    const hiddenSet = new Set(hiddenTableFields);
    return viewFieldNames.filter((fieldName) => !hiddenSet.has(fieldName));
  }, [hiddenTableFields, viewFieldNames]);
  const currentTableOccurrence = layout?.defaultTableOccurrence?.trim() ?? "";
  const sortDialogFieldNames = useMemo(() => {
    const activeContext = sortDialogContext.trim();
    if (activeContext === SORT_CONTEXT_CURRENT_LAYOUT) {
      return [...viewFieldNames].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
    }
    const targetTableOccurrence =
      activeContext === SORT_CONTEXT_CURRENT_TABLE ? currentTableOccurrence : activeContext;
    if (!targetTableOccurrence) {
      return [];
    }
    const fields = sortDialogFieldsByTableOccurrence[targetTableOccurrence] ?? [];
    return [...fields].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [currentTableOccurrence, sortDialogContext, sortDialogFieldsByTableOccurrence, viewFieldNames]);
  const sortDialogValueListNames = useMemo(
    () =>
      Object.keys(valueListsByName).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      ),
    [valueListsByName]
  );
  const findCriteriaFieldNames = useMemo(() => {
    const names = new Set<string>();
    for (const fieldName of viewFieldNames) {
      const token = fieldName.trim();
      if (token) {
        names.add(token);
      }
    }
    for (const fieldName of tableFieldNames) {
      const token = fieldName.trim();
      if (token) {
        names.add(token);
      }
    }
    for (const [tableOccurrence, fields] of Object.entries(sortDialogFieldsByTableOccurrence)) {
      const normalizedTableOccurrence = tableOccurrence.trim();
      for (const fieldName of fields) {
        const normalizedFieldName = fieldName.trim();
        if (!normalizedFieldName) {
          continue;
        }
        names.add(normalizedFieldName);
        if (
          normalizedTableOccurrence &&
          !normalizedFieldName.includes("::")
        ) {
          names.add(`${normalizedTableOccurrence}::${normalizedFieldName}`);
        }
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [sortDialogFieldsByTableOccurrence, tableFieldNames, viewFieldNames]);
  const layoutRelatedTableOccurrences = useMemo(() => {
    const names = new Set<string>();
    for (const component of sortedComponents) {
      const tableOccurrence = (component.binding?.tableOccurrence ?? "").trim();
      if (tableOccurrence && tableOccurrence.toLowerCase() !== currentTableOccurrence.toLowerCase()) {
        names.add(tableOccurrence);
      }
      const fieldName = (component.binding?.field ?? "").trim();
      if (fieldName.includes("::")) {
        const relationToken = fieldName.split("::")[0]?.trim() ?? "";
        if (relationToken && relationToken.toLowerCase() !== currentTableOccurrence.toLowerCase()) {
          names.add(relationToken);
        }
      }
    }
    for (const fieldName of viewFieldNames) {
      const token = fieldName.trim();
      if (!token.includes("::")) {
        continue;
      }
      const relationToken = token.split("::")[0]?.trim() ?? "";
      if (relationToken && relationToken.toLowerCase() !== currentTableOccurrence.toLowerCase()) {
        names.add(relationToken);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [currentTableOccurrence, sortedComponents, viewFieldNames]);

  const sortedRecordRows = useMemo(() => {
    const rows = records.map((record, originalIndex) => ({
      record,
      originalIndex,
      key: record.recordId ?? `row-${originalIndex}`
    }));

    if (tableSort.length === 0) {
      return rows;
    }

    const next = [...rows];
    next.sort((leftRow, rightRow) => {
      for (const sortEntry of tableSort) {
        const leftValue = mergeFieldValue(leftRow.record, sortEntry.field);
        const rightValue = mergeFieldValue(rightRow.record, sortEntry.field);

        let comparison = 0;
        if (sortEntry.mode === "valueList" && sortEntry.valueList && sortEntry.valueList.length > 0) {
          const order = new Map<string, number>();
          for (const [indexInList, entry] of sortEntry.valueList.entries()) {
            order.set(entry.toLowerCase(), indexInList);
          }
          const leftIndex = order.get(String(leftValue ?? "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = order.get(String(rightValue ?? "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
          comparison = leftIndex - rightIndex;
          if (comparison === 0) {
            comparison = compareComparableValues(comparableValue(leftValue), comparableValue(rightValue));
          }
        } else {
          comparison = compareComparableValues(comparableValue(leftValue), comparableValue(rightValue));
        }

        if (comparison !== 0) {
          return sortEntry.direction === "asc" ? comparison : -comparison;
        }
      }

      return leftRow.originalIndex - rightRow.originalIndex;
    });

    return next;
  }, [records, tableSort]);

  const distinctColumnValues = useMemo(() => {
    if (!columnMenu) {
      return [] as string[];
    }
    const values: string[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      const raw = mergeFieldValue(record, columnMenu.field);
      const token = String(raw ?? "").trim();
      if (!token) {
        continue;
      }
      const normalized = token.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      values.push(token);
    }
    return values;
  }, [columnMenu, records]);

  const makeSummaryValues = useCallback(
    (
      recordSet: FMRecord[],
      subtotalConfig: Record<string, TableSummaryOperation[]>,
      fallbackFirstFieldCount: boolean
    ): Record<string, string> => {
      const values: Record<string, string> = {};
      for (const fieldName of tableFieldNames) {
        const ops = subtotalConfig[fieldName] ?? [];
        if (!ops.length) {
          continue;
        }
        const chunks: string[] = [];
        for (const op of ops) {
          if (op === "count") {
            const count = recordSet.filter((record) => {
              const value = mergeFieldValue(record, fieldName);
              return value != null && value !== "";
            }).length;
            chunks.push(`${subtotalLabel(op)}: ${count}`);
            continue;
          }

          const numbers = numericValues(recordSet, fieldName);
          if (!numbers.length) {
            chunks.push(`${subtotalLabel(op)}: -`);
            continue;
          }

          if (op === "sum") {
            const total = numbers.reduce((sum, value) => sum + value, 0);
            chunks.push(`${subtotalLabel(op)}: ${total}`);
          } else if (op === "avg") {
            const avg = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
            chunks.push(`${subtotalLabel(op)}: ${avg.toFixed(2)}`);
          } else if (op === "min") {
            chunks.push(`${subtotalLabel(op)}: ${Math.min(...numbers)}`);
          } else if (op === "max") {
            chunks.push(`${subtotalLabel(op)}: ${Math.max(...numbers)}`);
          }
        }
        values[fieldName] = chunks.join(" | ");
      }

      if (fallbackFirstFieldCount && tableFieldNames.length > 0 && Object.keys(values).length === 0) {
        values[tableFieldNames[0]] = `Count: ${recordSet.length}`;
      }

      return values;
    },
    [tableFieldNames]
  );

  const tableRows = useMemo(() => {
    if (isFindMode) {
      return [
        {
          kind: "record" as const,
          key: "find-request-row",
          record: findRequestRecord,
          originalIndex: 0
        }
      ];
    }

    const rows: TableDisplayRow[] = [];
    const sortedRecords = sortedRecordRows.map((entry) => entry.record);

    if (leadingGrandSummary && sortedRecords.length > 0) {
      rows.push({
        kind: "summary",
        key: "summary-grand-leading",
        label: "Leading Grand Summary",
        values: makeSummaryValues(sortedRecords, leadingSubtotals, true),
        variant: "grand-leading"
      });
    }

    const effectiveGroupField = leadingGroupField || trailingGroupField;
    if (effectiveGroupField) {
      const grouped = new Map<string, Array<{ record: FMRecord; originalIndex: number; key: string }>>();
      for (const entry of sortedRecordRows) {
        const token = String(mergeFieldValue(entry.record, effectiveGroupField) ?? "").trim() || "(blank)";
        if (!grouped.has(token)) {
          grouped.set(token, []);
        }
        grouped.get(token)?.push(entry);
      }

      let groupSequence = 0;
      for (const [groupValue, groupEntries] of grouped.entries()) {
        const groupRecords = groupEntries.map((entry) => entry.record);
        const groupLabel = `${effectiveGroupField}: ${groupValue}`;

        if (leadingGroupField === effectiveGroupField) {
          rows.push({
            kind: "group",
            key: `group-leading-${groupSequence}-${groupValue}`,
            label: groupLabel,
            variant: "leading"
          });
        }

        const hasLeadingSubtotalConfig = Object.values(leadingSubtotals).some((ops) => ops.length > 0);
        if (hasLeadingSubtotalConfig) {
          rows.push({
            kind: "summary",
            key: `summary-leading-${groupSequence}-${groupValue}`,
            label: `Leading Subtotal (${groupValue})`,
            values: makeSummaryValues(groupRecords, leadingSubtotals, false),
            variant: "leading"
          });
        }

        for (const entry of groupEntries) {
          rows.push({
            kind: "record",
            key: `record-${entry.key}`,
            record: entry.record,
            originalIndex: entry.originalIndex
          });
        }

        const hasTrailingSubtotalConfig = Object.values(trailingSubtotals).some((ops) => ops.length > 0);
        if (hasTrailingSubtotalConfig) {
          rows.push({
            kind: "summary",
            key: `summary-trailing-${groupSequence}-${groupValue}`,
            label: `Trailing Subtotal (${groupValue})`,
            values: makeSummaryValues(groupRecords, trailingSubtotals, false),
            variant: "trailing"
          });
        }

        if (trailingGroupField === effectiveGroupField) {
          rows.push({
            kind: "group",
            key: `group-trailing-${groupSequence}-${groupValue}`,
            label: groupLabel,
            variant: "trailing"
          });
        }
        groupSequence += 1;
      }
    } else {
      for (const entry of sortedRecordRows) {
        rows.push({
          kind: "record",
          key: `record-${entry.key}`,
          record: entry.record,
          originalIndex: entry.originalIndex
        });
      }
    }

    if (trailingGrandSummary && sortedRecords.length > 0) {
      rows.push({
        kind: "summary",
        key: "summary-grand-trailing",
        label: "Trailing Grand Summary",
        values: makeSummaryValues(sortedRecords, trailingSubtotals, true),
        variant: "grand-trailing"
      });
    }

    return rows;
  }, [
    findRequestRecord,
    isFindMode,
    leadingGrandSummary,
    leadingGroupField,
    leadingSubtotals,
    makeSummaryValues,
    sortedRecordRows,
    trailingGrandSummary,
    trailingGroupField,
    trailingSubtotals
  ]);

  const currentRecordFieldNames = useMemo(() => {
    if (!currentRecord) {
      return [];
    }
    return Object.keys(currentRecord).filter(
      (name) => name !== "recordId" && name !== "modId" && name !== "portalData"
    );
  }, [currentRecord]);

  const hasBoundFieldMatch = useMemo(() => {
    if (!boundFieldNames.length || !currentRecordFieldNames.length) {
      return false;
    }
    const recordSet = new Set(
      currentRecordFieldNames.flatMap((name) => [normalizedFieldToken(name), unqualifiedFieldToken(name)])
    );
    return boundFieldNames.some(
      (name) => recordSet.has(normalizedFieldToken(name)) || recordSet.has(unqualifiedFieldToken(name))
    );
  }, [boundFieldNames, currentRecordFieldNames]);

  const displayedRecordCount = isFindMode ? 1 : records.length;
  const hasRecords = isFindMode || records.length > 0;
  const listRecords = isFindMode ? [findRequestRecord] : records;
  const selectableLayouts = useMemo(() => {
    const names = new Set(availableLayouts);
    const currentLayoutName = activeLayoutName.trim();
    if (currentLayoutName) {
      names.add(currentLayoutName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [activeLayoutName, availableLayouts]);

  const layoutPickerGroups = useMemo(() => {
    const normalizedGroups = normalizeLayoutFolderGroups(availableLayoutFolders);
    const groupedLayouts = new Set<string>();
    const groups: Array<{ folder: string | null; layouts: string[] }> = [];

    for (const group of normalizedGroups) {
      const layouts = group.layouts.filter((layoutName) => {
        if (groupedLayouts.has(layoutName)) {
          return false;
        }
        groupedLayouts.add(layoutName);
        return true;
      });
      if (layouts.length === 0) {
        continue;
      }
      groups.push({
        folder: group.folder,
        layouts
      });
    }

    const ungrouped = selectableLayouts.filter((layoutName) => !groupedLayouts.has(layoutName));
    if (ungrouped.length > 0) {
      groups.unshift({
        folder: null,
        layouts: ungrouped
      });
    }

    return groups;
  }, [availableLayoutFolders, selectableLayouts]);

  const workspaceNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const workspace of workspaceCatalog) {
      const normalizedId = normalizeWorkspaceToken(workspace.id);
      const label = workspace.name?.trim() || normalizedId;
      byId.set(normalizedId, label);
    }
    if (!byId.has(currentWorkspaceId)) {
      byId.set(currentWorkspaceId, currentWorkspaceId);
    }
    return byId;
  }, [currentWorkspaceId, workspaceCatalog]);

  const workspaceTabsForDisplay = useMemo(
    () => dedupeWorkspaceIds([...workspaceTabs, currentWorkspaceId]),
    [currentWorkspaceId, workspaceTabs]
  );

  const workspaceWindowEntries = useMemo(() => {
    const byCatalogId = new Map<string, WorkspaceCatalogEntry>();
    for (const workspace of workspaceCatalog) {
      byCatalogId.set(normalizeWorkspaceToken(workspace.id), workspace);
    }
    const byId = new Map<string, { id: string; label: string }>();
    const idsForWindowMenu = dedupeWorkspaceIds([
      ...workspaceCatalog.map((workspace) => workspace.id),
      ...workspaceTabsForDisplay,
      currentWorkspaceId
    ]);
    for (const workspaceIdToken of idsForWindowMenu) {
      const workspace = byCatalogId.get(workspaceIdToken);
      const databaseName = String(workspace?.filemaker?.database ?? "").trim();
      const workspaceName = String(workspace?.name ?? "").trim() || workspaceIdToken;
      const baseLabel = databaseName || workspaceName || workspaceIdToken;
      const hostLabel = workspaceHostLabel(workspace?.filemaker?.host ?? null);
      const label = hostLabel ? `${baseLabel} (${hostLabel})` : baseLabel;
      byId.set(workspaceIdToken, {
        id: workspaceIdToken,
        label
      });
    }
    if (!byId.has(currentWorkspaceId)) {
      byId.set(currentWorkspaceId, {
        id: currentWorkspaceId,
        label: currentWorkspaceId
      });
    }
    return [...byId.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    );
  }, [currentWorkspaceId, workspaceCatalog, workspaceTabsForDisplay]);

  const activeFindRequest = useMemo(
    () => findRequestStates[Math.min(Math.max(activeFindRequestIndex, 0), Math.max(0, findRequestStates.length - 1))] ?? null,
    [activeFindRequestIndex, findRequestStates]
  );
  const activeFindRequestOmit = Boolean(activeFindRequest?.omit);

  useEffect(() => {
    if (!isFindMode) {
      return;
    }
    const nextCriteria = activeFindRequest?.criteria ?? {};
    if (findCriteriaMapsEqual(nextCriteria, findCriteria)) {
      return;
    }
    setFindCriteria(nextCriteria);
  }, [activeFindRequest, findCriteria, isFindMode]);

  useEffect(() => {
    if (!isFindMode) {
      return;
    }
    setFindRequestStates((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const safeIndex = Math.min(Math.max(activeFindRequestIndex, 0), previous.length - 1);
      const current = previous[safeIndex];
      if (!current) {
        return previous;
      }
      if (findCriteriaMapsEqual(current.criteria, findCriteria)) {
        return previous;
      }
      const next = [...previous];
      next[safeIndex] = {
        ...current,
        criteria: findCriteria
      };
      return next;
    });
  }, [activeFindRequestIndex, findCriteria, isFindMode]);

  const closeTopMenubarMenu = useCallback(() => {
    setTopMenubarOpenMenu(null);
    setTopMenubarSubmenu(null);
  }, []);

  const toggleTopMenubarMenu = useCallback(
    (menuId: BrowseTopMenubarMenuId) => {
      setTopMenubarOpenMenu((previous) => {
        const next = previous === menuId ? null : menuId;
        if (next === "window") {
          void loadWorkspaceCatalog();
        }
        return next;
      });
      setTopMenubarSubmenu(null);
    },
    [loadWorkspaceCatalog]
  );

  const positionTopMenubarSubmenus = useCallback(() => {
    const root = topMenubarRef.current;
    if (!root) {
      return;
    }

    const submenuWraps = root.querySelectorAll<HTMLElement>(".fm-view-menu-submenu-wrap");
    submenuWraps.forEach((wrap) => {
      const submenu = wrap.querySelector<HTMLElement>(":scope > .fm-view-submenu");
      if (!submenu) {
        return;
      }
      const trigger = wrap.querySelector<HTMLElement>(":scope > .fm-view-menu-item") ?? wrap;
      const triggerRect = trigger.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();
      const submenuWidth = Math.max(submenuRect.width || submenu.offsetWidth || 240, 240);
      const submenuHeight = Math.max(submenuRect.height || submenu.offsetHeight || 180, 180);
      const viewportPadding = 8;
      let left = triggerRect.right + 6;
      if (left + submenuWidth > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, triggerRect.left - submenuWidth - 6);
      }
      let top = triggerRect.top - 6;
      const maxTop = Math.max(viewportPadding, window.innerHeight - submenuHeight - viewportPadding);
      if (top > maxTop) {
        top = maxTop;
      }
      if (top < viewportPadding) {
        top = viewportPadding;
      }
      const maxHeight = Math.max(180, window.innerHeight - top - viewportPadding);
      submenu.style.setProperty("--fm-submenu-left", `${Math.round(left)}px`);
      submenu.style.setProperty("--fm-submenu-top", `${Math.round(top)}px`);
      submenu.style.setProperty("--fm-submenu-max-height", `${Math.round(maxHeight)}px`);
      submenu.dataset.positioned = "true";
    });
  }, []);

  useLayoutEffect(() => {
    if (!topMenubarOpenMenu) {
      return;
    }
    positionTopMenubarSubmenus();
    const frameId = window.requestAnimationFrame(() => {
      positionTopMenubarSubmenus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [topMenubarOpenMenu, topMenubarSubmenu, positionTopMenubarSubmenus]);

  useEffect(() => {
    if (!topMenubarOpenMenu) {
      return;
    }
    const reposition = () => {
      positionTopMenubarSubmenus();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [topMenubarOpenMenu, positionTopMenubarSubmenus]);

  const insertTextIntoActiveInput = useCallback((text: string) => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      if (active.readOnly || active.disabled) {
        setStatus("Active field is read-only");
        return false;
      }
      const selectionStart = active.selectionStart ?? active.value.length;
      const selectionEnd = active.selectionEnd ?? active.value.length;
      const before = active.value.slice(0, selectionStart);
      const after = active.value.slice(selectionEnd);
      const nextValue = `${before}${text}${after}`;
      active.value = nextValue;
      const nextCaret = selectionStart + text.length;
      active.setSelectionRange(nextCaret, nextCaret);
      active.dispatchEvent(new Event("input", { bubbles: true }));
      active.dispatchEvent(new Event("change", { bubbles: true }));
      active.focus();
      return true;
    }
    if (active instanceof HTMLElement && active.isContentEditable) {
      const selection = window.getSelection();
      if (!selection) {
        return false;
      }
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text));
      selection.collapseToEnd();
      active.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    setStatus("Click in a field before using Insert");
    return false;
  }, []);

  useEffect(() => {
    if (isFindMode) {
      setRecordJumpInput(String(Math.max(1, activeFindRequestIndex + 1)));
      return;
    }
    setRecordJumpInput(hasRecords ? String(index + 1) : "0");
  }, [activeFindRequestIndex, hasRecords, index, isFindMode]);

  const jumpToRecord = useCallback(
    (raw: string) => {
      if (isFindMode) {
        setRecordJumpInput("1");
        return;
      }
      if (!records.length) {
        setRecordJumpInput("0");
        return;
      }

      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        setRecordJumpInput(String(index + 1));
        return;
      }

      const nextIndex = Math.min(records.length - 1, Math.max(0, parsed - 1));
      setIndex(nextIndex);
      setRecordJumpInput(String(nextIndex + 1));
      setStatus(`Record ${nextIndex + 1}`);
    },
    [index, isFindMode, records.length]
  );

  const goFirst = useCallback(() => {
    if (isFindMode) {
      if (findRequestStates.length === 0) {
        return;
      }
      setActiveFindRequestIndex(0);
      setFindCriteria(findRequestStates[0]?.criteria ?? {});
      setRecordJumpInput("1");
      setStatus(`Find request 1 of ${findRequestStates.length}`);
      return;
    }
    if (!hasRecords || index <= 0) {
      return;
    }
    setIndex(0);
    setStatus("First record");
  }, [findRequestStates, hasRecords, index, isFindMode]);

  const goPrev = useCallback(() => {
    if (isFindMode) {
      if (findRequestStates.length === 0) {
        return;
      }
      const current = Math.min(Math.max(activeFindRequestIndex, 0), findRequestStates.length - 1);
      const nextIndex = Math.max(0, current - 1);
      if (nextIndex === current) {
        return;
      }
      setActiveFindRequestIndex(nextIndex);
      setFindCriteria(findRequestStates[nextIndex]?.criteria ?? {});
      setRecordJumpInput(String(nextIndex + 1));
      setStatus(`Find request ${nextIndex + 1} of ${findRequestStates.length}`);
      return;
    }
    if (!hasRecords || index <= 0) {
      return;
    }
    setIndex(index - 1);
    setStatus("Previous record");
  }, [activeFindRequestIndex, findRequestStates, hasRecords, index, isFindMode]);

  const goNext = useCallback(() => {
    if (isFindMode) {
      if (findRequestStates.length === 0) {
        return;
      }
      const current = Math.min(Math.max(activeFindRequestIndex, 0), findRequestStates.length - 1);
      const nextIndex = Math.min(findRequestStates.length - 1, current + 1);
      if (nextIndex === current) {
        return;
      }
      setActiveFindRequestIndex(nextIndex);
      setFindCriteria(findRequestStates[nextIndex]?.criteria ?? {});
      setRecordJumpInput(String(nextIndex + 1));
      setStatus(`Find request ${nextIndex + 1} of ${findRequestStates.length}`);
      return;
    }
    if (!hasRecords || index >= records.length - 1) {
      return;
    }
    setIndex(index + 1);
    setStatus("Next record");
  }, [activeFindRequestIndex, findRequestStates, hasRecords, index, isFindMode, records.length]);

  const goLast = useCallback(() => {
    if (isFindMode) {
      if (findRequestStates.length === 0) {
        return;
      }
      const nextIndex = findRequestStates.length - 1;
      setActiveFindRequestIndex(nextIndex);
      setFindCriteria(findRequestStates[nextIndex]?.criteria ?? {});
      setRecordJumpInput(String(nextIndex + 1));
      setStatus(`Find request ${nextIndex + 1} of ${findRequestStates.length}`);
      return;
    }
    if (!hasRecords || index >= records.length - 1) {
      return;
    }
    setIndex(records.length - 1);
    setStatus("Last record");
  }, [findRequestStates, hasRecords, index, isFindMode, records.length]);

  const createNew = async () => {
    if (isFindMode) {
      setStatus("Exit Find Mode before creating records");
      return;
    }
    if (isPreviewMode) {
      setPreviewReadOnlyStatus();
      return;
    }
    if (!layout) {
      return;
    }

    setError(null);
    setStatus("Creating record...");

    const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tableOccurrence: layout.defaultTableOccurrence,
        fieldData: stripSystemFields(emptyRecordFromLayout(layout)),
        workspaceId: currentWorkspaceId
      })
    });

    if (!response.ok) {
      const body = await response.text();
      setError(`Create failed: ${body}`);
      setStatus("Create failed");
      return;
    }

    setStatus("Record created");
    await loadAll({ indexMode: "last" });
  };

  const duplicateCurrent = useCallback(async () => {
    if (isFindMode) {
      setStatus("Exit Find Mode before duplicating records");
      return;
    }
    if (isPreviewMode) {
      setPreviewReadOnlyStatus();
      return;
    }
    if (!layout) {
      return;
    }
    const current = records[index];
    if (!current) {
      return;
    }

    setError(null);
    setStatus("Duplicating record...");

    const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tableOccurrence: layout.defaultTableOccurrence,
        fieldData: stripSystemFields(current),
        workspaceId: currentWorkspaceId
      })
    });

    if (!response.ok) {
      const body = await response.text();
      setError(`Duplicate failed: ${body}`);
      setStatus("Duplicate failed");
      return;
    }

    setStatus("Record duplicated");
    await loadAll({ indexMode: "last" });
  }, [currentWorkspaceId, index, isFindMode, isPreviewMode, layout, loadAll, records, setPreviewReadOnlyStatus, withWorkspaceForApi]);

  const deleteCurrent = async () => {
    if (isFindMode) {
      setStatus("Exit Find Mode before deleting records");
      return;
    }
    if (isPreviewMode) {
      setPreviewReadOnlyStatus();
      return;
    }
    if (!layout) {
      return;
    }

    const record = records[index];
    if (!record?.recordId) {
      return;
    }

    const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tableOccurrence: layout.defaultTableOccurrence,
        recordId: record.recordId,
        workspaceId: currentWorkspaceId
      })
    });

    if (!response.ok) {
      const body = await response.text();
      setError(`Delete failed: ${body}`);
      setStatus("Delete failed");
      return;
    }

    setStatus(`Deleted record ${record.recordId}`);
    await loadAll({ indexMode: "preserve" });
  };

  const deleteAllRecords = useCallback(async () => {
    if (!layout || isFindMode) {
      setStatus("Exit Find Mode before deleting all records");
      return;
    }
    if (isPreviewMode) {
      setPreviewReadOnlyStatus();
      return;
    }
    if (records.length === 0) {
      setStatus("No records to delete");
      return;
    }
    const confirmed = window.confirm(
      `Delete all ${records.length} record(s) in the current found set? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus("Deleting all records...");

    let deleted = 0;
    for (const record of records) {
      const recordId = String(record.recordId ?? "").trim();
      if (!recordId) {
        continue;
      }
      const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableOccurrence: layout.defaultTableOccurrence,
          recordId,
          workspaceId: currentWorkspaceId
        })
      });
      if (!response.ok) {
        const body = await response.text();
        setError(`Delete all failed: ${body}`);
        setStatus(`Delete all stopped after ${deleted} record(s)`);
        await loadAll({ indexMode: "preserve" });
        return;
      }
      deleted += 1;
    }

    setStatus(`Deleted ${deleted} record(s)`);
    await loadAll({ indexMode: "preserve" });
  }, [currentWorkspaceId, isFindMode, isPreviewMode, layout, loadAll, records, setPreviewReadOnlyStatus, withWorkspaceForApi]);

  const resolveCurrentTableFieldName = useCallback(
    (rawFieldName: string): string => {
      const token = rawFieldName.trim();
      if (!token) {
        return "";
      }

      const normalizedToken = normalizedFieldToken(token);
      const unqualifiedToken = unqualifiedFieldToken(token);
      const matchedField =
        tableFieldNames.find((fieldName) => fieldName.trim().toLowerCase() === token.toLowerCase()) ??
        tableFieldNames.find(
          (fieldName) =>
            normalizedFieldToken(fieldName) === normalizedToken ||
            unqualifiedFieldToken(fieldName) === unqualifiedToken
        ) ??
        token;
      const qualified = splitQualifiedFieldToken(matchedField);
      if (!qualified) {
        return matchedField;
      }
      const defaultTable = (layout?.defaultTableOccurrence ?? "").trim().toLowerCase();
      if (!defaultTable) {
        return "";
      }
      if (qualified.tableOccurrence.trim().toLowerCase() !== defaultTable) {
        return "";
      }
      return qualified.fieldName;
    },
    [layout?.defaultTableOccurrence, tableFieldNames]
  );

  const replaceFieldContents = useCallback(async () => {
    if (!layout || isFindMode) {
      setStatus("Exit Find Mode before replacing field contents");
      return;
    }
    if (isPreviewMode) {
      setPreviewReadOnlyStatus();
      return;
    }
    if (records.length === 0) {
      setStatus("No records in the found set");
      return;
    }

    const suggestedField =
      tableFieldNames.find((fieldName) => !fieldName.includes("::")) ??
      tableFieldNames[0] ??
      "";
    const requestedField = window.prompt(
      "Replace Field Contents\nField name (current table only):",
      suggestedField
    );
    if (requestedField == null) {
      return;
    }
    const fieldName = resolveCurrentTableFieldName(requestedField);
    if (!fieldName) {
      setStatus("Replace Field Contents currently supports only current-table fields");
      return;
    }

    const replacement = window.prompt(`Replace all "${fieldName}" values with:`, "");
    if (replacement == null) {
      return;
    }
    const confirmed = window.confirm(
      `Replace "${fieldName}" in ${records.length} record(s)?`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus(`Replacing ${fieldName}...`);
    let updated = 0;
    for (const record of records) {
      const recordId = String(record.recordId ?? "").trim();
      if (!recordId) {
        continue;
      }
      const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableOccurrence: layout.defaultTableOccurrence,
          recordId,
          fieldData: {
            [fieldName]: replacement
          },
          workspaceId: currentWorkspaceId
        })
      });
      if (!response.ok) {
        const body = await response.text();
        setError(`Replace Field Contents failed: ${body}`);
        setStatus(`Replace Field Contents stopped after ${updated} record(s)`);
        await loadAll({ indexMode: "preserve" });
        return;
      }
      updated += 1;
    }
    setStatus(`Replaced "${fieldName}" in ${updated} record(s)`);
    await loadAll({ indexMode: "preserve" });
  }, [currentWorkspaceId, isFindMode, isPreviewMode, layout, loadAll, records, resolveCurrentTableFieldName, setPreviewReadOnlyStatus, tableFieldNames, withWorkspaceForApi]);

  const relookupFieldContents = useCallback(async () => {
    if (!layout || isFindMode) {
      setStatus("Exit Find Mode before relooking up field contents");
      return;
    }
    if (isPreviewMode) {
      setPreviewReadOnlyStatus();
      return;
    }
    if (records.length === 0) {
      setStatus("No records in the found set");
      return;
    }

    const candidateFields = dedupeCaseInsensitiveStrings(
      viewFieldNames
        .map((fieldName) => resolveCurrentTableFieldName(fieldName))
        .filter((fieldName) => fieldName.length > 0)
    );
    if (candidateFields.length === 0) {
      setStatus("No current-table fields available for relookup");
      return;
    }

    const confirmed = window.confirm(
      `Relookup field contents for ${records.length} record(s) using ${candidateFields.length} field(s)?`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus("Relooking up field contents...");
    let updated = 0;
    for (const record of records) {
      const recordId = String(record.recordId ?? "").trim();
      if (!recordId) {
        continue;
      }
      const fieldData: Record<string, unknown> = {};
      for (const fieldName of candidateFields) {
        fieldData[fieldName] = mergeFieldValue(record, fieldName);
      }
      const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableOccurrence: layout.defaultTableOccurrence,
          recordId,
          fieldData,
          workspaceId: currentWorkspaceId
        })
      });
      if (!response.ok) {
        const body = await response.text();
        setError(`Relookup failed: ${body}`);
        setStatus(`Relookup stopped after ${updated} record(s)`);
        await loadAll({ indexMode: "preserve" });
        return;
      }
      updated += 1;
    }
    setStatus(`Relookup completed for ${updated} record(s)`);
    await loadAll({ indexMode: "preserve" });
  }, [currentWorkspaceId, isFindMode, isPreviewMode, layout, loadAll, records, resolveCurrentTableFieldName, setPreviewReadOnlyStatus, viewFieldNames, withWorkspaceForApi]);

  const createFindRequest = useCallback((initial?: Partial<FindRequestState>): FindRequestState => {
    return {
      id: initial?.id?.trim() || crypto.randomUUID(),
      criteria: initial?.criteria ?? {},
      omit: initial?.omit === true
    };
  }, []);

  const materializeFindRequests = useCallback(
    (requests: FindRequestState[] = findRequestStates): FindRequestState[] => {
      if (requests.length === 0) {
        return requests;
      }
      const safeIndex = Math.min(Math.max(activeFindRequestIndex, 0), requests.length - 1);
      const normalizedCriteria = normalizeFindCriteriaMap(findCriteria);
      return requests.map((request, requestIndex) => {
        if (requestIndex !== safeIndex) {
          return request;
        }
        if (findCriteriaMapsEqual(request.criteria, normalizedCriteria)) {
          return request;
        }
        return {
          ...request,
          criteria: normalizedCriteria
        };
      });
    },
    [activeFindRequestIndex, findCriteria, findRequestStates]
  );

  const enterFindMode = useCallback(() => {
    const firstRequest = createFindRequest({
      id: "find-request-1",
      criteria: {},
      omit: false
    });
    setError(null);
    setIndex(0);
    setRecordJumpInput("1");
    setFindRequestStates([firstRequest]);
    setActiveFindRequestIndex(0);
    setFindCriteria({});
    setFindRequestInsertMenuOpen(false);
    setFindRequestSavedMenuOpen(false);
    setIsFindMode(true);
    setStatus("Find mode: enter search criteria");
  }, [createFindRequest]);

  const cancelFindMode = useCallback(() => {
    const firstRequest = createFindRequest({
      id: "find-request-1",
      criteria: {},
      omit: false
    });
    setFindCriteria({});
    setFindRequestStates([firstRequest]);
    setActiveFindRequestIndex(0);
    setFindRequestInsertMenuOpen(false);
    setFindRequestSavedMenuOpen(false);
    setIsFindMode(false);
    setRecordJumpInput(records.length ? String(Math.min(index + 1, records.length)) : "0");
    setStatus("Find canceled");
  }, [createFindRequest, index, records.length]);

  const applyFoundSetFromFindRequests = useCallback(
    (requests: FindRequestState[], options?: { statusPrefix?: string }) => {
      const normalizedRequests = requests.map((request) => ({
        ...request,
        criteria: normalizeFindCriteriaMap(request.criteria)
      }));
      const includeRequests = normalizedRequests.filter(
        (request) => !request.omit && Object.keys(request.criteria).length > 0
      );
      const omitRequests = normalizedRequests.filter(
        (request) => request.omit && Object.keys(request.criteria).length > 0
      );
      const includeDuplicateMaps = includeRequests.map((request) =>
        buildDuplicateFindFieldValueMap(allRecords, request.criteria)
      );
      const omitDuplicateMaps = omitRequests.map((request) =>
        buildDuplicateFindFieldValueMap(allRecords, request.criteria)
      );

      let filtered = includeRequests.length > 0
        ? allRecords.filter((record) =>
            includeRequests.some((request, requestIndex) =>
              recordMatchesFindCriteria(record, request.criteria, includeDuplicateMaps[requestIndex])
            )
          )
        : allRecords;
      if (omitRequests.length > 0) {
        filtered = filtered.filter(
          (record) =>
            !omitRequests.some((request, requestIndex) =>
              recordMatchesFindCriteria(record, request.criteria, omitDuplicateMaps[requestIndex])
            )
        );
      }

      const lastRequests = normalizedRequests.filter(
        (request) => Object.keys(request.criteria).length > 0 || request.omit
      );
      setLastFindRequests(lastRequests);
      setLastFindLayoutId(layoutRouteName);

      setRecords(filtered);
      setIndex(0);
      setRecordJumpInput(filtered.length > 0 ? "1" : "0");
      setIsFindMode(false);
      setFindCriteria({});
      setFindRequestStates([createFindRequest({ id: "find-request-1", criteria: {}, omit: false })]);
      setActiveFindRequestIndex(0);
      setFindRequestInsertMenuOpen(false);
      setFindRequestSavedMenuOpen(false);
      setOmittedRecordIds([]);
      setShowingOmittedOnly(false);
      setError(null);
      if (options?.statusPrefix) {
        setStatus(`${options.statusPrefix}: ${filtered.length} record(s)`);
      } else if (includeRequests.length > 0 || omitRequests.length > 0) {
        setStatus(`Found ${filtered.length} record(s)`);
      } else {
        setStatus(`Showing all ${filtered.length} record(s)`);
      }
    },
    [allRecords, createFindRequest, layoutRouteName]
  );

  const applyFoundSetFromCriteria = useCallback(
    (criteria: FindCriteriaMap, options?: { statusPrefix?: string }) => {
      const request = createFindRequest({
        criteria,
        omit: false
      });
      applyFoundSetFromFindRequests([request], options);
    },
    [applyFoundSetFromFindRequests, createFindRequest]
  );

  const performFind = useCallback(() => {
    const effectiveRequests = materializeFindRequests();
    setFindRequestStates(effectiveRequests);
    applyFoundSetFromFindRequests(effectiveRequests);
  }, [applyFoundSetFromFindRequests, materializeFindRequests]);

  const newFindRequest = useCallback(() => {
    if (!isFindMode) {
      enterFindMode();
      return;
    }
    const nextRequest = createFindRequest({
      criteria: {},
      omit: false
    });
    const currentIndex = Math.min(
      Math.max(activeFindRequestIndex, 0),
      Math.max(0, findRequestStates.length - 1)
    );
    const nextRequests = materializeFindRequests(findRequestStates);
    nextRequests.push(nextRequest);
    setFindRequestStates(nextRequests);
    setActiveFindRequestIndex(nextRequests.length - 1);
    setFindCriteria({});
    setRecordJumpInput(String(nextRequests.length));
    setStatus(`New find request (${nextRequests.length})`);
  }, [
    activeFindRequestIndex,
    createFindRequest,
    enterFindMode,
    findRequestStates,
    materializeFindRequests,
    isFindMode
  ]);

  const duplicateFindRequest = useCallback(() => {
    if (!isFindMode || findRequestStates.length === 0) {
      setStatus("Not in Find Mode");
      return;
    }
    const currentIndex = Math.min(
      Math.max(activeFindRequestIndex, 0),
      Math.max(0, findRequestStates.length - 1)
    );
    const materializedRequests = materializeFindRequests(findRequestStates);
    const sourceRequest = materializedRequests[currentIndex];
    if (!sourceRequest) {
      return;
    }
    const duplicate = createFindRequest({
      criteria: { ...sourceRequest.criteria },
      omit: sourceRequest.omit
    });
    const nextRequests = [...materializedRequests];
    nextRequests.splice(currentIndex + 1, 0, duplicate);
    setFindRequestStates(nextRequests);
    setActiveFindRequestIndex(currentIndex + 1);
    setFindCriteria({ ...duplicate.criteria });
    setRecordJumpInput(String(currentIndex + 2));
    setStatus(`Duplicated find request (${nextRequests.length})`);
  }, [activeFindRequestIndex, createFindRequest, findRequestStates, isFindMode, materializeFindRequests]);

  const deleteFindRequest = useCallback(() => {
    if (!isFindMode) {
      setStatus("Not in Find Mode");
      return;
    }
    if (findRequestStates.length <= 1) {
      const resetRequest = createFindRequest({
        id: findRequestStates[0]?.id ?? "find-request-1",
        criteria: {},
        omit: false
      });
      setFindRequestStates([resetRequest]);
      setActiveFindRequestIndex(0);
      setFindCriteria({});
      setRecordJumpInput("1");
      setStatus("Cleared current find request");
      return;
    }
    const currentIndex = Math.min(
      Math.max(activeFindRequestIndex, 0),
      Math.max(0, findRequestStates.length - 1)
    );
    const materializedRequests = materializeFindRequests(findRequestStates);
    const nextRequests = materializedRequests.filter((_, requestIndex) => requestIndex !== currentIndex);
    const nextIndex = Math.min(currentIndex, nextRequests.length - 1);
    const nextCriteria = nextRequests[nextIndex]?.criteria ?? {};
    setFindRequestStates(nextRequests);
    setActiveFindRequestIndex(nextIndex);
    setFindCriteria(nextCriteria);
    setRecordJumpInput(String(nextIndex + 1));
    setStatus(`Deleted find request (${nextRequests.length} remaining)`);
  }, [activeFindRequestIndex, createFindRequest, findRequestStates, isFindMode, materializeFindRequests]);

  const selectFindRequestByIndex = useCallback(
    (nextIndex: number) => {
      if (!isFindMode || findRequestStates.length === 0) {
        return;
      }
      const materializedRequests = materializeFindRequests(findRequestStates);
      const safeIndex = Math.min(Math.max(nextIndex, 0), findRequestStates.length - 1);
      const nextCriteria = materializedRequests[safeIndex]?.criteria ?? {};
      setFindRequestStates(materializedRequests);
      setActiveFindRequestIndex(safeIndex);
      setFindCriteria(nextCriteria);
      setRecordJumpInput(String(safeIndex + 1));
      setStatus(`Find request ${safeIndex + 1} of ${findRequestStates.length}`);
    },
    [findRequestStates, isFindMode, materializeFindRequests]
  );

  const setActiveFindRequestOmit = useCallback(
    (omit: boolean) => {
      if (!isFindMode || findRequestStates.length === 0) {
        return;
      }
      const safeIndex = Math.min(Math.max(activeFindRequestIndex, 0), findRequestStates.length - 1);
      setFindRequestStates((previous) =>
        previous.map((request, requestIndex) =>
          requestIndex === safeIndex
            ? {
                ...request,
                criteria: findCriteria,
                omit
              }
            : request
        )
      );
      setStatus(omit ? "Matching records: Omit" : "Matching records: Include");
    },
    [activeFindRequestIndex, findCriteria, findRequestStates.length, isFindMode]
  );

  const insertFindOperatorToken = useCallback(
    (token: string) => {
      const inserted = insertTextIntoActiveInput(token);
      if (inserted) {
        setStatus(`Inserted operator ${token}`);
        setFindRequestInsertMenuOpen(false);
      }
    },
    [insertTextIntoActiveInput]
  );

  const handleFindAction = useCallback(() => {
    if (isFindMode) {
      performFind();
      return;
    }
    enterFindMode();
  }, [enterFindMode, isFindMode, performFind]);

  useEffect(() => {
    if (!layout) {
      return;
    }
    // Apply launch mode once per layout+mode marker so reloads don't repeatedly force mode transitions.
    const marker = `${layout.id}:${launchMode || "browse"}`;
    if (launchModeAppliedRef.current === marker) {
      return;
    }
    launchModeAppliedRef.current = marker;
    if (launchMode === "find") {
      enterFindMode();
      return;
    }
    if (launchMode === "preview") {
      if (isFindMode) {
        cancelFindMode();
      }
      setStatus("Preview mode");
    }
  }, [cancelFindMode, enterFindMode, isFindMode, launchMode, layout]);

  useEffect(() => {
    if (!layout || !requestedViewMode) {
      return;
    }
    if (viewMode !== requestedViewMode) {
      setViewMode(requestedViewMode);
    }
  }, [layout, requestedViewMode, viewMode]);

  useEffect(() => {
    if (!layout) {
      return;
    }
    // Keep URL mode/view in sync with in-memory state so refresh/deeplink behavior stays deterministic.
    const currentViewMode = parseBrowseViewModeToken(searchParams.get("view")) ?? "form";
    const currentLaunchMode = parseBrowseLaunchModeToken(searchParams.get("mode")) ?? "browse";
    const desiredLaunchMode: BrowseLaunchMode = isFindMode
      ? "find"
      : currentLaunchMode === "preview"
        ? "preview"
        : "browse";
    const currentHref = buildBrowseRouteHref(layoutRouteName, searchParams, {
      viewMode: currentViewMode,
      launchMode: currentLaunchMode
    });
    const desiredHref = buildBrowseRouteHref(layoutRouteName, searchParams, {
      viewMode,
      launchMode: desiredLaunchMode
    });
    if (currentHref !== desiredHref) {
      router.replace(desiredHref, { scroll: false });
    }
  }, [isFindMode, layout, layoutRouteName, router, searchParams, viewMode]);

  const showAllRecords = useCallback(() => {
    setFindCriteria({});
    setIsFindMode(false);
    setRecords(allRecords);
    setIndex(0);
    setRecordJumpInput(allRecords.length > 0 ? "1" : "0");
    setOmittedRecordIds([]);
    setShowingOmittedOnly(false);
    setStatus(`Showing all ${allRecords.length} record(s)`);
  }, [allRecords]);

  const omitCurrentRecord = useCallback(() => {
    if (isFindMode || records.length === 0) {
      setStatus("No active record to omit");
      return;
    }
    const record = records[index];
    const recordId = String(record?.recordId ?? "").trim();
    if (!recordId) {
      setStatus("Cannot omit unsaved or unknown record");
      return;
    }
    setShowingOmittedOnly(false);
    setOmittedRecordIds((previous) => (previous.includes(recordId) ? previous : [...previous, recordId]));
    const nextVisible = records.filter((entry) => String(entry.recordId ?? "").trim() !== recordId);
    setRecords(nextVisible);
    setIndex((previous) => Math.min(previous, Math.max(0, nextVisible.length - 1)));
    setRecordJumpInput(nextVisible.length > 0 ? String(Math.min(index + 1, nextVisible.length)) : "0");
    setStatus(`Omitted record ${recordId}`);
  }, [index, isFindMode, records]);

  const omitMultipleRecords = useCallback(() => {
    if (isFindMode || records.length === 0) {
      setStatus("No found set records to omit");
      return;
    }
    const response = window.prompt(
      `Omit records by number or range (1-${records.length}, e.g. 2,5-8):`,
      ""
    );
    if (response == null) {
      return;
    }
    const indexes = parseRecordSelectionSpec(response, records.length);
    if (indexes.length === 0) {
      setStatus("No valid record numbers to omit");
      return;
    }
    const omitIds = indexes
      .map((rowIndex) => String(records[rowIndex]?.recordId ?? "").trim())
      .filter((recordId) => recordId.length > 0);
    if (omitIds.length === 0) {
      setStatus("Selected records have no record IDs");
      return;
    }
    const omitIdSet = new Set(omitIds);
    setShowingOmittedOnly(false);
    setOmittedRecordIds((previous) => dedupeCaseInsensitiveStrings([...previous, ...omitIds]));
    const nextVisible = records.filter((record) => !omitIdSet.has(String(record.recordId ?? "").trim()));
    setRecords(nextVisible);
    setIndex((previous) => Math.min(previous, Math.max(0, nextVisible.length - 1)));
    setRecordJumpInput(nextVisible.length > 0 ? "1" : "0");
    setStatus(`Omitted ${omitIds.length} record(s)`);
  }, [isFindMode, records]);

  const showOmittedRecordsOnly = useCallback(() => {
    if (omittedRecordIds.length === 0) {
      setStatus("No omitted records");
      return;
    }
    const omittedIdSet = new Set(omittedRecordIds.map((entry) => entry.toLowerCase()));
    const omittedRecords = allRecords.filter((record) =>
      omittedIdSet.has(String(record.recordId ?? "").trim().toLowerCase())
    );
    setIsFindMode(false);
    setFindCriteria({});
    setShowingOmittedOnly(true);
    setRecords(omittedRecords);
    setIndex(0);
    setRecordJumpInput(omittedRecords.length > 0 ? "1" : "0");
    setStatus(`Showing omitted records (${omittedRecords.length})`);
  }, [allRecords, omittedRecordIds]);

  const modifyLastFindRequest = useCallback(() => {
    if (lastFindLayoutId && lastFindLayoutId !== layoutRouteName) {
      setStatus("No previous find request for this layout");
      return;
    }
    if (lastFindRequests.length === 0) {
      setStatus("No previous find request");
      return;
    }
    const restoredRequests = lastFindRequests.map((request) =>
      createFindRequest({
        criteria: request.criteria,
        omit: request.omit
      })
    );
    setIsFindMode(true);
    setFindRequestStates(restoredRequests);
    setActiveFindRequestIndex(0);
    setFindCriteria(restoredRequests[0]?.criteria ?? {});
    setFindRequestInsertMenuOpen(false);
    setFindRequestSavedMenuOpen(false);
    setIndex(0);
    setRecordJumpInput("1");
    setStatus("Modify Last Find");
  }, [createFindRequest, lastFindLayoutId, lastFindRequests, layoutRouteName]);

  const saveCurrentFindRequest = useCallback(() => {
    const sourceRequests = isFindMode
      ? findRequestStates.map((request, requestIndex) =>
          requestIndex === activeFindRequestIndex
            ? {
                ...request,
                criteria: findCriteria
              }
            : request
        )
      : lastFindRequests;
    const normalizedRequests = sourceRequests
      .map((request) => ({
        ...request,
        criteria: normalizeFindCriteriaMap(request.criteria)
      }))
      .filter((request) => Object.keys(request.criteria).length > 0 || request.omit);
    if (normalizedRequests.length === 0) {
      setFindOptionsMenuOpen(false);
      setStatus("No find criteria to save");
      return;
    }
    const targetLayoutId = activeLayoutName.trim() || layout?.id?.trim() || layoutRouteName;
    const existingCountForLayout = savedFinds.filter((entry) => {
      const context = (entry.layoutId ?? "").trim();
      return !context || context === targetLayoutId;
    }).length;
    setSaveFindDialogRequests(normalizedRequests);
    setSaveFindDialogEditingId(null);
    setSaveFindDialogName(`Find ${existingCountForLayout + 1}`);
    setSaveFindDialogOpen(true);
    setFindOptionsMenuOpen(false);
  }, [
    activeFindRequestIndex,
    activeLayoutName,
    findCriteria,
    findRequestStates,
    isFindMode,
    lastFindRequests,
    layout?.id,
    layoutRouteName,
    savedFinds
  ]);

  const runSavedFindById = useCallback(
    (savedFindId: string) => {
      const savedFind = savedFinds.find((entry) => entry.id === savedFindId);
      if (!savedFind) {
        setStatus("Saved find no longer exists");
        return;
      }
      setRecentFindIds((previous) => [
        savedFindId,
        ...previous.filter((entry) => entry !== savedFindId)
      ].slice(0, MAX_RECENT_FINDS));
      setSavedFinds((previous) =>
        previous.map((entry) =>
          entry.id === savedFindId
            ? {
                ...entry,
                lastRunAt: Date.now()
              }
            : entry
        )
      );
      applyFoundSetFromFindRequests(savedFind.requests, {
        statusPrefix: `Saved Find "${savedFind.name}"`
      });
    },
    [applyFoundSetFromFindRequests, savedFinds]
  );

  const createNewFindRequestSet = useCallback(() => {
    const firstRequest = createFindRequest({
      id: "find-request-1",
      criteria: {},
      omit: false
    });
    setIsFindMode(true);
    setFindRequestStates([firstRequest]);
    setActiveFindRequestIndex(0);
    setFindCriteria({});
    setRecordJumpInput("1");
    setFindOptionsMenuOpen(false);
    setStatus("Create New Find");
  }, [createFindRequest]);

  const openEditSavedFindsDialog = useCallback(() => {
    setEditSavedFindsSelectionId("");
    setEditSavedFindsDialogOpen(true);
    setFindOptionsMenuOpen(false);
  }, []);

  const openSaveFindDialogForEntry = useCallback(
    (entry: SavedFindEntry) => {
      const normalizedRequests = entry.requests
        .map((request) => ({
          ...request,
          criteria: normalizeFindCriteriaMap(request.criteria)
        }))
        .filter((request) => Object.keys(request.criteria).length > 0 || request.omit);
      if (normalizedRequests.length === 0) {
        setStatus("Saved find has no criteria");
        return;
      }
      setSaveFindDialogRequests(normalizedRequests);
      setSaveFindDialogEditingId(entry.id);
      setSaveFindDialogName(entry.name);
      setSaveFindDialogOpen(true);
      setEditSavedFindsDialogOpen(false);
    },
    []
  );

  const openFindAdvancedDialog = useCallback(() => {
    const normalizedRequests = saveFindDialogRequests
      .map((request) => ({
        ...request,
        id: request.id || crypto.randomUUID(),
        criteria: normalizeFindCriteriaMap(request.criteria)
      }))
      .filter((request) => Object.keys(request.criteria).length > 0 || request.omit);
    const fallbackRequest = createFindRequest({
      id: "find-request-1",
      criteria: {},
      omit: false
    });
    const draft = normalizedRequests.length > 0 ? normalizedRequests : [fallbackRequest];
    setFindAdvancedRequestsDraft(draft);
    setFindAdvancedSelectedRequestIndex(0);
    const firstRequestCriteriaFields = Object.keys(draft[0]?.criteria ?? {});
    setFindAdvancedSelectedField(firstRequestCriteriaFields[0] ?? findCriteriaFieldNames[0] ?? "");
    setFindAdvancedSelectedCriteriaField(firstRequestCriteriaFields[0] ?? "");
    setFindAdvancedFieldValue(firstRequestCriteriaFields[0] ? draft[0].criteria[firstRequestCriteriaFields[0]] ?? "" : "");
    setFindAdvancedDialogOpen(true);
  }, [createFindRequest, findCriteriaFieldNames, saveFindDialogRequests]);

  const closeFindAdvancedDialog = useCallback(() => {
    setFindAdvancedDialogOpen(false);
    setFindAdvancedSelectedRequestIndex(0);
    setFindAdvancedSelectedField("");
    setFindAdvancedFieldValue("");
    setFindAdvancedSelectedCriteriaField("");
  }, []);

  const commitFindAdvancedDialog = useCallback(() => {
    const normalized = findAdvancedRequestsDraft.map((request) => ({
      ...request,
      criteria: normalizeFindCriteriaMap(request.criteria)
    }));
    setSaveFindDialogRequests(normalized);
    closeFindAdvancedDialog();
  }, [closeFindAdvancedDialog, findAdvancedRequestsDraft]);

  const addFindAdvancedRequest = useCallback(() => {
    setFindAdvancedRequestsDraft((previous) => {
      const next = [...previous, createFindRequest({ criteria: {}, omit: false })];
      setFindAdvancedSelectedRequestIndex(next.length - 1);
      return next;
    });
    setFindAdvancedSelectedCriteriaField("");
    setFindAdvancedFieldValue("");
  }, [createFindRequest]);

  const duplicateFindAdvancedRequest = useCallback(() => {
    setFindAdvancedRequestsDraft((previous) => {
      if (previous.length === 0) {
        return [createFindRequest({ criteria: {}, omit: false })];
      }
      const safeIndex = Math.min(Math.max(findAdvancedSelectedRequestIndex, 0), previous.length - 1);
      const sourceRequest = previous[safeIndex];
      if (!sourceRequest) {
        return previous;
      }
      const duplicate: FindRequestState = createFindRequest({
        criteria: { ...sourceRequest.criteria },
        omit: sourceRequest.omit
      });
      const next = [...previous];
      next.splice(safeIndex + 1, 0, duplicate);
      setFindAdvancedSelectedRequestIndex(safeIndex + 1);
      return next;
    });
  }, [createFindRequest, findAdvancedSelectedRequestIndex]);

  const deleteFindAdvancedRequest = useCallback(() => {
    setFindAdvancedRequestsDraft((previous) => {
      if (previous.length <= 1) {
        const fallback = createFindRequest({ id: previous[0]?.id ?? "find-request-1", criteria: {}, omit: false });
        setFindAdvancedSelectedRequestIndex(0);
        return [fallback];
      }
      const safeIndex = Math.min(Math.max(findAdvancedSelectedRequestIndex, 0), previous.length - 1);
      const next = previous.filter((_, index) => index !== safeIndex);
      setFindAdvancedSelectedRequestIndex(Math.min(safeIndex, next.length - 1));
      return next;
    });
    setFindAdvancedSelectedCriteriaField("");
    setFindAdvancedFieldValue("");
  }, [createFindRequest, findAdvancedSelectedRequestIndex]);

  const setFindAdvancedRequestOmit = useCallback((omit: boolean) => {
    setFindAdvancedRequestsDraft((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const safeIndex = Math.min(Math.max(findAdvancedSelectedRequestIndex, 0), previous.length - 1);
      return previous.map((request, index) =>
        index === safeIndex
          ? {
              ...request,
              omit
            }
          : request
      );
    });
  }, [findAdvancedSelectedRequestIndex]);

  const upsertFindAdvancedCriterion = useCallback(() => {
    const fieldName = findAdvancedSelectedField.trim();
    if (!fieldName) {
      setStatus("Choose a field for this criterion");
      return;
    }
    const criterion = findAdvancedFieldValue.trim();
    if (!criterion) {
      setStatus("Enter a criterion value");
      return;
    }
    setFindAdvancedRequestsDraft((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const safeIndex = Math.min(Math.max(findAdvancedSelectedRequestIndex, 0), previous.length - 1);
      return previous.map((request, index) =>
        index === safeIndex
          ? {
              ...request,
              criteria: {
                ...request.criteria,
                [fieldName]: criterion
              }
            }
          : request
      );
    });
    setFindAdvancedSelectedCriteriaField(fieldName);
  }, [findAdvancedFieldValue, findAdvancedSelectedField, findAdvancedSelectedRequestIndex]);

  const removeFindAdvancedCriterion = useCallback(() => {
    const fieldName = findAdvancedSelectedCriteriaField.trim() || findAdvancedSelectedField.trim();
    if (!fieldName) {
      return;
    }
    setFindAdvancedRequestsDraft((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const safeIndex = Math.min(Math.max(findAdvancedSelectedRequestIndex, 0), previous.length - 1);
      return previous.map((request, index) => {
        if (index !== safeIndex) {
          return request;
        }
        const nextCriteria = { ...request.criteria };
        delete nextCriteria[fieldName];
        return {
          ...request,
          criteria: nextCriteria
        };
      });
    });
    setFindAdvancedSelectedCriteriaField("");
    setFindAdvancedFieldValue("");
  }, [findAdvancedSelectedCriteriaField, findAdvancedSelectedField, findAdvancedSelectedRequestIndex]);

  const commitSaveFindDialog = useCallback(() => {
    const normalizedName = saveFindDialogName.trim();
    if (!normalizedName) {
      setStatus("Saved find name is required");
      return;
    }
    const normalizedRequests = saveFindDialogRequests
      .map((request) => ({
        ...request,
        criteria: normalizeFindCriteriaMap(request.criteria)
      }))
      .filter((request) => Object.keys(request.criteria).length > 0 || request.omit);
    if (normalizedRequests.length === 0) {
      setStatus("No find criteria to save");
      return;
    }
    const now = Date.now();
    const targetLayoutId = activeLayoutName.trim() || layout?.id?.trim() || layoutRouteName;
    const editingId = saveFindDialogEditingId;
    const nextId = editingId || crypto.randomUUID();
    setSavedFinds((previous) => {
      const byNameIndex = previous.findIndex(
        (entry) =>
          entry.id !== editingId &&
          entry.name.trim().toLowerCase() === normalizedName.toLowerCase()
      );
      if (byNameIndex >= 0) {
        const next = [...previous];
        next[byNameIndex] = {
          ...next[byNameIndex],
          name: normalizedName,
          requests: normalizedRequests,
          layoutId: targetLayoutId,
          createdAt: next[byNameIndex].createdAt ?? now
        };
        return next;
      }

      const byIdIndex = previous.findIndex((entry) => entry.id === editingId);
      if (byIdIndex >= 0) {
        const next = [...previous];
        next[byIdIndex] = {
          ...next[byIdIndex],
          name: normalizedName,
          requests: normalizedRequests,
          layoutId: targetLayoutId
        };
        return next;
      }

      return [
        ...previous,
        {
          id: nextId,
          name: normalizedName,
          requests: normalizedRequests,
          createdAt: now,
          layoutId: targetLayoutId
        }
      ];
    });
    setSaveFindDialogOpen(false);
    setSaveFindDialogEditingId(null);
    setStatus(`Saved find "${normalizedName}"`);
  }, [
    activeLayoutName,
    layout?.id,
    layoutRouteName,
    saveFindDialogEditingId,
    saveFindDialogName,
    saveFindDialogRequests
  ]);

  const inferAddRelatedTargetTableOccurrence = useCallback(() => {
    if (!layout) {
      return "";
    }
    const defaultTable = layout.defaultTableOccurrence.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const component of sortedComponents) {
      if (component.type !== "field") {
        continue;
      }
      const relatedTableOccurrence = (component.binding?.tableOccurrence ?? "").trim();
      if (relatedTableOccurrence && relatedTableOccurrence.toLowerCase() !== defaultTable) {
        counts.set(relatedTableOccurrence, (counts.get(relatedTableOccurrence) ?? 0) + 1);
      }
    }
    const ranked = [...counts.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0], undefined, { sensitivity: "base" });
    });
    return ranked[0]?.[0] ?? "";
  }, [layout, sortedComponents]);

  const createRelatedRecordFallback = useCallback(
    async (relatedTableOccurrence: string): Promise<boolean> => {
      const normalizedTableOccurrence = relatedTableOccurrence.trim();
      if (!layout || !currentRecord || !normalizedTableOccurrence) {
        return false;
      }
      const writeTargetLayout = resolveWriteLayoutCandidate(
        normalizedTableOccurrence,
        availableLayouts
      );
      if (!writeTargetLayout) {
        return false;
      }

      const parentEntity = primaryEntityToken(layout);
      const parentRecord = currentRecord as Record<string, unknown>;
      const parentPrimaryKeyField = Object.keys(parentRecord).find(
        (fieldName) =>
          fieldName !== "recordId" &&
          fieldName !== "modId" &&
          fieldName !== "portalData" &&
          unqualifiedFieldToken(fieldName) === "primarykey"
      );
      const parentPrimaryKeyValue =
        (parentPrimaryKeyField ? parentRecord[parentPrimaryKeyField] : undefined) ??
        parentRecord.PrimaryKey ??
        "";

      if (parentPrimaryKeyValue == null || String(parentPrimaryKeyValue).trim() === "") {
        return false;
      }

      let fieldNames: string[] = [];
      try {
        const fieldsResponse = await fetch(
          withWorkspaceForApi(`/api/fm/fields?tableOccurrence=${encodeURIComponent(writeTargetLayout)}`),
          { cache: "no-store" }
        );
        if (!fieldsResponse.ok) {
          return false;
        }
        const fieldsPayload = (await fieldsResponse.json()) as FieldCatalogPayload;
        fieldNames = normalizeFieldNames(fieldsPayload.fields);
      } catch {
        return false;
      }

      if (fieldNames.length === 0) {
        return false;
      }

      const foreignKeyFields = fieldNames.filter((fieldName) => unqualifiedFieldToken(fieldName).includes("foreignkey"));
      const exactParentForeignKey = foreignKeyFields.find(
        (fieldName) => parentEntity && unqualifiedFieldToken(fieldName) === `${parentEntity}foreignkey`
      );
      const containsParentForeignKey = foreignKeyFields.find(
        (fieldName) => parentEntity && unqualifiedFieldToken(fieldName).includes(parentEntity)
      );
      const targetForeignKeyField =
        exactParentForeignKey ??
        containsParentForeignKey ??
        (foreignKeyFields.length === 1 ? foreignKeyFields[0] : "");
      if (!targetForeignKeyField) {
        return false;
      }
      const targetForeignKeyFieldName = containerUploadFieldName(targetForeignKeyField);
      if (!targetForeignKeyFieldName) {
        return false;
      }

      const createResponse = await fetch(withWorkspaceForApi("/api/fm/records"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableOccurrence: writeTargetLayout,
          fieldData: {
            [targetForeignKeyFieldName]: parentPrimaryKeyValue
          },
          workspaceId: currentWorkspaceId
        })
      });

      return createResponse.ok;
    },
    [availableLayouts, currentRecord, currentWorkspaceId, layout, withWorkspaceForApi]
  );

  const runObjectScript = async (
    script: string | undefined,
    parameterTemplate?: string,
    objectLabel?: string
  ) => {
    const scriptName = (script ?? "").trim();
    if (!layout || !scriptName) {
      setStatus(objectLabel ? `No script attached to ${objectLabel}` : "No script attached to object");
      return;
    }

    const isAddRelatedRecordScript = scriptName.toLowerCase() === "add related record";
    const addRelatedTargetTableOccurrence = isAddRelatedRecordScript
      ? inferAddRelatedTargetTableOccurrence()
      : "";
    const currentRecordId = String(currentRecord?.recordId ?? "").trim();
    const beforePortalCount =
      isAddRelatedRecordScript && addRelatedTargetTableOccurrence && currentRecordId
        ? portalRowCountForTable(currentRecord, addRelatedTargetTableOccurrence)
        : 0;

    const parameter = templateString(parameterTemplate ?? "", currentRecord as Record<string, unknown>);
    const response = await fetch(withWorkspaceForApi("/api/fm/scripts"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tableOccurrence: layout.defaultTableOccurrence,
        script: scriptName,
        parameter,
        workspaceId: currentWorkspaceId
      })
    });

    if (!response.ok) {
      // "Add Related Record" is used as a common FileMaker UX pattern.
      // If script execution fails, we fall back to creating the related row directly
      // so the button still behaves as expected in the web IDE runtime.
      if (isAddRelatedRecordScript && addRelatedTargetTableOccurrence) {
        const createdFallbackRecord = await createRelatedRecordFallback(addRelatedTargetTableOccurrence);
        if (createdFallbackRecord) {
          await loadAll({ indexMode: "preserve" });
          setStatus(`Added related record (${addRelatedTargetTableOccurrence})`);
          return;
        }
      }
      const body = await response.text();
      setError(`Script failed: ${body}`);
      setStatus(`Script ${scriptName} failed`);
      return;
    }

    const payload = (await response.json()) as {
      result: {
        source: "mock" | "filemaker";
      };
    };

    const reloaded = await loadAll({ indexMode: "preserve" });
    if (
      isAddRelatedRecordScript &&
      addRelatedTargetTableOccurrence &&
      currentRecordId &&
      reloaded
    ) {
      // Some scripts complete successfully but don't produce a related row in this context.
      // Detect that case and run the same fallback to keep portal behavior consistent.
      const refreshedRecord =
        reloaded.records.find((record) => String(record.recordId ?? "").trim() === currentRecordId) ?? null;
      const afterPortalCount = portalRowCountForTable(refreshedRecord, addRelatedTargetTableOccurrence);
      if (afterPortalCount <= beforePortalCount) {
        const createdFallbackRecord = await createRelatedRecordFallback(addRelatedTargetTableOccurrence);
        if (createdFallbackRecord) {
          await loadAll({ indexMode: "preserve" });
          setStatus(
            `Script ${scriptName} executed (${payload.result.source}); created related record in ${addRelatedTargetTableOccurrence}`
          );
          return;
        }
      }
    }
    setStatus(`Script ${scriptName} executed (${payload.result.source})`);
  };

  const inferPortalTableOccurrenceForComponent = useCallback(
    (component: LayoutComponent): { tableOccurrence: string; preferredFieldName: string } => {
      const direct = (component.binding?.tableOccurrence ?? "").trim();
      if (direct) {
        return {
          tableOccurrence: direct,
          preferredFieldName: ""
        };
      }

      const qualifiedFromLabel = extractFirstQualifiedFieldToken(component.props.label ?? "");
      if (qualifiedFromLabel) {
        return {
          tableOccurrence: qualifiedFromLabel.tableOccurrence,
          preferredFieldName: qualifiedFromLabel.fieldName
        };
      }

      const qualifiedFromTooltip = extractFirstQualifiedFieldToken(component.props.tooltip ?? "");
      if (qualifiedFromTooltip) {
        return {
          tableOccurrence: qualifiedFromTooltip.tableOccurrence,
          preferredFieldName: qualifiedFromTooltip.fieldName
        };
      }

      const componentFrame = runtimeComponentFrames[component.id] ?? {
        x: component.position.x,
        y: component.position.y,
        width: component.position.width,
        height: component.position.height
      };
      const centerX = componentFrame.x + componentFrame.width / 2;
      const centerY = componentFrame.y + componentFrame.height / 2;
      for (const candidate of sortedComponents) {
        if (candidate.type !== "portal") {
          continue;
        }
        const candidateTableOccurrence = (candidate.binding?.tableOccurrence ?? "").trim();
        if (!candidateTableOccurrence) {
          continue;
        }
        const candidateFrame = runtimeComponentFrames[candidate.id] ?? {
          x: candidate.position.x,
          y: candidate.position.y,
          width: candidate.position.width,
          height: candidate.position.height
        };
        const insideHorizontal =
          centerX >= candidateFrame.x &&
          centerX <= candidateFrame.x + candidateFrame.width;
        const insideVertical =
          centerY >= candidateFrame.y &&
          centerY <= candidateFrame.y + candidateFrame.height;
        if (insideHorizontal && insideVertical) {
          return {
            tableOccurrence: candidateTableOccurrence,
            preferredFieldName: ""
          };
        }
      }

      return {
        tableOccurrence: "",
        preferredFieldName: ""
      };
    },
    [runtimeComponentFrames, sortedComponents]
  );

  const runObjectAction = async (
    onClick: LayoutEventBindings["onClick"] | undefined,
    component: LayoutComponent,
    objectLabel?: string
  ) => {
    if (!layout || !onClick) {
      setStatus(objectLabel ? `No action attached to ${objectLabel}` : "No action attached to object");
      return;
    }

    if (onClick.action === "runScript") {
      await runObjectScript(onClick.script, onClick.parameter, objectLabel);
      return;
    }

    if (onClick.action === "goToLayout") {
      const targetLayout = (onClick.layoutName ?? "").trim();
      if (!targetLayout) {
        setStatus("Go to Layout action is missing a target layout");
        return;
      }
      await switchBrowseLayout(targetLayout);
      return;
    }

    if (onClick.action === "deletePortalRow") {
      if (isFindMode) {
        setStatus("Delete Portal Row is unavailable in Find Mode");
        return;
      }
      if (isPreviewMode) {
        setPreviewReadOnlyStatus();
        return;
      }
      if (!currentRecord?.recordId) {
        setStatus("No current record to delete a related row from");
        return;
      }

      const inferred = inferPortalTableOccurrenceForComponent(component);
      const targetTableOccurrence = inferred.tableOccurrence.trim();
      if (!targetTableOccurrence) {
        setStatus("Delete Portal Row could not determine the related table occurrence");
        return;
      }
      const writeTargetLayout = resolveWriteLayoutCandidate(targetTableOccurrence, availableLayouts);
      if (!writeTargetLayout) {
        setStatus(`Delete Portal Row could not find a writable layout for ${targetTableOccurrence}`);
        return;
      }

      const portalRecordId = portalRowRecordIdForTable(
        currentRecord,
        targetTableOccurrence,
        inferred.preferredFieldName
      );
      if (!portalRecordId) {
        setStatus(`No related ${targetTableOccurrence} row selected`);
        return;
      }

      setError(null);
      setStatus(`Deleting related ${targetTableOccurrence} row...`);
      const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableOccurrence: writeTargetLayout,
          recordId: portalRecordId,
          workspaceId: currentWorkspaceId
        })
      });
      if (!response.ok) {
        const body = await response.text();
        setError(`Delete portal row failed: ${body}`);
        setStatus("Delete portal row failed");
        return;
      }

      setStatus(`Deleted related ${targetTableOccurrence} row`);
      await loadAll({ indexMode: "preserve" });
    }
  };

  const patchRecordField = useCallback(
    (rowIndex: number, field: string, value: unknown, recordId?: string) => {
      if (isFindMode) {
        const normalizedField = field.trim();
        if (!normalizedField) {
          return;
        }
        setFindCriteria((previous) => ({
          ...previous,
          [normalizedField]: normalizeFindCriterionValue(value)
        }));
        return;
      }
      if (isPreviewMode) {
        setPreviewReadOnlyStatus();
        return;
      }

      setRecords((previous) => {
        if (!previous.length) {
          return previous;
        }

        const safeIndex = recordId
          ? previous.findIndex((record) => record.recordId === recordId)
          : Math.min(Math.max(rowIndex, 0), previous.length - 1);
        if (safeIndex < 0) {
          return previous;
        }

        const current = previous[safeIndex];
        if (!current) {
          return previous;
        }

        const updated = [...previous];
        updated[safeIndex] = {
          ...current,
          [field]: value
        };
        return updated;
      });

      if (recordId) {
        setAllRecords((previous) => {
          if (!previous.length) {
            return previous;
          }
          const safeIndex = previous.findIndex((record) => record.recordId === recordId);
          if (safeIndex < 0) {
            return previous;
          }
          const current = previous[safeIndex];
          if (!current) {
            return previous;
          }
          const updated = [...previous];
          updated[safeIndex] = {
            ...current,
            [field]: value
          };
          return updated;
        });
      }

      if (recordId) {
        const key = fieldSaveKey(recordId, field);
        setFieldSaveStatus((previous) => {
          if (!previous[key]) {
            return previous;
          }
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }
    },
    [isFindMode, isPreviewMode, setPreviewReadOnlyStatus]
  );

  const setFieldIndicatorWithTimeout = useCallback(
    (key: string, state: FieldSaveState, timeoutMs?: number) => {
      if (clearIndicatorTimers.current[key]) {
        clearTimeout(clearIndicatorTimers.current[key]);
        delete clearIndicatorTimers.current[key];
      }

      setFieldSaveStatus((previous) => ({
        ...previous,
        [key]: state
      }));

      if (timeoutMs) {
        clearIndicatorTimers.current[key] = setTimeout(() => {
          setFieldSaveStatus((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
          });
          delete clearIndicatorTimers.current[key];
        }, timeoutMs);
      }
    },
    []
  );

  const saveFieldOnBlur = useCallback(
    async (field: string, value: unknown, recordId?: string) => {
      if (isFindMode) {
        return;
      }
      if (isPreviewMode) {
        setPreviewReadOnlyStatus();
        return;
      }
      if (!layout || !recordId) {
        return;
      }
      const key = fieldSaveKey(recordId, field);

      setError(null);
      setStatus(`Saving ${field}...`);
      setFieldIndicatorWithTimeout(key, "saving");

      const parentRecord =
        records.find((record) => String(record.recordId ?? "").trim() === String(recordId).trim()) ??
        allRecords.find((record) => String(record.recordId ?? "").trim() === String(recordId).trim()) ??
        null;
      const qualifiedField = splitQualifiedFieldToken(field);
      const normalizeDateWriteValue = (raw: unknown): unknown => {
        if (typeof raw !== "string") {
          return raw;
        }
        const trimmed = raw.trim();
        if (!trimmed) {
          return "";
        }
        const controlType = resolveControlTypeForField(field);
        const resolvedFieldType = resolveFieldType(field, fieldTypeByName).toLowerCase();
        const looksDateField = controlType === "date" || resolvedFieldType.includes("date");
        if (!looksDateField) {
          return raw;
        }
        const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!isoMatch) {
          return raw;
        }
        const [, year, month, day] = isoMatch;
        const monthNumber = Number.parseInt(month, 10);
        const dayNumber = Number.parseInt(day, 10);
        if (!Number.isFinite(monthNumber) || !Number.isFinite(dayNumber)) {
          return raw;
        }
        // FileMaker Data API accepts locale-formatted dates in many deployments where HTML date inputs emit ISO strings.
        return `${monthNumber}/${dayNumber}/${year}`;
      };
      const writeValue = normalizeDateWriteValue(value);
      try {
        let contextualErrorBody = "";
        const portalUpdateErrors: string[] = [];
        const relatedPortalRecordIdHint = qualifiedField
          ? portalRowRecordIdForTable(parentRecord, qualifiedField.tableOccurrence, qualifiedField.fieldName)
          : "";
        const portalUpdateContext = qualifiedField
          ? resolvePortalRowUpdateContext(
              parentRecord,
              qualifiedField.tableOccurrence,
              qualifiedField.fieldName,
              relatedPortalRecordIdHint
            )
          : null;

        if (qualifiedField && parentRecord?.recordId) {
          // For related TO fields, try the parent-layout context first.
          // FileMaker can resolve related writes by context even when portal row ids are not explicit.
          // Prefer FileMaker layout-context updates for related fields.
          // This matches native layout editing semantics and avoids portal-row id ambiguity.
          const contextualFieldKeyCandidates = dedupeCaseInsensitiveStrings(
            [
              portalUpdateContext ? `${portalUpdateContext.portalName}::${qualifiedField.fieldName}` : "",
              field,
              `${qualifiedField.tableOccurrence}::${qualifiedField.fieldName}`,
              `::${qualifiedField.fieldName}`,
              qualifiedField.fieldName
            ]
              .map((entry) => String(entry ?? "").trim())
              .filter((entry) => entry.length > 0)
          );
          const contextualErrors: string[] = [];

          for (const contextualFieldKey of contextualFieldKeyCandidates) {
            const contextualResponse = await fetch(withWorkspaceForApi("/api/fm/records"), {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                tableOccurrence: layout.defaultTableOccurrence,
                recordId: String(parentRecord.recordId),
                fieldData: {
                  [contextualFieldKey]: writeValue
                },
                workspaceId: currentWorkspaceId
              })
            });
            if (contextualResponse.ok) {
              setStatus(`Saved ${field}`);
              setFieldIndicatorWithTimeout(key, "saved", 1500);
              await loadAll({ indexMode: "preserve" });
              return;
            }
            contextualErrors.push(await contextualResponse.text());
          }

          contextualErrorBody = contextualErrors.join(" | ");

          // Retry with explicit portalData row patch on the parent layout.
          // This is required in solutions where related TO names are not writable layouts.
          if (portalUpdateContext) {
            const fieldKeyCandidates = dedupeCaseInsensitiveStrings(
              [
                portalUpdateContext.rowFieldKey,
                `${portalUpdateContext.portalName}::${qualifiedField.fieldName}`,
                `${qualifiedField.tableOccurrence}::${qualifiedField.fieldName}`,
                `::${qualifiedField.fieldName}`,
                qualifiedField.fieldName
              ]
                .map((entry) => String(entry ?? "").trim())
                .filter((entry) => entry.length > 0)
            );

            for (const portalFieldKey of fieldKeyCandidates) {
              const portalRowPatch: Record<string, unknown> = {
                recordId: portalUpdateContext.rowRecordId,
                [portalFieldKey]: writeValue
              };
              if (portalUpdateContext.rowModId) {
                portalRowPatch.modId = portalUpdateContext.rowModId;
              }

              const portalResponse = await fetch(withWorkspaceForApi("/api/fm/records"), {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  tableOccurrence: layout.defaultTableOccurrence,
                  recordId: String(parentRecord.recordId),
                  fieldData: {},
                  portalData: {
                    [portalUpdateContext.portalName]: [portalRowPatch]
                  },
                  workspaceId: currentWorkspaceId
                })
              });

              if (portalResponse.ok) {
                setStatus(`Saved ${field}`);
                setFieldIndicatorWithTimeout(key, "saved", 1500);
                await loadAll({ indexMode: "preserve" });
                return;
              }

              portalUpdateErrors.push(await portalResponse.text());
            }
          }
        }

        const relatedPortalRecordId = qualifiedField ? relatedPortalRecordIdHint : "";

        // If context write failed, resolve an explicit portal row and retry against that TO.
        if (qualifiedField && !relatedPortalRecordId) {
          setError(
            `Update failed: could not resolve a related portal row for ${qualifiedField.tableOccurrence}::${qualifiedField.fieldName}`
          );
          setStatus(`Failed saving ${field}`);
          setFieldIndicatorWithTimeout(key, "error", 4000);
          return;
        }

        const resolvedRelatedLayout = qualifiedField
          ? resolveWriteLayoutCandidate(qualifiedField.tableOccurrence, availableLayouts)
          : "";

        if (qualifiedField && !resolvedRelatedLayout) {
          const details = [contextualErrorBody, ...portalUpdateErrors]
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .join(" | ");
          setError(
            `Update failed: no writable layout found for related table occurrence "${qualifiedField.tableOccurrence}"${
              details ? ` (${details})` : ""
            }`
          );
          setStatus(`Failed saving ${field}`);
          setFieldIndicatorWithTimeout(key, "error", 4000);
          return;
        }

        const targetTableOccurrence = qualifiedField
          ? resolvedRelatedLayout
          : layout.defaultTableOccurrence;
        const targetRecordId = qualifiedField ? relatedPortalRecordId : recordId;
        const targetFieldName = qualifiedField ? qualifiedField.fieldName : field;

        const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            tableOccurrence: targetTableOccurrence,
            recordId: targetRecordId,
            fieldData: {
              [targetFieldName]: writeValue
            },
            workspaceId: currentWorkspaceId
          })
        });

        if (!response.ok) {
          const body = await response.text();
          setError(`Update failed: ${body}`);
          setStatus(`Failed saving ${field}`);
          setFieldIndicatorWithTimeout(key, "error", 4000);
          return;
        }

        const payload = (await response.json()) as {
          record?: FMRecord;
        };

        if (qualifiedField) {
          setStatus(`Saved ${field}`);
          setFieldIndicatorWithTimeout(key, "saved", 1500);
          await loadAll({ indexMode: "preserve" });
          return;
        }

        if (payload.record) {
          setRecords((previous) =>
            previous.map((record) =>
              record.recordId === recordId
                ? {
                    ...record,
                    ...payload.record
                  }
                : record
            )
          );
          setAllRecords((previous) =>
            previous.map((record) =>
              record.recordId === recordId
                ? {
                    ...record,
                    ...payload.record
                  }
                : record
            )
          );
        }

        setStatus(`Saved ${field}`);
        setFieldIndicatorWithTimeout(key, "saved", 1500);
      } catch (saveError) {
        setError(saveError instanceof Error ? `Update failed: ${saveError.message}` : "Update failed");
        setStatus(`Failed saving ${field}`);
        setFieldIndicatorWithTimeout(key, "error", 4000);
      }
    },
    [
      allRecords,
      availableLayouts,
      currentWorkspaceId,
      isFindMode,
      isPreviewMode,
      layout,
      loadAll,
      records,
      resolveControlTypeForField,
      setFieldIndicatorWithTimeout,
      setPreviewReadOnlyStatus,
      fieldTypeByName,
      withWorkspaceForApi
    ]
  );

  const uploadContainerForRecordField = useCallback(
    async (params: { stateKey: string; recordId?: string; fieldName: string; file: File }) => {
      const { stateKey, recordId, fieldName, file } = params;
      const target = layout
        ? resolveContainerUploadTarget(fieldName, layout.defaultTableOccurrence)
        : null;
      if (!layout || !recordId || !target) {
        setStatus("Container upload requires a saved record and a bound field");
        return;
      }
      if (isFindMode) {
        setStatus("Exit Find Mode before uploading to container fields");
        return;
      }
      if (isPreviewMode) {
        setPreviewReadOnlyStatus();
        return;
      }
      if (source === "mock") {
        setStatus("Container uploads are unavailable in mock mode");
        return;
      }
      if (!isSupportedContainerUploadFile(file)) {
        setError(
          `Unsupported container file type: ${file.name}. Use FileMaker-supported image, document, audio, or video formats.`
        );
        setStatus("Container upload failed");
        return;
      }

      setError(null);
      setContainerUploadState((previous) => ({
        ...previous,
        [stateKey]: "uploading"
      }));
      setStatus(`Uploading ${file.name}...`);

      const body = new FormData();
      body.append("tableOccurrence", target.tableOccurrence);
      body.append("recordId", recordId);
      body.append("fieldName", target.fieldName);
      body.append("workspaceId", currentWorkspaceId);
      body.append("file", file);

      try {
        const response = await fetch(withWorkspaceForApi("/api/fm/container/upload"), {
          method: "POST",
          body
        });
        if (!response.ok) {
          let message = "";
          try {
            const payload = (await response.json()) as { error?: string };
            message = payload.error ?? "Container upload failed";
          } catch {
            message = await response.text();
          }
          setError(`Container upload failed: ${message}`);
          setStatus("Container upload failed");
          return;
        }

        setStatus(`Uploaded ${file.name}`);
        setContainerLoadFailed({});
        await loadAll({ indexMode: "preserve" });
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : "Container upload failed";
        setError(`Container upload failed: ${message}`);
        setStatus("Container upload failed");
      } finally {
        setContainerUploadState((previous) => {
          const next = { ...previous };
          delete next[stateKey];
          return next;
        });
      }
    },
    [currentWorkspaceId, isFindMode, isPreviewMode, layout, loadAll, setPreviewReadOnlyStatus, source, withWorkspaceForApi]
  );

  const closeColumnMenus = useCallback(() => {
    setColumnMenu(null);
    setColumnSubmenu(null);
  }, []);

  const closeContainerMenu = useCallback(() => {
    setContainerMenu(null);
  }, []);

  const saveStateLabel = (state: FieldSaveState) => {
    if (state === "saving") {
      return "Saving...";
    }
    if (state === "saved") {
      return "Saved";
    }
    return "Save failed";
  };

  const canUploadContainerForTarget = useCallback(
    (recordId: string | undefined, fieldName: string): boolean => {
      const normalizedField = containerUploadFieldName(fieldName);
      return Boolean(layout && recordId && normalizedField) && !isFindMode && !isPreviewMode && source !== "mock";
    },
    [isFindMode, isPreviewMode, layout, source]
  );

  const openContainerMenuAtPointer = useCallback(
    (
      event: ReactMouseEvent<HTMLElement>,
      params: {
        stateKey: string;
        recordId?: string;
        fieldName: string;
        rawUrl: string;
        label: string;
      }
    ) => {
      event.preventDefault();
      event.stopPropagation();
      closeColumnMenus();
      setContainerMenu({
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        stateKey: params.stateKey,
        recordId: params.recordId,
        fieldName: params.fieldName,
        rawUrl: params.rawUrl,
        label: params.label
      });
    },
    [closeColumnMenus]
  );

  const beginContainerInsertForTarget = useCallback(
    (
      target: ContainerUploadTarget,
      kind: "picture" | "pdf" | "file",
      options?: { closeMenu?: boolean }
    ) => {
      if (!canUploadContainerForTarget(target.recordId, target.fieldName)) {
        if (isFindMode) {
          setStatus("Exit Find Mode before inserting into container fields");
        } else if (isPreviewMode) {
          setPreviewReadOnlyStatus();
        } else if (source === "mock") {
          setStatus("Container inserts are unavailable in mock mode");
        } else {
          setStatus("Container insert requires a saved record and a bound field");
        }
        if (options?.closeMenu !== false) {
          closeContainerMenu();
        }
        return;
      }
      if (containerUploadState[target.stateKey] === "uploading") {
        setStatus("Container upload already in progress");
        if (options?.closeMenu !== false) {
          closeContainerMenu();
        }
        return;
      }
      pendingContainerUploadTargetRef.current = target;
      if (options?.closeMenu !== false) {
        closeContainerMenu();
      }
      if (kind === "picture") {
        containerPictureInputRef.current?.click();
        return;
      }
      if (kind === "pdf") {
        containerPdfInputRef.current?.click();
        return;
      }
      containerFileInputRef.current?.click();
    },
    [
      canUploadContainerForTarget,
      closeContainerMenu,
      containerUploadState,
      isFindMode,
      isPreviewMode,
      source,
      setPreviewReadOnlyStatus
    ]
  );

  const handleContainerPrimaryClick = useCallback(
    (
      event: ReactMouseEvent<HTMLElement>,
      params: {
        stateKey: string;
        recordId?: string;
        fieldName: string;
        rawUrl: string;
        label: string;
      }
    ) => {
      event.preventDefault();
      event.stopPropagation();
      closeColumnMenus();
      setContainerMenu({
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        stateKey: params.stateKey,
        recordId: params.recordId,
        fieldName: params.fieldName,
        rawUrl: params.rawUrl,
        label: params.label
      });
    },
    [closeColumnMenus]
  );

  const handleContainerFileInputChange = useCallback(
    (input: HTMLInputElement) => {
      const selectedFile = input.files?.[0];
      input.value = "";
      const target = pendingContainerUploadTargetRef.current;
      pendingContainerUploadTargetRef.current = null;
      if (!selectedFile || !target) {
        return;
      }
      void uploadContainerForRecordField({
        stateKey: target.stateKey,
        recordId: target.recordId,
        fieldName: target.fieldName,
        file: selectedFile
      });
    },
    [uploadContainerForRecordField]
  );

  const startContainerInsertAction = useCallback(
    (kind: "picture" | "pdf" | "file") => {
      if (!containerMenu) {
        return;
      }
      beginContainerInsertForTarget(
        {
          stateKey: containerMenu.stateKey,
          recordId: containerMenu.recordId,
          fieldName: containerMenu.fieldName
        },
        kind
      );
    },
    [
      beginContainerInsertForTarget,
      containerMenu
    ]
  );

  const clearContainerForRecordField = useCallback(
    async (params: { stateKey: string; recordId?: string; fieldName: string; label: string }) => {
      const { stateKey, recordId, fieldName, label } = params;
      const target = layout
        ? resolveContainerUploadTarget(fieldName, layout.defaultTableOccurrence)
        : null;
      if (!layout || !recordId || !target) {
        setStatus("Container clear requires a saved record and a bound field");
        return;
      }
      if (isFindMode) {
        setStatus("Exit Find Mode before editing container fields");
        return;
      }
      if (isPreviewMode) {
        setPreviewReadOnlyStatus();
        return;
      }
      if (source === "mock") {
        setStatus("Container edits are unavailable in mock mode");
        return;
      }
      setError(null);
      setStatus(`Clearing ${label || target.fieldName}...`);
      try {
        const response = await fetch(withWorkspaceForApi("/api/fm/records"), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            tableOccurrence: target.tableOccurrence,
            recordId,
            fieldData: {
              [target.fieldName]: ""
            },
            workspaceId: currentWorkspaceId
          })
        });
        if (!response.ok) {
          const body = await response.text();
          setError(`Container clear failed: ${body}`);
          setStatus("Container clear failed");
          return;
        }
        setContainerLoadFailed((previous) => {
          if (!previous[stateKey]) {
            return previous;
          }
          const next = { ...previous };
          delete next[stateKey];
          return next;
        });
        setStatus(`Cleared ${label || target.fieldName}`);
        await loadAll({ indexMode: "preserve" });
      } catch (clearError) {
        const message = clearError instanceof Error ? clearError.message : "Container clear failed";
        setError(`Container clear failed: ${message}`);
        setStatus("Container clear failed");
      }
    },
    [currentWorkspaceId, isFindMode, isPreviewMode, layout, loadAll, setPreviewReadOnlyStatus, source, withWorkspaceForApi]
  );

  const exportContainerFieldContents = useCallback(
    async (params: { rawUrl: string; fieldName: string; label: string }) => {
      const { rawUrl, fieldName, label } = params;
      const trimmedUrl = rawUrl.trim();
      if (!trimmedUrl) {
        setStatus("No container data to export");
        return;
      }
      setError(null);
      setStatus(`Exporting ${label || fieldName || "container"}...`);
      try {
        const response = await fetch(containerProxySrc(trimmedUrl, currentWorkspaceId), { cache: "no-store" });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const normalizedField = containerUploadFieldName(fieldName) || "container";
        const fallback = `${normalizedField}.${inferFileExtensionFromMimeType(blob.type) || "bin"}`;
        const fileName = fileNameFromContainerSource(trimmedUrl, fallback);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setStatus(`Exported ${fileName}`);
      } catch (exportError) {
        const message = exportError instanceof Error ? exportError.message : "Container export failed";
        setError(`Container export failed: ${message}`);
        setStatus("Container export failed");
      }
    },
    [currentWorkspaceId]
  );

  const pasteContainerFromClipboard = useCallback(
    async (target: ContainerMenuState) => {
      if (!canUploadContainerForTarget(target.recordId, target.fieldName)) {
        if (isFindMode) {
          setStatus("Exit Find Mode before pasting into container fields");
        } else if (isPreviewMode) {
          setPreviewReadOnlyStatus();
        } else if (source === "mock") {
          setStatus("Container paste is unavailable in mock mode");
        } else {
          setStatus("Container paste requires a saved record and a bound field");
        }
        return;
      }
      if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
        setStatus("Clipboard paste is unavailable in this browser. Use Insert File...");
        return;
      }
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const mimeType of item.types) {
            const blob = await item.getType(mimeType);
            const extension = inferFileExtensionFromMimeType(mimeType) || "bin";
            const file = new File([blob], `clipboard-${Date.now()}.${extension}`, { type: mimeType });
            if (!isSupportedContainerUploadFile(file)) {
              continue;
            }
            await uploadContainerForRecordField({
              stateKey: target.stateKey,
              recordId: target.recordId,
              fieldName: target.fieldName,
              file
            });
            return;
          }
        }
        setStatus("Clipboard does not contain a supported file");
      } catch (pasteError) {
        const message = pasteError instanceof Error ? pasteError.message : "Container paste failed";
        setError(`Container paste failed: ${message}`);
        setStatus("Container paste failed");
      }
    },
    [canUploadContainerForTarget, isFindMode, isPreviewMode, setPreviewReadOnlyStatus, source, uploadContainerForRecordField]
  );

  const copyContainerReferenceToClipboard = useCallback(
    async (target: ContainerMenuState): Promise<boolean> => {
      if (!target.rawUrl.trim()) {
        setStatus("No container data to copy");
        return false;
      }
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        setStatus("Clipboard copy is unavailable in this browser");
        return false;
      }
      try {
        await navigator.clipboard.writeText(target.rawUrl);
        setStatus(`Copied ${target.label || "container"} reference`);
        return true;
      } catch (copyError) {
        const message = copyError instanceof Error ? copyError.message : "Clipboard copy failed";
        setError(`Clipboard copy failed: ${message}`);
        setStatus("Clipboard copy failed");
        return false;
      }
    },
    []
  );

  const applyContainerMenuAction = useCallback(
    (action: ContainerMenuAction) => {
      const target = containerMenu;
      if (!target) {
        return;
      }
      if (action === "insert-picture") {
        startContainerInsertAction("picture");
        return;
      }
      if (action === "insert-pdf") {
        startContainerInsertAction("pdf");
        return;
      }
      if (action === "insert-file") {
        startContainerInsertAction("file");
        return;
      }

      closeContainerMenu();

      if (action === "cut") {
        void (async () => {
          const copied = await copyContainerReferenceToClipboard(target);
          if (!copied) {
            return;
          }
          await clearContainerForRecordField({
            stateKey: target.stateKey,
            recordId: target.recordId,
            fieldName: target.fieldName,
            label: target.label
          });
        })();
        return;
      }

      if (action === "copy") {
        void copyContainerReferenceToClipboard(target);
        return;
      }

      if (action === "paste") {
        void pasteContainerFromClipboard(target);
        return;
      }

      if (action === "export") {
        void exportContainerFieldContents({
          rawUrl: target.rawUrl,
          fieldName: target.fieldName,
          label: target.label
        });
      }
    },
    [
      clearContainerForRecordField,
      closeContainerMenu,
      copyContainerReferenceToClipboard,
      containerMenu,
      exportContainerFieldContents,
      pasteContainerFromClipboard,
      startContainerInsertAction
    ]
  );

  const switchBrowseLayout = async (layoutName: string) => {
    const normalizedName = layoutName.trim();
    if (!normalizedName) {
      return;
    }

    if (normalizedName === activeLayoutName.trim()) {
      return;
    }

    setError(null);
    setStatus(`Switching to ${normalizedName}...`);
    try {
      const response = await fetch(
        withWorkspaceForApi(`/api/layouts/by-fm-layout?name=${encodeURIComponent(normalizedName)}`),
        { cache: "no-store" }
      );
      if (!response.ok) {
        const body = await response.text();
        setError(`Failed to switch layout: ${body}`);
        setStatus("Switch failed");
        return;
      }

      const payload = (await response.json()) as {
        layout: LayoutDefinition;
      };
      const nextRouteName = payload.layout.id?.trim() || normalizedName;
      router.push(withWorkspaceForRoute(`/layouts/${encodeURIComponent(nextRouteName)}/browse`));
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch selected layout";
      setError(`Failed to switch layout: ${message}`);
      setStatus("Switch failed");
    }
  };

  const resolveBrowseLayoutRouteForWorkspace = useCallback(
    async (targetWorkspaceId: string): Promise<string> => {
      const candidates: string[] = [];
      const seen = new Set<string>();
      const addCandidate = (raw: string | undefined) => {
        const normalized = String(raw ?? "").trim();
        if (!normalized) {
          return;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        candidates.push(normalized);
      };

      addCandidate(activeLayoutName);
      addCandidate(layout?.name);
      addCandidate(layout?.defaultTableOccurrence);
      addCandidate(layoutRouteName);

      for (const candidate of candidates) {
        const response = await fetch(
          withWorkspaceQuery(`/api/layouts/by-fm-layout?name=${encodeURIComponent(candidate)}`, targetWorkspaceId),
          { cache: "no-store" }
        );
        if (!response.ok) {
          continue;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          layout?: {
            id?: string;
          };
        };
        const routeName = String(payload.layout?.id ?? "").trim() || candidate;
        if (routeName) {
          return routeName;
        }
      }

      const fallbackResponse = await fetch(withWorkspaceQuery("/api/layouts", targetWorkspaceId), {
        cache: "no-store"
      });
      if (fallbackResponse.ok) {
        const payload = (await fallbackResponse.json().catch(() => ({}))) as {
          layouts?: Array<{
            id?: string;
            name?: string;
          }>;
        };
        const firstLayout = Array.isArray(payload.layouts) ? payload.layouts[0] : null;
        const fallbackRouteName = String(firstLayout?.id ?? firstLayout?.name ?? "").trim();
        if (fallbackRouteName) {
          return fallbackRouteName;
        }
      }

      return "default";
    },
    [activeLayoutName, layout?.defaultTableOccurrence, layout?.name, layoutRouteName]
  );

  const switchWorkspaceContext = useCallback(
    async (workspaceToken: string) => {
      const targetWorkspaceId = normalizeWorkspaceToken(workspaceToken);
      setWorkspaceTabs((previous) => dedupeWorkspaceIds([...previous, targetWorkspaceId]));
      if (targetWorkspaceId === currentWorkspaceId) {
        setStatus(`Workspace ${workspaceNameById.get(targetWorkspaceId) ?? targetWorkspaceId} already active`);
        return;
      }

      setError(null);
      setStatus(`Switching to workspace ${workspaceNameById.get(targetWorkspaceId) ?? targetWorkspaceId}...`);
      try {
        const targetLayoutRoute = await resolveBrowseLayoutRouteForWorkspace(targetWorkspaceId);
        const launchMode: BrowseLaunchMode = isFindMode ? "find" : isPreviewMode ? "preview" : "browse";
        const nextHref = buildBrowseRouteHref(targetLayoutRoute, searchParams, {
          viewMode,
          launchMode
        });
        router.push(replaceWorkspaceQuery(nextHref, targetWorkspaceId));
      } catch (switchError) {
        const message = switchError instanceof Error ? switchError.message : "Failed to switch workspace";
        setError(`Workspace switch failed: ${message}`);
        setStatus("Workspace switch failed");
      }
    },
    [
      currentWorkspaceId,
      isFindMode,
      isPreviewMode,
      resolveBrowseLayoutRouteForWorkspace,
      router,
      searchParams,
      viewMode,
      workspaceNameById
    ]
  );

  const nextQuickChartSeriesId = useCallback(() => {
    const id = `quick-series-${quickChartSeriesIdRef.current}`;
    quickChartSeriesIdRef.current += 1;
    return id;
  }, []);

  const fieldLooksNumeric = useCallback(
    (fieldName: string): boolean => {
      const normalized = normalizedFieldToken(fieldName);
      const unqualified = unqualifiedFieldToken(fieldName);
      const declaredType =
        fieldTypeByName[normalized] ??
        fieldTypeByName[unqualified] ??
        "";
      if (declaredType.toLowerCase().includes("number")) {
        return true;
      }
      let numericCount = 0;
      let sampledCount = 0;
      for (const record of records) {
        const value = mergeFieldValue(record, fieldName);
        if (value == null || String(value).trim() === "") {
          continue;
        }
        sampledCount += 1;
        if (parseChartNumber(value) != null) {
          numericCount += 1;
        }
        if (sampledCount >= 24) {
          break;
        }
      }
      if (sampledCount === 0) {
        return false;
      }
      return numericCount / sampledCount >= 0.7;
    },
    [fieldTypeByName, records]
  );

  const defaultChartSummaryForField = useCallback(
    (fieldName: string): FileMakerChartSummaryType => {
      return fieldLooksNumeric(fieldName) ? "total" : "count";
    },
    [fieldLooksNumeric]
  );

  const openQuickChartDialog = useCallback(
    (fieldName: string) => {
      const normalizedField = fieldName.trim();
      if (!normalizedField) {
        return;
      }
      const xAxisField = tableSort.length > 0 ? tableSort[0].field : normalizedField;
      const summary = defaultChartSummaryForField(normalizedField);
      const yAxisTitle = `${normalizedField} (${chartSummaryLabel(summary)})`;
      const nextConfig: QuickChartConfig = {
        title: `${normalizedField} ${chartSummaryLabel(summary)}`,
        type: "column",
        xAxisField,
        xAxisTitle: xAxisField,
        yAxisTitle,
        showLegend: true,
        labelField: xAxisField,
        bubbleRadiusField: normalizedField,
        series: [
          {
            id: nextQuickChartSeriesId(),
            name: normalizedField,
            field: normalizedField,
            summary,
            color: chartSeriesColor(0)
          }
        ]
      };
      setQuickChartConfig(nextConfig);
      setQuickChartOpen(true);
      setStatus(`Chart setup for ${normalizedField}`);
    },
    [defaultChartSummaryForField, nextQuickChartSeriesId, tableSort]
  );

  const closeQuickChartDialog = useCallback(() => {
    setQuickChartOpen(false);
  }, []);

  const patchQuickChartConfig = useCallback(
    (updater: (previous: QuickChartConfig) => QuickChartConfig) => {
      setQuickChartConfig((previous) => {
        if (!previous) {
          return previous;
        }
        return updater(previous);
      });
    },
    []
  );

  const addQuickChartSeries = useCallback(() => {
    if (!quickChartConfig) {
      return;
    }
    const fallbackField =
      tableFieldNames.find((fieldName) => !quickChartConfig.series.some((series) => series.field === fieldName)) ??
      tableFieldNames[0] ??
      viewFieldNames[0] ??
      quickChartConfig.xAxisField;
    if (!fallbackField) {
      return;
    }
    patchQuickChartConfig((previous) => {
      const nextSeries = [
        ...previous.series,
        {
          id: nextQuickChartSeriesId(),
          name: fallbackField,
          field: fallbackField,
          summary: defaultChartSummaryForField(fallbackField),
          color: chartSeriesColor(previous.series.length)
        }
      ];
      return {
        ...previous,
        series: nextSeries
      };
    });
  }, [
    defaultChartSummaryForField,
    nextQuickChartSeriesId,
    patchQuickChartConfig,
    quickChartConfig,
    tableFieldNames,
    viewFieldNames
  ]);

  const removeQuickChartSeries = useCallback(
    (seriesId: string) => {
      patchQuickChartConfig((previous) => {
        if (previous.series.length <= 1) {
          return previous;
        }
        const nextSeries = previous.series.filter((series) => series.id !== seriesId);
        return {
          ...previous,
          series: nextSeries.map((series, index) => ({
            ...series,
            color: chartSeriesColor(index)
          }))
        };
      });
    },
    [patchQuickChartConfig]
  );

  const updateQuickChartSeries = useCallback(
    (seriesId: string, updater: (series: QuickChartSeries) => QuickChartSeries) => {
      patchQuickChartConfig((previous) => ({
        ...previous,
        series: previous.series.map((series) => (series.id === seriesId ? updater(series) : series))
      }));
    },
    [patchQuickChartConfig]
  );

  const quickChartFieldOptions = useMemo(() => {
    if (tableFieldNames.length > 0) {
      return tableFieldNames;
    }
    return viewFieldNames;
  }, [tableFieldNames, viewFieldNames]);

  const quickChartPreview = useMemo<QuickChartPreviewData | null>(() => {
    if (!quickChartConfig) {
      return null;
    }
    const previewRecords = sortedRecordRows.map((entry) => entry.record);
    if (chartIsCategoryType(quickChartConfig.type)) {
      return buildCategoryChartPreview(previewRecords, quickChartConfig);
    }
    return buildScatterChartPreview(previewRecords, quickChartConfig);
  }, [quickChartConfig, sortedRecordRows]);

  const saveQuickChartAsLayout = useCallback(async () => {
    if (!layout || !quickChartConfig) {
      return;
    }

    const sourceLayoutName =
      activeLayoutName.trim() || layout.name.trim() || layout.defaultTableOccurrence.trim() || "Layout";
    const timestampLabel = new Date().toISOString().replace("T", " ").slice(0, 16);
    const nextLayoutName = `${sourceLayoutName} - Chart ${timestampLabel}`;
    const nextLayoutId = nextChartLayoutId(nextLayoutName);

    const sortedFoundSetRecords = sortedRecordRows.map((entry) => entry.record);
    const foundSetRecordIds = sortedFoundSetRecords
      .map((record) => String(record.recordId ?? "").trim())
      .filter((recordId) => recordId.length > 0);

    const chartFields = dedupeCaseInsensitiveStrings([
      quickChartConfig.xAxisField,
      quickChartConfig.labelField,
      quickChartConfig.bubbleRadiusField,
      ...quickChartConfig.series.map((series) => series.field),
      ...tableSort.map((entry) => entry.field),
      leadingGroupField ?? "",
      trailingGroupField ?? "",
      ...tableFieldNames
    ]);
    const snapshotRows = sortedFoundSetRecords
      .slice(0, QUICK_CHART_LAYOUT_SNAPSHOT_MAX_ROWS)
      .map((record, rowIndex) => {
        const values: Record<string, string | number | boolean> = {};
        for (const fieldName of chartFields) {
          values[fieldName] = snapshotPrimitiveValue(mergeFieldValue(record, fieldName));
        }
        const recordId = String(record.recordId ?? "").trim();
        if (!recordId) {
          return {
            recordId: `snapshot-${rowIndex + 1}`,
            values
          };
        }
        return {
          recordId,
          values
        };
      });

    const chartSnapshot: LayoutBrowseChartSnapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: {
        layoutId: layoutRouteName,
        layoutName: sourceLayoutName,
        tableOccurrence: layout.defaultTableOccurrence,
        dataSource: source
      },
      context: {
        viewMode,
        isFindMode,
        findCriteria: { ...findCriteria },
        currentRecordIndex: index
      },
      tableView: {
        hiddenFields: [...hiddenTableFields],
        options: {
          ...tableViewOptions
        },
        leadingGrandSummary,
        trailingGrandSummary,
        leadingGroupField,
        trailingGroupField,
        leadingSubtotals: { ...leadingSubtotals },
        trailingSubtotals: { ...trailingSubtotals }
      },
      sort: tableSort.map((entry) => ({
        field: entry.field,
        direction: entry.direction,
        mode: entry.mode,
        valueListName: entry.valueListName,
        valueList: entry.valueList ? [...entry.valueList] : undefined
      })),
      keepRecordsInSortedOrder,
      chart: {
        config: {
          title: quickChartConfig.title,
          type: quickChartConfig.type,
          xAxisField: quickChartConfig.xAxisField,
          xAxisTitle: quickChartConfig.xAxisTitle,
          yAxisTitle: quickChartConfig.yAxisTitle,
          showLegend: quickChartConfig.showLegend,
          labelField: quickChartConfig.labelField,
          bubbleRadiusField: quickChartConfig.bubbleRadiusField,
          series: quickChartConfig.series.map((series) => ({
            id: series.id,
            name: series.name,
            field: series.field,
            summary: series.summary,
            color: series.color
          }))
        }
      },
      foundSet: {
        recordIds: foundSetRecordIds,
        totalRecordsInFoundSet: sortedFoundSetRecords.length,
        totalRecordsInSource: allRecords.length,
        snapshotFields: chartFields,
        snapshotRows,
        snapshotTruncated: sortedFoundSetRecords.length > QUICK_CHART_LAYOUT_SNAPSHOT_MAX_ROWS
      }
    };

    const nextLayout = cloneLayout(layout);
    nextLayout.id = nextLayoutId;
    nextLayout.name = nextLayoutName;
    nextLayout.browseChartSnapshot = chartSnapshot;

    setError(null);
    setStatus(`Saving chart layout "${nextLayoutName}"...`);

    try {
      const response = await fetch(withWorkspaceForApi(`/api/layouts/${encodeURIComponent(nextLayoutId)}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          layout: nextLayout,
          workspaceId: currentWorkspaceId
        })
      });
      if (!response.ok) {
        const body = await response.text();
        setError(`Save as Layout failed: ${body}`);
        setStatus("Save as Layout failed");
        return;
      }

      const payload = (await response.json()) as {
        layout: LayoutDefinition;
        warning?: string;
      };
      const savedLayoutId = payload.layout.id?.trim() || nextLayoutId;
      setQuickChartOpen(false);
      setStatus(
        payload.warning
          ? `Saved chart layout "${payload.layout.name}" (with warning)`
          : `Saved chart layout "${payload.layout.name}"`
      );
      router.push(withWorkspaceForRoute(`/layouts/${encodeURIComponent(savedLayoutId)}/browse`));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unknown save error";
      setError(`Save as Layout failed: ${message}`);
      setStatus("Save as Layout failed");
    }
  }, [
    activeLayoutName,
    allRecords.length,
    findCriteria,
    hiddenTableFields,
    index,
    isFindMode,
    keepRecordsInSortedOrder,
    layout,
    layoutRouteName,
    leadingGrandSummary,
    leadingGroupField,
    leadingSubtotals,
    quickChartConfig,
    router,
    sortedRecordRows,
    source,
    tableFieldNames,
    tableSort,
    tableViewOptions,
    trailingGrandSummary,
    trailingGroupField,
    trailingSubtotals,
    viewMode,
    currentWorkspaceId,
    withWorkspaceForApi,
    withWorkspaceForRoute
  ]);

  const loadSortDialogFieldsForTableOccurrence = useCallback(async (tableOccurrence: string) => {
    const normalized = tableOccurrence.trim();
    if (!normalized) {
      return;
    }
    if (sortDialogFieldsByTableOccurrence[normalized]) {
      return;
    }

    setSortDialogFieldsLoading(true);
    setSortDialogFieldsError(null);
    try {
      const response = await fetch(
        withWorkspaceForApi(`/api/fm/fields?tableOccurrence=${encodeURIComponent(normalized)}`),
        { cache: "no-store" }
      );
      if (!response.ok) {
        let message = "Failed to load fields";
        try {
          const payload = (await response.json()) as { error?: string };
          message = payload.error ?? message;
        } catch {
          message = await response.text();
        }
        setSortDialogFieldsByTableOccurrence((previous) => ({
          ...previous,
          [normalized]: []
        }));
        setSortDialogFieldsError(message);
        setSortDialogFieldsLoading(false);
        return;
      }
      const payload = (await response.json()) as FieldCatalogPayload;
      const names = normalizeFieldNames(payload.fields);
      setSortDialogFieldsByTableOccurrence((previous) => ({
        ...previous,
        [normalized]: names
      }));
      setSortDialogFieldsLoading(false);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch fields";
      setSortDialogFieldsByTableOccurrence((previous) => ({
        ...previous,
        [normalized]: []
      }));
      setSortDialogFieldsError(message);
      setSortDialogFieldsLoading(false);
    }
  }, [sortDialogFieldsByTableOccurrence, withWorkspaceForApi]);

  const loadSortDialogContextCatalog = useCallback(
    async (baseTableOccurrence: string) => {
      const normalizedBase = baseTableOccurrence.trim();
      if (!normalizedBase) {
        setSortDialogRelatedTableOccurrences([]);
        setSortDialogUnrelatedTableOccurrences([]);
        return;
      }

      const fallbackRelated = [...layoutRelatedTableOccurrences];
      setSortDialogRelatedTableOccurrences(fallbackRelated);
      setSortDialogUnrelatedTableOccurrences([]);

      try {
        const response = await fetch(withWorkspaceForApi("/api/fm/relationships"), { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as RelationshipGraphPayload;
        const allTableOccurrences = dedupeCaseInsensitiveStrings(
          Array.isArray(payload.nodes)
            ? payload.nodes.map((node) => String(node?.name ?? "").trim())
            : []
        );
        if (allTableOccurrences.length === 0) {
          return;
        }
        const related = new Set<string>(fallbackRelated);
        if (Array.isArray(payload.edges)) {
          for (const edge of payload.edges) {
            const left = String(edge?.leftTableOccurrenceName ?? "").trim();
            const right = String(edge?.rightTableOccurrenceName ?? "").trim();
            if (!left || !right) {
              continue;
            }
            if (left.toLowerCase() === normalizedBase.toLowerCase() && right.toLowerCase() !== normalizedBase.toLowerCase()) {
              related.add(right);
            }
            if (right.toLowerCase() === normalizedBase.toLowerCase() && left.toLowerCase() !== normalizedBase.toLowerCase()) {
              related.add(left);
            }
          }
        }
        const relatedSorted = [...related].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        );
        const relatedSet = new Set(relatedSorted.map((name) => name.toLowerCase()));
        const unrelated = allTableOccurrences
          .filter((name) => name.toLowerCase() !== normalizedBase.toLowerCase())
          .filter((name) => !relatedSet.has(name.toLowerCase()))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

        setSortDialogRelatedTableOccurrences(relatedSorted);
        setSortDialogUnrelatedTableOccurrences(unrelated);
      } catch {
        // Keep fallback derived from layout bindings if relationship graph isn't available.
      }
    },
    [layoutRelatedTableOccurrences, withWorkspaceForApi]
  );

  const inferValueListNameForSortEntry = useCallback(
    (entry: TableSortEntry): string => {
      if (entry.mode !== "valueList") {
        return "";
      }

      const directName = (entry.valueListName ?? "").trim();
      if (directName && Array.isArray(valueListsByName[directName])) {
        return directName;
      }

      const targetValues = dedupeCaseInsensitiveStrings(
        Array.isArray(entry.valueList)
          ? entry.valueList.map((value) => String(value ?? "").trim())
          : []
      );
      if (targetValues.length === 0) {
        return "";
      }

      for (const [valueListName, values] of Object.entries(valueListsByName)) {
        const candidateValues = dedupeCaseInsensitiveStrings(values);
        if (candidateValues.length !== targetValues.length) {
          continue;
        }
        let allMatch = true;
        for (let index = 0; index < candidateValues.length; index += 1) {
          const left = candidateValues[index]?.toLowerCase() ?? "";
          const right = targetValues[index]?.toLowerCase() ?? "";
          if (left !== right) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          return valueListName;
        }
      }

      return "";
    },
    [valueListsByName]
  );

  const closeSortDialog = useCallback(() => {
    setSortDialogOpen(false);
    setSortDialogSelectedIndex(-1);
  }, []);

  const selectSortDialogRule = useCallback(
    (index: number) => {
      const rule = sortDialogRulesDraft[index];
      if (!rule) {
        return;
      }
      setSortDialogSelectedIndex(index);
      setSortDialogDraftDirection(rule.direction);
      setSortDialogDraftMode(rule.mode);
      setSortDialogDraftValueListName(inferValueListNameForSortEntry(rule));
    },
    [inferValueListNameForSortEntry, sortDialogRulesDraft]
  );

  const updateSortDialogRuleAtSelectedIndex = useCallback(
    (updater: (entry: TableSortEntry) => TableSortEntry) => {
      if (sortDialogSelectedIndex < 0 || sortDialogSelectedIndex >= sortDialogRulesDraft.length) {
        return;
      }
      setSortDialogRulesDraft((previous) =>
        previous.map((entry, index) => (index === sortDialogSelectedIndex ? updater(entry) : entry))
      );
    },
    [sortDialogRulesDraft.length, sortDialogSelectedIndex]
  );

  const updateSortDialogDirection = useCallback(
    (direction: TableSortDirection) => {
      setSortDialogDraftDirection(direction);
      updateSortDialogRuleAtSelectedIndex((entry) => ({
        ...entry,
        direction
      }));
    },
    [updateSortDialogRuleAtSelectedIndex]
  );

  const updateSortDialogMode = useCallback(
    (mode: TableSortMode) => {
      setSortDialogDraftMode(mode);
      updateSortDialogRuleAtSelectedIndex((entry) => {
        if (mode === "standard") {
          return {
            ...entry,
            mode,
            valueList: undefined,
            valueListName: undefined
          };
        }

        const valueListName = sortDialogDraftValueListName.trim();
        const valueList = valueListName ? valueListsByName[valueListName] ?? [] : [];
        return {
          ...entry,
          mode,
          valueListName: valueListName || undefined,
          valueList
        };
      });
    },
    [sortDialogDraftValueListName, updateSortDialogRuleAtSelectedIndex, valueListsByName]
  );

  const updateSortDialogValueListName = useCallback(
    (valueListName: string) => {
      setSortDialogDraftValueListName(valueListName);
      setSortDialogDraftMode("valueList");
      updateSortDialogRuleAtSelectedIndex((entry) => ({
        ...entry,
        mode: "valueList",
        valueListName: valueListName.trim() || undefined,
        valueList: valueListName.trim() ? valueListsByName[valueListName.trim()] ?? [] : []
      }));
    },
    [updateSortDialogRuleAtSelectedIndex, valueListsByName]
  );

  const resolveSortDialogFieldToken = useCallback(
    (rawFieldName: string): string => {
      const fieldName = rawFieldName.trim();
      if (!fieldName) {
        return "";
      }
      const activeContext = sortDialogContext.trim();
      if (
        activeContext === SORT_CONTEXT_CURRENT_LAYOUT ||
        activeContext === SORT_CONTEXT_CURRENT_TABLE ||
        !activeContext
      ) {
        return fieldName;
      }
      const unqualifiedField = fieldName.includes("::")
        ? (fieldName.split("::").pop() ?? fieldName).trim()
        : fieldName;
      return `${activeContext}::${unqualifiedField}`;
    },
    [sortDialogContext]
  );

  const moveSortDialogField = useCallback(() => {
    const fieldToken = resolveSortDialogFieldToken(sortDialogAvailableField);
    if (!fieldToken) {
      return;
    }

    const valueListName = sortDialogDraftValueListName.trim();
    const nextRule: TableSortEntry = {
      field: fieldToken,
      direction: sortDialogDraftDirection,
      mode: sortDialogDraftMode,
      valueList: sortDialogDraftMode === "valueList" ? valueListsByName[valueListName] ?? [] : undefined,
      valueListName: sortDialogDraftMode === "valueList" ? valueListName || undefined : undefined
    };

    const existingIndex = sortDialogRulesDraft.findIndex((entry) => entry.field === fieldToken);
    if (existingIndex >= 0) {
      const nextRules = [...sortDialogRulesDraft];
      nextRules[existingIndex] = nextRule;
      setSortDialogRulesDraft(nextRules);
      setSortDialogSelectedIndex(existingIndex);
      return;
    }

    setSortDialogRulesDraft((previous) => [...previous, nextRule]);
    setSortDialogSelectedIndex(sortDialogRulesDraft.length);
  }, [
    resolveSortDialogFieldToken,
    sortDialogAvailableField,
    sortDialogDraftDirection,
    sortDialogDraftMode,
    sortDialogDraftValueListName,
    sortDialogRulesDraft,
    valueListsByName
  ]);

  const clearSortDialogRules = useCallback(() => {
    setSortDialogRulesDraft([]);
    setSortDialogSelectedIndex(-1);
  }, []);

  const openSortDialog = useCallback(() => {
    closeColumnMenus();
    setSortDialogContext(SORT_CONTEXT_CURRENT_LAYOUT);
    setSortDialogFieldsError(null);
    const normalizedRules = tableSort.map((entry) => {
      const valueListName = inferValueListNameForSortEntry(entry);
      return {
        ...entry,
        valueListName: valueListName || undefined,
        valueList:
          entry.mode === "valueList"
            ? entry.valueList && entry.valueList.length > 0
              ? entry.valueList
              : valueListName
                ? valueListsByName[valueListName] ?? []
                : []
            : undefined
      };
    });
    setSortDialogRulesDraft(normalizedRules);
    setSortDialogAvailableField((previous) => {
      if (
        previous &&
        viewFieldNames.some(
          (field) => field.toLowerCase() === previous.trim().toLowerCase()
        )
      ) {
        return previous;
      }
      return viewFieldNames[0] ?? "";
    });
    const selectedRule = normalizedRules[0];
    setSortDialogSelectedIndex(selectedRule ? 0 : -1);
    setSortDialogDraftDirection(selectedRule?.direction ?? "asc");
    setSortDialogDraftMode(selectedRule?.mode ?? "standard");
    setSortDialogDraftValueListName(selectedRule ? inferValueListNameForSortEntry(selectedRule) : "");
    setSortDialogDraftKeepRecordsSorted(keepRecordsInSortedOrder);
    setSortDialogDraftReorderBySummary(false);
    setSortDialogDraftSummaryField("");
    setSortDialogDraftOverrideLanguage(false);
    setSortDialogDraftLanguage("English");
    setSortDialogOpen(true);
    if (currentTableOccurrence) {
      void loadSortDialogFieldsForTableOccurrence(currentTableOccurrence);
      void loadSortDialogContextCatalog(currentTableOccurrence);
    }
  }, [
    closeColumnMenus,
    currentTableOccurrence,
    inferValueListNameForSortEntry,
    keepRecordsInSortedOrder,
    loadSortDialogContextCatalog,
    loadSortDialogFieldsForTableOccurrence,
    tableSort,
    valueListsByName,
    viewFieldNames
  ]);

  const applySortDialog = useCallback(() => {
    const normalizedRules: TableSortEntry[] = [];
    for (const entry of sortDialogRulesDraft) {
      const fieldName = entry.field.trim();
      if (!fieldName) {
        continue;
      }
      if (entry.mode === "valueList") {
        const valueListName = (entry.valueListName ?? "").trim();
        const valueList = valueListName
          ? valueListsByName[valueListName] ?? []
          : entry.valueList ?? [];
        normalizedRules.push({
          ...entry,
          field: fieldName,
          valueListName: valueListName || undefined,
          valueList
        });
        continue;
      }
      normalizedRules.push({
        ...entry,
        field: fieldName,
        mode: "standard",
        valueListName: undefined,
        valueList: undefined
      });
    }

    setTableSort(normalizedRules);
    setKeepRecordsInSortedOrder(sortDialogDraftKeepRecordsSorted);
    setStatus(
      normalizedRules.length > 0
        ? `Sorted by ${normalizedRules.length} field${normalizedRules.length === 1 ? "" : "s"}`
        : "Unsorted"
    );
    closeSortDialog();
  }, [closeSortDialog, sortDialogDraftKeepRecordsSorted, sortDialogRulesDraft, valueListsByName]);

  const upsertColumnSort = useCallback(
    (
      field: string,
      direction: TableSortDirection,
      mode: TableSortMode,
      valueList?: string[],
      valueListName?: string
    ) => {
      setTableSort((previous) => {
        const withoutField = previous.filter((entry) => entry.field !== field);
        return [
          ...withoutField,
          {
            field,
            direction,
            mode,
            valueList: mode === "valueList" ? valueList ?? [] : undefined,
            valueListName: mode === "valueList" ? valueListName : undefined
          }
        ];
      });
    },
    []
  );

  const removeFieldFromSort = useCallback((field: string) => {
    setTableSort((previous) => previous.filter((entry) => entry.field !== field));
  }, []);

  const resetTableViewConfiguration = useCallback(() => {
    setTableSort([]);
    setLeadingGrandSummary(false);
    setTrailingGrandSummary(false);
    setLeadingGroupField(null);
    setTrailingGroupField(null);
    setLeadingSubtotals({});
    setTrailingSubtotals({});
    setHiddenTableFields([]);
    setTableViewOptions({
      showRowNumbers: true,
      alternatingRows: true,
      compactRows: false
    });
  }, []);

  const toggleSubtotal = useCallback(
    (position: TableSubtotalPosition, field: string, operation: TableSummaryOperation) => {
      const setter = position === "leading" ? setLeadingSubtotals : setTrailingSubtotals;
      setter((previous) => {
        const current = previous[field] ?? [];
        const exists = current.includes(operation);
        const next = exists ? current.filter((entry) => entry !== operation) : [...current, operation];
        if (next.length === 0) {
          const withoutField = { ...previous };
          delete withoutField[field];
          return withoutField;
        }
        return {
          ...previous,
          [field]: next
        };
      });
    },
    []
  );

  const clearSubtotalsForField = useCallback((position: TableSubtotalPosition, field: string) => {
    const setter = position === "leading" ? setLeadingSubtotals : setTrailingSubtotals;
    setter((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }, []);

  const openColumnMenuAt = useCallback((field: string, x: number, y: number) => {
    setContainerMenu(null);
    setColumnSubmenu(null);
    setColumnMenu({
      field,
      x,
      y
    });
  }, []);

  const openColumnMenu = (event: ReactMouseEvent<HTMLElement>, field: string) => {
    event.preventDefault();
    event.stopPropagation();
    openColumnMenuAt(field, Math.round(event.clientX), Math.round(event.clientY));
  };

  const openColumnMenuFromButton = (event: ReactMouseEvent<HTMLButtonElement>, field: string) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    openColumnMenuAt(field, Math.round(bounds.left), Math.round(bounds.bottom + 4));
  };

  const openColumnSubmenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    kind: ColumnSubmenuKind
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setColumnSubmenu({
      kind,
      x: Math.round(bounds.right + 6),
      y: Math.round(bounds.top)
    });
  };

  const applyColumnMenuAction = (actionId: string) => {
    const field = columnMenu?.field;
    if (!field) {
      return;
    }

    if (actionId === "sort-asc") {
      upsertColumnSort(field, "asc", "standard");
      setStatus(`Sorted ${field} ascending`);
      closeColumnMenus();
      return;
    }

    if (actionId === "sort-desc") {
      upsertColumnSort(field, "desc", "standard");
      setStatus(`Sorted ${field} descending`);
      closeColumnMenus();
      return;
    }

    if (actionId === "remove-from-sort") {
      removeFieldFromSort(field);
      setStatus(`Removed ${field} from sort`);
      closeColumnMenus();
      return;
    }

    if (actionId === "unsort") {
      setTableSort([]);
      setStatus("Unsorted");
      closeColumnMenus();
      return;
    }

    if (actionId === "leading-grand-summary") {
      setLeadingGrandSummary((previous) => !previous);
      setStatus(`${!leadingGrandSummary ? "Added" : "Removed"} leading grand summary`);
      closeColumnMenus();
      return;
    }

    if (actionId === "trailing-grand-summary") {
      setTrailingGrandSummary((previous) => !previous);
      setStatus(`${!trailingGrandSummary ? "Added" : "Removed"} trailing grand summary`);
      closeColumnMenus();
      return;
    }

    if (actionId === "leading-group") {
      setLeadingGroupField(field);
      setStatus(`Leading group by ${field}`);
      closeColumnMenus();
      return;
    }

    if (actionId === "trailing-group") {
      setTrailingGroupField(field);
      setStatus(`Trailing group by ${field}`);
      closeColumnMenus();
      return;
    }

    if (actionId === "chart") {
      openQuickChartDialog(field);
      closeColumnMenus();
      return;
    }
  };

  const applySubmenuAction = (actionId: string) => {
    const field = columnMenu?.field;
    if (!field || !columnSubmenu) {
      return;
    }

    if (columnSubmenu.kind === "sortByValueList") {
      if (actionId === "value-current") {
        upsertColumnSort(field, "asc", "valueList", distinctColumnValues, "Current Value Order");
        setStatus(`Sorted ${field} by value list (current order)`);
      } else if (actionId === "value-az") {
        const sorted = [...distinctColumnValues].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        );
        upsertColumnSort(field, "asc", "valueList", sorted, "Distinct Values (A-Z)");
        setStatus(`Sorted ${field} by value list (A-Z)`);
      } else if (actionId === "value-za") {
        const sorted = [...distinctColumnValues].sort((a, b) =>
          b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" })
        );
        upsertColumnSort(field, "asc", "valueList", sorted, "Distinct Values (Z-A)");
        setStatus(`Sorted ${field} by value list (Z-A)`);
      }
      closeColumnMenus();
      return;
    }

    if (columnSubmenu.kind === "leadingSubtotals" || columnSubmenu.kind === "trailingSubtotals") {
      const position: TableSubtotalPosition =
        columnSubmenu.kind === "leadingSubtotals" ? "leading" : "trailing";
      if (actionId === "clear") {
        clearSubtotalsForField(position, field);
        setStatus(`Cleared ${position} subtotals for ${field}`);
      } else {
        toggleSubtotal(position, field, actionId as TableSummaryOperation);
        setStatus(`Updated ${position} subtotal for ${field}`);
      }
      closeColumnMenus();
      return;
    }

    if (columnSubmenu.kind === "field") {
      if (actionId === "hide") {
        setHiddenTableFields((previous) =>
          previous.includes(field) ? previous : [...previous, field]
        );
        setStatus(`Hid field ${field}`);
      } else if (actionId === "show-all") {
        setHiddenTableFields([]);
        setStatus("Showing all fields");
      } else if (actionId === "only-this") {
        setHiddenTableFields(viewFieldNames.filter((fieldName) => fieldName !== field));
        setStatus(`Showing only ${field}`);
      }
      closeColumnMenus();
      return;
    }

    if (columnSubmenu.kind === "tableView") {
      if (actionId === "toggle-row-numbers") {
        setTableViewOptions((previous) => ({
          ...previous,
          showRowNumbers: !previous.showRowNumbers
        }));
        setStatus("Toggled row numbers");
      } else if (actionId === "toggle-alt-rows") {
        setTableViewOptions((previous) => ({
          ...previous,
          alternatingRows: !previous.alternatingRows
        }));
        setStatus("Toggled alternating row shading");
      } else if (actionId === "toggle-compact") {
        setTableViewOptions((previous) => ({
          ...previous,
          compactRows: !previous.compactRows
        }));
        setStatus("Toggled compact table rows");
      } else if (actionId === "reset-view") {
        resetTableViewConfiguration();
        setStatus("Reset table view");
      }
      closeColumnMenus();
    }
  };

  const topMenubarScriptItems = useMemo(
    () => dedupeCaseInsensitiveStrings(availableScripts).slice(0, 20),
    [availableScripts]
  );

  const executeDocumentCommand = useCallback((command: string, successLabel: string, failureLabel: string) => {
    try {
      if (typeof document.execCommand !== "function") {
        setStatus(failureLabel);
        return;
      }
      const result = document.execCommand(command);
      setStatus(result ? successLabel : failureLabel);
    } catch {
      setStatus(failureLabel);
    }
  }, []);

  const navigateBrowseMode = useCallback(
    (nextMode: BrowseLaunchMode) => {
      const nextHref = buildBrowseRouteHref(layoutRouteName, searchParams, {
        viewMode,
        launchMode: nextMode
      });
      router.replace(nextHref, { scroll: false });
    },
    [layoutRouteName, router, searchParams, viewMode]
  );

  const setBrowseZoom = useCallback((requestedPercent: number) => {
    const normalized = Math.max(25, Math.min(300, Math.round(requestedPercent)));
    setBrowseZoomPercent(normalized);
    setStatus(`Zoom ${normalized}%`);
  }, []);

  const handleTopMenubarAction = useCallback(
    (actionId: string) => {
      closeTopMenubarMenu();
      setTopMenubarSubmenu(null);

      if (actionId.startsWith("view-go-to-layout:")) {
        const layoutName = decodeURIComponent(actionId.slice("view-go-to-layout:".length));
        void switchBrowseLayout(layoutName);
        return;
      }

      if (actionId.startsWith("records-run-find:")) {
        const savedFindId = actionId.slice("records-run-find:".length);
        runSavedFindById(savedFindId);
        return;
      }

      if (actionId.startsWith("scripts-run:")) {
        const scriptName = decodeURIComponent(actionId.slice("scripts-run:".length));
        void runObjectScript(scriptName, "", scriptName);
        return;
      }

      if (actionId === "filemaker-about" || actionId === "help-about") {
        setStatus("FM Web IDE Browse Mode (FileMaker-style menubar)");
        return;
      }

      if (actionId === "filemaker-preferences") {
        setPreferencesDialogOpen(true);
        setStatus("Preferences");
        return;
      }

      if (actionId === "file-new-window") {
        window.open(window.location.href, "_blank", "noopener,noreferrer");
        setStatus("Opened browse mode in a new tab");
        return;
      }

      if (actionId === "file-refresh-layout-list") {
        void loadLayoutCatalog();
        setStatus("Refreshing layout list...");
        return;
      }

      if (actionId === "file-refresh-window" || actionId === "records-refresh-window") {
        void loadAll({ indexMode: "preserve" });
        setStatus("Refreshing window...");
        return;
      }

      if (actionId === "file-layout-mode" || actionId === "view-layout-mode") {
        router.push(withWorkspaceForRoute(`/layouts/${encodedLayoutRouteName}/edit`));
        return;
      }

      if (actionId === "file-print") {
        window.print();
        setStatus("Print dialog opened");
        return;
      }

      if (actionId === "file-close-window") {
        window.close();
        setStatus("Window close requested");
        return;
      }

      if (actionId === "edit-undo") {
        executeDocumentCommand("undo", "Undo", "Undo is unavailable here");
        return;
      }

      if (actionId === "edit-redo") {
        executeDocumentCommand("redo", "Redo", "Redo is unavailable here");
        return;
      }

      if (actionId === "edit-cut") {
        executeDocumentCommand("cut", "Cut", "Cut is unavailable here");
        return;
      }

      if (actionId === "edit-copy") {
        executeDocumentCommand("copy", "Copy", "Copy is unavailable here");
        return;
      }

      if (actionId === "edit-paste") {
        executeDocumentCommand("paste", "Paste", "Paste is unavailable here");
        return;
      }

      if (actionId === "edit-select-all") {
        executeDocumentCommand("selectAll", "Selected all", "Select All is unavailable here");
        return;
      }

      if (actionId === "view-browse-mode") {
        if (isFindMode) {
          cancelFindMode();
        } else if (isPreviewMode) {
          navigateBrowseMode("browse");
          setStatus("Browse mode");
        } else {
          setStatus("Already in Browse Mode");
        }
        return;
      }

      if (actionId === "view-find-mode") {
        if (isFindMode) {
          setStatus("Already in Find Mode");
        } else {
          enterFindMode();
        }
        return;
      }

      if (actionId === "view-preview-mode") {
        if (isPreviewMode) {
          setStatus("Already in Preview Mode");
        } else {
          navigateBrowseMode("preview");
          setStatus("Preview mode");
        }
        return;
      }

      if (actionId === "view-form" || actionId === "view-list" || actionId === "view-table") {
        const nextMode = actionId === "view-form" ? "form" : actionId === "view-list" ? "list" : "table";
        setViewMode(nextMode);
        setStatus(`${nextMode[0].toUpperCase()}${nextMode.slice(1)} view`);
        return;
      }

      if (actionId === "view-toggle-status-toolbar" || actionId === "window-toggle-status-toolbar") {
        setShowStatusToolbar((previous) => {
          const next = !previous;
          setStatus(next ? "Status toolbar shown" : "Status toolbar hidden");
          return next;
        });
        return;
      }

      if (actionId === "view-toggle-formatting-bar" || actionId === "window-toggle-formatting-bar") {
        setShowFormattingBar((previous) => {
          const next = !previous;
          setStatus(next ? "Formatting bar shown" : "Formatting bar hidden");
          return next;
        });
        return;
      }

      if (actionId === "view-zoom-in" || actionId === "view-zoom-out" || actionId === "view-actual-size") {
        if (actionId === "view-actual-size") {
          setBrowseZoom(100);
        } else if (actionId === "view-zoom-in") {
          setBrowseZoom(browseZoomPercent + 10);
        } else {
          setBrowseZoom(browseZoomPercent - 10);
        }
        return;
      }

      if (actionId === "insert-current-date") {
        const inserted = insertTextIntoActiveInput(new Date().toLocaleDateString());
        if (inserted) {
          setStatus("Inserted current date");
        }
        return;
      }

      if (actionId === "insert-current-time") {
        const inserted = insertTextIntoActiveInput(new Date().toLocaleTimeString());
        if (inserted) {
          setStatus("Inserted current time");
        }
        return;
      }

      if (actionId === "insert-current-user-name") {
        const inserted = insertTextIntoActiveInput("Web User");
        if (inserted) {
          setStatus("Inserted current user name");
        }
        return;
      }

      if (actionId === "format-bold") {
        executeDocumentCommand("bold", "Bold toggled", "Bold formatting is unavailable here");
        return;
      }

      if (actionId === "format-italic") {
        executeDocumentCommand("italic", "Italic toggled", "Italic formatting is unavailable here");
        return;
      }

      if (actionId === "format-underline") {
        executeDocumentCommand("underline", "Underline toggled", "Underline formatting is unavailable here");
        return;
      }

      if (actionId === "records-new") {
        if (isFindMode) {
          newFindRequest();
        } else {
          void createNew();
        }
        return;
      }

      if (actionId === "records-duplicate") {
        if (isFindMode) {
          duplicateFindRequest();
          return;
        }
        if (isPreviewMode) {
          setStatus("Duplicate Record is unavailable in Preview Mode");
          return;
        }
        void duplicateCurrent();
        return;
      }

      if (actionId === "records-delete") {
        if (isFindMode) {
          deleteFindRequest();
        } else {
          void deleteCurrent();
        }
        return;
      }

      if (actionId === "records-delete-all") {
        if (isFindMode) {
          setStatus("Delete All Records is unavailable in Find Mode");
          return;
        }
        void deleteAllRecords();
        return;
      }

      if (actionId === "records-go-first") {
        goFirst();
        return;
      }

      if (actionId === "records-go-prev") {
        goPrev();
        return;
      }

      if (actionId === "records-go-next") {
        goNext();
        return;
      }

      if (actionId === "records-go-last") {
        goLast();
        return;
      }

      if (actionId === "records-go-to-record") {
        const upperBound = isFindMode ? findRequestStates.length || 1 : records.length || 1;
        const label = isFindMode ? "find request" : "record";
        const response = window.prompt(`Go to ${label} number (1-${upperBound}):`, recordJumpInput || "1");
        if (response != null) {
          if (isFindMode) {
            const parsed = Number.parseInt(response, 10);
            if (Number.isFinite(parsed)) {
              selectFindRequestByIndex(parsed - 1);
            } else {
              setRecordJumpInput(String(activeFindRequestIndex + 1));
            }
          } else {
            jumpToRecord(response);
          }
        }
        return;
      }

      if (actionId === "records-new-request") {
        newFindRequest();
        return;
      }

      if (actionId === "records-delete-request") {
        deleteFindRequest();
        return;
      }

      if (actionId === "records-perform-find") {
        performFind();
        return;
      }

      if (actionId === "records-cancel-find") {
        cancelFindMode();
        return;
      }

      if (actionId === "records-show-all") {
        showAllRecords();
        return;
      }

      if (actionId === "records-show-omitted-only") {
        showOmittedRecordsOnly();
        return;
      }

      if (actionId === "records-omit-record") {
        omitCurrentRecord();
        return;
      }

      if (actionId === "records-omit-multiple") {
        omitMultipleRecords();
        return;
      }

      if (actionId === "records-modify-last-find") {
        modifyLastFindRequest();
        return;
      }

      if (actionId === "records-save-find") {
        saveCurrentFindRequest();
        return;
      }

      if (actionId === "records-edit-saved-finds") {
        openEditSavedFindsDialog();
        return;
      }

      if (actionId === "records-sort") {
        if (isFindMode) {
          setStatus("Sort is unavailable in Find Mode");
          return;
        }
        openSortDialog();
        return;
      }

      if (actionId === "records-unsort") {
        if (isFindMode) {
          setStatus("Unsort is unavailable in Find Mode");
          return;
        }
        setTableSort([]);
        setStatus("Unsorted");
        return;
      }

      if (actionId === "records-replace-field-contents") {
        void replaceFieldContents();
        return;
      }

      if (actionId === "records-relookup-field-contents") {
        void relookupFieldContents();
        return;
      }

      if (actionId === "records-revert-record") {
        if (isFindMode || records.length === 0) {
          setStatus("No current record to revert");
          return;
        }
        void loadAll({ indexMode: "preserve" });
        setStatus("Reverted current record");
        return;
      }

      if (actionId === "scripts-refresh") {
        void loadScriptCatalog();
        setStatus("Refreshing script list...");
        return;
      }

      if (actionId === "tools-spelling") {
        setSpellingEnabled((previous) => {
          const next = !previous;
          setStatus(next ? "Spelling enabled" : "Spelling disabled");
          return next;
        });
        return;
      }

      if (actionId === "tools-manage-database") {
        router.push(withWorkspaceForRoute(`/layouts/${encodedLayoutRouteName}/edit`));
        setStatus("Open Manage Database from Layout Mode");
        return;
      }

      if (actionId === "window-new-window") {
        window.open(window.location.href, "_blank", "noopener,noreferrer");
        setStatus("Opened a new browser window");
        return;
      }
      if (actionId.startsWith("window-show-workspace:")) {
        const workspaceToken = decodeURIComponent(actionId.slice("window-show-workspace:".length));
        if (workspaceToken.trim()) {
          void switchWorkspaceContext(workspaceToken);
        }
        return;
      }
      if (actionId === "window-hide-window") {
        window.blur();
        setStatus("Hide Window requested (browser may ignore this)");
        return;
      }
      if (actionId === "window-minimize-window") {
        window.blur();
        setStatus("Minimize Window requested (browser may ignore this)");
        return;
      }
      if (actionId === "window-tile-horizontal") {
        setStatus("Tile Horizontally is not available in browser windows");
        return;
      }
      if (actionId === "window-tile-vertical") {
        setStatus("Tile Vertically is not available in browser windows");
        return;
      }
      if (actionId === "window-cascade") {
        setStatus("Cascade Windows is not available in browser windows");
        return;
      }
      if (actionId === "window-bring-all-front") {
        window.focus();
        setStatus("Bring All to Front requested");
        return;
      }
      if (actionId.startsWith("window-workspace:")) {
        const workspaceToken = decodeURIComponent(actionId.slice("window-workspace:".length));
        if (workspaceToken.trim()) {
          void switchWorkspaceContext(workspaceToken);
        }
        return;
      }

      if (actionId === "help-claris-help") {
        window.open("https://help.claris.com/en/pro-help/content/index.html", "_blank", "noopener,noreferrer");
        setStatus("Opened Claris Help");
        return;
      }

      if (actionId === "help-shortcuts") {
        setStatus("Shortcuts: ⌘F Find, ⌘S Sort, ⌘J Show All, ⌘N New, ⌘D Duplicate, ⌘E Delete");
        return;
      }

      setStatus(`Unknown menu action: ${actionId}`);
    },
    [
      browseZoomPercent,
      activeFindRequestIndex,
      cancelFindMode,
      closeTopMenubarMenu,
      createNew,
      deleteFindRequest,
      deleteAllRecords,
      deleteCurrent,
      duplicateCurrent,
      duplicateFindRequest,
      encodedLayoutRouteName,
      enterFindMode,
      executeDocumentCommand,
      findRequestStates.length,
      goFirst,
      goLast,
      goNext,
      goPrev,
      insertTextIntoActiveInput,
      isFindMode,
      jumpToRecord,
      loadAll,
      loadLayoutCatalog,
      loadWorkspaceCatalog,
      loadScriptCatalog,
      modifyLastFindRequest,
      newFindRequest,
      omitCurrentRecord,
      omitMultipleRecords,
      openEditSavedFindsDialog,
      openSortDialog,
      performFind,
      replaceFieldContents,
      recordJumpInput,
      records.length,
      relookupFieldContents,
      router,
      runObjectScript,
      runSavedFindById,
      saveCurrentFindRequest,
      setBrowseZoom,
      selectFindRequestByIndex,
      showAllRecords,
      showOmittedRecordsOnly,
      isPreviewMode,
      navigateBrowseMode,
      switchWorkspaceContext,
      withWorkspaceForRoute
    ]
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (topMenubarRef.current && target && topMenubarRef.current.contains(target)) {
        return;
      }
      if (findRequestInsertMenuRef.current && target && findRequestInsertMenuRef.current.contains(target)) {
        return;
      }
      if (findRequestSavedMenuRef.current && target && findRequestSavedMenuRef.current.contains(target)) {
        return;
      }
      if (findOptionsMenuRef.current && target && findOptionsMenuRef.current.contains(target)) {
        return;
      }
      if (containerMenuRef.current && target && containerMenuRef.current.contains(target)) {
        return;
      }
      if (columnMenuRef.current && target && columnMenuRef.current.contains(target)) {
        return;
      }
      if (columnSubmenuRef.current && target && columnSubmenuRef.current.contains(target)) {
        return;
      }
      closeTopMenubarMenu();
      setFindRequestInsertMenuOpen(false);
      setFindRequestSavedMenuOpen(false);
      setFindOptionsMenuOpen(false);
      closeContainerMenu();
      closeColumnMenus();
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTopMenubarMenu();
        setFindRequestInsertMenuOpen(false);
        setFindRequestSavedMenuOpen(false);
        setFindOptionsMenuOpen(false);
        closeContainerMenu();
        closeColumnMenus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [closeColumnMenus, closeContainerMenu, closeTopMenubarMenu]);

  useEffect(() => {
    if (!sortDialogOpen) {
      return;
    }
    if (sortDialogRulesDraft.length === 0) {
      if (sortDialogSelectedIndex !== -1) {
        setSortDialogSelectedIndex(-1);
      }
      return;
    }
    const safeIndex =
      sortDialogSelectedIndex >= 0 && sortDialogSelectedIndex < sortDialogRulesDraft.length
        ? sortDialogSelectedIndex
        : 0;
    if (safeIndex !== sortDialogSelectedIndex) {
      setSortDialogSelectedIndex(safeIndex);
      return;
    }
    const selectedRule = sortDialogRulesDraft[safeIndex];
    setSortDialogDraftDirection(selectedRule.direction);
    setSortDialogDraftMode(selectedRule.mode);
    setSortDialogDraftValueListName(inferValueListNameForSortEntry(selectedRule));
  }, [
    inferValueListNameForSortEntry,
    sortDialogOpen,
    sortDialogRulesDraft,
    sortDialogSelectedIndex
  ]);

  useEffect(() => {
    if (!sortDialogOpen) {
      return;
    }
    const activeContext = sortDialogContext.trim();
    const targetTableOccurrence =
      activeContext === SORT_CONTEXT_CURRENT_TABLE ? currentTableOccurrence : activeContext;
    if (
      activeContext &&
      activeContext !== SORT_CONTEXT_CURRENT_LAYOUT &&
      activeContext !== SORT_CONTEXT_MANAGE_DATABASE &&
      targetTableOccurrence
    ) {
      void loadSortDialogFieldsForTableOccurrence(targetTableOccurrence);
    }
    setSortDialogAvailableField((previous) => {
      if (
        previous &&
        sortDialogFieldNames.some(
          (field) => field.toLowerCase() === previous.trim().toLowerCase()
        )
      ) {
        return previous;
      }
      return sortDialogFieldNames[0] ?? "";
    });
  }, [
    currentTableOccurrence,
    loadSortDialogFieldsForTableOccurrence,
    sortDialogContext,
    sortDialogFieldNames,
    sortDialogOpen
  ]);

  useEffect(() => {
    setRecentFindIds((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const availableIds = new Set(savedFinds.map((entry) => entry.id));
      const next = previous.filter((entry) => availableIds.has(entry)).slice(0, MAX_RECENT_FINDS);
      if (next.length === previous.length && next.every((entry, index) => entry === previous[index])) {
        return previous;
      }
      return next;
    });
  }, [savedFinds]);

  useEffect(() => {
    if (!editSavedFindsDialogOpen) {
      return;
    }
    const contextToken = activeLayoutName.trim() || layout?.id?.trim() || layoutRouteName;
    const contextSavedFinds = savedFinds.filter((entry) => {
      const entryContext = (entry.layoutId ?? "").trim();
      return !entryContext || entryContext === contextToken;
    });
    if (contextSavedFinds.length === 0) {
      if (editSavedFindsSelectionId) {
        setEditSavedFindsSelectionId("");
      }
      return;
    }
    const exists = contextSavedFinds.some((entry) => entry.id === editSavedFindsSelectionId);
    if (!exists) {
      setEditSavedFindsSelectionId(contextSavedFinds[0]?.id ?? "");
    }
  }, [
    activeLayoutName,
    editSavedFindsDialogOpen,
    editSavedFindsSelectionId,
    layout?.id,
    layoutRouteName,
    savedFinds
  ]);

  useEffect(() => {
    if (!findAdvancedDialogOpen) {
      return;
    }
    if (findAdvancedRequestsDraft.length === 0) {
      return;
    }
    const safeIndex = Math.min(
      Math.max(findAdvancedSelectedRequestIndex, 0),
      findAdvancedRequestsDraft.length - 1
    );
    if (safeIndex !== findAdvancedSelectedRequestIndex) {
      setFindAdvancedSelectedRequestIndex(safeIndex);
      return;
    }
    const activeRequest = findAdvancedRequestsDraft[safeIndex];
    if (!activeRequest) {
      return;
    }
    if (
      findAdvancedSelectedCriteriaField &&
      activeRequest.criteria[findAdvancedSelectedCriteriaField] == null
    ) {
      setFindAdvancedSelectedCriteriaField("");
    }
    if (
      findAdvancedSelectedField &&
      activeRequest.criteria[findAdvancedSelectedField] == null &&
      findAdvancedFieldValue &&
      findAdvancedSelectedCriteriaField !== findAdvancedSelectedField
    ) {
      setFindAdvancedFieldValue("");
    }
  }, [
    findAdvancedDialogOpen,
    findAdvancedFieldValue,
    findAdvancedRequestsDraft,
    findAdvancedSelectedCriteriaField,
    findAdvancedSelectedField,
    findAdvancedSelectedRequestIndex
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasModifier = event.metaKey || event.ctrlKey;
      const keyLower = event.key.toLowerCase();
      if (!hasModifier && !event.altKey && event.key === "Escape" && quickChartOpen) {
        event.preventDefault();
        closeQuickChartDialog();
        return;
      }
      if (!hasModifier && !event.altKey && event.key === "Escape" && sortDialogOpen) {
        event.preventDefault();
        closeSortDialog();
        return;
      }
      const editingInput = isEditableTarget(event.target);
      const allowWhenEditing =
        hasModifier &&
        !event.altKey &&
        (keyLower === "b" ||
          keyLower === "l" ||
          keyLower === "t" ||
          keyLower === "u" ||
          keyLower === "f" ||
          keyLower === "s" ||
          keyLower === "r" ||
          keyLower === "j" ||
          keyLower === "n" ||
          keyLower === "d" ||
          keyLower === "e" ||
          keyLower === "0" ||
          event.key === "=" ||
          event.key === "-");
      if (editingInput && !allowWhenEditing) {
        return;
      }

      if (!hasModifier && !event.altKey && event.key === "Escape" && isFindMode) {
        event.preventDefault();
        cancelFindMode();
        return;
      }

      if (hasModifier && event.shiftKey && !event.altKey && keyLower === "r") {
        event.preventDefault();
        void loadAll({ indexMode: "preserve" });
        setStatus("Refreshing window...");
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "r") {
        event.preventDefault();
        modifyLastFindRequest();
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "b") {
        event.preventDefault();
        setStatus("Already in Browse Mode");
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "l") {
        event.preventDefault();
        router.push(withWorkspaceForRoute(`/layouts/${encodedLayoutRouteName}/edit`));
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "t") {
        event.preventDefault();
        omitCurrentRecord();
        return;
      }

      if (hasModifier && event.shiftKey && !event.altKey && keyLower === "t") {
        event.preventDefault();
        omitMultipleRecords();
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "u") {
        event.preventDefault();
        navigateBrowseMode("preview");
        setStatus("Preview mode");
        return;
      }

      if (hasModifier && event.shiftKey && !event.altKey && event.key === "=") {
        event.preventDefault();
        setBrowseZoom(browseZoomPercent + 10);
        return;
      }

      if (hasModifier && !event.altKey && event.key === "-") {
        event.preventDefault();
        setBrowseZoom(browseZoomPercent - 10);
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "0") {
        event.preventDefault();
        setBrowseZoom(100);
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "f") {
        event.preventDefault();
        handleFindAction();
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "s") {
        event.preventDefault();
        openSortDialog();
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "j") {
        event.preventDefault();
        if (isFindMode) {
          showAllRecords();
        } else {
          void loadAll({ indexMode: "preserve" });
        }
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "n") {
        event.preventDefault();
        if (isFindMode) {
          newFindRequest();
        } else {
          void createNew();
        }
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "d") {
        event.preventDefault();
        if (isFindMode) {
          duplicateFindRequest();
        } else {
          void duplicateCurrent();
        }
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "e") {
        event.preventDefault();
        if (isFindMode) {
          deleteFindRequest();
        } else {
          void deleteCurrent();
        }
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && event.key === "=") {
        event.preventDefault();
        void replaceFieldContents();
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "1") {
        event.preventDefault();
        setViewMode("form");
        setStatus("Form view");
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "2") {
        event.preventDefault();
        setViewMode("list");
        setStatus("List view");
        return;
      }

      if (hasModifier && !event.shiftKey && !event.altKey && keyLower === "3") {
        event.preventDefault();
        setViewMode("table");
        setStatus("Table view");
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        goFirst();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        goLast();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }

      if (!hasModifier && !event.altKey && !event.shiftKey && event.key === "Home") {
        event.preventDefault();
        goFirst();
        return;
      }

      if (!hasModifier && !event.altKey && !event.shiftKey && event.key === "End") {
        event.preventDefault();
        goLast();
        return;
      }

      if (!hasModifier && !event.altKey && !event.shiftKey && event.key === "PageUp") {
        event.preventDefault();
        goPrev();
        return;
      }

      if (!hasModifier && !event.altKey && !event.shiftKey && event.key === "PageDown") {
        event.preventDefault();
        goNext();
        return;
      }

      if (!hasModifier && !event.altKey && !isFindMode && viewMode !== "form" && event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (!hasModifier && !event.altKey && !isFindMode && viewMode !== "form" && event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((current) => Math.min(Math.max(0, records.length - 1), current + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    browseZoomPercent,
    cancelFindMode,
    closeSortDialog,
    createNew,
    deleteFindRequest,
    deleteCurrent,
    duplicateCurrent,
    duplicateFindRequest,
    encodedLayoutRouteName,
    goFirst,
    goLast,
    goNext,
    goPrev,
    handleFindAction,
    isFindMode,
    layoutId,
    loadAll,
    modifyLastFindRequest,
    navigateBrowseMode,
    newFindRequest,
    omitCurrentRecord,
    omitMultipleRecords,
    openSortDialog,
    quickChartOpen,
    replaceFieldContents,
    records.length,
    router,
    setBrowseZoom,
    closeQuickChartDialog,
    sortDialogOpen,
    showAllRecords,
    viewMode,
    withWorkspaceForRoute
  ]);

  const activeSortEntry = useMemo(
    () => (columnMenu ? tableSort.find((entry) => entry.field === columnMenu.field) ?? null : null),
    [columnMenu, tableSort]
  );
  const canRemoveNameFromSort = Boolean(activeSortEntry);
  const canUnsort = tableSort.length > 0;
  const leadingOpsForActiveField = columnMenu ? leadingSubtotals[columnMenu.field] ?? [] : [];
  const trailingOpsForActiveField = columnMenu ? trailingSubtotals[columnMenu.field] ?? [] : [];
  const activeFieldHidden = columnMenu ? hiddenTableFields.includes(columnMenu.field) : false;
  const containerMenuHasContent = Boolean(containerMenu?.rawUrl.trim());
  const containerMenuIsUploading = containerMenu
    ? containerUploadState[containerMenu.stateKey] === "uploading"
    : false;
  const containerMenuCanInsert =
    containerMenu != null &&
    canUploadContainerForTarget(containerMenu.recordId, containerMenu.fieldName) &&
    !containerMenuIsUploading;
  const containerMenuCanCut = containerMenuCanInsert && containerMenuHasContent;
  const containerMenuCanCopy = containerMenuHasContent;
  const containerMenuCanPaste = containerMenuCanInsert;
  const containerMenuCanExport = containerMenuHasContent;
  const hasLastFindCriteria = lastFindRequests.length > 0;
  const currentFindLayoutContext =
    activeLayoutName.trim() || layout?.id?.trim() || layoutRouteName;
  const availableSavedFinds = useMemo(
    () =>
      savedFinds.filter((entry) => {
        const context = (entry.layoutId ?? "").trim();
        return !context || context === currentFindLayoutContext;
      }),
    [currentFindLayoutContext, savedFinds]
  );
  const sortedSavedFinds = useMemo(
    () =>
      [...availableSavedFinds].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      ),
    [availableSavedFinds]
  );
  const hasSavedFinds = sortedSavedFinds.length > 0;
  const recentSavedFinds = useMemo(() => {
    if (recentFindIds.length === 0) {
      return [];
    }
    const byId = new Map(sortedSavedFinds.map((entry) => [entry.id, entry] as const));
    return recentFindIds
      .map((savedFindId) => byId.get(savedFindId) ?? null)
      .filter((entry): entry is SavedFindEntry => Boolean(entry));
  }, [recentFindIds, sortedSavedFinds]);
  const hasRecentSavedFinds = recentSavedFinds.length > 0;
  const savedFindsForEdit = useMemo(() => {
    if (editSavedFindsSortMode === "name") {
      return [...availableSavedFinds].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      );
    }
    return [...availableSavedFinds].sort((left, right) => {
      const leftCreated = left.createdAt ?? 0;
      const rightCreated = right.createdAt ?? 0;
      if (leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
  }, [availableSavedFinds, editSavedFindsSortMode]);
  const selectedSavedFindForEdit = useMemo(
    () => availableSavedFinds.find((entry) => entry.id === editSavedFindsSelectionId) ?? null,
    [availableSavedFinds, editSavedFindsSelectionId]
  );
  const canShowAllRecords =
    isFindMode ||
    showingOmittedOnly ||
    omittedRecordIds.length > 0 ||
    records.length !== allRecords.length;
  const canGoToRecord = !isFindMode && records.length > 0;
  const showOmittedOnlyDisabled = omittedRecordIds.length === 0 || isFindMode;
  const canOmitRecord = !isFindMode && !showingOmittedOnly && records.length > 0;
  const canOmitMultiple = !isFindMode && !showingOmittedOnly && records.length > 0;
  const canModifyLastFind =
    hasLastFindCriteria && (!lastFindLayoutId || lastFindLayoutId === layoutRouteName);
  const canReplaceFieldContents = !isFindMode && records.length > 0;
  const canRelookupFieldContents = !isFindMode && records.length > 0;
  const canRevertRecord = !isFindMode && records.length > 0;
  const totalFindRequests = findRequestStates.length;
  const activeFindRequestNumber = Math.min(
    Math.max(activeFindRequestIndex + 1, 1),
    Math.max(1, totalFindRequests)
  );
  const canGoToPrevFindRequest = isFindMode && totalFindRequests > 1 && activeFindRequestNumber > 1;
  const canGoToNextFindRequest = isFindMode && totalFindRequests > 1 && activeFindRequestNumber < totalFindRequests;
  const activeFindRequestIsOmit = Boolean(activeFindRequest?.omit);
  const activeAdvancedFindRequest = useMemo(() => {
    if (findAdvancedRequestsDraft.length === 0) {
      return null;
    }
    const safeIndex = Math.min(
      Math.max(findAdvancedSelectedRequestIndex, 0),
      findAdvancedRequestsDraft.length - 1
    );
    return findAdvancedRequestsDraft[safeIndex] ?? null;
  }, [findAdvancedRequestsDraft, findAdvancedSelectedRequestIndex]);
  const activeAdvancedCriteriaEntries = useMemo(() => {
    if (!activeAdvancedFindRequest) {
      return [] as Array<[string, string]>;
    }
    return Object.entries(normalizeFindCriteriaMap(activeAdvancedFindRequest.criteria)).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [activeAdvancedFindRequest]);
  const connectionFailureDetail = useMemo(() => {
    const candidates = [error, layoutsError, valueListsError, scriptsError]
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    if (candidates.length === 0) {
      return "";
    }
    const first = candidates[0] as string;
    return first
      .replace(/^Live update failed:\s*/i, "")
      .replace(/^Layout list failed:\s*/i, "")
      .replace(/^Value lists failed:\s*/i, "")
      .replace(/^Scripts failed:\s*/i, "");
  }, [error, layoutsError, scriptsError, valueListsError]);
  const layoutThemeVars = useMemo(() => {
    const firstStyledComponent = sortedComponents.find(
      (component) =>
        String(component.props.styleTheme ?? "").trim().length > 0 ||
        String(component.props.styleName ?? "").trim().length > 0
    );
    return runtimeThemeCssVars(firstStyledComponent?.props.styleTheme, firstStyledComponent?.props.styleName);
  }, [sortedComponents]);

  return (
    <main
      className={`browse-root ${isPreviewMode ? "browse-preview-mode" : ""}`}
      spellCheck={spellingEnabled}
      style={layoutThemeVars}
    >
      <header className="fm-browse-header">
        <div ref={topMenubarRef} className="fm-layout-menubar fm-browse-menubar">
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "filemaker-pro" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("filemaker-pro")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "filemaker-pro"}
            >
              FileMaker Pro
            </button>
            {topMenubarOpenMenu === "filemaker-pro" ? (
              <div className="fm-view-menu" role="menu" aria-label="FileMaker Pro menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("filemaker-about")}>
                  <span>About FM Web IDE</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  onClick={() => handleTopMenubarAction("filemaker-preferences")}
                >
                  <span>Preferences...</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "file" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("file")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "file"}
            >
              File
            </button>
            {topMenubarOpenMenu === "file" ? (
              <div className="fm-view-menu" role="menu" aria-label="File menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("file-new-window")}>
                  <span>New Window</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("file-refresh-layout-list")}>
                  <span>Refresh Layout List</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("file-refresh-window")}>
                  <span>Refresh Window</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("file-layout-mode")}>
                  <span>Open Layout Mode</span>
                  <span className="fm-view-shortcut">⌘L</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("file-print")}>
                  <span>Print...</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("file-close-window")}>
                  <span>Close Window</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "edit" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("edit")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "edit"}
            >
              Edit
            </button>
            {topMenubarOpenMenu === "edit" ? (
              <div className="fm-view-menu" role="menu" aria-label="Edit menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("edit-undo")}>
                  <span>Undo</span>
                  <span className="fm-view-shortcut">⌘Z</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("edit-redo")}>
                  <span>Redo</span>
                  <span className="fm-view-shortcut">⇧⌘Z</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("edit-cut")}>
                  <span>Cut</span>
                  <span className="fm-view-shortcut">⌘X</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("edit-copy")}>
                  <span>Copy</span>
                  <span className="fm-view-shortcut">⌘C</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("edit-paste")}>
                  <span>Paste</span>
                  <span className="fm-view-shortcut">⌘V</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("edit-select-all")}>
                  <span>Select All</span>
                  <span className="fm-view-shortcut">⌘A</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "view" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("view")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "view"}
            >
              View
            </button>
            {topMenubarOpenMenu === "view" ? (
              <div className="fm-view-menu" role="menu" aria-label="View menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-browse-mode")}>
                  <span>{!isFindMode ? <span className="fm-view-check">✓</span> : null}Browse Mode</span>
                  <span className="fm-view-shortcut">⌘B</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-find-mode")}>
                  <span>{isFindMode ? <span className="fm-view-check">✓</span> : null}Find Mode</span>
                  <span className="fm-view-shortcut">⌘F</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-layout-mode")}>
                  <span>Layout Mode</span>
                  <span className="fm-view-shortcut">⌘L</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-preview-mode")}>
                  <span>Preview Mode</span>
                  <span className="fm-view-shortcut">⌘U</span>
                </button>
                <div className="fm-view-menu-divider" />
                <div className="fm-view-menu-submenu-wrap">
                  <button
                    type="button"
                    className="fm-view-menu-item has-submenu"
                    onMouseEnter={() => setTopMenubarSubmenu("goToLayout")}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTopMenubarSubmenu((previous) => (previous === "goToLayout" ? null : "goToLayout"));
                    }}
                  >
                    <span>Go to Layout</span>
                    <span className="fm-view-submenu-arrow">›</span>
                  </button>
                  {topMenubarSubmenu === "goToLayout" ? (
                    <div className="fm-view-submenu" role="menu" aria-label="Go to layout">
                      {layoutPickerGroups.length > 0
                        ? layoutPickerGroups.map((group) =>
                            group.folder ? (
                              <div key={`browse-go-layout-folder-${group.folder}`} className="fm-view-submenu-group">
                                <div className="fm-view-submenu-group-label">{group.folder}</div>
                                {group.layouts.map((layoutName) => (
                                  <button
                                    key={`browse-go-layout-item-${group.folder}-${layoutName}`}
                                    type="button"
                                    className="fm-view-submenu-item"
                                    onClick={() =>
                                      handleTopMenubarAction(
                                        `view-go-to-layout:${encodeURIComponent(layoutName)}`
                                      )
                                    }
                                  >
                                    <span>{activeLayoutName === layoutName ? "✓ " : ""}{layoutName}</span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              group.layouts.map((layoutName) => (
                                <button
                                  key={`browse-go-layout-item-root-${layoutName}`}
                                  type="button"
                                  className="fm-view-submenu-item"
                                  onClick={() =>
                                    handleTopMenubarAction(
                                      `view-go-to-layout:${encodeURIComponent(layoutName)}`
                                    )
                                  }
                                >
                                  <span>{activeLayoutName === layoutName ? "✓ " : ""}{layoutName}</span>
                                </button>
                              ))
                            )
                          )
                        : null}
                    </div>
                  ) : null}
                </div>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-toggle-status-toolbar")}>
                  <span>{showStatusToolbar ? <span className="fm-view-check">✓</span> : null}Status Toolbar</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-toggle-formatting-bar")}>
                  <span>{showFormattingBar ? <span className="fm-view-check">✓</span> : null}Formatting Bar</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-form")}>
                  <span>{viewMode === "form" ? <span className="fm-view-check">✓</span> : null}Form View</span>
                  <span className="fm-view-shortcut">⌘1</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-list")}>
                  <span>{viewMode === "list" ? <span className="fm-view-check">✓</span> : null}List View</span>
                  <span className="fm-view-shortcut">⌘2</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-table")}>
                  <span>{viewMode === "table" ? <span className="fm-view-check">✓</span> : null}Table View</span>
                  <span className="fm-view-shortcut">⌘3</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-actual-size")}>
                  <span>Actual Size</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-zoom-in")}>
                  <span>Zoom In</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("view-zoom-out")}>
                  <span>Zoom Out</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "insert" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("insert")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "insert"}
            >
              Insert
            </button>
            {topMenubarOpenMenu === "insert" ? (
              <div className="fm-view-menu" role="menu" aria-label="Insert menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("insert-current-date")}>
                  <span>Current Date</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("insert-current-time")}>
                  <span>Current Time</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("insert-current-user-name")}>
                  <span>Current User Name</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "format" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("format")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "format"}
            >
              Format
            </button>
            {topMenubarOpenMenu === "format" ? (
              <div className="fm-view-menu" role="menu" aria-label="Format menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("format-bold")}>
                  <span>Bold</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("format-italic")}>
                  <span>Italic</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("format-underline")}>
                  <span>Underline</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "records" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("records")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "records"}
            >
              Records
            </button>
            {topMenubarOpenMenu === "records" ? (
              <div className="fm-view-menu" role="menu" aria-label="Records menu">
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!layout || (!isFindMode && isPreviewMode)}
                  onClick={() => handleTopMenubarAction("records-new")}
                >
                  <span>{isFindMode ? "New Request" : "New Record"}</span>
                  <span className="fm-view-shortcut">⌘N</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!layout || (isFindMode ? totalFindRequests === 0 : isPreviewMode || records.length === 0)}
                  onClick={() => handleTopMenubarAction("records-duplicate")}
                >
                  <span>{isFindMode ? "Duplicate Request" : "Duplicate Record"}</span>
                  <span className="fm-view-shortcut">⌘D</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!layout || (!isFindMode && (isPreviewMode || records.length === 0))}
                  onClick={() => handleTopMenubarAction("records-delete")}
                >
                  <span>{isFindMode ? "Delete Request" : "Delete Record..."}</span>
                  <span className="fm-view-shortcut">⌘E</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!layout || isFindMode || isPreviewMode || records.length === 0}
                  onClick={() => handleTopMenubarAction("records-delete-all")}
                >
                  <span>Delete All Records...</span>
                </button>
                {isFindMode ? (
                  <>
                    <div className="fm-view-menu-divider" />
                    <button
                      type="button"
                      className="fm-view-menu-item"
                      onClick={() => handleTopMenubarAction("records-perform-find")}
                    >
                      <span>Perform Find</span>
                      <span className="fm-view-shortcut">⌘F</span>
                    </button>
                    <button
                      type="button"
                      className="fm-view-menu-item"
                      onClick={() => handleTopMenubarAction("records-cancel-find")}
                    >
                      <span>Cancel Find</span>
                      <span className="fm-view-shortcut">Esc</span>
                    </button>
                  </>
                ) : null}
                <div className="fm-view-menu-divider" />
                <div className="fm-view-menu-submenu-wrap">
                  <button
                    type="button"
                    className="fm-view-menu-item has-submenu"
                    disabled={isFindMode ? totalFindRequests === 0 : !canGoToRecord}
                    onMouseEnter={() => setTopMenubarSubmenu("goToRecord")}
                    onClick={(event) => {
                      if (isFindMode ? totalFindRequests === 0 : !canGoToRecord) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      setTopMenubarSubmenu((previous) => (previous === "goToRecord" ? null : "goToRecord"));
                    }}
                  >
                    <span>{isFindMode ? "Go to Request" : "Go to Record"}</span>
                    <span className="fm-view-submenu-arrow">›</span>
                  </button>
                  {topMenubarSubmenu === "goToRecord" ? (
                    <div className="fm-view-submenu" role="menu" aria-label={isFindMode ? "Go to request" : "Go to record"}>
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-go-first")}>
                        <span>First</span>
                      </button>
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-go-prev")}>
                        <span>Previous</span>
                      </button>
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-go-next")}>
                        <span>Next</span>
                      </button>
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-go-last")}>
                        <span>Last</span>
                      </button>
                      <div className="fm-view-menu-divider" />
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-go-to-record")}>
                        <span>By Number...</span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("records-refresh-window")}>
                  <span>Refresh Window</span>
                  <span className="fm-view-shortcut">⇧⌘R</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canShowAllRecords}
                  onClick={() => handleTopMenubarAction("records-show-all")}
                >
                  <span>Show All Records</span>
                  <span className="fm-view-shortcut">⌘J</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={showOmittedOnlyDisabled}
                  onClick={() => handleTopMenubarAction("records-show-omitted-only")}
                >
                  <span>Show Omitted Only</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canOmitRecord}
                  onClick={() => handleTopMenubarAction("records-omit-record")}
                >
                  <span>Omit Record</span>
                  <span className="fm-view-shortcut">⌘T</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canOmitMultiple}
                  onClick={() => handleTopMenubarAction("records-omit-multiple")}
                >
                  <span>Omit Multiple...</span>
                  <span className="fm-view-shortcut">⇧⌘T</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canModifyLastFind}
                  onClick={() => handleTopMenubarAction("records-modify-last-find")}
                >
                  <span>Modify Last Find</span>
                  <span className="fm-view-shortcut">⌘R</span>
                </button>
                <div className="fm-view-menu-submenu-wrap">
                  <button
                    type="button"
                    className="fm-view-menu-item has-submenu"
                    onMouseEnter={() => setTopMenubarSubmenu("savedFinds")}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTopMenubarSubmenu((previous) => (previous === "savedFinds" ? null : "savedFinds"));
                    }}
                  >
                    <span>Saved Finds</span>
                    <span className="fm-view-submenu-arrow">›</span>
                  </button>
                  {topMenubarSubmenu === "savedFinds" ? (
                    <div className="fm-view-submenu" role="menu" aria-label="Saved finds">
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-save-find")}>
                        <span>Save Current Find...</span>
                      </button>
                      <button type="button" className="fm-view-submenu-item" onClick={() => handleTopMenubarAction("records-edit-saved-finds")}>
                        <span>Edit Saved Finds...</span>
                      </button>
                      <div className="fm-view-menu-divider" />
                      <div className="fm-view-submenu-group-label">Saved Finds</div>
                      {hasSavedFinds ? (
                        sortedSavedFinds.map((entry) => (
                          <button
                            key={`saved-find-${entry.id}`}
                            type="button"
                            className="fm-view-submenu-item"
                            onClick={() => handleTopMenubarAction(`records-run-find:${entry.id}`)}
                          >
                            <span>{entry.name}</span>
                          </button>
                        ))
                      ) : (
                        <div className="fm-view-submenu-group-label">&lt;None&gt;</div>
                      )}
                      <div className="fm-view-submenu-group-label">Recent Finds</div>
                      {hasRecentSavedFinds ? (
                        recentSavedFinds.map((entry) => (
                          <button
                            key={`recent-find-${entry.id}`}
                            type="button"
                            className="fm-view-submenu-item"
                            onClick={() => handleTopMenubarAction(`records-run-find:${entry.id}`)}
                          >
                            <span>{entry.name}</span>
                          </button>
                        ))
                      ) : (
                        <div className="fm-view-submenu-group-label">&lt;None&gt;</div>
                      )}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={isFindMode}
                  onClick={() => handleTopMenubarAction("records-sort")}
                >
                  <span>Sort Records...</span>
                  <span className="fm-view-shortcut">⌘S</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canUnsort}
                  onClick={() => handleTopMenubarAction("records-unsort")}
                >
                  <span>Unsort</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canReplaceFieldContents}
                  onClick={() => handleTopMenubarAction("records-replace-field-contents")}
                >
                  <span>Replace Field Contents...</span>
                  <span className="fm-view-shortcut">⌘=</span>
                </button>
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canRelookupFieldContents}
                  onClick={() => handleTopMenubarAction("records-relookup-field-contents")}
                >
                  <span>Relookup Field Contents</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button
                  type="button"
                  className="fm-view-menu-item"
                  disabled={!canRevertRecord}
                  onClick={() => handleTopMenubarAction("records-revert-record")}
                >
                  <span>Revert Record...</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "scripts" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("scripts")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "scripts"}
            >
              Scripts
            </button>
            {topMenubarOpenMenu === "scripts" ? (
              <div className="fm-view-menu" role="menu" aria-label="Scripts menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("scripts-refresh")}>
                  <span>Refresh Script List</span>
                </button>
                <div className="fm-view-menu-divider" />
                {scriptsLoading ? <div className="fm-view-submenu-group-label">Loading scripts...</div> : null}
                {!scriptsLoading && topMenubarScriptItems.length === 0 ? (
                  <div className="fm-view-submenu-group-label">No scripts available</div>
                ) : null}
                {!scriptsLoading
                  ? topMenubarScriptItems.map((scriptName) => (
                      <button
                        key={`browse-top-script-${scriptName}`}
                        type="button"
                        className="fm-view-menu-item"
                        onClick={() =>
                          handleTopMenubarAction(`scripts-run:${encodeURIComponent(scriptName)}`)
                        }
                      >
                        <span>Run {scriptName}</span>
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "tools" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("tools")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "tools"}
            >
              Tools
            </button>
            {topMenubarOpenMenu === "tools" ? (
              <div className="fm-view-menu" role="menu" aria-label="Tools menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("tools-spelling")}>
                  <span>Spelling...</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("tools-manage-database")}>
                  <span>Manage Database...</span>
                </button>
              </div>
            ) : null}
          </div>
          <div
            className={`fm-layout-menubar-item ${topMenubarOpenMenu === "window" ? "open" : ""}`}
            onMouseLeave={() => setTopMenubarSubmenu(null)}
          >
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("window")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "window"}
            >
              Window
            </button>
            {topMenubarOpenMenu === "window" ? (
              <div className="fm-view-menu" role="menu" aria-label="Window menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-new-window")}>
                  <span>New Window</span>
                </button>
                <div className="fm-view-menu-submenu-wrap">
                  <button
                    type="button"
                    className="fm-view-menu-item has-submenu"
                    onMouseEnter={() => setTopMenubarSubmenu("showWindow")}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTopMenubarSubmenu((previous) => (previous === "showWindow" ? null : "showWindow"));
                    }}
                  >
                    <span>Show Window</span>
                    <span className="fm-view-submenu-arrow">›</span>
                  </button>
                  {topMenubarSubmenu === "showWindow" ? (
                    <div className="fm-view-submenu" role="menu" aria-label="Show Window">
                      {workspaceCatalogLoading ? (
                        <div className="fm-view-submenu-group-label">Loading windows...</div>
                      ) : null}
                      {workspaceWindowEntries.map((workspaceEntry) => (
                        <button
                          key={`browse-window-show-workspace-${workspaceEntry.id}`}
                          type="button"
                          className={`fm-view-submenu-item ${workspaceEntry.id === currentWorkspaceId ? "active" : ""}`}
                          onClick={() =>
                            handleTopMenubarAction(
                              `window-show-workspace:${encodeURIComponent(workspaceEntry.id)}`
                            )
                          }
                        >
                          <span>
                            {workspaceEntry.id === currentWorkspaceId ? "✓ " : ""}
                            {workspaceEntry.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-hide-window")}>
                  <span>Hide Window</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-minimize-window")}>
                  <span>Minimize Window</span>
                  <span className="fm-view-shortcut">⌘M</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-tile-horizontal")}>
                  <span>Tile Horizontally</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-tile-vertical")}>
                  <span>Tile Vertically</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-cascade")}>
                  <span>Cascade Windows</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("window-bring-all-front")}>
                  <span>Bring All To Front</span>
                </button>
                <div className="fm-view-menu-divider" />
                {workspaceCatalogLoading ? (
                  <div className="fm-view-submenu-group-label">Loading workspaces...</div>
                ) : null}
                {workspaceWindowEntries.map((workspaceEntry) => (
                  <button
                    key={`browse-window-workspace-${workspaceEntry.id}`}
                    type="button"
                    className={`fm-view-menu-item ${workspaceEntry.id === currentWorkspaceId ? "active" : ""}`}
                    onClick={() =>
                      handleTopMenubarAction(`window-workspace:${encodeURIComponent(workspaceEntry.id)}`)
                    }
                  >
                    <span>
                      {workspaceEntry.id === currentWorkspaceId ? "✓ " : ""}
                      {workspaceEntry.label}
                    </span>
                  </button>
                ))}
                {workspaceWindowEntries.length === 0 && !workspaceCatalogLoading ? (
                  <div className="fm-view-submenu-group-label">No workspaces loaded</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={`fm-layout-menubar-item ${topMenubarOpenMenu === "help" ? "open" : ""}`}>
            <button
              type="button"
              className="fm-layout-menubar-button"
              onClick={() => toggleTopMenubarMenu("help")}
              aria-haspopup="menu"
              aria-expanded={topMenubarOpenMenu === "help"}
            >
              Help
            </button>
            {topMenubarOpenMenu === "help" ? (
              <div className="fm-view-menu" role="menu" aria-label="Help menu">
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("help-claris-help")}>
                  <span>Claris Help</span>
                </button>
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("help-shortcuts")}>
                  <span>Keyboard Shortcuts</span>
                </button>
                <div className="fm-view-menu-divider" />
                <button type="button" className="fm-view-menu-item" onClick={() => handleTopMenubarAction("help-about")}>
                  <span>About FM Web IDE</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {showStatusToolbar ? (
          <div className="fm-status-area">
            <div className="fm-status-main">
              <div className="fm-nav-cluster" role="group" aria-label={isFindMode ? "Find request navigation" : "Record navigation"}>
                <button
                  onClick={goFirst}
                  disabled={isFindMode ? activeFindRequestNumber <= 1 : !hasRecords || index <= 0}
                  aria-label={isFindMode ? "First find request" : "First record"}
                >
                  |&lt;
                </button>
                <button
                  onClick={goPrev}
                  disabled={isFindMode ? !canGoToPrevFindRequest : !hasRecords || index <= 0}
                  aria-label={isFindMode ? "Previous find request" : "Previous record"}
                >
                  &lt;
                </button>
                <button
                  onClick={goNext}
                  disabled={isFindMode ? !canGoToNextFindRequest : !hasRecords || index >= records.length - 1}
                  aria-label={isFindMode ? "Next find request" : "Next record"}
                >
                  &gt;
                </button>
                <button
                  onClick={goLast}
                  disabled={isFindMode ? activeFindRequestNumber >= totalFindRequests : !hasRecords || index >= records.length - 1}
                  aria-label={isFindMode ? "Last find request" : "Last record"}
                >
                  &gt;|
                </button>
              </div>
              <div className="fm-record-cluster">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Current record"
                  value={recordJumpInput}
                  onChange={(event) => setRecordJumpInput(event.currentTarget.value)}
                  onBlur={() => {
                    if (isFindMode) {
                      const parsed = Number.parseInt(recordJumpInput, 10);
                      if (!Number.isFinite(parsed)) {
                        setRecordJumpInput(String(activeFindRequestNumber));
                        return;
                      }
                      selectFindRequestByIndex(parsed - 1);
                      return;
                    }
                    jumpToRecord(recordJumpInput);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (isFindMode) {
                        const parsed = Number.parseInt(recordJumpInput, 10);
                        if (!Number.isFinite(parsed)) {
                          setRecordJumpInput(String(activeFindRequestNumber));
                          return;
                        }
                        selectFindRequestByIndex(parsed - 1);
                        return;
                      }
                      jumpToRecord(recordJumpInput);
                    }
                  }}
                />
                <div className="fm-record-meta">
                  <span>{isFindMode ? totalFindRequests : displayedRecordCount}</span>
                  <span>
                    {isFindMode
                      ? `Find Request${totalFindRequests === 1 ? "" : "s"}`
                      : `Total ${
                          source === "mock"
                            ? "(Mock)"
                            : tableSort.length > 0
                              ? "(Sorted)"
                              : "(Unsorted)"
                        }`}
                  </span>
                </div>
              </div>
              {isFindMode ? (
                <>
                  <button onClick={newFindRequest} disabled={!layout}>
                    New Request
                  </button>
                  <button onClick={deleteFindRequest} disabled={!layout}>
                    Delete Request
                  </button>
                  <button onClick={performFind} disabled={!layout}>
                    Perform Find
                  </button>
                  <button onClick={cancelFindMode} disabled={!layout}>
                    Cancel Find
                  </button>
                  <div ref={findRequestSavedMenuRef} className="fm-find-inline-menu fm-find-status-saved">
                    <button
                      type="button"
                      onClick={() => {
                        setFindRequestSavedMenuOpen((previous) => !previous);
                        setFindRequestInsertMenuOpen(false);
                      }}
                    >
                      Saved Finds ▾
                    </button>
                    {findRequestSavedMenuOpen ? (
                      <div className="fm-view-menu fm-find-inline-popover" role="menu" aria-label="Find mode saved finds">
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          onClick={() => {
                            setFindRequestSavedMenuOpen(false);
                            createNewFindRequestSet();
                          }}
                        >
                          <span>Create New Find</span>
                        </button>
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          disabled={!canModifyLastFind}
                          onClick={() => {
                            setFindRequestSavedMenuOpen(false);
                            modifyLastFindRequest();
                          }}
                        >
                          <span>Modify Last Find</span>
                        </button>
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          onClick={() => {
                            setFindRequestSavedMenuOpen(false);
                            saveCurrentFindRequest();
                          }}
                        >
                          <span>Save Current Find...</span>
                        </button>
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          onClick={() => {
                            setFindRequestSavedMenuOpen(false);
                            openEditSavedFindsDialog();
                          }}
                        >
                          <span>Edit Saved Finds...</span>
                        </button>
                        <div className="fm-view-menu-divider" />
                        <div className="fm-view-submenu-group-label">Saved Finds</div>
                        {hasSavedFinds
                          ? sortedSavedFinds.map((entry) => (
                              <button
                                key={`find-status-saved-${entry.id}`}
                                type="button"
                                className="fm-view-menu-item"
                                onClick={() => {
                                  setFindRequestSavedMenuOpen(false);
                                  runSavedFindById(entry.id);
                                }}
                              >
                                <span>{entry.name}</span>
                              </button>
                            ))
                          : <div className="fm-view-submenu-group-label">&lt;None&gt;</div>}
                        <div className="fm-view-submenu-group-label">Recent Finds</div>
                        {hasRecentSavedFinds
                          ? recentSavedFinds.map((entry) => (
                              <button
                                key={`find-status-recent-${entry.id}`}
                                type="button"
                                className="fm-view-menu-item"
                                onClick={() => {
                                  setFindRequestSavedMenuOpen(false);
                                  runSavedFindById(entry.id);
                                }}
                              >
                                <span>{entry.name}</span>
                              </button>
                            ))
                          : <div className="fm-view-submenu-group-label">&lt;None&gt;</div>}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      void loadAll({ indexMode: "preserve" });
                    }}
                    disabled={!layout}
                  >
                    Show All
                  </button>
                  <button onClick={() => void createNew()} disabled={!layout || isPreviewMode}>
                    New Record
                  </button>
                  <button onClick={() => void deleteCurrent()} disabled={isPreviewMode || !records.length}>
                    Delete Record
                  </button>
                  <div ref={findOptionsMenuRef} className="fm-find-split">
                    <button type="button" className="fm-find-split-main" onClick={handleFindAction}>
                      Find
                    </button>
                    <button
                      type="button"
                      className="fm-find-split-toggle"
                      aria-label="Find options"
                      onClick={() => setFindOptionsMenuOpen((previous) => !previous)}
                    >
                      ▾
                    </button>
                    {findOptionsMenuOpen ? (
                      <div className="fm-view-menu fm-find-options-menu" role="menu" aria-label="Find options">
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          onClick={() => {
                            createNewFindRequestSet();
                          }}
                        >
                          <span>Create New Find</span>
                        </button>
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          disabled={!canModifyLastFind}
                          onClick={() => {
                            setFindOptionsMenuOpen(false);
                            modifyLastFindRequest();
                          }}
                        >
                          <span>Modify Last Find</span>
                        </button>
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          disabled={!canModifyLastFind && !isFindMode}
                          onClick={() => {
                            saveCurrentFindRequest();
                          }}
                        >
                          <span>Save Current Find...</span>
                        </button>
                        <button
                          type="button"
                          className="fm-view-menu-item"
                          onClick={() => {
                            openEditSavedFindsDialog();
                          }}
                        >
                          <span>Edit Saved Finds...</span>
                        </button>
                        <div className="fm-view-menu-divider" />
                        <div className="fm-view-submenu-group-label">Saved Finds</div>
                        {hasSavedFinds ? (
                          sortedSavedFinds.map((entry) => (
                            <button
                              key={`find-options-saved-${entry.id}`}
                              type="button"
                              className="fm-view-menu-item"
                              onClick={() => {
                                setFindOptionsMenuOpen(false);
                                runSavedFindById(entry.id);
                              }}
                            >
                              <span>{entry.name}</span>
                            </button>
                          ))
                        ) : (
                          <div className="fm-view-submenu-group-label">&lt;None&gt;</div>
                        )}
                        <div className="fm-view-submenu-group-label">Recent Finds</div>
                        {hasRecentSavedFinds ? (
                          recentSavedFinds.map((entry) => (
                            <button
                              key={`find-options-recent-${entry.id}`}
                              type="button"
                              className="fm-view-menu-item"
                              onClick={() => {
                                setFindOptionsMenuOpen(false);
                                runSavedFindById(entry.id);
                              }}
                            >
                              <span>{entry.name}</span>
                            </button>
                          ))
                        ) : (
                          <div className="fm-view-submenu-group-label">&lt;None&gt;</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button onClick={openSortDialog} disabled={!layout || viewFieldNames.length === 0}>
                    Sort
                  </button>
                </>
              )}
            </div>
            <div className="fm-status-sub">
              <label className="fm-layout-selector">
                <span>Layout:</span>
                <select
                  value={activeLayoutName}
                  disabled={layoutsLoading || selectableLayouts.length === 0}
                  onChange={(event) => {
                    void switchBrowseLayout(event.currentTarget.value);
                  }}
                >
                  {selectableLayouts.length === 0 ? (
                    <option value={activeLayoutName}>{activeLayoutName || layout?.name || "..."}</option>
                  ) : (
                    layoutPickerGroups.length > 0 ? (
                      layoutPickerGroups.map((group) =>
                        group.folder ? (
                          <optgroup key={`browse-layout-folder-${group.folder}`} label={group.folder}>
                            {group.layouts.map((layoutName) => (
                              <option key={`browse-layout-folder-${group.folder}-${layoutName}`} value={layoutName}>
                                {layoutName}
                              </option>
                            ))}
                          </optgroup>
                        ) : (
                          group.layouts.map((layoutName) => (
                            <option key={`browse-layout-folder-root-${layoutName}`} value={layoutName}>
                              {layoutName}
                            </option>
                          ))
                        )
                      )
                    ) : (
                      selectableLayouts.map((layoutName) => (
                        <option key={layoutName} value={layoutName}>
                          {layoutName}
                        </option>
                      ))
                    )
                  )}
                </select>
              </label>
              <div className="fm-view-switch" role="tablist" aria-label="Browse view mode">
                <span>View As:</span>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "form"}
                  className={viewMode === "form" ? "active" : ""}
                  onClick={() => setViewMode("form")}
                >
                  Form
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "list"}
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "table"}
                  className={viewMode === "table" ? "active" : ""}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </button>
              </div>
              {isFindMode ? (
                <div className="fm-find-match-cluster">
                  <span>Matching Records:</span>
                  <button
                    type="button"
                    className={!activeFindRequestIsOmit ? "active" : ""}
                    onClick={() => setActiveFindRequestOmit(false)}
                  >
                    Include
                  </button>
                  <button
                    type="button"
                    className={activeFindRequestIsOmit ? "active" : ""}
                    onClick={() => setActiveFindRequestOmit(true)}
                  >
                    Omit
                  </button>
                </div>
              ) : (
                <span className="fm-preview-pill">
                  {isPreviewMode ? "Preview Mode" : source === "filemaker" ? "Live" : "Preview"} | Zoom {browseZoomPercent}%
                </span>
              )}
              {isFindMode ? (
                <div ref={findRequestInsertMenuRef} className="fm-find-inline-menu fm-find-insert-cluster">
                  <span>Insert:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFindRequestInsertMenuOpen((previous) => !previous);
                      setFindRequestSavedMenuOpen(false);
                    }}
                  >
                    Operators ▾
                  </button>
                  {findRequestInsertMenuOpen ? (
                    <div className="fm-view-menu fm-find-inline-popover" role="menu" aria-label="Insert operators">
                      {FIND_INSERT_OPERATOR_OPTIONS.map((entry) => (
                        <button
                          key={`find-operator-${entry.token}`}
                          type="button"
                          className="fm-view-menu-item"
                          onClick={() => insertFindOperatorToken(entry.token)}
                        >
                          <span>{entry.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void loadAll({ indexMode: "preserve" });
                  setStatus("Refreshing layout data...");
                }}
              >
                Refresh
              </button>
              <Link href={withWorkspaceForRoute(`/layouts/${encodedLayoutRouteName}/edit`)} className="fm-layout-link">
                Layout Mode
              </Link>
            </div>
          </div>
        ) : null}
        {showFormattingBar ? (
          <div className="fm-browse-formatting-bar">
            <span>Formatting Bar</span>
            <span>
              Theme:{" "}
              {layout?.components.find((component) => String(component.props.styleTheme ?? "").trim().length > 0)
                ?.props.styleTheme ?? "Default"}
            </span>
            <span>View: {viewMode[0].toUpperCase() + viewMode.slice(1)}</span>
          </div>
        ) : null}
      </header>

      {preferencesDialogOpen ? (
        <div
          className="button-setup-backdrop browse-find-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreferencesDialogOpen(false);
            }
          }}
        >
          <div className="browse-preferences-modal" role="dialog" aria-modal="true" aria-label="Preferences">
            <h3>Preferences</h3>
            <p>Apply workspace-level defaults for Browse Mode.</p>
            <div className="browse-preferences-grid">
              <label>
                <input
                  type="checkbox"
                  checked={spellingEnabled}
                  onChange={(event) => {
                    const next = event.currentTarget.checked;
                    setSpellingEnabled(next);
                    setStatus(next ? "Spelling enabled" : "Spelling disabled");
                  }}
                />
                Enable spelling in text fields
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showStatusToolbar}
                  onChange={(event) => {
                    const next = event.currentTarget.checked;
                    setShowStatusToolbar(next);
                    setStatus(next ? "Status toolbar shown" : "Status toolbar hidden");
                  }}
                />
                Show status toolbar
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showFormattingBar}
                  onChange={(event) => {
                    const next = event.currentTarget.checked;
                    setShowFormattingBar(next);
                    setStatus(next ? "Formatting bar shown" : "Formatting bar hidden");
                  }}
                />
                Show formatting bar
              </label>
            </div>
            <div className="button-setup-actions">
              <button type="button" onClick={() => setPreferencesDialogOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveFindDialogOpen ? (
        <div
          className="button-setup-backdrop browse-find-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSaveFindDialogOpen(false);
              setSaveFindDialogEditingId(null);
            }
          }}
        >
          <div className="browse-find-save-modal">
            <h3>Specify Options for the Saved Find</h3>
            <p>
              Provide a name that represents this find request criteria. You can also modify the criteria that will be saved.
            </p>
            <label className="browse-find-save-name-row">
              <span>Name:</span>
              <input
                type="text"
                value={saveFindDialogName}
                onChange={(event) => setSaveFindDialogName(event.currentTarget.value)}
                autoFocus
              />
            </label>
            <div className="browse-find-save-actions">
              <button
                type="button"
                onClick={openFindAdvancedDialog}
              >
                Advanced...
              </button>
              <div className="spacer" />
              <button
                type="button"
                onClick={() => {
                  setSaveFindDialogOpen(false);
                  setSaveFindDialogEditingId(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={commitSaveFindDialog}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {findAdvancedDialogOpen ? (
        <div
          className="button-setup-backdrop browse-find-dialog-backdrop browse-find-advanced-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeFindAdvancedDialog();
            }
          }}
        >
          <div className="browse-find-advanced-modal">
            <h3>Edit Find Request Criteria</h3>
            <div className="browse-find-advanced-grid">
              <section className="browse-find-advanced-requests">
                <div className="browse-find-advanced-section-head">Requests</div>
                <div className="browse-find-advanced-request-list">
                  {findAdvancedRequestsDraft.map((request, requestIndex) => {
                    const summary = summarizeFindRequests([request]);
                    const selected = requestIndex === findAdvancedSelectedRequestIndex;
                    return (
                      <button
                        key={`advanced-find-request-${request.id}-${requestIndex}`}
                        type="button"
                        className={`browse-find-advanced-request-row ${selected ? "active" : ""}`}
                        onClick={() => {
                          setFindAdvancedSelectedRequestIndex(requestIndex);
                          const fields = Object.keys(request.criteria ?? {});
                          setFindAdvancedSelectedCriteriaField(fields[0] ?? "");
                          setFindAdvancedSelectedField(fields[0] ?? findCriteriaFieldNames[0] ?? "");
                          setFindAdvancedFieldValue(fields[0] ? request.criteria[fields[0]] ?? "" : "");
                        }}
                      >
                        <span>Request {requestIndex + 1}</span>
                        <span>{summary}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="browse-find-advanced-request-actions">
                  <button type="button" onClick={addFindAdvancedRequest}>
                    New
                  </button>
                  <button type="button" onClick={duplicateFindAdvancedRequest}>
                    Duplicate
                  </button>
                  <button type="button" onClick={deleteFindAdvancedRequest}>
                    Delete
                  </button>
                </div>
              </section>
              <section className="browse-find-advanced-criteria">
                <div className="browse-find-advanced-section-head">Criteria</div>
                <div className="browse-find-advanced-mode">
                  <span>Action:</span>
                  <button
                    type="button"
                    className={!activeAdvancedFindRequest?.omit ? "active" : ""}
                    onClick={() => setFindAdvancedRequestOmit(false)}
                  >
                    Find Records
                  </button>
                  <button
                    type="button"
                    className={activeAdvancedFindRequest?.omit ? "active" : ""}
                    onClick={() => setFindAdvancedRequestOmit(true)}
                  >
                    Omit Records
                  </button>
                </div>
                <div className="browse-find-advanced-criteria-list">
                  {activeAdvancedCriteriaEntries.length === 0 ? (
                    <div className="browse-find-advanced-empty">&lt;No criteria&gt;</div>
                  ) : (
                    activeAdvancedCriteriaEntries.map(([fieldName, criterion]) => {
                      const selected = fieldName === findAdvancedSelectedCriteriaField;
                      return (
                        <button
                          key={`advanced-criterion-${fieldName}`}
                          type="button"
                          className={`browse-find-advanced-criterion-row ${selected ? "active" : ""}`}
                          onClick={() => {
                            setFindAdvancedSelectedCriteriaField(fieldName);
                            setFindAdvancedSelectedField(fieldName);
                            setFindAdvancedFieldValue(criterion);
                          }}
                        >
                          <span>{fieldName}</span>
                          <span>{criterion}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="browse-find-advanced-editor">
                  <label>
                    <span>Field</span>
                    <select
                      value={findAdvancedSelectedField}
                      onChange={(event) => setFindAdvancedSelectedField(event.currentTarget.value)}
                    >
                      <option value="">Select field...</option>
                      {findCriteriaFieldNames.map((fieldName) => (
                        <option key={`find-advanced-field-${fieldName}`} value={fieldName}>
                          {fieldName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Criteria</span>
                    <input
                      type="text"
                      value={findAdvancedFieldValue}
                      onChange={(event) => setFindAdvancedFieldValue(event.currentTarget.value)}
                      placeholder='Examples: >100, "Smith", 1...10, !Completed'
                    />
                  </label>
                  <div className="browse-find-advanced-editor-actions">
                    <button type="button" onClick={upsertFindAdvancedCriterion}>
                      Set
                    </button>
                    <button type="button" onClick={removeFindAdvancedCriterion}>
                      Remove
                    </button>
                  </div>
                </div>
              </section>
            </div>
            <div className="browse-find-advanced-actions">
              <button type="button" onClick={closeFindAdvancedDialog}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={commitFindAdvancedDialog}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editSavedFindsDialogOpen ? (
        <div
          className="button-setup-backdrop browse-find-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditSavedFindsDialogOpen(false);
            }
          }}
        >
          <div className="browse-edit-saved-finds-modal">
            <h3>Edit Saved Finds</h3>
            <p>
              Use this panel to edit the list of all Saved Finds. You can create, delete and duplicate Saved Finds that appear in the Saved Finds list.
            </p>
            <div className="browse-edit-saved-finds-toolbar">
              <span />
              <label>
                <span>View by:</span>
                <select
                  value={editSavedFindsSortMode}
                  onChange={(event) =>
                    setEditSavedFindsSortMode(
                      event.currentTarget.value === "name" ? "name" : "creation"
                    )
                  }
                >
                  <option value="creation">creation order</option>
                  <option value="name">name</option>
                </select>
              </label>
            </div>
            <div className="browse-edit-saved-finds-list-wrap">
              <div className="browse-edit-saved-finds-head">
                <span>Name</span>
                <span>Find Request Criteria (Summary)</span>
              </div>
              <div className="browse-edit-saved-finds-list">
                {savedFindsForEdit.length === 0 ? (
                  <div className="browse-edit-saved-finds-empty">&lt;None&gt;</div>
                ) : (
                  savedFindsForEdit.map((entry) => {
                    const selected = entry.id === editSavedFindsSelectionId;
                    return (
                      <button
                        key={`edit-saved-find-${entry.id}`}
                        type="button"
                        className={`browse-edit-saved-finds-row ${selected ? "active" : ""}`}
                        onClick={() => setEditSavedFindsSelectionId(entry.id)}
                        onDoubleClick={() => openSaveFindDialogForEntry(entry)}
                      >
                        <span>{entry.name}</span>
                        <span>{summarizeFindRequests(entry.requests)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="browse-edit-saved-finds-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const sourceRequests =
                    isFindMode
                      ? findRequestStates.map((request, requestIndex) =>
                          requestIndex === activeFindRequestIndex
                            ? {
                                ...request,
                                criteria: findCriteria
                              }
                            : request
                        )
                      : lastFindLayoutId && lastFindLayoutId === layoutRouteName
                        ? lastFindRequests
                        : [];
                  const normalizedRequests = sourceRequests
                    .map((request) => ({
                      ...request,
                      criteria: normalizeFindCriteriaMap(request.criteria)
                    }))
                    .filter((request) => Object.keys(request.criteria).length > 0 || request.omit);
                  const fallbackRequest = createFindRequest({
                    id: "find-request-1",
                    criteria: {},
                    omit: false
                  });
                  const targetLayoutId = activeLayoutName.trim() || layout?.id?.trim() || layoutRouteName;
                  const existingCountForLayout = savedFinds.filter((entry) => {
                    const context = (entry.layoutId ?? "").trim();
                    return !context || context === targetLayoutId;
                  }).length;
                  setSaveFindDialogRequests(
                    normalizedRequests.length > 0 ? normalizedRequests : [fallbackRequest]
                  );
                  setSaveFindDialogEditingId(null);
                  setSaveFindDialogName(`Find ${existingCountForLayout + 1}`);
                  setEditSavedFindsDialogOpen(false);
                  setSaveFindDialogOpen(true);
                }}
              >
                New...
              </button>
              <button
                type="button"
                disabled={!selectedSavedFindForEdit}
                onClick={() => {
                  if (!selectedSavedFindForEdit) {
                    return;
                  }
                  openSaveFindDialogForEntry(selectedSavedFindForEdit);
                }}
              >
                Edit...
              </button>
              <button
                type="button"
                disabled={!selectedSavedFindForEdit}
                onClick={() => {
                  if (!selectedSavedFindForEdit) {
                    return;
                  }
                  const nextName = `${selectedSavedFindForEdit.name} Copy`;
                  const now = Date.now();
                  const duplicate: SavedFindEntry = {
                    id: crypto.randomUUID(),
                    name: nextName,
                    requests: selectedSavedFindForEdit.requests.map((request) => ({
                      ...request,
                      criteria: { ...request.criteria }
                    })),
                    createdAt: now,
                    layoutId: selectedSavedFindForEdit.layoutId ?? layoutRouteName
                  };
                  setSavedFinds((previous) => [...previous, duplicate]);
                  setEditSavedFindsSelectionId(duplicate.id);
                  setStatus(`Duplicated saved find "${selectedSavedFindForEdit.name}"`);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                disabled={!selectedSavedFindForEdit}
                onClick={() => {
                  if (!selectedSavedFindForEdit) {
                    return;
                  }
                  setSavedFinds((previous) =>
                    previous.filter((entry) => entry.id !== selectedSavedFindForEdit.id)
                  );
                  setStatus(`Deleted saved find "${selectedSavedFindForEdit.name}"`);
                }}
              >
                Delete
              </button>
              <div className="spacer" />
              <button type="button" onClick={() => setEditSavedFindsDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => setEditSavedFindsDialogOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sortDialogOpen ? (
        <div
          className="button-setup-backdrop portal-sort-backdrop browse-sort-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSortDialog();
            }
          }}
        >
          <div className="portal-sort-modal browse-sort-modal">
            <h3>Sort Records</h3>
            <label className="browse-sort-layout-picker">
              <span>Display fields from</span>
              <select
                value={sortDialogContext}
                onChange={(event) => {
                  const nextContext = event.currentTarget.value;
                  if (nextContext === SORT_CONTEXT_MANAGE_DATABASE) {
                    setStatus("Manage Database is available in Layout Mode.");
                    return;
                  }
                  setSortDialogContext(nextContext);
                }}
              >
                <option value={SORT_CONTEXT_CURRENT_LAYOUT}>
                  Current Layout ("{activeLayoutName || layout?.name || "..."}")
                </option>
                {currentTableOccurrence ? (
                  <option value={SORT_CONTEXT_CURRENT_TABLE}>
                    Current Table ("{currentTableOccurrence}")
                  </option>
                ) : null}
                <optgroup label="Related Tables">
                  {sortDialogRelatedTableOccurrences.length > 0 ? (
                    sortDialogRelatedTableOccurrences.map((tableOccurrence) => (
                      <option key={`browse-sort-related-${tableOccurrence}`} value={tableOccurrence}>
                        {tableOccurrence}
                      </option>
                    ))
                  ) : (
                    <option value="__related_none__" disabled>
                      &lt;none&gt;
                    </option>
                  )}
                </optgroup>
                <optgroup label="Unrelated Tables">
                  {sortDialogUnrelatedTableOccurrences.length > 0 ? (
                    sortDialogUnrelatedTableOccurrences.map((tableOccurrence) => (
                      <option key={`browse-sort-unrelated-${tableOccurrence}`} value={tableOccurrence}>
                        {tableOccurrence}
                      </option>
                    ))
                  ) : (
                    <option value="__unrelated_none__" disabled>
                      &lt;none&gt;
                    </option>
                  )}
                </optgroup>
                <option value={SORT_CONTEXT_MANAGE_DATABASE}>Manage Database...</option>
              </select>
            </label>
            {sortDialogFieldsError ? <p className="error">{sortDialogFieldsError}</p> : null}
            <div className="portal-sort-grid">
              <div className="portal-sort-column">
                <span className="portal-sort-label">Fields</span>
                <div className="portal-sort-list">
                  {sortDialogFieldsLoading ? <div className="portal-sort-empty">Loading fields...</div> : null}
                  {sortDialogFieldNames.map((fieldName) => {
                    const selected = fieldName === sortDialogAvailableField;
                    return (
                      <button
                        key={`browse-sort-field-${fieldName}`}
                        type="button"
                        className={selected ? "active" : ""}
                        onClick={() => setSortDialogAvailableField(fieldName)}
                        onDoubleClick={moveSortDialogField}
                      >
                        {fieldName}
                      </button>
                    );
                  })}
                  {!sortDialogFieldsLoading && sortDialogFieldNames.length === 0 ? (
                    <div className="portal-sort-empty">No fields available.</div>
                  ) : null}
                </div>
              </div>
              <div className="portal-sort-controls">
                <button type="button" onClick={clearSortDialogRules} disabled={sortDialogRulesDraft.length === 0}>
                  Clear All
                </button>
                <button type="button" onClick={moveSortDialogField} disabled={!sortDialogAvailableField.trim()}>
                  Move
                </button>
              </div>
              <div className="portal-sort-column">
                <span className="portal-sort-label">Sort Order</span>
                <div className="portal-sort-list">
                  {sortDialogRulesDraft.map((rule, index) => {
                    const selected = index === sortDialogSelectedIndex;
                    const valueListName =
                      rule.mode === "valueList" ? inferValueListNameForSortEntry(rule) || "<unknown>" : "";
                    return (
                      <button
                        key={`browse-sort-order-${rule.field}-${index}`}
                        type="button"
                        className={selected ? "active" : ""}
                        onClick={() => selectSortDialogRule(index)}
                      >
                        <span>{rule.field}</span>
                        <span>
                          {rule.mode === "valueList"
                            ? `Custom (${valueListName})`
                            : rule.direction === "asc"
                              ? "Ascending"
                              : "Descending"}
                        </span>
                      </button>
                    );
                  })}
                  {sortDialogRulesDraft.length === 0 ? (
                    <div className="portal-sort-empty">No sort fields.</div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="portal-sort-order-controls">
              <label>
                <input
                  type="radio"
                  name="browse-sort-order"
                  checked={sortDialogDraftDirection === "asc" && sortDialogDraftMode === "standard"}
                  onChange={() => {
                    updateSortDialogMode("standard");
                    updateSortDialogDirection("asc");
                  }}
                />
                Ascending order
              </label>
              <label>
                <input
                  type="radio"
                  name="browse-sort-order"
                  checked={sortDialogDraftDirection === "desc" && sortDialogDraftMode === "standard"}
                  onChange={() => {
                    updateSortDialogMode("standard");
                    updateSortDialogDirection("desc");
                  }}
                />
                Descending order
              </label>
              <label>
                <input
                  type="radio"
                  name="browse-sort-order"
                  checked={sortDialogDraftMode === "valueList"}
                  onChange={() => updateSortDialogMode("valueList")}
                />
                Custom order based on value list
              </label>
              <div className="portal-sort-value-list-row">
                <select
                  value={sortDialogDraftValueListName}
                  onChange={(event) => updateSortDialogValueListName(event.currentTarget.value)}
                  disabled={sortDialogDraftMode !== "valueList"}
                >
                  <option value="">{sortDialogValueListNames.length > 0 ? "Select value list" : "<unknown>"}</option>
                  {sortDialogValueListNames.map((valueListName) => (
                    <option key={`browse-sort-vl-${valueListName}`} value={valueListName}>
                      {valueListName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="portal-sort-advanced browse-sort-advanced">
              <label>
                <input
                  type="checkbox"
                  checked={sortDialogDraftReorderBySummary}
                  onChange={(event) => setSortDialogDraftReorderBySummary(event.currentTarget.checked)}
                />
                Reorder based on summary field
              </label>
              <input
                value={sortDialogDraftSummaryField}
                onChange={(event) => setSortDialogDraftSummaryField(event.currentTarget.value)}
                placeholder="Summary field"
                disabled={!sortDialogDraftReorderBySummary}
              />
              <label>
                <input
                  type="checkbox"
                  checked={sortDialogDraftOverrideLanguage}
                  onChange={(event) => setSortDialogDraftOverrideLanguage(event.currentTarget.checked)}
                />
                Override field&apos;s language for sort
              </label>
              <input
                value={sortDialogDraftLanguage}
                onChange={(event) => setSortDialogDraftLanguage(event.currentTarget.value)}
                placeholder="English"
                disabled={!sortDialogDraftOverrideLanguage}
              />
            </div>
            <label className="browse-sort-keep">
              <input
                type="checkbox"
                checked={sortDialogDraftKeepRecordsSorted}
                onChange={(event) => setSortDialogDraftKeepRecordsSorted(event.currentTarget.checked)}
              />
              Keep records in sorted order
            </label>
            <div className="button-setup-actions browse-sort-actions">
              <button
                type="button"
                onClick={() => {
                  setTableSort([]);
                  setStatus("Unsorted");
                  closeSortDialog();
                }}
                disabled={tableSort.length === 0}
              >
                Unsort
              </button>
              <button type="button" onClick={closeSortDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={applySortDialog}
                disabled={sortDialogRulesDraft.length === 0}
              >
                Sort
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {quickChartOpen && quickChartConfig ? (
        <div
          className="button-setup-backdrop browse-chart-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeQuickChartDialog();
            }
          }}
        >
          <div className="browse-chart-modal" role="dialog" aria-modal="true" aria-label="Chart Setup">
            <h3>Chart By {columnMenu?.field || quickChartConfig.series[0]?.field || "Field"}</h3>
            <div className="browse-chart-body">
              <section className="browse-chart-preview-pane">
                {quickChartPreview ? (
                  <QuickChartRenderer config={quickChartConfig} preview={quickChartPreview} />
                ) : (
                  <div className="runtime-empty">No chart data available.</div>
                )}
                {quickChartPreview?.truncated ? (
                  <p className="browse-chart-preview-note">
                    Preview limited to{" "}
                    {quickChartPreview.kind === "scatter"
                      ? `${QUICK_CHART_MAX_POINTS} plotted points`
                      : `${QUICK_CHART_MAX_CATEGORIES} categories`}
                    .
                  </p>
                ) : null}
                {(quickChartConfig.type === "pie" || quickChartConfig.type === "donut") &&
                quickChartConfig.series.length > 1 ? (
                  <p className="browse-chart-preview-note">
                    Pie and Donut charts use the first Y series.
                  </p>
                ) : null}
              </section>

              <aside className="browse-chart-inspector">
                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    value={quickChartConfig.title}
                    onChange={(event) =>
                      patchQuickChartConfig((previous) => ({
                        ...previous,
                        title: event.currentTarget.value
                      }))
                    }
                  />
                </label>

                <label>
                  <span>Type</span>
                  <select
                    value={quickChartConfig.type}
                    onChange={(event) => {
                      const nextType = event.currentTarget.value as FileMakerChartType;
                      patchQuickChartConfig((previous) => ({
                        ...previous,
                        type: nextType
                      }));
                    }}
                  >
                    {FILEMAKER_CHART_TYPE_OPTIONS.map((option) => (
                      <option key={`browse-chart-type-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="browse-chart-axis-grid">
                  <label>
                    <span>X-Axis Data</span>
                    <select
                      value={quickChartConfig.xAxisField}
                      onChange={(event) => {
                        const nextField = event.currentTarget.value;
                        patchQuickChartConfig((previous) => ({
                          ...previous,
                          xAxisField: nextField,
                          labelField: previous.labelField || nextField
                        }));
                      }}
                    >
                      {quickChartFieldOptions.map((fieldName) => (
                        <option key={`browse-chart-x-field-${fieldName}`} value={fieldName}>
                          {fieldName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>X-Axis Title</span>
                    <input
                      type="text"
                      value={quickChartConfig.xAxisTitle}
                      onChange={(event) =>
                        patchQuickChartConfig((previous) => ({
                          ...previous,
                          xAxisTitle: event.currentTarget.value
                        }))
                      }
                    />
                  </label>
                </div>

                <label>
                  <span>Y-Axis Title</span>
                  <input
                    type="text"
                    value={quickChartConfig.yAxisTitle}
                    onChange={(event) =>
                      patchQuickChartConfig((previous) => ({
                        ...previous,
                        yAxisTitle: event.currentTarget.value
                      }))
                    }
                  />
                </label>

                {quickChartConfig.type === "scatter" || quickChartConfig.type === "bubble" ? (
                  <div className="browse-chart-axis-grid">
                    <label>
                      <span>Data Label Field</span>
                      <select
                        value={quickChartConfig.labelField}
                        onChange={(event) =>
                          patchQuickChartConfig((previous) => ({
                            ...previous,
                            labelField: event.currentTarget.value
                          }))
                        }
                      >
                        {quickChartFieldOptions.map((fieldName) => (
                          <option key={`browse-chart-label-field-${fieldName}`} value={fieldName}>
                            {fieldName}
                          </option>
                        ))}
                      </select>
                    </label>

                    {quickChartConfig.type === "bubble" ? (
                      <label>
                        <span>Bubble Size Field</span>
                        <select
                          value={quickChartConfig.bubbleRadiusField}
                          onChange={(event) =>
                            patchQuickChartConfig((previous) => ({
                              ...previous,
                              bubbleRadiusField: event.currentTarget.value
                            }))
                          }
                        >
                          {quickChartFieldOptions.map((fieldName) => (
                            <option key={`browse-chart-radius-field-${fieldName}`} value={fieldName}>
                              {fieldName}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <label className="browse-chart-checkbox">
                  <input
                    type="checkbox"
                    checked={quickChartConfig.showLegend}
                    onChange={(event) =>
                      patchQuickChartConfig((previous) => ({
                        ...previous,
                        showLegend: event.currentTarget.checked
                      }))
                    }
                  />
                  Show Legend
                </label>

                <div className="browse-chart-series-panel">
                  <div className="browse-chart-series-header">
                    <span>Y Series</span>
                    <button
                      type="button"
                      onClick={addQuickChartSeries}
                      disabled={
                        quickChartFieldOptions.length === 0 ||
                        quickChartConfig.type === "pie" ||
                        quickChartConfig.type === "donut"
                      }
                    >
                      Add Y Series
                    </button>
                  </div>
                  <div className="browse-chart-series-list">
                    {quickChartConfig.series.map((series) => (
                      <div key={series.id} className="browse-chart-series-row">
                        <input
                          type="text"
                          value={series.name}
                          aria-label="Series name"
                          onChange={(event) =>
                            updateQuickChartSeries(series.id, (previous) => ({
                              ...previous,
                              name: event.currentTarget.value
                            }))
                          }
                        />
                        <select
                          value={series.field}
                          aria-label="Series field"
                          onChange={(event) => {
                            const nextField = event.currentTarget.value;
                            updateQuickChartSeries(series.id, (previous) => ({
                              ...previous,
                              field: nextField,
                              summary:
                                chartIsCategoryType(quickChartConfig.type) &&
                                previous.summary !== "count" &&
                                previous.summary !== "fractionOfTotal"
                                  ? defaultChartSummaryForField(nextField)
                                  : previous.summary
                            }));
                          }}
                        >
                          {quickChartFieldOptions.map((fieldName) => (
                            <option key={`browse-chart-series-field-${series.id}-${fieldName}`} value={fieldName}>
                              {fieldName}
                            </option>
                          ))}
                        </select>
                        <select
                          value={series.summary}
                          aria-label="Series summary"
                          disabled={!chartIsCategoryType(quickChartConfig.type)}
                          onChange={(event) => {
                            const nextSummary = event.currentTarget.value as FileMakerChartSummaryType;
                            updateQuickChartSeries(series.id, (previous) => ({
                              ...previous,
                              summary: nextSummary
                            }));
                          }}
                        >
                          {FILEMAKER_CHART_SUMMARY_OPTIONS.map((option) => (
                            <option key={`browse-chart-series-summary-${series.id}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="color"
                          value={series.color}
                          aria-label="Series color"
                          onChange={(event) =>
                            updateQuickChartSeries(series.id, (previous) => ({
                              ...previous,
                              color: event.currentTarget.value
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeQuickChartSeries(series.id)}
                          disabled={quickChartConfig.series.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>

            <div className="button-setup-actions browse-chart-actions">
              <button type="button" onClick={closeQuickChartDialog}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void saveQuickChartAsLayout()}>
                Save as Layout...
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus(`Chart preview ready (${chartTypeLabel(quickChartConfig.type)})`);
                  closeQuickChartDialog();
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="notice">
        {status}
        {layout ? (
          <span>
            {" "}
            | Table: {layout.defaultTableOccurrence} |{" "}
            {isFindMode
              ? `Find Request 1 of ${displayedRecordCount}`
              : `Record ${records.length ? index + 1 : 0} of ${records.length}`}
          </span>
        ) : null}
        {source === "mock" && !fileMakerConnectionFailed ? <span> | Using local mock data</span> : null}
        {fileMakerConnectionFailed ? (
          <span className="error"> | FileMaker connection failed (not mock mode)</span>
        ) : null}
        {fileMakerConnectionFailed && connectionFailureDetail ? (
          <span className="error"> | Connection detail: {connectionFailureDetail}</span>
        ) : null}
        {!fileMakerConnectionFailed &&
        !isFindMode &&
        records.length > 0 &&
        currentRecordFieldNames.length > 0 &&
        boundFieldNames.length === 0 ? (
          <span className="error"> | No field components are bound to FileMaker fields</span>
        ) : null}
        {!fileMakerConnectionFailed &&
        !isFindMode &&
        records.length > 0 &&
        currentRecordFieldNames.length > 0 &&
        boundFieldNames.length > 0 &&
        !hasBoundFieldMatch ? (
          <span className="error">
            {" "}
            | Bound fields do not match data fields. Example fields:{" "}
            {currentRecordFieldNames.slice(0, 3).join(", ")}
          </span>
        ) : null}
        {!fileMakerConnectionFailed && error ? <span className="error"> | {error}</span> : null}
        {!fileMakerConnectionFailed && layoutsError ? <span className="error"> | Layout list failed: {layoutsError}</span> : null}
        {!fileMakerConnectionFailed && valueListsError ? <span className="error"> | Value lists failed: {valueListsError}</span> : null}
        {!valueListsError ? <span> | Value lists source: {valueListsSource}</span> : null}
        {!fileMakerConnectionFailed && scriptsError ? <span className="error"> | Scripts failed: {scriptsError}</span> : null}
        {!scriptsError ? <span> | Scripts source: {scriptsSource}</span> : null}
        {omittedRecordIds.length > 0 ? <span> | Omitted: {omittedRecordIds.length}</span> : null}
        {showingOmittedOnly ? <span> | Showing omitted only</span> : null}
      </div>

      {viewMode === "form" ? (
        <div className="runtime-canvas-wrap" ref={runtimeCanvasWrapRef}>
          <div
            className={`runtime-canvas ${layoutRuntimeClass}`}
            style={{
              width: runtimeCanvasSize.width,
              height: runtimeCanvasSize.height,
              ...browseZoomStyle
            }}
          >
            {sortedComponents.map((component) => {
              const runtimePosition = runtimeComponentFrames[component.id] ?? {
                x: component.position.x,
                y: component.position.y,
                width: component.position.width,
                height: component.position.height
              };
              const outsideCanvas =
                runtimePosition.x + runtimePosition.width <= 0 ||
                runtimePosition.y + runtimePosition.height <= 0 ||
                runtimePosition.x >= runtimeCanvasSize.width ||
                runtimePosition.y >= runtimeCanvasSize.height;
              if (outsideCanvas) {
                return null;
              }
              const fieldName = component.binding?.field;
              const boundFieldName = bindingFieldKey(
                fieldName,
                component.binding?.tableOccurrence,
                layout?.defaultTableOccurrence
              );
              const resolvedLabel = resolveMergeText(component.props.label, currentRecord);
              const visibleLabel = (resolvedLabel || component.props.label || "").trim();
              const fieldLabel = visibleLabel || fieldName || "";
              const controlType = component.props.controlType ?? "text";
              const currentValue = boundFieldName
                ? mergeFieldValue(currentRecord, boundFieldName, component.binding?.tableOccurrence)
                : undefined;
              const currentDisplayValue = boundFieldName
                ? resolveDisplayValueForField(boundFieldName, currentValue)
                : String(currentValue ?? "");
              const valueListOptions = boundFieldName
                ? resolveValueListOptionsForField(boundFieldName, currentValue)
                : [];
              const popupSettings: PopupMenuSettings = {
                includeArrow: component.props.valueListIncludeArrow !== false,
                allowOtherValues: Boolean(component.props.valueListAllowOtherValues),
                allowEditing: Boolean(component.props.valueListAllowEditing),
                overrideFormatting: Boolean(component.props.valueListOverrideFormatting)
              };
              const dateSettings: DateControlSettings = {
                includeIcon: component.props.calendarIncludeIcon !== false,
                autoCompleteExisting: Boolean(component.props.dateAutoCompleteExisting)
              };
              const dateValueListId = popupMenuListId(boundFieldName || fieldName || component.id, `${component.id}-date`);
              const dateExistingOptions =
                controlType === "date" && dateSettings.autoCompleteExisting && boundFieldName
                  ? resolveExistingValuesForField(boundFieldName, currentValue)
                  : [];
              const checkboxTokens = controlType === "checkbox" ? parseMultiSelectTokens(currentValue) : [];
              const checkboxTokenSet = new Set(checkboxTokens.map((entry) => entry.toLowerCase()));
              const checkboxOptions =
                controlType === "checkbox"
                  ? dedupeCaseInsensitiveStrings([...valueListOptions, ...checkboxTokens])
                  : valueListOptions;
              const checkboxBaseOptionSet = new Set(valueListOptions.map((entry) => entry.toLowerCase()));
              const checkboxOtherTokenText =
                controlType === "checkbox"
                  ? checkboxTokens
                      .filter((entry) => !checkboxBaseOptionSet.has(entry.toLowerCase()))
                      .join(", ")
                  : "";
              const saveState = boundFieldName
                ? fieldSaveStatus[fieldSaveKey(currentRecord?.recordId, boundFieldName)]
                : undefined;
              const placement = component.props.labelPlacement ?? "none";
              const onClickAction = component.events?.onClick;
              const scriptName = onClickAction?.script;
              const objectLabel =
                resolvedLabel ||
                component.props.label ||
                fieldName ||
                component.type;
              const hasMergeLabelToken = /<<\s*[^>]+\s*>>/.test(component.props.label ?? "");
              const isMergeButton =
                hasMergeLabelToken || scriptName === "Go to Entry Field";
              const isIconOnlyButton =
                ((resolvedLabel || component.props.label || "").trim() === "") && component.type === "button";
              const panelType = component.props.panelType ?? "tab";
              const panelTabLabelsRaw =
                component.props.panelTabLabels && component.props.panelTabLabels.length > 0
                  ? component.props.panelTabLabels
                  : panelType === "slide"
                    ? ["Slide 1", "Slide 2", "Slide 3"]
                    : ["Tab 1", "Tab 2"];
              const panelTabLabels = panelTabLabelsRaw.slice(0, 6);
              const panelDefaultFrontTab = (component.props.panelDefaultFrontTab ?? "").trim().toLowerCase();
              const panelActiveIndex = Math.max(
                0,
                panelTabLabels.findIndex((tabLabel) => tabLabel.trim().toLowerCase() === panelDefaultFrontTab)
              );
              const panelTabJustification = component.props.panelTabJustification ?? "left";
              const panelTabWidthMode = component.props.panelTabWidthMode ?? "label";
              const panelTabFixedWidth = Math.max(40, Math.round(component.props.panelFixedTabWidth ?? 120));
              const panelShowNavigationDots =
                component.props.panelShowNavigationDots ?? component.props.panelShowNavigation ?? true;
              const panelNavigationDotSize = Math.max(4, Math.min(36, Math.round(component.props.panelNavigationDotSize ?? 9)));
              const resolvedFieldType = resolveFieldType(boundFieldName || fieldName, fieldTypeByName);
              const containerLikeField = isContainerType(resolvedFieldType) || isContainerLikeField(component);
              const containerRawUrl = containerSourceFromValue(currentValue);
              const containerAssetUrl = containerRawUrl ? containerProxySrc(containerRawUrl, currentWorkspaceId) : "";
              const containerInteractive =
                component.props.containerOptimizeFor === "interactive" &&
                looksLikeInteractiveContainer(containerRawUrl);
              const containerImageStyle = {
                objectFit: containerObjectFit(component),
                objectPosition: containerObjectPosition(component)
              };
              const containerStateKey = `${currentRecord?.recordId ?? "no-record"}::${component.id}`;
              const containerFailed = Boolean(containerLoadFailed[containerStateKey]);
              const findHint = findModeFieldHint(boundFieldName || fieldName, fieldLabel);
              const objectTextStyle = componentTextStyle(component);
              const portalTableOccurrence =
                component.type === "portal" ? (component.binding?.tableOccurrence ?? "").trim() : "";
              const portalName = component.type === "portal" ? (component.props.label ?? "").trim() : "";
              const portalRows =
                component.type === "portal" ? resolvePortalRowsForComponent(currentRecord, component) : [];
              const configuredPortalFields =
                component.type === "portal" && Array.isArray(component.props.portalRowFields)
                  ? component.props.portalRowFields
                      .map((entry) => String(entry ?? "").trim())
                      .filter((entry) => entry.length > 0)
                  : [];
              const inferredPortalFields =
                component.type === "portal" && portalRows.length > 0
                  ? dedupeCaseInsensitiveStrings(
                      Object.keys(portalRows[0] ?? {})
                        .map((entry) => String(entry ?? "").trim())
                        .filter((entry) => entry.length > 0)
                        .map((entry) => (entry.includes("::") ? (entry.split("::").pop() ?? entry) : entry))
                    )
                  : [];
              const portalFields =
                dedupeCaseInsensitiveStrings(
                  configuredPortalFields.length > 0
                    ? [...configuredPortalFields, ...inferredPortalFields]
                    : inferredPortalFields
                );
              const portalVisibleRowCount =
                component.type === "portal"
                  ? Math.max(
                      1,
                      Math.min(
                        100,
                        Math.round(
                          Number(
                            component.props.repetitionsTo ??
                              component.props.portalInitialRow ??
                              (component.props.portalAllowVerticalScrolling ? 6 : 3)
                          )
                        )
                      )
                    )
                  : 0;
              const visiblePortalRows = component.type === "portal" ? portalRows.slice(0, portalVisibleRowCount) : [];

              if (isFindMode) {
                if (component.type === "label" && hasMergeLabelToken) {
                  return null;
                }
                if (component.type === "button" && isMergeButton) {
                  return null;
                }
              }

              return (
                <div
                  key={component.id}
                  className={componentClasses(component)}
                  style={{
                    ...runtimeThemeCssVars(component.props.styleTheme, component.props.styleName),
                    left: runtimePosition.x,
                    top: runtimePosition.y,
                    width: runtimePosition.width,
                    height: runtimePosition.height,
                    zIndex: component.position.z
                  }}
                  title={component.props.tooltip || undefined}
                >
                  {component.type === "label" ? (
                    onClickAction && visibleLabel ? (
                      <button
                        type="button"
                        className="runtime-label-button"
                        style={objectTextStyle}
                        onClick={() => void runObjectAction(onClickAction, component, objectLabel)}
                      >
                        {visibleLabel}
                      </button>
                    ) : (
                      <div className={`runtime-label-text ${visibleLabel ? "" : "shape"}`} style={objectTextStyle}>
                        {visibleLabel || null}
                      </div>
                    )
                  ) : null}

                  {component.type === "shape" ? (
                    <div
                      className={`runtime-shape runtime-shape-${component.props.shapeType ?? "rectangle"}`}
                      style={shapeRuntimeStyle(component, runtimePosition)}
                    />
                  ) : null}

                  {component.type === "field" ? (
                    <div className={`runtime-field runtime-field-placement-${placement}`}>
                      {placement !== "none" ? (
                        <span
                          className={`runtime-field-static-label ${placement === "top" ? "top" : ""}`}
                          style={objectTextStyle}
                        >
                          {fieldLabel}
                        </span>
                      ) : null}
                      <div className="runtime-field-input-wrap">
                        {containerLikeField ? (
                          <div
                            className={`runtime-container-field ${
                              runtimePosition.height >= 120 ? "large" : "compact"
                            }`}
                            style={
                              component.props.containerPreservePdfTransparency
                                ? { background: "transparent" }
                                : undefined
                            }
                          >
                            <div className="runtime-container-preview">
                              {containerAssetUrl && !containerFailed ? (
                                containerInteractive ? (
                                  <iframe
                                    src={containerAssetUrl}
                                    title={fieldLabel || fieldName || "Container content"}
                                    className="runtime-container-frame"
                                    allow={
                                      component.props.containerStartPlaybackAutomatically
                                        ? "autoplay"
                                        : undefined
                                    }
                                    onContextMenu={
                                      component.props.containerDisablePdfShortcutMenu
                                        ? (event) => event.preventDefault()
                                        : undefined
                                    }
                                  />
                                ) : (
                                  <img
                                    src={containerAssetUrl}
                                    alt={fieldLabel || fieldName || "Container field"}
                                    className="runtime-container-image"
                                    style={containerImageStyle}
                                    onError={() => {
                                      setContainerLoadFailed((previous) => ({
                                        ...previous,
                                        [containerStateKey]: true
                                      }));
                                    }}
                                  />
                                )
                              ) : (
                                <span className="runtime-container-fallback">
                                  {String(currentValue ?? component.props.placeholder ?? fieldName ?? "")}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="runtime-container-hitarea"
                              aria-label={`Container options for ${fieldLabel || fieldName || "field"}`}
                              onClick={(event) =>
                                handleContainerPrimaryClick(event, {
                                  stateKey: containerStateKey,
                                  recordId: currentRecord?.recordId,
                                  fieldName: component.binding?.field ?? boundFieldName ?? "",
                                  rawUrl: containerRawUrl,
                                  label: fieldLabel || fieldName || "Container"
                                })
                              }
                              onContextMenu={(event) =>
                                openContainerMenuAtPointer(event, {
                                  stateKey: containerStateKey,
                                  recordId: currentRecord?.recordId,
                                  fieldName: component.binding?.field ?? boundFieldName ?? "",
                                  rawUrl: containerRawUrl,
                                  label: fieldLabel || fieldName || "Container"
                                })
                              }
                            />
                          </div>
                        ) : controlType === "checkbox" ? (
                          checkboxOptions.length > 1 ? (
                            <div className="runtime-field-checkbox-group">
                              {checkboxOptions.map((option) => {
                                const normalizedOption = option.toLowerCase();
                                const checked = checkboxTokenSet.has(normalizedOption);
                                return (
                                  <label key={`${component.id}-${option}`} className="runtime-field-checkbox-option">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      style={objectTextStyle}
                                      disabled={!boundFieldName || !currentRecord?.recordId}
                                      onChange={(event) => {
                                        if (!boundFieldName) {
                                          return;
                                        }
                                        const nextValues = checkboxOptions.filter((entry) => {
                                          const normalized = entry.toLowerCase();
                                          if (normalized === normalizedOption) {
                                            return event.currentTarget.checked;
                                          }
                                          return checkboxTokenSet.has(normalized);
                                        });
                                        const serialized = nextValues.join("\n");
                                        patchRecordField(index, boundFieldName, serialized, currentRecord?.recordId);
                                      }}
                                      onBlur={(event) => {
                                        if (!boundFieldName) {
                                          return;
                                        }
                                        const nextValues = checkboxOptions.filter((entry) => {
                                          const normalized = entry.toLowerCase();
                                          if (normalized === normalizedOption) {
                                            return event.currentTarget.checked;
                                          }
                                          return checkboxTokenSet.has(normalized);
                                        });
                                        const serialized = nextValues.join("\n");
                                        void saveFieldOnBlur(boundFieldName, serialized, currentRecord?.recordId);
                                      }}
                                    />
                                    <span>{option}</span>
                                  </label>
                                );
                              })}
                              {popupSettings.allowOtherValues ? (
                                <label className="runtime-field-checkbox-other">
                                  <span>Other values</span>
                                  <input
                                    type="text"
                                    value={checkboxOtherTokenText}
                                    placeholder="Comma-separated"
                                    disabled={!boundFieldName || !currentRecord?.recordId}
                                    onChange={(event) => {
                                      if (!boundFieldName) {
                                        return;
                                      }
                                      const extraTokens = parseMultiSelectTokens(event.currentTarget.value);
                                      const checkedKnownValues = checkboxOptions.filter((entry) =>
                                        checkboxTokenSet.has(entry.toLowerCase())
                                      );
                                      const nextValues = dedupeCaseInsensitiveStrings([
                                        ...checkedKnownValues,
                                        ...extraTokens
                                      ]);
                                      patchRecordField(
                                        index,
                                        boundFieldName,
                                        nextValues.join("\n"),
                                        currentRecord?.recordId
                                      );
                                    }}
                                    onBlur={(event) => {
                                      if (!boundFieldName) {
                                        return;
                                      }
                                      const extraTokens = parseMultiSelectTokens(event.currentTarget.value);
                                      const checkedKnownValues = checkboxOptions.filter((entry) =>
                                        checkboxTokenSet.has(entry.toLowerCase())
                                      );
                                      const nextValues = dedupeCaseInsensitiveStrings([
                                        ...checkedKnownValues,
                                        ...extraTokens
                                      ]);
                                      void saveFieldOnBlur(
                                        boundFieldName,
                                        nextValues.join("\n"),
                                        currentRecord?.recordId
                                      );
                                    }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          ) : (
                            <label className="runtime-field-checkbox">
                              <input
                                type="checkbox"
                                checked={
                                  checkboxOptions.length === 1
                                    ? checkboxTokenSet.has(checkboxOptions[0].toLowerCase())
                                    : Boolean(currentValue)
                                }
                                className="runtime-field-control"
                                style={objectTextStyle}
                                disabled={!boundFieldName || !currentRecord?.recordId}
                                onChange={(event) => {
                                  if (!boundFieldName) {
                                    return;
                                  }
                                  const nextValue =
                                    checkboxOptions.length === 1
                                      ? event.currentTarget.checked
                                        ? checkboxOptions[0]
                                        : ""
                                      : event.currentTarget.checked;
                                  patchRecordField(index, boundFieldName, nextValue, currentRecord?.recordId);
                                }}
                                onBlur={(event) => {
                                  if (!boundFieldName) {
                                    return;
                                  }
                                  const nextValue =
                                    checkboxOptions.length === 1
                                      ? event.currentTarget.checked
                                        ? checkboxOptions[0]
                                        : ""
                                      : event.currentTarget.checked;
                                  void saveFieldOnBlur(boundFieldName, nextValue, currentRecord?.recordId);
                                }}
                              />
                              <span>
                                {checkboxOptions.length === 1
                                  ? checkboxOptions[0]
                                  : fieldLabel || fieldName}
                              </span>
                            </label>
                          )
                        ) : controlType === "dropdown" || controlType === "radio" || controlType === "popup" ? (
                          (controlType === "popup" || controlType === "radio") && popupSettings.allowOtherValues ? (
                            <>
                              <input
                                type="text"
                                list={popupMenuListId(boundFieldName || fieldName || component.id, component.id)}
                                value={currentDisplayValue}
                                className={`runtime-field-control runtime-popup-menu ${
                                  popupSettings.includeArrow ? "" : "no-arrow"
                                }`}
                                style={objectTextStyle}
                                placeholder={isFindMode ? findHint : component.props.placeholder}
                                disabled={!boundFieldName || !currentRecord?.recordId}
                                onChange={(event) => {
                                  if (!boundFieldName) {
                                    return;
                                  }
                                  patchRecordField(
                                    index,
                                    boundFieldName,
                                    event.currentTarget.value,
                                    currentRecord?.recordId
                                  );
                                }}
                                onBlur={(event) => {
                                  if (!boundFieldName) {
                                    return;
                                  }
                                  void saveFieldOnBlur(
                                    boundFieldName,
                                    resolveStoredValueForField(boundFieldName, event.currentTarget.value),
                                    currentRecord?.recordId
                                  );
                                }}
                              />
                              <datalist id={popupMenuListId(boundFieldName || fieldName || component.id, component.id)}>
                                {valueListOptions.map((option) => (
                                  <option key={`${component.id}-datalist-${option}`} value={option} />
                                ))}
                              </datalist>
                            </>
                          ) : (
                              <select
                                value={currentDisplayValue}
                                className={`runtime-field-control ${
                                (controlType === "popup" || controlType === "dropdown") &&
                                !popupSettings.includeArrow
                                  ? "runtime-popup-menu no-arrow"
                                  : ""
                              }`}
                              style={objectTextStyle}
                              disabled={!boundFieldName || !currentRecord?.recordId}
                              onChange={(event) => {
                                if (!boundFieldName) {
                                  return;
                                }
                                patchRecordField(
                                  index,
                                  boundFieldName,
                                  event.currentTarget.value,
                                  currentRecord?.recordId
                                );
                              }}
                              onBlur={(event) => {
                                if (!boundFieldName) {
                                  return;
                                }
                                void saveFieldOnBlur(
                                  boundFieldName,
                                  resolveStoredValueForField(boundFieldName, event.currentTarget.value),
                                  currentRecord?.recordId
                                );
                              }}
                            >
                              {isFindMode ? <option value="">{findHint}</option> : null}
                              {!isFindMode && valueListOptions.length > 0 ? null : !isFindMode ? (
                                <option value={currentDisplayValue}>{currentDisplayValue}</option>
                              ) : null}
                              {valueListOptions
                                .filter((option) => !isFindMode || option.trim().length > 0)
                                .map((option) => (
                                <option key={`${component.id}-vl-${option}`} value={option}>
                                  {option}
                                </option>
                                ))}
                            </select>
                          )
                        ) : controlType === "concealed" ? (
                          <input
                            type="password"
                            value={String(currentValue ?? "")}
                            className="runtime-field-control"
                            style={objectTextStyle}
                            placeholder={isFindMode ? findHint : component.props.placeholder}
                            disabled={!boundFieldName || !currentRecord?.recordId}
                            onChange={(event) => {
                              if (!boundFieldName) {
                                return;
                              }
                              patchRecordField(index, boundFieldName, event.currentTarget.value, currentRecord?.recordId);
                            }}
                            onBlur={(event) => {
                              if (!boundFieldName) {
                                return;
                              }
                              void saveFieldOnBlur(boundFieldName, event.currentTarget.value, currentRecord?.recordId);
                            }}
                          />
                        ) : controlType === "date" ? (
                          <>
                            <input
                              type="date"
                              value={String(currentValue ?? "")}
                              className={`runtime-field-control ${dateSettings.includeIcon ? "" : "runtime-date-no-icon"}`}
                              style={objectTextStyle}
                              list={dateSettings.autoCompleteExisting ? dateValueListId : undefined}
                              placeholder={isFindMode ? findHint : component.props.placeholder}
                              disabled={!boundFieldName || !currentRecord?.recordId}
                              onChange={(event) => {
                                if (!boundFieldName) {
                                  return;
                                }
                                patchRecordField(index, boundFieldName, event.currentTarget.value, currentRecord?.recordId);
                              }}
                              onBlur={(event) => {
                                if (!boundFieldName) {
                                  return;
                                }
                                void saveFieldOnBlur(boundFieldName, event.currentTarget.value, currentRecord?.recordId);
                              }}
                            />
                            {dateSettings.autoCompleteExisting && dateExistingOptions.length > 0 ? (
                              <datalist id={dateValueListId}>
                                {dateExistingOptions.map((option) => (
                                  <option key={`${component.id}-date-${option}`} value={option} />
                                ))}
                              </datalist>
                            ) : null}
                          </>
                        ) : (
                          <input
                            type="text"
                            value={String(currentValue ?? "")}
                            className="runtime-field-control"
                            style={objectTextStyle}
                            placeholder={isFindMode ? findHint : component.props.placeholder}
                            disabled={!boundFieldName || !currentRecord?.recordId}
                            onChange={(event) => {
                              if (!boundFieldName) {
                                return;
                              }
                              patchRecordField(index, boundFieldName, event.currentTarget.value, currentRecord?.recordId);
                            }}
                            onBlur={(event) => {
                              if (!boundFieldName) {
                                return;
                              }
                              void saveFieldOnBlur(boundFieldName, event.currentTarget.value, currentRecord?.recordId);
                            }}
                          />
                        )}
                        {saveState ? (
                          <span className={`field-save-indicator field-save-${saveState}`}>
                            {saveStateLabel(saveState)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {component.type === "portal" ? (
                    <div className="runtime-portal-wrap">
                      <div
                        className={`runtime-portal-rows ${
                          component.props.portalUseAlternateRowState ? "alternate-rows" : ""
                        } ${component.props.portalAllowVerticalScrolling === false ? "no-scroll" : ""}`}
                        style={
                          {
                            "--runtime-portal-col-count": Math.max(1, portalFields.length)
                          } as CSSProperties
                        }
                      >
                        {isFindMode ? (
                          <div className="runtime-portal-row runtime-portal-row-placeholder">
                            {portalFields.length > 0 ? (
                              portalFields.map((rowField) => (
                                <span key={`${component.id}-find-${rowField}`} className="runtime-portal-cell">
                                  {findModeFieldHint(`${portalTableOccurrence}::${rowField}`)}
                                </span>
                              ))
                            ) : (
                              <span className="runtime-portal-empty">Find requests ignore related portal rows.</span>
                            )}
                          </div>
                        ) : visiblePortalRows.length > 0 && portalFields.length > 0 ? (
                          visiblePortalRows.map((portalRow, rowIndex) => {
                            const portalRowRecordId = String(portalRow.recordId ?? "").trim();
                            return (
                              <div
                                key={`${component.id}-portal-row-${portalRowRecordId || rowIndex}`}
                                className={`runtime-portal-row ${
                                  component.props.portalUseActiveRowState && rowIndex === 0 ? "active" : ""
                                }`}
                              >
                                {portalFields.map((rowField) => {
                                  const rawPortalValue = portalRowFieldValue(
                                    portalRow,
                                    rowField,
                                    portalTableOccurrence,
                                    portalName
                                  );
                                  const portalFieldToken = portalTableOccurrence
                                    ? `${portalTableOccurrence}::${rowField}`
                                    : rowField;
                                  const displayValue = resolveDisplayValueForField(
                                    portalFieldToken,
                                    rawPortalValue
                                  );
                                  const fallbackValue = mergeDisplayValue(rawPortalValue);
                                  const cellValue = displayValue || fallbackValue;
                                  return (
                                    <label
                                      key={`${component.id}-portal-cell-${portalRowRecordId || rowIndex}-${rowField}`}
                                      className="runtime-portal-cell"
                                    >
                                      <span className="runtime-portal-value">{cellValue || ""}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })
                        ) : (
                          <div className="runtime-portal-empty">No related records.</div>
                        )}
                      </div>
                      <div className="runtime-portal-foot">
                        <span className="runtime-portal-context">
                          {portalTableOccurrence || portalName || "Related Records"}
                        </span>
                        {onClickAction ? (
                          <button
                            type="button"
                            className="runtime-portal-action"
                            onClick={() => void runObjectAction(onClickAction, component, objectLabel)}
                          >
                            {onClickAction.action === "deletePortalRow" ? "Delete Row" : "Run Action"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {component.type === "button" ? (
                    <button
                      type="button"
                      className={`runtime-button-control ${
                        isMergeButton ? "runtime-button-merge" : ""
                      } ${isIconOnlyButton ? "runtime-button-icon-only" : ""}`}
                      style={objectTextStyle}
                      disabled={!onClickAction}
                      onClick={() => void runObjectAction(onClickAction, component, objectLabel)}
                    >
                      {isIconOnlyButton
                        ? ""
                        : resolvedLabel || component.props.label || (onClickAction ? "Run Action" : "")}
                    </button>
                  ) : null}

                  {component.type === "panel" ? (
                    <div className={`runtime-panel-wrap ${panelType === "slide" ? "slide" : "tab"}`}>
                      <div className={`runtime-panel-head justify-${panelTabJustification}`}>
                        {panelTabLabels.map((tabLabel, panelIndex) => (
                          <span
                            key={`${component.id}-runtime-panel-tab-${panelIndex}`}
                            className={`runtime-panel-tab ${panelIndex === panelActiveIndex ? "active" : ""}`}
                            style={
                              panelTabWidthMode === "fixed" && panelType !== "slide"
                                ? { width: panelTabFixedWidth, minWidth: panelTabFixedWidth }
                                : undefined
                            }
                          >
                            {tabLabel}
                          </span>
                        ))}
                      </div>
                      <div className="runtime-panel-body">
                        {panelType === "slide" ? "Slide Control" : "Tab Control"}
                        {panelType === "slide" && panelShowNavigationDots ? (
                          <div className="runtime-panel-dots">
                            {panelTabLabels.map((_, dotIndex) => (
                              <span
                                key={`${component.id}-runtime-panel-dot-${dotIndex}`}
                                className={`runtime-panel-dot ${dotIndex === panelActiveIndex ? "active" : ""}`}
                                style={{
                                  width: panelNavigationDotSize,
                                  height: panelNavigationDotSize
                                }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {component.type === "webViewer" ? (
                    <div className="runtime-webviewer-wrap">
                      {isFindMode && component.props.webViewerDisplayInFindMode !== true ? (
                        <div className="runtime-webviewer-frame runtime-webviewer-disabled">
                          Hidden in Find mode
                        </div>
                      ) : (
                        <iframe
                          title={component.props.label || "Web Viewer"}
                          className="runtime-webviewer-frame"
                          style={component.props.webViewerAllowInteraction === false ? { pointerEvents: "none" } : undefined}
                          src={templateStringWithEncoding(
                            component.props.webViewerUrlTemplate ?? "about:blank",
                            currentRecord as Record<string, unknown>,
                            component.props.webViewerAutoEncodeUrl !== false
                          )}
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "list" ? (
        <div className="runtime-list-wrap">
          {!listRecords.length || !viewFieldNames.length ? (
            <div className="runtime-empty">No records available for list view.</div>
          ) : (
            <div className="runtime-list" style={browseZoomStyle}>
              {listRecords.map((record, rowIndex) => (
                <article
                  key={record.recordId ?? `record-${rowIndex}`}
                  className={`runtime-list-card ${rowIndex === index ? "active" : ""}`}
                  onClick={() => {
                    if (!isFindMode) {
                      setIndex(rowIndex);
                    }
                  }}
                >
                  <div className="runtime-list-card-header">
                    <strong>{isFindMode ? "Find Request" : `Record ${rowIndex + 1}`}</strong>
                    {!isFindMode && record.recordId ? <span>{record.recordId}</span> : null}
                  </div>
                  <div className="runtime-list-grid">
                    {viewFieldNames.map((fieldName) => {
                      const controlType = resolveControlTypeForField(fieldName);
                      const currentValue = record[fieldName];
                      const currentDisplayValue = resolveDisplayValueForField(fieldName, currentValue);
                      const findHint = findModeFieldHint(fieldName);
                      const valueListOptions = resolveValueListOptionsForField(fieldName, currentValue);
                      const popupSettings = resolvePopupSettingsForField(fieldName);
                      const dateSettings = resolveDateSettingsForField(fieldName);
                      const dateValueListId = popupMenuListId(fieldName, `${record.recordId ?? rowIndex}-list-date`);
                      const dateExistingOptions =
                        controlType === "date" && dateSettings.autoCompleteExisting
                          ? resolveExistingValuesForField(fieldName, currentValue)
                          : [];
                      const checkboxTokens = controlType === "checkbox" ? parseMultiSelectTokens(currentValue) : [];
                      const checkboxTokenSet = new Set(checkboxTokens.map((entry) => entry.toLowerCase()));
                      const checkboxOptions =
                        controlType === "checkbox"
                          ? dedupeCaseInsensitiveStrings([...valueListOptions, ...checkboxTokens])
                          : valueListOptions;
                      const checkboxBaseOptionSet = new Set(valueListOptions.map((entry) => entry.toLowerCase()));
                      const checkboxOtherTokenText =
                        controlType === "checkbox"
                          ? checkboxTokens
                              .filter((entry) => !checkboxBaseOptionSet.has(entry.toLowerCase()))
                              .join(", ")
                          : "";
                      const resolvedFieldType = resolveFieldType(fieldName, fieldTypeByName);
                      const containerComponent =
                        fieldComponentByName[normalizedFieldToken(fieldName)] ??
                        fieldComponentByName[fieldName] ??
                        null;
                      const containerField = isContainerFieldForRuntime(
                        fieldName,
                        resolvedFieldType,
                        containerComponent
                      );
                      const containerRawUrl = containerSourceFromValue(currentValue);
                      const containerAssetUrl = containerRawUrl ? containerProxySrc(containerRawUrl, currentWorkspaceId) : "";
                      const containerInteractive =
                        containerComponent?.props.containerOptimizeFor === "interactive" &&
                        looksLikeInteractiveContainer(containerRawUrl);
                      const containerImageStyle = {
                        objectFit: containerObjectFit(containerComponent),
                        objectPosition: containerObjectPosition(containerComponent)
                      };
                      const containerStateKey = `${record.recordId ?? rowIndex}::list::${fieldName}`;
                      const containerFailed = Boolean(containerLoadFailed[containerStateKey]);
                      const saveState = record.recordId
                        ? fieldSaveStatus[fieldSaveKey(record.recordId, fieldName)]
                        : undefined;
                      return (
                        <label key={`${record.recordId ?? rowIndex}-${fieldName}`} className="runtime-list-field">
                          <span>{fieldName}</span>
                          {containerField ? (
                            <div
                              className="runtime-list-container"
                              style={
                                containerComponent?.props.containerPreservePdfTransparency
                                  ? { background: "transparent" }
                                  : undefined
                              }
                            >
                              <div className="runtime-container-preview">
                                {containerAssetUrl && !containerFailed ? (
                                  containerInteractive ? (
                                    <iframe
                                      src={containerAssetUrl}
                                      title={fieldName}
                                      className="runtime-container-frame list"
                                      allow={
                                        containerComponent?.props.containerStartPlaybackAutomatically
                                          ? "autoplay"
                                          : undefined
                                      }
                                      onContextMenu={
                                        containerComponent?.props.containerDisablePdfShortcutMenu
                                          ? (event) => event.preventDefault()
                                          : undefined
                                      }
                                    />
                                  ) : (
                                    <img
                                      src={containerAssetUrl}
                                      alt={fieldName}
                                      className="runtime-container-image list"
                                      style={containerImageStyle}
                                      onError={() => {
                                        setContainerLoadFailed((previous) => ({
                                          ...previous,
                                          [containerStateKey]: true
                                        }));
                                      }}
                                    />
                                  )
                                ) : (
                                  <span className="runtime-container-fallback inline">
                                    {String(currentValue ?? "") || "No container data"}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="runtime-container-hitarea"
                                aria-label={`Container options for ${fieldName}`}
                                onClick={(event) =>
                                  handleContainerPrimaryClick(event, {
                                    stateKey: containerStateKey,
                                    recordId: record.recordId,
                                    fieldName,
                                    rawUrl: containerRawUrl,
                                    label: fieldName
                                  })
                                }
                                onContextMenu={(event) =>
                                  openContainerMenuAtPointer(event, {
                                    stateKey: containerStateKey,
                                    recordId: record.recordId,
                                    fieldName,
                                    rawUrl: containerRawUrl,
                                    label: fieldName
                                  })
                                }
                              />
                            </div>
                          ) : controlType === "checkbox" ? (
                            checkboxOptions.length > 1 ? (
                              <div className="runtime-inline-checkbox-group">
                                {checkboxOptions.map((option) => {
                                  const normalizedOption = option.toLowerCase();
                                  const checked = checkboxTokenSet.has(normalizedOption);
                                  return (
                                    <label key={`${record.recordId ?? rowIndex}-${fieldName}-${option}`}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!record.recordId}
                                        onChange={(event) => {
                                          const nextValues = checkboxOptions.filter((entry) => {
                                            const normalized = entry.toLowerCase();
                                            if (normalized === normalizedOption) {
                                              return event.currentTarget.checked;
                                            }
                                            return checkboxTokenSet.has(normalized);
                                          });
                                          patchRecordField(
                                            rowIndex,
                                            fieldName,
                                            nextValues.join("\n"),
                                            record.recordId
                                          );
                                        }}
                                        onBlur={(event) => {
                                          const nextValues = checkboxOptions.filter((entry) => {
                                            const normalized = entry.toLowerCase();
                                            if (normalized === normalizedOption) {
                                              return event.currentTarget.checked;
                                            }
                                            return checkboxTokenSet.has(normalized);
                                          });
                                          void saveFieldOnBlur(
                                            fieldName,
                                            nextValues.join("\n"),
                                            record.recordId
                                          );
                                        }}
                                      />
                                      <span>{option}</span>
                                    </label>
                                  );
                                })}
                                {popupSettings.allowOtherValues ? (
                                  <label className="runtime-field-checkbox-other">
                                    <span>Other values</span>
                                    <input
                                      type="text"
                                      value={checkboxOtherTokenText}
                                      placeholder="Comma-separated"
                                      disabled={!record.recordId}
                                      onChange={(event) => {
                                        const extraTokens = parseMultiSelectTokens(event.currentTarget.value);
                                        const checkedKnownValues = checkboxOptions.filter((entry) =>
                                          checkboxTokenSet.has(entry.toLowerCase())
                                        );
                                        const nextValues = dedupeCaseInsensitiveStrings([
                                          ...checkedKnownValues,
                                          ...extraTokens
                                        ]);
                                        patchRecordField(
                                          rowIndex,
                                          fieldName,
                                          nextValues.join("\n"),
                                          record.recordId
                                        );
                                      }}
                                      onBlur={(event) => {
                                        const extraTokens = parseMultiSelectTokens(event.currentTarget.value);
                                        const checkedKnownValues = checkboxOptions.filter((entry) =>
                                          checkboxTokenSet.has(entry.toLowerCase())
                                        );
                                        const nextValues = dedupeCaseInsensitiveStrings([
                                          ...checkedKnownValues,
                                          ...extraTokens
                                        ]);
                                        void saveFieldOnBlur(fieldName, nextValues.join("\n"), record.recordId);
                                      }}
                                    />
                                  </label>
                                ) : null}
                              </div>
                            ) : (
                              <input
                                type="checkbox"
                                checked={
                                  checkboxOptions.length === 1
                                    ? checkboxTokenSet.has(checkboxOptions[0].toLowerCase())
                                    : Boolean(currentValue)
                                }
                                disabled={!record.recordId}
                                onChange={(event) =>
                                  patchRecordField(
                                    rowIndex,
                                    fieldName,
                                    checkboxOptions.length === 1
                                      ? event.currentTarget.checked
                                        ? checkboxOptions[0]
                                        : ""
                                      : event.currentTarget.checked,
                                    record.recordId
                                  )
                                }
                                onBlur={(event) =>
                                  void saveFieldOnBlur(
                                    fieldName,
                                    checkboxOptions.length === 1
                                      ? event.currentTarget.checked
                                        ? checkboxOptions[0]
                                        : ""
                                      : event.currentTarget.checked,
                                    record.recordId
                                  )
                                }
                              />
                            )
                          ) : controlType === "dropdown" || controlType === "radio" || controlType === "popup" ? (
                            (controlType === "popup" || controlType === "radio") && popupSettings.allowOtherValues ? (
                              <>
                                <input
                                  type="text"
                                  list={popupMenuListId(fieldName, `${record.recordId ?? rowIndex}-list`)}
                                  value={currentDisplayValue}
                                  className={`runtime-popup-menu ${popupSettings.includeArrow ? "" : "no-arrow"}`}
                                  placeholder={isFindMode ? findHint : undefined}
                                  disabled={!record.recordId}
                                  onChange={(event) =>
                                    patchRecordField(rowIndex, fieldName, event.currentTarget.value, record.recordId)
                                  }
                                  onBlur={(event) =>
                                    void saveFieldOnBlur(
                                      fieldName,
                                      resolveStoredValueForField(fieldName, event.currentTarget.value),
                                      record.recordId
                                    )
                                  }
                                />
                                <datalist id={popupMenuListId(fieldName, `${record.recordId ?? rowIndex}-list`)}>
                                  {valueListOptions.map((option) => (
                                    <option
                                      key={`${record.recordId ?? rowIndex}-${fieldName}-datalist-${option}`}
                                      value={option}
                                    />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              <select
                                value={currentDisplayValue}
                                className={
                                  (controlType === "popup" || controlType === "dropdown") &&
                                  !popupSettings.includeArrow
                                    ? "runtime-popup-menu no-arrow"
                                    : ""
                                }
                                disabled={!record.recordId}
                                onChange={(event) =>
                                  patchRecordField(rowIndex, fieldName, event.currentTarget.value, record.recordId)
                                }
                                onBlur={(event) =>
                                  void saveFieldOnBlur(
                                    fieldName,
                                    resolveStoredValueForField(fieldName, event.currentTarget.value),
                                    record.recordId
                                  )
                                }
                              >
                                {isFindMode ? <option value="">{findHint}</option> : null}
                                {!isFindMode && valueListOptions.length > 0 ? null : !isFindMode ? (
                                  <option value={currentDisplayValue}>{currentDisplayValue}</option>
                                ) : null}
                                {valueListOptions
                                  .filter((option) => !isFindMode || option.trim().length > 0)
                                  .map((option) => (
                                  <option key={`${record.recordId ?? rowIndex}-${fieldName}-${option}`} value={option}>
                                    {option}
                                  </option>
                                  ))}
                              </select>
                            )
                          ) : controlType === "concealed" ? (
                            <input
                              type="password"
                              value={String(currentValue ?? "")}
                              placeholder={isFindMode ? findHint : undefined}
                              disabled={!record.recordId}
                              onChange={(event) =>
                                patchRecordField(rowIndex, fieldName, event.currentTarget.value, record.recordId)
                              }
                              onBlur={(event) =>
                                void saveFieldOnBlur(fieldName, event.currentTarget.value, record.recordId)
                              }
                            />
                          ) : controlType === "date" ? (
                            <>
                              <input
                                type="date"
                                value={String(currentValue ?? "")}
                                className={dateSettings.includeIcon ? undefined : "runtime-date-no-icon"}
                                list={dateSettings.autoCompleteExisting ? dateValueListId : undefined}
                                placeholder={isFindMode ? findHint : undefined}
                                disabled={!record.recordId}
                                onChange={(event) =>
                                  patchRecordField(rowIndex, fieldName, event.currentTarget.value, record.recordId)
                                }
                                onBlur={(event) =>
                                  void saveFieldOnBlur(fieldName, event.currentTarget.value, record.recordId)
                                }
                              />
                              {dateSettings.autoCompleteExisting && dateExistingOptions.length > 0 ? (
                                <datalist id={dateValueListId}>
                                  {dateExistingOptions.map((option) => (
                                    <option key={`${record.recordId ?? rowIndex}-${fieldName}-date-${option}`} value={option} />
                                  ))}
                                </datalist>
                              ) : null}
                            </>
                          ) : (
                            <input
                              type="text"
                              value={String(currentValue ?? "")}
                              placeholder={isFindMode ? findHint : undefined}
                              disabled={!record.recordId}
                              onChange={(event) =>
                                patchRecordField(rowIndex, fieldName, event.currentTarget.value, record.recordId)
                              }
                              onBlur={(event) =>
                                void saveFieldOnBlur(fieldName, event.currentTarget.value, record.recordId)
                              }
                            />
                          )}
                          {!containerField && saveState ? (
                            <span className={`field-save-inline field-save-${saveState}`}>{saveStateLabel(saveState)}</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {viewMode === "table" ? (
        <div className="runtime-table-wrap">
          {(!isFindMode && !records.length) || !tableFieldNames.length ? (
            <div className="runtime-empty">No records available for table view.</div>
          ) : (
            <table
              className={`runtime-table ${tableViewOptions.compactRows ? "compact" : ""} ${
                tableViewOptions.alternatingRows ? "" : "no-alt"
              }`}
              style={browseZoomStyle}
            >
              <thead>
                <tr>
                  {tableViewOptions.showRowNumbers ? <th>#</th> : null}
                  {tableFieldNames.map((fieldName) => {
                    const sortEntry = tableSort.find((entry) => entry.field === fieldName);
                    return (
                      <th key={fieldName} onContextMenu={(event) => openColumnMenu(event, fieldName)}>
                        <div className="runtime-table-header">
                          <span className="runtime-table-header-label">{fieldName}</span>
                          <div className="runtime-table-header-actions">
                            {sortEntry ? (
                              <span className="runtime-table-sort-indicator">
                                {sortEntry.direction === "asc" ? "▲" : "▼"}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className={`runtime-table-column-menu-trigger ${
                                columnMenu?.field === fieldName ? "active" : ""
                              }`}
                              aria-label={`Open ${fieldName} column options`}
                              title="Column options"
                              onClick={(event) => openColumnMenuFromButton(event, fieldName)}
                            >
                              ▾
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let displayRowNumber = 0;
                  return tableRows.map((row) => {
                    if (row.kind === "group") {
                      return (
                        <tr
                          key={row.key}
                          className={`runtime-table-meta-row runtime-table-group-row ${row.variant}`}
                        >
                          <td
                            colSpan={(tableViewOptions.showRowNumbers ? 1 : 0) + tableFieldNames.length}
                            className="runtime-table-group-cell"
                          >
                            {row.label}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "summary") {
                      return (
                        <tr
                          key={row.key}
                          className={`runtime-table-meta-row runtime-table-summary-row ${row.variant}`}
                        >
                          {tableViewOptions.showRowNumbers ? (
                            <td className="runtime-table-summary-label">{row.label}</td>
                          ) : null}
                          {tableFieldNames.map((fieldName) => (
                            <td key={`${row.key}-${fieldName}`} className="runtime-table-summary-value">
                              {row.values[fieldName] ?? ""}
                            </td>
                          ))}
                        </tr>
                      );
                    }

                    displayRowNumber += 1;
                    const record = row.record;
                    return (
                      <tr
                        key={row.key}
                        className={row.originalIndex === index ? "active" : ""}
                        onClick={() => {
                          if (!isFindMode) {
                            setIndex(row.originalIndex);
                          }
                        }}
                      >
                        {tableViewOptions.showRowNumbers ? <td>{displayRowNumber}</td> : null}
                        {tableFieldNames.map((fieldName) => {
                          const controlType = resolveControlTypeForField(fieldName);
                          const currentValue = mergeFieldValue(record, fieldName);
                          const currentDisplayValue = resolveDisplayValueForField(fieldName, currentValue);
                          const findHint = findModeFieldHint(fieldName);
                          const valueListOptions = resolveValueListOptionsForField(fieldName, currentValue);
                          const popupSettings = resolvePopupSettingsForField(fieldName);
                          const dateSettings = resolveDateSettingsForField(fieldName);
                          const dateValueListId = popupMenuListId(fieldName, `${row.key}-table-date`);
                          const dateExistingOptions =
                            controlType === "date" && dateSettings.autoCompleteExisting
                              ? resolveExistingValuesForField(fieldName, currentValue)
                              : [];
                          const checkboxTokens = controlType === "checkbox" ? parseMultiSelectTokens(currentValue) : [];
                          const checkboxTokenSet = new Set(checkboxTokens.map((entry) => entry.toLowerCase()));
                          const checkboxOptions =
                            controlType === "checkbox"
                              ? dedupeCaseInsensitiveStrings([...valueListOptions, ...checkboxTokens])
                              : valueListOptions;
                          const checkboxBaseOptionSet = new Set(valueListOptions.map((entry) => entry.toLowerCase()));
                          const checkboxOtherTokenText =
                            controlType === "checkbox"
                              ? checkboxTokens
                                  .filter((entry) => !checkboxBaseOptionSet.has(entry.toLowerCase()))
                                  .join(", ")
                              : "";
                          const resolvedFieldType = resolveFieldType(fieldName, fieldTypeByName);
                          const containerComponent =
                            fieldComponentByName[normalizedFieldToken(fieldName)] ??
                            fieldComponentByName[fieldName] ??
                            null;
                          const containerField = isContainerFieldForRuntime(
                            fieldName,
                            resolvedFieldType,
                            containerComponent
                          );
                          const containerRawUrl = containerSourceFromValue(currentValue);
                          const containerAssetUrl = containerRawUrl ? containerProxySrc(containerRawUrl, currentWorkspaceId) : "";
                          const containerInteractive =
                            containerComponent?.props.containerOptimizeFor === "interactive" &&
                            looksLikeInteractiveContainer(containerRawUrl);
                          const containerImageStyle = {
                            objectFit: containerObjectFit(containerComponent),
                            objectPosition: containerObjectPosition(containerComponent)
                          };
                          const containerStateKey = `${record.recordId ?? row.originalIndex}::table::${fieldName}`;
                          const containerFailed = Boolean(containerLoadFailed[containerStateKey]);
                          const saveState = record.recordId
                            ? fieldSaveStatus[fieldSaveKey(record.recordId, fieldName)]
                            : undefined;
                          return (
                            <td key={`${row.key}-${fieldName}`}>
                              <div className="runtime-table-cell">
                                {containerField ? (
                                  <div
                                    className="runtime-table-container"
                                    style={
                                      containerComponent?.props.containerPreservePdfTransparency
                                        ? { background: "transparent" }
                                        : undefined
                                    }
                                  >
                                    <div className="runtime-container-preview">
                                      {containerAssetUrl && !containerFailed ? (
                                        containerInteractive ? (
                                          <iframe
                                            src={containerAssetUrl}
                                            title={fieldName}
                                            className="runtime-container-frame table"
                                            allow={
                                              containerComponent?.props.containerStartPlaybackAutomatically
                                                ? "autoplay"
                                                : undefined
                                            }
                                            onContextMenu={
                                              containerComponent?.props.containerDisablePdfShortcutMenu
                                                ? (event) => event.preventDefault()
                                                : undefined
                                            }
                                          />
                                        ) : (
                                          <img
                                            src={containerAssetUrl}
                                            alt={fieldName}
                                            className="runtime-container-image table"
                                            style={containerImageStyle}
                                            onError={() => {
                                              setContainerLoadFailed((previous) => ({
                                                ...previous,
                                                [containerStateKey]: true
                                              }));
                                            }}
                                          />
                                        )
                                      ) : (
                                        <span className="runtime-container-fallback inline">
                                          {String(currentValue ?? "") || "No container data"}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className="runtime-container-hitarea"
                                      aria-label={`Container options for ${fieldName}`}
                                      onClick={(event) =>
                                        handleContainerPrimaryClick(event, {
                                          stateKey: containerStateKey,
                                          recordId: record.recordId,
                                          fieldName,
                                          rawUrl: containerRawUrl,
                                          label: fieldName
                                        })
                                      }
                                      onContextMenu={(event) =>
                                        openContainerMenuAtPointer(event, {
                                          stateKey: containerStateKey,
                                          recordId: record.recordId,
                                          fieldName,
                                          rawUrl: containerRawUrl,
                                          label: fieldName
                                        })
                                      }
                                    />
                                  </div>
                                ) : controlType === "checkbox" ? (
                                  checkboxOptions.length > 1 ? (
                                    <div className="runtime-inline-checkbox-group">
                                      {checkboxOptions.map((option) => {
                                        const normalizedOption = option.toLowerCase();
                                        const checked = checkboxTokenSet.has(normalizedOption);
                                        return (
                                          <label key={`${row.key}-${fieldName}-${option}`}>
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              disabled={!record.recordId}
                                              onChange={(event) => {
                                                const nextValues = checkboxOptions.filter((entry) => {
                                                  const normalized = entry.toLowerCase();
                                                  if (normalized === normalizedOption) {
                                                    return event.currentTarget.checked;
                                                  }
                                                  return checkboxTokenSet.has(normalized);
                                                });
                                                patchRecordField(
                                                  row.originalIndex,
                                                  fieldName,
                                                  nextValues.join("\n"),
                                                  record.recordId
                                                );
                                              }}
                                              onBlur={(event) => {
                                                const nextValues = checkboxOptions.filter((entry) => {
                                                  const normalized = entry.toLowerCase();
                                                  if (normalized === normalizedOption) {
                                                    return event.currentTarget.checked;
                                                  }
                                                  return checkboxTokenSet.has(normalized);
                                                });
                                                void saveFieldOnBlur(
                                                  fieldName,
                                                  nextValues.join("\n"),
                                                  record.recordId
                                                );
                                              }}
                                            />
                                            <span>{option}</span>
                                          </label>
                                        );
                                      })}
                                      {popupSettings.allowOtherValues ? (
                                        <label className="runtime-field-checkbox-other">
                                          <span>Other values</span>
                                          <input
                                            type="text"
                                            value={checkboxOtherTokenText}
                                            placeholder="Comma-separated"
                                            disabled={!record.recordId}
                                            onChange={(event) => {
                                              const extraTokens = parseMultiSelectTokens(event.currentTarget.value);
                                              const checkedKnownValues = checkboxOptions.filter((entry) =>
                                                checkboxTokenSet.has(entry.toLowerCase())
                                              );
                                              const nextValues = dedupeCaseInsensitiveStrings([
                                                ...checkedKnownValues,
                                                ...extraTokens
                                              ]);
                                              patchRecordField(
                                                row.originalIndex,
                                                fieldName,
                                                nextValues.join("\n"),
                                                record.recordId
                                              );
                                            }}
                                            onBlur={(event) => {
                                              const extraTokens = parseMultiSelectTokens(event.currentTarget.value);
                                              const checkedKnownValues = checkboxOptions.filter((entry) =>
                                                checkboxTokenSet.has(entry.toLowerCase())
                                              );
                                              const nextValues = dedupeCaseInsensitiveStrings([
                                                ...checkedKnownValues,
                                                ...extraTokens
                                              ]);
                                              void saveFieldOnBlur(fieldName, nextValues.join("\n"), record.recordId);
                                            }}
                                          />
                                        </label>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={
                                        checkboxOptions.length === 1
                                          ? checkboxTokenSet.has(checkboxOptions[0].toLowerCase())
                                          : Boolean(currentValue)
                                      }
                                      disabled={!record.recordId}
                                      onChange={(event) =>
                                        patchRecordField(
                                          row.originalIndex,
                                          fieldName,
                                          checkboxOptions.length === 1
                                            ? event.currentTarget.checked
                                              ? checkboxOptions[0]
                                              : ""
                                            : event.currentTarget.checked,
                                          record.recordId
                                        )
                                      }
                                      onBlur={(event) =>
                                        void saveFieldOnBlur(
                                          fieldName,
                                          checkboxOptions.length === 1
                                            ? event.currentTarget.checked
                                              ? checkboxOptions[0]
                                              : ""
                                            : event.currentTarget.checked,
                                          record.recordId
                                        )
                                      }
                                    />
                                  )
                                ) : controlType === "dropdown" || controlType === "radio" || controlType === "popup" ? (
                                  (controlType === "popup" || controlType === "radio") && popupSettings.allowOtherValues ? (
                                    <>
                                      <input
                                        type="text"
                                        list={popupMenuListId(fieldName, `${row.key}-table`)}
                                        value={currentDisplayValue}
                                        className={`runtime-popup-menu ${popupSettings.includeArrow ? "" : "no-arrow"}`}
                                        placeholder={isFindMode ? findHint : undefined}
                                        disabled={!record.recordId}
                                        onChange={(event) =>
                                          patchRecordField(
                                            row.originalIndex,
                                            fieldName,
                                            event.currentTarget.value,
                                            record.recordId
                                          )
                                        }
                                        onBlur={(event) =>
                                          void saveFieldOnBlur(
                                            fieldName,
                                            resolveStoredValueForField(fieldName, event.currentTarget.value),
                                            record.recordId
                                          )
                                        }
                                      />
                                      <datalist id={popupMenuListId(fieldName, `${row.key}-table`)}>
                                        {valueListOptions.map((option) => (
                                          <option key={`${row.key}-${fieldName}-datalist-${option}`} value={option} />
                                        ))}
                                      </datalist>
                                    </>
                                  ) : (
                                    <select
                                      value={currentDisplayValue}
                                      className={
                                        (controlType === "popup" || controlType === "dropdown") &&
                                        !popupSettings.includeArrow
                                          ? "runtime-popup-menu no-arrow"
                                          : ""
                                      }
                                      disabled={!record.recordId}
                                      onChange={(event) =>
                                        patchRecordField(
                                          row.originalIndex,
                                          fieldName,
                                          event.currentTarget.value,
                                          record.recordId
                                        )
                                      }
                                      onBlur={(event) =>
                                        void saveFieldOnBlur(
                                          fieldName,
                                          resolveStoredValueForField(fieldName, event.currentTarget.value),
                                          record.recordId
                                        )
                                      }
                                    >
                                      {isFindMode ? <option value="">{findHint}</option> : null}
                                      {!isFindMode && valueListOptions.length > 0 ? null : !isFindMode ? (
                                        <option value={currentDisplayValue}>{currentDisplayValue}</option>
                                      ) : null}
                                      {valueListOptions
                                        .filter((option) => !isFindMode || option.trim().length > 0)
                                        .map((option) => (
                                        <option key={`${row.key}-${fieldName}-${option}`} value={option}>
                                          {option}
                                        </option>
                                        ))}
                                    </select>
                                  )
                                ) : controlType === "concealed" ? (
                                  <input
                                    type="password"
                                    value={String(currentValue ?? "")}
                                    placeholder={isFindMode ? findHint : undefined}
                                    disabled={!record.recordId}
                                    onChange={(event) =>
                                      patchRecordField(
                                        row.originalIndex,
                                        fieldName,
                                        event.currentTarget.value,
                                        record.recordId
                                      )
                                    }
                                    onBlur={(event) =>
                                      void saveFieldOnBlur(fieldName, event.currentTarget.value, record.recordId)
                                    }
                                  />
                                ) : controlType === "date" ? (
                                  <>
                                    <input
                                      type="date"
                                      value={String(currentValue ?? "")}
                                      className={dateSettings.includeIcon ? undefined : "runtime-date-no-icon"}
                                      list={dateSettings.autoCompleteExisting ? dateValueListId : undefined}
                                      placeholder={isFindMode ? findHint : undefined}
                                      disabled={!record.recordId}
                                      onChange={(event) =>
                                        patchRecordField(
                                          row.originalIndex,
                                          fieldName,
                                          event.currentTarget.value,
                                          record.recordId
                                        )
                                      }
                                      onBlur={(event) =>
                                        void saveFieldOnBlur(fieldName, event.currentTarget.value, record.recordId)
                                      }
                                    />
                                    {dateSettings.autoCompleteExisting && dateExistingOptions.length > 0 ? (
                                      <datalist id={dateValueListId}>
                                        {dateExistingOptions.map((option) => (
                                          <option key={`${row.key}-${fieldName}-date-${option}`} value={option} />
                                        ))}
                                      </datalist>
                                    ) : null}
                                  </>
                                ) : (
                                  <input
                                    type="text"
                                    value={String(currentValue ?? "")}
                                    placeholder={isFindMode ? findHint : undefined}
                                    disabled={!record.recordId}
                                    onChange={(event) =>
                                      patchRecordField(
                                        row.originalIndex,
                                        fieldName,
                                        event.currentTarget.value,
                                        record.recordId
                                      )
                                    }
                                    onBlur={(event) =>
                                      void saveFieldOnBlur(fieldName, event.currentTarget.value, record.recordId)
                                    }
                                  />
                                )}
                                {!containerField && saveState ? (
                                  <span className={`field-save-inline field-save-${saveState}`}>
                                    {saveStateLabel(saveState)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
          <input
            ref={containerPictureInputRef}
            type="file"
            accept={FILEMAKER_CONTAINER_IMAGE_ACCEPT_ATTRIBUTE}
            className="runtime-container-upload-input"
            onChange={(event) => {
              event.stopPropagation();
              handleContainerFileInputChange(event.currentTarget);
            }}
          />
          <input
            ref={containerPdfInputRef}
            type="file"
            accept={FILEMAKER_CONTAINER_PDF_ACCEPT_ATTRIBUTE}
            className="runtime-container-upload-input"
            onChange={(event) => {
              event.stopPropagation();
              handleContainerFileInputChange(event.currentTarget);
            }}
          />
          <input
            ref={containerFileInputRef}
            type="file"
            accept={FILEMAKER_CONTAINER_ACCEPT_ATTRIBUTE}
            className="runtime-container-upload-input"
            onChange={(event) => {
              event.stopPropagation();
              handleContainerFileInputChange(event.currentTarget);
            }}
          />
          {containerMenu ? (
            <div
              ref={containerMenuRef}
              className="runtime-column-menu runtime-container-menu"
              style={{ left: containerMenu.x, top: containerMenu.y }}
            >
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanCut}
                onClick={() => applyContainerMenuAction("cut")}
              >
                Cut
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanCopy}
                onClick={() => applyContainerMenuAction("copy")}
              >
                Copy
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanPaste}
                onClick={() => applyContainerMenuAction("paste")}
              >
                Paste
              </button>
              <button
                type="button"
                className="runtime-column-menu-item divider-before"
                disabled={!containerMenuCanInsert}
                onClick={() => applyContainerMenuAction("insert-picture")}
              >
                Insert Picture...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanInsert}
                onClick={() => applyContainerMenuAction("insert-pdf")}
              >
                Insert PDF...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanInsert}
                onClick={() => applyContainerMenuAction("insert-file")}
              >
                Insert File...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item divider-before"
                disabled={!containerMenuCanExport}
                onClick={() => applyContainerMenuAction("export")}
              >
                Export Field Contents...
              </button>
            </div>
          ) : null}
          {columnMenu ? (
            <div
              ref={columnMenuRef}
              className="runtime-column-menu"
              style={{ left: columnMenu.x, top: columnMenu.y }}
            >
              <button type="button" className="runtime-column-menu-item" onClick={() => applyColumnMenuAction("sort-asc")}>
                Sort Ascending
              </button>
              <button type="button" className="runtime-column-menu-item" onClick={() => applyColumnMenuAction("sort-desc")}>
                Sort Descending
              </button>
              <button
                type="button"
                className="runtime-column-menu-item has-submenu"
                onMouseEnter={(event) => openColumnSubmenu(event, "sortByValueList")}
                onClick={(event) => openColumnSubmenu(event, "sortByValueList")}
              >
                <span>Sort By Value List</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!canRemoveNameFromSort}
                onClick={() => applyColumnMenuAction("remove-from-sort")}
              >
                Remove {columnMenu.field} from Sort
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!canUnsort}
                onClick={() => applyColumnMenuAction("unsort")}
              >
                Unsort
              </button>
              <button type="button" className="runtime-column-menu-item divider-before" onClick={() => applyColumnMenuAction("leading-grand-summary")}>
                {leadingGrandSummary ? "Remove Leading Grand Summary" : "Add Leading Grand Summary"}
              </button>
              <button type="button" className="runtime-column-menu-item" onClick={() => applyColumnMenuAction("leading-group")}>
                Add Leading Group by {columnMenu.field}
              </button>
              <button
                type="button"
                className="runtime-column-menu-item has-submenu"
                onMouseEnter={(event) => openColumnSubmenu(event, "leadingSubtotals")}
                onClick={(event) => openColumnSubmenu(event, "leadingSubtotals")}
              >
                <span>Leading Subtotals</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
              <button type="button" className="runtime-column-menu-item divider-before" onClick={() => applyColumnMenuAction("trailing-grand-summary")}>
                {trailingGrandSummary ? "Remove Trailing Grand Summary" : "Add Trailing Grand Summary"}
              </button>
              <button type="button" className="runtime-column-menu-item" onClick={() => applyColumnMenuAction("trailing-group")}>
                Add Trailing Group by {columnMenu.field}
              </button>
              <button
                type="button"
                className="runtime-column-menu-item has-submenu"
                onMouseEnter={(event) => openColumnSubmenu(event, "trailingSubtotals")}
                onClick={(event) => openColumnSubmenu(event, "trailingSubtotals")}
              >
                <span>Trailing Subtotals</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
              <button type="button" className="runtime-column-menu-item divider-before" onClick={() => applyColumnMenuAction("chart")}>
                Chart by {columnMenu.field}...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item has-submenu"
                onMouseEnter={(event) => openColumnSubmenu(event, "field")}
                onClick={(event) => openColumnSubmenu(event, "field")}
              >
                <span>Field</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
              <button
                type="button"
                className="runtime-column-menu-item has-submenu"
                onMouseEnter={(event) => openColumnSubmenu(event, "tableView")}
                onClick={(event) => openColumnSubmenu(event, "tableView")}
              >
                <span>Table View</span>
                <span className="submenu-arrow">&gt;</span>
              </button>
            </div>
          ) : null}
          {columnMenu && columnSubmenu ? (
            <div
              ref={columnSubmenuRef}
              className="runtime-column-submenu"
              style={{ left: columnSubmenu.x, top: columnSubmenu.y }}
            >
              {columnSubmenu.kind === "sortByValueList" ? (
                <>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("value-current")}>
                    Current Value Order
                  </button>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("value-az")}>
                    Distinct Values (A-Z)
                  </button>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("value-za")}>
                    Distinct Values (Z-A)
                  </button>
                </>
              ) : null}
              {columnSubmenu.kind === "leadingSubtotals" || columnSubmenu.kind === "trailingSubtotals" ? (
                <>
                  {(["count", "sum", "avg", "min", "max"] as const).map((operation) => {
                    const enabled =
                      columnSubmenu.kind === "leadingSubtotals"
                        ? leadingOpsForActiveField.includes(operation)
                        : trailingOpsForActiveField.includes(operation);
                    return (
                      <button
                        key={operation}
                        type="button"
                        className={`runtime-column-menu-item ${enabled ? "active" : ""}`}
                        onClick={() => applySubmenuAction(operation)}
                      >
                        {enabled ? "✓ " : ""}{subtotalLabel(operation)}
                      </button>
                    );
                  })}
                  <button type="button" className="runtime-column-menu-item divider-before" onClick={() => applySubmenuAction("clear")}>
                    Clear
                  </button>
                </>
              ) : null}
              {columnSubmenu.kind === "field" ? (
                <>
                  <button
                    type="button"
                    className="runtime-column-menu-item"
                    disabled={activeFieldHidden}
                    onClick={() => applySubmenuAction("hide")}
                  >
                    Hide This Field
                  </button>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("only-this")}>
                    Show Only This Field
                  </button>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("show-all")}>
                    Show All Fields
                  </button>
                </>
              ) : null}
              {columnSubmenu.kind === "tableView" ? (
                <>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("toggle-row-numbers")}>
                    {tableViewOptions.showRowNumbers ? "Hide Row Numbers" : "Show Row Numbers"}
                  </button>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("toggle-alt-rows")}>
                    {tableViewOptions.alternatingRows ? "Disable Alternating Rows" : "Enable Alternating Rows"}
                  </button>
                  <button type="button" className="runtime-column-menu-item" onClick={() => applySubmenuAction("toggle-compact")}>
                    {tableViewOptions.compactRows ? "Use Comfortable Rows" : "Use Compact Rows"}
                  </button>
                  <button type="button" className="runtime-column-menu-item divider-before" onClick={() => applySubmenuAction("reset-view")}>
                    Reset Table View
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {viewMode !== "table" ? (
        <>
          <input
            ref={containerPictureInputRef}
            type="file"
            accept={FILEMAKER_CONTAINER_IMAGE_ACCEPT_ATTRIBUTE}
            className="runtime-container-upload-input"
            onChange={(event) => {
              event.stopPropagation();
              handleContainerFileInputChange(event.currentTarget);
            }}
          />
          <input
            ref={containerPdfInputRef}
            type="file"
            accept={FILEMAKER_CONTAINER_PDF_ACCEPT_ATTRIBUTE}
            className="runtime-container-upload-input"
            onChange={(event) => {
              event.stopPropagation();
              handleContainerFileInputChange(event.currentTarget);
            }}
          />
          <input
            ref={containerFileInputRef}
            type="file"
            accept={FILEMAKER_CONTAINER_ACCEPT_ATTRIBUTE}
            className="runtime-container-upload-input"
            onChange={(event) => {
              event.stopPropagation();
              handleContainerFileInputChange(event.currentTarget);
            }}
          />
          {containerMenu ? (
            <div
              ref={containerMenuRef}
              className="runtime-column-menu runtime-container-menu"
              style={{ left: containerMenu.x, top: containerMenu.y }}
            >
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanCut}
                onClick={() => applyContainerMenuAction("cut")}
              >
                Cut
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanCopy}
                onClick={() => applyContainerMenuAction("copy")}
              >
                Copy
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanPaste}
                onClick={() => applyContainerMenuAction("paste")}
              >
                Paste
              </button>
              <button
                type="button"
                className="runtime-column-menu-item divider-before"
                disabled={!containerMenuCanInsert}
                onClick={() => applyContainerMenuAction("insert-picture")}
              >
                Insert Picture...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanInsert}
                onClick={() => applyContainerMenuAction("insert-pdf")}
              >
                Insert PDF...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item"
                disabled={!containerMenuCanInsert}
                onClick={() => applyContainerMenuAction("insert-file")}
              >
                Insert File...
              </button>
              <button
                type="button"
                className="runtime-column-menu-item divider-before"
                disabled={!containerMenuCanExport}
                onClick={() => applyContainerMenuAction("export")}
              >
                Export Field Contents...
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
