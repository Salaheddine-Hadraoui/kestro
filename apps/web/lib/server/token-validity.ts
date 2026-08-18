import "server-only";
import { decodeJwtExpirySeconds } from "./jwt";

// True if the token is present, well-formed, and not expiring within the
// next `leewaySeconds` (default 30s). The leeway absorbs the gap between
// this check running and the token actually being used a moment later --
// without it, a token expiring in (say) 200ms would pass here and then
// get rejected by the backend a moment into the same request.
export function isTokenValid(token: string | undefined, leewaySeconds = 30): boolean {
  if (!token) {
    return false;
  }
  try {
    return decodeJwtExpirySeconds(token) > Math.floor(Date.now() / 1000) + leewaySeconds;
  } catch {
    return false;
  }
}
