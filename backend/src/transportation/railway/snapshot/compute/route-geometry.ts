import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type {
  RailGeometrySegment,
  RailGraph,
} from '../../types/railway-graph.types';
import type {
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayStationRecord,
} from '../../types/railway-types';
import { MtrRouteFinder } from '../../../../lib/mtr/mtr-route-finder';
import { decodeBlockPosition } from '../../../utils/block-pos.util';
import { normalizeId, normalizeIdList } from '../../utils/railway-normalizer';
import type {
  RouteGeometryComputeInput,
  RouteGeometrySnapshotValue,
} from './types';
import { runWithConcurrency } from './concurrency';
import {
  buildRailGraph,
  extractPlatformNodes,
  includePlatformSegments,
  snapPlatformNodesToRailGraph,
} from './rail-graph';

function computeBoundsFromPaths(paths: Array<Array<{ x: number; z: number }>>) {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const path of paths) {
    for (const point of path ?? []) {
      if (typeof point?.x !== 'number' || typeof point?.z !== 'number')
        continue;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      xMin = Math.min(xMin, point.x);
      xMax = Math.max(xMax, point.x);
      zMin = Math.min(zMin, point.z);
      zMax = Math.max(zMax, point.z);
      count += 1;
    }
  }
  if (!count) return null;
  return { xMin, xMax, zMin, zMax };
}

function computePlatformCenter(platform: RailwayPlatformRecord) {
  const pos1 = decodeBlockPosition(platform.pos_1);
  const pos2 = decodeBlockPosition(platform.pos_2);
  if (!pos1 || !pos2) return null;
  return {
    x: Math.round((pos1.x + pos2.x) / 2),
    z: Math.round((pos1.z + pos2.z) / 2),
  };
}

function computeStationCenter(station: RailwayStationRecord) {
  if (
    station.x_min == null ||
    station.x_max == null ||
    station.z_min == null ||
    station.z_max == null
  ) {
    return null;
  }
  return {
    x: Math.round((station.x_min + station.x_max) / 2),
    z: Math.round((station.z_min + station.z_max) / 2),
  };
}

function buildStationsMap(records: RailwayStationRecord[]) {
  return new Map(records.map((record) => [normalizeId(record.id), record]));
}

function buildRouteStopsForSnapshot(input: {
  route: RailwayRouteRecord;
  platformMap: Map<string | null, RailwayPlatformRecord>;
  stationMap: Map<string | null, RailwayStationRecord>;
}): RouteGeometrySnapshotValue['stops'] {
  const platformIds = normalizeIdList(input.route.platform_ids ?? []);
  if (!platformIds.length) return [];

  const stops: RouteGeometrySnapshotValue['stops'] = [];
  for (const platformId of platformIds) {
    const platform = input.platformMap.get(platformId) ?? null;
    if (!platform) continue;
    const platformCenter = computePlatformCenter(platform);
    const directStationId = normalizeId(platform.station_id);
    const station =
      directStationId != null
        ? (input.stationMap.get(directStationId) ?? null)
        : null;
    const stationCenter = station ? computeStationCenter(station) : null;
    const position = platformCenter ?? stationCenter;
    if (!position) continue;
    const label = (station?.name || platform.name || platformId || '').trim();
    if (!label) continue;
    stops.push({
      stationId: normalizeId(station?.id) ?? null,
      x: position.x,
      z: position.z,
      label: label.split('|')[0],
    });
  }
  return stops;
}

function resolvePlatformsForRoute(
  route: RailwayRouteRecord,
  platformMap: Map<string | null, RailwayPlatformRecord>,
) {
  const platformIds = normalizeIdList(route.platform_ids ?? []);
  return platformIds
    .map((platformId) => platformMap.get(platformId) ?? null)
    .filter((platform): platform is RailwayPlatformRecord => Boolean(platform));
}

function buildFallbackGeometry(
  platforms: RailwayPlatformRecord[],
  stationMap: Map<string | null, RailwayStationRecord>,
  stations: RailwayStationRecord[],
) {
  const points: Array<{ x: number; z: number }> = [];
  for (const platform of platforms) {
    const center = computePlatformCenter(platform);
    if (center) {
      points.push(center);
      continue;
    }
    const stationId = normalizeId(platform.station_id);
    const station = stationMap.get(stationId);
    if (station) {
      const stationCenter = computeStationCenter(station);
      if (stationCenter) {
        points.push(stationCenter);
      }
    }
  }
  if (!points.length) {
    for (const station of stations) {
      const center = computeStationCenter(station);
      if (center) points.push(center);
    }
  }
  return { source: 'fallback', points };
}

function buildGeometryFromGraph(
  graph: RailGraph,
  platforms: RailwayPlatformRecord[],
): {
  points: Array<{ x: number; z: number }>;
  pathNodes3d: any[];
  pathEdges: RailGeometrySegment[] | null;
} | null {
  const rawPlatformNodes = extractPlatformNodes(platforms);
  if (!rawPlatformNodes.length) return null;
  if (!graph.positions.size) return null;
  const snapped = snapPlatformNodesToRailGraph(rawPlatformNodes, graph);
  const platformNodes = snapped.nodes;
  if (!platformNodes.length) return null;
  const finder = new MtrRouteFinder(graph);
  const pathResult = finder.findRoute(platformNodes as any);
  const path = pathResult?.points ?? null;
  if (!path?.length) return null;
  const segments = includePlatformSegments(pathResult?.segments, platforms);
  return {
    points: path.map((p: any) => ({ x: p.x, z: p.z })),
    pathNodes3d: path,
    pathEdges: segments.length ? segments : null,
  };
}

export async function computeRouteGeometrySnapshots(
  prisma: PrismaService,
  input: RouteGeometryComputeInput,
  logger: { warn: (msg: string) => void },
  concurrency = 2,
): Promise<Map<string, RouteGeometrySnapshotValue>> {
  const routeGeometryById = new Map<string, RouteGeometrySnapshotValue>();
  const stationMap = buildStationsMap(input.dataset.stationRecords);

  const handler = async (record: RailwayRouteRecord) => {
    const routeId = normalizeId(record.id);
    if (!routeId) return;
    const routePlatforms = resolvePlatformsForRoute(
      record,
      input.dataset.platformMap,
    );
    if (!routePlatforms.length) return;

    let points: Array<{ x: number; z: number }> = [];
    let pathNodes3d: any[] | null = null;
    let pathEdges: RailGeometrySegment[] | null = null;
    if (input.graph) {
      const fromGraph = buildGeometryFromGraph(input.graph, routePlatforms);
      if (fromGraph) {
        points = fromGraph.points;
        pathNodes3d = fromGraph.pathNodes3d;
        pathEdges = fromGraph.pathEdges;
      }
    }
    if (points.length < 2) {
      const fallback = buildFallbackGeometry(
        routePlatforms,
        stationMap,
        input.dataset.stationRecords,
      );
      points = fallback.points;
      pathNodes3d = null;
      pathEdges = null;
    }

    const paths2d: Array<Array<{ x: number; z: number }>> = points.length
      ? [points.map((p) => ({ x: p.x, z: p.z }))]
      : [];
    const bounds = computeBoundsFromPaths(paths2d);
    const stops = buildRouteStopsForSnapshot({
      route: record,
      platformMap: input.dataset.platformMap,
      stationMap,
    });

    const value: RouteGeometrySnapshotValue = {
      paths: paths2d,
      bounds,
      stops,
      pathNodes3d: pathNodes3d as any,
      pathEdges,
    };
    routeGeometryById.set(routeId, value);

    await prisma.transportationRailwayRouteGeometrySnapshot.upsert({
      where: {
        serverId_railwayMod_dimensionContext_routeEntityId: {
          serverId: input.scope.serverId,
          railwayMod: input.scope.railwayMod,
          dimensionContext: input.scope.dimensionContext,
          routeEntityId: routeId,
        },
      },
      update: {
        sourceFingerprint: input.fingerprint,
        status: 'READY',
        errorMessage: null,
        geometry2d: { paths: paths2d } as Prisma.InputJsonValue,
        bounds: bounds as unknown as Prisma.InputJsonValue,
        stops: stops as unknown as Prisma.InputJsonValue,
        pathNodes3d: (pathNodes3d ?? null) as unknown as Prisma.InputJsonValue,
        pathEdges: (pathEdges ?? null) as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
      create: {
        id: randomUUID(),
        serverId: input.scope.serverId,
        railwayMod: input.scope.railwayMod,
        dimensionContext: input.scope.dimensionContext,
        routeEntityId: routeId,
        sourceFingerprint: input.fingerprint,
        status: 'READY',
        geometry2d: { paths: paths2d } as Prisma.InputJsonValue,
        bounds: bounds as unknown as Prisma.InputJsonValue,
        stops: stops as unknown as Prisma.InputJsonValue,
        pathNodes3d: (pathNodes3d ?? null) as unknown as Prisma.InputJsonValue,
        pathEdges: (pathEdges ?? null) as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
    });
  };

  await runWithConcurrency(
    input.dataset.routeRecords,
    concurrency,
    async (record) => {
      try {
        await handler(record);
      } catch (error) {
        const routeId = normalizeId(record.id);
        const message = error instanceof Error ? error.message : String(error);
        if (routeId) {
          await prisma.transportationRailwayRouteGeometrySnapshot.upsert({
            where: {
              serverId_railwayMod_dimensionContext_routeEntityId: {
                serverId: input.scope.serverId,
                railwayMod: input.scope.railwayMod,
                dimensionContext: input.scope.dimensionContext,
                routeEntityId: routeId,
              },
            },
            update: {
              sourceFingerprint: input.fingerprint,
              status: 'FAILED',
              errorMessage: message,
              generatedAt: new Date(),
            },
            create: {
              id: randomUUID(),
              serverId: input.scope.serverId,
              railwayMod: input.scope.railwayMod,
              dimensionContext: input.scope.dimensionContext,
              routeEntityId: routeId,
              sourceFingerprint: input.fingerprint,
              status: 'FAILED',
              errorMessage: message,
              geometry2d: {} as Prisma.InputJsonValue,
              generatedAt: new Date(),
            },
          });
        } else {
          logger.warn(`Route geometry snapshot failed: ${message}`);
        }
      }
    },
  );

  return routeGeometryById;
}

export function buildGraphFromRails(
  rails: Array<{ entityId: string; payload: Prisma.JsonValue }>,
): RailGraph | null {
  return buildRailGraph(rails);
}
