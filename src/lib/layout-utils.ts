import type { ComponentType, LayoutComponent, LayoutDefinition } from "@/src/lib/layout-model";

export function createComponent(type: ComponentType): LayoutComponent {
  const base: LayoutComponent = {
    id: crypto.randomUUID(),
    type,
    position: {
      x: 24,
      y: 24,
      width: type === "label" ? 160 : type === "shape" ? 180 : type === "panel" ? 320 : 220,
      height: type === "portal" ? 180 : type === "shape" ? 110 : type === "panel" ? 220 : 40,
      z: Date.now()
    },
    binding: {},
    props: {
      label: type === "label" ? "Label" : type === "button" ? "Button" : "",
      placeholder: type === "field" ? "Enter value" : "",
      controlType: "text" as const,
      variant: "primary" as const,
      buttonMode: "standard" as const,
      locked: false,
      rotation: 0
    }
  };

  if (type === "webViewer") {
    base.position.width = 360;
    base.position.height = 220;
    base.props.label = "Web Viewer";
    base.props.webViewerUrlTemplate = "https://example.com?id={{recordId}}";
    base.props.webViewerPresetId = "custom";
    base.props.webViewerPresetValues = {
      url: "https://example.com?id={{recordId}}"
    };
    base.props.webViewerAllowInteraction = true;
    base.props.webViewerDisplayInFindMode = false;
    base.props.webViewerDisplayProgressBar = true;
    base.props.webViewerDisplayStatusMessages = true;
    base.props.webViewerAutoEncodeUrl = true;
    base.props.webViewerAllowJavaScript = false;
  }

  if (type === "chart") {
    base.position.width = 420;
    base.position.height = 260;
    base.props.label = "Chart";
    base.props.chartTitle = "Chart";
    base.props.chartType = "column";
    base.props.chartXAxisField = "";
    base.props.chartXAxisTitle = "";
    base.props.chartSeriesField = "";
    base.props.chartSummary = "count";
    base.props.chartYAxisTitle = "";
    base.props.chartShowLegend = true;
    base.props.chartColor = "#1f77b4";
    base.props.styleTheme = "Universal Touch";
    base.props.styleName = "Default";
  }

  if (type === "button") {
    base.props.popoverTitle = "Popover";
    base.props.popoverShowTitleBar = true;
    base.props.popoverButtonDisplay = "text";
    base.props.popoverIcon = "comment";
    base.props.popoverWidth = 280;
    base.props.popoverHeight = 190;
    base.events = {
      onClick: {
        action: "runScript",
        script: "",
        parameter: "{{recordId}}"
      }
    };
  }

  if (type === "portal") {
    base.position.width = 320;
    base.position.height = 220;
    base.props.label = "Portal";
    base.props.styleTheme = "Universal Touch";
    base.props.styleName = "Line | Secondary";
    base.props.portalSortRecords = false;
    base.props.portalFilterRecords = false;
    base.props.portalFilterCalculation = "";
    base.props.portalAllowDelete = false;
    base.props.portalAllowVerticalScrolling = true;
    base.props.portalScrollBar = "always";
    base.props.portalResetScrollOnExit = false;
    base.props.portalInitialRow = 1;
    base.props.repetitionsFrom = 1;
    base.props.repetitionsTo = 4;
    base.props.portalUseAlternateRowState = false;
    base.props.portalUseActiveRowState = true;
    base.props.portalRowFields = [];
    base.props.portalSortRules = [];
    base.props.portalSortReorderBySummary = false;
    base.props.portalSortSummaryField = "";
    base.props.portalSortOverrideLanguage = false;
    base.props.portalSortLanguage = "English";
  }

  if (type === "panel") {
    base.props.label = "Tab Control";
    base.props.panelType = "tab";
    base.props.panelTabLabels = ["Tab 1", "Tab 2"];
    base.props.panelShowNavigation = true;
    base.props.panelEnableSwipeGestures = true;
    base.props.panelShowNavigationDots = true;
    base.props.panelNavigationDotSize = 9;
    base.props.panelDefaultFrontTab = "Tab 1";
    base.props.panelTabJustification = "left";
    base.props.panelTabWidthMode = "label";
    base.props.panelFixedTabWidth = 120;
    base.props.panelTabsShareSingleStyle = true;
    base.props.panelTabCalculations = ["", ""];
    base.props.styleTheme = "Universal Touch";
    base.props.styleName = "Default";
  }

  if (type === "shape") {
    base.props.shapeType = "rectangle";
    base.props.fillType = "none";
    base.props.fillColor = "#ffffff";
    base.props.lineStyle = "solid";
    base.props.lineWidth = 1;
    base.props.lineColor = "#94a3b8";
    base.props.cornerRadius = 0;
    base.props.label = "";
  }

  return base;
}

export function defaultLayout(id: string): LayoutDefinition {
  return {
    id,
    name: "Untitled Layout",
    defaultTableOccurrence: "Customers",
    canvas: {
      width: 1200,
      height: 900,
      gridSize: 8,
      showGrid: false,
      snapToGrid: false,
      showRulers: false,
      showGuides: false,
      autosizeTop: true,
      autosizeRight: true,
      autosizeBottom: true,
      autosizeLeft: true,
      locked: false
    },
    parts: [
      {
        id: crypto.randomUUID(),
        type: "body",
        label: "Body",
        height: 900
      }
    ],
    components: [],
    actions: []
  };
}

export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function templateString(
  template: string,
  record: Record<string, unknown> | null | undefined
): string {
  if (!template || !record) {
    return template;
  }

  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
    const value = record[key];
    return value == null ? "" : String(value);
  });
}
