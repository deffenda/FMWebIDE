import { NextResponse } from "next/server";
import {
  type CustomMenuConfig,
  readCustomMenuConfig,
  writeCustomMenuConfig
} from "@/src/server/custom-menu-storage";
import { normalizeWorkspaceId } from "@/src/server/workspace-context";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const workspaceId = normalizeWorkspaceId(params.workspaceId);
    const config = await readCustomMenuConfig(workspaceId);
    return NextResponse.json({
      workspaceId,
      customMenus: config.customMenus,
      menuSets: config.menuSets,
      defaultMenuSetId: config.defaultMenuSetId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load custom menus"
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const workspaceId = normalizeWorkspaceId(params.workspaceId);
    const payload = (await request.json()) as Partial<CustomMenuConfig>;
    const saved = await writeCustomMenuConfig(workspaceId, payload);
    return NextResponse.json({
      workspaceId,
      customMenus: saved.customMenus,
      menuSets: saved.menuSets,
      defaultMenuSetId: saved.defaultMenuSetId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save custom menus"
      },
      { status: 500 }
    );
  }
}
