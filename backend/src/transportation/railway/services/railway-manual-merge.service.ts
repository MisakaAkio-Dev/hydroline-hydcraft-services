import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TransportationRailwayManualMergeEntityType,
  TransportationRailwayMod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttachmentsService } from '../../../attachments/attachments.service';
import { TransportationRailwayRouteDetailService } from '../route-detail/railway-route-detail.service';
import { TransportationRailwayCompanyBindingService } from './railway-company-binding.service';
import { buildDimensionContextFromDimension } from '../utils/railway-normalizer';
import { TransportationRailwaySnapshotService } from '../snapshot/railway-snapshot.service';
import type {
  RailwayManualMergeCreateDto,
  RailwayManualMergeMemberInputDto,
  RailwayManualMergeUpdateDto,
} from '../../dto/railway-manual-merge.dto';
import type { RailwayMergedRouteLogQueryDto } from '../../dto/railway.dto';
import type { RailwayRouteLogResult } from '../types/railway-types';

type ServerInfo = { id: string; name: string; dynmapTileUrl: string | null };

@Injectable()
export class TransportationRailwayManualMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
    private readonly routeDetailService: TransportationRailwayRouteDetailService,
    private readonly bindingService: TransportationRailwayCompanyBindingService,
    private readonly snapshotService: TransportationRailwaySnapshotService,
  ) {}

  private async ensureAttachmentPublic(attachmentId: string) {
    const attachment =
      await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (!attachment.isPublic) {
      throw new BadRequestException('Attachment must be public');
    }
  }

  private async resolveServerInfo(serverId: string): Promise<ServerInfo> {
    const row = await this.prisma.minecraftServer.findUnique({
      where: { id: serverId },
      select: { id: true, displayName: true, dynmapTileUrl: true },
    });
    if (!row) {
      return { id: serverId, name: serverId, dynmapTileUrl: null };
    }
    return {
      id: row.id,
      name: row.displayName,
      dynmapTileUrl: row.dynmapTileUrl,
    };
  }

  private extractDimensionFromContext(context: string | null | undefined) {
    if (!context) return null;
    if (context.includes('/')) {
      const parts = context.split('/');
      if (parts.length >= 3) {
        const dimension = parts.pop();
        const namespace = parts.pop();
        if (namespace && dimension) {
          return `${namespace}:${dimension}`;
        }
      }
    }
    if (context.includes(':')) return context;
    return null;
  }

  private normalizeRouteMember(
    route: {
      entityId: string;
      name: string | null;
      color: number | null;
      transportMode: string | null;
      payload: any;
      dimensionContext: string | null;
      filePath: string | null;
      serverId: string;
      railwayMod: TransportationRailwayMod;
    },
    server: ServerInfo,
  ) {
    const payload =
      typeof route.payload === 'object' && route.payload
        ? (route.payload as Record<string, unknown>)
        : null;
    const dimension = this.extractDimensionFromContext(route.dimensionContext);
    const previewSvg =
      payload && typeof payload.preview_svg === 'string'
        ? payload.preview_svg
        : null;
    return {
      entityId: route.entityId,
      name: route.name ?? null,
      color: route.color ?? null,
      transportMode: route.transportMode ?? null,
      previewSvg,
      dimension,
      dimensionContext: route.dimensionContext ?? null,
      server: {
        id: server.id,
        name: server.name,
        dynmapTileUrl: server.dynmapTileUrl,
      },
      railwayType: route.railwayMod,
    };
  }

  private assertAuthenticated(user: any) {
    if (!user?.id) {
      throw new BadRequestException('User session has expired');
    }
    return user as { id: string };
  }

  private async resolveScopeForMembers(
    entityType: TransportationRailwayManualMergeEntityType,
    members: RailwayManualMergeMemberInputDto[],
  ) {
    if (!members.length) {
      throw new BadRequestException('Manual merge must include members');
    }

    const first = members[0];
    const expectedServerId = first.serverId;
    const expectedRailwayMod = first.railwayType;
    const expectedDimensionContext = first.dimension
      ? buildDimensionContextFromDimension(first.dimension, first.railwayType)
      : null;

    const validateSameScope = (member: RailwayManualMergeMemberInputDto) => {
      if (member.serverId !== expectedServerId) {
        throw new BadRequestException('Members must be in the same server');
      }
      if (member.railwayType !== expectedRailwayMod) {
        throw new BadRequestException(
          'Members must be in the same railway type',
        );
      }
      const memberContext = member.dimension
        ? buildDimensionContextFromDimension(
            member.dimension,
            member.railwayType,
          )
        : null;
      const left = expectedDimensionContext ?? null;
      const right = memberContext ?? null;
      if (left !== right) {
        throw new BadRequestException('Members must be in the same dimension');
      }
    };

    for (const member of members) validateSameScope(member);

    const entityIds = members.map((m) => m.entityId);
    const whereBase: {
      serverId: string;
      railwayMod: TransportationRailwayMod;
      entityId: { in: string[] };
      dimensionContext?: string;
    } = {
      serverId: expectedServerId,
      railwayMod: expectedRailwayMod,
      entityId: { in: entityIds },
      ...(expectedDimensionContext
        ? { dimensionContext: expectedDimensionContext }
        : {}),
    };

    const rows =
      entityType === TransportationRailwayManualMergeEntityType.ROUTE
        ? await this.prisma.transportationRailwayRoute.findMany({
            where: whereBase,
            select: { entityId: true, dimensionContext: true },
          })
        : entityType === TransportationRailwayManualMergeEntityType.STATION
          ? await this.prisma.transportationRailwayStation.findMany({
              where: whereBase,
              select: { entityId: true, dimensionContext: true },
            })
          : await this.prisma.transportationRailwayDepot.findMany({
              where: whereBase,
              select: { entityId: true, dimensionContext: true },
            });

    const found = new Set(rows.map((r) => r.entityId));
    const missing = entityIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new NotFoundException(
        `${entityType.toLowerCase()} not found: ${missing[0]}`,
      );
    }

    const dimensionContext =
      expectedDimensionContext ?? rows[0]?.dimensionContext ?? null;

    return {
      serverId: expectedServerId,
      railwayMod: expectedRailwayMod,
      dimensionContext,
      memberEntityIds: entityIds,
    };
  }

  async createMerge(user: any, dto: RailwayManualMergeCreateDto) {
    const actor = this.assertAuthenticated(user);
    if (!dto.members?.length) {
      throw new BadRequestException('Manual merge must include members');
    }

    if (dto.logoAttachmentId) {
      await this.ensureAttachmentPublic(dto.logoAttachmentId);
    }

    const scope = await this.resolveScopeForMembers(
      dto.entityType,
      dto.members,
    );

    const merge = await this.prisma.transportationRailwayManualMerge.create({
      data: {
        entityType: dto.entityType,
        name: dto.name,
        englishName: dto.englishName ?? null,
        color: dto.color ?? null,
        logoAttachmentId: dto.logoAttachmentId ?? null,
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
        createdById: actor.id,
        updatedById: actor.id,
        members: {
          createMany: {
            data: scope.memberEntityIds.map((entityId) => ({
              entityType: dto.entityType,
              serverId: scope.serverId,
              railwayMod: scope.railwayMod,
              entityId,
              dimensionContext: scope.dimensionContext,
            })),
          },
        },
      },
      include: { members: true },
    });

    return { id: merge.id };
  }

  async getMergedRouteDetail(mergeId: string, user?: any) {
    const merge = await this.prisma.transportationRailwayManualMerge.findUnique(
      {
        where: { id: mergeId },
        include: { members: true },
      },
    );
    if (!merge) {
      throw new NotFoundException('Merged route not found');
    }
    if (merge.entityType !== TransportationRailwayManualMergeEntityType.ROUTE) {
      throw new BadRequestException('Target merge is not a route');
    }

    const server = await this.resolveServerInfo(merge.serverId);
    const logoUrl = await this.attachmentsService.resolvePublicUrl(
      merge.logoAttachmentId ?? null,
    );
    const dimension = this.extractDimensionFromContext(merge.dimensionContext);

    const memberEntityIds = merge.members
      .map((m) => m.entityId)
      .filter(Boolean);
    const memberRows = await this.prisma.transportationRailwayRoute.findMany({
      where: {
        serverId: merge.serverId,
        railwayMod: merge.railwayMod,
        entityId: { in: memberEntityIds },
        ...(merge.dimensionContext
          ? { dimensionContext: merge.dimensionContext }
          : {}),
      },
      select: {
        entityId: true,
        name: true,
        color: true,
        transportMode: true,
        payload: true,
        dimensionContext: true,
        filePath: true,
        serverId: true,
        railwayMod: true,
      },
    });

    const rowByEntityId = new Map(memberRows.map((r) => [r.entityId, r]));
    const routes = memberEntityIds
      .map((entityId) => {
        const row = rowByEntityId.get(entityId);
        if (!row) return null;
        return this.normalizeRouteMember(
          {
            entityId: row.entityId,
            name: row.name ?? null,
            color: row.color ?? null,
            transportMode: row.transportMode ?? null,
            payload: row.payload,
            dimensionContext: row.dimensionContext ?? null,
            filePath: row.filePath ?? null,
            serverId: row.serverId,
            railwayMod: row.railwayMod,
          },
          server,
        );
      })
      .filter((item): item is ReturnType<typeof this.normalizeRouteMember> =>
        Boolean(item),
      );

    const routeDetails = await Promise.all(
      routes.map(async (route) => {
        try {
          return await this.routeDetailService.getRouteDetail(
            route.entityId,
            route.railwayType,
            {
              serverId: route.server.id,
              dimension: route.dimension ?? undefined,
            },
          );
        } catch {
          return null;
        }
      }),
    );

    const bindings = await this.bindingService.getBindings({
      entityType: 'ROUTE',
      entityId: merge.id,
      serverId: merge.serverId,
      railwayType: merge.railwayMod,
      dimension,
    });

    // 获取公司详细信息
    const operatorCompanyIds = bindings?.operatorCompanyIds ?? [];
    const builderCompanyIds = bindings?.builderCompanyIds ?? [];
    const allCompanyIds = [
      ...new Set([...operatorCompanyIds, ...builderCompanyIds]),
    ];

    const companies =
      allCompanyIds.length > 0
        ? await this.prisma.company.findMany({
            where: { id: { in: allCompanyIds } },
            select: {
              id: true,
              name: true,
              slug: true,
              logoAttachmentId: true,
              summary: true,
            },
          })
        : [];

    // Resolve logo URLs
    const companiesWithLogos = await Promise.all(
      companies.map(async (c) => ({
        ...c,
        logoUrl: await this.attachmentsService.resolvePublicUrl(
          c.logoAttachmentId,
        ),
      })),
    );

    const companyMap = new Map(companiesWithLogos.map((c) => [c.id, c]));
    const operatorCompanies = operatorCompanyIds
      .map((id) => companyMap.get(id))
      .filter((c) => c !== undefined);
    const builderCompanies = builderCompanyIds
      .map((id) => companyMap.get(id))
      .filter((c) => c !== undefined);

    return {
      id: merge.id,
      name: merge.name,
      englishName: merge.englishName ?? null,
      color: merge.color ?? null,
      logoAttachmentId: merge.logoAttachmentId ?? null,
      logoUrl,
      serverId: merge.serverId,
      server,
      dimensionContext: merge.dimensionContext ?? null,
      routes,
      routeDetails: routeDetails.filter((item) => item !== null),
      bindings,
      operatorCompanies,
      builderCompanies,
      updatedAt: merge.updatedAt,
      canEdit: Boolean(user?.id && merge.createdById === user.id),
      canDelete: Boolean(user?.id && merge.createdById === user.id),
    };
  }

  async getMergedRouteLogs(
    mergeId: string,
    query: RailwayMergedRouteLogQueryDto,
  ): Promise<RailwayRouteLogResult> {
    const merge = await this.prisma.transportationRailwayManualMerge.findUnique(
      {
        where: { id: mergeId },
        include: { members: true },
      },
    );
    if (!merge) {
      throw new NotFoundException('Merged route not found');
    }
    if (merge.entityType !== TransportationRailwayManualMergeEntityType.ROUTE) {
      throw new BadRequestException('Target merge is not a route');
    }

    const memberEntityIds = merge.members
      .map((m) => m.entityId)
      .filter(Boolean);
    if (memberEntityIds.length === 0) {
      return {
        server: {
          id: merge.serverId,
          name: merge.serverId,
          dynmapTileUrl: null,
        },
        railwayType: merge.railwayMod,
        total: 0,
        page: query.page ?? 1,
        pageSize: query.limit ?? 10,
        entries: [],
      };
    }

    const server = await this.resolveServerInfo(merge.serverId);
    const dimension = this.extractDimensionFromContext(merge.dimensionContext);

    // query logs for all member routes
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const searchIds = memberEntityIds.flatMap((id) => [id, `[${id}]`]);

    const countRows = await this.prisma.$queryRaw<
      Array<{ total: number | string | bigint }>
    >`
        SELECT COUNT(*) as total
        FROM "transportation_railway_mtr_logs"
        WHERE "serverId" = ${merge.serverId}
          AND "railwayMod"::text = ${merge.railwayMod}
          AND "entryId" IN (${Prisma.join(searchIds)})
      `;
    const total = Number(countRows?.[0]?.total ?? 0);

    // using raw query for performance
    const paginatedLogs = await this.prisma.$queryRaw<
      Array<Record<string, unknown>>
    >`
        SELECT
          "beaconLogId",
          "timestamp",
          "playerName",
          "playerUuid",
          "className",
          "entryId",
          "entryName",
          "position",
          "changeType",
          "oldData",
          "newData",
          "sourceFilePath",
          "sourceLine",
          "dimensionContext"
        FROM "transportation_railway_mtr_logs"
        WHERE "serverId" = ${merge.serverId}
          AND "railwayMod"::text = ${merge.railwayMod}
          AND "entryId" IN (${Prisma.join(searchIds)})
        ORDER BY "timestamp" DESC NULLS LAST, "beaconLogId" DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

    // using existing log transformer
    const entries = paginatedLogs.map((record) => {
      const newData = this.parseLogData(
        record['newData'] ?? record['new_data'],
      );
      const oldData = this.parseLogData(
        record['oldData'] ?? record['old_data'],
      );
      return {
        id:
          typeof record['beaconLogId'] === 'number'
            ? record['beaconLogId']
            : Number(record['beaconLogId'] ?? 0),
        timestamp: String(record['timestamp'] ?? ''),
        playerName:
          typeof record['playerName'] === 'string'
            ? record['playerName']
            : null,
        playerUuid:
          typeof record['playerUuid'] === 'string'
            ? record['playerUuid']
            : null,
        changeType:
          typeof record['changeType'] === 'string'
            ? record['changeType']
            : null,
        className:
          typeof record['className'] === 'string' ? record['className'] : null,
        entryId:
          typeof record['entryId'] === 'string' ? record['entryId'] : null,
        entryName:
          typeof record['entryName'] === 'string' ? record['entryName'] : null,
        dimensionContext:
          typeof record['dimensionContext'] === 'string'
            ? record['dimensionContext']
            : null,
        sourceFilePath:
          typeof record['sourceFilePath'] === 'string'
            ? record['sourceFilePath']
            : null,
        sourceLine:
          typeof record['sourceLine'] === 'number'
            ? record['sourceLine']
            : null,
        newData,
        oldData,
      };
    });

    return {
      server: {
        id: server.id,
        name: server.name,
        dynmapTileUrl: server.dynmapTileUrl,
      },
      railwayType: merge.railwayMod,
      total,
      page,
      pageSize: limit,
      entries,
    };
  }

  private parseLogData(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  async getMergedEntityDetail(
    entityType: TransportationRailwayManualMergeEntityType,
    mergeId: string,
    user?: any,
  ) {
    if (entityType === TransportationRailwayManualMergeEntityType.ROUTE) {
      return this.getMergedRouteDetail(mergeId, user);
    }

    const merge = await this.prisma.transportationRailwayManualMerge.findUnique(
      {
        where: { id: mergeId },
        include: { members: true },
      },
    );
    if (!merge) {
      throw new NotFoundException('Merged entity not found');
    }
    if (merge.entityType !== entityType) {
      throw new BadRequestException('Merged entity type mismatch');
    }

    const server = await this.resolveServerInfo(merge.serverId);
    const logoUrl = await this.attachmentsService.resolvePublicUrl(
      merge.logoAttachmentId ?? null,
    );
    const dimension = this.extractDimensionFromContext(merge.dimensionContext);

    const bindings = await this.bindingService.getBindings({
      entityType:
        entityType === TransportationRailwayManualMergeEntityType.STATION
          ? 'STATION'
          : 'DEPOT',
      entityId: merge.id,
      serverId: merge.serverId,
      railwayType: merge.railwayMod,
      dimension,
    });

    return {
      id: merge.id,
      name: merge.name,
      englishName: merge.englishName ?? null,
      color: merge.color ?? null,
      logoAttachmentId: merge.logoAttachmentId ?? null,
      logoUrl,
      serverId: merge.serverId,
      server,
      dimensionContext: merge.dimensionContext ?? null,
      members: merge.members.map((m) => ({
        entityId: m.entityId,
        serverId: m.serverId,
        railwayType: m.railwayMod,
        dimension,
      })),
      bindings,
      updatedAt: merge.updatedAt,
      canEdit: Boolean(user?.id && merge.createdById === user.id),
      canDelete: Boolean(user?.id && merge.createdById === user.id),
    };
  }

  async deleteMerge(user: any, mergeId: string) {
    const actor = this.assertAuthenticated(user);
    const merge = await this.prisma.transportationRailwayManualMerge.findUnique(
      {
        where: { id: mergeId },
        select: { id: true, createdById: true },
      },
    );
    if (!merge) {
      throw new NotFoundException('Merged entity not found');
    }
    if (merge.createdById && merge.createdById !== actor.id) {
      throw new ForbiddenException(
        'Insufficient permissions to delete this merge',
      );
    }
    return { success: true };
  }

  async updateMerge(
    user: any,
    mergeId: string,
    dto: RailwayManualMergeUpdateDto,
  ) {
    const actor = this.assertAuthenticated(user);
    const merge = await this.prisma.transportationRailwayManualMerge.findUnique(
      {
        where: { id: mergeId },
        select: { id: true, createdById: true },
      },
    );
    if (!merge) {
      throw new NotFoundException('Merged entity not found');
    }
    // if (merge.createdById && merge.createdById !== actor.id) {
    //   throw new ForbiddenException(
    //     'Insufficient permissions to update this merge',
    //   );
    // }
    await this.prisma.transportationRailwayManualMerge.update({
      where: { id: mergeId },
      data: {
        name: dto.name,
        englishName: dto.englishName,
        color: dto.color,
        logoAttachmentId: dto.logoAttachmentId,
        updatedById: actor.id,
      },
    });
    return { success: true };
  }

  async regenerateMergedRouteGeometry(user: any, mergeId: string) {
    this.assertAuthenticated(user);
    const merge = await this.prisma.transportationRailwayManualMerge.findUnique(
      {
        where: { id: mergeId },
        include: { members: true },
      },
    );
    if (!merge) {
      throw new NotFoundException('Merged route not found');
    }
    if (merge.entityType !== TransportationRailwayManualMergeEntityType.ROUTE) {
      throw new BadRequestException('Target merge is not a route');
    }

    const memberEntityIds = merge.members
      .map((m) => m.entityId)
      .filter(Boolean);
    const memberRows = await this.prisma.transportationRailwayRoute.findMany({
      where: {
        serverId: merge.serverId,
        railwayMod: merge.railwayMod,
        entityId: { in: memberEntityIds },
        ...(merge.dimensionContext
          ? { dimensionContext: merge.dimensionContext }
          : {}),
      },
      select: {
        entityId: true,
        railwayMod: true,
        dimensionContext: true,
      },
    });

    const promises = memberRows.map((row) =>
      this.snapshotService
        .computeAndPersistRouteGeometrySnapshot({
          serverId: merge.serverId,
          railwayMod: row.railwayMod,
          routeId: row.entityId,
          dimension: this.extractDimensionFromContext(row.dimensionContext),
        })
        .then((res) => ({
          ...res,
          routeId: row.entityId, // Ensure routeId matches the member
        }))
        .catch(
          (e) =>
            ({
              routeId: row.entityId,
              status: 'failed' as const,
              errorMessage: e instanceof Error ? e.message : String(e),
              // Fallback minimal fields
              serverId: merge.serverId,
              railwayType: row.railwayMod,
              dimension: this.extractDimensionFromContext(row.dimensionContext),
              dimensionContext: row.dimensionContext,
              fingerprint: '',
              source: 'error',
              persisted: false,
              report: {
                pointCount: 0,
                pathNodeCount: 0,
                pathEdgeCount: 0,
                stopCount: 0,
                bounds: null,
              },
              snapshot: null,
              dataset: {
                routeCount: 0,
                platformCount: 0,
                stationCount: 0,
                railCount: 0,
              },
            }) as any,
        ),
    );

    const results = await Promise.all(promises);

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return {
      total: memberRows.length,
      succeeded,
      failed,
      details: results,
    };
  }
}
