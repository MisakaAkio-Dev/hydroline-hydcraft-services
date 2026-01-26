import type { PrismaService } from '../../../../prisma/prisma.service';
import type { AttachmentsService } from '../../../../attachments/attachments.service';
import {
  Prisma,
  TransportationRailwayBindingEntityType,
  TransportationRailwayCompanyBindingType,
  TransportationRailwayMod,
  TransportationRailwayRoute,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  buildFallbackEntity,
  normalizeEntity,
  normalizeId,
  normalizeIdList,
  readString,
  toNumber,
} from '../../utils/railway-normalizer';
import { buildDimensionContextFromDimension } from '../../utils/railway-normalizer';
import { DEFAULT_RAILWAY_TYPE } from '../../config/railway-type.config';
import type {
  NormalizedEntity,
  NormalizedRoute,
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayRouteGeometryCalculate,
  RailwayRouteGeometryDataset,
  RailwayRouteGeometryReport,
  RailwayRouteGeometrySnapshotInfo,
  RailwayRouteFallbackDiagnostics,
  RailwayCurveDiagnostics,
  RailwayStationRecord,
} from '../../types/railway-types';
import type { BeaconServerRecord } from '../../utils/railway-common';
import type { StoredEntityCategory } from './route-detail.types';
import type { RouteDetailMappers } from './route-detail.mappers';

export class RouteDetailStorage {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
    private readonly mappers: RouteDetailMappers,
  ) {}

  async getBeaconServerById(id: string) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        dynmapTileUrl: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        transportationRailwayMod: true,
      },
    });
    if (!server || !server.beaconEnabled) {
      throw new NotFoundException('Beacon not enabled on server');
    }
    if (!server.beaconEndpoint || !server.beaconKey) {
      throw new BadRequestException('Beacon configuration incomplete');
    }
    return {
      id: server.id,
      displayName: server.displayName,
      dynmapTileUrl: server.dynmapTileUrl,
      beaconEndpoint: server.beaconEndpoint,
      beaconKey: server.beaconKey,
      beaconRequestTimeoutMs: server.beaconRequestTimeoutMs,
      railwayMod: server.transportationRailwayMod ?? DEFAULT_RAILWAY_TYPE,
    };
  }

  async fetchStoredEntityRow(
    server: BeaconServerRecord,
    category: StoredEntityCategory,
    entityId: string,
    dimension?: string | null,
  ) {
    const candidates = Array.from(this.buildIdCandidates(entityId));
    const entityFilter =
      candidates.length > 1 ? { in: candidates } : candidates[0];
    const dimensionContext = buildDimensionContextFromDimension(
      dimension,
      server.railwayMod,
    );
    const orderBy = { updatedAt: 'desc' } as const;
    switch (category) {
      case 'ROUTE': {
        const primaryWhere: Prisma.TransportationRailwayRouteWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
          ...(dimensionContext ? { dimensionContext } : {}),
        };
        const fallbackWhere: Prisma.TransportationRailwayRouteWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
        };
        const primary = await this.prisma.transportationRailwayRoute.findFirst({
          where: primaryWhere,
          orderBy,
        });
        if (primary) return primary;
        return (
          (await this.prisma.transportationRailwayRoute.findFirst({
            where: fallbackWhere,
            orderBy,
          })) ?? null
        );
      }
      case 'STATION': {
        const primaryWhere: Prisma.TransportationRailwayStationWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
          ...(dimensionContext ? { dimensionContext } : {}),
        };
        const fallbackWhere: Prisma.TransportationRailwayStationWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
        };
        const primary =
          await this.prisma.transportationRailwayStation.findFirst({
            where: primaryWhere,
            orderBy,
          });
        if (primary) return primary;
        return (
          (await this.prisma.transportationRailwayStation.findFirst({
            where: fallbackWhere,
            orderBy,
          })) ?? null
        );
      }
      case 'DEPOT': {
        const primaryWhere: Prisma.TransportationRailwayDepotWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
          ...(dimensionContext ? { dimensionContext } : {}),
        };
        const fallbackWhere: Prisma.TransportationRailwayDepotWhereInput = {
          serverId: server.id,
          railwayMod: server.railwayMod,
          entityId: entityFilter,
        };
        const primary = await this.prisma.transportationRailwayDepot.findFirst({
          where: primaryWhere,
          orderBy,
        });
        if (primary) return primary;
        return (
          (await this.prisma.transportationRailwayDepot.findFirst({
            where: fallbackWhere,
            orderBy,
          })) ?? null
        );
      }
      default:
        return null;
    }
  }

  async fetchStoredRoutesForDimensionRows(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayRouteWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    return await this.prisma.transportationRailwayRoute.findMany({ where });
  }

  async fetchPlatformsFromStorage(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayPlatformWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    const rows = await this.prisma.transportationRailwayPlatform.findMany({
      where,
    });
    const records: RailwayPlatformRecord[] = [];
    for (const row of rows) {
      const payload = this.mappers.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.mappers.buildPlatformRecordFromEntity(row, payload);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  async fetchPlatformsByIds(server: BeaconServerRecord, platformIds: string[]) {
    if (!platformIds.length) return [];
    const rows = await this.prisma.transportationRailwayPlatform.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        entityId: { in: platformIds },
      },
    });
    const records: RailwayPlatformRecord[] = [];
    for (const row of rows) {
      const payload = this.mappers.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.mappers.buildPlatformRecordFromEntity(row, payload);
      if (record) {
        records.push(record);
      }
    }
    const map = new Map(records.map((r) => [r.id, r]));
    return platformIds
      .map((id) => map.get(id))
      .filter((r): r is RailwayPlatformRecord => !!r);
  }

  async fetchRouteGeometryCalculateRecord(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
  ): Promise<RailwayRouteGeometryCalculate | null> {
    if (!dimensionContext || !routeId) return null;
    const row = await this.prisma.transportationRailwayRouteCalculate.findFirst(
      {
        where: {
          serverId: server.id,
          railwayMod: server.railwayMod,
          dimensionContext,
          routeEntityId: routeId,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          serverId: true,
          railwayMod: true,
          dimensionContext: true,
          dimension: true,
          routeEntityId: true,
          status: true,
          errorMessage: true,
          sourceFingerprint: true,
          pathSource: true,
          persistedSnapshot: true,
          report: true,
          snapshot: true,
          dataset: true,
          fallbackDiagnostics: true,
          curveDiagnostics: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    );
    if (!row) {
      return null;
    }
    const snapshot = (row.snapshot ??
      null) as RailwayRouteGeometrySnapshotInfo | null;
    const persistedSnapshot = row.persistedSnapshot;
    let persistReason: string | null = null;
    if (!persistedSnapshot) {
      if (!snapshot) {
        persistReason = 'snapshot_missing';
      } else if (snapshot.status && snapshot.status !== 'READY') {
        persistReason = 'snapshot_not_ready';
      } else if (
        snapshot.sourceFingerprint &&
        snapshot.sourceFingerprint !== row.sourceFingerprint
      ) {
        persistReason = 'fingerprint_mismatch';
      } else {
        persistReason = 'snapshot_not_persisted';
      }
    }
    return {
      serverId: row.serverId,
      railwayMod: row.railwayMod,
      dimensionContext: row.dimensionContext,
      dimension: row.dimension ?? null,
      routeEntityId: row.routeEntityId,
      status: row.status,
      errorMessage: row.errorMessage ?? null,
      sourceFingerprint: row.sourceFingerprint,
      pathSource: row.pathSource,
      persistedSnapshot,
      persistReason,
      report: (row.report ?? null) as RailwayRouteGeometryReport,
      snapshot,
      dataset: row.dataset as RailwayRouteGeometryDataset,
      fallbackDiagnostics: (row.fallbackDiagnostics ??
        null) as RailwayRouteFallbackDiagnostics,
      curveDiagnostics: (row.curveDiagnostics ??
        null) as RailwayCurveDiagnostics,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async fetchRouteGeometrySnapshotStops(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
  ): Promise<
    Array<{ stationId: string | null; x: number; z: number; label: string }>
  > {
    if (!dimensionContext || !routeId) return [];
    const snapshot =
      await this.prisma.transportationRailwayRouteGeometrySnapshot.findUnique({
        where: {
          serverId_railwayMod_dimensionContext_routeEntityId: {
            serverId: server.id,
            railwayMod: server.railwayMod,
            dimensionContext,
            routeEntityId: routeId,
          },
        },
        select: {
          status: true,
          stops: true,
        },
      });
    if (!snapshot || snapshot.status !== 'READY') {
      return [];
    }
    return Array.isArray(snapshot.stops)
      ? (snapshot.stops as Array<{
          stationId: string | null;
          x: number;
          z: number;
          label: string;
        }>)
      : [];
  }

  async fetchStationsByIds(server: BeaconServerRecord, stationIds: string[]) {
    if (!stationIds.length) return [];
    const rows = await this.prisma.transportationRailwayStation.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        entityId: { in: stationIds },
      },
    });
    const records: RailwayStationRecord[] = [];
    for (const row of rows) {
      const payload = this.mappers.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.mappers.buildStationRecordFromEntity(
        row.entityId,
        payload,
      );
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  async fetchStationMapSnapshot(
    server: BeaconServerRecord,
    stationId: string,
    dimensionContext: string | null,
  ) {
    const stationEntityId = normalizeId(stationId) ?? stationId;
    if (!stationEntityId) return null;
    if (dimensionContext) {
      const scoped =
        await this.prisma.transportationRailwayStationMapSnapshot.findUnique({
          where: {
            serverId_railwayMod_dimensionContext_stationEntityId: {
              serverId: server.id,
              railwayMod: server.railwayMod,
              dimensionContext,
              stationEntityId,
            },
          },
          select: {
            payload: true,
            dimensionContext: true,
          },
        });
      if (scoped?.payload) {
        return scoped;
      }
    }
    return await this.prisma.transportationRailwayStationMapSnapshot.findFirst({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        stationEntityId,
      },
      orderBy: { generatedAt: 'desc' },
      select: {
        payload: true,
        dimensionContext: true,
      },
    });
  }

  async fetchPlatformsForStation(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    stationId: string,
  ) {
    const normalizedStationId = normalizeId(stationId);
    if (!normalizedStationId) {
      return [] as RailwayPlatformRecord[];
    }
    const platforms = await this.fetchPlatformsFromStorage(
      server,
      dimensionContext,
    );
    return platforms.filter((platform) => {
      const associated = normalizeId(platform.station_id);
      return associated === normalizedStationId;
    });
  }

  async fetchNormalizedRoutesByPlatformIds(
    server: BeaconServerRecord,
    platformIds: string[],
    dimensionContext?: string | null,
  ) {
    if (!platformIds.length) {
      return {
        routes: [] as NormalizedRoute[],
        platformRouteIds: new Map<string, string[]>(),
      };
    }
    const ids = new Set(
      platformIds.map((id) => normalizeId(id)).filter(Boolean),
    );
    if (!ids.size) {
      return {
        routes: [] as NormalizedRoute[],
        platformRouteIds: new Map<string, string[]>(),
      };
    }
    const fetch = async (ctx?: string | null) => {
      const rows = await this.prisma.transportationRailwayRoute.findMany({
        where: {
          serverId: server.id,
          railwayMod: server.railwayMod,
          ...(ctx ? { dimensionContext: ctx } : {}),
        },
      });
      const matched: TransportationRailwayRoute[] = [];
      const platformRouteIds = new Map<string, Set<string>>();
      for (const row of rows) {
        const record = this.mappers.buildRouteRecordFromEntity(row);
        const platformList = record?.platform_ids ?? [];
        if (!platformList?.length) continue;
        const normalizedPlatformIds = normalizeIdList(platformList);
        const hits = normalizedPlatformIds.filter((pid) => ids.has(pid));
        if (!hits.length) continue;
        matched.push(row);
        const routeId = normalizeId(record?.id) ?? row.entityId;
        if (!routeId) continue;
        for (const pid of hits) {
          const bucket = platformRouteIds.get(pid) ?? new Set<string>();
          bucket.add(routeId);
          platformRouteIds.set(pid, bucket);
        }
      }
      const routes = matched
        .map((row) => this.mappers.normalizeStoredRoute(row, server))
        .filter((route): route is NormalizedRoute => Boolean(route));
      return {
        routes,
        platformRouteIds: new Map(
          Array.from(platformRouteIds.entries()).map(([key, set]) => [
            key,
            Array.from(set.values()),
          ]),
        ),
      };
    };
    const scoped = await fetch(dimensionContext ?? null);
    if (scoped.routes.length) {
      return scoped;
    }
    if (dimensionContext) {
      return fetch(null);
    }
    return scoped;
  }

  async fetchRoutesForDimension(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayRouteWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    const rows = await this.prisma.transportationRailwayRoute.findMany({
      where,
    });
    return rows
      .map((row) => this.mappers.buildRouteRecordFromEntity(row))
      .filter((record): record is RailwayRouteRecord => Boolean(record));
  }

  async fetchNormalizedRoutesByIds(
    server: BeaconServerRecord,
    routeIds: string[],
    dimensionContext?: string | null,
  ) {
    if (!routeIds.length) {
      return [] as NormalizedRoute[];
    }
    const rows = await this.prisma.transportationRailwayRoute.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        entityId: { in: routeIds },
        ...(dimensionContext ? { dimensionContext } : {}),
      },
    });
    return rows
      .map((row) => this.mappers.normalizeStoredRoute(row, server))
      .filter((route): route is NormalizedRoute => Boolean(route));
  }

  async fetchStationsFromStorage(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    const where: Prisma.TransportationRailwayStationWhereInput = {
      serverId: server.id,
      railwayMod: server.railwayMod,
    };
    if (dimensionContext) {
      where.dimensionContext = dimensionContext;
    }
    const rows = await this.prisma.transportationRailwayStation.findMany({
      where,
      select: {
        entityId: true,
        payload: true,
        name: true,
        color: true,
      },
    });
    const records: RailwayStationRecord[] = [];
    for (const row of rows) {
      const payload = this.mappers.toJsonRecord(row.payload);
      if (!payload) continue;
      const record = this.mappers.buildStationRecordFromEntity(
        row.entityId,
        payload,
      );
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  async fetchDepotsForRoute(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
    routePayloadId?: string | null,
  ) {
    if (!dimensionContext) {
      return [] as NormalizedEntity[];
    }
    const rows = await this.prisma.transportationRailwayDepot.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
        name: true,
        color: true,
        transportMode: true,
      },
    });
    const matches: NormalizedEntity[] = [];
    for (const row of rows) {
      const payload = this.mappers.toJsonRecord(row.payload);
      if (!payload) {
        continue;
      }
      const routeIds = this.mappers.extractRouteIds(payload);
      const routeMatches =
        routeIds.includes(routeId) ||
        (routePayloadId ? routeIds.includes(routePayloadId) : false);
      if (!routeMatches) {
        continue;
      }
      const normalized =
        normalizeEntity(
          {
            entity_id: row.entityId,
            name: row.name ?? readString(payload['name']) ?? null,
            color: row.color ?? toNumber(payload['color']),
            transport_mode:
              row.transportMode ?? readString(payload['transport_mode']),
            payload,
          },
          server,
        ) ??
        buildFallbackEntity(
          row.entityId,
          server,
          row.name ?? readString(payload['name']) ?? null,
          row.color ?? toNumber(payload['color']),
          row.transportMode ?? readString(payload['transport_mode']),
          payload,
        );
      matches.push(normalized);
    }
    return matches;
  }

  async fetchCompanyBindingsForEntity(params: {
    entityType: TransportationRailwayBindingEntityType;
    entityId: string;
    serverId: string;
    railwayMod: TransportationRailwayMod;
    dimensionContext: string | null;
  }) {
    const bindings =
      await this.prisma.transportationRailwayCompanyBinding.findMany({
        where: {
          entityType: params.entityType,
          entityId: params.entityId,
          serverId: params.serverId,
          railwayMod: params.railwayMod,
          dimensionContext: params.dimensionContext ?? null,
        },
        select: {
          companyId: true,
          bindingType: true,
        },
      });

    const operatorCompanyIds: string[] = [];
    const builderCompanyIds: string[] = [];

    for (const binding of bindings) {
      if (
        binding.bindingType === TransportationRailwayCompanyBindingType.OPERATOR
      ) {
        operatorCompanyIds.push(binding.companyId);
      } else if (
        binding.bindingType === TransportationRailwayCompanyBindingType.BUILDER
      ) {
        builderCompanyIds.push(binding.companyId);
      }
    }

    return {
      operatorCompanyIds,
      builderCompanyIds,
    };
  }

  async fetchRouteSystems(routeRecordId: string) {
    const systemRoutes =
      await this.prisma.transportationRailwaySystemRoute.findMany({
        where: { routeId: routeRecordId },
        include: { system: true },
      });

    const logoUrlMap = await this.attachmentsService.resolvePublicUrlsByIds(
      systemRoutes.map((item) => item.system.logoAttachmentId),
    );

    return systemRoutes.map((item) => ({
      id: item.system.id,
      name: item.system.name,
      englishName: item.system.englishName ?? null,
      logoAttachmentId: item.system.logoAttachmentId ?? null,
      logoUrl: item.system.logoAttachmentId
        ? (logoUrlMap.get(item.system.logoAttachmentId) ?? null)
        : null,
    }));
  }

  private buildIdCandidates(value: string | null | undefined) {
    const candidates = new Set<string>();
    const trimmed = value?.trim();
    if (trimmed) {
      candidates.add(trimmed);
      const numeric = normalizeId(toNumber(trimmed));
      if (numeric && numeric !== trimmed) {
        candidates.add(numeric);
      }
    }
    return candidates;
  }
}
