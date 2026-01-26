import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { readString, toNumber } from '../../utils/railway-normalizer';
import type { BeaconServerRecord } from '../../utils/railway-common';
import type {
  RailwayRouteLogEntry,
  RailwayRouteLogResult,
} from '../../types/railway-types';

export class RouteDetailLogs {
  constructor(private readonly prisma: PrismaService) {}

  transformLogRecord(record: Record<string, unknown>): RailwayRouteLogEntry {
    const newData = this.parseLogData(record['newData'] ?? record['new_data']);
    const oldData = this.parseLogData(record['oldData'] ?? record['old_data']);
    return {
      id: toNumber(record['beaconLogId'] ?? record['id']) ?? 0,
      timestamp: readString(record['timestamp']) ?? '',
      playerName: readString(record['playerName'] ?? record['player_name']),
      playerUuid: readString(record['playerUuid'] ?? record['player_uuid']),
      changeType: readString(record['changeType'] ?? record['change_type']),
      className: readString(record['className'] ?? record['class_name']),
      entryId: readString(record['entryId'] ?? record['entry_id']),
      entryName: readString(record['entryName'] ?? record['entry_name']),
      dimensionContext: readString(
        record['dimensionContext'] ?? record['dimension_context'],
      ),
      sourceFilePath: readString(
        record['sourceFilePath'] ?? record['source_file_path'],
      ),
      sourceLine: toNumber(record['sourceLine'] ?? record['source_line']),
      newData,
      oldData,
    };
  }

  parseLogData(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  async searchRouteLogsByKeyword(
    server: BeaconServerRecord,
    dimensionContext: string | null,
    keyword: string,
    page: number,
    limit: number,
  ): Promise<RailwayRouteLogResult> {
    const sanitized = this.sanitizeLogSearchKeyword(keyword);
    if (!sanitized) {
      throw new BadRequestException('Invalid log keyword');
    }
    const likePattern = `%${sanitized}%`;
    const searchColumns = [
      Prisma.sql`CAST("beaconLogId" AS TEXT)`,
      Prisma.sql`COALESCE("timestamp", '')`,
      Prisma.sql`COALESCE("playerName", '')`,
      Prisma.sql`COALESCE("playerUuid", '')`,
      Prisma.sql`COALESCE("className", '')`,
      Prisma.sql`COALESCE("entryId", '')`,
      Prisma.sql`COALESCE("entryName", '')`,
      Prisma.sql`COALESCE("position", '')`,
      Prisma.sql`COALESCE("changeType", '')`,
      Prisma.sql`COALESCE("oldData", '')`,
      Prisma.sql`COALESCE("newData", '')`,
      Prisma.sql`COALESCE("sourceFilePath", '')`,
      Prisma.sql`CAST("sourceLine" AS TEXT)`,
      Prisma.sql`COALESCE("dimensionContext", '')`,
    ];
    let searchClause = Prisma.sql``;
    searchColumns.forEach((column, index) => {
      const condition = Prisma.sql`${column} ILIKE ${likePattern}`;
      searchClause =
        index === 0 ? condition : Prisma.sql`${searchClause} OR ${condition}`;
    });
    const whereParts: Prisma.Sql[] = [
      Prisma.sql`"serverId" = ${server.id}`,
      Prisma.sql`"railwayMod" = ${server.railwayMod}::"TransportationRailwayMod"`,
      Prisma.sql`(${searchClause})`,
    ];
    if (dimensionContext) {
      const nestedPattern = `${dimensionContext}/%`;
      whereParts.push(
        Prisma.sql`("dimensionContext" = ${dimensionContext} OR "dimensionContext" LIKE ${nestedPattern})`,
      );
    }
    let whereSql = Prisma.sql``;
    whereParts.forEach((part, index) => {
      whereSql = index === 0 ? part : Prisma.sql`${whereSql} AND ${part}`;
    });
    const offset = (page - 1) * limit;
    const countRows = await this.prisma.$queryRaw<
      Array<{ total: number | string }>
    >(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM "transportation_railway_mtr_logs"
      WHERE ${whereSql}
    `);
    const total = toNumber(countRows?.[0]?.total) ?? 0;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`
        SELECT
          "beaconLogId",
          "timestamp",
          "playerName",
          "playerUuid",
          "className",
          "entryId",
          "entryName",
          "position",
          "changeType",
          "oldData",
          "newData",
          "sourceFilePath",
          "sourceLine",
          "dimensionContext"
        FROM "transportation_railway_mtr_logs"
        WHERE ${whereSql}
        ORDER BY "timestamp" DESC NULLS LAST, "beaconLogId" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    );
    const entries = rows.map((record) => this.transformLogRecord(record));
    return {
      server: {
        id: server.id,
        name: server.displayName,
        dynmapTileUrl: server.dynmapTileUrl ?? null,
      },
      railwayType: server.railwayMod,
      total,
      page,
      pageSize: limit,
      entries,
    };
  }

  sanitizeLogSearchKeyword(value: string) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return '';
    }
    const normalized = trimmed
      .replace(/--/g, ' ')
      .replace(/;/g, ' ')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 64);
    const escaped = normalized
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/[%_]/g, ' ');
    return escaped.trim();
  }
}
