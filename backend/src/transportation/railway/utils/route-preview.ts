export type RoutePreviewBounds = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
};

export type RoutePreviewPath = {
  points: Array<{ x: number; z: number }>;
  color: number | null;
};

export function parseSnapshotBounds(value: unknown): RoutePreviewBounds | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const xMin = Number(record.xMin);
  const xMax = Number(record.xMax);
  const zMin = Number(record.zMin);
  const zMax = Number(record.zMax);
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(zMin) ||
    !Number.isFinite(zMax)
  ) {
    return null;
  }
  return { xMin, xMax, zMin, zMax };
}

export function computeBoundsFromPoints(
  paths: Array<Array<{ x: number; z: number }>>,
): RoutePreviewBounds | null {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const path of paths) {
    for (const point of path) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      xMin = Math.min(xMin, point.x);
      xMax = Math.max(xMax, point.x);
      zMin = Math.min(zMin, point.z);
      zMax = Math.max(zMax, point.z);
      count += 1;
    }
  }
  if (!count) return null;
  return { xMin, xMax, zMin, zMax };
}

export function mergeBounds(
  a: RoutePreviewBounds | null,
  b: RoutePreviewBounds | null,
): RoutePreviewBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    xMin: Math.min(a.xMin, b.xMin),
    xMax: Math.max(a.xMax, b.xMax),
    zMin: Math.min(a.zMin, b.zMin),
    zMax: Math.max(a.zMax, b.zMax),
  };
}

function colorToHex(value: number | null) {
  if (value == null || Number.isNaN(value)) return '#94a3b8';
  const sanitized = Math.max(0, Math.floor(value));
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`;
}

function buildSvgPath(points: Array<{ x: number; z: number }>) {
  if (points.length < 2) return null;
  const [first, ...rest] = points;
  const commands = [`M ${first.x} ${first.z}`];
  for (const point of rest) {
    commands.push(`L ${point.x} ${point.z}`);
  }
  return commands.join(' ');
}

function computePathLength(points: Array<{ x: number; z: number }>) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    length += Math.hypot(curr.x - prev.x, curr.z - prev.z);
  }
  return length;
}

function resamplePath(points: Array<{ x: number; z: number }>, count = 32) {
  if (points.length <= 1) return points;
  if (count <= 2) return [points[0], points[points.length - 1]];
  const total = computePathLength(points);
  if (!Number.isFinite(total) || total <= 0) return points;

  const step = total / (count - 1);
  const samples: Array<{ x: number; z: number }> = [];
  let target = 0;
  let acc = 0;
  samples.push(points[0]);

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const seg = Math.hypot(end.x - start.x, end.z - start.z);
    if (seg <= 0) continue;
    while (acc + seg >= target + step) {
      const t = (target + step - acc) / seg;
      samples.push({
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      });
      target += step;
      if (samples.length >= count) {
        return samples;
      }
    }
    acc += seg;
  }

  if (samples.length < count) {
    samples.push(points[points.length - 1]);
  }
  return samples;
}

function computePathDistance(
  a: Array<{ x: number; z: number }>,
  b: Array<{ x: number; z: number }>,
) {
  const len = Math.min(a.length, b.length);
  if (!len) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < len; i += 1) {
    total += Math.hypot(a[i].x - b[i].x, a[i].z - b[i].z);
  }
  return total / len;
}

export function buildPreviewSvg(input: {
  paths: RoutePreviewPath[];
  bounds: RoutePreviewBounds | null;
  strokeWidth?: number;
}) {
  const rawPaths = input.paths.filter((path) => path.points.length >= 2);
  if (!rawPaths.length) return null;

  const bounds =
    input.bounds ?? computeBoundsFromPoints(rawPaths.map((p) => p.points));
  if (!bounds) return null;

  const width = Math.max(1, bounds.xMax - bounds.xMin);
  const height = Math.max(1, bounds.zMax - bounds.zMin);
  const baseSize = Math.max(width, height);
  const padding = baseSize * 0.08;
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerZ = (bounds.zMin + bounds.zMax) / 2;
  const viewBox = [
    centerX - baseSize / 2 - padding,
    centerZ - baseSize / 2 - padding,
    baseSize + padding * 2,
    baseSize + padding * 2,
  ]
    .map((value) => Number(value.toFixed(2)))
    .join(' ');
  const strokeWidth = input.strokeWidth ?? 2;

  const similarityThreshold = baseSize * 0.08;
  const sampleCount = 32;
  const clusters: Array<{
    sum: Array<{ x: number; z: number }>;
    count: number;
    colorCounts: Map<string, number>;
  }> = [];

  for (const path of rawPaths) {
    const samples = resamplePath(path.points, sampleCount);
    let picked: (typeof clusters)[number] | null = null;
    for (const cluster of clusters) {
      const avg = cluster.sum.map((point) => ({
        x: point.x / cluster.count,
        z: point.z / cluster.count,
      }));
      const distance = computePathDistance(avg, samples);
      if (distance <= similarityThreshold) {
        picked = cluster;
        break;
      }
    }
    if (!picked) {
      const sum = samples.map((point) => ({ ...point }));
      const colorCounts = new Map<string, number>();
      colorCounts.set(colorToHex(path.color), 1);
      clusters.push({ sum, count: 1, colorCounts });
      continue;
    }
    for (let i = 0; i < picked.sum.length; i += 1) {
      picked.sum[i].x += samples[i]?.x ?? 0;
      picked.sum[i].z += samples[i]?.z ?? 0;
    }
    picked.count += 1;
    const colorKey = colorToHex(path.color);
    picked.colorCounts.set(
      colorKey,
      (picked.colorCounts.get(colorKey) ?? 0) + 1,
    );
  }

  const mergedPaths = clusters.map((cluster) => {
    const avgPoints = cluster.sum.map((point) => ({
      x: point.x / cluster.count,
      z: point.z / cluster.count,
    }));
    let color = '#94a3b8';
    let best = 0;
    for (const [key, count] of cluster.colorCounts.entries()) {
      if (count > best) {
        best = count;
        color = key;
      }
    }
    return { points: avgPoints, color };
  });

  const segments = mergedPaths
    .map((path) => {
      const d = buildSvgPath(path.points);
      if (!d) return null;
      return `<path d="${d}" stroke="${path.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`;
    })
    .filter(Boolean)
    .join('');

  if (!segments) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${segments}</svg>`;
}
