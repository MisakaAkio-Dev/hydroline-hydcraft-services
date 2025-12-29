import type { Prisma } from '@prisma/client';
import type {
  RailConnectionMetadata,
  RailCurveParameters,
  RailGeometrySegment,
  RailGraph,
  RailGraphNode,
  PreferredRailCurve,
} from '../../types/railway-graph.types';
import type { BlockPosition } from '../../../utils/block-pos.util';
import {
  decodeBlockPosition,
  encodeBlockPosition,
} from '../../../utils/block-pos.util';
import {
  normalizeId,
  normalizePayloadRecord,
  readString,
  toBoolean,
  toNumber,
} from '../../utils/railway-normalizer';

type PlatformNode = {
  platformId: string | null;
  nodes: RailGraphNode[];
};

export function extractBlockPosition(value: unknown): BlockPosition | null {
  if (!value) return null;
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'x' in (value as Record<string, unknown>) &&
    'y' in (value as Record<string, unknown>) &&
    'z' in (value as Record<string, unknown>)
  ) {
    const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const z = Number(candidate.z);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
    }
  }
  return decodeBlockPosition(value);
}

function isSameBlockPos(a: BlockPosition | null, b: BlockPosition | null) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function extractRailNodePosition(record: Record<string, unknown>) {
  const candidates = [
    record['node_pos'],
    record['nodePos'],
    (record['node'] as Record<string, unknown> | undefined)?.['node_pos'],
    (record['node'] as Record<string, unknown> | undefined)?.['nodePos'],
    record['node'],
  ];
  for (const candidate of candidates) {
    const position = extractBlockPosition(candidate);
    if (position) {
      return position;
    }
  }
  return null;
}

function normalizeConnectionEntries(value: unknown) {
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

export function extractRailConnections(record: Record<string, unknown>) {
  const candidates = [
    record['rail_connections'],
    record['railConnections'],
    record['connections'],
    record['connection_map'],
    record['connectionMap'],
  ];
  for (const candidate of candidates) {
    const normalized = normalizeConnectionEntries(candidate);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
}

function isReverseCurve(curve: RailCurveParameters | null): boolean {
  return Boolean(curve?.reverse);
}

function pickPreferredRailCurve(
  primary: RailCurveParameters | null,
  secondary: RailCurveParameters | null,
): PreferredRailCurve {
  const primaryExists = Boolean(primary);
  const secondaryExists = Boolean(secondary);
  const primaryForward = primaryExists && !isReverseCurve(primary);
  const secondaryForward = secondaryExists && !isReverseCurve(secondary);
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

export function normalizeRailConnectionMetadata(
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
  const preferredCurve = pickPreferredRailCurve(primary, secondary);

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

function reverseConnectionMetadata(
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

function appendRailNode(graph: RailGraph, id: string, position: BlockPosition) {
  if (!graph.positions.has(id)) {
    graph.positions.set(id, position);
  }
  if (!graph.adjacency.has(id)) {
    graph.adjacency.set(id, new Set());
  }
}

function appendRailEdge(
  graph: RailGraph,
  fromId: string,
  fromPosition: BlockPosition,
  toId: string,
  toPosition: BlockPosition,
  metadata: RailConnectionMetadata | null,
) {
  appendRailNode(graph, fromId, fromPosition);
  appendRailNode(graph, toId, toPosition);
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
    const reversed = reverseConnectionMetadata(metadata, fromId);
    if (reversed) {
      graph.connections.get(toId)!.set(fromId, reversed);
    }
  }
}

export function buildRailGraph(
  rows: Array<{ entityId: string; payload: Prisma.JsonValue }>,
): RailGraph | null {
  const graph: RailGraph = {
    positions: new Map(),
    adjacency: new Map(),
    connections: new Map(),
  };
  for (const row of rows) {
    const payload = row.payload as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      continue;
    }
    const normalizedPayload = normalizePayloadRecord(
      payload as Record<string, unknown>,
    );
    const nodePosition = extractRailNodePosition(normalizedPayload);
    const nodeId = nodePosition ? encodeBlockPosition(nodePosition) : null;
    if (!nodeId || !nodePosition) {
      continue;
    }
    appendRailNode(graph, nodeId, nodePosition);
    const connections = extractRailConnections(normalizedPayload);
    for (const connection of connections) {
      const connectionPosition = extractBlockPosition(
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
      appendRailEdge(
        graph,
        nodeId,
        nodePosition,
        connectionId,
        connectionPosition,
        normalizeRailConnectionMetadata(connection, connectionId),
      );
    }
  }
  return graph.positions.size ? graph : null;
}

export function extractPlatformNodes(
  platforms: Array<{
    id?: unknown;
    pos_1?: unknown;
    pos_2?: unknown;
  }>,
) {
  return platforms
    .map((platform) => {
      const nodes: RailGraphNode[] = [];
      const pos1 = extractBlockPosition(platform.pos_1);
      if (pos1) {
        const id = encodeBlockPosition(pos1);
        if (id) {
          nodes.push({ id, position: pos1 });
        }
      }
      const pos2 = extractBlockPosition(platform.pos_2);
      if (pos2) {
        const id = encodeBlockPosition(pos2);
        if (id) {
          const duplicate = nodes.find((node) =>
            isSameBlockPos(node.position, pos2),
          );
          if (!duplicate) {
            nodes.push({ id, position: pos2 });
          }
        }
      }
      return {
        platformId: normalizeId(platform.id),
        nodes,
      } satisfies PlatformNode;
    })
    .filter((item) => item.nodes.length > 0);
}

export function snapPlatformNodesToRailGraph(
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
          snappedNodes += 1;
          used.add(best.id);
          snappedPlatformNodes.push({
            id: best.id,
            position: pos,
          });
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

  return {
    nodes: result,
    missingNodes,
    snappedNodes,
  };
}

function buildSegmentKey(start: BlockPosition, end: BlockPosition) {
  return `${start.x},${start.y},${start.z}->${end.x},${end.y},${end.z}`;
}

export function includePlatformSegments(
  segments: RailGeometrySegment[] | undefined,
  platforms: Array<{
    pos_1?: unknown;
    pos_2?: unknown;
    transport_mode?: string | null;
  }>,
) {
  const registry = new Map<string, RailGeometrySegment>();
  for (const segment of segments ?? []) {
    if (!segment?.start || !segment?.end) continue;
    registry.set(buildSegmentKey(segment.start, segment.end), segment);
  }
  for (const platform of platforms) {
    const pos1 = extractBlockPosition(platform.pos_1);
    const pos2 = extractBlockPosition(platform.pos_2);
    if (!pos1 || !pos2) continue;
    const key = buildSegmentKey(pos1, pos2);
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
