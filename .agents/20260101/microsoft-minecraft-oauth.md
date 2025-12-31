# Microsoft ↔ Minecraft 关联（MVP 方案）

## 背景与目标

我们已经支持「Microsoft OAuth 多账号绑定」，现在希望把「Microsoft 账号 ↔ Minecraft（Java / 基岩）」的关联信息外显出来，并让用户在绑定 AuthMe（服内账号）时，可以在满足条件时“免输密码”快速绑定。

同时需要解决历史遗留：**之前已绑定过 Microsoft 的用户**，当时未保存/未拥有本次新增的 Minecraft 数据时，要能通过“同步数据”补齐。

## Token 保留时间（结论）

- Microsoft OAuth `access_token` 通常有效期约 **1 小时**（以 `expires_in` 为准，服务端每次拿到都应该以返回值计算过期时间）。
- `refresh_token` 用于换取新的 `access_token`（需要 `offline_access`），其有效期/失效策略由 Microsoft 控制，可能因长期未使用、密码变更、撤销授权等而失效，因此需要提供“重新授权/重新绑定”的降级路径。

## 关键设计（最小可行）

### 1) 数据落点

- 使用现有 `Account` 表字段持久化 OAuth token（`accessToken`, `accessTokenExpiresAt`, `refreshToken`）。
- Minecraft 资料不新增表：写入 `Account.profile.minecraft`（便于前端直接从 `auth.user.accounts` 读取展示）。

建议结构（示意）：

- `account.profile.minecraft.updatedAt`
- `account.profile.minecraft.java`：`{ name, uuid }`
- `account.profile.minecraft.bedrock`：`{ gamertag, xuid }`

### 2) 同步策略

- **新绑定 Microsoft 账号**：OAuth callback 时保存 token，并尝试立即拉取 Minecraft 资料写入 `profile.minecraft`。
- **旧绑定 Microsoft 账号**：提供“同步数据”按钮：
  - 如果账号没有可用 token（历史数据缺失），返回可读错误并提示用户“重新绑定一次 Microsoft”。
  - 有 token 则刷新/拉取 Minecraft 资料并回写。

### 3) 免密绑定 AuthMe（用户强感知）

- 前端在「绑定 AuthMe 账号」Dialog 内新增一行小字 + 可点击 ID 列表：
  - 若用户绑定的 1+ Microsoft 账号中，存在 `profile.minecraft.java.name` 或 `profile.minecraft.bedrock.gamertag`，则显示这些 ID。
  - 点击某个 ID：走“免密绑定”接口，不要求输入 AuthMe 密码。
- 后端接口校验：`authmeId` 必须命中当前用户任一 Microsoft 账号的 `minecraft` ID（大小写不敏感），否则拒绝。

## UI Requirements（你最关注的外显点）

### A) `/profile/minecraft`

1. 在“服内游戏账户”上方新增一个“关联游戏帐户”卡片：
   - 风格、按钮大小 1:1 复制现有区域（参考 `MinecraftSection.vue` 的 header）。
   - 卡片整体 Minecraft 绿色背景 + 白字。
   - 支持 `v-for` 多 Microsoft 账号展示：每个账号展示 Microsoft 名称+头像，并展示该账号下的 Java / 基岩信息。
2. Java / 基岩区分：
   - 同为绿色主风格，但右下角要有淡淡白色 watermark（Java 用 Creeper / 基岩用 Xbox）。

### B) `/profile/security` 的“社交账号 / Microsoft”行

1. 若该 Microsoft 账号存在 Minecraft 资料：
   - 在 `{{ accountPrimaryLabel(account) }}` 后追加：
     - 绿色 Creeper 图标（Tooltip 显示 Java 的 **ID（玩家名）**）
     - Xbox 图标（Tooltip 显示 基岩的 **ID（Gamertag）**）
2. 在“解除绑定”按钮旁新增“同步数据”按钮：
   - 用于让老用户补齐 `profile.minecraft`。

### C) AuthMe 绑定 Dialog

- 右侧（或输入区域下方）新增提示：若存在 Minecraft ID，则用户可点击免输密码绑定。
- 无论该 ID 是否已被绑定，都要显示在 dialog 内（选择后若冲突，由后端返回错误提示）。

## TODO（按实现顺序）

1. 后端：OAuth callback 保存 token（access/refresh/expires），并为 Microsoft 增加 scope `XboxLive.signin`。
2. 后端：增加 `sync-minecraft` 接口（AuthGuard，按账号同步并回写 `Account.profile.minecraft`）。
3. 后端：增加 AuthMe “免密绑定”接口（校验来源于当前用户的 Microsoft→Minecraft ID）。
4. 前端：`ProfileOAuthBindingsSection.vue`（Microsoft 行追加图标 + 同步数据按钮）。
5. 前端：`/profile/minecraft` 新增“关联游戏帐户”卡片（多账号 v-for + Java/基岩区分 + watermark）。
6. 前端：`AuthmeBindDialog.vue` 增加免密绑定入口与 ID 展示，并联动调用新接口。
7. 验证：仅运行 `pnpm -C backend build` 与 `pnpm -C frontend build`。

