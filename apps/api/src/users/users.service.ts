import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client';
import {
  Prisma as PrismaRuntime,
  UserRole,
} from '../../generated/prisma/client';
import { hashPassword, verifyPassword } from '../auth/password.util';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { PublicUser } from '../auth/types/public-user.type';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: dto.role,
        },
      });
      return this.toPublicUser(user);
    } catch (error) {
      this.rethrowAsConflictIfDuplicateEmail(error);
    }
  }

  async findAll(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => this.toPublicUser(user));
  }

  async findOne(id: string): Promise<PublicUser> {
    const user = await this.findUserOrThrow(id);
    return this.toPublicUser(user);
  }

  async update(
    actor: AuthenticatedUser,
    targetId: string,
    dto: UpdateUserDto,
  ): Promise<PublicUser> {
    const target = await this.findUserOrThrow(targetId);
    const isSelf = actor.userId === targetId;
    const isLead = actor.role === UserRole.lead;

    if (!isSelf && !isLead) {
      throw new ForbiddenException(
        "Only a Lead can update another user's account",
      );
    }

    if (dto.role !== undefined && !isLead) {
      throw new ForbiddenException('Only a Lead can change a role');
    }

    if (dto.disabled !== undefined) {
      if (!isLead) {
        throw new ForbiddenException('Only a Lead can change account status');
      }
      if (isSelf && dto.disabled) {
        throw new ConflictException('Cannot disable your own account');
      }
    }

    if (dto.password !== undefined && isSelf) {
      if (
        !dto.currentPassword ||
        !(await verifyPassword(dto.currentPassword, target.passwordHash))
      ) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.disabled !== undefined) {
      data.disabledAt = dto.disabled ? new Date() : null;
    }
    if (dto.password !== undefined) {
      data.passwordHash = await hashPassword(dto.password);
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: targetId },
        data,
      });
      return this.toPublicUser(updated);
    } catch (error) {
      this.rethrowAsConflictIfDuplicateEmail(error);
    }
  }

  async remove(actor: AuthenticatedUser, targetId: string): Promise<void> {
    const target = await this.findUserOrThrow(targetId);

    if (actor.userId === targetId) {
      throw new ConflictException('Cannot disable your own account');
    }

    if (target.disabledAt) {
      return;
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { disabledAt: new Date() },
    });
  }

  private async findUserOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private rethrowAsConflictIfDuplicateEmail(error: unknown): never {
    if (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new ConflictException('Email is already in use');
    }
    throw error;
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
