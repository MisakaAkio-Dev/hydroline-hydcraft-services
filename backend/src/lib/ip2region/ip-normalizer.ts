/**
 * Normalize incoming IP addresses. Collapses IPv4-mapped IPv6 addresses into IPv4.
 */
export function normalizeIpAddress(
  ip: string | null | undefined,
): string | null {
  if (!ip) {
    return null;
  }
  const trimmed = ip.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const dottedMatch = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedMatch) {
    return dottedMatch[1];
  }

  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const high = Number.parseInt(hexMatch[1], 16);
    const low = Number.parseInt(hexMatch[2], 16);
    if (Number.isFinite(high) && Number.isFinite(low)) {
      const parts = [
        (high >> 8) & 0xff,
        high & 0xff,
        (low >> 8) & 0xff,
        low & 0xff,
      ];
      return parts.join('.');
    }
  }

  return trimmed;
}
