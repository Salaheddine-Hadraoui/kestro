import { UserRole } from '../../../generated/prisma/client';

// User shape safe to return to clients — never includes passwordHash.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
