import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Prisma,
  TransportationRailwaySyncJob,
  TransportationRailwaySyncStatus,
  TransportationRailwayMod,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { HydrolineBeaconPoolService } from '../../../lib/hydroline-beacon';
import { HydrolineBeaconEvent } from '../../../lib/hydroline-beacon/beacon.client';
import { TransportationRailwaySnapshotService } from '../snapshot/railway-snapshot.service';
import {
  DEFAULT_RAILWAY_TYPE,
  RAILWAY_TYPE_CONFIG,
  RailwayTypeConfig,
} from '../config/railway-type.config';

const BEACON_TIMEOUT_MS = 10000;
const QUERY_LIMIT = 200;
const UPSERT_BATCH_SIZE = 25;
const LOG_LOOKBACK_DAYS = 7;

type BeaconServerRecord = {
  id: string;
  displayName: string;
  beaconEndpoint: string;
  beaconKey: string;
  beaconRequestTimeoutMs?: number | null;
  railwayMod: TransportationRailwayMod;
};

type QueryMtrEntitiesResponse = {
  success?: boolean;
  category?: string;
  rows?: Array<Record<string, unknown>>;
  limit?: number;
  offset?: number;
  truncated?: boolean;
};

type QueryMtrLogsResponse = {
  success?: boolean;
  error?: string;
  total?: number;
  page?: number;
  page_size?: number;
  records?: Array<Record<string, unknown>>;
};

type StoredJsonValue = Prisma.JsonNullValueInput | Prisma.InputJsonValue;

type RailwaySyncJobStatus = {
  id: string;
  serverId: string;
  status: TransportationRailwaySyncStatus;
  message: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type RailwayLogSyncJobStatus = {
  id: string;
  serverId: string;
  mode: string;
  status: TransportationRailwaySyncStatus;
  message: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type RailwayEntityCategory =
  | 'DEPOT'
  | 'PLATFORM'
  | 'RAIL'
  | 'ROUTE'
  | 'SIGNAL_BLOCK'
  | 'STATION';

type SyncCategoryStats = {
  beaconRows: number;
  persisted: number;
  skipped: number;
  changed: number;
  unchanged: number;
  staleDeleted: number;
  pages: number;
};

type UpsertEntityStats = {
  processed: boolean;
  unchanged: boolean;
  upserted: boolean;
};

type SyncLogStats = {
  mode: 'full' | 'diff';
  total: number;
  beaconRows: number;
  persisted: number;
  skipped: number;
  deletedBefore: number;
};

const CATEGORY_MAP: Array<{
  key: string;
  type: RailwayEntityCategory;
}> = [
  { key: 'depots', type: 'DEPOT' },
  {
    key: 'platforms',
    type: 'PLATFORM',
  },
  { key: 'rails', type: 'RAIL' },
  { key: 'routes', type: 'ROUTE' },
  {
    key: 'signal-blocks',
    type: 'SIGNAL_BLOCK',
  },
  { key: 'stations', type: 'STATION' },
];

@Injectable()
export class TransportationRailwaySyncService implements OnModuleInit {
  private readonly logger = new Logger(TransportationRailwaySyncService.name);
  private syncing = false;
  private runningServerJobs = new Set<string>();
  private runningServerLogJobs = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly beaconPool: HydrolineBeaconPoolService,
    private readonly snapshotService: TransportationRailwaySnapshotService,
  ) {}

  onModuleInit() {
    void this.ensureInitialSync();
  }

  @Cron('15,45 * * * *')
  async handleScheduledSync() {
    await this.runSync();
  }

  private async ensureInitialSync() {
    try {
      await this.runSync();
    } catch (error) {
      this.logger.warn(
        `Initial railway sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async runSync() {
    if (this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const servers = await this.listBeaconServers();
      servers.forEach((server) => this.ensureBeaconClient(server));
      await this.waitForBeaconConnections(servers.map((server) => server.id));
      for (const server of servers) {
        await this.syncServer(server);
      }
    } catch (error) {
      this.logger.error(
        `Railway sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.syncing = false;
    }
  }

  private async syncServer(server: BeaconServerRecord) {
    this.logger.log(`Syncing railway data for ${server.displayName}`);
    const syncMarker = new Date();
    const summary = {
      beaconRows: 0,
      persisted: 0,
      skipped: 0,
      changed: 0,
      unchanged: 0,
      staleDeleted: 0,
      pages: 0,
    };
    for (const category of CATEGORY_MAP) {
      const stats = await this.syncCategory(
        server,
        category.key,
        category.type,
        syncMarker,
      );
      summary.beaconRows += stats.beaconRows;
      summary.persisted += stats.persisted;
      summary.skipped += stats.skipped;
      summary.changed += stats.changed;
      summary.unchanged += stats.unchanged;
      summary.staleDeleted += stats.staleDeleted;
      summary.pages += stats.pages;
    }
    const logStats = await this.syncLogs(server);
    await this.snapshotService.computeAndPersistAllSnapshotsForServer({
      serverId: server.id,
      railwayMod: server.railwayMod,
    });
    this.logger.log(
      `[RailwaySync] ${server.displayName} summary: beacon=${summary.beaconRows} persisted=${summary.persisted} skipped=${summary.skipped} changed=${summary.changed} unchanged=${summary.unchanged} staleDeleted=${summary.staleDeleted} pages=${summary.pages} logs(mode=${logStats.mode} beacon=${logStats.beaconRows} persisted=${logStats.persisted} skipped=${logStats.skipped} deletedBefore=${logStats.deletedBefore})`,
    );
    this.logger.log(
      `Railway sync completed successfully for ${server.displayName}`,
    );
  }

  async syncServerById(serverId: string) {
    const servers = await this.listBeaconServers();
    const target = servers.find((server) => server.id === serverId);
    if (!target) {
      throw new NotFoundException('Beacon-enabled server not found');
    }
    this.ensureBeaconClient(target);
    await this.waitForBeaconConnections([target.id]);
    await this.syncServer(target);
  }

  async syncLogsByServerId(
    serverId: string,
    options?: { mode?: 'full' | 'diff' },
  ) {
    const servers = await this.listBeaconServers();
    const target = servers.find((server) => server.id === serverId);
    if (!target) {
      throw new NotFoundException('Beacon-enabled server not found');
    }
    this.ensureBeaconClient(target);
    await this.waitForBeaconConnections([target.id]);
    return await this.syncLogs(target, options);
  }

  async enqueueSyncJob(
    serverId: string,
    initiatedById: string | null,
  ): Promise<RailwaySyncJobStatus> {
    const job = await this.prisma.transportationRailwaySyncJob.create({
      data: {
        serverId,
        initiatedById,
        status: TransportationRailwaySyncStatus.PENDING,
      },
    });
    void this.executeSyncJob(job.id).catch((error) =>
      this.logger.error(
        `Railway sync job ${job.id} failed to start: ${this.extractMessage(error)}`,
      ),
    );
    return this.buildJobStatus(job);
  }

  async enqueueLogSyncJob(
    serverId: string,
    mode: 'full' | 'diff' = 'diff',
  ): Promise<RailwayLogSyncJobStatus> {
    const job = await this.prisma.transportationRailwayLogSyncJob.create({
      data: {
        serverId,
        mode,
        status: TransportationRailwaySyncStatus.PENDING,
      },
    });
    void this.executeLogSyncJob(job.id).catch((error) =>
      this.logger.error(
        `Railway log sync job ${job.id} failed to start: ${this.extractMessage(error)}`,
      ),
    );
    return this.buildLogJobStatus(job);
  }

  async getSyncJob(jobId: string): Promise<RailwaySyncJobStatus> {
    const job = await this.prisma.transportationRailwaySyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException('Sync task not found');
    }
    return this.buildJobStatus(job);
  }

  async getLogSyncJob(jobId: string): Promise<RailwayLogSyncJobStatus> {
    const job = await this.prisma.transportationRailwayLogSyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException('Log sync task not found');
    }
    return this.buildLogJobStatus(job);
  }

  async getLatestActiveJob(serverId: string) {
    const job = await this.prisma.transportationRailwaySyncJob.findFirst({
      where: {
        serverId,
        status: {
          in: [
            TransportationRailwaySyncStatus.PENDING,
            TransportationRailwaySyncStatus.RUNNING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.buildJobStatus(job) : null;
  }

  async getLatestActiveLogJob(serverId: string) {
    const job = await this.prisma.transportationRailwayLogSyncJob.findFirst({
      where: {
        serverId,
        status: {
          in: [
            TransportationRailwaySyncStatus.PENDING,
            TransportationRailwaySyncStatus.RUNNING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.buildLogJobStatus(job) : null;
  }

  private async syncCategory(
    server: BeaconServerRecord,
    category: string,
    entityType: RailwayEntityCategory,
    syncMarker: Date,
  ): Promise<SyncCategoryStats> {
    const config = this.getRailwayModConfig(server.railwayMod);
    const stats: SyncCategoryStats = {
      beaconRows: 0,
      persisted: 0,
      skipped: 0,
      changed: 0,
      unchanged: 0,
      staleDeleted: 0,
      pages: 0,
    };

    const response = await this.emitBeacon<QueryMtrEntitiesResponse>(
      server,
      config.queryEvent,
      {
        category,
        all: true,
        includePayload: true,
      },
    );
    const rows = Array.isArray(response?.rows) ? response.rows : [];
    stats.pages = 1;
    stats.beaconRows = rows.length;
    if (rows.length) {
      const batch = await this.upsertRowsInBatches(
        server,
        entityType,
        rows,
        syncMarker,
      );
      stats.persisted += batch.persisted;
      stats.skipped += batch.skipped;
      stats.changed += batch.changed;
      stats.unchanged += batch.unchanged;
    }

    stats.staleDeleted = await this.deleteStaleEntities(
      entityType,
      server,
      syncMarker,
    );
    return stats;
  }

  private async syncLogs(
    server: BeaconServerRecord,
    options?: { mode?: 'full' | 'diff' },
  ): Promise<SyncLogStats> {
    const existing = await this.prisma.transportationRailwayLog.findFirst({
      where: { serverId: server.id },
      select: { id: true },
    });
    const shouldFullSync =
      options?.mode === 'full' || (!existing && options?.mode !== 'diff');
    const payload: Record<string, unknown> = {
      orderColumn: 'id',
      order: 'asc',
    };
    let deletedBefore = 0;
    if (shouldFullSync) {
      deletedBefore = (
        await this.prisma.transportationRailwayLog.deleteMany({
          where: { serverId: server.id },
        })
      ).count;
      payload.all = true;
    } else {
      const { startDate, endDate } = this.getLogSyncDateRange();
      payload.startDate = startDate;
      payload.endDate = endDate;
    }
    const response = await this.emitBeacon<QueryMtrLogsResponse>(
      server,
      'get_player_mtr_logs',
      payload,
    );
    if (!response?.success) {
      const message =
        typeof response?.error === 'string'
          ? response.error
          : 'Failed to sync MTR logs';
      throw new Error(message);
    }
    const rows = Array.isArray(response?.records) ? response.records : [];
    if (!rows.length) {
      return {
        mode: shouldFullSync ? 'full' : 'diff',
        total: 0,
        beaconRows: 0,
        persisted: 0,
        skipped: 0,
        deletedBefore,
      };
    }
    const logBatch = await this.upsertLogRowsInBatches(server, rows);
    return {
      mode: shouldFullSync ? 'full' : 'diff',
      total: rows.length,
      beaconRows: rows.length,
      persisted: logBatch.persisted,
      skipped: logBatch.skipped,
      deletedBefore,
    };
  }

  private async upsertEntity(
    server: BeaconServerRecord,
    category: RailwayEntityCategory,
    row: Record<string, unknown>,
    syncMarker: Date,
  ): Promise<UpsertEntityStats> {
    const entityId = this.readString(row.entity_id ?? row.node_pos);
    if (!entityId) {
      return { processed: false, unchanged: false, upserted: false };
    }
    const filePath = this.readString(row.file_path);
    const railwayMod = this.resolveRailwayMod(server.railwayMod);
    const dimensionContext =
      this.readString(row.dimension_context) ??
      this.inferDimensionContext(filePath, railwayMod);
    const payload = this.normalizePayload(row.payload);
    const lastUpdated = this.readTimestamp(row.last_updated);
    const result = await this.persistEntityByCategory(category, server, {
      entityId,
      railwayMod,
      dimensionContext,
      transportMode: this.readString(row.transport_mode),
      name: this.readString(row.name),
      color: this.readNumber(row.color),
      filePath,
      payload,
      lastBeaconUpdatedAt: lastUpdated,
      syncedAt: syncMarker,
    });
    if (dimensionContext) {
      await this.prisma.transportationRailwayDimension.upsert({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: server.id,
            railwayMod,
            dimensionContext,
          },
        },
        update: {
          railwayMod,
          namespace: this.extractNamespace(dimensionContext),
          dimension: this.extractDimension(dimensionContext),
          lastUpdated: syncMarker,
        },
        create: {
          serverId: server.id,
          railwayMod,
          dimensionContext,
          namespace: this.extractNamespace(dimensionContext),
          dimension: this.extractDimension(dimensionContext),
          lastUpdated: syncMarker,
        },
      });
    }
    return {
      processed: true,
      unchanged: result.unchanged,
      upserted: result.upserted,
    };
  }

  private async upsertRowsInBatches(
    server: BeaconServerRecord,
    category: RailwayEntityCategory,
    rows: Array<Record<string, unknown>>,
    syncMarker: Date,
  ): Promise<{
    persisted: number;
    skipped: number;
    changed: number;
    unchanged: number;
  }> {
    const stats = { persisted: 0, skipped: 0, changed: 0, unchanged: 0 };
    const pending: Array<Promise<UpsertEntityStats>> = [];
    for (const row of rows) {
      pending.push(this.upsertEntity(server, category, row, syncMarker));
      if (pending.length >= UPSERT_BATCH_SIZE) {
        const results = await Promise.all(pending);
        for (const result of results) {
          if (!result.processed) {
            stats.skipped += 1;
            continue;
          }
          stats.persisted += 1;
          if (result.unchanged) stats.unchanged += 1;
          if (result.upserted) stats.changed += 1;
        }
        pending.length = 0;
      }
    }
    if (pending.length) {
      const results = await Promise.all(pending);
      for (const result of results) {
        if (!result.processed) {
          stats.skipped += 1;
          continue;
        }
        stats.persisted += 1;
        if (result.unchanged) stats.unchanged += 1;
        if (result.upserted) stats.changed += 1;
      }
    }
    return stats;
  }

  private async upsertLogRowsInBatches(
    server: BeaconServerRecord,
    rows: Array<Record<string, unknown>>,
  ) {
    const stats = { persisted: 0, skipped: 0 };
    const pending: Array<Promise<void>> = [];
    for (const row of rows) {
      const mapped = this.mapLogRecord(server, row);
      if (!mapped) {
        stats.skipped += 1;
        continue;
      }
      stats.persisted += 1;
      pending.push(
        this.prisma.transportationRailwayLog
          .upsert({
            where: {
              serverId_beaconLogId: {
                serverId: server.id,
                beaconLogId: mapped.beaconLogId,
              },
            },
            update: {
              ...mapped,
            },
            create: {
              id: randomUUID(),
              ...mapped,
            },
          })
          .then(() => undefined),
      );
      if (pending.length >= UPSERT_BATCH_SIZE) {
        await Promise.all(pending);
        pending.length = 0;
      }
    }
    if (pending.length) {
      await Promise.all(pending);
    }
    return stats;
  }

  private mapLogRecord(
    server: BeaconServerRecord,
    row: Record<string, unknown>,
  ) {
    const beaconLogId = this.readNumber(row.id);
    if (beaconLogId == null) {
      return null;
    }
    const railwayMod = this.resolveRailwayMod(server.railwayMod);
    return {
      serverId: server.id,
      railwayMod,
      beaconLogId,
      timestamp: this.readString(row.timestamp),
      playerName: this.readString(row.player_name),
      playerUuid: this.readString(row.player_uuid),
      className: this.readString(row.class_name),
      entryId: this.readString(row.entry_id),
      entryName: this.readString(row.entry_name),
      position: this.readString(row.position),
      changeType: this.readString(row.change_type),
      oldData: this.readString(row.old_data),
      newData: this.readString(row.new_data),
      sourceFilePath: this.readString(row.source_file_path),
      sourceLine: this.readNumber(row.source_line),
      dimensionContext: this.readString(row.dimension_context),
      syncedAt: new Date(),
    };
  }

  private getLogSyncDateRange() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - LOG_LOOKBACK_DAYS);
    return {
      startDate: this.formatDateForBeacon(start),
      endDate: this.formatDateForBeacon(end),
    };
  }

  private formatDateForBeacon(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizePayload(value: unknown): StoredJsonValue {
    if (value == null) return Prisma.JsonNull;
    if (typeof value === 'string') {
      try {
        return this.parseJsonWithBigintSupport(value);
      } catch (error) {
        this.logger.warn(
          `Failed to parse MTR payload: ${(error as Error).message}`,
        );
        return Prisma.JsonNull;
      }
    }
    if (typeof value === 'object') {
      return this.ensureSafeJsonValue(value);
    }
    return Prisma.JsonNull;
  }

  private parseJsonWithBigintSupport(value: string): StoredJsonValue {
    const wrapped = value.replace(
      /([:\[,]\s*)(-?\d{16,})(?=\s*[,\}\]])/g,
      (_, prefix: string, digits: string) => `${prefix}"${digits}"`,
    );
    const parsed = JSON.parse(wrapped);
    return this.ensureSafeJsonValue(parsed);
  }

  private ensureSafeJsonValue(value: unknown): StoredJsonValue {
    if (value == null) {
      return Prisma.JsonNull;
    }
    if (Array.isArray(value)) {
      return value.map((entry) =>
        this.ensureSafeJsonValue(entry),
      ) as Prisma.InputJsonValue;
    }
    if (typeof value === 'object') {
      const result: Record<string, StoredJsonValue> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = this.ensureSafeJsonValue(entry);
      }
      return result as Prisma.InputJsonValue;
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      return value.toString();
    }
    return value as Prisma.InputJsonValue;
  }

  private async deleteStaleEntities(
    category: RailwayEntityCategory,
    server: BeaconServerRecord,
    syncMarker: Date,
  ): Promise<number> {
    const where = {
      serverId: server.id,
      railwayMod: server.railwayMod,
      syncedAt: { lt: syncMarker },
    };
    switch (category) {
      case 'DEPOT':
        return (
          await this.prisma.transportationRailwayDepot.deleteMany({ where })
        ).count;
      case 'PLATFORM':
        return (
          await this.prisma.transportationRailwayPlatform.deleteMany({ where })
        ).count;
      case 'RAIL':
        return (
          await this.prisma.transportationRailwayRail.deleteMany({ where })
        ).count;
      case 'ROUTE':
        return (
          await this.prisma.transportationRailwayRoute.deleteMany({ where })
        ).count;
      case 'SIGNAL_BLOCK':
        return (
          await this.prisma.transportationRailwaySignalBlock.deleteMany({
            where,
          })
        ).count;
      case 'STATION':
        return (
          await this.prisma.transportationRailwayStation.deleteMany({ where })
        ).count;
      default:
        return 0;
    }
  }

  private async persistEntityByCategory(
    category: RailwayEntityCategory,
    server: BeaconServerRecord,
    entity: {
      entityId: string;
      railwayMod: TransportationRailwayMod;
      dimensionContext: string | null;
      transportMode: string | null;
      name: string | null;
      color: number | null;
      filePath: string | null;
      payload: StoredJsonValue;
      lastBeaconUpdatedAt: Date | null;
      syncedAt: Date;
    },
  ): Promise<{ unchanged: boolean; upserted: boolean }> {
    const baseData = {
      railwayMod: entity.railwayMod,
      dimensionContext: entity.dimensionContext,
      transportMode: entity.transportMode,
      name: entity.name,
      color: entity.color,
      filePath: entity.filePath,
      payload: entity.payload as Prisma.InputJsonValue,
      lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
      syncedAt: entity.syncedAt,
    };
    const where = {
      serverId_railwayMod_entityId: {
        serverId: server.id,
        railwayMod: entity.railwayMod,
        entityId: entity.entityId,
      },
    };
    switch (category) {
      case 'DEPOT':
        if (entity.lastBeaconUpdatedAt) {
          const unchanged =
            await this.prisma.transportationRailwayDepot.updateMany({
              where: {
                serverId: server.id,
                railwayMod: entity.railwayMod,
                entityId: entity.entityId,
                lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
              },
              data: { syncedAt: entity.syncedAt },
            });
          if (unchanged.count > 0) return { unchanged: true, upserted: false };
        }
        await this.prisma.transportationRailwayDepot.upsert({
          where,
          update: baseData,
          create: {
            serverId: server.id,
            entityId: entity.entityId,
            ...baseData,
          },
        });
        return { unchanged: false, upserted: true };
      case 'PLATFORM':
        if (entity.lastBeaconUpdatedAt) {
          const unchanged =
            await this.prisma.transportationRailwayPlatform.updateMany({
              where: {
                serverId: server.id,
                railwayMod: entity.railwayMod,
                entityId: entity.entityId,
                lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
              },
              data: { syncedAt: entity.syncedAt },
            });
          if (unchanged.count > 0) return { unchanged: true, upserted: false };
        }
        await this.prisma.transportationRailwayPlatform.upsert({
          where,
          update: baseData,
          create: {
            serverId: server.id,
            entityId: entity.entityId,
            ...baseData,
          },
        });
        return { unchanged: false, upserted: true };
      case 'RAIL':
        if (entity.lastBeaconUpdatedAt) {
          const unchanged =
            await this.prisma.transportationRailwayRail.updateMany({
              where: {
                serverId: server.id,
                railwayMod: entity.railwayMod,
                entityId: entity.entityId,
                lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
              },
              data: { syncedAt: entity.syncedAt },
            });
          if (unchanged.count > 0) return { unchanged: true, upserted: false };
        }
        await this.prisma.transportationRailwayRail.upsert({
          where,
          update: baseData,
          create: {
            serverId: server.id,
            entityId: entity.entityId,
            ...baseData,
          },
        });
        return { unchanged: false, upserted: true };
      case 'ROUTE':
        if (entity.lastBeaconUpdatedAt) {
          const unchanged =
            await this.prisma.transportationRailwayRoute.updateMany({
              where: {
                serverId: server.id,
                railwayMod: entity.railwayMod,
                entityId: entity.entityId,
                lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
              },
              data: { syncedAt: entity.syncedAt },
            });
          if (unchanged.count > 0) return { unchanged: true, upserted: false };
        }
        await this.prisma.transportationRailwayRoute.upsert({
          where,
          update: baseData,
          create: {
            serverId: server.id,
            entityId: entity.entityId,
            ...baseData,
          },
        });
        return { unchanged: false, upserted: true };
      case 'SIGNAL_BLOCK':
        if (entity.lastBeaconUpdatedAt) {
          const unchanged =
            await this.prisma.transportationRailwaySignalBlock.updateMany({
              where: {
                serverId: server.id,
                railwayMod: entity.railwayMod,
                entityId: entity.entityId,
                lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
              },
              data: { syncedAt: entity.syncedAt },
            });
          if (unchanged.count > 0) return { unchanged: true, upserted: false };
        }
        await this.prisma.transportationRailwaySignalBlock.upsert({
          where,
          update: baseData,
          create: {
            serverId: server.id,
            entityId: entity.entityId,
            ...baseData,
          },
        });
        return { unchanged: false, upserted: true };
      case 'STATION':
        if (entity.lastBeaconUpdatedAt) {
          const unchanged =
            await this.prisma.transportationRailwayStation.updateMany({
              where: {
                serverId: server.id,
                railwayMod: entity.railwayMod,
                entityId: entity.entityId,
                lastBeaconUpdatedAt: entity.lastBeaconUpdatedAt,
              },
              data: { syncedAt: entity.syncedAt },
            });
          if (unchanged.count > 0) return { unchanged: true, upserted: false };
        }
        await this.prisma.transportationRailwayStation.upsert({
          where,
          update: baseData,
          create: {
            serverId: server.id,
            entityId: entity.entityId,
            ...baseData,
          },
        });
        return { unchanged: false, upserted: true };
      default:
        return { unchanged: false, upserted: false };
    }
  }

  private readString(value: unknown) {
    if (typeof value === 'string') {
      const cleaned = this.removeNullCharacters(value).trim();
      if (cleaned.length) {
        return cleaned;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
    return null;
  }

  private readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim().length) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
    return null;
  }

  private readTimestamp(value: unknown) {
    const numeric = this.readNumber(value);
    if (numeric == null) {
      return null;
    }
    return new Date(numeric);
  }

  private extractNamespace(context: string) {
    const segments = context.split('/');
    return segments.length >= 2 ? segments[1] : null;
  }

  private extractDimension(context: string) {
    const segments = context.split('/');
    return segments.length >= 3 ? segments[2] : null;
  }

  private inferDimensionContext(
    filePath: string | null,
    type?: TransportationRailwayMod,
  ) {
    if (!filePath) {
      return null;
    }
    const config = this.getRailwayModConfig(type);
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    const idx = parts.findIndex((part) => part === config.dimensionPrefix);
    if (idx < 0) {
      return null;
    }
    if (idx + 2 < parts.length) {
      return `${config.dimensionPrefix}/${parts[idx + 1]}/${parts[idx + 2]}`;
    }
    if (idx + 1 < parts.length) {
      return `${config.dimensionPrefix}/${parts[idx + 1]}`;
    }
    return null;
  }

  private ensureBeaconClient(server: BeaconServerRecord) {
    this.beaconPool.getOrCreate({
      serverId: server.id,
      endpoint: server.beaconEndpoint,
      key: server.beaconKey,
      timeoutMs: server.beaconRequestTimeoutMs ?? undefined,
    });
  }

  private async waitForBeaconConnections(
    serverIds: string[],
    timeoutMs = 30000,
  ) {
    if (!serverIds.length) return;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const pending = serverIds.filter((serverId) => {
        const status = this.beaconPool.getStatus(serverId);
        return !status?.connected;
      });
      if (!pending.length) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    this.logger.warn(
      `Timed out waiting for Beacon connections for servers: ${serverIds.join(', ')}`,
    );
  }

  private async emitBeacon<T>(
    server: BeaconServerRecord,
    event: HydrolineBeaconEvent,
    payload: Record<string, unknown>,
  ) {
    const client = this.beaconPool.getOrCreate({
      serverId: server.id,
      endpoint: server.beaconEndpoint,
      key: server.beaconKey,
      timeoutMs: server.beaconRequestTimeoutMs ?? BEACON_TIMEOUT_MS,
    });
    return client.emit<T>(event, payload, {
      timeoutMs: server.beaconRequestTimeoutMs ?? BEACON_TIMEOUT_MS,
    });
  }

  private async executeSyncJob(jobId: string) {
    const job = await this.prisma.transportationRailwaySyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return;
    }
    if (this.runningServerJobs.has(job.serverId)) {
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.FAILED,
          completedAt: new Date(),
          message:
            'Another sync job is already running for this server. Please try again later.',
        },
      });
      return;
    }
    this.runningServerJobs.add(job.serverId);
    try {
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.RUNNING,
          startedAt: new Date(),
          message: null,
        },
      });
      await this.syncServerById(job.serverId);
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.SUCCEEDED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.transportationRailwaySyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.FAILED,
          completedAt: new Date(),
          message: this.extractMessage(error),
        },
      });
    } finally {
      this.runningServerJobs.delete(job.serverId);
    }
  }

  private async executeLogSyncJob(jobId: string) {
    const job = await this.prisma.transportationRailwayLogSyncJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return;
    }
    if (this.runningServerLogJobs.has(job.serverId)) {
      await this.prisma.transportationRailwayLogSyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.FAILED,
          completedAt: new Date(),
          message:
            'Another log sync job is already running for this server. Please try again later.',
        },
      });
      return;
    }
    this.runningServerLogJobs.add(job.serverId);
    try {
      await this.prisma.transportationRailwayLogSyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.RUNNING,
          startedAt: new Date(),
          message: null,
        },
      });
      const result = await this.syncLogsByServerId(job.serverId, {
        mode: job.mode === 'full' ? 'full' : 'diff',
      });
      await this.prisma.transportationRailwayLogSyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.SUCCEEDED,
          completedAt: new Date(),
          message: `Synced ${result.total ?? 0} logs (${result.mode})`,
        },
      });
    } catch (error) {
      await this.prisma.transportationRailwayLogSyncJob.update({
        where: { id: jobId },
        data: {
          status: TransportationRailwaySyncStatus.FAILED,
          completedAt: new Date(),
          message: this.extractMessage(error),
        },
      });
    } finally {
      this.runningServerLogJobs.delete(job.serverId);
    }
  }

  private buildJobStatus(
    job: TransportationRailwaySyncJob,
  ): RailwaySyncJobStatus {
    return {
      id: job.id,
      serverId: job.serverId,
      status: job.status,
      message: job.message ?? null,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }

  private buildLogJobStatus(job: {
    id: string;
    serverId: string;
    mode: string;
    status: TransportationRailwaySyncStatus;
    message: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }): RailwayLogSyncJobStatus {
    return {
      id: job.id,
      serverId: job.serverId,
      mode: job.mode,
      status: job.status,
      message: job.message ?? null,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }

  private extractMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  private async listBeaconServers() {
    const rows = await this.prisma.minecraftServer.findMany({
      where: {
        isActive: true,
        beaconEnabled: true,
        beaconEndpoint: { not: null },
        beaconKey: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        transportationRailwayMod: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows
      .filter((row) => row.beaconEndpoint && row.beaconKey)
      .map((row) => ({
        id: row.id,
        displayName: row.displayName,
        beaconEndpoint: row.beaconEndpoint!,
        beaconKey: row.beaconKey!,
        beaconRequestTimeoutMs: row.beaconRequestTimeoutMs,
        railwayMod: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
        railwayType: row.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
      }));
  }

  private resolveRailwayMod(type?: TransportationRailwayMod) {
    if (type && RAILWAY_TYPE_CONFIG[type]) {
      return type;
    }
    return DEFAULT_RAILWAY_TYPE;
  }

  private getRailwayModConfig(
    type?: TransportationRailwayMod,
  ): RailwayTypeConfig {
    const resolved = this.resolveRailwayMod(type);
    return RAILWAY_TYPE_CONFIG[resolved];
  }
}
