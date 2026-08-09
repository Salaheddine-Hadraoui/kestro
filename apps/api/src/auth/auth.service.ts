import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import { randomUUID } from 'node:crypto';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import { verifyPassword } from './password.util';
import type { AuthTokens, PublicUser } from './types/public-user.type';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './types/token-payload.type';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly accessExpiresInSeconds: number;
  private readonly refreshSecret: string;
  private readonly refreshExpiresInMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');

    const accessExpiresIn = config.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) as ms.StringValue;
    const refreshExpiresIn = config.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as ms.StringValue;

    this.accessExpiresInSeconds = Math.round(ms(accessExpiresIn) / 1000);
    this.refreshExpiresInMs = ms(refreshExpiresIn);
  }

  async login(dto: LoginDto): Promise<AuthTokens & { user: PublicUser }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokenPair(user);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      stored.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate: the presented token is single-use. Revoking it before issuing
    // the replacement means a stolen-and-replayed old token is rejected.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(user);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    // Ignore expiration: a client should be able to log out (revoke) with a
    // refresh token that has already expired, not just a live one.
    const payload = await this.verifyRefreshToken(dto.refreshToken, {
      ignoreExpiration: true,
    });

    // updateMany rather than update: revoking an already-revoked or
    // already-rotated token is a no-op, not an error — logout is idempotent.
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException();
    }

    return this.toPublicUser(user);
  }

  private async issueTokenPair(user: User): Promise<AuthTokens> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  private signAccessToken(user: User): string {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return this.jwt.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresInSeconds,
    });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshExpiresInMs);

    const payload: RefreshTokenPayload = { sub: userId, jti };
    const token = this.jwt.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: Math.round(this.refreshExpiresInMs / 1000),
    });

    await this.prisma.refreshToken.create({
      data: { id: jti, userId, expiresAt },
    });

    return token;
  }

  private async verifyRefreshToken(
    token: string,
    options?: { ignoreExpiration?: boolean },
  ): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
        ignoreExpiration: options?.ignoreExpiration ?? false,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
