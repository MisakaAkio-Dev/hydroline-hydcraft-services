import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  TransportationRailwayBindingEntityType,
  TransportationRailwayMod,
} from '@prisma/client';
import {
  buildDimensionContextFromDimension,
  buildFallbackEntity,
  normalizeId,
  normalizeIdList,
  readString,
  toBoolean,
  toNumber,
} from '../../utils/railway-normalizer';
import type {
  RailwayDepotDetailResult,
  RailwayStationDetailResult,
  RailwayStationRecord,
  RouteDetailResult,
} from '../../types/railway-types';
import type { StationRouteMapPayload } from '../../snapshot/compute/station-map';
import { estimateGeometryLengthKm } from './route-detail.constants';
import type { RouteDetailGeometry } from './route-detail.geometry';
import type { RouteDetailMappers } from './route-detail.mappers';
import type { RouteDetailPreview } from './route-detail.preview';
import type { RouteDetailStations } from './route-detail.stations';
import type { RouteDetailStorage } from './route-detail.storage';
import type { RouteDetailVariants } from './route-detail.variants';
import type { AttachmentsService } from '../../../../attachments/attachments.service';

export class RouteDetailDetails {
  constructor(
    private readonly storage: RouteDetailStorage,
    private readonly stations: RouteDetailStations,
    private readonly geometry: RouteDetailGeometry,
    private readonly variants: RouteDetailVariants,
    private readonly preview: RouteDetailPreview,
    private readonly mappers: RouteDetailMappers,
    private readonly prisma?: any,
    private readonly attachmentsService?: AttachmentsService,
  ) {}

  async getRouteDetail(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: { serverId?: string; dimension?: string | null },
  ): Promise<RouteDetailResult> {
    if (!routeId || !query?.serverId) {
      throw new BadRequestException('Route ID and serverId are required');
    }
    const server = await this.storage.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedRouteId = routeId.trim();

    const routeEntity = await this.storage.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeEntity) {
      throw new NotFoundException('Route not found');
    }
    const routeRecord = this.mappers.buildRouteRecordFromEntity(routeEntity);
    if (!routeRecord) {
      throw new NotFoundException('Route data missing');
    }
    const routePayload = this.mappers.toJsonRecord(routeEntity.payload);
    const routePayloadId = routePayload ? readString(routePayload['id']) : null;

    const normalizedRoute = this.mappers.normalizeStoredRoute(
      routeEntity,
      server,
    );
    if (!normalizedRoute) {
      throw new NotFoundException('Unable to parse route data');
    }

    const orderedPlatformIds = normalizeIdList(routeRecord.platform_ids ?? []);

    const selectedPlatforms = await this.storage.fetchPlatformsByIds(
      server,
      orderedPlatformIds,
    );
    const platforms = this.mappers.buildPlatformsMap(selectedPlatforms);

    let dimensionContextForGeometry = this.mappers.resolveRouteDimensionContext(
      normalizedRoute,
      routeEntity.dimensionContext ?? null,
      query.dimension ?? null,
      server.railwayMod,
    );

    if (!dimensionContextForGeometry) {
      dimensionContextForGeometry =
        selectedPlatforms.find((p) => Boolean(p.dimension_context))
          ?.dimension_context ?? null;
    }

    normalizedRoute.previewSvg = await this.preview.buildRoutePreviewSvg({
      server,
      dimensionContext: dimensionContextForGeometry,
      baseKey: this.variants.buildRouteBaseKey(routeRecord),
      primaryRouteId: normalizeId(routeRecord.id) ?? normalizedRouteId,
    });

    normalizedRoute.platformCount = orderedPlatformIds.length;
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
        this.variants.buildGeometryPathEntry(
          normalizedRouteId,
          routeRecord,
          mainGeometry,
          true,
        ),
      ],
    };

    const estimatedLengthKm = estimateGeometryLengthKm(geometry);

    const stationIds = Array.from(
      new Set(
        selectedPlatforms
          .map((p) => normalizeId(p.station_id))
          .filter((id): id is string => !!id),
      ),
    );
    const stationsList = await this.storage.fetchStationsByIds(
      server,
      stationIds,
    );
    const stations = this.mappers.buildStationsMap(stationsList);

    const stationAssociations = selectedPlatforms.length
      ? await this.stations.resolvePlatformStations(
          server,
          dimensionContextForGeometry,
          stations,
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
          stations,
        );
    const normalizedDepots = await this.storage.fetchDepotsForRoute(
      server,
      dimensionContextForGeometry,
      normalizedRouteId,
      routePayloadId,
    );
    const routeGeometryCalculate =
      await this.storage.fetchRouteGeometryCalculateRecord(
        server,
        dimensionContextForGeometry,
        normalizedRouteId,
      );

    const detail: RouteDetailResult = {
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
            platforms,
            stationAssociations.platformStations,
          )
        : fallbackStops.stops,
      routeGeometryCalculate,
    };

    const bindingDimensionContext =
      normalizedRoute.dimensionContext ?? routeEntity.dimensionContext ?? null;
    const bindings = await this.storage.fetchCompanyBindingsForEntity({
      entityType: TransportationRailwayBindingEntityType.ROUTE,
      entityId: normalizedRouteId,
      serverId: server.id,
      railwayMod: server.railwayMod,
      dimensionContext: bindingDimensionContext,
    });
    detail.operatorCompanyIds = bindings.operatorCompanyIds;
    detail.builderCompanyIds = bindings.builderCompanyIds;
    detail.systems = await this.storage.fetchRouteSystems(routeEntity.id);

    // resolve company details
    const operatorCompanyIds = detail.operatorCompanyIds ?? [];
    const builderCompanyIds = detail.builderCompanyIds ?? [];
    const allCompanyIds = [
      ...new Set([...operatorCompanyIds, ...builderCompanyIds]),
    ];

    if (this.prisma && allCompanyIds.length > 0) {
      const companies = await this.prisma.company.findMany({
        where: { id: { in: allCompanyIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          logoAttachmentId: true,
          summary: true,
        },
      });

      // Resolve logo URLs
      const companiesWithLogos = await Promise.all(
        companies.map(async (c: any) => ({
          ...c,
          logoUrl: this.attachmentsService
            ? await this.attachmentsService.resolvePublicUrl(c.logoAttachmentId)
            : null,
        })),
      );

      const companyMap = new Map(companiesWithLogos.map((c) => [c.id, c]));
      (detail as any).operatorCompanies = operatorCompanyIds
        .map((id) => companyMap.get(id))
        .filter((c) => c !== undefined);
      (detail as any).builderCompanies = builderCompanyIds
        .map((id) => companyMap.get(id))
        .filter((c) => c !== undefined);
    } else {
      (detail as any).operatorCompanies = [];
      (detail as any).builderCompanies = [];
    }

    return detail;
  }

  async getStationDetail(
    stationId: string,
    railwayMod: TransportationRailwayMod,
    query: { serverId?: string; dimension?: string | null },
  ): Promise<RailwayStationDetailResult> {
    if (!stationId || !query?.serverId) {
      throw new BadRequestException('Station ID and serverId are required');
    }
    const server = await this.storage.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedStationId = stationId.trim();
    const stationRow = await this.storage.fetchStoredEntityRow(
      server,
      'STATION',
      normalizedStationId,
      query.dimension ?? null,
    );
    if (!stationRow) {
      throw new NotFoundException('Station not found');
    }
    const stationPayload = this.mappers.toJsonRecord(stationRow.payload);
    if (!stationPayload) {
      throw new NotFoundException('Station data missing');
    }
    const stationRecord = this.mappers.buildStationRecordFromEntity(
      stationRow.entityId,
      stationPayload,
    );
    if (!stationRecord) {
      throw new NotFoundException('Station data missing');
    }
    const normalizedStation = this.mappers.normalizeStationRecord(
      stationRecord,
      server,
    );
    const dimensionContext =
      stationRow.dimensionContext ??
      normalizedStation.dimensionContext ??
      buildDimensionContextFromDimension(
        normalizedStation.dimension,
        server.railwayMod,
      ) ??
      null;
    const platformRecords =
      await this.stations.fetchPlatformsForStationByBounds(
        server,
        dimensionContext,
        normalizedStationId,
        stationRecord,
      );
    const normalizedPlatforms = platformRecords.map((platform) =>
      this.mappers.normalizePlatformRecord(platform, server),
    );
    const platformDetails = normalizedPlatforms;
    const platformIdSet = new Set<string>();
    const routeIdSet = new Set<string>();
    for (const platform of platformDetails) {
      const platformId = normalizeId(platform.id);
      if (platformId) {
        platformIdSet.add(platformId);
      }
      for (const routeId of platform.routeIds ?? []) {
        if (routeId) {
          routeIdSet.add(routeId);
        }
      }
    }
    let routes = await this.storage.fetchNormalizedRoutesByIds(
      server,
      Array.from(routeIdSet),
      dimensionContext,
    );
    if ((!routes.length || routeIdSet.size === 0) && platformIdSet.size) {
      const fallback = await this.storage.fetchNormalizedRoutesByPlatformIds(
        server,
        Array.from(platformIdSet),
        dimensionContext,
      );
      if (!routes.length) {
        routes = fallback.routes;
      }
      if (fallback.platformRouteIds.size) {
        for (const platform of platformDetails) {
          if (platform.routeIds?.length) continue;
          const platformId = normalizeId(platform.id);
          if (!platformId) continue;
          platform.routeIds = fallback.platformRouteIds.get(platformId) ?? [];
        }
      }
    }
    let mergedRoutes = this.variants.mergeRoutesForDisplay(routes);

    const relatedPlatformIds = new Set<string>();
    for (const route of routes) {
      const payload = route.payload || {};
      const pIds = payload['platform_ids'] || payload['platformIds'];
      if (Array.isArray(pIds)) {
        for (const pid of pIds) {
          const normalized = normalizeId(pid);
          if (normalized) relatedPlatformIds.add(normalized);
        }
      }
    }

    const relatedPlatforms = await this.storage.fetchPlatformsByIds(
      server,
      Array.from(relatedPlatformIds),
    );

    const allStations = await this.stations.fetchStationsWithBoundsCached(
      server,
      null,
    );
    const relatedStationsMap = new Map<string, RailwayStationRecord>();

    for (const platform of relatedPlatforms) {
      const sid = normalizeId(platform.station_id);
      if (sid) {
        const match = allStations.find((s) => s.id === sid);
        if (match) {
          relatedStationsMap.set(match.id as string, match);
          continue;
        }
      }

      const match = allStations.find((s) =>
        this.stations.platformInsideStationBounds(platform, s),
      );
      if (match) {
        relatedStationsMap.set(match.id as string, match);
      }
    }

    let normalizedRelatedStations = Array.from(relatedStationsMap.values()).map(
      (s) => this.mappers.normalizeStationRecord(s, server),
    );

    if (!routes.length || !normalizedRelatedStations.length) {
      const snapshot = await this.storage.fetchStationMapSnapshot(
        server,
        normalizedStationId,
        dimensionContext,
      );
      if (snapshot?.payload) {
        const payload = snapshot.payload as StationRouteMapPayload;
        const snapshotDimensionContext =
          snapshot.dimensionContext ??
          (payload.dimension
            ? buildDimensionContextFromDimension(
                payload.dimension,
                server.railwayMod,
              )
            : null);
        const snapshotRouteIds = new Set<string>();
        const snapshotStationIds = new Set<string>();
        for (const group of payload.groups ?? []) {
          for (const routeId of group.routeIds ?? []) {
            const normalized = normalizeId(routeId);
            if (normalized) snapshotRouteIds.add(normalized);
          }
          for (const stop of group.stops ?? []) {
            const normalized = normalizeId(stop.stationId);
            if (normalized) snapshotStationIds.add(normalized);
          }
        }

        if (!routes.length && snapshotRouteIds.size) {
          const context = snapshotDimensionContext ?? dimensionContext;
          routes = await this.storage.fetchNormalizedRoutesByIds(
            server,
            Array.from(snapshotRouteIds),
            context,
          );
          if (!routes.length && context) {
            routes = await this.storage.fetchNormalizedRoutesByIds(
              server,
              Array.from(snapshotRouteIds),
              null,
            );
          }
          mergedRoutes = this.variants.mergeRoutesForDisplay(routes);
        }

        if (!normalizedRelatedStations.length && snapshotStationIds.size) {
          const stationRecords = await this.storage.fetchStationsByIds(
            server,
            Array.from(snapshotStationIds),
          );
          normalizedRelatedStations = stationRecords.map((station) =>
            this.mappers.normalizeStationRecord(station, server),
          );
        }
      }
    }

    const bindings = await this.storage.fetchCompanyBindingsForEntity({
      entityType: TransportationRailwayBindingEntityType.STATION,
      entityId: normalizedStationId,
      serverId: server.id,
      railwayMod: server.railwayMod,
      dimensionContext,
    });

    return {
      server: {
        id: server.id,
        name: server.displayName,
        dynmapTileUrl: server.dynmapTileUrl ?? null,
      },
      railwayType: server.railwayMod,
      station: normalizedStation,
      platforms: platformDetails,
      routes,
      mergedRoutes,
      stations: normalizedRelatedStations,
      operatorCompanyIds: bindings.operatorCompanyIds,
      builderCompanyIds: bindings.builderCompanyIds,
      metadata: {
        lastUpdated:
          stationRow.lastBeaconUpdatedAt?.getTime() ??
          stationRow.updatedAt.getTime(),
      },
    };
  }

  async getDepotDetail(
    depotId: string,
    railwayMod: TransportationRailwayMod,
    query: { serverId?: string; dimension?: string | null },
  ): Promise<RailwayDepotDetailResult> {
    if (!depotId || !query?.serverId) {
      throw new BadRequestException('Depot ID and serverId are required');
    }
    const server = await this.storage.getBeaconServerById(query.serverId);
    if (server.railwayMod !== railwayMod) {
      throw new BadRequestException(
        'Specified railway type does not match server configuration',
      );
    }
    const normalizedDepotId = depotId.trim();
    const depotRow = await this.storage.fetchStoredEntityRow(
      server,
      'DEPOT',
      normalizedDepotId,
      query.dimension ?? null,
    );
    if (!depotRow) {
      throw new NotFoundException('Depot not found');
    }
    const depotPayload = this.mappers.toJsonRecord(depotRow.payload);
    const normalizedDepot =
      this.mappers.normalizeStoredEntity(depotRow, server) ??
      buildFallbackEntity(normalizedDepotId, server);
    const dimensionContext =
      depotRow.dimensionContext ??
      normalizedDepot.dimensionContext ??
      buildDimensionContextFromDimension(
        normalizedDepot.dimension,
        server.railwayMod,
      ) ??
      null;
    const routeIds = depotPayload
      ? this.mappers.extractRouteIds(depotPayload)
      : [];
    const routes = await this.storage.fetchNormalizedRoutesByIds(
      server,
      routeIds,
      dimensionContext,
    );
    const bounds = this.mappers.extractBounds(depotPayload ?? null);
    const rawFrequencies = depotPayload?.['frequencies'];
    const frequencies = Array.isArray(rawFrequencies)
      ? rawFrequencies
          .map((value) => toNumber(value))
          .filter((value): value is number => value != null)
      : null;
    const depotDetail = {
      ...normalizedDepot,
      bounds,
      routeIds,
      useRealTime: toBoolean(depotPayload?.['use_real_time']),
      repeatInfinitely: toBoolean(depotPayload?.['repeat_infinitely']),
      cruisingAltitude: toNumber(depotPayload?.['cruising_altitude']),
      frequencies,
    };
    const bindings = await this.storage.fetchCompanyBindingsForEntity({
      entityType: TransportationRailwayBindingEntityType.DEPOT,
      entityId: normalizedDepotId,
      serverId: server.id,
      railwayMod: server.railwayMod,
      dimensionContext,
    });

    return {
      server: {
        id: server.id,
        name: server.displayName,
        dynmapTileUrl: server.dynmapTileUrl ?? null,
      },
      railwayType: server.railwayMod,
      depot: depotDetail,
      routes,
      operatorCompanyIds: bindings.operatorCompanyIds,
      builderCompanyIds: bindings.builderCompanyIds,
      metadata: {
        lastUpdated:
          depotRow.lastBeaconUpdatedAt?.getTime() ??
          depotRow.updatedAt.getTime(),
      },
    };
  }
}
