"use client";

import { BrowseMode } from "@/components/browse-mode";

type BrowseModeShellProps = {
  layoutId: string;
  workspaceId?: string;
};

export function BrowseModeShell({ layoutId, workspaceId }: BrowseModeShellProps) {
  return <BrowseMode layoutId={layoutId} workspaceId={workspaceId} />;
}
