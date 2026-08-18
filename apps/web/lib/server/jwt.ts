import "server-only";

// Reads the "exp" claim from a JWT's payload without verifying its
// signature. This is not a trust decision -- NestJS already verified the
// token when it issued it. This only reads the token's own metadata to
// size a cookie's maxAge correctly, instead of duplicating a guessed TTL
// the frontend has no access to (JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN
// are backend-only env vars).
export function decodeJwtExpirySeconds(token: string): number {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT: expected three segments");
  }

  const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
  const payload: unknown = JSON.parse(payloadJson);

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { exp?: unknown }).exp !== "number"
  ) {
    throw new Error('Malformed JWT: missing numeric "exp" claim');
  }

  return (payload as { exp: number }).exp;
}
