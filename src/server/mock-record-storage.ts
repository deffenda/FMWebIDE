import { promises as fs } from "node:fs";
import path from "node:path";
import type { FMRecord } from "@/src/lib/layout-model";
import {
  ensureWorkspaceStorage,
  normalizeWorkspaceId,
  workspaceMockRecordsDirPath
} from "@/src/server/workspace-context";

function recordsPath(tableOccurrence: string, workspaceId?: string): string {
  const safe = tableOccurrence.replace(/[^a-zA-Z0-9_-]/g, "_");
  const recordsDir = workspaceMockRecordsDirPath(workspaceId);
  return path.join(recordsDir, `${safe}.json`);
}

async function ensureRecordsDir(workspaceId?: string): Promise<void> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  await ensureWorkspaceStorage(normalizedWorkspaceId);
  await fs.mkdir(workspaceMockRecordsDirPath(normalizedWorkspaceId), { recursive: true });
}

async function defaultRecords(tableOccurrence: string): Promise<FMRecord[]> {
  if (tableOccurrence !== "Customers") {
    return [];
  }

  return [
    {
      recordId: "1",
      modId: "1",
      FirstName: "Jamie",
      Email: "jamie@example.com",
      Status: "Active"
    },
    {
      recordId: "2",
      modId: "1",
      FirstName: "Avery",
      Email: "avery@example.com",
      Status: "Prospect"
    }
  ];
}

export async function loadRecords(tableOccurrence: string, workspaceId?: string): Promise<FMRecord[]> {
  await ensureRecordsDir(workspaceId);
  const filePath = recordsPath(tableOccurrence, workspaceId);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as FMRecord[];
  } catch {
    const initial = await defaultRecords(tableOccurrence);
    await saveRecords(tableOccurrence, initial, workspaceId);
    return initial;
  }
}

export async function saveRecords(
  tableOccurrence: string,
  records: FMRecord[],
  workspaceId?: string
): Promise<void> {
  await ensureRecordsDir(workspaceId);
  await fs.writeFile(recordsPath(tableOccurrence, workspaceId), JSON.stringify(records, null, 2), "utf8");
}

export async function createRecord(
  tableOccurrence: string,
  data: FMRecord,
  workspaceId?: string
): Promise<FMRecord> {
  const records = await loadRecords(tableOccurrence, workspaceId);
  const nextId = String(
    records.reduce((max, record) => {
      const numeric = Number(record.recordId ?? 0);
      return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
    }, 0) + 1
  );

  const record: FMRecord = {
    ...data,
    recordId: nextId,
    modId: "1"
  };

  records.push(record);
  await saveRecords(tableOccurrence, records, workspaceId);
  return record;
}

export async function updateRecord(
  tableOccurrence: string,
  recordId: string,
  updates: FMRecord,
  workspaceId?: string
): Promise<FMRecord> {
  const records = await loadRecords(tableOccurrence, workspaceId);
  const index = records.findIndex((record) => record.recordId === recordId);

  if (index < 0) {
    throw new Error(`Record ${recordId} not found`);
  }

  const priorMod = Number(records[index].modId ?? "0");
  const merged: FMRecord = {
    ...records[index],
    ...updates,
    recordId,
    modId: String(priorMod + 1)
  };

  records[index] = merged;
  await saveRecords(tableOccurrence, records, workspaceId);
  return merged;
}

export async function deleteRecord(
  tableOccurrence: string,
  recordId: string,
  workspaceId?: string
): Promise<void> {
  const records = await loadRecords(tableOccurrence, workspaceId);
  const filtered = records.filter((record) => record.recordId !== recordId);
  await saveRecords(tableOccurrence, filtered, workspaceId);
}

