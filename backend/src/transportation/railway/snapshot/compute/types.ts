import type { Prisma } from '@prisma/client';
import type { TransportationRailwayMod } from '@prisma/client';
import type { BlockPosition } from '../../../utils/block-pos.util';
import type {
  RailGeometrySegment,
  RailGraph,
} from '../../types/railway-graph.types';
import type {
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayStationRecord,
} from '../../types/railway-types';

export type ScopeKey = {
  serverId: string;
  railwayMod: TransportationRailwayMod;
  dimensionContext: string;
};

export type RouteRow = {
  entityId: string;
  payload: Prisma.JsonValue;
  name: string | null;
  color: number | null;
};

export type ScopeDataset = {
  routeRecords: RailwayRouteRecord[];
  routeRowsById: Map<string, RouteRow>;
  platformRecords: RailwayPlatformRecord[];
  platformMap: Map<string | null, RailwayPlatformRecord>;
  platformRouteIds: Map<string, string[]>;
  stationRecords: RailwayStationRecord[];
  rails: Array<{ entityId: string; payload: Prisma.JsonValue }>;
};

export type RouteGeometrySnapshotValue = {
  paths: Array<Array<{ x: number; z: number }>>;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null;
  stops: Array<{
    stationId: string | null;
    x: number;
    z: number;
    label: string;
  }>;
  pathNodes3d: BlockPosition[] | null;
  pathEdges: RailGeometrySegment[] | null;
};

export type RouteGeometryComputeInput = {
  scope: ScopeKey;
  graph: RailGraph | null;
  dataset: ScopeDataset;
  fingerprint: string;
};

export type StationMapComputeInput = {
  scope: ScopeKey;
  dataset: ScopeDataset;
  routeGeometryById: Map<string, RouteGeometrySnapshotValue>;
  fingerprint: string;
};
