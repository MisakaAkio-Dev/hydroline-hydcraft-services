import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { encodeBlockPosition } from '../../../utils/block-pos.util';
import { MtrRouteFinder } from '../../../../lib/mtr/mtr-route-finder';
import {
  normalizeId,
  normalizePayloadRecord,
  readString,
  toBoolean,
  toNumber,
} from '../../utils/railway-normalizer';
import type { BeaconServerRecord } from '../../utils/railway-common';
import type {
  PlatformNode,
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
  PreferredRailCurve,
} from '../../types/railway-graph.types';
import type {
  RailwayPlatformRecord,
  RailwayStationRecord,
  RouteDetailResult,
} from '../../types/railway-types';
import { resolveMinPathNodeCount } from './route-detail.constants';
import type { RouteDetailStorage } from './route-detail.storage';
import type { RouteDetailStations } from './route-detail.stations';
import type { RouteDetailMappers } from './route-detail.mappers';
import type { RouteDetailGeometryUtils } from './route-detail.geometry-utils';

export class RouteDetailGeometry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly storage: RouteDetailStorage,
    private readonly stations: RouteDetailStations,
    private readonly mappers: RouteDetailMappers,
    private readonly geometryUtils: RouteDetailGeometryUtils,
  ) {}

  async buildRouteGeometry(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    if (dimensionContext) {
      try {
        const geometry = await this.buildGeometryFromRails(
          server,
          dimensionContext,
          platforms,
        );
        if (geometry) {
          return geometry;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to build rail geometry for ${server.displayName} (${dimensionContext}): ${message}`,
        );
      }
    }
    return this.buildFallbackGeometry(platforms, stations);
  }

  async buildRouteGeometryPreferSnapshot(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    const normalizedRouteId = routeId?.trim();
    if (dimensionContext && normalizedRouteId) {
      const snapshot =
        await this.prisma.transportationRailwayRouteGeometrySnapshot.findUnique(
          {
            where: {
              serverId_railwayMod_dimensionContext_routeEntityId: {
                serverId: server.id,
                railwayMod: server.railwayMod,
                dimensionContext,
                routeEntityId: normalizedRouteId,
              },
            },
            select: {
              status: true,
              geometry2d: true,
              pathNodes3d: true,
              pathEdges: true,
            },
          },
        );
      if (snapshot?.status === 'READY') {
        const nodes = Array.isArray(snapshot.pathNodes3d)
          ? (snapshot.pathNodes3d as Array<{
              x?: unknown;
              y?: unknown;
              z?: unknown;
            }>)
          : [];
        const minNodeCount = resolveMinPathNodeCount(platforms.length);
        if (nodes.length >= minNodeCount) {
          const points = nodes
            .map((node) => ({
              x: Number(node.x),
              z: Number(node.z),
            }))
            .filter(
              (point): point is { x: number; z: number } =>
                Number.isFinite(point.x) && Number.isFinite(point.z),
            );
          const segments = Array.isArray(snapshot.pathEdges)
            ? (snapshot.pathEdges as RouteDetailResult['geometry']['segments'])
            : undefined;
          return {
            source: 'rails' as const,
            points,
            ...(segments?.length ? { segments } : {}),
          };
        }

        const rawPaths = (snapshot.geometry2d as Record<string, unknown>)?.[
          'paths'
        ];
        if (Array.isArray(rawPaths) && rawPaths.length) {
          const first = rawPaths[0];
          if (Array.isArray(first)) {
            const points = first
              .map((entry) => ({
                x: Number(entry?.x),
                z: Number(entry?.z),
              }))
              .filter(
                (point): point is { x: number; z: number } =>
                  Number.isFinite(point.x) && Number.isFinite(point.z),
              );
            if (points.length >= 2) {
              return {
                source: 'rails' as const,
                points,
              };
            }
          }
        }

        return this.buildFallbackGeometry(platforms, stations);
      }
    }
    return await this.buildRouteGeometry(
      server,
      dimensionContext,
      platforms,
      stations,
    );
  }

  async buildGeometryFromRails(
    server: BeaconServerRecord,
    dimensionContext: string,
    platforms: RailwayPlatformRecord[],
  ) {
    const rawPlatformNodes = this.extractPlatformNodes(platforms);
    if (!rawPlatformNodes.length) {
      return null;
    }
    const railRows = await this.prisma.transportationRailwayRail.findMany({
      where: {
        serverId: server.id,
        railwayMod: server.railwayMod,
        dimensionContext,
      },
      select: {
        entityId: true,
        payload: true,
      },
    });
    if (!railRows.length) {
      return null;
    }
    const graph = this.buildRailGraph(railRows);
    if (!graph?.positions.size) {
      return null;
    }
    const snapped = this.snapPlatformNodesToRailGraph(rawPlatformNodes, graph);
    const platformNodes = snapped.nodes;
    if (!platformNodes.length) {
      return null;
    }
    const finder = new MtrRouteFinder(graph);
    const pathResult = finder.findRoute(platformNodes);
    const path = pathResult?.points ?? null;
    if (!path?.length) {
      const failure = finder.getLastFailure();
      this.logger.warn(
        `Rail path not found for ${server.displayName} (${dimensionContext}). ` +
          `platforms=${platforms.length}, platformNodes=${rawPlatformNodes.length}, ` +
          `missingNodes=${snapped.missingNodes}, snappedNodes=${snapped.snappedNodes}, ` +
          `reason=${failure?.reason ?? 'unknown'}, segment=${failure?.segmentIndex ?? -1}, visits=${failure?.visits ?? 0}`,
      );
      return null;
    }
    const segments = this.includePlatformSegments(
      pathResult?.segments,
      platforms,
    );
    return {
      source: 'rails' as const,
      points: path.map((position) => ({ x: position.x, z: position.z })),
      segments: segments.length ? segments : undefined,
    };
  }

  snapPlatformNodesToRailGraph(
    platformNodes: PlatformNode[],
    graph: RailGraph,
  ) {
    const indexByXZ = new Map<string, Array<{ id: string; y: number }>>();
    for (const [id, pos] of graph.positions.entries()) {
      const key = `${pos.x},${pos.z}`;
      let list = indexByXZ.get(key);
      if (!list) {
        list = [];
        indexByXZ.set(key, list);
      }
      list.push({ id, y: pos.y });
    }

    const maxRadius = 8;
    let missingNodes = 0;
    let snappedNodes = 0;
    const result: PlatformNode[] = [];

    for (const platform of platformNodes) {
      const snappedPlatformNodes: RailGraphNode[] = [];
      const used = new Set<string>();
      for (const node of platform.nodes) {
        if (graph.positions.has(node.id)) {
          if (!used.has(node.id)) {
            used.add(node.id);
            snappedPlatformNodes.push(node);
          }
          continue;
        }
        missingNodes += 1;

        const x = node.position.x;
        const z = node.position.z;
        const targetY = node.position.y;

        const pickBest = (
          candidates: Array<{ id: string; y: number }> | undefined,
        ) => {
          if (!candidates?.length) return null;
          let best = candidates[0];
          let bestDy = Math.abs(candidates[0].y - targetY);
          for (let i = 1; i < candidates.length; i += 1) {
            const dy = Math.abs(candidates[i].y - targetY);
            if (dy < bestDy) {
              best = candidates[i];
              bestDy = dy;
            }
          }
          return best;
        };

        let best = pickBest(indexByXZ.get(`${x},${z}`));
        if (!best) {
          for (let r = 1; r <= maxRadius && !best; r += 1) {
            for (let dx = -r; dx <= r && !best; dx += 1) {
              for (let dz = -r; dz <= r && !best; dz += 1) {
                if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                best = pickBest(indexByXZ.get(`${x + dx},${z + dz}`));
              }
            }
          }
        }

        if (best && !used.has(best.id)) {
          const pos = graph.positions.get(best.id);
          if (pos) {
            used.add(best.id);
            snappedPlatformNodes.push({ id: best.id, position: pos });
            snappedNodes += 1;
          }
        }
      }

      if (snappedPlatformNodes.length) {
        result.push({
          platformId: platform.platformId,
          nodes: snappedPlatformNodes,
        });
      }
    }

    return { nodes: result, missingNodes, snappedNodes };
  }

  buildFallbackGeometry(
    platforms: RailwayPlatformRecord[],
    stations: RailwayStationRecord[],
  ) {
    const stationMap = new Map(
      stations.map((station) => [normalizeId(station.id), station]),
    );
    const points: Array<{ x: number; z: number }> = [];
    let source: 'platform-centers' | 'station-bounds' = 'platform-centers';

    for (const platform of platforms) {
      const center = this.geometryUtils.computePlatformCenter(platform);
      if (center) {
        points.push(center);
        continue;
      }
      const stationId = normalizeId(platform.station_id);
      const station = stationMap.get(stationId);
      if (station) {
        const stationCenter = this.geometryUtils.computeStationCenter(station);
        if (stationCenter) {
          points.push(stationCenter);
          source = 'station-bounds';
        }
      }
    }

    if (!points.length) {
      for (const station of stations) {
        const center = this.geometryUtils.computeStationCenter(station);
        if (center) {
          points.push(center);
        }
      }
      source = 'station-bounds';
    }

    return { source, points };
  }

  extractPlatformNodes(platforms: RailwayPlatformRecord[]): PlatformNode[] {
    return platforms
      .map((platform) => {
        const nodes: RailGraphNode[] = [];
        const pos1 = this.geometryUtils.extractBlockPosition(platform.pos_1);
        if (pos1) {
          const id = encodeBlockPosition(pos1);
          if (id) {
            nodes.push({ id, position: pos1 });
          }
        }
        const pos2 = this.geometryUtils.extractBlockPosition(platform.pos_2);
        if (pos2) {
          const id = encodeBlockPosition(pos2);
          if (id) {
            const duplicate = nodes.find((node) =>
              this.geometryUtils.isSameBlockPos(node.position, pos2),
            );
            if (!duplicate) {
              nodes.push({ id, position: pos2 });
            }
          }
        }
        return {
          platformId: normalizeId(platform.id),
          nodes,
        };
      })
      .filter((item) => item.nodes.length > 0);
  }

  buildRailGraph(
    rows: Array<{ entityId: string; payload: Prisma.JsonValue }>,
  ): RailGraph | null {
    const graph: RailGraph = {
      positions: new Map(),
      adjacency: new Map(),
      connections: new Map(),
    };
    for (const row of rows) {
      const payload = this.mappers.toJsonRecord(row.payload);
      if (!payload) {
        continue;
      }
      const normalizedPayload = normalizePayloadRecord(payload);
      const nodePosition = this.extractRailNodePosition(
        normalizedPayload ?? payload,
      );
      const nodeId = nodePosition ? encodeBlockPosition(nodePosition) : null;
      if (!nodeId || !nodePosition) {
        continue;
      }
      this.appendRailNode(graph, nodeId, nodePosition);
      const connections = this.extractRailConnections(
        normalizedPayload ?? payload,
      );
      for (const connection of connections) {
        const connectionPosition = this.geometryUtils.extractBlockPosition(
          connection?.['node_pos'] ??
            connection?.['nodePos'] ??
            (connection?.['node'] as Record<string, unknown> | undefined),
        );
        if (!connectionPosition) {
          continue;
        }
        const connectionId = encodeBlockPosition(connectionPosition);
        if (!connectionId) {
          continue;
        }
        this.appendRailEdge(
          graph,
          nodeId,
          nodePosition,
          connectionId,
          connectionPosition,
          this.normalizeRailConnectionMetadata(connection, connectionId),
        );
      }
    }
    return graph.positions.size ? graph : null;
  }

  appendRailNode(
    graph: RailGraph,
    id: string,
    position: { x: number; y: number; z: number },
  ) {
    if (!graph.positions.has(id)) {
      graph.positions.set(id, position);
    }
    if (!graph.adjacency.has(id)) {
      graph.adjacency.set(id, new Set());
    }
  }

  appendRailEdge(
    graph: RailGraph,
    fromId: string,
    fromPosition: { x: number; y: number; z: number },
    toId: string,
    toPosition: { x: number; y: number; z: number },
    metadata: RailConnectionMetadata | null,
  ) {
    this.appendRailNode(graph, fromId, fromPosition);
    this.appendRailNode(graph, toId, toPosition);
    graph.adjacency.get(fromId)!.add(toId);
    graph.adjacency.get(toId)!.add(fromId);
    if (metadata) {
      if (!graph.connections.has(fromId)) {
        graph.connections.set(fromId, new Map());
      }
      if (!graph.connections.has(toId)) {
        graph.connections.set(toId, new Map());
      }
      graph.connections.get(fromId)!.set(toId, metadata);
      const reversed = this.reverseConnectionMetadata(metadata, fromId);
      if (reversed) {
        graph.connections.get(toId)!.set(fromId, reversed);
      }
    }
  }

  extractRailNodePosition(record: Record<string, unknown>) {
    const candidates = [
      record['node_pos'],
      record['nodePos'],
      (record['node'] as Record<string, unknown> | undefined)?.['node_pos'],
      (record['node'] as Record<string, unknown> | undefined)?.['nodePos'],
      record['node'],
    ];
    for (const candidate of candidates) {
      const position = this.geometryUtils.extractBlockPosition(candidate);
      if (position) {
        return position;
      }
    }
    return null;
  }

  extractRailConnections(record: Record<string, unknown>) {
    const candidates = [
      record['rail_connections'],
      record['railConnections'],
      record['connections'],
      record['connection_map'],
      record['connectionMap'],
    ];
    for (const candidate of candidates) {
      const normalized = this.normalizeConnectionEntries(candidate);
      if (normalized.length) {
        return normalized;
      }
    }
    return [];
  }

  normalizeConnectionEntries(value: unknown) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      );
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === 'object'),
      );
    }
    return [];
  }

  normalizeRailConnectionMetadata(
    value: Record<string, unknown>,
    targetNodeId: string,
  ): RailConnectionMetadata | null {
    const buildCurve = (suffix: '_1' | '_2'): RailCurveParameters | null => {
      const h = toNumber(value[`h${suffix}`]);
      const k = toNumber(value[`k${suffix}`]);
      const r = toNumber(value[`r${suffix}`]);
      const tStart = toNumber(value[`t_start${suffix}`]);
      const tEnd = toNumber(value[`t_end${suffix}`]);
      const reverse = toBoolean(value[`reverse_t${suffix}`]);
      const isStraight = toBoolean(value[`is_straight${suffix}`]);
      const hasValue = [h, k, r, tStart, tEnd].some((item) => item != null);
      if (!hasValue && reverse == null && isStraight == null) {
        return null;
      }
      return {
        h,
        k,
        r,
        tStart,
        tEnd,
        reverse,
        isStraight,
      };
    };

    const primary = buildCurve('_1');
    const secondary = buildCurve('_2');
    const preferredCurve = this.pickPreferredRailCurve(primary, secondary);

    return {
      targetNodeId,
      railType: readString(value['rail_type']) ?? null,
      transportMode: readString(value['transport_mode']) ?? null,
      modelKey: readString(value['model_key']) ?? null,
      isSecondaryDir: toBoolean(value['is_secondary_dir']),
      yStart: toNumber(value['y_start']),
      yEnd: toNumber(value['y_end']),
      verticalCurveRadius: toNumber(value['vertical_curve_radius']),
      primary,
      secondary,
      preferredCurve,
    };
  }

  reverseConnectionMetadata(
    metadata: RailConnectionMetadata | null,
    targetNodeId: string,
  ): RailConnectionMetadata | null {
    if (!metadata) {
      return null;
    }
    const reverseCurve = (curve: RailCurveParameters | null) => {
      if (!curve) return null;
      const reversedFlag = !(curve.reverse ?? false);
      return {
        ...curve,
        reverse: reversedFlag,
      };
    };
    return {
      targetNodeId,
      railType: metadata.railType,
      transportMode: metadata.transportMode,
      modelKey: metadata.modelKey,
      isSecondaryDir: metadata.isSecondaryDir,
      yStart: metadata.yEnd,
      yEnd: metadata.yStart,
      verticalCurveRadius: metadata.verticalCurveRadius,
      primary: reverseCurve(metadata.primary),
      secondary: reverseCurve(metadata.secondary),
      preferredCurve: metadata.preferredCurve,
    };
  }

  includePlatformSegments(
    segments: RailGeometrySegment[] | undefined,
    platforms: RailwayPlatformRecord[],
  ) {
    const registry = new Map<string, RailGeometrySegment>();
    for (const segment of segments ?? []) {
      if (!segment?.start || !segment?.end) continue;
      registry.set(this.buildSegmentKey(segment.start, segment.end), segment);
    }
    for (const platform of platforms) {
      const pos1 = this.geometryUtils.extractBlockPosition(platform.pos_1);
      const pos2 = this.geometryUtils.extractBlockPosition(platform.pos_2);
      if (!pos1 || !pos2) continue;
      const key = this.buildSegmentKey(pos1, pos2);
      if (registry.has(key)) {
        continue;
      }
      const targetNodeId =
        encodeBlockPosition(pos2) ??
        encodeBlockPosition(pos1) ??
        `${pos2.x},${pos2.y},${pos2.z}`;
      registry.set(key, {
        start: pos1,
        end: pos2,
        connection: {
          targetNodeId,
          railType: 'PLATFORM',
          transportMode: platform.transport_mode ?? null,
          modelKey: null,
          isSecondaryDir: false,
          yStart: pos1.y,
          yEnd: pos2.y,
          verticalCurveRadius: 0,
          primary: {
            h: 0,
            k: 0,
            r: 0,
            tStart: 0,
            tEnd: 0,
            reverse: false,
            isStraight: true,
          },
          secondary: null,
          preferredCurve: 'primary',
        },
      });
    }
    return Array.from(registry.values());
  }

  buildSegmentKey(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
  ) {
    return `${start.x},${start.y},${start.z}->${end.x},${end.y},${end.z}`;
  }

  buildStopSequence(
    orderedPlatformIds: string[],
    platformMap: Map<string | null, RailwayPlatformRecord>,
    platformStations: Map<string, RailwayStationRecord | null>,
  ): RouteDetailResult['stops'] {
    return orderedPlatformIds
      .map((platformId, index) => {
        const platform = platformMap.get(platformId);
        if (!platform) return null;
        const station = platformStations.get(platformId) ?? null;
        const platformCenter =
          this.geometryUtils.computePlatformCenter(platform);
        const stationCenter = station
          ? this.geometryUtils.computeStationCenter(station)
          : null;
        const bounds = station
          ? {
              xMin: station.x_min ?? null,
              xMax: station.x_max ?? null,
              zMin: station.z_min ?? null,
              zMax: station.z_max ?? null,
            }
          : null;
        const stationId = normalizeId(station?.id);
        return {
          order: index,
          platformId,
          platformName: readString(platform.name) ?? platform.name ?? null,
          stationId: stationId ?? null,
          stationName: station?.name ?? null,
          dwellTime: toNumber(platform.dwell_time),
          position: platformCenter ?? stationCenter,
          bounds,
        };
      })
      .filter((stop): stop is RouteDetailResult['stops'][number] =>
        Boolean(stop),
      );
  }

  async buildStopsFromSnapshot(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    routeId: string,
    stationsMap: Map<string | null, RailwayStationRecord>,
  ): Promise<{
    stops: RouteDetailResult['stops'];
    stations: RouteDetailResult['stations'];
  }> {
    if (!dimensionContext) {
      return { stops: [], stations: [] };
    }
    const snapshot = await this.storage.fetchRouteGeometrySnapshotStops(
      server,
      dimensionContext,
      routeId,
    );
    if (!snapshot.length) {
      return { stops: [], stations: [] };
    }
    const stationList = Array.from(stationsMap.values()).filter(
      (station): station is RailwayStationRecord => Boolean(station),
    );
    const stationById = new Map(
      stationList
        .map((station) => {
          const key = normalizeId(station.id);
          return key ? ([key, station] as const) : null;
        })
        .filter((entry): entry is readonly [string, RailwayStationRecord] =>
          Boolean(entry),
        ),
    );
    const stops: RouteDetailResult['stops'] = [];
    const stationRegistry = new Map<string, RailwayStationRecord>();
    snapshot.forEach((stop, index) => {
      const x = Number(stop.x);
      const z = Number(stop.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const directId = normalizeId(stop.stationId);
      let station =
        directId != null ? (stationById.get(directId) ?? null) : null;
      if (!station) {
        station = this.stations.matchStationByPoint({ x, z }, stationList);
      }
      const stationId = normalizeId(station?.id) ?? directId ?? null;
      if (station && stationId) {
        stationRegistry.set(stationId, station);
      }
      stops.push({
        order: index,
        platformId: directId ?? `${routeId}:stop:${index}`,
        platformName: stop.label ?? null,
        stationId,
        stationName: station?.name ?? null,
        dwellTime: null,
        position: { x, z },
        bounds: station
          ? {
              xMin: station.x_min ?? null,
              xMax: station.x_max ?? null,
              zMin: station.z_min ?? null,
              zMax: station.z_max ?? null,
            }
          : null,
      });
    });
    const stations = Array.from(stationRegistry.values()).map((station) =>
      this.mappers.normalizeStationRecord(station, server),
    );
    return { stops, stations };
  }

  pickPreferredRailCurve(
    primary: RailCurveParameters | null,
    secondary: RailCurveParameters | null,
  ): PreferredRailCurve {
    const primaryExists = Boolean(primary);
    const secondaryExists = Boolean(secondary);
    const primaryForward = primaryExists && !this.isReverseCurve(primary);
    const secondaryForward = secondaryExists && !this.isReverseCurve(secondary);
    if (primaryForward && !secondaryForward) {
      return 'primary';
    }
    if (secondaryForward && !primaryForward) {
      return 'secondary';
    }
    if (primaryForward) {
      return 'primary';
    }
    if (secondaryForward) {
      return 'secondary';
    }
    if (primaryExists) {
      return 'primary';
    }
    if (secondaryExists) {
      return 'secondary';
    }
    return null;
  }

  isReverseCurve(curve: RailCurveParameters | null): boolean {
    return Boolean(curve?.reverse);
  }
}
