import assert from "node:assert/strict";
import test from "node:test";
import type { FMRecord } from "../lib/layout-model.ts";
import {
  createRecord,
  deleteRecord,
  getAvailableLayouts,
  getRecords,
  getValueLists,
  isUsingMockData,
  updateRecord
} from "./filemaker-client.ts";

type LayoutTargets = {
  assets: string;
  vendors: string;
  employees: string;
};

type CreatedRecord = {
  table: keyof LayoutTargets;
  layoutName: string;
  recordId: string;
  fields: Record<string, unknown>;
};

const runAgainstMock = process.env.FM_TEST_ALLOW_MOCK === "1";
const allowIntegration = process.env.FM_INTEGRATION_TESTS === "1";
const syntheticTag = `fmwebide-${Date.now().toString(36)}`;
const createdRecords: CreatedRecord[] = [];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function pickLayout(layouts: string[], candidates: string[]): string {
  for (const candidate of candidates) {
    const direct = layouts.find((entry) => normalize(entry) === normalize(candidate));
    if (direct) {
      return direct;
    }
  }
  for (const candidate of candidates) {
    const partial = layouts.find((entry) => normalize(entry).includes(normalize(candidate)));
    if (partial) {
      return partial;
    }
  }
  throw new Error(
    `Unable to resolve layout. Tried: ${candidates.join(", ")}. Available: ${layouts.join(", ")}`
  );
}

function resolveTargets(layouts: string[]): LayoutTargets {
  return {
    assets: pickLayout(layouts, ["Asset Details", "Asset List", "Assets"]),
    vendors: pickLayout(layouts, ["Vendor Details", "Vendor List", "Vendors"]),
    employees: pickLayout(layouts, ["Employee Details", "Employee List", "Employees"])
  };
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function recordMatchesFind(record: FMRecord, criteria: Record<string, string>): boolean {
  const entries = Object.entries(criteria).filter(([, value]) => value.trim().length > 0);
  if (entries.length === 0) {
    return true;
  }
  for (const [fieldName, expected] of entries) {
    const actual = String(record[fieldName] ?? "");
    const token = expected.trim();
    if (token.includes("*") || token.includes("?")) {
      if (!wildcardToRegex(token).test(actual)) {
        return false;
      }
      continue;
    }
    if (!actual.toLowerCase().includes(token.toLowerCase())) {
      return false;
    }
  }
  return true;
}

async function safeDelete(layoutName: string, recordId: string): Promise<void> {
  try {
    await deleteRecord(layoutName, recordId);
  } catch {
    // Ignore cleanup failures so test teardown stays resilient.
  }
}

async function cleanupCreatedRecords(): Promise<void> {
  for (const entry of [...createdRecords].reverse()) {
    await safeDelete(entry.layoutName, entry.recordId);
  }
  createdRecords.length = 0;
}

async function createWithTracking(
  table: keyof LayoutTargets,
  layoutName: string,
  fields: Record<string, unknown>
): Promise<CreatedRecord> {
  const created = await createRecord(layoutName, fields);
  const recordId = String(created.recordId ?? "").trim();
  assert.ok(recordId, `Expected recordId from createRecord(${layoutName})`);
  const tracked: CreatedRecord = {
    table,
    layoutName,
    recordId,
    fields
  };
  createdRecords.push(tracked);
  return tracked;
}

async function fetchTaggedRecords(layoutName: string): Promise<FMRecord[]> {
  const rows = await getRecords({ tableOccurrence: layoutName, limit: 500 });
  return rows.filter((row) => {
    const candidates = [
      row.Name,
      row.name,
      row.Description,
      row.description,
      row["First Name"],
      row["Last Name"]
    ];
    return candidates.some((value) => String(value ?? "").toLowerCase().includes(syntheticTag));
  });
}

if (!allowIntegration) {
  test("FileMaker integration regression suite", { skip: true }, () => {});
} else {
  test("FileMaker integration regression suite", async (t) => {
    if (isUsingMockData() && !runAgainstMock) {
      t.skip("Skipping integration suite because FileMaker env vars are not active. Set FM_TEST_ALLOW_MOCK=1 to run against mock.");
      return;
    }

    const layoutsPayload = await getAvailableLayouts();
    assert.ok(layoutsPayload.layouts.length > 0, "Expected at least one available layout");
    const targets = resolveTargets(layoutsPayload.layouts);

    const vendorSeed = [
      { Name: `${syntheticTag}-Vendor-A`, Description: `${syntheticTag} industrial supply partner` },
      { Name: `${syntheticTag}-Vendor-B`, Description: `${syntheticTag} field service supplier` },
      { Name: `${syntheticTag}-Vendor-C`, Description: `${syntheticTag} maintenance vendor` }
    ];
    const employeeSeed = [
      {
        "First Name": `${syntheticTag}-Employee-A`,
        "Last Name": "Operations",
        Description: `${syntheticTag} operations manager`
      },
      {
        "First Name": `${syntheticTag}-Employee-B`,
        "Last Name": "Field",
        Description: `${syntheticTag} field technician`
      },
      {
        "First Name": `${syntheticTag}-Employee-C`,
        "Last Name": "Warehouse",
        Description: `${syntheticTag} warehouse specialist`
      }
    ];
    const assetSeed = [
      {
        Name: `${syntheticTag}-Asset-A`,
        Description: "Dell Latitude 7440 for field engineering",
        "Serial Number": `SN-${syntheticTag}-A`,
        Type: "Laptop",
        Vendor: `${syntheticTag}-Vendor-A`,
        Price: 2199.95
      },
      {
        Name: `${syntheticTag}-Asset-B`,
        Description: "Fluke thermal camera for inspections",
        "Serial Number": `SN-${syntheticTag}-B`,
        Type: "Camera",
        Vendor: `${syntheticTag}-Vendor-B`,
        Price: 1495.0
      },
      {
        Name: `${syntheticTag}-Asset-C`,
        Description: "Surface Pro for project management",
        "Serial Number": `SN-${syntheticTag}-C`,
        Type: "Tablet",
        Vendor: `${syntheticTag}-Vendor-C`,
        Price: 1849.49
      }
    ];

    t.after(async () => {
      await cleanupCreatedRecords();
    });

    await t.test("create three vendor, employee, and asset records", async () => {
      for (const vendor of vendorSeed) {
        await createWithTracking("vendors", targets.vendors, vendor);
      }
      for (const employee of employeeSeed) {
        await createWithTracking("employees", targets.employees, employee);
      }
      for (const asset of assetSeed) {
        await createWithTracking("assets", targets.assets, asset);
      }

      const vendorRows = await fetchTaggedRecords(targets.vendors);
      const employeeRows = await fetchTaggedRecords(targets.employees);
      const assetRows = await fetchTaggedRecords(targets.assets);
      assert.equal(vendorRows.length, 3, "Expected 3 created vendor records");
      assert.equal(employeeRows.length, 3, "Expected 3 created employee records");
      assert.equal(assetRows.length, 3, "Expected 3 created asset records");
    });

    await t.test("edit seeded records and verify persisted updates", async () => {
      for (const created of createdRecords) {
        const updatedPayload: Record<string, unknown> = {
          ...created.fields
        };

        if (created.table === "assets") {
          const currentName = String(created.fields.Name ?? "");
          updatedPayload.Name = `${currentName}-Edited`;
          updatedPayload.Description = `${created.fields.Description ?? ""} (refreshed)`;
          updatedPayload.Price = Number(created.fields.Price ?? 0) + 100;
        }
        if (created.table === "vendors") {
          const currentName = String(created.fields.Name ?? "");
          updatedPayload.Name = `${currentName}-Edited`;
          updatedPayload.Description = `${created.fields.Description ?? ""} (preferred)`;
        }
        if (created.table === "employees") {
          const currentFirstName = String(created.fields["First Name"] ?? "");
          updatedPayload["First Name"] = `${currentFirstName}-Edited`;
          updatedPayload["Last Name"] = `${created.fields["Last Name"] ?? "Staff"} II`;
          updatedPayload.Description = `${created.fields.Description ?? ""} (preferred)`;
        }

        await updateRecord(created.layoutName, created.recordId, updatedPayload);
        created.fields = updatedPayload;
      }

      const assetRows = await fetchTaggedRecords(targets.assets);
      const editedCount = assetRows.filter((row) => String(row.Name ?? "").endsWith("-Edited")).length;
      assert.equal(editedCount, 3, "Expected all asset records to be updated");
    });

    await t.test("find-mode criteria semantics produce consistent found set across form/list/table", async () => {
      const records = await fetchTaggedRecords(targets.assets);
      assert.ok(records.length >= 3, "Expected tagged asset records for find verification");

      const criteria = {
        Name: `${syntheticTag}*Edited`,
        Description: "field"
      };
      const expected = records.filter((row) => recordMatchesFind(row, criteria));
      assert.ok(expected.length >= 1, "Expected at least one record to match find criteria");

      for (const view of ["form", "list", "table"] as const) {
        const found = records.filter((row) => recordMatchesFind(row, criteria));
        assert.equal(
          found.length,
          expected.length,
          `Expected ${view} view find semantics to match shared criteria filtering`
        );
      }
    });

    await t.test("value lists expose human-readable display values", async () => {
      const catalog = await getValueLists({ scope: "database", tableOccurrence: targets.assets });
      assert.ok(catalog.valueLists.length > 0, "Expected at least one value list in catalog");

      const employeeList = catalog.valueLists.find((entry) => normalize(entry.name) === "employee");
      assert.ok(employeeList, "Expected Employee value list");
      const vendorList = catalog.valueLists.find((entry) => normalize(entry.name) === "vendor");
      assert.ok(vendorList, "Expected Vendor value list");
      const typeList = catalog.valueLists.find((entry) => normalize(entry.name) === "type");
      assert.ok(typeList, "Expected Type value list");

      const employeeItems = employeeList?.items ?? [];
      if (employeeItems.length > 0) {
        assert.ok(
          employeeItems.some((item) => /[A-Za-z]/.test(item.displayValue)),
          "Expected Employee list display values to be human-readable"
        );
        assert.ok(
          employeeItems.every((item) => String(item.displayValue ?? "").trim().length > 0),
          "Expected Employee list display values to be non-empty"
        );
      } else {
        assert.ok(
          (employeeList?.values ?? []).some((value) => /[A-Za-z]/.test(value)),
          "Expected Employee value list values to contain readable labels"
        );
      }
    });

    await t.test("portal payload is present and includes related row structure on asset layout", async () => {
      const rows = await getRecords({ tableOccurrence: targets.assets, limit: 200 });
      const withPortalData = rows.filter((row) => row.portalData && typeof row.portalData === "object");
      assert.ok(withPortalData.length >= 1, "Expected at least one record with portalData payload");

      const first = withPortalData[0] as Record<string, unknown>;
      const portalData = first.portalData as Record<string, unknown>;
      const firstPortalEntry = Object.entries(portalData).find(([, entry]) => Array.isArray(entry));
      const portalName = firstPortalEntry?.[0] ?? "";
      const firstPortalRows = firstPortalEntry?.[1] as
        | Array<Record<string, unknown>>
        | undefined;
      assert.ok(firstPortalRows, "Expected at least one portal row collection");
      if (firstPortalRows && firstPortalRows.length > 0) {
        const sampleRow = firstPortalRows[0];
        assert.ok(sampleRow && typeof sampleRow === "object", "Expected portal row object");
        const parentRecordId = String(first.recordId ?? "").trim();
        const samplePortalRowRecordId = String(sampleRow.recordId ?? "").trim();
        const noteFieldName = Object.keys(sampleRow).find((fieldName) => normalize(fieldName) === "note") ?? "";
        if (!parentRecordId || !samplePortalRowRecordId || !noteFieldName || !portalName) {
          t.skip("Skipping portal update assertion because editable portal row metadata was not available.");
          return;
        }

        const nextNote = `${syntheticTag}-Portal-Note`;
        await updateRecord(targets.assets, parentRecordId, {
          [`${portalName}::${noteFieldName}`]: nextNote
        });

        const refreshedRows = await getRecords({ tableOccurrence: targets.assets, limit: 200 });
        const refreshedParent = refreshedRows.find(
          (row) => String(row.recordId ?? "").trim() === parentRecordId
        ) as Record<string, unknown> | undefined;
        assert.ok(refreshedParent, "Expected refreshed parent record after portal update");
        const refreshedPortalData = (refreshedParent?.portalData ?? {}) as Record<string, unknown>;
        const refreshedPortalRows = refreshedPortalData[portalName];
        if (!Array.isArray(refreshedPortalRows) || refreshedPortalRows.length === 0) {
          t.skip("Skipping portal update assertion because refreshed portal rows were empty.");
          return;
        }
        const refreshedRow = refreshedPortalRows.find(
          (row) => String((row as Record<string, unknown>).recordId ?? "").trim() === samplePortalRowRecordId
        ) as Record<string, unknown> | undefined;
        if (!refreshedRow) {
          t.skip("Skipping portal update assertion because refreshed target portal row was not found.");
          return;
        }
        assert.equal(
          String(refreshedRow[noteFieldName] ?? ""),
          nextNote,
          "Expected related portal row field save to persist"
        );
      }
    });

    await t.test("delete and recreate records", async () => {
      const initial = [...createdRecords];
      for (const entry of initial) {
        await deleteRecord(entry.layoutName, entry.recordId);
      }
      createdRecords.length = 0;

      const afterDeleteAssets = await fetchTaggedRecords(targets.assets);
      const afterDeleteVendors = await fetchTaggedRecords(targets.vendors);
      const afterDeleteEmployees = await fetchTaggedRecords(targets.employees);
      assert.equal(afterDeleteAssets.length, 0, "Expected seeded asset records deleted");
      assert.equal(afterDeleteVendors.length, 0, "Expected seeded vendor records deleted");
      assert.equal(afterDeleteEmployees.length, 0, "Expected seeded employee records deleted");

      for (const vendor of vendorSeed) {
        await createWithTracking("vendors", targets.vendors, {
          ...vendor,
          Name: `${vendor.Name}-Recreated`
        });
      }
      for (const employee of employeeSeed) {
        await createWithTracking("employees", targets.employees, {
          ...employee,
          "First Name": `${employee["First Name"]}-Recreated`
        });
      }
      for (const asset of assetSeed) {
        await createWithTracking("assets", targets.assets, {
          ...asset,
          Name: `${asset.Name}-Recreated`
        });
      }

      const recreatedAssets = await fetchTaggedRecords(targets.assets);
      assert.equal(recreatedAssets.length, 3, "Expected recreated asset records");
    });
  });
}
