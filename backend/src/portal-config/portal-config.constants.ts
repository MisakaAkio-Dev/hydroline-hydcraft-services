import type {
  PortalCardRegistryEntry,
  PortalHomeConfig,
} from './portal-config.types';

export const PORTAL_CONFIG_NAMESPACE = 'portal.home';
export const PORTAL_CONFIG_ENTRY_KEY = 'config';

export const PORTAL_CARD_REGISTRY: PortalCardRegistryEntry[] = [
  {
    id: 'profile',
    name: '个人资料',
    description: '查看账户基本信息与 Minecraft 关联记录。',
  },
  {
    id: 'server-status',
    name: '服务器状态',
    description: '实时了解服务器在线人数与运行状态。',
  },
  {
    id: 'tasks',
    name: '任务队列',
    description: '跟进待办事项与自动化任务进度。',
  },
  {
    id: 'documents',
    name: '文档中心',
    description: '访问知识文档与指南资源。',
  },
];

export const DEFAULT_PORTAL_HOME_CONFIG: PortalHomeConfig = {
  hero: {
    subtitle: 'ALPHA 测试阶段',
    backgrounds: [],
  },
  navigation: [],
  cards: {
    profile: {
      enabled: true,
      allowedRoles: [],
      allowedUsers: [],
      allowGuests: false,
    },
    'server-status': {
      enabled: false,
      allowedRoles: [],
      allowedUsers: [],
      allowGuests: false,
    },
    tasks: {
      enabled: false,
      allowedRoles: [],
      allowedUsers: [],
      allowGuests: false,
    },
    documents: {
      enabled: false,
      allowedRoles: [],
      allowedUsers: [],
      allowGuests: false,
    },
  },
};
