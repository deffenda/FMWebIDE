export type PortalSortOrder = "ascending" | "descending" | "custom";

export type PortalSortRule = {
  field: string;
  order: PortalSortOrder;
  valueList?: string;
};

type RawPortalSortRule =
  | {
      field?: unknown;
      order?: unknown;
      valueList?: unknown;
    }
  | null
  | undefined;

export function unqualifiedFieldName(fieldName: string): string {
  const parts = fieldName.split("::");
  return parts[parts.length - 1]?.trim() ?? fieldName.trim();
}

export function normalizePortalSortRules(rules: RawPortalSortRule[] | undefined): PortalSortRule[] {
  if (!Array.isArray(rules)) {
    return [];
  }
  const normalized: PortalSortRule[] = [];
  const seenFields = new Set<string>();
  for (const rawRule of rules) {
    if (!rawRule || typeof rawRule !== "object") {
      continue;
    }
    const field = String(rawRule.field ?? "").trim();
    if (!field) {
      continue;
    }
    const fieldKey = field.toLowerCase();
    if (seenFields.has(fieldKey)) {
      continue;
    }
    seenFields.add(fieldKey);
    const order: PortalSortOrder =
      rawRule.order === "descending" || rawRule.order === "custom" ? rawRule.order : "ascending";
    const valueList = String(rawRule.valueList ?? "").trim();
    normalized.push({
      field,
      order,
      valueList: valueList || undefined
    });
  }
  return normalized;
}

export function resolvePortalSortFieldValue(
  record: Record<string, unknown> | null | undefined,
  fieldName: string
): unknown {
  if (!record) {
    return "";
  }
  const normalizedField = fieldName.trim();
  if (!normalizedField) {
    return "";
  }
  if (record[normalizedField] != null) {
    return record[normalizedField];
  }
  const unqualified = unqualifiedFieldName(normalizedField);
  if (record[unqualified] != null) {
    return record[unqualified];
  }
  const normalizedFieldLower = normalizedField.toLowerCase();
  const unqualifiedLower = unqualified.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (value == null) {
      continue;
    }
    const keyLower = key.trim().toLowerCase();
    if (keyLower === normalizedFieldLower || keyLower === unqualifiedLower) {
      return value;
    }
    if (unqualifiedFieldName(key).toLowerCase() === unqualifiedLower) {
      return value;
    }
  }
  return "";
}

export function comparePortalSortValues(a: unknown, b: unknown): number {
  const aText = String(a ?? "").trim();
  const bText = String(b ?? "").trim();

  if (!aText && !bText) {
    return 0;
  }

  const aNumber = Number(aText.replace(/,/g, ""));
  const bNumber = Number(bText.replace(/,/g, ""));
  if (aText !== "" && bText !== "" && Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    if (aNumber < bNumber) {
      return -1;
    }
    if (aNumber > bNumber) {
      return 1;
    }
    return 0;
  }

  const aDate = Date.parse(aText);
  const bDate = Date.parse(bText);
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
    if (aDate < bDate) {
      return -1;
    }
    if (aDate > bDate) {
      return 1;
    }
    return 0;
  }

  return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
}

export function sortPortalRowsForPreview(
  rows: Array<Record<string, unknown>>,
  rules: PortalSortRule[],
  valueListByName: Map<string, string[]>
): Array<Record<string, unknown>> {
  const normalizedRules = normalizePortalSortRules(rules);
  if (normalizedRules.length === 0 || rows.length <= 1) {
    return rows;
  }

  const customRankByRule = new Map<number, Map<string, number>>();
  normalizedRules.forEach((rule, index) => {
    if (rule.order !== "custom") {
      return;
    }
    const valueListName = (rule.valueList ?? "").trim();
    if (!valueListName) {
      return;
    }
    const values = valueListByName.get(valueListName) ?? [];
    if (values.length === 0) {
      return;
    }
    const rankMap = new Map<string, number>();
    values.forEach((value, valueIndex) => {
      const key = value.trim().toLowerCase();
      if (!rankMap.has(key)) {
        rankMap.set(key, valueIndex);
      }
    });
    customRankByRule.set(index, rankMap);
  });

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (let ruleIndex = 0; ruleIndex < normalizedRules.length; ruleIndex += 1) {
        const rule = normalizedRules[ruleIndex];
        const leftValue = resolvePortalSortFieldValue(a.row, rule.field);
        const rightValue = resolvePortalSortFieldValue(b.row, rule.field);

        let comparison = 0;
        if (rule.order === "custom") {
          const rankMap = customRankByRule.get(ruleIndex);
          if (rankMap && rankMap.size > 0) {
            const leftRank = rankMap.get(String(leftValue ?? "").trim().toLowerCase());
            const rightRank = rankMap.get(String(rightValue ?? "").trim().toLowerCase());
            const fallbackRank = rankMap.size + 1_000;
            const safeLeft = leftRank ?? fallbackRank;
            const safeRight = rightRank ?? fallbackRank;
            if (safeLeft !== safeRight) {
              comparison = safeLeft - safeRight;
            } else {
              comparison = comparePortalSortValues(leftValue, rightValue);
            }
          } else {
            comparison = comparePortalSortValues(leftValue, rightValue);
          }
        } else {
          comparison = comparePortalSortValues(leftValue, rightValue);
          if (rule.order === "descending") {
            comparison *= -1;
          }
        }

        if (comparison !== 0) {
          return comparison;
        }
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

export type PortalSetupDraft = {
  tableOccurrence: string;
  fallbackTableOccurrence?: string;
  sortRecords: boolean;
  filterRecords: boolean;
  allowDelete: boolean;
  allowVerticalScrolling: boolean;
  scrollBar: "always" | "whenScrolling" | "never";
  resetScrollOnExit: boolean;
  initialRowInput: string;
  rowsInput: string;
  useAlternateRowState: boolean;
  useActiveRowState: boolean;
  rowFields: string[];
  sortRules: PortalSortRule[];
  sortReorderBySummary: boolean;
  sortSummaryField: string;
  sortOverrideLanguage: boolean;
  sortLanguage: string;
  availableFieldNames: string[];
};

export type SanitizedPortalSetup = {
  tableOccurrence: string;
  props: {
    portalSortRecords: boolean;
    portalFilterRecords: boolean;
    portalAllowDelete: boolean;
    portalAllowVerticalScrolling: boolean;
    portalScrollBar: "always" | "whenScrolling" | "never";
    portalResetScrollOnExit: boolean;
    portalInitialRow: number;
    repetitionsFrom: number;
    repetitionsTo: number;
    portalUseAlternateRowState: boolean;
    portalUseActiveRowState: boolean;
    portalRowFields: string[];
    portalSortRules: PortalSortRule[];
    portalSortReorderBySummary: boolean;
    portalSortSummaryField: string;
    portalSortOverrideLanguage: boolean;
    portalSortLanguage: string;
  };
};

export function sanitizePortalSetupDraft(draft: PortalSetupDraft): SanitizedPortalSetup {
  const rows = Number.parseInt(draft.rowsInput, 10);
  const initialRow = Number.parseInt(draft.initialRowInput, 10);
  const safeRows = Number.isFinite(rows) && rows > 0 ? rows : 6;
  const safeInitialRow = Number.isFinite(initialRow) && initialRow > 0 ? initialRow : 1;
  const normalizedTableOccurrence =
    draft.tableOccurrence.trim() || (draft.fallbackTableOccurrence ?? "").trim();

  const normalizedRowFields = [...new Set(draft.rowFields.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  const availableFieldSet = new Set(
    draft.availableFieldNames
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  );

  // Preserve explicit row-field choices even when live field catalogs are incomplete
  // (for example related TO metadata gaps). Dropping unknown fields causes silent
  // loss from portal definitions after save.
  const filteredRowFields = normalizedRowFields;

  const filteredSortRules = normalizePortalSortRules(draft.sortRules).filter((rule) => {
    if (availableFieldSet.size === 0) {
      return true;
    }
    return availableFieldSet.has(rule.field.toLowerCase());
  });

  const allowVerticalScrolling = draft.allowVerticalScrolling;
  const portalScrollBar = allowVerticalScrolling ? draft.scrollBar : "never";
  const portalResetScrollOnExit = allowVerticalScrolling ? draft.resetScrollOnExit : false;

  return {
    tableOccurrence: normalizedTableOccurrence,
    props: {
      portalSortRecords: draft.sortRecords,
      portalFilterRecords: draft.filterRecords,
      portalAllowDelete: draft.allowDelete,
      portalAllowVerticalScrolling: allowVerticalScrolling,
      portalScrollBar,
      portalResetScrollOnExit,
      portalInitialRow: safeInitialRow,
      repetitionsFrom: 1,
      repetitionsTo: safeRows,
      portalUseAlternateRowState: draft.useAlternateRowState,
      portalUseActiveRowState: draft.useActiveRowState,
      portalRowFields: filteredRowFields,
      portalSortRules: filteredSortRules,
      portalSortReorderBySummary: draft.sortReorderBySummary,
      portalSortSummaryField: draft.sortSummaryField.trim(),
      portalSortOverrideLanguage: draft.sortOverrideLanguage,
      portalSortLanguage: draft.sortLanguage.trim() || "English"
    }
  };
}
