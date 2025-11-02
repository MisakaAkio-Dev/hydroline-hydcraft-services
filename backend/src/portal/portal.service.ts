import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { ConfigService } from '../config/config.service';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';

type HomeNavigationLink = {
  id: string;
  label: string;
  tooltip: string;
  url: string | null;
  available: boolean;
};

@Injectable()
export class PortalService implements OnModuleInit {
  private readonly logger = new Logger(PortalService.name);
  private heroAsset:
    | {
        id: string;
        url: string | null;
        name: string;
        description?: string | null;
      }
    | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureHeroAsset();
    } catch (error) {
      this.logger.warn(`Skip hero asset seeding: ${String(error)}`);
    }
  }

  async getHomePortal(userId?: string) {
    if (!this.heroAsset) {
      try {
        await this.ensureHeroAsset();
      } catch (error) {
        this.logger.warn(`Hero asset unavailable: ${String(error)}`);
      }
    }

    let userSnapshot: Awaited<ReturnType<typeof this.getUserSnapshot>> | null = null;
    if (userId) {
      try {
        userSnapshot = await this.getUserSnapshot(userId);
      } catch (error) {
        this.logger.warn(`Failed to load user snapshot ${userId}: ${String(error)}`);
      }
    }
    const navigation = await this.getHomeNavigation();
    const cards = await this.composeHomeCards(userSnapshot);

    return {
      hero: {
        title: 'Hydroline',
        subtitle: 'ALPHA 测试阶段',
        background: this.heroAsset
          ? {
              imageUrl: this.heroAsset.url,
              description: this.heroAsset.description ?? '欧文',
            }
          : null,
      },
      header: {
        idleTitle: this.heroAsset?.description ?? '新城影像',
        activeTitle: 'Hydroline',
      },
      navigation,
      cards,
      user: userSnapshot,
      theme: {
        modes: ['light', 'dark', 'system'],
        defaultMode: 'system',
      },
      messages: [],
    };
  }

  async getAdminOverview() {
    try {
      const users = await this.prisma.user.findMany({
        include: {
          profile: {
            include: {
              primaryMinecraftProfile: true,
            },
          },
          minecraftIds: true,
          roles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      });

      const attachmentsCount = await this.prisma.attachment.count({
        where: { deletedAt: null },
      });

      const recentAttachments = await this.prisma.attachment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
          folder: { select: { id: true, name: true, path: true } },
        },
      });

      return {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
        createdAt: user.createdAt,
        profile: user.profile
          ? {
              displayName: user.profile.displayName ?? null,
              piic: user.profile.piic ?? null,
              primaryMinecraft: user.profile.primaryMinecraftProfile
                ? {
                    id: user.profile.primaryMinecraftProfile.id,
                    minecraftId: user.profile.primaryMinecraftProfile.minecraftId,
                    nickname: user.profile.primaryMinecraftProfile.nickname,
                  }
                : null,
            }
          : null,
        minecraftProfiles: user.minecraftIds.map((profile) => ({
          id: profile.id,
          minecraftId: profile.minecraftId,
          nickname: profile.nickname,
          isPrimary: profile.isPrimary,
        })),
        roles: user.roles.map(({ role }) => ({
          id: role.id,
          key: role.key,
          name: role.name,
        })),
      })),
        attachments: {
          total: attachmentsCount,
          recent: recentAttachments.map((item) => ({
            id: item.id,
            name: item.name,
            isPublic: item.isPublic,
          size: item.size,
          createdAt: item.createdAt,
          owner: item.owner,
          folder: item.folder
            ? {
                id: item.folder.id,
                name: item.folder.name,
                path: item.folder.path,
              }
            : null,
          tags: item.tags.map((tag) => ({
            id: tag.tag.id,
            key: tag.tag.key,
            name: tag.tag.name,
          })),
          publicUrl: item.isPublic ? `/attachments/public/${item.id}` : null,
        })),
        },
        unlinkedPlayers: [],
      };
    } catch (error) {
      this.logger.warn(`Admin overview fallback: ${String(error)}`);
      return {
        users: [],
        attachments: { total: 0, recent: [] },
        unlinkedPlayers: [],
      };
    }
  }

  private async composeHomeCards(userSnapshot: Awaited<ReturnType<typeof this.getUserSnapshot>> | null) {
    const cards: unknown[] = [];
    if (userSnapshot) {
      cards.push({
        id: 'profile',
        kind: 'profile',
        title: '个人资料',
        status: 'active',
        payload: {
          displayName: userSnapshot.displayName,
          email: userSnapshot.email,
          piic: userSnapshot.piic,
          minecraft: userSnapshot.primaryMinecraft,
          roles: userSnapshot.roles,
          avatarUrl: userSnapshot.avatarUrl,
          joinedAt: userSnapshot.createdAt,
        },
      });
    } else {
      cards.push({
        id: 'profile-guest',
        kind: 'profile',
        title: '个人资料',
        status: 'requires-auth',
      });
    }

    cards.push(
      {
        id: 'server-status',
        kind: 'placeholder',
        title: '服务器状态',
        status: 'locked',
      },
      {
        id: 'tasks',
        kind: 'placeholder',
        title: '任务队列',
        status: 'locked',
      },
      {
        id: 'documents',
        kind: 'placeholder',
        title: '文档中心',
        status: 'locked',
      },
    );

    return cards;
  }

  private async getUserSnapshot(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          include: { primaryMinecraftProfile: true },
        },
        minecraftIds: true,
        roles: {
          include: { role: true },
        },
        uploadedAttachments: {
          where: {
            deletedAt: null,
            tags: {
              some: {
                tag: {
                  key: 'profile.avatar',
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!user) {
      return null;
    }

    const avatar = user.uploadedAttachments[0];
    const primaryMinecraft =
      user.profile?.primaryMinecraftProfile ??
      user.minecraftIds.find((profile) => profile.isPrimary) ??
      user.minecraftIds[0] ??
      null;

    return {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? user.name ?? user.email,
      name: user.name,
      piic: user.profile?.piic ?? null,
      createdAt: user.createdAt,
      roles: user.roles.map(({ role }) => ({
        id: role.id,
        key: role.key,
        name: role.name,
      })),
      primaryMinecraft: primaryMinecraft
        ? {
            id: primaryMinecraft.id,
            minecraftId: primaryMinecraft.minecraftId,
            nickname: primaryMinecraft.nickname,
          }
        : null,
      avatarUrl: avatar
        ? avatar.isPublic
          ? `/attachments/public/${avatar.id}`
          : null
        : user.image ?? null,
    };
  }

  private async ensureHeroAsset() {
    const assetPath = join(
      process.cwd(),
      '..',
      'frontend',
      'src',
      'assets',
      'images',
      'image_home_background_240730.webp',
    );
    try {
      await fs.access(assetPath);
    } catch {
      this.logger.warn(`Hero background asset missing at ${assetPath}`);
      return;
    }

    try {
      const asset = await this.attachmentsService.ensureSeededAttachment({
        seedKey: 'hero.home.240730',
        filePath: assetPath,
        fileName: 'image_home_background_240730.webp',
        folderPath: ['Public', 'Landing'],
        tagKeys: ['hero.home'],
        isPublic: true,
        description: '欧文',
      });
      if (asset) {
        this.heroAsset = {
          id: asset.id,
          url: asset.publicUrl,
          name: asset.name,
          description: (asset.metadata as Record<string, unknown> | undefined)?.description as string | undefined,
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to seed hero asset in attachments: ${String(error)}`);
    }
  }

  private async getHomeNavigation(): Promise<HomeNavigationLink[]> {
    try {
      const entries = await this.configService.getEntriesByNamespaceKey('portal.navigation');
      if (entries.length === 0) {
        return this.getDefaultNavigation();
      }
      const links = entries
        .map<HomeNavigationLink | null>((entry) => {
          const payload = entry.value as Record<string, unknown> | null;
          if (!payload || typeof payload !== 'object') {
            return null;
          }
          const id = String(entry.key);
          const label = typeof payload.label === 'string' ? payload.label : entry.key;
          const tooltip = typeof payload.tooltip === 'string' ? payload.tooltip : '';
          const url = typeof payload.url === 'string' ? payload.url : null;
          const available = typeof payload.available === 'boolean' ? payload.available : Boolean(url);
          return {
            id,
            label,
            tooltip,
            url,
            available,
          } satisfies HomeNavigationLink;
        })
        .filter((item): item is HomeNavigationLink => Boolean(item));
      if (links.length === 0) {
        return this.getDefaultNavigation();
      }
      return links;
    } catch (error) {
      this.logger.warn(`Failed to load portal navigation config: ${String(error)}`);
      return this.getDefaultNavigation();
    }
  }

  private getDefaultNavigation(): HomeNavigationLink[] {
    return [
      {
        id: 'map-six',
        label: '地图（六周目）',
        tooltip: 'HydCraft 六周目地图浏览',
        url: null,
        available: false,
      },
      {
        id: 'map-seven',
        label: '地图（七周目）',
        tooltip: 'HydCraft 七周目地图浏览',
        url: null,
        available: false,
      },
      {
        id: 'wiki',
        label: '知识库（Wiki）',
        tooltip: 'HydCraft 知识库',
        url: null,
        available: false,
      },
    ];
  }
}
