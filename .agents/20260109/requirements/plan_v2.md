# 行政系统规划（v0.2，2026-01-09）

> 文件建议路径：.agents/20260109/administration-system-plan.md

## 1. 背景（从用户视角，但要能落地）

现状：申请表里存在“住所地行政区选择”能力，但它更像一个临时配置源（固定层级、无服务端维度、无地方自治权限）。
需求已升级为：一个**独立的行政系统**，按“服务端（Server）”维度配置行政制度、维护行政区树、分配地方管理员，并支持行政模式的继承/覆盖记录。

## 2. 目标与非目标

### 2.1 目标（MVP 必须实现）

1. 后台新增菜单组「行政系统」（放在「工商系统」上面），并有完整页面：

- 行政制度配置
- 行政区管理（树 + 详情面板）
- 地方管理员分配
- 行政模式选择（继承/覆盖，仅记录）

2. 管理员可按服务端配置“行政制度”：

- 级数（N 级）
- 每级允许的行政区类型（如 都/县/市/州…）及后缀规则
- 哪些层级/类型允许选择哪些“行政模式”（模式为系统预置，不允许用户自定义）

3. 行政区树（N 级）：

- 管理员强制创建一级行政区（根下第一层）
- 下级行政区可由“地方管理员”创建（必须匹配制度层级与父子关系）
- 行政区可分配多个地方管理员；无地方管理员时，允许创建但标记为“未托管”，仅全局管理员可管理

4. 行政模式（预置，仅记录）：

- 模式为系统内置 code，用户不可自定义
- 选择模式仅用于行政区自身的治理结构记录，不自动生成机构

5. 公司申请表改造（你的第 ② 点）：

- 原“一级行政区”字段改为“所属服务端（serverId uuid）”
- 行政区选择改为：按服务端搜索选择一个行政区（单字段），不再做“二级行政区”
- 打开页面时通过 company 相关 meta 接口一次性拿到 servers 列表 + 行政系统是否已配置提示

### 2.2 非目标（先不做，避免你又想完美主义卡死）

- “岗位任命/人事系统/议会席位/投票流程”等深水区先不做
- 自动创建机构等暂不纳入本阶段

---

## 3. 核心抽象（只保留真正需要编码的那几层）

### 3.1 服务端 Server

- 直接复用现有 MinecraftServer（uuid）作为行政制度与行政区树的边界

### 3.2 行政制度 Regime（管理员可配置）

- 一个服务端可以有多个制度版本（用于升级），但同一时刻只有一个 Active
- **禁止破坏性修改 Active 制度的层级结构**（避免树炸裂）；要改就新建版本并迁移

### 3.3 行政区类型 DivisionType（管理员可配置/或内置可扩展）

- 类型名：县/市/都/州...
- 后缀：县/市/都...
- 可选简称规则：直辖市 -> 市（多数为空）
- 说明：类型是结构化 id，不依赖中文名字做约束

### 3.4 行政区 Division（树节点）

- properName：专名（江户）
- typeId：行政区类型（县）
- fullName：拼接展示（江户县）
- levelIndex：第几级（1..N）
- parentId：父级（levelIndex>1 必填）
- serverId：所属服务端
- managers：地方管理员（多人）

### 3.5 行政模式 GovernanceModel（系统预置）

- 用户不可自定义，只能选择系统内置 code
- 模式用于行政区治理结构记录与约束计算

### 3.6 权力域 AuthorityDomain（系统枚举）

用于跨制度抽象共通点（为未来权限/工作流/统计打底）：

- EXECUTIVE 行政/政府
- LEGISLATIVE 立法/议会/人大
- JUDICIAL 司法/法院
- PARTY 党委/党务
- SUPERVISION 监察/纪委（可选）
- CONSULTATIVE 协商/政协（可选）
  （本阶段仅保留枚举，不做机构联动）

---

## 4. 关键业务规则（把你最纠结的点一次性钉死）

### 4.1 行政模式继承/覆盖（你问“勾选啥”的最终答案）

- 默认：继承上级行政模式（INHERIT）
- UI：一个开关即可
  - ✅ 继承上级行政模式（默认开）
  - 关掉后出现下拉：选择本级行政模式（OVERRIDE）
- 可选集合计算：
  - 制度允许（按 levelIndex + divisionType 过滤）
  - ∩ 上级约束允许（按 parentModelCode 规则过滤）
  - = 最终下拉选项

### 4.2 顶层与地方自治

- 全局管理员必须创建该 server 的一级行政区（levelIndex=1）至少一个
- 任何 levelIndex>1 的创建：
  - 必须有 parentId
  - child.levelIndex = parent.levelIndex + 1
  - child.typeId 必须在该 levelIndex 允许集合内
- 地方管理员权限范围：
  - 只能在自己管理的行政区及其子树内创建/编辑
  - 不能修改制度、不能跨 server 操作

### 4.3 “地方事务自动创建”具体落地（MVP 版本）

行政区创建成功后，系统仅创建：

1. DivisionWorkspace（一个占位“本地事务空间”）
   > 不自动生成机构

---

## 5. 数据模型（Prisma 表建议，够你直接开工）

> 命名按你现有项目风格自行微调，这里给的是可实现的最小集合

### 5.1 核心表

- administration_regime

  - id, serverId, name, version, isActive
  - levelCount
  - createdBy, createdAt

- administration_division_type

  - id, serverId (按 server 维度隔离，避免不同 server 规则冲突)
  - name, suffix, abbrSuffix(nullable), sortOrder

- administration_regime_level

  - id, regimeId
  - levelIndex (1..N)
  - displayName(optional) 例如 “一级行政区”
  - allowOverrideGovernance:boolean (默认 false，可按层开放)

- administration_regime_level_allowed_type (join)

  - regimeLevelId, divisionTypeId

- administration_governance_model (system seeded)

  - code, name, description
  - isSystem=true

- administration_governance_rule（约束规则：制度允许 + 上级允许）

  - id
  - regimeId
  - appliesLevelIndex(nullable)
  - appliesDivisionTypeId(nullable)
  - parentModelCode(nullable)
  - allowedModelCode
    > 解释：满足条件时 allowedModelCode 可选；多条规则并集后再与制度基础集合相交

- administration_division

  - id, serverId, regimeId
  - levelIndex
  - divisionTypeId
  - properName
  - fullName (冗余存储用于搜索)
  - abbrName(nullable)
  - parentId(nullable)
  - governanceMode: INHERIT | OVERRIDE
  - governanceModelCodeEffective(nullable) // 计算后的最终模式（便于查询）
  - status: ACTIVE | UNMANAGED | ARCHIVED
  - pathIds:text (materialized path，例如 "/rootId/childId/...") 便于查子树

- administration_division_manager (join)
  - divisionId, userId
  - role: LOCAL_ADMIN | LOCAL_EDITOR
  - createdAt

> 索引建议：

- administration_division(serverId, parentId)
- administration_division(serverId, fullName) + pg_trgm 做搜索
- administration_division(serverId, pathIds) 用 LIKE 前缀查子树

---

## 6. API 设计（后端独立模块 + company 聚合 meta）

### 6.1 行政系统（后台 Admin）

- GET /admin/administration/servers/:serverId/regime
- POST /admin/administration/servers/:serverId/regimes (创建新版本)
- POST /admin/administration/regimes/:regimeId/activate (激活)
- CRUD /admin/administration/servers/:serverId/division-types
- CRUD /admin/administration/servers/:serverId/divisions
- POST /admin/administration/divisions/:divisionId/managers (分配)
- POST /admin/administration/divisions/:divisionId/governance (inherit/override + modelCode)

### 6.2 行政系统（前台/通用读取）

- GET /administration/servers/:serverId/divisions/search?q=xxx
  - 返回：[{id, fullName, levelIndex, breadcrumb}]
- GET /administration/servers/:serverId/divisions/:id
- GET /administration/servers/:serverId/divisions/:id/children (懒加载树)

### 6.3 公司系统（你要求“company 下的接口”）

- GET /companies/registration/meta
  - servers: [{id(uuid), name/displayName}]
- administration: [{serverId, hasActiveRegime, levelCount}] // 仅提示用
- 公司申请表提交 payload 变更：
  - serverId: uuid（原一级行政区）
  - administrativeDivisionId: uuid（从行政系统选）
  - （移除二级行政区字段）

---

## 7. 管理后台页面（你打开就要看到的那种）

### 7.1 菜单与路由

- Sidebar: 「行政系统」置于「工商系统」上方
- /admin/administration
  - /regimes（制度）
  - /divisions（行政区）
  - /templates（可先不做）
  - /jobs（可先不做）

### 7.2 行政区管理页（核心交互）

布局：左服务端选择 + 中树 + 右详情

- 服务端选择（必选）
- 树：显示 fullName + levelIndex + 未托管标记
- 详情：
  - 基础：专名、类型、父级、fullName
  - 地方管理员：多选用户
  - 行政模式：继承开关 +（可选时）下拉

---

## 8. 里程碑（你按这个顺序写，最不容易翻车）

### M1（1）：申请表先可用（你第 ② 点）

- company meta 接口返回 servers
- 前端：一级行政区 -> 所属服务端
- 行政区选择改为单字段 search（先可临时用旧数据源也行，但接口形状按新系统来）

### M2（2）：行政系统闭环（制度 + 行政区 + 地方管理员）

- Prisma 表落库
- 后台页面跑起来：制度配置、树维护、地方管理员分配
- 行政区 search API 可用

### M3（3）：行政模式规则与继承

- seed 2 套模式：党委制 / 议会制
- 行政区支持继承/覆盖与约束规则（仅记录）

### M4（4）：升级空间（可选）

- 制度版本迁移工具（旧制度 -> 新制度）
- 更细岗位/任命系统（职位、任期、权限）

---

## 11. 默认决策（为了让你现在就能开写）

- 一个 server 允许多个 regime 版本，但同时只激活一个
- Active regime 不允许修改 levelCount（要改就新建版本）
- 行政区允许“无地方管理员”创建，但标记 UNMANAGED 且后台显眼提示
- 公司申请表不做多级级联下拉，统一改为“服务端 + 行政区（搜索选择）”
