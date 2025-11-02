import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from './config.service';

const PORTAL_NAV_NAMESPACE = 'portal.navigation';
const PORTAL_DEFAULT_ENTRIES = [
  {
    key: 'map_six',
    label: '地图（六周目）',
    tooltip: 'HydCraft 六周目地图浏览',
    url: null,
    available: false,
  },
  {
    key: 'map_seven',
    label: '地图（七周目）',
    tooltip: 'HydCraft 七周目地图浏览',
    url: null,
    available: false,
  },
  {
    key: 'wiki',
    label: '知识库（Wiki）',
    tooltip: 'HydCraft 知识库',
    url: null,
    available: false,
  },
];

@Injectable()
export class ConfigBootstrap implements OnModuleInit {
  private readonly logger = new Logger(ConfigBootstrap.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      const namespace = await this.configService.ensureNamespaceByKey(PORTAL_NAV_NAMESPACE, {
        name: 'Portal Navigation Links',
        description: '站点首页导航按钮配置',
      });

      const existingEntries = await this.configService.listEntries(namespace.id);
      const existingKeys = new Set(existingEntries.map((entry) => entry.key));

      for (const entry of PORTAL_DEFAULT_ENTRIES) {
        if (existingKeys.has(entry.key)) {
          continue;
        }
        await this.configService.createEntry(namespace.id, {
          key: entry.key,
          value: {
            label: entry.label,
            tooltip: entry.tooltip,
            url: entry.url,
            available: entry.available,
          },
        });
      }
    } catch (error) {
      this.logger.warn(`Skip config bootstrap: ${String(error)}`);
    }
  }
}
