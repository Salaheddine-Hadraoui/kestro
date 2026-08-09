import { UserRole } from '../../../generated/prisma/client';

// What JwtStrategy attaches to `request.user` once an access token verifies.
export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}
