import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password.util';
import type { AccessTokenPayload } from './types/token-payload.type';

const TEST_CONFIG: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
  JWT_REFRESH_EXPIRES_IN: '30d',
};

function createConfigService(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const value = TEST_CONFIG[key];
      if (value === undefined) {
        throw new Error(`Missing test config value for ${key}`);
      }
      return value;
    },
  } as unknown as ConfigService;
}

interface FakeUserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeRefreshTokenRow {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

function createPrismaMock(seedUser: FakeUserRow) {
  const users = new Map<string, FakeUserRow>([[seedUser.id, seedUser]]);
  const refreshTokens = new Map<string, FakeRefreshTokenRow>();

  const prisma = {
    user: {
      findUnique: ({
        where,
      }: {
        where: { email?: string; id?: string };
      }): FakeUserRow | null => {
        if (where.email) {
          return (
            [...users.values()].find((u) => u.email === where.email) ?? null
          );
        }
        return users.get(where.id ?? '') ?? null;
      },
    },
    refreshToken: {
      create: ({
        data,
      }: {
        data: { id: string; userId: string; expiresAt: Date };
      }): FakeRefreshTokenRow => {
        const row: FakeRefreshTokenRow = {
          ...data,
          revokedAt: null,
          createdAt: new Date(),
        };
        refreshTokens.set(row.id, row);
        return row;
      },
      findUnique: ({
        where,
      }: {
        where: { id: string };
      }): FakeRefreshTokenRow | null => refreshTokens.get(where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRefreshTokenRow>;
      }): FakeRefreshTokenRow => {
        const row = refreshTokens.get(where.id);
        if (!row) throw new Error('refresh token not found');
        const updated = { ...row, ...data };
        refreshTokens.set(where.id, updated);
        return updated;
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; revokedAt: null };
        data: Partial<FakeRefreshTokenRow>;
      }): { count: number } => {
        const row = refreshTokens.get(where.id);
        if (!row || row.revokedAt !== null) {
          return { count: 0 };
        }
        refreshTokens.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
  };

  return { prisma: prisma as unknown as PrismaService, refreshTokens };
}

describe('AuthService', () => {
  const now = new Date();
  let analystUser: FakeUserRow;

  beforeAll(async () => {
    analystUser = {
      id: 'user-1',
      email: 'analyst@kestro.test',
      passwordHash: await hashPassword('correct-password'),
      name: 'Analyst One',
      role: UserRole.analyst,
      createdAt: now,
      updatedAt: now,
    };
  });

  function createService() {
    const { prisma, refreshTokens } = createPrismaMock(analystUser);
    const jwt = new JwtService({});
    const service = new AuthService(prisma, jwt, createConfigService());
    return { service, jwt, refreshTokens };
  }

  describe('login', () => {
    it('returns tokens and the public user on valid credentials', async () => {
      const { service, jwt } = createService();

      const result = await service.login({
        email: 'analyst@kestro.test',
        password: 'correct-password',
      });

      expect(result.user).toEqual({
        id: analystUser.id,
        email: analystUser.email,
        name: analystUser.name,
        role: analystUser.role,
        createdAt: analystUser.createdAt,
        updatedAt: analystUser.updatedAt,
      });
      expect(result.user).not.toHaveProperty('passwordHash');

      const accessPayload = await jwt.verifyAsync<AccessTokenPayload>(
        result.accessToken,
        { secret: TEST_CONFIG.JWT_ACCESS_SECRET },
      );
      expect(accessPayload).toMatchObject({
        sub: analystUser.id,
        role: UserRole.analyst,
      });
    });

    it('rejects an unknown email', async () => {
      const { service } = createService();

      await expect(
        service.login({ email: 'nobody@kestro.test', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      const { service } = createService();

      await expect(
        service.login({
          email: 'analyst@kestro.test',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and revokes the old one', async () => {
      const { service, refreshTokens } = createService();

      const { refreshToken: firstRefreshToken } = await service.login({
        email: 'analyst@kestro.test',
        password: 'correct-password',
      });

      const rotated = await service.refresh({
        refreshToken: firstRefreshToken,
      });

      expect(rotated.refreshToken).not.toBe(firstRefreshToken);
      expect([...refreshTokens.values()].some((row) => row.revokedAt)).toBe(
        true,
      );

      // The old (now-revoked) token must be rejected on reuse.
      await expect(
        service.refresh({ refreshToken: firstRefreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // The newly rotated token must still work.
      const secondRotation = await service.refresh({
        refreshToken: rotated.refreshToken,
      });
      expect(secondRotation.accessToken).toEqual(expect.any(String));
    });

    it('rejects a garbage refresh token', async () => {
      const { service } = createService();

      await expect(
        service.refresh({ refreshToken: 'not-a-real-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it can no longer be used', async () => {
      const { service } = createService();

      const { refreshToken } = await service.login({
        email: 'analyst@kestro.test',
        password: 'correct-password',
      });

      await service.logout({ refreshToken });

      await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('is idempotent when called twice with the same token', async () => {
      const { service } = createService();

      const { refreshToken } = await service.login({
        email: 'analyst@kestro.test',
        password: 'correct-password',
      });

      await service.logout({ refreshToken });
      await expect(service.logout({ refreshToken })).resolves.toBeUndefined();
    });
  });

  describe('me', () => {
    it('returns the public user for a known id', async () => {
      const { service } = createService();

      const result = await service.me(analystUser.id);

      expect(result).toEqual({
        id: analystUser.id,
        email: analystUser.email,
        name: analystUser.name,
        role: analystUser.role,
        createdAt: analystUser.createdAt,
        updatedAt: analystUser.updatedAt,
      });
    });

    it('rejects an unknown id', async () => {
      const { service } = createService();

      await expect(service.me('does-not-exist')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
