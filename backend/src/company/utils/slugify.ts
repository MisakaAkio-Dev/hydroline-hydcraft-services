import { randomUUID } from 'crypto';

export function slugify(input: string) {
  const normalized = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0
    ? normalized
    : `company-${randomUUID().slice(0, 6)}`;
}
