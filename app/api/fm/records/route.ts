import { NextResponse } from "next/server";
import {
  createRecord,
  deleteRecord,
  getRecords,
  isUsingMockData,
  updateRecord
} from "@/src/server/filemaker-client";
import { workspaceIdFromPayload, workspaceIdFromUrl } from "@/src/server/workspace-context";

export const runtime = "nodejs";

function getTableOccurrence(url: URL): string {
  return url.searchParams.get("tableOccurrence") ?? "Customers";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = workspaceIdFromUrl(url);
    const tableOccurrence = getTableOccurrence(url);
    const records = await getRecords({ tableOccurrence, limit: 250, workspaceId });

    return NextResponse.json({
      workspaceId,
      tableOccurrence,
      source: isUsingMockData({ workspaceId }) ? "mock" : "filemaker",
      records
    });
  } catch (error) {
    const workspaceId = workspaceIdFromUrl(new URL(request.url));
    const source = isUsingMockData({ workspaceId }) ? "mock" : "filemaker";
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load records",
        workspaceId,
        source
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      tableOccurrence?: string;
      fieldData?: Record<string, unknown>;
      workspaceId?: string;
    };
    const workspaceId = workspaceIdFromPayload(payload);

    const tableOccurrence = payload.tableOccurrence ?? "Customers";
    const fieldData = payload.fieldData ?? {};
    const record = await createRecord(tableOccurrence, fieldData, { workspaceId });

    return NextResponse.json({ workspaceId, record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create record"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as {
      tableOccurrence?: string;
      recordId?: string;
      fieldData?: Record<string, unknown>;
      portalData?: Record<string, Array<Record<string, unknown>>>;
      modId?: string;
      workspaceId?: string;
    };
    const workspaceId = workspaceIdFromPayload(payload);

    if (!payload.recordId) {
      return NextResponse.json({ error: "recordId is required" }, { status: 400 });
    }

    const tableOccurrence = payload.tableOccurrence ?? "Customers";
    const record = await updateRecord(tableOccurrence, payload.recordId, payload.fieldData ?? {}, {
      workspaceId,
      portalData: payload.portalData,
      modId: payload.modId
    });
    return NextResponse.json({ workspaceId, record });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update record"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as {
      tableOccurrence?: string;
      recordId?: string;
      workspaceId?: string;
    };
    const workspaceId = workspaceIdFromPayload(payload);

    if (!payload.recordId) {
      return NextResponse.json({ error: "recordId is required" }, { status: 400 });
    }

    await deleteRecord(payload.tableOccurrence ?? "Customers", payload.recordId, { workspaceId });
    return NextResponse.json({ success: true, workspaceId });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete record"
      },
      { status: 500 }
    );
  }
}
