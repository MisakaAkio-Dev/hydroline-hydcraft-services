import { Injectable, NotFoundException } from '@nestjs/common';
import { MinecraftServerEdition, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMinecraftServerDto } from './dto/create-minecraft-server.dto';
import { UpdateMinecraftServerDto } from './dto/update-minecraft-server.dto';
import { MinecraftService } from './minecraft.service';
import { PingMinecraftRequestDto } from './dto/ping-minecraft.dto';

@Injectable()
export class MinecraftServerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minecraftService: MinecraftService,
  ) {}

  listServers(params: { keyword?: string } = {}) {
    const where: Prisma.MinecraftServerWhereInput | undefined = params.keyword
      ? {
          OR: [
            {
              displayName: {
                contains: params.keyword,
                mode: 'insensitive',
              },
            },
            {
              internalCodeCn: {
                contains: params.keyword,
                mode: 'insensitive',
              },
            },
            {
              internalCodeEn: {
                contains: params.keyword,
                mode: 'insensitive',
              },
            },
          ],
        }
      : undefined;

    return this.prisma.minecraftServer.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getServerById(id: string) {
    const server = await this.prisma.minecraftServer.findUnique({
      where: { id },
    });
    if (!server) {
      throw new NotFoundException('服务器不存在');
    }
    return server;
  }

  async createServer(dto: CreateMinecraftServerDto, actorId?: string) {
    const payload = this.toCreatePayload(dto, actorId);
    return this.prisma.minecraftServer.create({ data: payload });
  }

  async updateServer(
    id: string,
    dto: UpdateMinecraftServerDto,
    actorId?: string,
  ) {
    await this.getServerById(id);
    const payload = this.toUpdatePayload(dto, actorId);
    return this.prisma.minecraftServer.update({
      where: { id },
      data: payload,
    });
  }

  async deleteServer(id: string) {
    await this.getServerById(id);
    await this.prisma.minecraftServer.delete({ where: { id } });
    return { success: true };
  }

  async pingManagedServer(id: string) {
    const server = await this.getServerById(id);
    const pingInput: PingMinecraftRequestDto = {
      host: server.host,
      port:
        server.port ??
        (server.edition === MinecraftServerEdition.BEDROCK ? 19132 : 25565),
      edition: server.edition,
    };
    const result = await this.minecraftService.pingServer(pingInput);
    return {
      server,
      edition: result.edition,
      response: result.response,
    };
  }

  private toCreatePayload(
    dto: CreateMinecraftServerDto,
    actorId?: string,
  ): Prisma.MinecraftServerCreateInput {
    return {
      displayName: dto.displayName,
      internalCodeCn: this.normalizeCode(dto.internalCodeCn),
      internalCodeEn: this.normalizeCode(dto.internalCodeEn),
      host: dto.host,
      port: dto.port,
      edition: dto.edition ?? MinecraftServerEdition.JAVA,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
      displayOrder: dto.displayOrder ?? 0,
      metadata:
        dto.metadata !== undefined
          ? (dto.metadata as Prisma.InputJsonValue)
          : undefined,
      createdBy: actorId ? { connect: { id: actorId } } : undefined,
      updatedBy: actorId ? { connect: { id: actorId } } : undefined,
    };
  }

  private toUpdatePayload(
    dto: UpdateMinecraftServerDto,
    actorId?: string,
  ): Prisma.MinecraftServerUpdateInput {
    const payload: Prisma.MinecraftServerUpdateInput = {
      updatedBy: actorId ? { connect: { id: actorId } } : undefined,
    };
    if (dto.displayName !== undefined) {
      payload.displayName = dto.displayName;
    }
    if (dto.internalCodeCn !== undefined) {
      payload.internalCodeCn = this.normalizeCode(dto.internalCodeCn);
    }
    if (dto.internalCodeEn !== undefined) {
      payload.internalCodeEn = this.normalizeCode(dto.internalCodeEn);
    }
    if (dto.host !== undefined) {
      payload.host = dto.host;
    }
    if (dto.port !== undefined) {
      payload.port = dto.port;
    }
    if (dto.edition !== undefined) {
      payload.edition = dto.edition;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      payload.isActive = dto.isActive;
    }
    if (dto.displayOrder !== undefined) {
      payload.displayOrder = dto.displayOrder;
    }
    if (dto.metadata !== undefined) {
      payload.metadata = dto.metadata as Prisma.InputJsonValue;
    }
    return payload;
  }

  private normalizeCode(value: string) {
    return value.trim();
  }
}
