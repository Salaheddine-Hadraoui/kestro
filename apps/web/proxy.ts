import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/server/cookie-names";
import { isPublicPath } from "@/lib/server/protected-paths";

// Optimistic only: this checks for the *presence* of the access-token
// cookie, nothing more. The authoritative check is verifySession() in the
// auth feature's Data Access Layer, which asks NestJS's /auth/me -- the
// only source of truth for whether a session is actually valid. This
// proxy exists purely so a signed-out browser doesn't render a protected
// page's shell (and a signed-in browser doesn't see the login page),
// matching Next's own "optimistic checks only in Proxy" guidance.
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(ACCESS_TOKEN_COOKIE);
  const { pathname } = request.nextUrl;

  if (!hasSessionCookie && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSessionCookie && isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
