# 前端需求拆解

## 玩家侧 `/company` 与 `/company/dashboard`
- `/company` 页面需承接 usershell 左侧导航，保留 slate+primary 的 UI 风格，并提供：
  1. 公开展示的推荐模块：最近注册、最近活跃、可点击的公司卡片，展示名称、状态、类型、行业、法人/持有者。
  2. 介绍工商体系的流程、制度与角色，以便访客理解公司持有者、法人、制度权限的关系。
  3. 推荐详情与制度链接，鼓励玩家了解公司内部制度（如章程、审批规则、行业分类）。
- `/company/dashboard` 页面仅对持有者/法人（可写角色）或已授权玩家开放，具备：
  1. 自己名下公司卡片列表，点击后展示详情、流程进度与内部制度（CompanyTimeline、CompanyProfileForm）。
  2. 可编辑表单（无 `UFormGroup`、`UForm` 依赖）同步工商基础信息、联系方式、行业标签。
  3. 申请表单（CompanyApplicationForm）收集法人、联系方式、行业、类型、制度摘要等字段，提交时打上 Authorization header（通过 `apiFetch` 的 token 参数）。
  4. API 请求必须通过 `apiFetch` 携带 token，token 过期时由 helper 自动刷新。
  5. 明确提示“只有管理员可在后台编辑全部企业/个体户信息”以区分前台与后台权限。

## 后台管理（Nuxt UI + 灰白 slate 风格 + motion/blur）
- `/admin/company/registry`：
  1. 表格参照玩家目录/用户列表样式（圆角表格、hover 高亮、分页区块），支持按状态/类型/行业/名称搜索。
  2. 每行展示公司名称、简介、状态、类型、行业、法人、流程、推荐分，点击可在右侧展开详细面板、流程动作、时间轴。
  3. 表格下方插入分页控件（首页/上一页/跳转/下一页/末页）且显示 “第 N / M 页，共 X 条”。
  4. 后台持有者/法人角色在 `/company/dashboard` 修改内容后可展示，管理员在此页面可直接开启流程动作。
  5. 编辑表单需避免未注册的 `UFormGroup` 组件，改用 `<label>` + `UInput/USelectMenu/USwitch` 的组合。
- `/admin/company/applications`：展示申请流水
  1. 表格支持按状态/关键词过滤，列出公司、申请人、状态、提交与处理时间、流程模板。
  2. 每行提供快速跳转至 `/admin/company/registry` 对应公司（通过 query companyId）。
  3. 表格底部复用 pagination 控件、loading 状态与空态提示。
- `/admin/company/industries`：
  1. 提供行业配置表单：名称、编码、父级、说明、图标、主题色，表单提交后刷新列表、反馈成功/失败。
  2. 行业列表表格显示名称/说明、编码、父级、颜色、操作按钮（编辑预填表单）。
- `/admin/company/types`：
  1. 表单字段包含名称、编码、分类、说明、所需材料（多行）、配套 JSON 配置。
  2. 表格展示类型名称、编码、分类、说明、材料数量，并支持编辑。

## 共通要求
- 所有后台页面遵循 Nuxt UI + slate/primary + motion 的视觉系统，分页与表格参考 `PlayerDirectory`。
- 所有接口必须使用 `apiFetch` + `token`，确保 Authorization header 存在；token 失效时借助 helper 自动刷新。
- 表单与表格组件尽量复用已有组件（UCard/UButton/USelectMenu/UInput/UTextarea），对动效使用 motion blur 初始动画。
- API 访问与路由跳转需同步到 RBAC（`company.admin.view`、`company.admin.applications`、`company.admin.config`等）。
