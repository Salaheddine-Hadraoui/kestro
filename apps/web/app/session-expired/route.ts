import { NextResponse } from "next/server";
import { logout } from "@/features/auth/service";

// A Route Handler, not a page: Route Handlers (unlike Server Components)
// are allowed to write cookies. This is the escape hatch for the one case
// proxy.ts's cheap exp-only check can't see -- an access token that is
// unexpired by its own "exp" claim but rejected by the backend anyway
// (e.g. a rotated JWT secret). Without this, there is no code path left
// that can clear such a cookie, and the user is stuck bouncing between
// "/" and "/login" forever (proxy says the cookie looks valid; NestJS's
// /auth/me says it isn't).
//
// Uses logout() (not a bare cookie clear): the refresh token backing
// this session may still be live in the backend's revocation table even
// though the access token is being rejected, and a SOC product's
// "your session ended" path should not leave a usable credential behind.
export async function GET(request: Request) {
  await logout();
  return NextResponse.redirect(new URL("/login", request.url));
}
