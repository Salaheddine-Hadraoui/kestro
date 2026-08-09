import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';

export const ROLES_KEY = 'roles';

// Marks a handler/controller as requiring one of the given roles. Enforced
// by RolesGuard, which reads this metadata via Reflector.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
