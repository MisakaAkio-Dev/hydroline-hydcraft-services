import { TransportationRailwayMod } from '@prisma/client';

export const BEACON_TIMEOUT_MS = 10000;

export type BeaconServerRecord = {
  id: string;
  displayName: string;
  beaconEndpoint: string;
  beaconKey: string;
  beaconRequestTimeoutMs?: number | null;
  railwayMod: TransportationRailwayMod;
  dynmapTileUrl?: string | null;
};
