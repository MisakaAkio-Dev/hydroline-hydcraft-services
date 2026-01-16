# 2026-01-16 行政区系统 + 工商系统行政区接入：实施总结

本次按 `.agents/20260109/requirements/plan_v2.md` 落地：**行政区系统仅负责“行政区/治理规则”管理**，工商系统（公司注册/创建）改为**从行政区系统读取行政区数据**，不再使用旧的 KV 示例行政区数据；同时不涉及“自动创建法人/工商关联自动建档”等内容。

## 变更概览

- 新增后端“行政区系统”模块（Administration）：支持按服务端（serverId）维护制度/层级/区划类型/区划/治理规则/区划管理员。
- 工商系统接入行政区系统：公司注册/后台创建公司时，选择“所属服务端”，行政区搜索/路径/登记机关查询均以该服务端的行政区数据为准。
- 删除旧的 KV 行政区示例数据路径：不再依赖 `world.admin_divisions/divisions_v1` 的配置项。

## 后端（backend）

### Prisma Schema / Migration

- 新增枚举：`backend/prisma/schema/enums.prisma`
  - `AdministrationGovernanceMode`
  - `AdministrationDivisionStatus`
  - `AdministrationDivisionManagerRole`
- 新增模型：`backend/prisma/schema/administration.prisma`
  - `AdministrationRegime` / `AdministrationRegimeLevel`
  - `AdministrationDivisionType` / `AdministrationRegimeLevelAllowedType`
  - `AdministrationGovernanceModel` / `AdministrationGovernanceRule`
  - `AdministrationDivision` / `AdministrationDivisionManager`
- 关联字段补齐（用于 Prisma 校验/生成）：
  - `backend/prisma/schema/minecraft.prisma`：为 `MinecraftServer` 增加 Administration 相关反向关系字段
  - `backend/prisma/schema/users.prisma`：为 `User` 增加 created/updated/manager 相关反向关系字段
- 新增 migration：`backend/prisma/migrations/20260116_administration_system_init/migration.sql`
  - 创建 Administration 表/索引/外键
  - 清理遗留配置项：删除 `config_entries` 中 `world.admin_divisions/divisions_v1` 与 namespace `world.admin_divisions`

### 行政区系统（Administration）

- 模块入口：`backend/src/administration/administration.module.ts`
- 服务：`backend/src/administration/administration.service.ts`
- DTO：`backend/src/administration/dto/administration.dto.ts`
- 控制器：
  - 管理端：`backend/src/administration/controllers/administration-admin.controller.ts`
  - 公共/业务端：`backend/src/administration/controllers/administration-public.controller.ts`
- 说明文档：`backend/src/administration/README.md`
- 权限：`backend/src/auth/services/roles.service.ts`
  - `administration.admin.view`
  - `administration.admin.manage`

### 工商系统对行政区的接入点（Company）

- 新增注册元信息接口（供前端页面首次进入时拉取服务端列表等）：
  - `GET /companies/registration/meta`
- 原公司登记机关/行政区路径相关接口增加 `serverId` 约束（避免跨服混用行政区数据）：
  - `GET /companies/geo/divisions/:id/path?serverId=...`
  - `GET /companies/authorities?serverId=...&divisionId=...`
- 业务实现改造：`backend/src/company/services/company-geo.service.ts`
  - 行政区搜索/路径/登记机关解析改为基于 `AdministrationService`，移除 KV load/save 逻辑
  - 修复 TS 谓词：`.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)`
- 移除旧控制器文件：`backend/src/company/company-geo-admin.controller.ts`
- 去掉启动时注入的 KV 示例行政区数据：`backend/src/config/config.bootstrap.ts`

## 前端（frontend）

- 类型更新：`frontend/src/types/company/index.ts`
  - `WorldDivisionLevel` 改为 `number`
  - LLC/后台创建公司 payload 增加 `serverId`
  - 新增 `CompanyRegistrationMeta`/`CompanyRegistrationServer`
- Store：`frontend/src/stores/user/companies.ts` 增加 `registrationMeta` 与 `fetchRegistrationMeta()`
- 申请表单：`frontend/src/components/company/CompanyApplicationForm.vue`
  - “所属服务端 + 行政区搜索”替代原 1~3 级行政区选择（移除二级行政区）
  - 行政区搜索/登记机关查询均带 `serverId`
  - 提交 payload 写入 `serverId` 与 `domicileDivisionId`
- 后台创建公司：`frontend/src/views/admin/Company/components/CompanyRegistryCreateDialog.vue`
  - 增加服务端选择（使用 `/companies/registration/meta`）
  - 行政区搜索/路径接口改为 `/administration/servers/:serverId/...`
  - 创建 payload 写入 `serverId`
- 新增后台页面：`frontend/src/views/admin/Administration/AdministrationDivisionsView.vue`
- Router：`frontend/src/router/index.ts` 增加 `/admin/administration`（要求 `administration.admin.view`）
- 菜单：`frontend/src/layouts/admin/AdminShell.vue` 增加“行政系统”分组入口

## 验证命令（已在本机执行通过）

- 后端：
  - `pnpm -C backend db:generate`
  - `pnpm -C backend build`
- 前端：
  - `pnpm -C frontend type-check`

## 部署/合并注意事项

- 合并后请确保执行 migration（按项目既有流程），否则新增 Administration 表不会存在。
- Prisma Client 需要能生成到新模型（CI/构建环境如未自动 generate，需要补上 `pnpm -C backend db:generate`）。

