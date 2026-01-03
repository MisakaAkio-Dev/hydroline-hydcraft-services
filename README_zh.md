# hydroline-hydcraft-services

> [English](README.md). Hydroline HydCraft Services 是一个为氢气工艺服务器专门构建的定制化服务系统。

本项目与 Hydroline 生态系统紧密绑定：[Beacon](https://github.com/Hydroline/beacon)、[Beacon Provider](https://github.com/Hydroline/beacon-provider)、[OAuth Proxy](https://github.com/Hydroline/oauth-proxy)、[Minecraft Skin Proxy](https://github.com/Hydroline/minecraft-skin-proxy)、[HydCraft Client Agent](https://github.com/Hydroline/hydcraft-client-agent)、[HydCraft Client Patcher](https://github.com/Hydroline/hydcraft-client-patcher)、[Foundry](https://github.com/Hydroline/foundry) 以及若干辅助服务（参见 [Hydroline 组织仓库](https://github.com/orgs/Hydroline/repositories)）协同工作。它们共同构成了用于服务器运营、数据收集和面向玩家服务的统一后端基础设施。

[Hydroline Services](https://github.com/Hydroline/hydroline-services) 是基于本项目（`hydroline-hydcraft-services`）的低代码平台，待本项目进入维护阶段后就会开启 Hydroline Services 的开发。

项目的核心目标是将 Minecraft 运行时数据与现实世界的服务器管理需求连接起来，提供的功能包括（但不限于）：

- 地图与 GIS 集成（兼容 Leaflet）
- 公司 / 组织管理
- 服务器状态获取与监控
- 游戏内在线聊天同步
- Modpack 元数据与分发支持
- 可扩展的服务模块以便未来扩展

该服务使用现代 TypeScript 技术栈构建，主要特性：

- 使用 **Node.js** 与 **NestJS** 搭建后端
- 以 **PostgreSQL** 作为主数据库
- 前端采用 **Vue 3 + Vite**
- 使用 **Prisma** 进行模式与数据库管理
- 使用 **OAuth** 做认证
- 使用兼容 S3 的对象存储保存资产与上传文件

本项目处于快速迭代中，内部结构与模块可能会频繁变动。通过与其它 Hydroline 服务的深度集成，系统目标是为氢气工艺服务器提供一个覆盖全面、协同一致的服务生态。

## 目录结构

该仓库作为一个 **pnpm workspace** 组织，遵循前后端分离的清晰布局：

```
root
├── .agents/          # 客户端 / 代理会话数据
├── backend/          # 后端（NestJS + TypeScript）
├── frontend/         # 前端（Vue 3 + Vite + TypeScript）
└── package.json      # pnpm workspace 配置
```

后端与前端都从根目录统一管理。

## 开发

要启动项目，请在根目录分别运行后端和前端：

```bash
pnpm backend:start
pnpm frontend:dev
```

建议在两个终端中分别运行（VS Code 分屏终端效果很好）。

## 工具与配置

1. 复制并配置后端环境变量：

   ```
   backend/.env.sample → backend/.env
   ```

2. 与 Prisma 相关的命令可在 `backend/package.json` 中找到，包括：

   - `pnpm db:push`
   - `pnpm db:generate`
   - 以及其他数据库工具

3. 对 **前后端** 应用统一代码格式化：

   ```bash
   pnpm format:write
   ```

   该命令使用 Prettier 保持整个代码库的一致性。

## 附属生态

本项目仅包含 Web 部分，对于项目内的其他功能（如客户端分发、Minecraft 服务端数据查看、Google OAuth 代理），还需要额外使用以下服务。

- Minecraft 服务端数据获取：[Beacon](https://github.com/Hydroline/beacon)、[Beacon Provider](https://github.com/Hydroline/beacon-provider)

- 代理服务：[OAuth Proxy](https://github.com/Hydroline/oauth-proxy)、[Minecraft Skin Proxy](https://github.com/Hydroline/minecraft-skin-proxy)

- Minecraft 客户端分发：[HydCraft Client Agent](https://github.com/Hydroline/hydcraft-client-agent)、[HydCraft Client Patcher](https://github.com/Hydroline/hydcraft-client-patcher)、[Foundry](https://github.com/Hydroline/foundry)
