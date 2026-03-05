export type ComponentType = "field" | "label" | "button" | "webViewer" | "portal" | "shape" | "panel" | "chart";

export type ComponentPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};

export type LayoutEventBindings = {
  onClick?: {
    action: "runScript" | "goToLayout" | "deletePortalRow";
    script?: string;
    parameter?: string;
    layoutName?: string;
  };
};

export type LayoutComponent = {
  id: string;
  type: ComponentType;
  position: ComponentPosition;
  binding?: {
    field?: string;
    tableOccurrence?: string;
  };
  props: {
    label?: string;
    tooltip?: string;
    placeholder?: string;
    controlType?: "text" | "concealed" | "dropdown" | "popup" | "radio" | "checkbox" | "date";
    labelPlacement?: "left" | "top" | "none";
    styleTheme?: string;
    styleName?: string;
    fillType?: "none" | "solid" | "gradient" | "image";
    fillColor?: string;
    fillGradientStartColor?: string;
    fillGradientEndColor?: string;
    fillGradientAngle?: number;
    fillImageUrl?: string;
    lineStyle?: "solid" | "dashed" | "none";
    lineWidth?: number;
    lineColor?: string;
    cornerRadius?: number;
    effectOuterShadow?: boolean;
    effectInnerShadow?: boolean;
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    fontFamily?: string;
    fontWeight?: "regular" | "bold" | "italic" | "boldItalic";
    fontSize?: number;
    textColor?: string;
    textUnderline?: boolean;
    textAlign?: "left" | "center" | "right" | "justify";
    lineSpacing?: number;
    lineSpacingHeight?: number;
    lineSpacingAbove?: number;
    lineSpacingBelow?: number;
    lineSpacingUnits?: "lines" | "pt";
    indentFirstLine?: number;
    indentLeft?: number;
    indentRight?: number;
    indentUnits?: "pt" | "in";
    tabStops?: number[];
    tabAlignment?: "left" | "center" | "right";
    tabAlignOn?: string;
    tabLeader?: string;
    baseline?: "none" | "superscript" | "subscript";
    baselineOffset?: number;
    showPlaceholderInFindMode?: boolean;
    repetitionsFrom?: number;
    repetitionsTo?: number;
    portalSortRecords?: boolean;
    portalFilterRecords?: boolean;
    portalFilterCalculation?: string;
    portalAllowDelete?: boolean;
    portalAllowVerticalScrolling?: boolean;
    portalScrollBar?: "always" | "whenScrolling" | "never";
    portalResetScrollOnExit?: boolean;
    portalInitialRow?: number;
    portalUseAlternateRowState?: boolean;
    portalUseActiveRowState?: boolean;
    portalRowFields?: string[];
    portalSortRules?: Array<{
      field: string;
      order: "ascending" | "descending" | "custom";
      valueList?: string;
    }>;
    portalSortReorderBySummary?: boolean;
    portalSortSummaryField?: string;
    portalSortOverrideLanguage?: boolean;
    portalSortLanguage?: string;
    orientation?: "horizontal" | "vertical";
    hideObjectWhen?: string;
    applyInFindMode?: boolean;
    entryBrowseMode?: boolean;
    entryFindMode?: boolean;
    entrySelectContents?: boolean;
    nextByTab?: boolean;
    nextByReturn?: boolean;
    nextByEnter?: boolean;
    includeInQuickFind?: boolean;
    noSpellCheck?: boolean;
    inputMethod?: string;
    keyboardType?: string;
    dataFormat?: string;
    containerFormat?: "reduceToFit" | "cropToFit" | "originalSize";
    containerMaintainProportions?: boolean;
    containerAlignHorizontal?: "left" | "center" | "right";
    containerAlignVertical?: "top" | "middle" | "bottom";
    containerOptimizeFor?: "images" | "interactive";
    containerStartPlaybackAutomatically?: boolean;
    containerDisablePdfShortcutMenu?: boolean;
    containerPreservePdfTransparency?: boolean;
    autosizeTop?: boolean;
    autosizeRight?: boolean;
    autosizeBottom?: boolean;
    autosizeLeft?: boolean;
    valueList?: string;
    valueListIncludeArrow?: boolean;
    valueListAllowOtherValues?: boolean;
    valueListAllowEditing?: boolean;
    valueListOverrideFormatting?: boolean;
    checkboxIcon?: "x" | "check" | "dot" | "square";
    editShowVerticalScrollbar?: boolean;
    editVerticalScrollBehavior?: "always" | "whenScrolling";
    editAutoCompleteExisting?: boolean;
    calendarIncludeIcon?: boolean;
    dateAutoCompleteExisting?: boolean;
    webViewerUrlTemplate?: string;
    webViewerPresetId?: string;
    webViewerPresetValues?: Record<string, string>;
    webViewerAllowInteraction?: boolean;
    webViewerDisplayInFindMode?: boolean;
    webViewerDisplayProgressBar?: boolean;
    webViewerDisplayStatusMessages?: boolean;
    webViewerAutoEncodeUrl?: boolean;
    webViewerAllowJavaScript?: boolean;
    variant?: "primary" | "secondary";
    buttonMode?: "standard" | "popover" | "bar";
    popoverTitle?: string;
    popoverShowTitleBar?: boolean;
    popoverButtonDisplay?: "text" | "icon" | "textIconLeading" | "textIconTrailing";
    popoverIcon?: "comment" | "chevronLeft" | "chevronRight" | "home";
    popoverWidth?: number;
    popoverHeight?: number;
    panelType?: "tab" | "slide";
    panelTabLabels?: string[];
    panelShowNavigation?: boolean;
    panelEnableSwipeGestures?: boolean;
    panelShowNavigationDots?: boolean;
    panelNavigationDotSize?: number;
    panelDefaultFrontTab?: string;
    panelTabJustification?: "left" | "center" | "right";
    panelTabWidthMode?: "label" | "fixed";
    panelFixedTabWidth?: number;
    panelTabsShareSingleStyle?: boolean;
    panelTabCalculations?: string[];
    shapeType?: "line" | "rectangle" | "roundedRectangle" | "oval";
    chartTitle?: string;
    chartType?: "column" | "bar" | "line" | "area" | "pie" | "donut" | "scatter" | "bubble";
    chartXAxisField?: string;
    chartXAxisTitle?: string;
    chartSeriesField?: string;
    chartSummary?: "count" | "sum" | "avg" | "min" | "max";
    chartYAxisTitle?: string;
    chartShowLegend?: boolean;
    chartColor?: string;
    tabOrder?: number;
    groupId?: string;
    locked?: boolean;
    rotation?: number;
    ddrArrangeOrder?: number;
    ddrObjectPath?: string;
    portalParentComponentId?: string;
    portalParentDdrPath?: string;
    portalParentTableOccurrence?: string;
  };
  events?: LayoutEventBindings;
};

export type LayoutActionBinding = {
  id: string;
  name: string;
  script: string;
  parameterTemplate?: string;
};

export type LayoutBrowseChartSnapshot = {
  version: 1;
  createdAt: string;
  source: {
    layoutId: string;
    layoutName: string;
    tableOccurrence: string;
    dataSource: "mock" | "filemaker";
  };
  context: {
    viewMode: "form" | "list" | "table";
    isFindMode: boolean;
    findCriteria: Record<string, string>;
    currentRecordIndex: number;
  };
  tableView: {
    hiddenFields: string[];
    options: {
      showRowNumbers: boolean;
      alternatingRows: boolean;
      compactRows: boolean;
    };
    leadingGrandSummary: boolean;
    trailingGrandSummary: boolean;
    leadingGroupField: string | null;
    trailingGroupField: string | null;
    leadingSubtotals: Record<string, Array<"count" | "sum" | "avg" | "min" | "max">>;
    trailingSubtotals: Record<string, Array<"count" | "sum" | "avg" | "min" | "max">>;
  };
  sort: Array<{
    field: string;
    direction: "asc" | "desc";
    mode: "standard" | "valueList";
    valueListName?: string;
    valueList?: string[];
  }>;
  keepRecordsInSortedOrder: boolean;
  chart: {
    config: {
      title: string;
      type: string;
      xAxisField: string;
      xAxisTitle: string;
      yAxisTitle: string;
      showLegend: boolean;
      labelField: string;
      bubbleRadiusField: string;
      series: Array<{
        id: string;
        name: string;
        field: string;
        summary: string;
        color: string;
      }>;
    };
  };
  foundSet: {
    recordIds: string[];
    totalRecordsInFoundSet: number;
    totalRecordsInSource: number;
    snapshotFields: string[];
    snapshotRows: Array<{
      recordId?: string;
      values: Record<string, string | number | boolean>;
    }>;
    snapshotTruncated: boolean;
  };
};

export type LayoutPartType =
  | "topNavigation"
  | "titleHeader"
  | "header"
  | "leadingGrandSummary"
  | "subSummary"
  | "body"
  | "trailingGrandSummary"
  | "footer"
  | "titleFooter"
  | "bottomNavigation";

export type LayoutPartDefinition = {
  id: string;
  type: LayoutPartType;
  label?: string;
  height: number;
  sortByField?: string;
  pageBreakBeforeEachOccurrence?: boolean;
  pageBreakAfterEveryOccurrences?: number | null;
  restartPageNumbersAfterEachOccurrence?: boolean;
  allowPartToBreakAcrossPageBoundaries?: boolean;
  discardRemainderBeforeNewPage?: boolean;
  useAlternateRowState?: boolean;
  useActiveRowState?: boolean;
};

export type LayoutDefinition = {
  id: string;
  name: string;
  defaultTableOccurrence: string;
  canvas: {
    width: number;
    height: number;
    gridSize: number;
    showGrid?: boolean;
    snapToGrid?: boolean;
    showRulers?: boolean;
    showGuides?: boolean;
    autosizeTop?: boolean;
    autosizeRight?: boolean;
    autosizeBottom?: boolean;
    autosizeLeft?: boolean;
    deviceFramePresetIds?: string[];
    deviceFrameCustomWidth?: number;
    deviceFrameCustomHeight?: number;
    devicePresetId?: string;
    deviceFrameWidth?: number;
    deviceFrameHeight?: number;
    locked?: boolean;
  };
  parts?: LayoutPartDefinition[];
  components: LayoutComponent[];
  actions: LayoutActionBinding[];
  rules?: Array<{
    id: string;
    condition: string;
    effect: string;
  }>;
  browseChartSnapshot?: LayoutBrowseChartSnapshot;
};

export type FMRecord = {
  recordId?: string;
  modId?: string;
  [field: string]: unknown;
};
