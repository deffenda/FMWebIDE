import { NextResponse } from "next/server";

export const runtime = "nodejs";

function resolvedHeaderName(): string {
  return (process.env.WEBIDE_SSO_HEADER ?? "x-forwarded-user").trim();
}

function ssoModeEnabled(): boolean {
  return (process.env.WEBIDE_AUTH_MODE ?? "").trim().toLowerCase() === "trusted-header";
}

export async function GET(request: Request) {
  const headerName = resolvedHeaderName();
  const user = (request.headers.get(headerName) ?? "").trim();

  return NextResponse.json({
    ssoMode: ssoModeEnabled() ? "trusted-header" : "disabled",
    header: headerName,
    authenticated: user.length > 0,
    user: user || null
  });
}

