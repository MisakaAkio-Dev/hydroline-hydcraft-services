import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HydrolineBeaconPoolService } from './pool.service';

interface BeaconServerRecord {
  id: string;
  beaconEnabled?: boolean | null;
  beaconEndpoint?: string | null;
  beaconKey?: string | null;
  beaconRequestTimeoutMs?: number | null;
  beaconMaxRetry?: number | null;
  updatedAt: Date | string;
}

@Injectable()
export class BeaconLibService implements OnModuleInit {
  private readonly logger = new Logger('BeaconService');
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: HydrolineBeaconPoolService,
  ) {}

  async onModuleInit() {
    await this.refreshAll();
  }

  async refreshAll() {
    const servers = await this.prisma.minecraftServer.findMany({
      where: { beaconEnabled: true },
      select: {
        id: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        updatedAt: true,
      },
    });
    let created = 0;
    for (const s of servers) {
      if (this.isUsableConfig(s)) {
        this.pool.getOrCreate({
          serverId: s.id,
          endpoint: s.beaconEndpoint!,
          key: s.beaconKey!,
          timeoutMs: s.beaconRequestTimeoutMs ?? undefined,
          maxRetry: s.beaconMaxRetry ?? undefined,
        });
        created += 1;
      }
    }
    this.logger.log(`Beacon connection pool refreshed (${created} active)`);
  }

  async refreshForServer(id: string) {
    const s = await this.prisma.minecraftServer.findUnique({
      where: { id },
      select: {
        id: true,
        beaconEnabled: true,
        beaconEndpoint: true,
        beaconKey: true,
        beaconRequestTimeoutMs: true,
        beaconMaxRetry: true,
        updatedAt: true,
      },
    });
    if (!s) return;
    if (!this.isUsableConfig(s)) {
      this.pool.remove(s.id);
      this.logger.warn(
        `Beacon config unusable; removed connection serverId=${s.id}`,
      );
      return;
    }
    this.pool.getOrCreate({
      serverId: s.id,
      endpoint: s.beaconEndpoint!,
      key: s.beaconKey!,
      timeoutMs: s.beaconRequestTimeoutMs ?? undefined,
      maxRetry: s.beaconMaxRetry ?? undefined,
    });
    this.logger.log(`Beacon connection ensured serverId=${s.id}`);
  }

  private isUsableConfig(s: BeaconServerRecord): boolean {
    if (!s.beaconEnabled) return false;
    if (!s.beaconEndpoint || !s.beaconKey) return false;
    return true;
  }
}
