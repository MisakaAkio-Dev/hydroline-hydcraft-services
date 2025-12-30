import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransportationRailwayMod } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeScopeFingerprint } from './compute/fingerprint';
import { loadScopeDataset } from './compute/dataset';
import {
  buildGraphFromRails,
  computeRouteGeometrySnapshots,
  computeRouteGeometrySnapshotForRoute,
} from './compute/route-geometry';
import {
  extractBlockPosition,
  extractPlatformNodes,
  extractRailConnections,
  extractRailNodePosition,
  normalizeRailConnectionMetadata,
  snapPlatformNodesToRailGraph,
} from './compute/rail-graph';
import { computeStationMapSnapshots } from './compute/station-map';
import type { ScopeDataset, ScopeKey } from './compute/types';
import {
  buildDimensionContextFromDimension,
  normalizeId,
  normalizeIdList,
  normalizePayloadRecord,
} from '../utils/railway-normalizer';
import type {
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
} from '../types/railway-graph.types';
import type {
  RailwayCurveDiagnostics,
  RailwayRouteFallbackDiagnostics,
} from '../types/railway-types';
import { encodeBlockPosition } from '../../utils/block-pos.util';

type MissingCurveSegment = {
  index: number;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  connection: {
    railType: string | null;
    transportMode: string | null;
    modelKey: string | null;
    isSecondaryDir: boolean | null;
    yStart: number | null;
    yEnd: number | null;
    verticalCurveRadius: number | null;
    preferredCurve: string | null;
    primary: RailCurveParameters | null;
    secondary: RailCurveParameters | null;
  } | null;
};

type RailConnectionDiagnostic = {
  targetNodeId: string | null;
  targetPosition: { x: number; y: number; z: number } | null;
  railType: string | null;
  transportMode: string | null;
  modelKey: string | null;
  isSecondaryDir: boolean | null;
  yStart: number | null;
  yEnd: number | null;
  verticalCurveRadius: number | null;
  preferredCurve: string | null;
  primary: RailCurveParameters | null;
  secondary: RailCurveParameters | null;
  hasCurve: boolean;
};

type RailDiagnostic = {
  railId: string;
  nodeId: string | null;
  nodePosition: { x: number; y: number; z: number } | null;
  connectionCount: number;
  connections: RailConnectionDiagnostic[];
  hasNodePosition: boolean;
  hasConnections: boolean;
  inGraph: boolean;
  usedInRoutePath: boolean;
  curvePresentCount: number;
  curveMissingCount: number;
  associatedPlatformIds: string[];
  associatedRouteIds: string[];
  calculationSuccess: boolean;
  issues: string[];
  payload: Record<string, unknown> | null;
};

type RailDiagnosticsCacheEntry = {
  jobId: string;
  serverId: string;
  routeId: string;
  railwayMod: TransportationRailwayMod;
  dimensionContext: string;
  createdAt: number;
  rails: RailDiagnostic[];
};

type ScopeSnapshotComputeOutcome =
  | 'SKIPPED_UNCHANGED'
  | 'SKIPPED_RUNNING'
  | 'SKIPPED_LOCKED'
  | 'SUCCEEDED'
  | 'FAILED';

type ScopeSnapshotComputeResult = {
  outcome: ScopeSnapshotComputeOutcome;
  dimensionContext: string;
  fingerprint: string;
};

function hasCurveParams(params: RailCurveParameters | null | undefined) {
  if (!params) return false;
  return (
    params.h !== null ||
    params.k !== null ||
    params.r !== null ||
    params.tStart !== null ||
    params.tEnd !== null ||
    params.reverse !== null ||
    params.isStraight !== null
  );
}

function buildCurveDiagnostics(
  pathEdges: RailGeometrySegment[] | null | undefined,
): {
  curveDiagnostics: RailwayCurveDiagnostics;
  missingCurveSegments: MissingCurveSegment[];
} {
  const edges = Array.isArray(pathEdges) ? pathEdges : [];
  let segmentsWithPrimaryCurve = 0;
  let segmentsWithSecondaryCurve = 0;
  let segmentsWithAnyCurve = 0;
  let segmentsStraight = 0;
  let segmentsWithVerticalCurve = 0;
  const missingCurveSegments: MissingCurveSegment[] = [];

  edges.forEach((segment, index) => {
    const connection = segment?.connection ?? null;
    const primary = connection?.primary ?? null;
    const secondary = connection?.secondary ?? null;
    const hasPrimary = hasCurveParams(primary);
    const hasSecondary = hasCurveParams(secondary);
    const hasAny = hasPrimary || hasSecondary;
    if (hasPrimary) segmentsWithPrimaryCurve += 1;
    if (hasSecondary) segmentsWithSecondaryCurve += 1;
    if (hasAny) segmentsWithAnyCurve += 1;
    if (primary?.isStraight === true || secondary?.isStraight === true) {
      segmentsStraight += 1;
    }
    if (connection?.verticalCurveRadius != null) {
      segmentsWithVerticalCurve += 1;
    }
    if (!hasAny) {
      missingCurveSegments.push({
        index,
        start: segment.start,
        end: segment.end,
        connection: connection
          ? {
              railType: connection.railType ?? null,
              transportMode: connection.transportMode ?? null,
              modelKey: connection.modelKey ?? null,
              isSecondaryDir: connection.isSecondaryDir ?? null,
              yStart: connection.yStart ?? null,
              yEnd: connection.yEnd ?? null,
              verticalCurveRadius: connection.verticalCurveRadius ?? null,
              preferredCurve: connection.preferredCurve ?? null,
              primary,
              secondary,
            }
          : null,
      });
    }
  });

  const curveDiagnostics: RailwayCurveDiagnostics = {
    totalSegments: edges.length,
    segmentsWithPrimaryCurve,
    segmentsWithSecondaryCurve,
    segmentsWithAnyCurve,
    segmentsWithoutCurve: edges.length - segmentsWithAnyCurve,
    segmentsStraight,
    segmentsWithVerticalCurve,
  };

  return { curveDiagnostics, missingCurveSegments };
}

@Injectable()
export class TransportationRailwaySnapshotService {
  private readonly logger = new Logger(
    TransportationRailwaySnapshotService.name,
  );
  private railDiagnosticsCache: {
    expiresAt: number;
    entry: RailDiagnosticsCacheEntry;
  } | null = null;
  private readonly railDiagnosticsTtlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private pruneRailDiagnosticsCache(now = Date.now()) {
    if (
      this.railDiagnosticsCache?.expiresAt &&
      this.railDiagnosticsCache.expiresAt <= now
    ) {
      this.logger.log('[rail-debug] rail diagnostics cache expired');
      this.railDiagnosticsCache = null;
    }
  }

  private storeRailDiagnostics(entry: RailDiagnosticsCacheEntry) {
    this.pruneRailDiagnosticsCache();
    if (this.railDiagnosticsCache) {
      this.logger.log(
        `[rail-debug] replace rail diagnostics cache: ${this.railDiagnosticsCache.entry.routeId} -> ${entry.routeId}`,
      );
    }
    this.railDiagnosticsCache = {
      expiresAt: Date.now() + this.railDiagnosticsTtlMs,
      entry,
    };
    this.logger.log(
      `[rail-debug] stored rail diagnostics cache for ${entry.routeId} (ttl ${Math.round(this.railDiagnosticsTtlMs / 60000)}m)`,
    );
  }

  private getRailDiagnostics(jobId: string) {
    this.pruneRailDiagnosticsCache();
    const cached = this.railDiagnosticsCache;
    if (!cached) return null;
    if (cached.entry.jobId !== jobId) {
      return null;
    }
    return cached.entry;
  }

  async computeAndPersistAllSnapshotsForServer(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
  }) {
    const dimensionContexts = await this.listDimensionContexts(input);
    const summary = {
      total: dimensionContexts.length,
      succeeded: 0,
      failed: 0,
      skippedUnchanged: 0,
      skippedRunning: 0,
      skippedLocked: 0,
    };
    this.logger.log(
      `[RailwaySnapshot] compute start: ${input.serverId} ${input.railwayMod} scopes=${summary.total}`,
    );
    for (const dimensionContext of dimensionContexts) {
      const result = await this.computeAndPersistScopeSnapshots({
        serverId: input.serverId,
        railwayMod: input.railwayMod,
        dimensionContext,
      });
      switch (result.outcome) {
        case 'SUCCEEDED':
          summary.succeeded += 1;
          break;
        case 'FAILED':
          summary.failed += 1;
          break;
        case 'SKIPPED_UNCHANGED':
          summary.skippedUnchanged += 1;
          break;
        case 'SKIPPED_RUNNING':
          summary.skippedRunning += 1;
          break;
        case 'SKIPPED_LOCKED':
          summary.skippedLocked += 1;
          break;
        default:
          break;
      }
    }
    this.logger.log(
      `[RailwaySnapshot] compute done: ${input.serverId} ${input.railwayMod} scopes=${summary.total} succeeded=${summary.succeeded} failed=${summary.failed} skippedUnchanged=${summary.skippedUnchanged} skippedRunning=${summary.skippedRunning} skippedLocked=${summary.skippedLocked}`,
    );
  }

  private async listDimensionContexts(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
  }): Promise<string[]> {
    const rows = await this.prisma.transportationRailwayDimension.findMany({
      where: { serverId: input.serverId, railwayMod: input.railwayMod },
      select: { dimensionContext: true },
      orderBy: { dimensionContext: 'asc' },
    });
    const contexts = rows
      .map((row) => row.dimensionContext)
      .filter((ctx): ctx is string => Boolean(ctx?.trim()));
    if (contexts.length) {
      return contexts;
    }
    const rails = await this.prisma.transportationRailwayRail.findMany({
      where: { serverId: input.serverId, railwayMod: input.railwayMod },
      distinct: ['dimensionContext'],
      select: { dimensionContext: true },
    });
    return rails
      .map((row) => row.dimensionContext?.trim() ?? '')
      .filter(Boolean);
  }

  private async computeAndPersistScopeSnapshots(
    scope: ScopeKey,
  ): Promise<ScopeSnapshotComputeResult> {
    const fingerprint = await computeScopeFingerprint(this.prisma, scope);
    const existing =
      await this.prisma.transportationRailwayComputeScope.findUnique({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
      });

    const fingerprintUnchanged =
      existing?.fingerprint === fingerprint && existing.status === 'SUCCEEDED';
    if (fingerprintUnchanged) {
      this.logger.log(
        `Fingerprint unchanged: ${scope.serverId} ${scope.railwayMod} ${scope.dimensionContext}`,
      );
      return {
        outcome: 'SKIPPED_UNCHANGED',
        dimensionContext: scope.dimensionContext,
        fingerprint,
      };
    }

    if (existing?.status === 'RUNNING') {
      return {
        outcome: 'SKIPPED_RUNNING',
        dimensionContext: scope.dimensionContext,
        fingerprint,
      };
    }

    const lockResult =
      await this.prisma.transportationRailwayComputeScope.updateMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
          status: { not: 'RUNNING' },
        },
        data: {
          fingerprint,
          status: 'RUNNING',
          message: null,
          computedAt: null,
        },
      });

    if (lockResult.count === 0) {
      if (existing) {
        return {
          outcome: 'SKIPPED_LOCKED',
          dimensionContext: scope.dimensionContext,
          fingerprint,
        };
      }
      try {
        await this.prisma.transportationRailwayComputeScope.create({
          data: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
            fingerprint,
            status: 'RUNNING',
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return {
            outcome: 'SKIPPED_LOCKED',
            dimensionContext: scope.dimensionContext,
            fingerprint,
          };
        }
        throw error;
      }
    }

    try {
      const dataset = await loadScopeDataset(this.prisma, scope);
      const graph = buildGraphFromRails(dataset.rails);

      const { routeGeometryById, fallbackRouteIds } =
        await computeRouteGeometrySnapshots(
          this.prisma,
          { scope, graph, dataset, fingerprint },
          this.logger,
          Number(process.env.RAILWAY_SNAPSHOT_ROUTE_CONCURRENCY ?? 2),
        );

      await computeStationMapSnapshots(
        this.prisma,
        { scope, dataset, routeGeometryById, fingerprint },
        this.logger,
        Number(process.env.RAILWAY_SNAPSHOT_STATION_CONCURRENCY ?? 2),
      );

      await this.persistFallbackRouteCalculates({
        scope,
        dataset,
        graph,
        fingerprint,
        fallbackRouteIds,
      });

      await this.prisma.transportationRailwayComputeScope.update({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
        data: {
          status: 'SUCCEEDED',
          computedAt: new Date(),
          message: null,
        },
      });
      return {
        outcome: 'SUCCEEDED',
        dimensionContext: scope.dimensionContext,
        fingerprint,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.transportationRailwayComputeScope.update({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
        data: {
          status: 'FAILED',
          message,
        },
      });
      this.logger.error(
        `Compute scope failed: ${scope.serverId} ${scope.railwayMod} ${scope.dimensionContext}: ${message}`,
      );
      return {
        outcome: 'FAILED',
        dimensionContext: scope.dimensionContext,
        fingerprint,
      };
    }
  }

  private extractDimensionFromContext(
    dimensionContext: string | null | undefined,
  ) {
    const segments = (dimensionContext ?? '').split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    const dimension = segments.pop();
    const namespace = segments.pop();
    if (!namespace || !dimension) {
      return null;
    }
    return `${namespace}:${dimension}`;
  }

  private async resolveDimension(scope: ScopeKey) {
    const row = await this.prisma.transportationRailwayDimension.findUnique({
      where: {
        serverId_railwayMod_dimensionContext: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
      },
      select: { dimension: true },
    });
    return (
      row?.dimension ?? this.extractDimensionFromContext(scope.dimensionContext)
    );
  }

  private buildFallbackDiagnosticsForRoute(input: {
    graph: RailGraph | null;
    dataset: ScopeDataset;
    routePlatformIds: string[];
    pathEdges: RailGeometrySegment[] | null;
    source: string | null;
  }): RailwayRouteFallbackDiagnostics {
    const { graph, dataset, routePlatformIds, pathEdges, source } = input;
    const graphNodeCount = graph?.positions?.size ?? 0;
    let graphEdgeCount = 0;
    if (graph?.adjacency) {
      for (const edges of graph.adjacency.values()) {
        graphEdgeCount += edges.size;
      }
      graphEdgeCount = Math.floor(graphEdgeCount / 2);
    }

    const platformNodes = extractPlatformNodes(dataset.platformRecords);
    const platformWithNodesCount = platformNodes.length;
    const platformCount = dataset.platformRecords.length;
    const platformNodeCount = platformNodes.reduce(
      (total, entry) => total + entry.nodes.length,
      0,
    );
    const platformMissingPosCount = Math.max(
      0,
      platformCount - platformWithNodesCount,
    );

    const snapped = graph
      ? snapPlatformNodesToRailGraph(platformNodes, graph)
      : { nodes: [], missingNodes: 0, snappedNodes: 0 };
    const snappedPlatformCount = snapped.nodes.length;
    const snappedNodeCount = snapped.nodes.reduce(
      (total, entry) => total + entry.nodes.length,
      0,
    );
    const snappedMissingNodeCount = snapped.missingNodes;

    const usedNodeIds = new Set<string>();
    if (Array.isArray(pathEdges)) {
      for (const segment of pathEdges) {
        const startId = encodeBlockPosition(segment.start);
        const endId = encodeBlockPosition(segment.end);
        if (startId) usedNodeIds.add(startId);
        if (endId) usedNodeIds.add(endId);
      }
    }

    const pathSegmentCount = Array.isArray(pathEdges) ? pathEdges.length : 0;
    const usedPathNodeCount = usedNodeIds.size;
    const reasons: string[] = [];
    if (!graph || graphNodeCount === 0) reasons.push('graph_empty');
    if (platformWithNodesCount === 0) reasons.push('platform_nodes_missing');
    if (graph && snappedPlatformCount === 0) {
      reasons.push('platform_nodes_not_snapped');
    }
    if (graph && snappedPlatformCount > 0 && pathSegmentCount === 0) {
      reasons.push('path_not_found');
    }

    let graphComponentCount = 0;
    const componentByNode = new Map<string, number>();
    if (graph?.adjacency) {
      const visited = new Set<string>();
      for (const nodeId of graph.positions.keys()) {
        if (visited.has(nodeId)) continue;
        const queue = [nodeId];
        visited.add(nodeId);
        componentByNode.set(nodeId, graphComponentCount);
        while (queue.length) {
          const current = queue.shift()!;
          const edges = graph.adjacency.get(current);
          if (!edges) continue;
          for (const next of edges) {
            if (visited.has(next)) continue;
            visited.add(next);
            componentByNode.set(next, graphComponentCount);
            queue.push(next);
          }
        }
        graphComponentCount += 1;
      }
    }

    const snappedByPlatform = new Map<string, string[]>();
    for (const entry of snapped.nodes) {
      if (!entry.platformId) continue;
      snappedByPlatform.set(
        entry.platformId,
        entry.nodes.map((node) => node.id),
      );
    }

    const routePlatformComponents: RailwayRouteFallbackDiagnostics['routePlatformComponents'] =
      [];
    let routePlatformMissingNodes = 0;
    const routeComponentSet = new Set<number>();
    for (const platformId of routePlatformIds) {
      const nodeIds = snappedByPlatform.get(platformId) ?? [];
      if (!nodeIds.length) {
        routePlatformMissingNodes += 1;
      }
      const componentIds = Array.from(
        new Set(
          nodeIds
            .map((nodeId) => componentByNode.get(nodeId))
            .filter((value): value is number => typeof value === 'number'),
        ),
      );
      componentIds.forEach((id) => routeComponentSet.add(id));
      routePlatformComponents.push({
        platformId,
        nodeIds,
        componentIds,
      });
    }

    const routePlatformComponentCount = routeComponentSet.size;
    if (routePlatformComponentCount > 1) {
      reasons.push('route_platforms_disconnected');
    }

    const disconnectedSegments: RailwayRouteFallbackDiagnostics['disconnectedSegments'] =
      [];
    if (graph && routePlatformComponentCount > 1) {
      const componentNodeMap = new Map<number, Set<string>>();
      for (const entry of routePlatformComponents) {
        for (const componentId of entry.componentIds) {
          if (!componentNodeMap.has(componentId)) {
            componentNodeMap.set(componentId, new Set());
          }
          const bucket = componentNodeMap.get(componentId)!;
          for (const nodeId of entry.nodeIds) {
            bucket.add(nodeId);
          }
        }
      }
      const componentIds = Array.from(componentNodeMap.keys());
      for (let i = 0; i < componentIds.length; i += 1) {
        for (let j = i + 1; j < componentIds.length; j += 1) {
          const fromComponent = componentIds[i];
          const toComponent = componentIds[j];
          const fromNodes = Array.from(
            componentNodeMap.get(fromComponent) ?? [],
          );
          const toNodes = Array.from(componentNodeMap.get(toComponent) ?? []);
          let best: {
            fromNodeId: string;
            toNodeId: string;
            from: { x: number; y: number; z: number };
            to: { x: number; y: number; z: number };
            distance: number;
          } | null = null;
          for (const fromNodeId of fromNodes) {
            const fromPos = graph.positions.get(fromNodeId);
            if (!fromPos) continue;
            for (const toNodeId of toNodes) {
              const toPos = graph.positions.get(toNodeId);
              if (!toPos) continue;
              const distance = Math.hypot(
                fromPos.x - toPos.x,
                fromPos.y - toPos.y,
                fromPos.z - toPos.z,
              );
              if (!best || distance < best.distance) {
                best = {
                  fromNodeId,
                  toNodeId,
                  from: { x: fromPos.x, y: fromPos.y, z: fromPos.z },
                  to: { x: toPos.x, y: toPos.y, z: toPos.z },
                  distance,
                };
              }
            }
          }
          if (best) {
            disconnectedSegments.push({
              fromComponent,
              toComponent,
              fromNodeId: best.fromNodeId,
              toNodeId: best.toNodeId,
              from: best.from,
              to: best.to,
              distance: Math.round(best.distance * 100) / 100,
            });
          }
        }
      }
    }

    return {
      source: source ?? null,
      graphPresent: Boolean(graph),
      graphNodeCount,
      graphEdgeCount,
      platformCount,
      platformWithNodesCount,
      platformMissingPosCount,
      platformNodeCount,
      snappedPlatformCount,
      snappedNodeCount,
      snappedMissingNodeCount,
      usedPathNodeCount,
      pathSegmentCount,
      graphComponentCount,
      routePlatformCount: routePlatformIds.length,
      routePlatformMissingNodes,
      routePlatformComponentCount,
      routePlatformComponents,
      disconnectedSegments,
      reasons,
    };
  }

  private async persistFallbackRouteCalculates(input: {
    scope: ScopeKey;
    dataset: ScopeDataset;
    graph: RailGraph | null;
    fingerprint: string;
    fallbackRouteIds: Set<string>;
  }) {
    const { scope, dataset, graph, fingerprint, fallbackRouteIds } = input;
    if (!fallbackRouteIds.size) {
      await this.prisma.transportationRailwayRouteCalculate.deleteMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
      });
      return;
    }

    const dimension = await this.resolveDimension(scope);
    const routeRecordById = new Map<
      string,
      (typeof dataset.routeRecords)[number]
    >();
    for (const record of dataset.routeRecords) {
      const routeId = normalizeId(record.id);
      if (!routeId) continue;
      routeRecordById.set(routeId, record);
    }

    const routeIds = Array.from(fallbackRouteIds);
    const snapshots =
      await this.prisma.transportationRailwayRouteGeometrySnapshot.findMany({
        where: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
          routeEntityId: { in: routeIds },
        },
        select: {
          routeEntityId: true,
          status: true,
          errorMessage: true,
          geometry2d: true,
          bounds: true,
          stops: true,
          pathNodes3d: true,
          pathEdges: true,
          generatedAt: true,
          sourceFingerprint: true,
        },
      });
    const snapshotByRoute = new Map(
      snapshots.map((snapshot) => [snapshot.routeEntityId, snapshot]),
    );

    const data: Prisma.TransportationRailwayRouteCalculateCreateManyInput[] =
      [];

    for (const routeId of routeIds) {
      const routeRecord = routeRecordById.get(routeId);
      const snapshot = snapshotByRoute.get(routeId);
      if (!routeRecord || !snapshot) continue;

      const geometryPaths = (snapshot.geometry2d as Record<string, unknown>)?.[
        'paths'
      ];
      const geometryPathCount = Array.isArray(geometryPaths)
        ? geometryPaths.length
        : 0;
      const geometryPointCount = Array.isArray(geometryPaths)
        ? geometryPaths.reduce(
            (total, entry) => total + (Array.isArray(entry) ? entry.length : 0),
            0,
          )
        : 0;
      const stopCount = Array.isArray(snapshot.stops)
        ? snapshot.stops.length
        : 0;
      const pathNodeCount = Array.isArray(snapshot.pathNodes3d)
        ? snapshot.pathNodes3d.length
        : 0;
      const pathEdgeCount = Array.isArray(snapshot.pathEdges)
        ? snapshot.pathEdges.length
        : 0;
      const { curveDiagnostics } = buildCurveDiagnostics(
        Array.isArray(snapshot.pathEdges)
          ? (snapshot.pathEdges as RailGeometrySegment[])
          : null,
      );

      const routePlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);
      const fallbackDiagnostics = this.buildFallbackDiagnosticsForRoute({
        graph,
        dataset,
        routePlatformIds,
        pathEdges: Array.isArray(snapshot.pathEdges)
          ? (snapshot.pathEdges as RailGeometrySegment[])
          : null,
        source: 'fallback',
      });

      data.push({
        id: randomUUID(),
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
        dimension,
        routeEntityId: routeId,
        status: snapshot.status,
        errorMessage: snapshot.errorMessage ?? null,
        sourceFingerprint: snapshot.sourceFingerprint,
        pathSource: 'fallback',
        persistedSnapshot: snapshot.sourceFingerprint === fingerprint,
        report: {
          pointCount: geometryPointCount,
          pathNodeCount,
          pathEdgeCount,
          stopCount,
          bounds: snapshot.bounds ?? null,
        } as Prisma.InputJsonValue,
        snapshot: {
          status: snapshot.status,
          errorMessage: snapshot.errorMessage ?? null,
          generatedAt: snapshot.generatedAt?.toISOString() ?? null,
          sourceFingerprint: snapshot.sourceFingerprint,
          geometryPathCount,
          geometryPointCount,
          stopCount,
          pathNodeCount,
          pathEdgeCount,
          bounds: snapshot.bounds ?? null,
        } as Prisma.InputJsonValue,
        dataset: {
          routeCount: dataset.routeRecords.length,
          platformCount: dataset.platformRecords.length,
          stationCount: dataset.stationRecords.length,
          railCount: dataset.rails.length,
        } as Prisma.InputJsonValue,
        fallbackDiagnostics: fallbackDiagnostics as Prisma.InputJsonValue,
        curveDiagnostics: curveDiagnostics as Prisma.InputJsonValue,
      });
    }

    if (!data.length) {
      return;
    }

    const batchSize = 25;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await Promise.all(
        batch.map((entry) => {
          const { id: _, ...update } = entry;
          update.railwayMod = scope.railwayMod;
          return this.prisma.transportationRailwayRouteCalculate.upsert({
            where: {
              serverId_railwayMod_dimensionContext_routeEntityId: {
                serverId: scope.serverId,
                railwayMod: scope.railwayMod,
                dimensionContext: scope.dimensionContext,
                routeEntityId: entry.routeEntityId,
              },
            },
            update,
            create: {
              ...entry,
              railwayMod: scope.railwayMod,
            },
          });
        }),
      );
    }

    await this.prisma.transportationRailwayRouteCalculate.deleteMany({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
        routeEntityId: { notIn: routeIds },
      },
    });
  }

  async computeAndPersistRouteGeometrySnapshot(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
    routeId: string;
    dimension?: string | null;
  }) {
    this.logger.log(
      `[rail-debug] manual route geometry compute: ${input.serverId} ${input.railwayMod} ${input.routeId}`,
    );
    const routeId = input.routeId?.trim();
    if (!routeId) {
      throw new BadRequestException('Route ID is required');
    }
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id: input.serverId },
      select: { id: true, transportationRailwayMod: true },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    const serverMod =
      server.transportationRailwayMod ?? TransportationRailwayMod.MTR;
    if (serverMod !== input.railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }

    const explicitContext = buildDimensionContextFromDimension(
      input.dimension,
      input.railwayMod,
    );
    const routeRow = await this.prisma.transportationRailwayRoute.findFirst({
      where: {
        serverId: input.serverId,
        railwayMod: input.railwayMod,
        entityId: routeId,
        ...(explicitContext ? { dimensionContext: explicitContext } : {}),
      },
      select: { entityId: true, dimensionContext: true },
    });
    if (!routeRow) {
      throw new NotFoundException('Route not found');
    }
    const dimensionContext =
      explicitContext ?? routeRow.dimensionContext ?? null;
    if (!dimensionContext) {
      throw new BadRequestException('Missing dimension context');
    }

    const scope = {
      serverId: input.serverId,
      railwayMod: input.railwayMod,
      dimensionContext,
    };
    const fingerprint = await computeScopeFingerprint(this.prisma, scope);
    const dataset = await loadScopeDataset(this.prisma, scope);
    const graph = buildGraphFromRails(dataset.rails);

    const normalizedRouteId =
      normalizeId(routeRow.entityId) ?? routeRow.entityId;
    const routeRecord = dataset.routeRecords.find(
      (record) => normalizeId(record.id) === normalizedRouteId,
    );
    if (!routeRecord) {
      throw new NotFoundException('Route dataset not found');
    }

    const routePlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);
    const platformById = new Map<
      string,
      (typeof dataset.platformRecords)[number]
    >();
    for (const platform of dataset.platformRecords) {
      const normalized = normalizeId(platform.id);
      if (normalized) {
        platformById.set(normalized, platform);
      }
    }
    const resolvedPlatformIds = routePlatformIds.filter((id) =>
      platformById.has(id),
    );
    const missingPlatformIds = routePlatformIds.filter(
      (id) => !platformById.has(id),
    );
    const platformDiagnostics = resolvedPlatformIds.map((platformId) => {
      const platform = platformById.get(platformId)!;
      return {
        platformId,
        name: platform.name ?? null,
        stationId: normalizeId(platform.station_id) ?? null,
        transportMode: platform.transport_mode ?? null,
        hasPos1: platform.pos_1 != null,
        hasPos2: platform.pos_2 != null,
        routeIds: normalizeIdList(platform.route_ids ?? []),
      };
    });
    const routeIds = dataset.routeRecords
      .map((record) => normalizeId(record.id))
      .filter((id): id is string => Boolean(id));
    const platformIds = dataset.platformRecords
      .map((record) => normalizeId(record.id))
      .filter((id): id is string => Boolean(id));
    const railIds = dataset.rails
      .map((row) => normalizeId(row.entityId))
      .filter((id): id is string => Boolean(id));

    const report = await computeRouteGeometrySnapshotForRoute(
      this.prisma,
      {
        scope,
        graph,
        dataset,
        fingerprint,
      },
      this.logger,
      routeRecord,
    );

    const snapshot =
      await this.prisma.transportationRailwayRouteGeometrySnapshot.findUnique({
        where: {
          serverId_railwayMod_dimensionContext_routeEntityId: {
            serverId: input.serverId,
            railwayMod: input.railwayMod,
            dimensionContext,
            routeEntityId: report.routeId,
          },
        },
        select: {
          status: true,
          errorMessage: true,
          geometry2d: true,
          bounds: true,
          stops: true,
          pathNodes3d: true,
          pathEdges: true,
          generatedAt: true,
          sourceFingerprint: true,
        },
      });

    const geometryPaths = (snapshot?.geometry2d as Record<string, unknown>)?.[
      'paths'
    ];
    const geometryPathCount = Array.isArray(geometryPaths)
      ? geometryPaths.length
      : 0;
    const geometryPointCount = Array.isArray(geometryPaths)
      ? geometryPaths.reduce(
          (total, entry) => total + (Array.isArray(entry) ? entry.length : 0),
          0,
        )
      : 0;
    const stopCount = Array.isArray(snapshot?.stops)
      ? snapshot?.stops.length
      : 0;
    const pathNodeCount = Array.isArray(snapshot?.pathNodes3d)
      ? snapshot?.pathNodes3d.length
      : 0;
    const pathEdgeCount = Array.isArray(snapshot?.pathEdges)
      ? snapshot?.pathEdges.length
      : 0;
    const { curveDiagnostics, missingCurveSegments } = buildCurveDiagnostics(
      Array.isArray(snapshot?.pathEdges)
        ? (snapshot?.pathEdges as RailGeometrySegment[])
        : null,
    );
    const usedNodeIds = new Set<string>();
    if (Array.isArray(snapshot?.pathEdges)) {
      for (const segment of snapshot.pathEdges as RailGeometrySegment[]) {
        const startId = encodeBlockPosition(segment.start);
        const endId = encodeBlockPosition(segment.end);
        if (startId) usedNodeIds.add(startId);
        if (endId) usedNodeIds.add(endId);
      }
    }

    const platformNodes = extractPlatformNodes(dataset.platformRecords);
    const platformWithNodesCount = platformNodes.length;
    const platformCount = dataset.platformRecords.length;
    const platformNodeCount = platformNodes.reduce(
      (total, entry) => total + entry.nodes.length,
      0,
    );
    const platformMissingPosCount = Math.max(
      0,
      platformCount - platformWithNodesCount,
    );
    const nodePlatformMap = new Map<string, Set<string>>();
    for (const platform of platformNodes) {
      if (!platform.platformId) continue;
      for (const node of platform.nodes) {
        if (!nodePlatformMap.has(node.id)) {
          nodePlatformMap.set(node.id, new Set());
        }
        nodePlatformMap.get(node.id)!.add(platform.platformId);
      }
    }

    const railsDiagnostics: RailDiagnostic[] = [];
    for (const row of dataset.rails) {
      const railId = normalizeId(row.entityId) ?? row.entityId;
      const rawPayload =
        row.payload &&
        typeof row.payload === 'object' &&
        !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null;
      const normalizedPayload = rawPayload
        ? normalizePayloadRecord(rawPayload)
        : null;
      const nodePosition = normalizedPayload
        ? extractRailNodePosition(normalizedPayload)
        : null;
      const nodeId = nodePosition ? encodeBlockPosition(nodePosition) : null;
      const connections = normalizedPayload
        ? extractRailConnections(normalizedPayload)
        : [];
      const connectionDiagnostics: RailConnectionDiagnostic[] = [];
      let curvePresentCount = 0;
      let curveMissingCount = 0;
      for (const connection of connections) {
        const connectionPosition = extractBlockPosition(
          connection?.['node_pos'] ??
            connection?.['nodePos'] ??
            (connection?.['node'] as Record<string, unknown> | undefined),
        );
        const targetNodeId = connectionPosition
          ? encodeBlockPosition(connectionPosition)
          : null;
        const metadata =
          connection && typeof connection === 'object'
            ? normalizeRailConnectionMetadata(
                connection as Record<string, unknown>,
                targetNodeId ?? '',
              )
            : null;
        const hasCurve = Boolean(metadata?.primary || metadata?.secondary);
        if (hasCurve) {
          curvePresentCount += 1;
        } else {
          curveMissingCount += 1;
        }
        connectionDiagnostics.push({
          targetNodeId,
          targetPosition: connectionPosition,
          railType: metadata?.railType ?? null,
          transportMode: metadata?.transportMode ?? null,
          modelKey: metadata?.modelKey ?? null,
          isSecondaryDir: metadata?.isSecondaryDir ?? null,
          yStart: metadata?.yStart ?? null,
          yEnd: metadata?.yEnd ?? null,
          verticalCurveRadius: metadata?.verticalCurveRadius ?? null,
          preferredCurve: metadata?.preferredCurve ?? null,
          primary: metadata?.primary ?? null,
          secondary: metadata?.secondary ?? null,
          hasCurve,
        });
      }

      const associatedPlatformIds = new Set<string>();
      const addPlatformsByNode = (targetNodeId: string | null) => {
        if (!targetNodeId) return;
        const platforms = nodePlatformMap.get(targetNodeId);
        if (!platforms) return;
        for (const platformId of platforms) {
          associatedPlatformIds.add(platformId);
        }
      };
      addPlatformsByNode(nodeId);
      for (const connection of connectionDiagnostics) {
        addPlatformsByNode(connection.targetNodeId);
      }

      const associatedRouteIds = new Set<string>();
      for (const platformId of associatedPlatformIds) {
        const routeList = dataset.platformRouteIds.get(platformId) ?? [];
        for (const routeId of routeList) {
          associatedRouteIds.add(routeId);
        }
      }

      const hasNodePosition = Boolean(nodePosition);
      const hasConnections = connections.length > 0;
      const inGraph = Boolean(nodeId && graph?.positions?.has(nodeId));
      const usedInRoutePath = Boolean(nodeId && usedNodeIds.has(nodeId));
      const calculationSuccess = hasNodePosition && hasConnections && inGraph;
      const issues: string[] = [];
      if (!hasNodePosition) issues.push('missing_node_position');
      if (!hasConnections) issues.push('missing_connections');
      if (!inGraph) issues.push('not_in_graph');

      railsDiagnostics.push({
        railId,
        nodeId,
        nodePosition: nodePosition ?? null,
        connectionCount: connections.length,
        connections: connectionDiagnostics,
        hasNodePosition,
        hasConnections,
        inGraph,
        usedInRoutePath,
        curvePresentCount,
        curveMissingCount,
        associatedPlatformIds: Array.from(associatedPlatformIds),
        associatedRouteIds: Array.from(associatedRouteIds),
        calculationSuccess,
        issues,
        payload: normalizedPayload,
      });
    }

    const jobId = randomUUID();
    this.storeRailDiagnostics({
      jobId,
      serverId: input.serverId,
      routeId: normalizedRouteId,
      railwayMod: input.railwayMod,
      dimensionContext,
      createdAt: Date.now(),
      rails: railsDiagnostics,
    });

    const graphNodeCount = graph?.positions?.size ?? 0;
    let graphEdgeCount = 0;
    if (graph?.adjacency) {
      for (const edges of graph.adjacency.values()) {
        graphEdgeCount += edges.size;
      }
      graphEdgeCount = Math.floor(graphEdgeCount / 2);
    }
    const snapped = graph
      ? snapPlatformNodesToRailGraph(platformNodes, graph)
      : { nodes: [], missingNodes: 0, snappedNodes: 0 };
    const snappedPlatformCount = snapped.nodes.length;
    const snappedNodeCount = snapped.nodes.reduce(
      (total, entry) => total + entry.nodes.length,
      0,
    );
    const snappedMissingNodeCount = snapped.missingNodes;
    const pathSegmentCount = Array.isArray(snapshot?.pathEdges)
      ? snapshot?.pathEdges.length
      : 0;
    const usedPathNodeCount = usedNodeIds.size;
    const reasons: string[] = [];
    if (!graph || graphNodeCount === 0) reasons.push('graph_empty');
    if (platformWithNodesCount === 0) reasons.push('platform_nodes_missing');
    if (graph && snappedPlatformCount === 0) {
      reasons.push('platform_nodes_not_snapped');
    }
    if (graph && snappedPlatformCount > 0 && pathSegmentCount === 0) {
      reasons.push('path_not_found');
    }

    let graphComponentCount = 0;
    const componentByNode = new Map<string, number>();
    if (graph?.adjacency) {
      const visited = new Set<string>();
      for (const nodeId of graph.positions.keys()) {
        if (visited.has(nodeId)) continue;
        const queue = [nodeId];
        visited.add(nodeId);
        componentByNode.set(nodeId, graphComponentCount);
        while (queue.length) {
          const current = queue.shift()!;
          const edges = graph.adjacency.get(current);
          if (!edges) continue;
          for (const next of edges) {
            if (visited.has(next)) continue;
            visited.add(next);
            componentByNode.set(next, graphComponentCount);
            queue.push(next);
          }
        }
        graphComponentCount += 1;
      }
    }

    const snappedByPlatform = new Map<string, string[]>();
    for (const entry of snapped.nodes) {
      if (!entry.platformId) continue;
      snappedByPlatform.set(
        entry.platformId,
        entry.nodes.map((node) => node.id),
      );
    }

    const routePlatformComponents: RailwayRouteFallbackDiagnostics['routePlatformComponents'] =
      [];
    let routePlatformMissingNodes = 0;
    const routeComponentSet = new Set<number>();
    for (const platformId of routePlatformIds) {
      const nodeIds = snappedByPlatform.get(platformId) ?? [];
      if (!nodeIds.length) {
        routePlatformMissingNodes += 1;
      }
      const componentIds = Array.from(
        new Set(
          nodeIds
            .map((nodeId) => componentByNode.get(nodeId))
            .filter((value): value is number => typeof value === 'number'),
        ),
      );
      componentIds.forEach((id) => routeComponentSet.add(id));
      routePlatformComponents.push({
        platformId,
        nodeIds,
        componentIds,
      });
    }

    const routePlatformComponentCount = routeComponentSet.size;
    if (routePlatformComponentCount > 1) {
      reasons.push('route_platforms_disconnected');
    }

    const disconnectedSegments: RailwayRouteFallbackDiagnostics['disconnectedSegments'] =
      [];
    if (graph && routePlatformComponentCount > 1) {
      const componentNodeMap = new Map<number, Set<string>>();
      for (const entry of routePlatformComponents) {
        for (const componentId of entry.componentIds) {
          if (!componentNodeMap.has(componentId)) {
            componentNodeMap.set(componentId, new Set());
          }
          const bucket = componentNodeMap.get(componentId)!;
          for (const nodeId of entry.nodeIds) {
            bucket.add(nodeId);
          }
        }
      }
      const componentIds = Array.from(componentNodeMap.keys());
      for (let i = 0; i < componentIds.length; i += 1) {
        for (let j = i + 1; j < componentIds.length; j += 1) {
          const fromComponent = componentIds[i];
          const toComponent = componentIds[j];
          const fromNodes = Array.from(
            componentNodeMap.get(fromComponent) ?? [],
          );
          const toNodes = Array.from(componentNodeMap.get(toComponent) ?? []);
          let best: {
            fromNodeId: string;
            toNodeId: string;
            from: { x: number; y: number; z: number };
            to: { x: number; y: number; z: number };
            distance: number;
          } | null = null;
          for (const fromNodeId of fromNodes) {
            const fromPos = graph.positions.get(fromNodeId);
            if (!fromPos) continue;
            for (const toNodeId of toNodes) {
              const toPos = graph.positions.get(toNodeId);
              if (!toPos) continue;
              const distance = Math.hypot(
                fromPos.x - toPos.x,
                fromPos.y - toPos.y,
                fromPos.z - toPos.z,
              );
              if (!best || distance < best.distance) {
                best = {
                  fromNodeId,
                  toNodeId,
                  from: { x: fromPos.x, y: fromPos.y, z: fromPos.z },
                  to: { x: toPos.x, y: toPos.y, z: toPos.z },
                  distance,
                };
              }
            }
          }
          if (best) {
            disconnectedSegments.push({
              fromComponent,
              toComponent,
              fromNodeId: best.fromNodeId,
              toNodeId: best.toNodeId,
              from: best.from,
              to: best.to,
              distance: Math.round(best.distance * 100) / 100,
            });
          }
        }
      }
    }
    const fallbackDiagnostics: RailwayRouteFallbackDiagnostics = {
      source: report.source ?? null,
      graphPresent: Boolean(graph),
      graphNodeCount,
      graphEdgeCount,
      platformCount,
      platformWithNodesCount,
      platformMissingPosCount,
      platformNodeCount,
      snappedPlatformCount,
      snappedNodeCount,
      snappedMissingNodeCount,
      usedPathNodeCount,
      pathSegmentCount,
      graphComponentCount,
      routePlatformCount: routePlatformIds.length,
      routePlatformMissingNodes,
      routePlatformComponentCount,
      routePlatformComponents,
      disconnectedSegments,
      reasons,
    };

    return {
      jobId,
      status: report.status,
      errorMessage: report.errorMessage,
      routeId: report.routeId,
      serverId: input.serverId,
      railwayType: input.railwayMod,
      dimension: input.dimension ?? null,
      dimensionContext,
      fingerprint,
      source: report.source,
      persisted: report.persisted,
      report: {
        pointCount: report.pointCount,
        pathNodeCount: report.pathNodeCount,
        pathEdgeCount: report.pathEdgeCount,
        stopCount: report.stopCount,
        bounds: report.bounds,
      },
      snapshot: snapshot
        ? {
            status: snapshot.status,
            errorMessage: snapshot.errorMessage ?? null,
            generatedAt: snapshot.generatedAt?.toISOString() ?? null,
            sourceFingerprint: snapshot.sourceFingerprint,
            geometryPathCount,
            geometryPointCount,
            stopCount,
            pathNodeCount,
            pathEdgeCount,
            bounds: snapshot.bounds ?? null,
          }
        : null,
      dataset: {
        routeCount: dataset.routeRecords.length,
        platformCount: dataset.platformRecords.length,
        stationCount: dataset.stationRecords.length,
        railCount: dataset.rails.length,
      },
      curveDiagnostics,
      missingCurveSegments,
      routeDiagnostics: {
        routeId: normalizedRouteId,
        name: routeRecord.name ?? null,
        color: routeRecord.color ?? null,
        transportMode: routeRecord.transport_mode ?? null,
        platformIds: routePlatformIds,
        resolvedPlatformIds,
        missingPlatformIds,
      },
      platformDiagnostics,
      routeIds,
      platformIds,
      railIds,
      fallbackDiagnostics,
    };
  }

  getRailDiagnosticsPage(input: {
    jobId: string;
    page?: number;
    pageSize?: number;
    search?: string | null;
    onlyErrors?: boolean;
  }) {
    const entry = this.getRailDiagnostics(input.jobId);
    if (!entry) {
      throw new NotFoundException('Rail diagnostics cache not found');
    }
    const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 200);
    const page = Math.max(input.page ?? 1, 1);
    const keyword = (input.search ?? '').trim().toLowerCase();
    const baseList = input.onlyErrors
      ? entry.rails.filter((rail) => !rail.calculationSuccess)
      : entry.rails;
    const filtered = keyword
      ? baseList.filter((rail) => {
          if (rail.railId.toLowerCase().includes(keyword)) return true;
          if (rail.nodeId?.toLowerCase().includes(keyword)) return true;
          if (
            rail.associatedPlatformIds.some((id) =>
              id.toLowerCase().includes(keyword),
            )
          ) {
            return true;
          }
          if (
            rail.associatedRouteIds.some((id) =>
              id.toLowerCase().includes(keyword),
            )
          ) {
            return true;
          }
          return false;
        })
      : baseList;
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return {
      jobId: entry.jobId,
      serverId: entry.serverId,
      routeId: entry.routeId,
      railwayType: entry.railwayMod,
      dimensionContext: entry.dimensionContext,
      createdAt: entry.createdAt,
      page,
      pageSize,
      total,
      items,
    };
  }
}
