# 2026-01-29 铁路系统解耦（核心计划）

最新决策：**只做一件事** —— 以“铁路系统解耦合”为核心，把“手动合并（线路/车站/车厂）”做成一等公民，并把创建入口改造成 Dialog 流程；其它（transportMode 全量、Create 接入、Registry 全面重构等）先不动。

---

## 1) 目标（必须达成）

### 1.1 保留“同名线路自动合并（展示层）”

- 现有按 `name.split('||')[0].split('|')[0]` 归组的 **展示合并逻辑保留**（用于列表/预览/推荐等）。

### 1.2 但：已被玩家“手动合并”的实体，不能再参与匹配显示

- 当某条 MTR 线路已经被玩家手动合并为一个“整体线路”后：
  - 它 **不应再出现在** 线路列表中；
  - 它 **不应再被** 同名匹配逻辑抓到并展示为“可合并的子线路/同名线路”。
- 同理扩展到：车站、车厂。

### 1.3 手动合并后的“整体实体”要可浏览

- 手动合并后的线路是一个整体：
  - 地图渲染使用成员线路的 geometry 组合（复用现有 systemMap 组合方式）。
  - previewSvg 也要生成组合（复用现有 route list preview 组合算法）。
- 合并后的实体使用 **本系统 UUID** 作为路由：
  - MTR 原生线路：`/transportation/railway/routes/mtr/:mtrId`
  - 合并后的线路：`/transportation/railway/routes/:uuid`
  - 车站/车厂同理（新增不带 railwayType 的 detail 路由）。

---

## 2) 入口与交互（你要的 UI）

### 2.1 总览页右上角 “+” 改成 Dialog

- 位置：`/transportation/railway` 右上角现有 `+`。
- 行为：打开一个 Dialog，视觉与工商系统的“单位注册卡片”一致（参考：`frontend/src/views/user/Company/CompanyDashboardView.vue` 中 “单位注册” modal）。

### 2.2 Dialog 第一步只做 2 个选择（先别扩）

- 选项：
  1. **铁路线路系统**
  2. **铁路线路（手动合并）**
- 选择后进入流程：**timeline + step** 的逐步填写（类似工商注册流程）。

### 2.3 铁路线路系统的创建/编辑也改造成 Dialog 流程

- 现有 `RailwaySystemCreateView` 是页面：改为 Dialog（可以保留路由但页面只负责拉起 Dialog）。

---

## 3) 数据模型（最小新增，支持三类合并）

### 3.1 Manual Merge（合并实体）

- 新增表：`TransportationRailwayManualMerge`
  - `entityType`: `ROUTE | STATION | DEPOT`
  - `id`: UUID（合并后的“整体实体”ID）
  - `name/englishName?/color?/logoAttachmentId?`
  - `scope`: `serverId + dimensionContext + railwayMod`
  - `createdById/updatedById`

### 3.2 Manual Merge Members（成员绑定）

- 新增表：`TransportationRailwayManualMergeMember`
  - 记录合并实体包含的源数据成员（目前只接 MTR 表作为 source）
  - 并强制同 scope（同服同维度同 mod）

### 3.3 CompanyBinding 复用

- 合并实体的运营/建设单位绑定复用现有 `TransportationRailwayCompanyBinding`（entityType 仍用 `ROUTE/STATION/DEPOT`，entityId 直接用合并 UUID）。

---

## 4) 后端改造清单（只改铁路模块）

1. 新增合并实体 CRUD（至少 Create + Detail，List 由现有列表接口内联输出）。
2. 列表接口改造：
   - `/transportation/railway/routes`：返回“未被合并的 MTR 线路（保留同名归组）+ 合并后的本地线路（uuid）”
   - `/transportation/railway/stations`、`/depots`：同理
3. Detail 路由新增：
   - `/transportation/railway/routes/:uuid`（本地合并线路）
   - `/transportation/railway/stations/:uuid`
   - `/transportation/railway/depots/:uuid`
4. “同名 variants” 过滤：
   - `/transportation/railway/routes/:railwayType/:routeId/variants` 的候选集需要排除“已被手动合并”的其他线路（允许保留当前线路自身）。

---

## 5) 前端改造清单（只改铁路模块）

1. 总览页右上角 `+` 改为打开创建向导 Dialog（两选项）。
2. 新增 “创建向导” 组件：stepper + timeline（视觉对齐工商系统）。
3. 线路/车站/车厂列表：
   - 点击项时：若 `railwayType === 'LOCAL'` → 跳转本地 UUID 路由；否则走 MTR 路由。
4. 新增本地合并实体 detail view（线路需要组合地图 + previewSvg；车站/车厂先做基础信息 + 成员列表）。

---

## 6) 交付验收（你能直接肉眼验）

- `/transportation/railway` 点击右上角 `+` 弹出 Dialog，能选择“线路系统/线路合并”，并按 stepper 流程创建成功。
- 创建一个“合并线路”后：
  - 该线路的成员 MTR 线路不再出现在 `/transportation/railway/routes` 列表。
  - 列表会出现一个 `LOCAL` 的合并线路条目，点击进入 `/transportation/railway/routes/:uuid`。
  - 详情页地图能正常画出组合线路；预览 SVG 正常显示组合。
- 创建合并车站/车厂后：
  - 成员不再出现在对应列表；
  - 列表出现合并后的条目，可进入本地 UUID 详情页。
