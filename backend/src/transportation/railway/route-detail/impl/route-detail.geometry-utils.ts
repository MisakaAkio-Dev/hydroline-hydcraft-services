import type { BlockPosition } from '../../../utils/block-pos.util';
import { decodeBlockPosition } from '../../../utils/block-pos.util';
import type {
  RailwayPlatformRecord,
  RailwayStationRecord,
} from '../../types/railway-types';

export class RouteDetailGeometryUtils {
  computePlatformCenter(platform: RailwayPlatformRecord) {
    const pos1 = decodeBlockPosition(platform.pos_1);
    const pos2 = decodeBlockPosition(platform.pos_2);
    if (!pos1 || !pos2) return null;
    return {
      x: Math.round((pos1.x + pos2.x) / 2),
      z: Math.round((pos1.z + pos2.z) / 2),
    };
  }

  computeStationCenter(station: RailwayStationRecord) {
    if (
      station.x_min == null ||
      station.x_max == null ||
      station.z_min == null ||
      station.z_max == null
    ) {
      return null;
    }
    return {
      x: Math.round((station.x_min + station.x_max) / 2),
      z: Math.round((station.z_min + station.z_max) / 2),
    };
  }

  extractBlockPosition(value: unknown): BlockPosition | null {
    if (!value) return null;
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'x' in (value as Record<string, unknown>) &&
      'y' in (value as Record<string, unknown>) &&
      'z' in (value as Record<string, unknown>)
    ) {
      const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
      const x = Number(candidate.x);
      const y = Number(candidate.y);
      const z = Number(candidate.z);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
      }
    }
    return decodeBlockPosition(value);
  }

  isSameBlockPos(a: BlockPosition | null, b: BlockPosition | null) {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }
}
