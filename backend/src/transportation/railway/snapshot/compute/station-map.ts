import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TransportationRailwayMod } from '@prisma/client';
import type {
  RailwayPlatformRecord,
  RailwayStationRecord,
} from '../../types/railway-types';
import { normalizeId } from '../../utils/railway-normalizer';
import { decodeBlockPosition } from '../../../utils/block-pos.util';
import type {
  RouteGeometrySnapshotValue,
  StationMapComputeInput,
} from './types';
import { runWithConcurrency } from './concurrency';

type StationRouteMapGroup = {
  key: string;
  displayName: string;
  color: number | null;
  routeIds: string[];
  paths: Array<Array<{ x: number; z: number }>>;
  stops: RouteGeometrySnapshotValue['stops'];
};

export type StationRouteMapPayload = {
  stationId: string;
  serverId: string;
  railwayType: TransportationRailwayMod;
  dimension: string | null;
  generatedAt: number;
  groups: StationRouteMapGroup[];
};

function extractDimensionFromContext(context: string | null | undefined) {
  if (!context) return null;
  const segments = context.split('/');
  if (segments.length < 3) {
    return null;
  }
  const dimension = segments.pop();
  const namespace = segments.pop();
  if (!namespace || !dimension) {
    return null;
  }
  return `${namespace}:${dimension}`;
}

function extractRouteGroupKey(value: string | null | undefined) {
  if (!value) return null;
  const primary = value.split('||')[0] ?? '';
  const first = primary.split('|')[0] ?? '';
  const trimmed = first.trim();
  return trimmed || null;
}

function mergeBounds(
  a: { xMin: number; xMax: number; zMin: number; zMax: number } | null,
  b: { xMin: number; xMax: number; zMin: number; zMax: number } | null,
) {
  if (!a) return b;
  if (!b) return a;
  return {
    xMin: Math.min(a.xMin, b.xMin),
    xMax: Math.max(a.xMax, b.xMax),
    zMin: Math.min(a.zMin, b.zMin),
    zMax: Math.max(a.zMax, b.zMax),
  };
}

function mergeStopMarkers(
  bucket: { stops: RouteGeometrySnapshotValue['stops'] },
  incoming: RouteGeometrySnapshotValue['stops'],
) {
  const seen = new Set<string>();
  for (const item of bucket.stops) {
    const key = item.stationId
      ? `id:${item.stationId}`
      : `p:${item.x},${item.z}:${item.label}`;
    seen.add(key);
  }
  for (const item of incoming) {
    const key = item.stationId
      ? `id:${item.stationId}`
      : `p:${item.x},${item.z}:${item.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bucket.stops.push(item);
  }
}

function resolveMergeMaxDistanceBlocks() {
  return 1500;
}

function selectOrCreateBucket(input: {
  groupKey: string;
  buckets: Array<{
    key: string;
    displayName: string;
    color: number | null;
    routeIds: Set<string>;
    paths: Array<Array<{ x: number; z: number }>>;
    bounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null;
    stops: RouteGeometrySnapshotValue['stops'];
  }>;
  routeColor: number | null;
  routeBounds: {
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
  } | null;
}) {
  const maxDistance = resolveMergeMaxDistanceBlocks();
  const maxDistanceSq = maxDistance * maxDistance;

  const routeCenter = input.routeBounds
    ? {
        x: (input.routeBounds.xMin + input.routeBounds.xMax) / 2,
        z: (input.routeBounds.zMin + input.routeBounds.zMax) / 2,
      }
    : null;

  if (routeCenter) {
    for (const bucket of input.buckets) {
      const bucketCenter = bucket.bounds
        ? {
            x: (bucket.bounds.xMin + bucket.bounds.xMax) / 2,
            z: (bucket.bounds.zMin + bucket.bounds.zMax) / 2,
          }
        : null;
      if (!bucketCenter) continue;
      const dx = bucketCenter.x - routeCenter.x;
      const dz = bucketCenter.z - routeCenter.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= maxDistanceSq) {
        return bucket;
      }
    }
  }

  const suffix = input.buckets.length ? `#${input.buckets.length + 1}` : '';
  const bucket = {
    key: `${input.groupKey}${suffix}`,
    displayName: input.groupKey,
    color: input.routeColor,
    routeIds: new Set<string>(),
    paths: [] as Array<Array<{ x: number; z: number }>>,
    bounds: null as {
      xMin: number;
      xMax: number;
      zMin: number;
      zMax: number;
    } | null,
    stops: [] as RouteGeometrySnapshotValue['stops'],
  };
  input.buckets.push(bucket);
  return bucket;
}

function fetchPlatformsForStationByBounds(
  stationId: string,
  station: RailwayStationRecord,
  platforms: RailwayPlatformRecord[],
) {
  const normalizedStationId = normalizeId(stationId);
  if (!normalizedStationId) {
    return [] as RailwayPlatformRecord[];
  }
  const hasBounds =
    station.x_min != null &&
    station.x_max != null &&
    station.z_min != null &&
    station.z_max != null;
  return platforms.filter((platform) => {
    const associated = normalizeId(platform.station_id);
    if (associated === normalizedStationId) {
      return true;
    }
    if (!hasBounds) {
      return false;
    }
    const points: Array<{ x: number; z: number }> = [];
    const pos1 = decodeBlockPosition(platform.pos_1);
    const pos2 = decodeBlockPosition(platform.pos_2);
    if (pos1) points.push({ x: pos1.x, z: pos1.z });
    if (pos2) points.push({ x: pos2.x, z: pos2.z });
    if (pos1 && pos2) {
      points.push({
        x: Math.round((pos1.x + pos2.x) / 2),
        z: Math.round((pos1.z + pos2.z) / 2),
      });
    }
    const minX = Math.min(station.x_min!, station.x_max!);
    const maxX = Math.max(station.x_min!, station.x_max!);
    const minZ = Math.min(station.z_min!, station.z_max!);
    const maxZ = Math.max(station.z_min!, station.z_max!);
    return points.some(
      (point) =>
        point.x >= minX &&
        point.x <= maxX &&
        point.z >= minZ &&
        point.z <= maxZ,
    );
  });
}

export async function computeStationMapSnapshots(
  prisma: PrismaService,
  input: StationMapComputeInput,
  logger: { warn: (msg: string) => void },
  concurrency = 2,
) {
  const routeNameById = new Map<string, string | null>();
  const routeColorById = new Map<string, number | null>();

  for (const [routeId, row] of input.dataset.routeRowsById.entries()) {
    const payload = row.payload as unknown;
    const name =
      (payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      'name' in payload
        ? String((payload as any).name ?? '')
        : (row.name ?? '')) || null;
    const color =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? Number((payload as any).color) || row.color || null
        : (row.color ?? null);
    routeNameById.set(routeId, name);
    routeColorById.set(routeId, color);
  }

  const handler = async (station: RailwayStationRecord) => {
    const stationId = normalizeId(station.id);
    if (!stationId) return;

    const stationPlatforms = fetchPlatformsForStationByBounds(
      stationId,
      station,
      input.dataset.platformRecords,
    );
    if (!stationPlatforms.length) {
      return;
    }
    const routeIdSet = new Set<string>();
    for (const platform of stationPlatforms) {
      const platformId = normalizeId(platform.id);
      if (!platformId) continue;
      const routeIds = input.dataset.platformRouteIds.get(platformId) ?? [];
      for (const routeId of routeIds) {
        if (routeId) routeIdSet.add(routeId);
      }
    }
    if (!routeIdSet.size) {
      return;
    }

    type GroupBucket = {
      key: string;
      displayName: string;
      color: number | null;
      routeIds: Set<string>;
      paths: Array<Array<{ x: number; z: number }>>;
      bounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null;
      stops: RouteGeometrySnapshotValue['stops'];
    };

    const groupMap = new Map<string, GroupBucket[]>();

    for (const routeId of routeIdSet) {
      const routeName = routeNameById.get(routeId) ?? null;
      const groupKey = extractRouteGroupKey(routeName);
      if (!groupKey) continue;

      const geometry = input.routeGeometryById.get(routeId) ?? null;
      if (!geometry?.paths?.length) continue;

      const buckets = groupMap.get(groupKey) ?? [];
      const selected = selectOrCreateBucket({
        groupKey,
        buckets,
        routeColor: routeColorById.get(routeId) ?? null,
        routeBounds: geometry.bounds,
      });

      if (selected.color == null) {
        const c = routeColorById.get(routeId) ?? null;
        if (c != null) selected.color = c;
      }
      selected.routeIds.add(routeId);
      selected.paths.push(...geometry.paths);
      if (geometry.stops?.length) {
        mergeStopMarkers(selected, geometry.stops);
      }
      selected.bounds = mergeBounds(selected.bounds, geometry.bounds);

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, buckets);
      }
    }

    const groups: StationRouteMapGroup[] = Array.from(groupMap.values())
      .flatMap((buckets) => buckets)
      .map((bucket) => ({
        key: bucket.key,
        displayName: bucket.displayName,
        color: bucket.color,
        routeIds: Array.from(bucket.routeIds),
        paths: bucket.paths,
        stops: bucket.stops,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const payload: StationRouteMapPayload = {
      stationId,
      serverId: input.scope.serverId,
      railwayType: input.scope.railwayMod,
      dimension: extractDimensionFromContext(input.scope.dimensionContext),
      generatedAt: Date.now(),
      groups,
    };

    await prisma.transportationRailwayStationMapSnapshot.upsert({
      where: {
        serverId_railwayMod_dimensionContext_stationEntityId: {
          serverId: input.scope.serverId,
          railwayMod: input.scope.railwayMod,
          dimensionContext: input.scope.dimensionContext,
          stationEntityId: stationId,
        },
      },
      update: {
        sourceFingerprint: input.fingerprint,
        payload: payload as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
      create: {
        id: randomUUID(),
        serverId: input.scope.serverId,
        railwayMod: input.scope.railwayMod,
        dimensionContext: input.scope.dimensionContext,
        stationEntityId: stationId,
        sourceFingerprint: input.fingerprint,
        payload: payload as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
    });
  };

  await runWithConcurrency(
    input.dataset.stationRecords,
    concurrency,
    async (station) => {
      try {
        await handler(station);
      } catch (error) {
        const stationId = normalizeId(station.id);
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Station map snapshot failed for ${stationId ?? 'unknown'}: ${message}`,
        );
      }
    },
  );
}
