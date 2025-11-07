# 2025-11-07 后端：Minecraft 服务器状态与档案调整 Todo

## 目标拆解
- 基于 `/src/lib/minecraft` 的工具，提供 4 个 API 能力（Ping、MOTD 解析、玩家名查询、UUID 查询），确保 Ping 为核心能力，可被后台实时调用；
- 新建 Minecraft 服务器信息表，用于存储站内配置（展示名、中文/英文内部代号、IP/端口、版本类型等），提供 CRUD 与即时 Ping；
- 重构 `minecraftProfiles` 数据结构：去除冗余的 `minecraftId / playerUuid`，挂接 AuthMe 绑定记录，允许多昵称/多绑定并支持主昵称/主绑定；
- 调整 AuthMe 绑定表，补充 UUID/别名等字段，供后续档案与主绑定选择使用；
- 更新 `auth` / `portal` 相关 DTO、Service、Controller 以适配新的字段，并保证前端 `/profile/info` 相关接口保持兼容；
- 通过 Swagger / DTO 校验文档化新 API。

## Todo List
- [ ] **现状调研**：梳理 `lib/minecraft` 的 4 个方法签名及既有调用点，确认会受影响的模块（`auth`, `portal`, `authme` 等）。
- [ ] **数据建模**：在 Prisma 中新增 `MinecraftServer` 表（展示名、中文/英文代号、IP、端口、版本类型、可见性、排序、元信息），并补充 `createdBy/updatedBy` 字段便于审计。
- [ ] **档案结构重构**：
  - [ ] 为 `UserAuthmeBinding` 增加 `authmeUuid`、`primary` 标识与昵称列表关联；
  - [ ] 将 `UserMinecraftProfile` 改为引用 `authmeBindingId`，保留 `nickname`、`isPrimary`、`metadata`，移除 `minecraftId`/`playerUuid`；
  - [ ] 设计 `UserMinecraftNickname`（或等价结构）以支持多昵称且可标记主昵称。
- [ ] **Prisma Service & DTO 调整**：更新 `Create/UpdateMinecraftProfileDto`, `AuthRegisterDto`, `SignUpDto` 等所有引用旧字段的 DTO/Service/Mapper。
- [ ] **Minecraft API 模块**：
  - [ ] 新建 `minecraft` module（service + controller），封装对 `ping.ts`, `motd.ts`, `player-name.ts`, `uuid.ts` 的调用；
  - [ ] 定义 `GET /minecraft/ping`, `/motd`, `/players/name`, `/players/uuid` 等受保护端点，支持 Query/Body 校验与错误处理。
- [ ] **服务器信息 CRUD**：
  - [ ] 实现 `MinecraftServerService`（Prisma CRUD + Ping 聚合）；
  - [ ] 提供 `GET /admin/minecraft/servers`（分页+过滤）、`POST/PUT/PATCH/DELETE`；
  - [ ] 提供 `POST /admin/minecraft/servers/:id/ping` 触发即时 Ping 并返回 MOTD。
- [ ] **Portal/Admin 适配**：更新 `portal` 侧返回的 Minecraft 档案数据结构，确保 primary 绑定与多昵称对齐。
- [ ] **主绑定设置 API**：扩展 `Auth` 控制器以允许用户/管理员设置主 AuthMe 绑定（含权限校验与审计日志）。
- [ ] **验证**：运行 `pnpm --filter backend lint && pnpm --filter backend test`，并对新 API 进行最小自测（可用 e2e/Playwright later）。
- [ ] **文档更新**：在 `docs/backend` 区补充 API 使用说明，完成后勾选对应项。
