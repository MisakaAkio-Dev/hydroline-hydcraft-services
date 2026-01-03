import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { registerAuthGuards } from './guards/auth'
import { setDocumentTitle } from '@/utils/route/document-title'

export const userRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/user/UserShell.vue'),
    meta: { layout: 'user' },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/user/Home/HomeView.vue'),
        meta: { layout: 'user', title: '仪表盘', icon: 'i-lucide-home' },
      },
      {
        path: 'player/name/:playerName',
        name: 'player.name',
        component: () => import('@/views/user/Player/PlayerView.vue'),
        meta: {
          layout: 'user',
          title: '玩家档案',
          icon: 'i-lucide-user-round',
        },
      },
      {
        path: 'player/:playerId?',
        name: 'player',
        component: () => import('@/views/user/Player/PlayerView.vue'),
        meta: {
          layout: 'user',
          title: '玩家档案',
          icon: 'i-lucide-user-round',
        },
      },
      {
        path: 'rank',
        name: 'rank',
        component: () => import('@/views/user/Rank/RankView.vue'),
        meta: {
          layout: 'user',
          title: '排行榜',
          icon: 'i-lucide-trophy',
        },
      },
      {
        path: 'rank/top',
        name: 'rank.top',
        component: () => import('@/views/user/Rank/RankTopView.vue'),
        meta: {
          layout: 'user',
          title: '指标榜单',
          icon: 'i-lucide-line-chart',
        },
      },
      {
        path: 'server',
        name: 'server',
        component: () => import('@/views/user/Server/ServerStatusView.vue'),
        meta: {
          layout: 'user',
          title: '服务器状态',
          icon: 'i-lucide-server',
        },
      },
      {
        path: 'company',
        component: () => import('@/views/user/Company/CompanyLayout.vue'),
        meta: {
          layout: 'user',
          title: '工商系统',
          icon: 'i-lucide-building-2',
        },
        children: [
          {
            path: '',
            name: 'company.overview',
            component: () =>
              import('@/views/user/Company/CompanyOverviewView.vue'),
            meta: { title: '工商概览' },
          },
          {
            path: 'dashboard',
            name: 'company.dashboard',
            component: () =>
              import('@/views/user/Company/CompanyDashboardView.vue'),
            meta: {
              requiresAuth: true,
              title: '管理控制台',
            },
          },
          {
            path: 'dashboard/owned',
            name: 'company.dashboard.owned',
            // 旧“公司成员/岗位角色（OWNER/LEGAL_PERSON/...）”体系已移除：
            // 这里保留路由名用于兼容旧链接，但重定向到 LLC 体系的“法定代表人主体列表”。
            redirect: { name: 'company.dashboard.legalRepresentative' },
            meta: {
              requiresAuth: true,
              title: '我的公司',
            },
          },
          {
            path: 'dashboard/join',
            name: 'company.dashboard.join',
            // 旧“加入公司（成员系统）”入口已废弃，改为跳转到公司名录。
            redirect: { name: 'company.database' },
            meta: {
              requiresAuth: true,
              title: '加入公司',
            },
          },
          {
            path: 'dashboard/applications',
            name: 'company.dashboard.applications',
            component: () =>
              import('@/views/user/Company/CompanyApplicationsProgressView.vue'),
            meta: {
              requiresAuth: true,
              title: '我的申请/待同意',
            },
          },
          {
            path: 'dashboard/registry-applications',
            name: 'company.dashboard.registryApplications',
            component: () =>
              import('@/views/user/Company/CompanyRegistryApplicationsView.vue'),
            meta: {
              requiresAuth: true,
              title: '登记机关审批',
            },
          },
          {
            path: 'dashboard/legal-representative',
            name: 'company.dashboard.legalRepresentative',
            component: () =>
              import('@/views/user/Company/CompanyRoleEntityListView.vue'),
            meta: {
              requiresAuth: true,
              title: '由您担任法定代表人的民事主体',
              roleKey: 'legalRepresentative',
            },
          },
          {
            path: 'dashboard/shareholding',
            name: 'company.dashboard.shareholding',
            component: () =>
              import('@/views/user/Company/CompanyRoleEntityListView.vue'),
            meta: {
              requiresAuth: true,
              title: '由您持股的民事主体',
              roleKey: 'shareholding',
            },
          },
          {
            path: 'dashboard/director',
            name: 'company.dashboard.director',
            component: () =>
              import('@/views/user/Company/CompanyRoleEntityListView.vue'),
            meta: {
              requiresAuth: true,
              title: '由您担任董事的民事主体',
              roleKey: 'director',
            },
          },
          {
            path: 'dashboard/manager',
            name: 'company.dashboard.manager',
            component: () =>
              import('@/views/user/Company/CompanyRoleEntityListView.vue'),
            meta: {
              requiresAuth: true,
              title: '由您担任经理（包含副经理）的民事主体',
              roleKey: 'manager',
            },
          },
          {
            path: 'dashboard/supervisor',
            name: 'company.dashboard.supervisor',
            component: () =>
              import('@/views/user/Company/CompanyRoleEntityListView.vue'),
            meta: {
              requiresAuth: true,
              title: '由您担任监事的民事主体',
              roleKey: 'supervisor',
            },
          },
          {
            path: 'dashboard/financial-officer',
            name: 'company.dashboard.financialOfficer',
            component: () =>
              import('@/views/user/Company/CompanyRoleEntityListView.vue'),
            meta: {
              requiresAuth: true,
              title: '由您担任财务负责人的民事主体',
              roleKey: 'financialOfficer',
            },
          },
          {
            path: 'database',
            name: 'company.database',
            component: () =>
              import('@/views/user/Company/CompanyDatabaseView.vue'),
            meta: { title: '公司名录' },
          },
          {
            path: 'database/:companyId',
            name: 'company.database.detail',
            component: () =>
              import('@/views/user/Company/CompanyDatabaseDetailView.vue'),
            meta: { title: '公司详情' },
          },
        ],
      },
      {
        path: 'transportation',
        component: () =>
          import('@/views/user/Transportation/TransportationLayout.vue'),
        meta: {
          layout: 'user',
          title: '交通系统',
          icon: 'i-lucide-train-front',
        },
        children: [
          {
            path: '',
            redirect: { name: 'transportation.railway' },
          },
          {
            path: 'railway',
            name: 'transportation.railway',
            component: () =>
              import('@/views/user/Transportation/RailwayOverviewView.vue'),
            meta: { title: '铁路总览' },
          },
          {
            path: 'railway/routes',
            name: 'transportation.railway.routes',
            component: () =>
              import('@/views/user/Transportation/RailwayRouteListView.vue'),
            meta: { title: '线路列表' },
          },
          {
            path: 'railway/routes/:railwayType/:routeId',
            name: 'transportation.railway.route',
            component: () =>
              import('@/views/user/Transportation/RailwayRouteDetailView.vue'),
            meta: { title: '线路详情' },
          },
          {
            path: 'railway/stations/:railwayType/:stationId',
            name: 'transportation.railway.station',
            component: () =>
              import(
                '@/views/user/Transportation/RailwayStationDetailView.vue'
              ),
            meta: { title: '车站详情' },
          },
          {
            path: 'railway/stations',
            name: 'transportation.railway.stations',
            component: () =>
              import('@/views/user/Transportation/RailwayStationListView.vue'),
            meta: { title: '车站列表' },
          },
          {
            path: 'railway/depots/:railwayType/:depotId',
            name: 'transportation.railway.depot',
            component: () =>
              import('@/views/user/Transportation/RailwayDepotDetailView.vue'),
            meta: { title: '车厂详情' },
          },
          {
            path: 'railway/depots',
            name: 'transportation.railway.depots',
            component: () =>
              import('@/views/user/Transportation/RailwayDepotListView.vue'),
            meta: { title: '车厂列表' },
          },
          {
            path: 'railway/systems/new',
            name: 'transportation.railway.system.create',
            component: () =>
              import('@/views/user/Transportation/RailwaySystemCreateView.vue'),
            meta: { title: '新建线路系统' },
          },
          {
            path: 'railway/systems',
            name: 'transportation.railway.systems',
            component: () =>
              import('@/views/user/Transportation/RailwaySystemListView.vue'),
            meta: { title: '线路系统列表' },
          },
          {
            path: 'railway/systems/:systemId',
            name: 'transportation.railway.system.detail',
            component: () =>
              import('@/views/user/Transportation/RailwaySystemDetailView.vue'),
            meta: { title: '线路系统详情' },
          },
          {
            path: 'railway/systems/:systemId/edit',
            name: 'transportation.railway.system.edit',
            component: () =>
              import('@/views/user/Transportation/RailwaySystemEditView.vue'),
            meta: { title: '编辑线路系统' },
          },
          {
            path: 'railway/companies',
            name: 'transportation.railway.companies',
            component: () =>
              import(
                '@/views/user/Transportation/RailwayCompanyStatisticsView.vue'
              ),
            meta: { title: '公司统计' },
          },
          {
            path: 'railway/companies/:companyId',
            name: 'transportation.railway.company',
            component: () =>
              import(
                '@/views/user/Transportation/RailwayCompanyDetailView.vue'
              ),
            meta: { title: '公司详情' },
          },
          {
            path: 'railway/facilities',
            name: 'transportation.railway.facilities',
            component: () =>
              import(
                '@/views/user/Transportation/RailwayFacilityEditorView.vue'
              ),
            meta: { title: '设施编辑' },
          },
          {
            path: 'aviation',
            name: 'transportation.aviation',
            component: () =>
              import('@/views/user/Transportation/AviationPlaceholderView.vue'),
            meta: { title: '航空系统' },
          },
        ],
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('@/views/user/About/AboutView.vue'),
        meta: {
          layout: 'user',
          title: '关于 Hydroline',
          icon: 'i-lucide-info',
        },
      },
      {
        path: 'profile',
        component: () => import('@/views/user/Profile/ProfileInfoShell.vue'),
        meta: { layout: 'user' },
        children: [
          {
            path: '',
            name: 'profile',
            redirect: { name: 'profile.basic' },
          },
          {
            path: 'basic',
            name: 'profile.basic',
            component: () =>
              import('@/views/user/Profile/ProfileInfoBasicView.vue'),
            meta: {
              layout: 'user',
              title: '用户信息',
              icon: 'i-lucide-id-card',
            },
          },
          {
            path: 'minecraft',
            name: 'profile.minecraft',
            component: () =>
              import('@/views/user/Profile/ProfileInfoMinecraftView.vue'),
            meta: {
              layout: 'user',
              title: '服务器账户',
              icon: 'i-lucide-server',
            },
          },
          {
            path: 'sessions',
            name: 'profile.sessions',
            component: () =>
              import('@/views/user/Profile/ProfileInfoSessionsView.vue'),
            meta: {
              layout: 'user',
              title: '登录设备管理',
              icon: 'i-lucide-smartphone',
            },
          },
          {
            path: 'security',
            name: 'profile.security',
            component: () =>
              import('@/views/user/Profile/ProfileInfoSecurityView.vue'),
            meta: {
              layout: 'user',
              title: '隐私与安全',
              icon: 'i-lucide-shield-check',
            },
          },
        ],
      },
      {
        path: 'error/404',
        name: 'error.not-found',
        component: () => import('@/views/common/NotFoundView.vue'),
        meta: { layout: 'user' },
      },
    ],
  },
]

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    component: () => import('@/layouts/admin/AdminShell.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'moderator'],
      layout: 'admin',
    },
    children: [
      {
        path: '',
        name: 'admin.dashboard',
        component: () => import('@/views/admin/Dashboard/AdminOverview.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['portal.view.admin-dashboard'],
          layout: 'admin',
          title: '后台总览',
        },
      },
      {
        path: 'users',
        name: 'admin.users',
        component: () => import('@/views/admin/Users/UserDirectory.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.users'],
          layout: 'admin',
          title: '用户信息',
        },
      },
      {
        path: 'players',
        name: 'admin.players',
        component: () => import('@/views/admin/Players/PlayerDirectory.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.players'],
          layout: 'admin',
          title: '玩家信息',
        },
      },
      {
        path: 'invites',
        name: 'admin.invites',
        component: () => import('@/views/admin/Users/InviteCodeDirectory.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.invites'],
          layout: 'admin',
          title: '邀请码管理',
        },
      },
      {
        path: 'attachments',
        name: 'admin.attachments',
        component: () =>
          import('@/views/admin/Attachments/AttachmentLibrary.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['assets.view.attachments'],
          layout: 'admin',
          title: '附件系统',
        },
      },
      {
        path: 'authme',
        name: 'admin.authme',
        component: () => import('@/views/admin/DataSync/AuthmeAdminView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.authme'],
          layout: 'admin',
          title: 'AuthMe 状态',
        },
      },
      {
        path: 'luckperms',
        name: 'admin.luckperms',
        component: () =>
          import('@/views/admin/DataSync/LuckpermsAdminView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.luckperms'],
          layout: 'admin',
          title: 'LuckPerms 状态',
        },
      },
      {
        path: 'minecraft/servers',
        name: 'admin.minecraft.servers',
        component: () =>
          import('@/views/admin/ServerStatus/MinecraftServerStatusView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['minecraft.view.servers'],
          layout: 'admin',
          title: '服务端状态',
        },
      },

      // 服务端信息 / Hydroline Beacon
      {
        path: 'beacon/mtr-logs',
        name: 'admin.beacon.mtr-logs',
        component: () => import('@/views/admin/Beacon/BeaconMtrLogsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['beacon.view.logs'],
          layout: 'admin',
          section: 'server-info',
          title: 'MTR 审计日志',
        },
      },
      {
        path: 'beacon/advancements',
        name: 'admin.beacon.advancements',
        component: () =>
          import('@/views/admin/Beacon/BeaconAdvancementsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['beacon.view.logs'],
          layout: 'admin',
          section: 'server-info',
          title: '玩家成就信息',
        },
      },
      {
        path: 'beacon/stats',
        name: 'admin.beacon.stats',
        component: () => import('@/views/admin/Beacon/BeaconStatsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['beacon.view.logs'],
          layout: 'admin',
          section: 'server-info',
          title: '玩家统计信息',
        },
      },
      {
        path: 'rbac',
        name: 'admin.rbac',
        component: () => import('@/views/admin/Rbac/RbacConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['auth.view.rbac'],
          layout: 'admin',
          title: 'RBAC 管理',
        },
      },
      {
        path: 'config',
        name: 'admin.config',
        component: () => import('@/views/admin/Config/ConfigConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.general'],
          layout: 'admin',
          title: '配置管理',
        },
      },
      {
        path: 'verification',
        name: 'admin.verification',
        component: () =>
          import('@/views/admin/Verification/VerificationConsole.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['config.view.verification'],
          layout: 'admin',
          title: '验证管理',
        },
      },
      {
        path: 'portal/home',
        name: 'admin.portal.home',
        component: () => import('@/views/admin/Portal/PortalHomeConfig.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['portal.view.home-config'],
          layout: 'admin',
          title: '门户首页',
        },
      },
      {
        path: 'oauth/providers',
        name: 'admin.oauth.providers',
        component: () => import('@/views/admin/OAuth/OAuthProvidersView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.providers'],
          layout: 'admin',
          title: 'Provider 管理',
        },
      },
      {
        path: 'oauth/accounts',
        name: 'admin.oauth.accounts',
        component: () => import('@/views/admin/OAuth/OAuthAccountsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.accounts'],
          layout: 'admin',
          title: '绑定记录',
        },
      },
      {
        path: 'oauth/logs',
        name: 'admin.oauth.logs',
        component: () => import('@/views/admin/OAuth/OAuthLogsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.logs'],
          layout: 'admin',
          title: 'OAuth 日志',
        },
      },
      {
        path: 'oauth/stats',
        name: 'admin.oauth.stats',
        component: () => import('@/views/admin/OAuth/OAuthStatsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['oauth.view.stats'],
          layout: 'admin',
          title: 'OAuth 数据统计',
        },
      },
      {
        path: 'company/registry',
        name: 'admin.company.registry',
        component: () =>
          import('@/views/admin/Company/CompanyRegistryView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.view'],
          layout: 'admin',
          title: '公司管理',
        },
      },
      {
        path: 'company/applications',
        name: 'admin.company.applications',
        component: () =>
          import('@/views/admin/Company/CompanyApplicationsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.applications'],
          layout: 'admin',
          title: '申请审批',
        },
      },
      {
        path: 'company/deregistrations',
        name: 'admin.company.deregistrations',
        component: () =>
          import(
            '@/views/admin/Company/CompanyDeregistrationApplicationsView.vue'
          ),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.applications'],
          layout: 'admin',
          title: '注销审批',
        },
      },
      {
        path: 'company/equity-transfers',
        name: 'admin.company.equityTransfers',
        component: () =>
          import(
            '@/views/admin/Company/CompanyEquityTransferApplicationsView.vue'
          ),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.applications'],
          layout: 'admin',
          title: '股权转让审批',
        },
      },
      {
        path: 'company/name-changes',
        name: 'admin.company.nameChanges',
        component: () =>
          import('@/views/admin/Company/CompanyRenameApplicationsView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.applications'],
          layout: 'admin',
          title: '更名审批',
        },
      },
      {
        path: 'company/capital-changes',
        name: 'admin.company.capitalChanges',
        component: () =>
          import(
            '@/views/admin/Company/CompanyCapitalChangeApplicationsView.vue'
          ),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.applications'],
          layout: 'admin',
          title: '注册资本变更审批',
        },
      },
      {
        path: 'company/industries',
        name: 'admin.company.industries',
        component: () =>
          import('@/views/admin/Company/CompanyIndustriesView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.config'],
          layout: 'admin',
          title: '行业配置',
        },
      },
      {
        path: 'company/types',
        name: 'admin.company.types',
        component: () => import('@/views/admin/Company/CompanyTypesView.vue'),
        meta: {
          requiresAuth: true,
          requiresPermissions: ['company.admin.config'],
          layout: 'admin',
          title: '类型配置',
        },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...userRoutes,
    ...adminRoutes,
    {
      path: '/oauth/callback',
      name: 'oauth.callback',
      component: () => import('@/views/common/OAuthCallbackView.vue'),
      meta: { layout: 'user' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/error/404',
    },
  ],

  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash }
    }
    return { left: 0, top: 0 }
  },
})

registerAuthGuards(router)

router.afterEach((to) => {
  if (to.name === 'home') {
    setDocumentTitle(null)
    return
  }
  const matchedTitle = [...to.matched]
    .map((record) => record.meta?.title)
    .filter((title): title is string => typeof title === 'string')
    .map((title) => title.trim())
    .filter((title) => title.length > 0)
    .pop()
  setDocumentTitle(matchedTitle ?? null)
})

export default router
