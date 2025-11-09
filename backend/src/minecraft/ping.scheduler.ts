import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MinecraftService } from './minecraft.service';
import { MinecraftServerEdition } from '@prisma/client';

@Injectable()
export class MinecraftPingScheduler implements OnModuleInit {
  private readonly logger = new Logger(MinecraftPingScheduler.name);
  private intervalName = 'minecraft-ping-interval';

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    private readonly minecraft: MinecraftService,
  ) {}

  // 与服务一致：移除字符串中的 NUL，避免 Postgres 22P05
  private sanitizeForPg(input: unknown): unknown {
    if (input == null) return input;
    if (typeof input === 'string') {
      let out = '';
      for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        if (ch === 0) continue;
        out += input[i];
      }
      return out;
    }
    if (Array.isArray(input)) return input.map((v) => this.sanitizeForPg(v));
    if (typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = this.sanitizeForPg(v);
      }
      return out;
    }
    return input;
  }

  async onModuleInit() {
    const settings = await this.getSettings();
    this.setupInterval(settings.intervalMinutes);
  }

  async getSettings() {
    let s = await this.prisma.minecraftPingSettings.findFirst();
    if (!s) {
      s = await this.prisma.minecraftPingSettings.create({
        data: { intervalMinutes: 5, retentionDays: 30 },
      });
    }
    return s;
  }

  async updateSettings(partial: {
    intervalMinutes?: number;
    retentionDays?: number;
  }) {
    const current = await this.getSettings();
    const next = await this.prisma.minecraftPingSettings.update({
      where: { id: current.id },
      data: {
        intervalMinutes: partial.intervalMinutes ?? current.intervalMinutes,
        retentionDays: partial.retentionDays ?? current.retentionDays,
      },
    });
    if (partial.intervalMinutes !== undefined) {
      this.setupInterval(next.intervalMinutes);
    }
    return next;
  }

  setupInterval(minutes: number) {
    // 清理旧的 interval
    try {
      const old = this.scheduler.getInterval(this.intervalName);
      if (old) clearInterval(old);
      this.scheduler.deleteInterval(this.intervalName);
    } catch {}

    const ms = Math.max(1, minutes) * 60 * 1000;
    const handler = setInterval(() => {
      void this.pingAllActiveSafely();
    }, ms);
    this.scheduler.addInterval(this.intervalName, handler);
    this.logger.log(`Auto ping interval set to ${minutes} minutes`);
  }

  private async pingAllActiveSafely() {
    const servers = await this.prisma.minecraftServer.findMany({
      where: { isActive: true },
    });
    for (const s of servers) {
      try {
        const res = await this.minecraft.pingServer({
          host: s.host,
          port:
            s.port ??
            (s.edition === MinecraftServerEdition.BEDROCK ? 19132 : 25565),
          edition: s.edition,
        });
        const safeRaw = this.sanitizeForPg(res.response) as any;
        const safeMotd =
          res.edition === 'BEDROCK'
            ? ((this.sanitizeForPg((res.response as any).motd) as
                | string
                | null
                | undefined) ?? null)
            : undefined;
        await this.prisma.minecraftServerPingRecord.create({
          data: {
            serverId: s.id,
            edition: res.edition,
            latency: res.response.latency ?? null,
            onlinePlayers: res.response.players?.online ?? null,
            maxPlayers: res.response.players?.max ?? null,
            motd: safeMotd,
            raw: safeRaw,
          },
        });
      } catch (e) {
        // 仅保存失败占位，不抛到控制台
        await this.prisma.minecraftServerPingRecord.create({
          data: {
            serverId: s.id,
            edition: s.edition,
            latency: null,
            onlinePlayers: null,
            maxPlayers: null,
            motd: null,
            raw: { error: (e as Error).message },
          },
        });
      }
    }
  }

  // 每天 03:30 清理过期数据
  @Cron('30 3 * * *')
  async cleanupOldRecords() {
    const s = await this.getSettings();
    const since = new Date(Date.now() - s.retentionDays * 24 * 60 * 60 * 1000);
    const r = await this.prisma.minecraftServerPingRecord.deleteMany({
      where: { createdAt: { lt: since } },
    });
    this.logger.log(
      `Cleaned ${r.count} old ping records (older than ${s.retentionDays} days)`,
    );
  }
}
