import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Changing a role is Lead-only, enforced in UsersService (depends on the
  // actor, not just the route, so it can't be a plain @Roles() guard).
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Required alongside `password` when a user changes their own password;
  // not required when a Lead resets another user's password.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;

  // Lead-only: soft-disable/re-enable an account (see docs/SECURITY.md —
  // no hard delete, to keep case/evidence/timeline attribution intact).
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
