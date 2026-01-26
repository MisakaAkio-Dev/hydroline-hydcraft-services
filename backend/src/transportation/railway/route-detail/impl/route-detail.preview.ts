import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import {
  buildPreviewSvg,
  computeBoundsFromPoints,
  mergeBounds,
  parseSnapshotBounds,
  type RoutePreviewBounds,
  type RoutePreviewPath,
} from '../../utils/route-preview';
import { normalizeId } from '../../utils/railway-normalizer';
import type { BeaconServerRecord } from '../../utils/railway-common';
import { resolveMinPathNodeCount } from './route-detail.constants';
import type { RouteDetailMappers } from './route-detail.mappers';
import type { RouteDetailStorage } from './route-detail.storage';
import type { RouteDetailVariants } from './route-detail.variants';

export class RouteDetailPreview {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RouteDetailStorage,
    private readonly mappers: RouteDetailMappers,
    private readonly variants: RouteDetailVariants,
  ) {}

  async buildRoutePreviewSvg(input: {
    server: BeaconServerRecord;
    dimensionContext: string | null;
    baseKey: string | null;
    primaryRouteId: string;
  }) {
    if (!input.dimensionContext) return null;
    const routeRows = await this.storage.fetchStoredRoutesForDimensionRows(
      input.server,
      input.dimensionContext,
    );
    const candidates = routeRows
      .map((row) => {
        if (!row.entityId) return null;
        const record = this.mappers.buildRouteRecordFromEntity(row);
        if (!record) return null;
        const key = this.variants.buildRouteBaseKey(record);
        if (input.baseKey) {
          if (!key || key !== input.baseKey) return null;
        } else if (normalizeId(record.id) !== input.primaryRouteId) {
          return null;
        }
        const normalized = this.mappers.normalizeStoredRoute(row, input.server);
        if (!normalized) return null;
        return {
          routeId: normalized.id,
          color: normalized.color ?? null,
        };
      })
      .filter(
        (
          item,
        ): item is {
          routeId: string;
          color: number | null;
        } => Boolean(item),
      );

    const unique = new Map<string, { routeId: string; color: number | null }>();
    const sortedCandidates = [...candidates].sort((a, b) => {
      const aPrimary = a.routeId === input.primaryRouteId;
      const bPrimary = b.routeId === input.primaryRouteId;
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return a.routeId.localeCompare(b.routeId);
    });
    for (const item of sortedCandidates) {
      unique.set(item.routeId, item);
    }
    if (!unique.size) {
      unique.set(input.primaryRouteId, {
        routeId: input.primaryRouteId,
        color: null,
      });
    }

    const snapshotRows =
      await this.prisma.transportationRailwayRouteGeometrySnapshot.findMany({
        where: {
          status: 'READY',
          OR: Array.from(unique.values()).map((item) => ({
            serverId: input.server.id,
            railwayMod: input.server.railwayMod,
            dimensionContext: input.dimensionContext!,
            routeEntityId: item.routeId,
          })),
        },
        select: {
          serverId: true,
          railwayMod: true,
          dimensionContext: true,
          routeEntityId: true,
          geometry2d: true,
          pathNodes3d: true,
          bounds: true,
          stops: true,
        },
      });

    const snapshotMap = new Map<
      string,
      {
        geometry2d: Prisma.JsonValue;
        pathNodes3d: Prisma.JsonValue;
        bounds: Prisma.JsonValue | null;
        stops: Prisma.JsonValue | null;
      }
    >(
      snapshotRows.map((row) => [
        [
          row.serverId,
          row.railwayMod,
          row.dimensionContext,
          row.routeEntityId,
        ].join('::'),
        {
          geometry2d: row.geometry2d,
          pathNodes3d: row.pathNodes3d,
          bounds: row.bounds,
          stops: row.stops,
        },
      ]),
    );

    let mergedBounds: RoutePreviewBounds | null = null;
    const paths: RoutePreviewPath[] = [];
    for (const item of unique.values()) {
      const key = [
        input.server.id,
        input.server.railwayMod,
        input.dimensionContext,
        item.routeId,
      ].join('::');
      const snapshot = snapshotMap.get(key);
      if (!snapshot) continue;

      const stopCount = Array.isArray(snapshot.stops)
        ? snapshot.stops.length
        : null;
      const minNodeCount = resolveMinPathNodeCount(stopCount);

      const nodes = Array.isArray(snapshot.pathNodes3d)
        ? (snapshot.pathNodes3d as Array<{ x?: unknown; z?: unknown }>)
        : [];
      const pointsFromNodes = nodes
        .map((node) => ({
          x: Number(node.x),
          z: Number(node.z),
        }))
        .filter(
          (point): point is { x: number; z: number } =>
            Number.isFinite(point.x) && Number.isFinite(point.z),
        );
      if (pointsFromNodes.length >= minNodeCount) {
        paths.push({ points: pointsFromNodes, color: item.color ?? null });
        mergedBounds = mergeBounds(
          mergedBounds,
          computeBoundsFromPoints([pointsFromNodes]),
        );
        continue;
      }

      const rawPaths = (snapshot.geometry2d as Record<string, unknown>)?.paths;
      if (Array.isArray(rawPaths)) {
        for (const raw of rawPaths) {
          if (!Array.isArray(raw)) continue;
          const points = raw
            .map((entry) => ({
              x: Number(entry?.x),
              z: Number(entry?.z),
            }))
            .filter(
              (point): point is { x: number; z: number } =>
                Number.isFinite(point.x) && Number.isFinite(point.z),
            );
          if (points.length < 2) continue;
          paths.push({ points, color: item.color ?? null });
          mergedBounds = mergeBounds(
            mergedBounds,
            computeBoundsFromPoints([points]),
          );
        }
      }

      const snapshotBounds = parseSnapshotBounds(snapshot.bounds);
      mergedBounds = mergeBounds(mergedBounds, snapshotBounds);
    }

    return buildPreviewSvg({ paths, bounds: mergedBounds });
  }
}
