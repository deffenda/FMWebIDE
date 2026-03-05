import { LayoutModeShell } from "@/components/layout-mode-shell";

type EditPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditLayoutPage({ params, searchParams }: EditPageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const workspaceToken = query.workspace;
  const workspaceId =
    typeof workspaceToken === "string"
      ? workspaceToken
      : Array.isArray(workspaceToken)
        ? workspaceToken[0]
        : undefined;
  return <LayoutModeShell layoutId={id} workspaceId={workspaceId} />;
}
