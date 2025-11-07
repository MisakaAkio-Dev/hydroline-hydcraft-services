import { Injectable, Logger } from '@nestjs/common';
import { LifecycleEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthmeUser } from './authme.interfaces';
import { businessError } from './authme.errors';
import { normalizeIpAddress } from '../lib/ip2region/ip-normalizer';
import { LuckpermsService } from '../luckperms/luckperms.service';

@Injectable()
export class AuthmeBindingService {
  private readonly logger = new Logger(AuthmeBindingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly luckpermsService: LuckpermsService,
  ) {}

  listBindingsByUserId(userId: string) {
    return this.prisma.userAuthmeBinding.findMany({
      where: { userId },
      orderBy: { boundAt: 'asc' },
    });
  }

  getBindingByUsernameLower(authmeUsernameLower: string) {
    return this.prisma.userAuthmeBinding.findUnique({
      where: { authmeUsernameLower },
    });
  }

  async bindUser(options: {
    userId: string;
    authmeUser: AuthmeUser;
    operatorUserId?: string;
    sourceIp?: string | null;
  }) {
    const normalizedUsername = options.authmeUser.username.toLowerCase();
    const resolvedUuid = await this.resolvePlayerUuid(
      options.authmeUser.username,
      options.authmeUser.realname,
    );
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAuthmeBinding.findUnique({
        where: { authmeUsernameLower: normalizedUsername },
      });
      if (existing && existing.userId !== options.userId) {
        throw businessError({
          type: 'BUSINESS_VALIDATION_FAILED',
          code: 'BINDING_CONFLICT',
          safeMessage: '该 AuthMe 账号已绑定其他用户，请先解绑后再试',
        });
      }

      // Upsert by unique username; if it exists for same user, update metadata; if not exists, create a new binding
      const binding = await tx.userAuthmeBinding.upsert({
        where: { authmeUsernameLower: normalizedUsername },
        update: {
          userId: options.userId,
          authmeUsername: options.authmeUser.username,
          authmeRealname: options.authmeUser.realname,
          authmeUuid: resolvedUuid ?? existing?.authmeUuid ?? null,
          boundAt: new Date(),
          boundByUserId: options.operatorUserId ?? options.userId,
          boundByIp: sanitizeIp(options.sourceIp),
        },
        create: {
          userId: options.userId,
          authmeUsername: options.authmeUser.username,
          authmeUsernameLower: normalizedUsername,
          authmeRealname: options.authmeUser.realname,
          authmeUuid: resolvedUuid,
          boundByUserId: options.operatorUserId ?? options.userId,
          boundByIp: sanitizeIp(options.sourceIp),
        },
      });

      const profile = await tx.userProfile.findUnique({
        where: { userId: options.userId },
        select: { primaryAuthmeBindingId: true },
      });
      if (!profile) {
        await tx.userProfile.create({
          data: {
            userId: options.userId,
            primaryAuthmeBindingId: binding.id,
          },
        });
      } else if (!profile.primaryAuthmeBindingId) {
        await tx.userProfile.update({
          where: { userId: options.userId },
          data: { primaryAuthmeBindingId: binding.id },
        });
      }

      await tx.userLifecycleEvent.create({
        data: {
          userId: options.userId,
          eventType: LifecycleEventType.ACCOUNT_BIND,
          occurredAt: new Date(),
          source: 'authme-binding',
          metadata: this.toJson({
            authmeUsername: options.authmeUser.username,
            realname: options.authmeUser.realname,
          }),
          createdById: options.operatorUserId ?? options.userId,
        },
      });

      return binding;
    });
  }

  async unbindUser(options: {
    userId: string;
    usernameLower?: string;
    operatorUserId?: string;
    sourceIp?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (options.usernameLower) {
        const target = await tx.userAuthmeBinding.findUnique({
          where: { authmeUsernameLower: options.usernameLower },
        });
        if (!target || target.userId !== options.userId) {
          return null;
        }
        await tx.userAuthmeBinding.delete({
          where: { authmeUsernameLower: options.usernameLower },
        });
        await this.handleBindingRemoval(tx, target);
        await tx.userLifecycleEvent.create({
          data: {
            userId: options.userId,
            eventType: LifecycleEventType.ACCOUNT_UNBIND,
            occurredAt: new Date(),
            source: 'authme-binding',
            metadata: this.toJson({ authmeUsername: target.authmeUsername }),
            createdById: options.operatorUserId ?? options.userId,
          },
        });
        return target;
      }

      const bindings = await tx.userAuthmeBinding.findMany({
        where: { userId: options.userId },
      });
      if (bindings.length === 0) return null;
      await tx.userAuthmeBinding.deleteMany({
        where: { userId: options.userId },
      });
      for (const b of bindings) {
        await this.handleBindingRemoval(tx, b);
        await tx.userLifecycleEvent.create({
          data: {
            userId: options.userId,
            eventType: LifecycleEventType.ACCOUNT_UNBIND,
            occurredAt: new Date(),
            source: 'authme-binding',
            metadata: this.toJson({ authmeUsername: b.authmeUsername }),
            createdById: options.operatorUserId ?? options.userId,
          },
        });
      }
      return bindings[0];
    });
  }

  private toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private async resolvePlayerUuid(
    authmeUsername: string,
    authmeRealname: string | null,
  ): Promise<string | null> {
    try {
      const identifier =
        typeof authmeRealname === 'string' && authmeRealname.length > 0
          ? authmeRealname
          : authmeUsername;
      const player = await this.luckpermsService
        .getPlayerByUsername(identifier)
        .catch(() => null);
      return player?.uuid ?? null;
    } catch (error) {
      this.logger.debug(
        `Failed to resolve LuckPerms UUID for ${authmeUsername}: ${String(error)}`,
      );
      return null;
    }
  }

  private async handleBindingRemoval(
    tx: Prisma.TransactionClient,
    binding: { id: string; userId: string },
  ) {
    await tx.userProfile.updateMany({
      where: {
        userId: binding.userId,
        primaryAuthmeBindingId: binding.id,
      },
      data: { primaryAuthmeBindingId: null },
    });
    await tx.userMinecraftProfile.updateMany({
      where: { userId: binding.userId, authmeBindingId: binding.id },
      data: { authmeBindingId: null },
    });
  }
}

function sanitizeIp(ip?: string | null) {
  const first = typeof ip === 'string' ? ip.split(',')[0] : null;
  return normalizeIpAddress(first) ?? null;
}
