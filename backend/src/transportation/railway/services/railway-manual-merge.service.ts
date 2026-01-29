import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TransportationRailwayManualMergeEntityType,
  TransportationRailwayMod,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttachmentsService } from '../../../attachments/attachments.service';
import { TransportationRailwayRouteDetailService } from '../route-detail/railway-route-detail.service';
import { TransportationRailwayCompanyBindingService } from './railway-company-binding.service';
import { buildDimensionContextFromDimension } from '../utils/railway-normalizer';
import type {
  RailwayManualMergeCreateDto,
  RailwayManualMergeMemberInputDto,
} from '../../dto/railway-manual-merge.dto';

type ServerInfo = { id: string; name: string; dynmapTileUrl: string | null };

@Injectable()
export class TransportationRailwayManualMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
    private readonly routeDetailService: TransportationRailwayRouteDetailService,
    private readonly bindingService: TransportationRailwayCompanyBindingService,
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
      updatedAt: merge.updatedAt,
      canEdit: Boolean(user?.id && merge.createdById === user.id),
      canDelete: Boolean(user?.id && merge.createdById === user.id),
    };
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
    await this.prisma.transportationRailwayManualMerge.delete({
      where: { id: mergeId },
    });
    return { success: true };
  }
}
