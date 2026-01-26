import {
  Prisma,
  TransportationRailwayMod,
  TransportationRailwayPlatform,
  TransportationRailwayRoute,
} from '@prisma/client';
import {
  buildFallbackEntity,
  normalizeEntity,
  normalizeId,
  normalizeIdList,
  normalizeRouteRow,
  readString,
  resolveEntityId,
  toNumber,
} from '../../utils/railway-normalizer';
import { buildDimensionContextFromDimension } from '../../utils/railway-normalizer';
import { decodeBlockPosition } from '../../../utils/block-pos.util';
import type {
  NormalizedRoute,
  QueryMtrEntityRow,
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayStationRecord,
} from '../../types/railway-types';
import type { BeaconServerRecord } from '../../utils/railway-common';
import type { StoredRailwayEntity } from './route-detail.types';

export class RouteDetailMappers {
  buildQueryRowFromEntity(row: StoredRailwayEntity): QueryMtrEntityRow {
    return {
      entity_id: row.entityId,
      transport_mode: row.transportMode,
      name: row.name,
      color: row.color,
      file_path: row.filePath,
      last_updated:
        row.lastBeaconUpdatedAt?.getTime() ?? row.updatedAt.getTime(),
      payload: row.payload,
    };
  }

  normalizeStoredRoute(
    row: TransportationRailwayRoute,
    server: BeaconServerRecord,
  ): NormalizedRoute | null {
    const queryRow = this.buildQueryRowFromEntity(row);
    return normalizeRouteRow(queryRow, server);
  }

  normalizeStoredEntity(row: StoredRailwayEntity, server: BeaconServerRecord) {
    const queryRow = this.buildQueryRowFromEntity(row);
    return (
      normalizeEntity(queryRow, server) ??
      buildFallbackEntity(
        row.entityId,
        server,
        row.name,
        toNumber(row.color),
        row.transportMode ?? null,
        this.toJsonRecord(row.payload),
      )
    );
  }

  buildRouteRecordFromEntity(
    row: TransportationRailwayRoute,
  ): RailwayRouteRecord | null {
    const payload = this.toJsonRecord(row.payload);
    if (!payload) {
      return null;
    }
    const recordId = resolveEntityId(row.entityId, payload['id']);
    return {
      id: recordId ?? row.entityId,
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? row.color ?? null,
      transport_mode:
        readString(payload['transport_mode']) ?? row.transportMode ?? null,
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

  buildPlatformRecordFromEntity(
    row: TransportationRailwayPlatform,
    payload: Record<string, unknown>,
  ): RailwayPlatformRecord | null {
    const recordId = resolveEntityId(row.entityId, payload['id']);
    return {
      id: recordId ?? row.entityId,
      dimension_context:
        readString(payload['dimension_context']) ??
        readString(payload['dimensionContext']) ??
        row.dimensionContext ??
        null,
      name: readString(payload['name']) ?? row.name ?? null,
      color: toNumber(payload['color']) ?? row.color ?? null,
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

  buildStationRecordFromEntity(
    entityId: string,
    payload: Record<string, unknown>,
  ): RailwayStationRecord | null {
    const xMin = toNumber(payload['x_min']);
    const xMax = toNumber(payload['x_max']);
    const zMin = toNumber(payload['z_min']);
    const zMax = toNumber(payload['z_max']);
    const recordId = resolveEntityId(entityId, payload['id']);
    return {
      id: recordId ?? entityId,
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

  resolveRouteDimensionContext(
    normalizedRoute: NormalizedRoute,
    entityDimensionContext: string | null,
    requestedDimension: string | null,
    mod: TransportationRailwayMod,
  ) {
    return (
      normalizedRoute.dimensionContext ??
      entityDimensionContext ??
      (normalizedRoute.dimension
        ? buildDimensionContextFromDimension(normalizedRoute.dimension, mod)
        : null) ??
      (requestedDimension
        ? buildDimensionContextFromDimension(requestedDimension, mod)
        : null)
    );
  }

  extractDimensionFromContext(
    context: string | null | undefined,
  ): string | null {
    if (!context) {
      return null;
    }
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

  toJsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  buildStationsMap(records: RailwayStationRecord[]) {
    return new Map(records.map((record) => [normalizeId(record.id), record]));
  }

  buildPlatformsMap(records: RailwayPlatformRecord[]) {
    return new Map(records.map((record) => [normalizeId(record.id), record]));
  }

  normalizeStationRecord(
    record: RailwayStationRecord,
    server: BeaconServerRecord,
  ) {
    const entity =
      normalizeEntity(
        {
          entity_id: normalizeId(record.id) ?? undefined,
          name: record.name,
          color: record.color,
          transport_mode: record.transport_mode,
          payload: record as Record<string, unknown>,
        },
        server,
      ) ??
      buildFallbackEntity(
        normalizeId(record.id),
        server,
        record.name,
        toNumber(record.color),
        record.transport_mode ?? null,
        record as Record<string, unknown>,
      );
    return {
      ...entity,
      bounds: {
        xMin: record.x_min ?? null,
        xMax: record.x_max ?? null,
        zMin: record.z_min ?? null,
        zMax: record.z_max ?? null,
      },
      zone: record.zone ?? null,
    };
  }

  normalizePlatformRecord(
    record: RailwayPlatformRecord,
    server: BeaconServerRecord,
  ) {
    const entity =
      normalizeEntity(
        {
          entity_id: normalizeId(record.id) ?? undefined,
          name: record.name,
          color: record.color,
          transport_mode: record.transport_mode,
          payload: record as Record<string, unknown>,
        },
        server,
      ) ??
      buildFallbackEntity(
        normalizeId(record.id),
        server,
        record.name,
        toNumber(record.color),
        record.transport_mode ?? null,
        record as Record<string, unknown>,
      );
    return {
      ...entity,
      stationId: normalizeId(record.station_id),
      dwellTime: record.dwell_time ?? null,
      pos1: decodeBlockPosition(record.pos_1),
      pos2: decodeBlockPosition(record.pos_2),
      routeIds: normalizeIdList(record.route_ids ?? []),
    };
  }

  extractBounds(payload: Record<string, unknown> | null) {
    if (!payload) {
      return { xMin: null, xMax: null, zMin: null, zMax: null };
    }
    return {
      xMin: toNumber(payload['x_min']),
      xMax: toNumber(payload['x_max']),
      zMin: toNumber(payload['z_min']),
      zMax: toNumber(payload['z_max']),
    };
  }

  extractRouteIds(payload: Record<string, unknown>) {
    const raw = payload['route_ids'] ?? payload['routeIds'];
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return normalizeIdList(raw);
    }
    const single = normalizeId(raw);
    return single ? [single] : [];
  }

  extractStationIds(payload: Record<string, unknown> | null) {
    if (!payload) {
      return [];
    }
    const raw = payload['station_ids'] ?? payload['stationIds'];
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return normalizeIdList(raw);
    }
    const single = normalizeId(raw);
    return single ? [single] : [];
  }
}
