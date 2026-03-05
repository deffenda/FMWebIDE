import { BrowseModeShell } from "@/components/browse-mode-shell";

type BrowsePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BrowseLayoutPage({ params, searchParams }: BrowsePageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const workspaceToken = query.workspace;
  const workspaceId =
    typeof workspaceToken === "string"
      ? workspaceToken
      : Array.isArray(workspaceToken)
        ? workspaceToken[0]
        : undefined;
  return <BrowseModeShell layoutId={id} workspaceId={workspaceId} />;
}
