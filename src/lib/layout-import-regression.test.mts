import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type LayoutComponent = {
  type?: string;
  binding?: {
    field?: string;
    tableOccurrence?: string;
  };
  events?: {
    onClick?: {
      action?: string;
      script?: string;
      layoutName?: string;
    };
  };
  props?: {
    portalRowFields?: string[];
    styleTheme?: string;
    styleName?: string;
    label?: string;
    ddrObjectPath?: string;
    portalParentComponentId?: string;
    portalParentDdrPath?: string;
    portalParentTableOccurrence?: string;
  };
};

type LayoutPayload = {
  id: string;
  name: string;
  parts?: Array<{
    type?: string;
    label?: string;
    height?: number;
  }>;
  components: LayoutComponent[];
};

type LayoutMapPayload = {
  version: number;
  byFileMakerLayoutKey: Record<string, string>;
};

function normalizeLayoutName(value: string): string {
  return value.trim().toLowerCase();
}

async function readJsonFile<T>(absolutePath: string): Promise<T> {
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw) as T;
}

async function loadLayoutById(layoutId: string): Promise<LayoutPayload> {
  const filePath = path.join(process.cwd(), "data", "layouts", `${layoutId}.json`);
  return readJsonFile<LayoutPayload>(filePath);
}

test("DDR reimport includes expected Assets layouts and IDs", async () => {
  const mapPath = path.join(process.cwd(), "data", "layout-fm-map.json");
  const map = await readJsonFile<LayoutMapPayload>(mapPath);
  const entries = Object.entries(map.byFileMakerLayoutKey).filter(([key]) => key.startsWith("Assets::"));
  const names = entries.map(([key]) => key.replace(/^Assets::/, "")).sort((a, b) => a.localeCompare(b));

  assert.deepEqual(names, [
    "Asset Details",
    "Asset List",
    "Employee Details",
    "Employee List",
    "Vendor Details",
    "Vendor List"
  ]);
});

test("Asset Details portal fields preserve visual order and related TO binding", async () => {
  const mapPath = path.join(process.cwd(), "data", "layout-fm-map.json");
  const map = await readJsonFile<LayoutMapPayload>(mapPath);
  const layoutId = map.byFileMakerLayoutKey["Assets::Asset Details"];
  assert.ok(layoutId, "Expected Assets::Asset Details in layout map");

  const layout = await loadLayoutById(layoutId);
  const portal = layout.components.find((component) => component.type === "portal");
  assert.ok(portal, "Expected a portal object on Asset Details");
  assert.equal(portal?.binding?.tableOccurrence, "Assignments");
  assert.deepEqual(portal?.props?.portalRowFields, ["EmployeeForeignKey", "Date Returned", "Note"]);
});

test("Asset Details imports portal children with explicit portal descendant metadata", async () => {
  const mapPath = path.join(process.cwd(), "data", "layout-fm-map.json");
  const map = await readJsonFile<LayoutMapPayload>(mapPath);
  const layoutId = map.byFileMakerLayoutKey["Assets::Asset Details"];
  assert.ok(layoutId, "Expected Assets::Asset Details in layout map");

  const layout = await loadLayoutById(layoutId);
  const portal = layout.components.find(
    (component) => component.type === "portal" && (component.props?.label ?? "").trim() === "Assigned"
  );
  assert.ok(portal, "Expected Assigned portal on Asset Details");

  const explicitPortalChildren = layout.components.filter((component) => {
    const parentId = component.props?.portalParentComponentId?.trim() ?? "";
    const parentPath = component.props?.portalParentDdrPath?.trim() ?? "";
    const portalId = portal?.id ?? "";
    const portalPath = portal?.props?.ddrObjectPath?.trim() ?? "";
    return component.type !== "portal" && ((portalId && parentId === portalId) || (portalPath && parentPath === portalPath));
  });

  assert.ok(explicitPortalChildren.length >= 3, "Expected imported portal child objects with explicit metadata");
  const fieldsInPortal = explicitPortalChildren.filter((component) => component.type === "field");
  assert.ok(fieldsInPortal.length >= 2, "Expected field controls among imported portal child objects");
  for (const field of fieldsInPortal) {
    assert.equal(
      (field.binding?.tableOccurrence ?? "").trim(),
      "Assignments",
      "Expected portal field child to inherit portal table occurrence"
    );
  }
});

test("Asset Details imports layout parts from DDR", async () => {
  const mapPath = path.join(process.cwd(), "data", "layout-fm-map.json");
  const map = await readJsonFile<LayoutMapPayload>(mapPath);
  const layoutId = map.byFileMakerLayoutKey["Assets::Asset Details"];
  assert.ok(layoutId, "Expected Assets::Asset Details in layout map");

  const layout = await loadLayoutById(layoutId);
  const partTypes = (layout.parts ?? []).map((part) => part.type);
  assert.ok(partTypes.includes("topNavigation"), "Expected Top Navigation part");
  assert.ok(partTypes.includes("body"), "Expected Body part");
  const bodyPart = (layout.parts ?? []).find((part) => part.type === "body");
  assert.ok((bodyPart?.height ?? 0) > 0, "Expected body part height");
});

test("DDR import maps step-based button actions (Go to Layout, Delete Portal Row)", async () => {
  const mapPath = path.join(process.cwd(), "data", "layout-fm-map.json");
  const map = await readJsonFile<LayoutMapPayload>(mapPath);
  const layoutId = map.byFileMakerLayoutKey["Assets::Asset Details"];
  assert.ok(layoutId, "Expected Assets::Asset Details in layout map");

  const layout = await loadLayoutById(layoutId);
  const goToLayoutAction = layout.components
    .map((component) => component.events?.onClick)
    .find((onClick) => onClick?.action === "goToLayout");
  assert.ok(goToLayoutAction, "Expected at least one Go to Layout action");
  assert.equal(goToLayoutAction?.layoutName, "Asset List");

  const deletePortalAction = layout.components
    .map((component) => component.events?.onClick)
    .find((onClick) => onClick?.action === "deletePortalRow");
  assert.ok(deletePortalAction, "Expected a Delete Portal Row action");
});

test("Reimported layouts keep container and theme style metadata", async () => {
  const mapPath = path.join(process.cwd(), "data", "layout-fm-map.json");
  const map = await readJsonFile<LayoutMapPayload>(mapPath);
  const entries = Object.entries(map.byFileMakerLayoutKey).filter(([key]) => key.startsWith("Assets::"));
  assert.ok(entries.length > 0, "Expected Assets layout entries");

  let foundImageContainerField = false;
  let themedComponents = 0;

  for (const [, layoutId] of entries) {
    const layout = await loadLayoutById(layoutId);
    for (const component of layout.components) {
      const fieldName = component.binding?.field ?? "";
      if (normalizeLayoutName(fieldName) === "image") {
        foundImageContainerField = true;
      }
      const styleTheme = component.props?.styleTheme?.trim() ?? "";
      const styleName = component.props?.styleName?.trim() ?? "";
      if (styleTheme || styleName) {
        themedComponents += 1;
      }
    }
  }

  assert.equal(foundImageContainerField, true, "Expected at least one Image field after DDR reimport");
  assert.ok(themedComponents > 0, "Expected DDR reimport to preserve styleTheme/styleName metadata");
});

test("Theme palette catalog includes Universal Touch", async () => {
  const palettePath = path.join(process.cwd(), "data", "filemaker-theme-palettes.json");
  const paletteCatalog = await readJsonFile<{
    palettesByTheme?: Record<string, unknown>;
  }>(palettePath);
  const names = Object.keys(paletteCatalog.palettesByTheme ?? {});
  assert.ok(names.includes("Universal Touch"), "Expected Universal Touch theme palette");
  assert.ok(names.length >= 20, "Expected multiple imported FileMaker themes");
});
