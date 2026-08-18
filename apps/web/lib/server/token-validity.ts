import "server-only";
import { decodeJwtExpirySeconds } from "./jwt";

// True if the token is present, well-formed, and not yet past its own
// "exp" claim. Used by proxy.ts to decide whether a proactive refresh is
// needed -- not a trust decision (NestJS's own verification is what
// actually matters), just a cheap pre-check.
export function isTokenValid(token: string | undefined): boolean {
  if (!token) {
    return false;
  }
  try {
    return decodeJwtExpirySeconds(token) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
