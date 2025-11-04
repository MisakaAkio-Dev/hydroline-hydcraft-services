import { Injectable, Logger } from '@nestjs/common';
import { LifecycleEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthmeUser } from './authme.interfaces';
import { businessError } from './authme.errors';

@Injectable()
export class AuthmeBindingService {
  private readonly logger = new Logger(AuthmeBindingService.name);

  constructor(private readonly prisma: PrismaService) {}

  getBindingByUserId(userId: string) {
    return this.prisma.userAuthmeBinding.findUnique({ where: { userId } });
  }

  getBindingByUsernameLower(authmeUsernameLower: string) {
    return this.prisma.userAuthmeBinding.findUnique({ where: { authmeUsernameLower } });
  }

  async bindUser(options: {
    userId: string;
    authmeUser: AuthmeUser;
    operatorUserId?: string;
    sourceIp?: string | null;
  }) {
    const normalizedUsername = options.authmeUser.username.toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userAuthmeBinding.findUnique({ where: { authmeUsernameLower: normalizedUsername } });
      if (existing && existing.userId !== options.userId) {
        throw businessError({
          type: 'BUSINESS_VALIDATION_FAILED',
          code: 'BINDING_CONFLICT',
          safeMessage: '该 AuthMe 账号已绑定其他用户，请先解绑后再试',
        });
      }

      const binding = await tx.userAuthmeBinding.upsert({
        where: { userId: options.userId },
        update: {
          authmeUsername: options.authmeUser.username,
          authmeUsernameLower: normalizedUsername,
          authmeRealname: options.authmeUser.realname,
          boundAt: new Date(),
          boundByUserId: options.operatorUserId ?? options.userId,
          boundByIp: sanitizeIp(options.sourceIp),
        },
        create: {
          userId: options.userId,
          authmeUsername: options.authmeUser.username,
          authmeUsernameLower: normalizedUsername,
          authmeRealname: options.authmeUser.realname,
          boundByUserId: options.operatorUserId ?? options.userId,
          boundByIp: sanitizeIp(options.sourceIp),
        },
      });

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

  async unbindUser(options: { userId: string; operatorUserId?: string; sourceIp?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const binding = await tx.userAuthmeBinding.findUnique({ where: { userId: options.userId } });
      if (!binding) {
        return null;
      }
      await tx.userAuthmeBinding.delete({ where: { userId: options.userId } });
      await tx.userLifecycleEvent.create({
        data: {
          userId: options.userId,
          eventType: LifecycleEventType.ACCOUNT_UNBIND,
          occurredAt: new Date(),
          source: 'authme-binding',
          metadata: this.toJson({ authmeUsername: binding.authmeUsername }),
          createdById: options.operatorUserId ?? options.userId,
        },
      });
      return binding;
    });
  }

  private toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}

function sanitizeIp(ip?: string | null) {
  if (!ip) return null;
  return ip.split(',')[0].trim();
}
