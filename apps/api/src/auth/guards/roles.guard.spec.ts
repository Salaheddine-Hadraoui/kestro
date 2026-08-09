import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

function createContext(
  user: { userId: string; role: UserRole } | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createReflector(requiredRoles: UserRole[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows access when the route requires no specific role', () => {
    const guard = new RolesGuard(createReflector(undefined));

    expect(
      guard.canActivate(
        createContext({ userId: 'user-1', role: UserRole.analyst }),
      ),
    ).toBe(true);
  });

  it('allows access when the user holds a required role', () => {
    const guard = new RolesGuard(createReflector([UserRole.lead]));

    expect(
      guard.canActivate(
        createContext({ userId: 'user-1', role: UserRole.lead }),
      ),
    ).toBe(true);
  });

  it('denies access when the user lacks a required role', () => {
    const guard = new RolesGuard(createReflector([UserRole.lead]));

    expect(() =>
      guard.canActivate(
        createContext({ userId: 'user-1', role: UserRole.analyst }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies access when there is no authenticated user on the request', () => {
    const guard = new RolesGuard(createReflector([UserRole.lead]));

    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
