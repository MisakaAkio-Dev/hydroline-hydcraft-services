import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ScopeDataset, ScopeKey, RouteRow } from './types';
import type {
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayStationRecord,
} from '../../types/railway-types';
import {
  normalizeId,
  normalizeIdList,
  readString,
  toNumber,
} from '../../utils/railway-normalizer';

function toJsonRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function buildRouteRecordFromRow(row: RouteRow): RailwayRouteRecord | null {
  const payload = toJsonRecord(row.payload);
  if (!payload) {
    return null;
  }
  return {
    id: normalizeId(payload['id']) ?? row.entityId,
    name: readString(payload['name']) ?? row.name ?? null,
    color: toNumber(payload['color']) ?? row.color ?? null,
    transport_mode: readString(payload['transport_mode']) ?? null,
    platform_ids: Array.isArray(payload['platform_ids'])
      ? payload['platform_ids']
      : Array.isArray(payload['platformIds'])
        ? payload['platformIds']
        : null,
    custom_destinations: Array.isArray(payload['custom_destinations'])
      ? payload['custom_destinations']
      : null,
    route_type: readString(payload['route_type']),
    circular_state: readString(payload['circular_state']),
    light_rail_route_number: readString(payload['light_rail_route_number']),
  };
}

function buildPlatformRecordFromEntity(
  row: { entityId: string; name: string | null; transportMode: string | null },
  payload: Record<string, unknown>,
): RailwayPlatformRecord | null {
  return {
    id: normalizeId(payload['id']) ?? row.entityId,
    name: readString(payload['name']) ?? row.name ?? null,
    color: toNumber(payload['color']) ?? null,
    transport_mode:
      readString(payload['transport_mode']) ?? row.transportMode ?? null,
    station_id: payload['station_id'] ?? payload['stationId'],
    pos_1: payload['pos_1'] ?? payload['pos1'] ?? null,
    pos_2: payload['pos_2'] ?? payload['pos2'] ?? null,
    dwell_time: toNumber(payload['dwell_time']),
    route_ids: Array.isArray(payload['route_ids'])
      ? payload['route_ids']
      : Array.isArray(payload['routeIds'])
        ? payload['routeIds']
        : null,
  };
}

function buildStationRecordFromEntity(
  entityId: string,
  payload: Record<string, unknown>,
): RailwayStationRecord | null {
  const xMin = toNumber(payload['x_min']);
  const xMax = toNumber(payload['x_max']);
  const zMin = toNumber(payload['z_min']);
  const zMax = toNumber(payload['z_max']);
  return {
    id: normalizeId(payload['id']) ?? entityId,
    name: readString(payload['name']) ?? null,
    color: toNumber(payload['color']),
    transport_mode: readString(payload['transport_mode']),
    x_min: xMin,
    x_max: xMax,
    z_min: zMin,
    z_max: zMax,
    zone: toNumber(payload['zone']),
  };
}

function buildPlatformRouteIds(
  platformRecords: RailwayPlatformRecord[],
  routeRecords: RailwayRouteRecord[],
) {
  const mapping = new Map<string, Set<string>>();
  for (const platform of platformRecords) {
    const platformId = normalizeId(platform.id);
    if (!platformId) continue;
    const routeIds = normalizeIdList((platform.route_ids as unknown[]) ?? []);
    if (!routeIds.length) continue;
    mapping.set(platformId, new Set(routeIds));
  }
  const needsFallback = platformRecords.some((platform) => {
    const platformId = normalizeId(platform.id);
    if (!platformId) return false;
    return !mapping.get(platformId)?.size;
  });
  if (needsFallback) {
    for (const route of routeRecords) {
      const routeId = normalizeId(route.id);
      if (!routeId) continue;
      const platformIds = normalizeIdList(route.platform_ids ?? []);
      for (const platformId of platformIds) {
        const bucket = mapping.get(platformId) ?? new Set<string>();
        bucket.add(routeId);
        mapping.set(platformId, bucket);
      }
    }
  }
  return new Map(
    Array.from(mapping.entries()).map(([key, set]) => [key, Array.from(set)]),
  );
}

export async function loadScopeDataset(
  prisma: PrismaService,
  scope: ScopeKey,
): Promise<ScopeDataset> {
  const [routes, platforms, stations, rails] = await Promise.all([
    prisma.transportationRailwayRoute.findMany({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
        name: true,
        color: true,
      },
    }),
    prisma.transportationRailwayPlatform.findMany({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
        name: true,
        transportMode: true,
      },
    }),
    prisma.transportationRailwayStation.findMany({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
        name: true,
      },
    }),
    prisma.transportationRailwayRail.findMany({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      select: { entityId: true, payload: true },
    }),
  ]);

  const stationRecords: RailwayStationRecord[] = [];
  for (const row of stations) {
    const payload = toJsonRecord(row.payload);
    if (!payload) continue;
    const record = buildStationRecordFromEntity(row.entityId, payload);
    if (record) {
      stationRecords.push(record);
    }
  }

  const platformRecords: RailwayPlatformRecord[] = [];
  for (const row of platforms) {
    const payload = toJsonRecord(row.payload);
    if (!payload) continue;
    const record = buildPlatformRecordFromEntity(
      {
        entityId: row.entityId,
        name: row.name,
        transportMode: row.transportMode,
      },
      payload,
    );
    if (record) {
      platformRecords.push(record);
    }
  }
  const platformMap = new Map(
    platformRecords.map((record) => [normalizeId(record.id), record]),
  );

  const routeRecords: RailwayRouteRecord[] = [];
  const routeRowsById = new Map<string, RouteRow>();
  for (const row of routes as RouteRow[]) {
    const record = buildRouteRecordFromRow(row);
    if (!record) continue;
    routeRecords.push(record);
    const routeId = normalizeId(record.id) ?? row.entityId;
    if (routeId) {
      routeRowsById.set(routeId, row);
    }
  }

  const platformRouteIds = buildPlatformRouteIds(platformRecords, routeRecords);

  return {
    routeRecords,
    routeRowsById,
    platformRecords,
    platformMap,
    platformRouteIds,
    stationRecords,
    rails,
  };
}
