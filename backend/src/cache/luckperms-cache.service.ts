import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LuckpermsPlayer } from '../luckperms/luckperms.interfaces';

type LuckpermsPlayerCacheRecord = Prisma.LuckpermsPlayerCacheGetPayload<{}>;

@Injectable()
export class LuckpermsCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlayerByUuid(
    uuid?: string | null,
  ): Promise<LuckpermsPlayerCacheRecord | null> {
    if (!uuid) {
      return null;
    }
    return this.prisma.luckpermsPlayerCache.findUnique({
      where: { uuid },
    });
  }

  async getPlayerByUsername(
    username?: string | null,
  ): Promise<LuckpermsPlayerCacheRecord | null> {
    const key = this.normalizeUsername(username);
    if (!key) {
      return null;
    }
    return this.prisma.luckpermsPlayerCache.findFirst({
      where: { usernameLower: key },
      orderBy: { syncedAt: 'desc' },
    });
  }

  async upsertPlayers(players: LuckpermsPlayer[]) {
    if (!players.length) {
      return;
    }
    const payloads = new Map<
      string,
      Prisma.LuckpermsPlayerCacheCreateManyInput
    >();
    for (const player of players) {
      const normalized = this.normalizeUsername(player.username);
      if (!normalized) {
        continue;
      }
      const groupsPayload = JSON.parse(
        JSON.stringify(player.groups ?? []),
      ) as Prisma.InputJsonValue;
      payloads.set(player.uuid, {
        uuid: player.uuid,
        usernameLower: normalized,
        primaryGroup: player.primaryGroup,
        groups: groupsPayload,
        syncedAt: new Date(),
      });
    }
    if (payloads.size === 0) {
      return;
    }
    const batch = Array.from(payloads.values());
    const uuids = batch.map((payload) => payload.uuid);
    const usernameLowers = batch.map((payload) => payload.usernameLower);
    await this.prisma.$transaction(async (tx) => {
      await tx.luckpermsPlayerCache.deleteMany({
        where: {
          OR: [
            { uuid: { in: uuids } },
            { usernameLower: { in: usernameLowers } },
          ],
        },
      });
      await tx.luckpermsPlayerCache.createMany({ data: batch });
    });
  }

  async getLastSyncedAt(): Promise<Date | null> {
    const record = await this.prisma.luckpermsPlayerCache.findFirst({
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });
    return record?.syncedAt ?? null;
  }

  private normalizeUsername(value?: string | null) {
    if (!value) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
}
