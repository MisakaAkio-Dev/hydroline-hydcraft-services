import { TransportationRailwayRoute } from '@prisma/client';
import {
  extractRouteBaseKey,
  extractRouteDisplayName,
  extractRouteVariantLabel,
} from '../../utils/route-name';
import {
  normalizeId,
  normalizeIdList,
  readString,
} from '../../utils/railway-normalizer';
import type {
  NormalizedRoute,
  RailwayPlatformRecord,
  RailwayRouteRecord,
  RailwayStationRecord,
  RouteDetailResult,
} from '../../types/railway-types';
import type { BeaconServerRecord } from '../../utils/railway-common';
import { estimateGeometryLengthKm } from './route-detail.constants';
import type { RouteDetailGeometry } from './route-detail.geometry';
import type { RouteDetailMappers } from './route-detail.mappers';
import type { RouteDetailStations } from './route-detail.stations';
import type { RouteDetailStorage } from './route-detail.storage';

export class RouteDetailVariants {
  constructor(
    private readonly storage: RouteDetailStorage,
    private readonly geometry: RouteDetailGeometry,
    private readonly stations: RouteDetailStations,
    private readonly mappers: RouteDetailMappers,
  ) {}

  mergeRoutesForDisplay(routes: NormalizedRoute[]) {
    if (!routes.length) return [];
    const grouped = new Map<string, NormalizedRoute[]>();
    for (const route of routes) {
      const baseKey = extractRouteBaseKey(route.name) ?? route.id;
      const key = [
        route.server.id,
        route.railwayType,
        route.dimensionContext ?? '',
        baseKey,
      ].join('::');
      const list = grouped.get(key) ?? [];
      list.push(route);
      grouped.set(key, list);
    }
    const merged: NormalizedRoute[] = [];
    for (const list of grouped.values()) {
      if (list.length <= 1) {
        merged.push(list[0]);
        continue;
      }
      const primary = this.selectPrimaryRoute(list) ?? list[0];
      const displayName =
        extractRouteDisplayName(primary.name) ??
        extractRouteDisplayName(list[0]?.name) ??
        primary.name;
      const lastUpdated = list.reduce((max, route) => {
        return Math.max(max ?? 0, route.lastUpdated ?? 0);
      }, primary.lastUpdated ?? 0);
      merged.push({
        ...primary,
        name: displayName ?? primary.name ?? null,
        lastUpdated: lastUpdated || null,
      });
    }
    merged.sort(
      (a, b) =>
        (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0) ||
        a.name?.localeCompare(b.name ?? '') ||
        0,
    );
    return merged;
  }

  selectPrimaryRoute(routes: NormalizedRoute[]) {
    if (routes.length <= 1) return routes[0] ?? null;
    const candidates = routes.filter(
      (route) => !extractRouteVariantLabel(route.name),
    );
    const list = candidates.length ? candidates : routes;
    return [...list].sort(
      (a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0),
    )[0];
  }

  buildRouteBaseKey(route: RailwayRouteRecord | null) {
    if (!route) return null;
    const normalizeValue = (value?: string | null) => {
      if (!value) return null;
      const normalized = value
        .split('||')[0]
        .split('|')[0]
        .trim()
        .toLowerCase();
      return normalized || null;
    };
    return normalizeValue(route.name ?? null);
  }

  buildRouteBaseName(route: RailwayRouteRecord | null) {
    if (!route) return null;
    const raw = readString(route.name) ?? null;
    if (!raw) return null;
    const base = raw.split('||')[0]?.split('|')[0]?.trim();
    return base || null;
  }

  buildRouteVariantLabel(route: RailwayRouteRecord | null) {
    if (!route) return null;
    const raw = readString(route.name) ?? null;
    if (!raw) return null;

    const doubleParts = raw.split('||');
    if (doubleParts.length >= 2) {
      const candidate = doubleParts[1]?.split('|')[0]?.trim();
      return candidate || null;
    }

    const singleParts = doubleParts[0]?.split('|') ?? [];
    if (singleParts.length >= 2) {
      const candidate = singleParts[1]?.trim();
      return candidate || null;
    }

    return null;
  }

  buildRouteDirectionKey(route: RailwayRouteRecord | null) {
    if (!route) return null;
    const normalizeValue = (value?: string | null) => {
      if (!value) return null;
      const normalized = value
        .split('||')[0]
        .split('|')[0]
        .trim()
        .toLowerCase();
      return normalized || null;
    };
    return (
      normalizeValue(route.light_rail_route_number) ??
      normalizeValue(route.name ?? null)
    );
  }

  buildRouteLabel(route: RailwayRouteRecord | null) {
    if (!route) return null;
    return (
      readString(route.light_rail_route_number) ??
      readString(route.name) ??
      null
    );
  }

  findRelatedRoutes(
    currentRoute: RailwayRouteRecord,
    allRoutes: RailwayRouteRecord[],
    excludeRouteId: string,
  ) {
    const referenceKey = this.buildRouteDirectionKey(currentRoute);
    if (!referenceKey) return [];
    return allRoutes.filter((route) => {
      const routeId = normalizeId(route.id);
      if (!routeId || routeId === excludeRouteId) {
        return false;
      }
      const candidateKey = this.buildRouteDirectionKey(route);
      return Boolean(candidateKey && candidateKey === referenceKey);
    });
  }

  resolvePlatformsForRoute(
    route: RailwayRouteRecord,
    platformMap: Map<string | null, RailwayPlatformRecord>,
  ) {
    const platformIds = normalizeIdList(route.platform_ids ?? []);
    return platformIds
      .map((platformId) => platformMap.get(platformId) ?? null)
      .filter((platform): platform is RailwayPlatformRecord =>
        Boolean(platform),
      );
  }

  buildGeometryPathEntry(
    routeId: string,
    route: RailwayRouteRecord | null,
    geometry: RouteDetailResult['geometry'],
    isPrimary: boolean,
  ) {
    return {
      id: routeId,
      label: this.buildRouteLabel(route),
      isPrimary,
      source: geometry.source,
      points: geometry.points,
      segments: geometry.segments,
    };
  }

  async buildRouteGeometryPaths(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    normalizedRouteId: string,
    mainRoute: RailwayRouteRecord,
    allRoutes: RailwayRouteRecord[],
    platformMap: Map<string | null, RailwayPlatformRecord>,
    mainGeometry: RouteDetailResult['geometry'],
  ) {
    const paths: RouteDetailResult['geometry']['paths'] = [];
    paths.push(
      this.buildGeometryPathEntry(
        normalizedRouteId,
        mainRoute,
        mainGeometry,
        true,
      ),
    );
    const mainPlatformIds = normalizeIdList(mainRoute.platform_ids ?? []);
    const mainPlatformIdSet = new Set(mainPlatformIds);
    const mainStationIdSet = new Set(
      mainPlatformIds
        .map((platformId) => {
          const platform = platformMap.get(platformId) ?? null;
          return platform ? normalizeId(platform.station_id) : null;
        })
        .filter((stationId): stationId is string => Boolean(stationId)),
    );
    const candidates = this.findRelatedRoutes(
      mainRoute,
      allRoutes,
      normalizedRouteId,
    ).filter((route) => {
      const candidateIds = normalizeIdList(route.platform_ids ?? []);
      if (!candidateIds.length) {
        return false;
      }

      if (mainPlatformIdSet.size) {
        const candidateSet = new Set(candidateIds);
        if (candidateSet.size === mainPlatformIdSet.size) {
          let equal = true;
          for (const platformId of candidateSet) {
            if (!mainPlatformIdSet.has(platformId)) {
              equal = false;
              break;
            }
          }
          if (equal) {
            return true;
          }
        }
      }

      if (!mainStationIdSet.size) {
        return false;
      }
      const candidateStationIds = candidateIds
        .map((platformId) => {
          const platform = platformMap.get(platformId) ?? null;
          return platform ? normalizeId(platform.station_id) : null;
        })
        .filter((stationId): stationId is string => Boolean(stationId));
      if (!candidateStationIds.length) {
        return false;
      }
      const candidateStationIdSet = new Set(candidateStationIds);
      if (candidateStationIdSet.size < 2 || mainStationIdSet.size < 2) {
        return false;
      }
      if (candidateStationIdSet.size !== mainStationIdSet.size) {
        return false;
      }
      for (const stationId of candidateStationIdSet) {
        if (!mainStationIdSet.has(stationId)) {
          return false;
        }
      }
      return true;
    });
    let altIndex = 0;
    for (const candidate of candidates) {
      const candidatePlatforms = this.resolvePlatformsForRoute(
        candidate,
        platformMap,
      );
      if (!candidatePlatforms.length) {
        continue;
      }
      const candidateId =
        normalizeId(candidate.id) ?? `${normalizedRouteId}-alt-${altIndex}`;
      const geometry = await this.geometry.buildRouteGeometryPreferSnapshot(
        server,
        dimensionContext,
        candidateId,
        candidatePlatforms,
        [],
      );
      const pointCount = geometry.points?.length ?? 0;
      if (pointCount < 2) {
        continue;
      }
      altIndex += 1;
      paths.push(
        this.buildGeometryPathEntry(candidateId, candidate, geometry, false),
      );
    }
    return paths;
  }

  async buildRouteDetailFromStoredRow(
    server: BeaconServerRecord,
    routeEntity: TransportationRailwayRoute,
    normalizedRouteId: string,
    dimensionContextForGeometry: string | null,
    platformMap: Map<string | null, RailwayPlatformRecord>,
    stationsMap: Map<string | null, RailwayStationRecord>,
  ): Promise<RouteDetailResult | null> {
    const routeRecord = this.mappers.buildRouteRecordFromEntity(routeEntity);
    if (!routeRecord) return null;
    const normalizedRoute = this.mappers.normalizeStoredRoute(
      routeEntity,
      server,
    );
    if (!normalizedRoute) return null;
    const routePayload = this.mappers.toJsonRecord(routeEntity.payload);
    const routePayloadId = routePayload ? readString(routePayload['id']) : null;

    const orderedPlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);
    const selectedPlatforms = orderedPlatformIds
      .map((platformId) => platformMap.get(platformId) ?? null)
      .filter((item): item is RailwayPlatformRecord => Boolean(item));

    const mainGeometry = await this.geometry.buildRouteGeometryPreferSnapshot(
      server,
      dimensionContextForGeometry,
      normalizeId(routeRecord.id) ?? normalizedRouteId,
      selectedPlatforms,
      [],
    );

    const geometry: RouteDetailResult['geometry'] = {
      ...mainGeometry,
      paths: [
        this.buildGeometryPathEntry(
          normalizedRouteId,
          routeRecord,
          mainGeometry,
          true,
        ),
      ],
    };

    const estimatedLengthKm = estimateGeometryLengthKm(geometry);
    const stationAssociations = selectedPlatforms.length
      ? await this.stations.resolvePlatformStations(
          server,
          dimensionContextForGeometry,
          stationsMap,
          selectedPlatforms,
        )
      : { platformStations: new Map(), stations: [] as RailwayStationRecord[] };
    const normalizedPlatforms = selectedPlatforms.length
      ? selectedPlatforms.map((platform) =>
          this.mappers.normalizePlatformRecord(platform, server),
        )
      : [];
    const normalizedStations = selectedPlatforms.length
      ? stationAssociations.stations.map((station) =>
          this.mappers.normalizeStationRecord(station, server),
        )
      : [];
    const fallbackStops = selectedPlatforms.length
      ? { stops: [], stations: [] }
      : await this.geometry.buildStopsFromSnapshot(
          server,
          dimensionContextForGeometry,
          normalizedRouteId,
          stationsMap,
        );
    const normalizedDepots = await this.storage.fetchDepotsForRoute(
      server,
      dimensionContextForGeometry,
      normalizedRouteId,
      routePayloadId,
    );

    normalizedRoute.platformCount =
      orderedPlatformIds.length || fallbackStops.stops.length;
    if (!normalizedRoute.dimension) {
      normalizedRoute.dimension = this.mappers.extractDimensionFromContext(
        normalizedRoute.dimensionContext ??
          routeEntity.dimensionContext ??
          dimensionContextForGeometry,
      );
    }
    if (!normalizedRoute.dimensionContext) {
      normalizedRoute.dimensionContext =
        routeEntity.dimensionContext ?? dimensionContextForGeometry;
    }

    const routeGeometryCalculate =
      await this.storage.fetchRouteGeometryCalculateRecord(
        server,
        dimensionContextForGeometry,
        normalizedRouteId,
      );

    return {
      server: {
        id: server.id,
        name: server.displayName,
        dynmapTileUrl: server.dynmapTileUrl ?? null,
      },
      railwayType: server.railwayMod,
      dimension:
        normalizedRoute.dimension ??
        this.mappers.extractDimensionFromContext(dimensionContextForGeometry),
      route: normalizedRoute,
      metadata: {
        lastUpdated:
          normalizedRoute.lastUpdated ??
          routeEntity.lastBeaconUpdatedAt?.getTime() ??
          routeEntity.updatedAt.getTime(),
        snapshotLength: null,
        lengthKm: estimatedLengthKm,
      },
      stations: selectedPlatforms.length
        ? normalizedStations
        : fallbackStops.stations,
      platforms: normalizedPlatforms,
      depots: normalizedDepots,
      operatorCompanyIds: [],
      builderCompanyIds: [],
      geometry,
      stops: selectedPlatforms.length
        ? this.geometry.buildStopSequence(
            orderedPlatformIds,
            platformMap,
            stationAssociations.platformStations,
          )
        : fallbackStops.stops,
      routeGeometryCalculate,
    };
  }
}
