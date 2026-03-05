import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function shouldBypass(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  );
}

function ssoModeEnabled(): boolean {
  return (process.env.WEBIDE_AUTH_MODE ?? "").trim().toLowerCase() === "trusted-header";
}

function resolvedHeaderName(): string {
  return (process.env.WEBIDE_SSO_HEADER ?? "x-forwarded-user").trim().toLowerCase();
}

export function middleware(request: NextRequest) {
  if (!ssoModeEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  const headerName = resolvedHeaderName();
  const user = (request.headers.get(headerName) ?? "").trim();
  if (user) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "SSO required",
        detail: `Missing trusted identity header: ${headerName}`
      },
      { status: 401 }
    );
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/";
  redirectUrl.searchParams.set("authError", "sso-required");
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"]
};

