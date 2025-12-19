import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ScopeKey } from './types';

export async function computeScopeFingerprint(
  prisma: PrismaService,
  scope: ScopeKey,
): Promise<string> {
  const [routes, platforms, stations, rails] = await Promise.all([
    prisma.transportationRailwayRoute.aggregate({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      _count: { _all: true },
      _max: { lastBeaconUpdatedAt: true },
    }),
    prisma.transportationRailwayPlatform.aggregate({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      _count: { _all: true },
      _max: { lastBeaconUpdatedAt: true },
    }),
    prisma.transportationRailwayStation.aggregate({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      _count: { _all: true },
      _max: { lastBeaconUpdatedAt: true },
    }),
    prisma.transportationRailwayRail.aggregate({
      where: {
        serverId: scope.serverId,
        railwayMod: scope.railwayMod,
        dimensionContext: scope.dimensionContext,
      },
      _count: { _all: true },
      _max: { lastBeaconUpdatedAt: true },
    }),
  ]);

  const format = (value: Date | null | undefined) =>
    value ? String(value.getTime()) : 'null';

  return [
    `routes:${routes._count._all}:${format(routes._max.lastBeaconUpdatedAt)}`,
    `platforms:${platforms._count._all}:${format(
      platforms._max.lastBeaconUpdatedAt,
    )}`,
    `stations:${stations._count._all}:${format(stations._max.lastBeaconUpdatedAt)}`,
    `rails:${rails._count._all}:${format(rails._max.lastBeaconUpdatedAt)}`,
  ].join('|');
}
