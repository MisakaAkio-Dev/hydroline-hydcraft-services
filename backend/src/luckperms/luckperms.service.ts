import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  LUCKPERMS_CONFIG_POLL_INTERVAL_MS,
  LUCKPERMS_DB_NAMESPACE,
  LUCKPERMS_DEFAULT_SAFE_MESSAGE,
} from './luckperms.constants';
import { LuckpermsDbConfig } from './luckperms.config';
import type {
  LuckpermsLib,
  LuckpermsPlayer,
  LuckpermsHealth,
} from './luckperms.interfaces';
import { MysqlLuckpermsLib } from '../lib/luckperms/luckperms-lib';
import { PromLuckpermsMetricsRecorder } from './luckperms.metrics';
import { externalError, LuckpermsError } from './luckperms.errors';

interface ConfigEntry {
  id?: string;
  key: string;
  value: unknown;
  version: number;
  updatedAt?: string | Date;
}

@Injectable()
export class LuckpermsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LuckpermsService.name);
  private readonly metrics = new PromLuckpermsMetricsRecorder();
  private lib: LuckpermsLib | null = null;
  private currentConfig: LuckpermsDbConfig | null = null;
  private configSignature: string | null = null;
  private poller?: NodeJS.Timeout;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.refreshConfig(true);
    this.poller = setInterval(() => {
      void this.refreshConfig().catch((error) =>
        this.logger.error(
          `Failed to refresh LuckPerms config: ${String(error)}`,
        ),
      );
    }, LUCKPERMS_CONFIG_POLL_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
    }
    await this.lib?.close();
    this.lib = null;
  }

  async health(): Promise<LuckpermsHealth> {
    if (!this.currentConfig || !this.currentConfig.enabled || !this.lib) {
      return {
        ok: false,
        stage: 'CONNECT',
        message: 'LuckPerms integration disabled',
      };
    }
    return this.lib.health();
  }

  async getPlayerByUsername(username: string): Promise<LuckpermsPlayer | null> {
    const lib = await this.ensureLib();
    try {
      return await lib.getPlayerByUsername(username);
    } catch (error) {
      if (error instanceof LuckpermsError) {
        throw error;
      }
      throw externalError('QUERY', String(error));
    }
  }

  async getPlayerByUuid(uuid: string): Promise<LuckpermsPlayer | null> {
    const lib = await this.ensureLib();
    try {
      return await lib.getPlayerByUuid(uuid);
    } catch (error) {
      if (error instanceof LuckpermsError) {
        throw error;
      }
      throw externalError('QUERY', String(error));
    }
  }

  async listPlayers(offset = 0, limit = 100): Promise<LuckpermsPlayer[]> {
    const lib = await this.ensureLib();
    try {
      return await lib.listPlayers(offset, limit);
    } catch (error) {
      if (error instanceof LuckpermsError) {
        throw error;
      }
      throw externalError('QUERY', String(error));
    }
  }

  isEnabled() {
    return Boolean(this.currentConfig?.enabled && this.lib);
  }

  async getConfigSnapshot() {
    const entry = await this.configService.getEntry(
      LUCKPERMS_DB_NAMESPACE,
      'config',
    );
    if (!entry) {
      return { config: null, meta: null };
    }
    const payload = isRecord(entry.value)
      ? (entry.value as Record<string, unknown>)
      : {};
    const normalized = this.normalizeConfig(payload);
    return {
      config: normalized,
      meta: {
        id: entry.id,
        version: entry.version,
        updatedAt:
          entry.updatedAt instanceof Date
            ? entry.updatedAt.toISOString()
            : String(entry.updatedAt ?? ''),
      },
    };
  }

  async upsertConfig(config: LuckpermsDbConfig, userId?: string) {
    const namespace = await this.configService.ensureNamespaceByKey(
      LUCKPERMS_DB_NAMESPACE,
      {
        name: 'LuckPerms Database',
        description: 'LuckPerms MySQL connection configuration',
      },
    );
    const entry = await this.configService.getEntry(
      LUCKPERMS_DB_NAMESPACE,
      'config',
    );
    if (entry) {
      await this.configService.updateEntry(entry.id, { value: config }, userId);
    } else {
      await this.configService.createEntry(
        namespace.id,
        { key: 'config', value: config },
        userId,
      );
    }
    await this.refreshConfig(true);
  }

  private async ensureLib(): Promise<LuckpermsLib> {
    if (this.lib && this.currentConfig?.enabled) {
      return this.lib;
    }
    throw externalError('CONNECT', LUCKPERMS_DEFAULT_SAFE_MESSAGE);
  }

  private async refreshConfig(force = false) {
    const { signature, config } = await this.loadConfig();
    if (!config || !config.enabled) {
      if (this.lib) {
        await this.lib.close();
        this.lib = null;
      }
      this.currentConfig = config ?? null;
      this.configSignature = signature;
      return;
    }

    if (!force && signature === this.configSignature && this.lib) {
      return;
    }

    const nextLib = new MysqlLuckpermsLib({
      config,
      logger: this.logger,
      metrics: this.metrics,
    });
    const previous = this.lib;
    this.lib = nextLib;
    this.currentConfig = config;
    this.configSignature = signature;
    if (previous) {
      await previous.close().catch(() => undefined);
    }
    this.logger.log('LuckPerms connection pool refreshed');
  }

  private async loadConfig(): Promise<{
    signature: string;
    config: LuckpermsDbConfig | null;
  }> {
    const entries = (await this.configService.getEntriesByNamespaceKey(
      LUCKPERMS_DB_NAMESPACE,
    )) as ConfigEntry[];
    const primary = pickConfigEntry(entries);
    if (!primary) {
      return { signature: 'empty', config: null };
    }
    const signature = `${primary.key}:${primary.version}`;
    const payload = isRecord(primary.value) ? primary.value : {};
    const config = this.normalizeConfig(payload);
    if (!config) {
      this.logger.warn(
        'LuckPerms config missing required fields, skipping pool creation',
      );
      return { signature, config: null };
    }
    return { signature, config };
  }

  private normalizeConfig(
    payload: Record<string, unknown>,
  ): LuckpermsDbConfig | null {
    try {
      const poolRaw = isRecord(payload.pool) ? payload.pool : {};
      const pool = {
        min: toNumber(poolRaw.min, 0),
        max: toNumber(poolRaw.max, 10),
        idleMillis: toNumber(poolRaw.idleMillis, 30_000),
        acquireTimeoutMillis: toNumber(poolRaw.acquireTimeoutMillis, 10_000),
      };
      const config: LuckpermsDbConfig = {
        host: String(payload.host ?? '').trim(),
        port: toNumber(payload.port, 3306),
        database: String(payload.database ?? '').trim(),
        user: String(payload.user ?? '').trim(),
        password: String(payload.password ?? ''),
        charset: String(payload.charset ?? 'utf8mb4'),
        connectTimeoutMillis: toNumber(payload.connectTimeoutMillis, 5000),
        readonly: toBoolean(payload.readonly, false),
        enabled: toBoolean(payload.enabled, false),
        pool,
      };
      if (
        !config.host ||
        !config.database ||
        !config.user ||
        !config.password
      ) {
        return null;
      }
      return config;
    } catch (error) {
      this.logger.error(`Failed to parse LuckPerms config: ${String(error)}`);
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function looksLikeLuckpermsConfig(value: Record<string, unknown>): boolean {
  const required = ['host', 'database', 'user', 'password'];
  return required.every((key) => key in value);
}

function pickConfigEntry(entries: ConfigEntry[]) {
  if (!entries.length) {
    return null;
  }
  const preferred = entries.find(
    (entry) => entry.key === 'config' && isRecord(entry.value),
  );
  if (preferred) {
    return preferred;
  }
  return (
    entries.find(
      (entry) => isRecord(entry.value) && looksLikeLuckpermsConfig(entry.value),
    ) ?? null
  );
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return fallback;
}
