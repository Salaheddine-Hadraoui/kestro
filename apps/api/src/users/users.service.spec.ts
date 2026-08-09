import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { hashPassword, verifyPassword } from '../auth/password.util';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

interface FakeUserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function createPrismaMock(seedUsers: FakeUserRow[]) {
  const users = new Map<string, FakeUserRow>(seedUsers.map((u) => [u.id, u]));
  let nextId = 100;

  const prisma = {
    user: {
      create: ({
        data,
      }: {
        data: {
          email: string;
          passwordHash: string;
          name: string;
          role: UserRole;
        };
      }): FakeUserRow => {
        if ([...users.values()].some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            {
              code: 'P2002',
              clientVersion: '7.9.1',
            },
          );
        }
        const now = new Date();
        const row: FakeUserRow = {
          id: `user-${nextId++}`,
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name,
          role: data.role,
          disabledAt: null,
          createdAt: now,
          updatedAt: now,
        };
        users.set(row.id, row);
        return row;
      },
      findMany: (): FakeUserRow[] =>
        [...users.values()].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
      findUnique: ({ where }: { where: { id: string } }): FakeUserRow | null =>
        users.get(where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeUserRow>;
      }): FakeUserRow => {
        const row = users.get(where.id);
        if (!row) throw new Error('user not found');
        if (data.email && data.email !== row.email) {
          if ([...users.values()].some((u) => u.email === data.email)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed',
              {
                code: 'P2002',
                clientVersion: '7.9.1',
              },
            );
          }
        }
        const updated = { ...row, ...data, updatedAt: new Date() };
        users.set(where.id, updated);
        return updated;
      },
    },
  };

  return { prisma: prisma as unknown as PrismaService, users };
}

describe('UsersService', () => {
  let analyst: FakeUserRow;
  let lead: FakeUserRow;
  let analystActor: AuthenticatedUser;
  let leadActor: AuthenticatedUser;

  beforeAll(async () => {
    const now = new Date();
    analyst = {
      id: 'analyst-1',
      email: 'analyst@kestro.test',
      passwordHash: await hashPassword('analyst-password'),
      name: 'Analyst One',
      role: UserRole.analyst,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    lead = {
      id: 'lead-1',
      email: 'lead@kestro.test',
      passwordHash: await hashPassword('lead-password'),
      name: 'Lead One',
      role: UserRole.lead,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    analystActor = { userId: analyst.id, role: UserRole.analyst };
    leadActor = { userId: lead.id, role: UserRole.lead };
  });

  function createService() {
    const { prisma, users } = createPrismaMock([analyst, lead]);
    return { service: new UsersService(prisma), users };
  }

  describe('create', () => {
    it('creates a user and returns the public shape', async () => {
      const { service } = createService();

      const result = await service.create({
        email: 'new@kestro.test',
        password: 'new-password',
        name: 'New Person',
        role: UserRole.analyst,
      });

      expect(result).toMatchObject({
        email: 'new@kestro.test',
        name: 'New Person',
        role: UserRole.analyst,
        disabledAt: null,
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email', async () => {
      const { service } = createService();

      await expect(
        service.create({
          email: analyst.email,
          password: 'whatever123',
          name: 'Duplicate',
          role: UserRole.analyst,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll / findOne', () => {
    it('lists users without password hashes', async () => {
      const { service } = createService();

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result.every((u) => !('passwordHash' in u))).toBe(true);
    });

    it('throws NotFoundException for an unknown id', async () => {
      const { service } = createService();

      await expect(service.findOne('does-not-exist')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('allows a user to update their own name', async () => {
      const { service } = createService();

      const result = await service.update(analystActor, analyst.id, {
        name: 'Analyst Renamed',
      });

      expect(result.name).toBe('Analyst Renamed');
    });

    it('allows a user to change their own password with the correct current password', async () => {
      const { service, users } = createService();

      await service.update(analystActor, analyst.id, {
        password: 'new-password-123',
        currentPassword: 'analyst-password',
      });

      const updatedHash = users.get(analyst.id)?.passwordHash ?? '';
      await expect(
        verifyPassword('new-password-123', updatedHash),
      ).resolves.toBe(true);
      await expect(
        verifyPassword('analyst-password', updatedHash),
      ).resolves.toBe(false);
    });

    it('rejects a self password change with the wrong current password', async () => {
      const { service } = createService();

      await expect(
        service.update(analystActor, analyst.id, {
          password: 'new-password-123',
          currentPassword: 'totally-wrong',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an analyst attempting to change their own role', async () => {
      const { service } = createService();

      await expect(
        service.update(analystActor, analyst.id, { role: UserRole.lead }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects an analyst editing another user's account", async () => {
      const { service } = createService();

      await expect(
        service.update(analystActor, lead.id, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows a Lead to change another user's role", async () => {
      const { service } = createService();

      const result = await service.update(leadActor, analyst.id, {
        role: UserRole.lead,
      });

      expect(result.role).toBe(UserRole.lead);
    });

    it("allows a Lead to reset another user's password without currentPassword", async () => {
      const { service } = createService();

      const result = await service.update(leadActor, analyst.id, {
        password: 'reset-by-lead-123',
      });

      expect(result).toBeDefined();
    });

    it('allows a Lead to disable another user via disabled: true', async () => {
      const { service } = createService();

      const result = await service.update(leadActor, analyst.id, {
        disabled: true,
      });

      expect(result.disabledAt).not.toBeNull();
    });

    it('rejects an analyst attempting to disable another user', async () => {
      const { service } = createService();

      await expect(
        service.update(analystActor, lead.id, { disabled: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a Lead attempting to disable their own account via update', async () => {
      const { service } = createService();

      await expect(
        service.update(leadActor, lead.id, { disabled: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an unknown target', async () => {
      const { service } = createService();

      await expect(
        service.update(leadActor, 'does-not-exist', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes another user (sets disabledAt)', async () => {
      const { service, users } = createService();

      await service.remove(leadActor, analyst.id);

      expect(users.get(analyst.id)?.disabledAt).not.toBeNull();
    });

    it('is idempotent when the user is already disabled', async () => {
      const { service } = createService();

      await service.remove(leadActor, analyst.id);
      await expect(
        service.remove(leadActor, analyst.id),
      ).resolves.toBeUndefined();
    });

    it('rejects a Lead attempting to delete their own account', async () => {
      const { service } = createService();

      await expect(service.remove(leadActor, lead.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException for an unknown target', async () => {
      const { service } = createService();

      await expect(
        service.remove(leadActor, 'does-not-exist'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
