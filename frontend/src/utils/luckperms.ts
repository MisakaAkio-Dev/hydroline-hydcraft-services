export interface NormalizedLuckpermsGroup {
  name: string;
  server: string | null;
  world: string | null;
  expiry: number | null;
  contexts: Record<string, string> | null;
  detail: string | null;
}

export interface NormalizedLuckpermsBinding {
  username: string;
  realname: string | null;
  boundAt: string | Date | null;
  primaryGroup: string | null;
  groups: NormalizedLuckpermsGroup[];
}

export function normalizeLuckpermsBinding(
  entry: Record<string, any>,
): NormalizedLuckpermsBinding {
  const realname =
    typeof entry.authmeRealname === 'string' ? entry.authmeRealname : null;
  return {
    username: String(entry.authmeUsername ?? ''),
    realname,
    boundAt: entry.boundAt ?? null,
    primaryGroup:
      typeof entry.luckperms?.primaryGroup === 'string'
        ? entry.luckperms.primaryGroup
        : null,
    groups: normalizeLuckpermsGroups(entry.luckperms?.groups ?? []),
  };
}

export function normalizeLuckpermsBindings(
  raw: unknown,
): NormalizedLuckpermsBinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, any> => Boolean(entry))
    .map((entry) => normalizeLuckpermsBinding(entry));
}

export function normalizeLuckpermsGroups(
  raw: unknown,
): NormalizedLuckpermsGroup[] {
  if (!Array.isArray(raw)) return [];
  const result: NormalizedLuckpermsGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name =
      typeof (item as Record<string, any>).group === 'string'
        ? (item as Record<string, any>).group.trim()
        : String((item as Record<string, any>).group ?? '').trim();
    if (!name) continue;
    const server = normalizeNullableString(
      (item as Record<string, any>).server,
    );
    const world = normalizeNullableString(
      (item as Record<string, any>).world,
    );
    const contexts = normalizeContexts(
      (item as Record<string, any>).contexts ?? null,
    );
    const expiryValue = (item as Record<string, any>).expiry ?? null;
    const expiry = normalizeExpiry(expiryValue);

    result.push({
      name,
      server,
      world,
      contexts,
      expiry,
      detail: renderMembershipDetail({ server, world, contexts, expiry }),
    });
  }
  return result;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return String(value);
}

function normalizeContexts(
  value: unknown,
): Record<string, string> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const contexts: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const stringKey = String(key);
    if (!stringKey) continue;
    if (typeof raw === 'string') {
      contexts[stringKey] = raw;
    } else if (raw !== null && raw !== undefined) {
      contexts[stringKey] = String(raw);
    }
  }
  return Object.keys(contexts).length ? contexts : null;
}

function normalizeExpiry(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function renderMembershipDetail(options: {
  server: string | null;
  world: string | null;
  contexts: Record<string, string> | null;
  expiry: number | null;
}): string | null {
  const parts: string[] = [];
  if (options.server && options.server.toLowerCase() !== 'global') {
    parts.push(`服务器: ${options.server}`);
  }
  if (options.world && options.world.toLowerCase() !== 'global') {
    parts.push(`世界: ${options.world}`);
  }
  if (options.expiry && Number.isFinite(options.expiry) && options.expiry > 0) {
    const epochMs =
      options.expiry < 10_000_000_000 ? options.expiry * 1000 : options.expiry;
    parts.push(`过期: ${new Date(epochMs).toLocaleString()}`);
  }
  if (options.contexts) {
    const ctx = Object.entries(options.contexts)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    if (ctx) {
      parts.push(`上下文: ${ctx}`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}
