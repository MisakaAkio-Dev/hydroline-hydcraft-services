/**
 * Core administration service for regimes, division types, and divisions.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import type { AdministrationDivision, Prisma } from '@prisma/client';
import type {
  CreateAdministrationDivisionDto,
  CreateAdministrationDivisionTypeDto,
  CreateAdministrationRegimeDto,
  DivisionSearchDto,
  UpdateAdministrationRegimeDto,
  UpdateAdministrationDivisionTypeDto,
  UpdateAdministrationDivisionDto,
} from './dto/administration.dto';

type DivisionNode = {
  id: string;
  name: string;
  level: number;
  parentId?: string | null;
};

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  async listServers() {
    return this.prisma.minecraftServer.findMany({
      select: { id: true, displayName: true, internalCodeEn: true },
      orderBy: [{ displayOrder: 'asc' }, { displayName: 'asc' }],
    });
  }

  async listServersWithRegimeSummary() {
    const servers = await this.listServers();
    if (!servers.length) return [];
    const regimes = await this.prisma.administrationRegime.findMany({
      where: { serverId: { in: servers.map((s) => s.id) }, isActive: true },
      select: { id: true, serverId: true, levelCount: true },
    });
    const byServer = new Map(regimes.map((r) => [r.serverId, r]));
    return servers.map((server) => ({
      id: server.id,
      name: server.displayName,
      internalCodeEn: server.internalCodeEn,
      administration: byServer.has(server.id)
        ? {
            regimeId: byServer.get(server.id)!.id,
            levelCount: byServer.get(server.id)!.levelCount,
          }
        : null,
    }));
  }

  async listRegimes(serverId?: string) {
    return this.prisma.administrationRegime.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: [{ serverId: 'asc' }, { version: 'desc' }],
    });
  }

  async getActiveRegime(serverId: string) {
    return this.prisma.administrationRegime.findFirst({
      where: { serverId, isActive: true },
      include: { levels: { orderBy: { levelIndex: 'asc' } } },
    });
  }

  async createRegime(
    serverId: string,
    dto: CreateAdministrationRegimeDto,
    userId?: string,
  ) {
    const levelCount = Number(dto.levelCount);
    if (!Number.isFinite(levelCount) || levelCount < 1) {
      throw new BadRequestException('levelCount must be greater than 0');
    }

    const server = await this.prisma.minecraftServer.findUnique({
      where: { id: serverId },
      select: { id: true },
    });
    if (!server) {
      throw new BadRequestException('Server not found');
    }

    const latest = await this.prisma.administrationRegime.aggregate({
      where: { serverId },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const hasActive = await this.prisma.administrationRegime.findFirst({
      where: { serverId, isActive: true },
      select: { id: true },
    });
    const shouldActivate =
      dto.activate === true || (!hasActive && dto.activate !== false);

    const regime = await this.prisma.$transaction(async (tx) => {
      if (shouldActivate) {
        await tx.administrationRegime.updateMany({
          where: { serverId, isActive: true },
          data: { isActive: false, updatedById: userId ?? null },
        });
      }
      const created = await tx.administrationRegime.create({
        data: {
          id: randomUUID(),
          serverId,
          name: dto.name.trim(),
          version,
          levelCount,
          isActive: shouldActivate,
          createdById: userId ?? null,
          updatedById: userId ?? null,
        },
      });
      const levels = Array.from({ length: levelCount }, (_, index) => ({
        id: randomUUID(),
        regimeId: created.id,
        levelIndex: index + 1,
        displayName: `第${index + 1}级行政区`,
        allowOverrideGovernance: false,
      }));
      if (levels.length) {
        await tx.administrationRegimeLevel.createMany({ data: levels });
      }
      return created;
    });
    return regime;
  }

  async activateRegime(regimeId: string, userId?: string) {
    const regime = await this.prisma.administrationRegime.findUnique({
      where: { id: regimeId },
      select: { id: true, serverId: true },
    });
    if (!regime) {
      throw new NotFoundException('Regime not found');
    }
    await this.prisma.$transaction([
      this.prisma.administrationRegime.updateMany({
        where: { serverId: regime.serverId, isActive: true },
        data: { isActive: false, updatedById: userId ?? null },
      }),
      this.prisma.administrationRegime.update({
        where: { id: regimeId },
        data: { isActive: true, updatedById: userId ?? null },
      }),
    ]);
    return { success: true };
  }

  async updateRegime(
    regimeId: string,
    dto: UpdateAdministrationRegimeDto,
    userId?: string,
  ) {
    const regime = await this.prisma.administrationRegime.findUnique({
      where: { id: regimeId },
    });
    if (!regime) {
      throw new NotFoundException('Regime not found');
    }

    const data: Prisma.AdministrationRegimeUncheckedUpdateInput = {};
    if (userId) {
      data.updatedById = userId;
    }

    if (dto.name) {
      data.name = dto.name.trim();
    }

    if (dto.levelCount !== undefined) {
      const levelCount = Number(dto.levelCount);
      if (!Number.isFinite(levelCount) || levelCount < 1) {
        throw new BadRequestException('levelCount must be greater than 0');
      }
      const maxLevel = await this.prisma.administrationDivision.aggregate({
        where: { regimeId },
        _max: { levelIndex: true },
      });
      if ((maxLevel._max.levelIndex ?? 0) > levelCount) {
        throw new BadRequestException(
          'levelCount is lower than existing divisions',
        );
      }
      data.levelCount = levelCount;
    }

    if (dto.activate === true) {
      await this.prisma.administrationRegime.updateMany({
        where: { serverId: regime.serverId, isActive: true },
        data: userId
          ? { isActive: false, updatedById: userId }
          : { isActive: false },
      });
      data.isActive = true;
    } else if (dto.activate === false) {
      data.isActive = false;
    }

    const next = await this.prisma.administrationRegime.update({
      where: { id: regimeId },
      data,
    });

    if (dto.levelCount !== undefined) {
      const targetLevelCount = Number(dto.levelCount);
      const levels = await this.prisma.administrationRegimeLevel.findMany({
        where: { regimeId },
        select: { levelIndex: true },
      });
      const currentMax =
        levels.length === 0
          ? 0
          : Math.max(...levels.map((level) => level.levelIndex));
      if (targetLevelCount > currentMax) {
        const newLevels = Array.from(
          { length: targetLevelCount - currentMax },
          (_, index) => ({
            id: randomUUID(),
            regimeId,
            levelIndex: currentMax + index + 1,
            displayName: `第${currentMax + index + 1}级行政区`,
            allowOverrideGovernance: false,
          }),
        );
        if (newLevels.length) {
          await this.prisma.administrationRegimeLevel.createMany({
            data: newLevels,
          });
        }
      }
      if (targetLevelCount < currentMax) {
        await this.prisma.administrationRegimeLevel.deleteMany({
          where: { regimeId, levelIndex: { gt: targetLevelCount } },
        });
      }
    }

    return next;
  }

  async listDivisionTypes(serverId?: string) {
    const types = await this.prisma.administrationDivisionType.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (types.length === 0) return [];

    const serverIds = Array.from(new Set(types.map((type) => type.serverId)));
    const regimes = await this.prisma.administrationRegime.findMany({
      where: { serverId: { in: serverIds }, isActive: true },
      select: { id: true, serverId: true },
    });
    if (regimes.length === 0) {
      return types.map((type) => ({ ...type, allowedLevels: [] }));
    }
    const regimeIds = regimes.map((regime) => regime.id);
    const regimeLevels = await this.prisma.administrationRegimeLevel.findMany({
      where: { regimeId: { in: regimeIds } },
      select: { id: true, regimeId: true, levelIndex: true },
    });
    const levelMap = new Map(regimeLevels.map((level) => [level.id, level]));
    const allowed =
      await this.prisma.administrationRegimeLevelAllowedType.findMany({
        where: {
          regimeLevelId: { in: regimeLevels.map((level) => level.id) },
          divisionTypeId: { in: types.map((type) => type.id) },
        },
        select: { regimeLevelId: true, divisionTypeId: true },
      });
    const typeLevelMap = new Map<string, number[]>();
    allowed.forEach((entry) => {
      const level = levelMap.get(entry.regimeLevelId);
      if (!level) return;
      const current = typeLevelMap.get(entry.divisionTypeId) ?? [];
      current.push(level.levelIndex);
      typeLevelMap.set(entry.divisionTypeId, current);
    });
    return types.map((type) => ({
      ...type,
      allowedLevels: (typeLevelMap.get(type.id) ?? []).sort((a, b) => a - b),
    }));
  }

  async updateDivisionType(
    divisionTypeId: string,
    dto: UpdateAdministrationDivisionTypeDto,
    userId?: string,
  ) {
    const divisionType =
      await this.prisma.administrationDivisionType.findUnique({
        where: { id: divisionTypeId },
      });
    if (!divisionType) {
      throw new NotFoundException('Division type not found');
    }
    const data: Prisma.AdministrationDivisionTypeUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.suffix !== undefined) data.suffix = dto.suffix.trim();
    if (dto.abbrSuffix !== undefined) {
      data.abbrSuffix = dto.abbrSuffix.trim() || null;
    }
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    data.updatedAt = new Date();
    const updated = await this.prisma.administrationDivisionType.update({
      where: { id: divisionTypeId },
      data,
    });
    if (dto.allowedLevels) {
      const regime = await this.getActiveRegime(divisionType.serverId);
      if (!regime) {
        throw new BadRequestException('Active regime not found for server');
      }
      const allowedLevels = Array.from(
        new Set(dto.allowedLevels.map((level) => Number(level))),
      ).filter((level) => Number.isFinite(level));
      if (allowedLevels.length === 0) {
        throw new BadRequestException('allowedLevels is required');
      }
      if (
        allowedLevels.some((level) => level < 1 || level > regime.levelCount)
      ) {
        throw new BadRequestException('allowedLevels out of range');
      }
      const levelMap = new Map(
        regime.levels.map((level) => [level.levelIndex, level.id]),
      );
      await this.prisma.administrationRegimeLevelAllowedType.deleteMany({
        where: {
          divisionTypeId,
          regimeLevelId: { in: regime.levels.map((level) => level.id) },
        },
      });
      await this.prisma.administrationRegimeLevelAllowedType.createMany({
        data: allowedLevels.map((level) => ({
          divisionTypeId,
          regimeLevelId: levelMap.get(level)!,
        })),
      });
    }
    return updated;
  }

  async createDivisionType(
    serverId: string,
    dto: CreateAdministrationDivisionTypeDto,
    userId?: string,
  ) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id: serverId },
      select: { id: true },
    });
    if (!server) {
      throw new BadRequestException('Server not found');
    }
    const regime = await this.getActiveRegime(serverId);
    if (!regime) {
      throw new BadRequestException('Active regime not found for server');
    }
    const name = dto.name.trim();
    const suffix = dto.suffix.trim();
    if (!name) throw new BadRequestException('name is required');
    if (!suffix) throw new BadRequestException('suffix is required');
    const allowedLevels = Array.from(
      new Set(dto.allowedLevels.map((level) => Number(level))),
    ).filter((level) => Number.isFinite(level));
    if (allowedLevels.length === 0) {
      throw new BadRequestException('allowedLevels is required');
    }
    if (allowedLevels.some((level) => level < 1 || level > regime.levelCount)) {
      throw new BadRequestException('allowedLevels out of range');
    }
    const levelMap = new Map(
      regime.levels.map((level) => [level.levelIndex, level.id]),
    );
    const created = await this.prisma.administrationDivisionType.create({
      data: {
        id: randomUUID(),
        serverId,
        name,
        suffix,
        abbrSuffix: dto.abbrSuffix?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.prisma.administrationRegimeLevelAllowedType.createMany({
      data: allowedLevels.map((level) => ({
        regimeLevelId: levelMap.get(level)!,
        divisionTypeId: created.id,
      })),
    });
    return created;
  }

  async listDivisions(serverId: string | undefined, q?: string) {
    const keyword = q?.trim();
    return this.prisma.administrationDivision.findMany({
      where: {
        ...(serverId ? { serverId } : {}),
        ...(keyword
          ? {
              OR: [
                { fullName: { contains: keyword, mode: 'insensitive' } },
                { properName: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ levelIndex: 'asc' }, { fullName: 'asc' }],
    });
  }

  async createDivision(
    serverId: string,
    dto: CreateAdministrationDivisionDto,
    userId?: string,
  ) {
    const regime = await this.getActiveRegime(serverId);
    if (!regime) {
      throw new BadRequestException('Active regime not found for server');
    }

    const type = await this.prisma.administrationDivisionType.findFirst({
      where: { id: dto.divisionTypeId, serverId },
    });
    if (!type) {
      throw new BadRequestException('Division type not found');
    }

    const properName = dto.properName.trim();
    if (!properName) {
      throw new BadRequestException('properName is required');
    }

    let parent: AdministrationDivision | null = null;
    let levelIndex = dto.levelIndex ? Number(dto.levelIndex) : null;
    if (dto.parentId) {
      parent = await this.prisma.administrationDivision.findFirst({
        where: { id: dto.parentId, serverId },
      });
      if (!parent) {
        throw new BadRequestException('parentId not found');
      }
      if (parent.regimeId !== regime.id) {
        throw new BadRequestException('parentId belongs to inactive regime');
      }
      levelIndex = parent.levelIndex + 1;
    }
    if (!levelIndex || !Number.isFinite(levelIndex)) {
      throw new BadRequestException('levelIndex is required');
    }
    if (levelIndex < 1 || levelIndex > regime.levelCount) {
      throw new BadRequestException('levelIndex out of range');
    }
    if (!parent && levelIndex !== 1) {
      throw new BadRequestException('root division must be level 1');
    }
    if (parent && parent.levelIndex !== levelIndex - 1) {
      throw new BadRequestException('parent level does not match');
    }
    const level = await this.prisma.administrationRegimeLevel.findFirst({
      where: { regimeId: regime.id, levelIndex },
      select: { id: true },
    });
    if (!level) {
      throw new BadRequestException('regime level not found');
    }
    const allowed =
      await this.prisma.administrationRegimeLevelAllowedType.findFirst({
        where: { regimeLevelId: level.id, divisionTypeId: type.id },
        select: { regimeLevelId: true },
      });
    if (!allowed) {
      throw new BadRequestException('division type not allowed for this level');
    }

    const id = randomUUID();
    const fullName = `${properName}${type.suffix}`;
    const abbrName = type.abbrSuffix ? `${properName}${type.abbrSuffix}` : null;
    const pathIds = parent?.pathIds ? `${parent.pathIds}${id}/` : `/${id}/`;

    return this.prisma.administrationDivision.create({
      data: {
        id,
        serverId,
        regimeId: regime.id,
        levelIndex,
        divisionTypeId: type.id,
        properName,
        fullName,
        abbrName,
        parentId: parent?.id ?? null,
        governanceMode: 'INHERIT',
        governanceModelCodeEffective: null,
        status: 'ACTIVE',
        pathIds,
        createdById: userId ?? null,
        updatedById: userId ?? null,
      },
    });
  }

  async updateDivision(
    divisionId: string,
    dto: UpdateAdministrationDivisionDto,
    userId?: string,
  ) {
    const division = await this.prisma.administrationDivision.findUnique({
      where: { id: divisionId },
    });
    if (!division) {
      throw new NotFoundException('Division not found');
    }
    const type = await this.prisma.administrationDivisionType.findFirst({
      where: {
        id: dto.divisionTypeId ?? division.divisionTypeId,
        serverId: division.serverId,
      },
    });
    if (!type) {
      throw new BadRequestException('Division type not found');
    }
    const level = await this.prisma.administrationRegimeLevel.findFirst({
      where: { regimeId: division.regimeId, levelIndex: division.levelIndex },
      select: { id: true },
    });
    if (!level) {
      throw new BadRequestException('regime level not found');
    }
    const allowed =
      await this.prisma.administrationRegimeLevelAllowedType.findFirst({
        where: { regimeLevelId: level.id, divisionTypeId: type.id },
        select: { regimeLevelId: true },
      });
    if (!allowed) {
      throw new BadRequestException('division type not allowed for this level');
    }
    const properName = dto.properName?.trim() ?? division.properName;
    if (!properName) {
      throw new BadRequestException('properName is required');
    }
    const fullName = `${properName}${type.suffix}`;
    const abbrName = type.abbrSuffix ? `${properName}${type.abbrSuffix}` : null;
    return this.prisma.administrationDivision.update({
      where: { id: divisionId },
      data: {
        properName,
        fullName,
        abbrName,
        divisionTypeId: type.id,
        updatedById: userId ?? null,
      },
    });
  }

  async deleteDivision(divisionId: string) {
    const children = await this.prisma.administrationDivision.findFirst({
      where: { parentId: divisionId },
      select: { id: true },
    });
    if (children) {
      throw new BadRequestException('Division has children');
    }
    await this.prisma.administrationDivision.delete({
      where: { id: divisionId },
    });
  }

  async searchDivisions(serverId: string, query: DivisionSearchDto) {
    const keyword = query.q?.trim();
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 20;
    const nodes = await this.prisma.administrationDivision.findMany({
      where: {
        serverId,
        status: 'ACTIVE',
        ...(query.level ? { levelIndex: query.level } : {}),
        ...(query.parentId ? { parentId: query.parentId } : {}),
        ...(keyword
          ? {
              fullName: { contains: keyword, mode: 'insensitive' },
            }
          : {}),
      },
      orderBy: [{ levelIndex: 'asc' }, { fullName: 'asc' }],
      take: limit,
    });
    return nodes.map((n) => ({
      id: n.id,
      name: n.fullName,
      level: n.levelIndex,
      parentId: n.parentId ?? null,
    }));
  }

  async getDivisionPath(serverId: string, divisionId: string) {
    const division = await this.prisma.administrationDivision.findFirst({
      where: { id: divisionId, serverId },
    });
    if (!division) {
      throw new NotFoundException('Division not found');
    }
    const ids = division.pathIds
      .split('/')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    if (!ids.length) {
      return [];
    }
    const nodes = await this.prisma.administrationDivision.findMany({
      where: { id: { in: ids } },
      orderBy: { levelIndex: 'asc' },
    });
    return nodes.map((n) => ({
      id: n.id,
      name: n.fullName,
      level: n.levelIndex,
      parentId: n.parentId ?? null,
    }));
  }

  async getDivisionById(serverId: string, divisionId: string) {
    const division = await this.prisma.administrationDivision.findFirst({
      where: { id: divisionId, serverId },
      select: {
        id: true,
        fullName: true,
        levelIndex: true,
        parentId: true,
      },
    });
    if (!division) {
      throw new NotFoundException('Division not found');
    }
    return division;
  }

  async getDivisionServerId(divisionId: string) {
    const division = await this.prisma.administrationDivision.findUnique({
      where: { id: divisionId },
      select: { serverId: true },
    });
    if (!division) {
      throw new NotFoundException('Division not found');
    }
    return division.serverId;
  }
}
