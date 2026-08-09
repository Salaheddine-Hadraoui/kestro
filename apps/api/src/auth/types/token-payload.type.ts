import { UserRole } from '../../../generated/prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

// Deliberately carries no role/authorization claims — refresh tokens only
// prove identity and correlate to a revocable `refresh_tokens` row via `jti`.
// A fresh role is looked up from the database on every refresh.
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}
