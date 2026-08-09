import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma, UserRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password.util';
import { PrismaService } from '../src/prisma/prisma.service';

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

interface FakeRefreshTokenRow {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

// Same fake-PrismaService pattern as auth.e2e-spec.ts (Prisma's WASM query
// compiler can't load under Jest's CJS runtime) — this one also implements
// the user.create/findMany/update calls UsersService makes.
function createFakePrisma(seedUsers: FakeUserRow[]) {
  const users = new Map<string, FakeUserRow>(seedUsers.map((u) => [u.id, u]));
  const refreshTokens = new Map<string, FakeRefreshTokenRow>();
  let nextId = 1;

  return {
    onModuleInit: () => undefined,
    onModuleDestroy: () => undefined,
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
            { code: 'P2002', clientVersion: '7.9.1' },
          );
        }
        const now = new Date();
        const row: FakeUserRow = {
          id: `generated-${nextId++}`,
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
              { code: 'P2002', clientVersion: '7.9.1' },
            );
          }
        }
        const updated = { ...row, ...data, updatedAt: new Date() };
        users.set(where.id, updated);
        return updated;
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
        if (!row || row.revokedAt !== null) return { count: 0 };
        refreshTokens.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
  };
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let analystToken: string;
  let leadToken: string;
  let analyst: FakeUserRow;
  let lead: FakeUserRow;

  beforeEach(async () => {
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma([analyst, lead]))
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const [analystLogin, leadLogin] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: analyst.email, password: 'analyst-password' }),
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: lead.email, password: 'lead-password' }),
    ]);
    analystToken = (analystLogin.body as { accessToken: string }).accessToken;
    leadToken = (leadLogin.body as { accessToken: string }).accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /users', () => {
    it('allows a Lead to create a user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${leadToken}`)
        .send({
          email: 'new@kestro.test',
          password: 'new-password-123',
          name: 'New Person',
          role: UserRole.analyst,
        })
        .expect(201);

      const body = response.body as Record<string, unknown>;
      expect(body).toMatchObject({
        email: 'new@kestro.test',
        role: UserRole.analyst,
      });
      expect(body.passwordHash).toBeUndefined();
    });

    it('forbids an Analyst from creating a user', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          email: 'new@kestro.test',
          password: 'new-password-123',
          name: 'New Person',
          role: UserRole.analyst,
        })
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({
          email: 'new@kestro.test',
          password: 'new-password-123',
          name: 'New Person',
          role: UserRole.analyst,
        })
        .expect(401);
    });
  });

  describe('GET /users', () => {
    it('lists users for any authenticated role, never including passwordHash', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const body = response.body as Record<string, unknown>[];
      expect(body).toHaveLength(2);
      expect(body.every((u) => u.passwordHash === undefined)).toBe(true);
    });
  });

  describe('GET /users/:id', () => {
    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get('/users/does-not-exist')
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('allows a user to update their own name', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${analyst.id}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ name: 'Renamed Analyst' })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.name).toBe('Renamed Analyst');
    });

    it('rejects a self password change with the wrong current password', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${analyst.id}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ password: 'new-password-123', currentPassword: 'wrong' })
        .expect(401);
    });

    it('forbids an Analyst from editing another user', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${lead.id}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ name: 'Hijacked' })
        .expect(403);
    });

    it("allows a Lead to change another user's role", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${analyst.id}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ role: UserRole.lead })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.role).toBe(UserRole.lead);
    });
  });

  describe('DELETE /users/:id', () => {
    it('allows a Lead to disable another user, blocking subsequent login', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${analyst.id}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: analyst.email, password: 'analyst-password' })
        .expect(401);
    });

    it('forbids an Analyst from deleting another user', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${lead.id}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(403);
    });

    it('rejects a Lead attempting to delete their own account', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${lead.id}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(409);
    });
  });
});
