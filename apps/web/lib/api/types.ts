export type UserRole = "analyst" | "lead";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  timestamp?: string;
  path?: string;
}
