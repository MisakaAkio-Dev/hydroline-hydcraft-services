export type BlockPosition = {
  x: number;
  y: number;
  z: number;
};

const XZ_MASK = 0x3ffffffn;
const Y_MASK = 0xfffn;
const X_SHIFT = 38n;
const Z_SHIFT = 12n;

function toBigIntValue(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function signExtend(value: bigint, bits: bigint) {
  const signBit = 1n << (bits - 1n);
  const fullRange = 1n << bits;
  return (value & signBit) !== 0n ? value - fullRange : value;
}

export function decodeBlockPosition(value: unknown): BlockPosition | null {
  const parsed = toBigIntValue(value);
  if (parsed == null) {
    return null;
  }
  const rawX = (parsed >> X_SHIFT) & XZ_MASK;
  const rawZ = (parsed >> Z_SHIFT) & XZ_MASK;
  const rawY = parsed & Y_MASK;
  const x = Number(signExtend(rawX, 26n));
  const y = Number(signExtend(rawY, 12n));
  const z = Number(signExtend(rawZ, 26n));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

export function encodeBlockPosition(
  position: BlockPosition | null | undefined,
): string | null {
  if (!position) return null;
  const x = BigInt(Math.trunc(position.x)) & XZ_MASK;
  const y = BigInt(Math.trunc(position.y)) & Y_MASK;
  const z = BigInt(Math.trunc(position.z)) & XZ_MASK;
  const encoded = (x << X_SHIFT) | (z << Z_SHIFT) | y;
  return encoded.toString();
}
