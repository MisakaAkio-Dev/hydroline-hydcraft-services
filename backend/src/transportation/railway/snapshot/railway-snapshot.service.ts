import { Injectable, Logger } from '@nestjs/common';
import { TransportationRailwayMod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeScopeFingerprint } from './compute/fingerprint';
import { loadScopeDataset } from './compute/dataset';
import {
  buildGraphFromRails,
  computeRouteGeometrySnapshots,
} from './compute/route-geometry';
import { computeStationMapSnapshots } from './compute/station-map';
import type { ScopeKey } from './compute/types';

@Injectable()
export class TransportationRailwaySnapshotService {
  private readonly logger = new Logger(
    TransportationRailwaySnapshotService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async computeAndPersistAllSnapshotsForServer(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
  }) {
    const dimensionContexts = await this.listDimensionContexts(input);
    for (const dimensionContext of dimensionContexts) {
      await this.computeAndPersistScopeSnapshots({
        serverId: input.serverId,
        railwayMod: input.railwayMod,
        dimensionContext,
      });
    }
  }

  private async listDimensionContexts(input: {
    serverId: string;
    railwayMod: TransportationRailwayMod;
  }): Promise<string[]> {
    const rows = await this.prisma.transportationRailwayDimension.findMany({
      where: { serverId: input.serverId, railwayMod: input.railwayMod },
      select: { dimensionContext: true },
      orderBy: { dimensionContext: 'asc' },
    });
    const contexts = rows
      .map((row) => row.dimensionContext)
      .filter((ctx): ctx is string => Boolean(ctx?.trim()));
    if (contexts.length) {
      return contexts;
    }
    const rails = await this.prisma.transportationRailwayRail.findMany({
      where: { serverId: input.serverId, railwayMod: input.railwayMod },
      distinct: ['dimensionContext'],
      select: { dimensionContext: true },
    });
    return rails
      .map((row) => row.dimensionContext?.trim() ?? '')
      .filter(Boolean);
  }

  private async computeAndPersistScopeSnapshots(scope: ScopeKey) {
    const fingerprint = await computeScopeFingerprint(this.prisma, scope);
    const existing =
      await this.prisma.transportationRailwayComputeScope.findUnique({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
      });

    if (
      existing?.fingerprint === fingerprint &&
      existing.status === 'SUCCEEDED'
    ) {
      this.logger.log(
        `Skip compute: ${scope.serverId} ${scope.railwayMod} ${scope.dimensionContext} fingerprint unchanged`,
      );
      return;
    }

    await this.prisma.transportationRailwayComputeScope.upsert({
      where: {
        serverId_railwayMod_dimensionContext: {
          serverId: scope.serverId,
          railwayMod: scope.railwayMod,
          dimensionContext: scope.dimensionContext,
        },
      },
      update: {
        fingerprint,
        status: 'RUNNING',
        message: null,
        computedAt: null,
      },
      create: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
        fingerprint,
        status: 'RUNNING',
      },
    });

    try {
      const dataset = await loadScopeDataset(this.prisma, scope);
      const graph = buildGraphFromRails(dataset.rails);

      const routeGeometryById = await computeRouteGeometrySnapshots(
        this.prisma,
        { scope, graph, dataset, fingerprint },
        this.logger,
        Number(process.env.RAILWAY_SNAPSHOT_ROUTE_CONCURRENCY ?? 2),
      );

      await computeStationMapSnapshots(
        this.prisma,
        { scope, dataset, routeGeometryById, fingerprint },
        this.logger,
        Number(process.env.RAILWAY_SNAPSHOT_STATION_CONCURRENCY ?? 2),
      );

      await this.prisma.transportationRailwayComputeScope.update({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
        data: {
          status: 'SUCCEEDED',
          computedAt: new Date(),
          message: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.transportationRailwayComputeScope.update({
        where: {
          serverId_railwayMod_dimensionContext: {
            serverId: scope.serverId,
            railwayMod: scope.railwayMod,
            dimensionContext: scope.dimensionContext,
          },
        },
        data: {
          status: 'FAILED',
          message,
        },
      });
      this.logger.error(
        `Compute scope failed: ${scope.serverId} ${scope.railwayMod} ${scope.dimensionContext}: ${message}`,
      );
    }
  }
}
