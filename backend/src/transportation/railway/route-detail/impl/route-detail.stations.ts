import type { BeaconServerRecord } from '../../utils/railway-common';
import { normalizeId } from '../../utils/railway-normalizer';
import type {
  RailwayPlatformRecord,
  RailwayStationRecord,
} from '../../types/railway-types';
import type { RouteDetailStorage } from './route-detail.storage';
import { NEAREST_STATION_MAX_DISTANCE_BLOCKS } from './route-detail.constants';
import type { RouteDetailGeometryUtils } from './route-detail.geometry-utils';

export class RouteDetailStations {
  private readonly stationBoundsCache = new Map<
    string,
    { expiresAt: number; stations: RailwayStationRecord[] }
  >();
  private readonly stationBoundsCacheInflight = new Map<
    string,
    Promise<RailwayStationRecord[]>
  >();
  private readonly stationBoundsCacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly storage: RouteDetailStorage,
    private readonly geometryUtils: RouteDetailGeometryUtils,
  ) {}

  buildStationBoundsCacheKey(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ) {
    return `${server.id}:${server.railwayMod}:${dimensionContext ?? ''}`;
  }

  async fetchStationsWithBoundsCached(
    server: BeaconServerRecord,
    dimensionContext: string | null,
  ): Promise<RailwayStationRecord[]> {
    const cacheKey = this.buildStationBoundsCacheKey(server, dimensionContext);
    const now = Date.now();
    const cached = this.stationBoundsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.stations;
    }

    const inflight = this.stationBoundsCacheInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = (async () => {
      const storedStations = await this.storage.fetchStationsFromStorage(
        server,
        dimensionContext,
      );
      let stations = storedStations.filter((station) =>
        this.stationHasBounds(station),
      );

      if (dimensionContext && !stations.length) {
        const storedStationsAll = await this.storage.fetchStationsFromStorage(
          server,
          null,
        );
        stations = storedStationsAll.filter((station) =>
          this.stationHasBounds(station),
        );
      }
      this.stationBoundsCache.set(cacheKey, {
        expiresAt: now + this.stationBoundsCacheTtlMs,
        stations,
      });
      return stations;
    })().finally(() => {
      this.stationBoundsCacheInflight.delete(cacheKey);
    });

    this.stationBoundsCacheInflight.set(cacheKey, promise);
    return promise;
  }

  async fetchPlatformsForStationByBounds(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    stationId: string,
    station: RailwayStationRecord,
  ) {
    const normalizedStationId = normalizeId(stationId);
    if (!normalizedStationId) {
      return [] as RailwayPlatformRecord[];
    }
    const platforms = await this.storage.fetchPlatformsFromStorage(
      server,
      dimensionContext,
    );
    const hasBounds = this.stationHasBounds(station);
    return platforms.filter((platform) => {
      const associated = normalizeId(platform.station_id);
      if (associated === normalizedStationId) {
        return true;
      }
      if (!hasBounds) {
        return false;
      }
      return this.platformInsideStationBounds(platform, station);
    });
  }

  platformInsideStationBounds(
    platform: RailwayPlatformRecord,
    station: RailwayStationRecord,
  ) {
    const points: Array<{ x: number; z: number }> = [];
    const pos1 = this.geometryUtils.extractBlockPosition(platform.pos_1);
    if (pos1) points.push({ x: pos1.x, z: pos1.z });
    const pos2 = this.geometryUtils.extractBlockPosition(platform.pos_2);
    if (pos2) points.push({ x: pos2.x, z: pos2.z });
    const center = this.geometryUtils.computePlatformCenter(platform);
    if (center) points.push(center);
    return points.some((point) => this.isPointInsideStation(point, station));
  }

  async resolvePlatformStations(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    stationMap: Map<string | null, RailwayStationRecord>,
    platforms: RailwayPlatformRecord[],
  ): Promise<{
    platformStations: Map<string, RailwayStationRecord | null>;
    stations: RailwayStationRecord[];
  }> {
    const resolvedMap = new Map(stationMap);

    const needsBoundsMatching = platforms.some(
      (platform) => !normalizeId(platform.station_id),
    );
    const cachedStations = needsBoundsMatching
      ? await this.fetchStationsWithBoundsCached(server, dimensionContext)
      : [];
    const cachedStationMap = new Map(
      cachedStations
        .map((station) => {
          const key = normalizeId(station.id);
          return key ? ([key, station] as const) : null;
        })
        .filter((entry): entry is readonly [string, RailwayStationRecord] =>
          Boolean(entry),
        ),
    );

    const stationList = (
      cachedStations.length
        ? [...Array.from(resolvedMap.values()), ...cachedStations]
        : Array.from(resolvedMap.values())
    ).filter((station) => this.stationHasBounds(station));

    const platformStations = new Map<string, RailwayStationRecord | null>();
    for (const platform of platforms) {
      const platformId = normalizeId(platform.id);
      if (!platformId) continue;
      const directId = normalizeId(platform.station_id);
      const directStation =
        directId != null
          ? (resolvedMap.get(directId) ??
            cachedStationMap.get(directId) ??
            null)
          : null;
      const station =
        directStation ?? this.matchStationByBounds(platform, stationList);
      if (station) {
        const key = normalizeId(station.id);
        if (key) {
          resolvedMap.set(key, station);
        }
      }
      platformStations.set(platformId, station ?? null);
    }
    const uniqueStations = Array.from(
      new Map(
        Array.from(platformStations.values())
          .filter((station): station is RailwayStationRecord =>
            Boolean(station),
          )
          .map((station) => [normalizeId(station.id), station]),
      ).values(),
    );
    return { platformStations, stations: uniqueStations };
  }

  stationHasBounds(station: RailwayStationRecord | null | undefined) {
    if (!station) return false;
    return (
      station.x_min != null &&
      station.x_max != null &&
      station.z_min != null &&
      station.z_max != null
    );
  }

  matchStationByBounds(
    platform: RailwayPlatformRecord,
    stations: RailwayStationRecord[],
  ) {
    const points: Array<{ x: number; z: number }> = [];
    const pos1 = this.geometryUtils.extractBlockPosition(platform.pos_1);
    if (pos1) points.push({ x: pos1.x, z: pos1.z });
    const pos2 = this.geometryUtils.extractBlockPosition(platform.pos_2);
    if (pos2) points.push({ x: pos2.x, z: pos2.z });
    const center = this.geometryUtils.computePlatformCenter(platform);
    if (center) points.push(center);

    const reference = center ?? (pos1 ? { x: pos1.x, z: pos1.z } : null);
    let nearest: { station: RailwayStationRecord; distSq: number } | null =
      null;

    for (const station of stations) {
      if (!this.stationHasBounds(station)) {
        continue;
      }
      if (points.some((point) => this.isPointInsideStation(point, station))) {
        return station;
      }

      if (reference) {
        const stationCenter = this.geometryUtils.computeStationCenter(station);
        if (stationCenter) {
          const dx = stationCenter.x - reference.x;
          const dz = stationCenter.z - reference.z;
          const distSq = dx * dx + dz * dz;
          if (!nearest || distSq < nearest.distSq) {
            nearest = { station, distSq };
          }
        }
      }
    }

    if (
      nearest &&
      nearest.distSq <=
        NEAREST_STATION_MAX_DISTANCE_BLOCKS *
          NEAREST_STATION_MAX_DISTANCE_BLOCKS
    ) {
      return nearest.station;
    }
    return null;
  }

  matchStationByPoint(
    point: { x: number; z: number },
    stations: RailwayStationRecord[],
  ) {
    let nearest: { station: RailwayStationRecord; distSq: number } | null =
      null;
    for (const station of stations) {
      if (!this.stationHasBounds(station)) continue;
      if (this.isPointInsideStation(point, station)) {
        return station;
      }
      const center = this.geometryUtils.computeStationCenter(station);
      if (!center) continue;
      const dx = center.x - point.x;
      const dz = center.z - point.z;
      const distSq = dx * dx + dz * dz;
      if (!nearest || distSq < nearest.distSq) {
        nearest = { station, distSq };
      }
    }
    if (
      nearest &&
      nearest.distSq <=
        NEAREST_STATION_MAX_DISTANCE_BLOCKS *
          NEAREST_STATION_MAX_DISTANCE_BLOCKS
    ) {
      return nearest.station;
    }
    return null;
  }

  isPointInsideStation(
    point: { x: number; z: number },
    station: RailwayStationRecord,
  ) {
    if (!this.stationHasBounds(station)) {
      return false;
    }
    const minX = Math.min(station.x_min!, station.x_max!);
    const maxX = Math.max(station.x_min!, station.x_max!);
    const minZ = Math.min(station.z_min!, station.z_max!);
    const maxZ = Math.max(station.z_min!, station.z_max!);
    return (
      point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ
    );
  }
}
