"use client";

import { LayoutMode } from "@/components/layout-mode";

type LayoutModeShellProps = {
  layoutId: string;
  workspaceId?: string;
};

export function LayoutModeShell({ layoutId, workspaceId }: LayoutModeShellProps) {
  return <LayoutMode layoutId={layoutId} workspaceId={workspaceId} />;
}
