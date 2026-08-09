import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password.util';
import { PrismaService } from '../src/prisma/prisma.service';

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

// PrismaService itself can't run under Jest's CJS runtime here (see
// test/app.e2e-spec.ts) — this fakes just the two models AuthService talks
// to (users, refresh_tokens) with in-memory maps, so the real HTTP pipeline
// (DTO validation, controller routing, JwtStrategy/JwtAuthGuard, JWT
// sign/verify round trip) is exercised end-to-end.
function createFakePrisma(seedUser: FakeUserRow) {
  const users = new Map<string, FakeUserRow>([[seedUser.id, seedUser]]);
  const refreshTokens = new Map<string, FakeRefreshTokenRow>();

  return {
    onModuleInit: () => undefined,
    onModuleDestroy: () => undefined,
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
        if (!row || row.revokedAt !== null) return { count: 0 };
        refreshTokens.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
  };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const credentials = {
    email: 'analyst@kestro.test',
    password: 'correct-password',
  };

  beforeEach(async () => {
    const seedUser: FakeUserRow = {
      id: 'user-1',
      email: credentials.email,
      passwordHash: await hashPassword(credentials.password),
      name: 'Analyst One',
      role: UserRole.analyst,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(seedUser))
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts's bootstrap(), which this test harness bypasses.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('logs in with valid credentials and returns tokens + user (no password hash)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    const body = response.body as {
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
    };
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      email: credentials.email,
      role: UserRole.analyst,
    });
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('rejects an invalid password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: 'wrong' })
      .expect(401);
  });

  it('rejects a malformed login body', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('GET /auth/me requires authentication', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me returns the current user for a valid access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const loginBody = login.body as { accessToken: string };

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: credentials.email,
      role: UserRole.analyst,
    });
  });

  it('rejects /auth/me with a garbage bearer token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('rotates the refresh token on /auth/refresh and rejects the old one on reuse', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const loginBody = login.body as { refreshToken: string };

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(200);
    const refreshedBody = refreshed.body as { refreshToken: string };

    expect(refreshedBody.refreshToken).not.toBe(loginBody.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(401);
  });

  it('revokes the refresh token on /auth/logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const loginBody = login.body as { refreshToken: string };

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(401);
  });
});
