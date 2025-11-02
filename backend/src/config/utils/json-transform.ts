import { Prisma } from '@prisma/client';

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null || parsed === undefined) {
        return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
      }
      return parsed as Prisma.InputJsonValue;
    } catch {
      return trimmed as Prisma.InputJsonValue;
    }
  }
  return value as Prisma.InputJsonValue;
}
