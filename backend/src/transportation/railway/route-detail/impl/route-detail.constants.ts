import type { RouteDetailResult } from '../../types/railway-types';

export const BLOCKS_PER_KM = 1000;
export const NEAREST_STATION_MAX_DISTANCE_BLOCKS = 256;
export const DEFAULT_MIN_PATH_NODE_COUNT = 3;

export function resolveMinPathNodeCount(platformCount?: number | null) {
  if (typeof platformCount === 'number' && Number.isFinite(platformCount)) {
    return Math.max(2, Math.trunc(platformCount));
  }
  return DEFAULT_MIN_PATH_NODE_COUNT;
}

export function estimateGeometryLengthKm(
  geometry: RouteDetailResult['geometry'],
) {
  const segments = geometry.segments ?? [];
  if (segments.length) {
    let blocks = 0;
    for (const segment of segments) {
      const sx = segment.start?.x;
      const sz = segment.start?.z;
      const ex = segment.end?.x;
      const ez = segment.end?.z;
      if (
        typeof sx !== 'number' ||
        typeof sz !== 'number' ||
        typeof ex !== 'number' ||
        typeof ez !== 'number'
      ) {
        continue;
      }
      const dx = ex - sx;
      const dz = ez - sz;
      blocks += Math.hypot(dx, dz);
    }
    if (!Number.isFinite(blocks) || blocks <= 0) return null;
    return Number((blocks / BLOCKS_PER_KM).toFixed(2));
  }

  const points = geometry.points ?? [];
  if (points.length < 2) return null;
  let blocks = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dz = curr.z - prev.z;
    blocks += Math.hypot(dx, dz);
  }
  if (!Number.isFinite(blocks) || blocks <= 0) return null;
  return Number((blocks / BLOCKS_PER_KM).toFixed(2));
}
