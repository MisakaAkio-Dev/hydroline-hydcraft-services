import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CompanyStatus,
  CompanyVisibility,
  TransportationRailwayBindingEntityType,
  TransportationRailwayCompanyBindingType,
  TransportationRailwayMod,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildDimensionContextFromDimension } from '../utils/railway-normalizer';

export type RailwayCompanyBindingScope = {
  entityType: TransportationRailwayBindingEntityType;
  entityId: string;
  serverId?: string | null;
  railwayType?: TransportationRailwayMod | null;
  dimension?: string | null;
};

@Injectable()
export class TransportationRailwayCompanyBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBindings(scope: RailwayCompanyBindingScope) {
    const dimensionContext = scope.dimension
      ? buildDimensionContextFromDimension(
          scope.dimension,
          scope.railwayType ?? TransportationRailwayMod.MTR,
        )
      : null;
    const bindings =
      await this.prisma.transportationRailwayCompanyBinding.findMany({
        where: {
          entityType: scope.entityType,
          entityId: scope.entityId,
          ...(scope.serverId ? { serverId: scope.serverId } : {}),
          ...(scope.railwayType ? { railwayMod: scope.railwayType } : {}),
          ...(dimensionContext ? { dimensionContext } : {}),
        },
        select: {
          companyId: true,
          bindingType: true,
        },
      });

    const operatorCompanyIds: string[] = [];
    const builderCompanyIds: string[] = [];

    for (const binding of bindings) {
      if (
        binding.bindingType === TransportationRailwayCompanyBindingType.OPERATOR
      ) {
        operatorCompanyIds.push(binding.companyId);
      } else if (
        binding.bindingType === TransportationRailwayCompanyBindingType.BUILDER
      ) {
        builderCompanyIds.push(binding.companyId);
      }
    }

    return {
      operatorCompanyIds,
      builderCompanyIds,
    };
  }

  async updateBindings(
    userId: string,
    scope: RailwayCompanyBindingScope,
    operatorCompanyIds: string[],
    builderCompanyIds: string[],
  ) {
    const operatorIds = this.normalizeCompanyIds(operatorCompanyIds);
    const builderIds = this.normalizeCompanyIds(builderCompanyIds);

    await this.ensureCompaniesActive([...operatorIds, ...builderIds]);

    const dimensionContext = scope.dimension
      ? buildDimensionContextFromDimension(
          scope.dimension,
          scope.railwayType ?? TransportationRailwayMod.MTR,
        )
      : null;

    const baseWhere = {
      entityType: scope.entityType,
      entityId: scope.entityId,
      serverId: scope.serverId ?? null,
      railwayMod: scope.railwayType ?? null,
      dimensionContext,
    };

    const data = [
      ...operatorIds.map((companyId) => ({
        ...baseWhere,
        companyId,
        bindingType: TransportationRailwayCompanyBindingType.OPERATOR,
        createdById: userId,
        updatedById: userId,
      })),
      ...builderIds.map((companyId) => ({
        ...baseWhere,
        companyId,
        bindingType: TransportationRailwayCompanyBindingType.BUILDER,
        createdById: userId,
        updatedById: userId,
      })),
    ];

    await this.prisma.$transaction([
      this.prisma.transportationRailwayCompanyBinding.deleteMany({
        where: {
          ...baseWhere,
          bindingType: {
            in: [
              TransportationRailwayCompanyBindingType.OPERATOR,
              TransportationRailwayCompanyBindingType.BUILDER,
            ],
          },
        },
      }),
      ...(data.length
        ? [
            this.prisma.transportationRailwayCompanyBinding.createMany({
              data,
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return this.getBindings(scope);
  }

  async listCompanyBindingStats(params: {
    bindingType: TransportationRailwayCompanyBindingType;
    entityType?: TransportationRailwayBindingEntityType;
  }) {
    const bindings =
      await this.prisma.transportationRailwayCompanyBinding.findMany({
        where: {
          bindingType: params.bindingType,
          ...(params.entityType ? { entityType: params.entityType } : {}),
        },
        select: {
          companyId: true,
          entityType: true,
        },
      });

    const statsMap = new Map<
      string,
      {
        companyId: string;
        total: number;
        routes: number;
        stations: number;
        depots: number;
        systems: number;
      }
    >();

    for (const binding of bindings) {
      const existing = statsMap.get(binding.companyId) ?? {
        companyId: binding.companyId,
        total: 0,
        routes: 0,
        stations: 0,
        depots: 0,
        systems: 0,
      };
      existing.total += 1;
      if (binding.entityType === TransportationRailwayBindingEntityType.ROUTE) {
        existing.routes += 1;
      } else if (
        binding.entityType === TransportationRailwayBindingEntityType.STATION
      ) {
        existing.stations += 1;
      } else if (
        binding.entityType === TransportationRailwayBindingEntityType.DEPOT
      ) {
        existing.depots += 1;
      } else if (
        binding.entityType === TransportationRailwayBindingEntityType.SYSTEM
      ) {
        existing.systems += 1;
      }
      statsMap.set(binding.companyId, existing);
    }

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
  }

  async listCompanyBindings(params: {
    companyId: string;
    bindingType?: TransportationRailwayCompanyBindingType;
  }) {
    const bindings =
      await this.prisma.transportationRailwayCompanyBinding.findMany({
        where: {
          companyId: params.companyId,
          ...(params.bindingType ? { bindingType: params.bindingType } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

    if (!bindings.length) {
      return [];
    }

    return bindings.map((binding) => ({
      id: binding.id,
      bindingType: binding.bindingType,
      entityType: binding.entityType,
      entityId: binding.entityId,
      serverId: binding.serverId,
      railwayMod: binding.railwayMod,
      dimensionContext: binding.dimensionContext,
      createdAt: binding.createdAt,
    }));
  }

  async countDistinctCompanies(params: {
    bindingType: TransportationRailwayCompanyBindingType;
    entityType?: TransportationRailwayBindingEntityType;
  }) {
    const items =
      await this.prisma.transportationRailwayCompanyBinding.findMany({
        where: {
          bindingType: params.bindingType,
          ...(params.entityType ? { entityType: params.entityType } : {}),
        },
        distinct: ['companyId'],
        select: { companyId: true },
      });
    return items.length;
  }

  private normalizeCompanyIds(ids: string[]) {
    return Array.from(
      new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
    );
  }

  private async ensureCompaniesActive(ids: string[]) {
    if (!ids.length) return;
    const companies = await this.prisma.company.findMany({
      where: {
        id: { in: ids },
        status: CompanyStatus.ACTIVE,
        visibility: CompanyVisibility.PUBLIC,
      },
      select: { id: true },
    });

    const found = new Set(companies.map((company) => company.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new NotFoundException('Company not found or inactive');
    }
  }
}
