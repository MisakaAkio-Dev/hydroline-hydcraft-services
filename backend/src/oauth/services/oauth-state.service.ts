import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateRandomString } from 'better-auth/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthResultPayload, OAuthStatePayload } from '../types/provider.types';

@Injectable()
export class OAuthStateService {
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async createState(payload: OAuthStatePayload) {
    const state = generateRandomString(64, 'a-z', '0-9');
    await this.prisma.oAuthState.create({
      data: {
        state,
        payload: payload as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });
    return state;
  }

  async peekState(state: string) {
    if (!state) return null;
    const entry = await this.prisma.oAuthState.findUnique({
      where: { state },
    });
    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      return null;
    }
    return entry;
  }

  async consumeState(state: string): Promise<OAuthStatePayload | null> {
    const entry = await this.prisma.oAuthState.findUnique({ where: { state } });
    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      return null;
    }
    await this.prisma.oAuthState.update({
      where: { state },
      data: { consumedAt: new Date() },
    });
    return (entry.payload as unknown as OAuthStatePayload) ?? null;
  }

  async storeResult(state: string, result: OAuthResultPayload) {
    await this.prisma.oAuthState.update({
      where: { state },
      data: {
        result: result as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });
  }

  async consumeResult(state: string): Promise<OAuthResultPayload | null> {
    const entry = await this.prisma.oAuthState.findUnique({ where: { state } });
    if (!entry) {
      return null;
    }
    await this.prisma.oAuthState.delete({ where: { state } }).catch(() => null);
    return (entry.result as unknown as OAuthResultPayload) ?? null;
  }

  async cleanupExpired() {
    await this.prisma.oAuthState.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
