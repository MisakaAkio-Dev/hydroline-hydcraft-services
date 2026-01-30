import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentsService } from '../../../../attachments/attachments.service';
import {
  RailwayRouteDetailQueryDto,
  RailwayRouteLogQueryDto,
} from '../../../dto/railway.dto';
import {
  buildDimensionContextFromDimension,
  normalizeId,
} from '../../utils/railway-normalizer';
import { TransportationRailwayManualMergeEntityType } from '@prisma/client';
import type {
  RailwayDepotDetailResult,
  RailwayRouteLogResult,
  RailwayStationDetailResult,
  RouteDetailResult,
} from '../../types/railway-types';
import { RouteDetailDetails } from './route-detail.details';
import { RouteDetailGeometry } from './route-detail.geometry';
import { RouteDetailGeometryUtils } from './route-detail.geometry-utils';
import { RouteDetailLogs } from './route-detail.logs';
import { RouteDetailMappers } from './route-detail.mappers';
import { RouteDetailPreview } from './route-detail.preview';
import { RouteDetailStations } from './route-detail.stations';
import { RouteDetailStorage } from './route-detail.storage';
import {
  RailwayRouteVariantsResult,
  RailwayRouteVariantItem,
} from './route-detail.types';
import { RouteDetailVariants } from './route-detail.variants';

@Injectable()
export class TransportationRailwayRouteDetailService {
  private readonly logger = new Logger(
    TransportationRailwayRouteDetailService.name,
  );

  private readonly mappers = new RouteDetailMappers();
  private readonly geometryUtils = new RouteDetailGeometryUtils();
  private readonly storage: RouteDetailStorage;
  private readonly stations: RouteDetailStations;
  private readonly geometry: RouteDetailGeometry;
  private readonly variants: RouteDetailVariants;
  private readonly preview: RouteDetailPreview;
  private readonly logs: RouteDetailLogs;
  private readonly details: RouteDetailDetails;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
  ) {
    this.storage = new RouteDetailStorage(
      prisma,
      attachmentsService,
      this.mappers,
    );
    this.stations = new RouteDetailStations(this.storage, this.geometryUtils);
    this.geometry = new RouteDetailGeometry(
      prisma,
      this.logger,
      this.storage,
      this.stations,
      this.mappers,
      this.geometryUtils,
    );
    this.variants = new RouteDetailVariants(
      this.storage,
      this.geometry,
      this.stations,
      this.mappers,
    );
    this.preview = new RouteDetailPreview(
      prisma,
      this.storage,
      this.mappers,
      this.variants,
    );
    this.logs = new RouteDetailLogs(prisma);
    this.details = new RouteDetailDetails(
      this.storage,
      this.stations,
      this.geometry,
      this.variants,
      this.preview,
      this.mappers,
      prisma,
      attachmentsService,
    );
  }

  async getRouteDetail(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RouteDetailResult> {
    return this.details.getRouteDetail(routeId, railwayMod, query);
  }

  async getRouteVariants(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayRouteVariantsResult> {
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
    const normalizedRoute = this.mappers.normalizeStoredRoute(
      routeEntity,
      server,
    );
    if (!normalizedRoute) {
      throw new NotFoundException('Unable to parse route data');
    }

    const dimensionContextForGeometry =
      this.mappers.resolveRouteDimensionContext(
        normalizedRoute,
        routeEntity.dimensionContext ?? null,
        query.dimension ?? null,
        server.railwayMod,
      );

    const excludedRouteIdSet = new Set<string>();
    if (dimensionContextForGeometry) {
      const [manualMergeMembers, systemRouteRows] = await Promise.all([
        this.prisma.transportationRailwayManualMergeMember.findMany({
          where: {
            entityType: TransportationRailwayManualMergeEntityType.ROUTE,
            serverId: server.id,
            railwayMod,
            dimensionContext: dimensionContextForGeometry,
          },
          select: { entityId: true },
        }),
        this.prisma.transportationRailwaySystemRoute.findMany({
          where: {
            route: {
              serverId: server.id,
              railwayMod,
              dimensionContext: dimensionContextForGeometry,
            },
          },
          select: { route: { select: { entityId: true } } },
        }),
      ]);
      for (const row of manualMergeMembers) {
        if (row.entityId) excludedRouteIdSet.add(row.entityId);
      }
      for (const row of systemRouteRows) {
        const entityId = row.route?.entityId ?? null;
        if (entityId) excludedRouteIdSet.add(entityId);
      }
    }

    const baseKey = this.variants.buildRouteBaseKey(routeRecord);
    const baseName = this.variants.buildRouteBaseName(routeRecord);
    if (!baseKey) {
      return { baseKey: null, baseName: baseName ?? null, routes: [] };
    }

    const [allPlatforms, allStations, routeRows] = await Promise.all([
      this.storage.fetchPlatformsFromStorage(
        server,
        dimensionContextForGeometry,
      ),
      this.storage.fetchStationsFromStorage(
        server,
        dimensionContextForGeometry,
      ),
      this.storage.fetchStoredRoutesForDimensionRows(
        server,
        dimensionContextForGeometry,
      ),
    ]);
    const platformMap = this.mappers.buildPlatformsMap(allPlatforms);
    const stationsMap = this.mappers.buildStationsMap(allStations);

    const candidates = routeRows
      .map((row) => {
        const record = this.mappers.buildRouteRecordFromEntity(row);
        if (!record) return null;
        const key = this.variants.buildRouteBaseKey(record);
        if (!key || key !== baseKey) return null;
        const rid = row.entityId?.trim();
        if (!rid) return null;
        if (
          excludedRouteIdSet.size &&
          excludedRouteIdSet.has(rid) &&
          rid !== normalizedRouteId
        ) {
          return null;
        }
        return { row, record, routeId: rid };
      })
      .filter(
        (
          item,
        ): item is {
          row: typeof routeEntity;
          record: typeof routeRecord;
          routeId: string;
        } => Boolean(item),
      );

    const uniqueById = new Map<string, (typeof candidates)[number]>();
    for (const item of candidates) {
      uniqueById.set(item.routeId, item);
    }
    const uniqueCandidates = Array.from(uniqueById.values());

    const primaryRouteId = routeEntity.entityId ?? normalizedRouteId;

    uniqueCandidates.sort((a, b) => {
      if (a.routeId === primaryRouteId && b.routeId !== primaryRouteId) {
        return -1;
      }
      if (b.routeId === primaryRouteId && a.routeId !== primaryRouteId) {
        return 1;
      }
      const la = this.variants.buildRouteVariantLabel(a.record) ?? '主线';
      const lb = this.variants.buildRouteVariantLabel(b.record) ?? '主线';
      return la.localeCompare(lb, 'zh-Hans-CN');
    });

    const results: RailwayRouteVariantItem[] = [];
    for (const item of uniqueCandidates) {
      const detail = await this.variants.buildRouteDetailFromStoredRow(
        server,
        item.row,
        item.routeId,
        dimensionContextForGeometry,
        platformMap,
        stationsMap,
      );
      if (!detail) continue;
      results.push({
        routeId: item.routeId,
        variantLabel:
          this.variants.buildRouteVariantLabel(item.record) ?? '主线',
        detail,
      });
    }

    return {
      baseKey,
      baseName: baseName ?? null,
      routes: results,
    };
  }

  async getStationDetail(
    stationId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayStationDetailResult> {
    return this.details.getStationDetail(stationId, railwayMod, query);
  }

  async getDepotDetail(
    depotId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteDetailQueryDto,
  ): Promise<RailwayDepotDetailResult> {
    return this.details.getDepotDetail(depotId, railwayMod, query);
  }

  async getRouteLogs(
    routeId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
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
    const routeRow = await this.storage.fetchStoredEntityRow(
      server,
      'ROUTE',
      normalizedRouteId,
      query.dimension ?? null,
    );
    if (!routeRow) {
      throw new NotFoundException('Route not found');
    }
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const page = Math.max(Number(query.page) || 1, 1);
    const explicitContext = query.dimension
      ? buildDimensionContextFromDimension(query.dimension, server.railwayMod)
      : null;
    const dimensionContext =
      explicitContext ?? routeRow.dimensionContext ?? null;
    const rawSearch = query.search;
    const searchKeyword =
      typeof rawSearch === 'string' && rawSearch.trim().length > 0
        ? rawSearch.trim()
        : undefined;
    const effectiveSearch = searchKeyword ?? routeId;
    return this.logs.searchRouteLogsByKeyword(
      server,
      dimensionContext,
      effectiveSearch,
      page,
      limit,
    );
  }

  async getStationLogs(
    stationId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
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
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const page = Math.max(Number(query.page) || 1, 1);
    const explicitContext = query.dimension
      ? buildDimensionContextFromDimension(query.dimension, server.railwayMod)
      : null;
    const dimensionContext =
      explicitContext ?? stationRow.dimensionContext ?? null;
    const rawSearch = query.search;
    const searchKeyword =
      typeof rawSearch === 'string' && rawSearch.trim().length > 0
        ? rawSearch.trim()
        : undefined;
    const effectiveSearch = searchKeyword ?? stationId;
    return this.logs.searchRouteLogsByKeyword(
      server,
      dimensionContext,
      effectiveSearch,
      page,
      limit,
    );
  }

  async getDepotLogs(
    depotId: string,
    railwayMod: TransportationRailwayMod,
    query: RailwayRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
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
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const page = Math.max(Number(query.page) || 1, 1);
    const explicitContext = query.dimension
      ? buildDimensionContextFromDimension(query.dimension, server.railwayMod)
      : null;
    const dimensionContext =
      explicitContext ?? depotRow.dimensionContext ?? null;
    const rawSearch = query.search;
    const searchKeyword =
      typeof rawSearch === 'string' && rawSearch.trim().length > 0
        ? rawSearch.trim()
        : undefined;
    const effectiveSearch = searchKeyword ?? depotId;
    return this.logs.searchRouteLogsByKeyword(
      server,
      dimensionContext,
      effectiveSearch,
      page,
      limit,
    );
  }
}
