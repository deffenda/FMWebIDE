import Link from "next/link";

const defaultLayoutName = "Customers";
const defaultWorkspaceId = "default";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const authError =
    typeof params.authError === "string" ? params.authError : Array.isArray(params.authError) ? params.authError[0] : "";

  return (
    <main className="home-root">
      <section className="home-card">
        <p className="eyebrow">FileMaker Web IDE</p>
        <h1>Layout Mode + Browse Mode</h1>
        <p>
          Build layouts visually, persist layout JSON, and switch into runtime mode backed by
          FileMaker Data API endpoints.
        </p>
        {authError === "sso-required" ? (
          <p className="home-auth-error">
            Authentication required. This environment is configured for trusted-header SSO.
          </p>
        ) : null}
        <div className="home-actions">
          <Link
            href={`/layouts/${encodeURIComponent(defaultLayoutName)}/edit?workspace=${encodeURIComponent(defaultWorkspaceId)}`}
            className="btn primary"
          >
            Open Layout Mode
          </Link>
          <Link
            href={`/layouts/${encodeURIComponent(defaultLayoutName)}/browse?workspace=${encodeURIComponent(defaultWorkspaceId)}`}
            className="btn"
          >
            Open Browse Mode
          </Link>
        </div>
      </section>
    </main>
  );
}
