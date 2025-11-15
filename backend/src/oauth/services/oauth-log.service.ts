import { Injectable } from '@nestjs/common';
import { OAuthLogAction, OAuthLogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface RecordLogInput {
  providerId?: string | null;
  providerKey: string;
  providerType: string;
  action: OAuthLogAction;
  status: OAuthLogStatus;
  userId?: string | null;
  accountId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ListLogOptions {
  providerKey?: string;
  status?: OAuthLogStatus;
  action?: OAuthLogAction;
  userId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  from?: Date;
  to?: Date;
}

@Injectable()
export class OAuthLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: RecordLogInput) {
    return this.prisma.oAuthLog.create({
      data: {
        providerId: data.providerId ?? null,
        providerKey: data.providerKey,
        providerType: data.providerType,
        action: data.action,
        status: data.status,
        userId: data.userId ?? null,
        accountId: data.accountId ?? null,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
        message: data.message ?? null,
        metadata:
          data.metadata !== undefined
            ? (data.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
  }

  async list(options: ListLogOptions = {}) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const sizeInput =
      options.pageSize && options.pageSize > 0 ? options.pageSize : 20;
    const pageSize = Math.min(sizeInput, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.OAuthLogWhereInput = {};
    if (options.providerKey) {
      where.providerKey = options.providerKey;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.action) {
      where.action = options.action;
    }
    if (options.userId) {
      where.userId = options.userId;
    }
    if (options.from || options.to) {
      where.createdAt = {};
      if (options.from) {
        where.createdAt.gte = options.from;
      }
      if (options.to) {
        where.createdAt.lte = options.to;
      }
    }
    if (options.search) {
      where.message = { contains: options.search, mode: 'insensitive' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.oAuthLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      this.prisma.oAuthLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async dailyStats(providerKey?: string, days = 14) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: Prisma.OAuthLogWhereInput = {
      createdAt: { gte: from },
    };
    if (providerKey) {
      where.providerKey = providerKey;
    }
    const providerSql = providerKey
      ? Prisma.sql`AND "providerKey" = ${providerKey}`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<
      Array<{ date: string; action: string; count: bigint }>
    >(
      Prisma.sql`
        SELECT
          to_char("createdAt", 'YYYY-MM-DD') AS date,
          "action"::text AS action,
          COUNT(*)::bigint AS count
        FROM "oauth_logs"
        WHERE "createdAt" >= ${from}
        ${providerSql}
        GROUP BY date, action
        ORDER BY date ASC
      `,
    );
    return rows.map((row) => ({
      date: row.date,
      action: row.action,
      count: Number(row.count),
    }));
  }
}
