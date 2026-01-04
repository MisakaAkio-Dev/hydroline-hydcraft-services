import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateRandomString } from 'better-auth/crypto';
import { RedisService } from '../../lib/redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthResultPayload, OAuthStatePayload } from '../types/provider.types';

const STATE_KEY_PREFIX = 'oauth:state:';

interface StoredOAuthState {
  payload: OAuthStatePayload;
  consumedAt?: string;
  expiresAt: number;
  result?: OAuthResultPayload | null;
}

export interface OAuthStateEntry {
  state: string;
  payload: OAuthStatePayload;
  consumedAt: string | null;
  expiresAt: number;
  result: OAuthResultPayload | null;
}

@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  private buildKey(state: string) {
    return `${STATE_KEY_PREFIX}${state}`;
  }

  private toEntry(state: string, stored: StoredOAuthState): OAuthStateEntry {
    return {
      state,
      payload: stored.payload,
      expiresAt: stored.expiresAt,
      consumedAt: stored.consumedAt ?? null,
      result: stored.result ?? null,
    };
  }

  private isExpired(stored: StoredOAuthState) {
    return stored.expiresAt < Date.now();
  }

  private async createDbEntry(
    state: string,
    payload: OAuthStatePayload,
    expiresAt: number,
  ) {
    try {
      await this.prisma.oAuthState.create({
        data: {
          state,
          payload: payload as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(expiresAt),
        },
      });
      return true;
    } catch (error) {
      this.logger.warn('Failed to persist OAuth state to database', error);
      return false;
    }
  }

  private async updateDbEntry(
    state: string,
    updates: {
      consumedAt?: string | null;
      expiresAt?: number;
      result?: OAuthResultPayload | null;
    },
  ) {
    const data: Prisma.OAuthStateUpdateInput = {};
    if ('consumedAt' in updates) {
      data.consumedAt =
        updates.consumedAt !== undefined
          ? updates.consumedAt
            ? new Date(updates.consumedAt)
            : null
          : undefined;
    }
    if (updates.expiresAt !== undefined) {
      data.expiresAt = new Date(updates.expiresAt);
    }
    if ('result' in updates) {
      data.result = updates.result as unknown as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length === 0) {
      return;
    }
    try {
      await this.prisma.oAuthState.update({
        where: { state },
        data,
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        )
      ) {
        this.logger.warn('Failed to update OAuth state record', error);
      }
    }
  }

  private async deleteDbEntry(state: string) {
    try {
      await this.prisma.oAuthState.delete({ where: { state } });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        )
      ) {
        this.logger.warn('Failed to delete OAuth state record', error);
      }
    }
  }

  private tryParseStored(value: unknown): StoredOAuthState | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        return this.tryParseStored(parsed);
      } catch {
        return null;
      }
    }
    if (typeof value !== 'object') return null;
    const payload = (value as StoredOAuthState).payload;
    const expiresAt = (value as StoredOAuthState).expiresAt;
    const hasPayload = payload !== undefined && payload !== null;
    const hasValidExpiresAt =
      typeof expiresAt === 'number' && Number.isFinite(expiresAt);
    if (!hasPayload || !hasValidExpiresAt) {
      return null;
    }
    return value as StoredOAuthState;
  }

  private toStoredFromDb(entry: {
    payload: Prisma.JsonValue;
    consumedAt?: Date | null;
    expiresAt: Date;
    result?: Prisma.JsonValue | null;
  }): StoredOAuthState {
    return {
      payload: entry.payload as unknown as OAuthStatePayload,
      consumedAt: entry.consumedAt?.toISOString(),
      expiresAt: entry.expiresAt.getTime(),
      result: (entry.result as OAuthResultPayload | null) ?? null,
    };
  }

  private async fetchFromDb(state: string) {
    const entry = await this.prisma.oAuthState.findUnique({
      where: { state },
    });
    if (!entry) {
      return null;
    }
    return this.toStoredFromDb(entry);
  }

  private async fetchStored(state: string) {
    if (!state) return null;
    const key = this.buildKey(state);
    let cached: StoredOAuthState | null = null;
    try {
      const raw = await this.redis.get<unknown>(key);
      cached = this.tryParseStored(raw);
    } catch (error) {
      this.logger.warn('Failed to read OAuth state from cache', error);
    }
    if (cached && !this.isExpired(cached)) {
      return cached;
    }
    const dbStored = await this.fetchFromDb(state);
    if (!dbStored || this.isExpired(dbStored)) {
      await this.redis.del(key).catch(() => undefined);
      return null;
    }
    await this.redis.set(key, dbStored, this.ttlMs).catch(() => undefined);
    return dbStored;
  }

  async createState(payload: OAuthStatePayload) {
    const state = generateRandomString(64, 'a-z', '0-9');
    const expiresAt = Date.now() + this.ttlMs;
    const stored: StoredOAuthState = { payload, expiresAt };
    const key = this.buildKey(state);
    const [cacheOk, dbOk] = await Promise.all([
      this.redis
        .set(key, stored, this.ttlMs)
        .then(() => true)
        .catch((error) => {
          this.logger.warn('Failed to persist OAuth state to cache', error);
          return false;
        }),
      this.createDbEntry(state, payload, expiresAt),
    ]);
    if (!cacheOk && !dbOk) {
      throw new ServiceUnavailableException(
        'OAuth state storage is unavailable',
      );
    }
    return state;
  }

  async peekState(state: string) {
    const stored = await this.fetchStored(state);
    if (!stored) {
      return null;
    }
    return this.toEntry(state, stored);
  }

  async consumeState(state: string): Promise<OAuthStatePayload | null> {
    const stored = await this.fetchStored(state);
    if (!stored) {
      return null;
    }
    const updated: StoredOAuthState = {
      ...stored,
      consumedAt: new Date().toISOString(),
      expiresAt: Date.now() + this.ttlMs,
    };
    const key = this.buildKey(state);
    await Promise.allSettled([
      this.redis.set(key, updated, this.ttlMs),
      this.updateDbEntry(state, {
        consumedAt: updated.consumedAt,
        expiresAt: updated.expiresAt,
      }),
    ]);
    return stored.payload ?? null;
  }

  async storeResult(state: string, result: OAuthResultPayload) {
    const stored = await this.fetchStored(state);
    if (!stored) {
      return;
    }
    const updated: StoredOAuthState = {
      ...stored,
      result,
      expiresAt: Date.now() + this.ttlMs,
    };
    const key = this.buildKey(state);
    await Promise.allSettled([
      this.redis.set(key, updated, this.ttlMs),
      this.updateDbEntry(state, {
        result,
        expiresAt: updated.expiresAt,
      }),
    ]);
  }

  async consumeResult(state: string): Promise<OAuthResultPayload | null> {
    const stored = await this.fetchStored(state);
    if (!stored) {
      return null;
    }
    const key = this.buildKey(state);
    await Promise.allSettled([this.redis.del(key), this.deleteDbEntry(state)]);
    return stored.result ?? null;
  }

  async cleanupExpired() {
    await this.prisma.oAuthState.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
