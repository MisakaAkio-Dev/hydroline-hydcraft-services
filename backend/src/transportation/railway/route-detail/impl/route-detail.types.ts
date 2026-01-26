import type {
  TransportationRailwayDepot,
  TransportationRailwayRoute,
  TransportationRailwayStation,
} from '@prisma/client';
import type { RouteDetailResult } from '../../types/railway-types';

export type StoredRailwayEntity =
  | TransportationRailwayRoute
  | TransportationRailwayStation
  | TransportationRailwayDepot;

export type StoredEntityCategory = 'ROUTE' | 'STATION' | 'DEPOT';

export type RailwayRouteVariantItem = {
  routeId: string;
  variantLabel: string;
  detail: RouteDetailResult;
};

export type RailwayRouteVariantsResult = {
  baseKey: string | null;
  baseName: string | null;
  routes: RailwayRouteVariantItem[];
};
