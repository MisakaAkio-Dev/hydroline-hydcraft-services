# transportation 表名加 MTR 与日志同步改造方案（规划稿）

## 目标
1. 所有 transportation_railway 相关表名统一增加 MTR 标识（例：transportation_railway_mtr_xxx），**除 routes / system / system_routes / system_logs 外**（按最新确认）。
2. transportation 新增 logs 表，用于落库 beacon 的 mtr_logs。
3. “search log + 相关 log 查询接口”统一放到 sync 内部执行，transportation 模块内尽量使用本地缓存表。

## 现状梳理（来自 Prisma）
当前映射表名：
- transportation_railway_featured_items
- transportation_railway_routes
- transportation_railway_stations
- transportation_railway_platforms
- transportation_railway_depots
- transportation_railway_systems
- transportation_railway_system_logs
- transportation_railway_system_routes
- transportation_railway_company_bindings
- transportation_railway_rails
- transportation_railway_signal_blocks
- transportation_railway_dimensions
- transportation_railway_sync_jobs
- transportation_railway_route_geometry_snapshots
- transportation_railway_station_map_snapshots
- transportation_railway_compute_scopes

日志相关逻辑：
- route-detail 内直接从 beacon SQLite 的 `mtr_logs` 查询（含 search）。
- system 日志已有 `transportation_railway_system_logs`（确认保持原表名）。

## 表名改造映射（拟定）
> 已确认保持原名：`transportation_railway_routes`、`transportation_railway_systems`、`transportation_railway_system_routes`、`transportation_railway_system_logs`。

其余表建议改为：
- transportation_railway_featured_items -> transportation_railway_mtr_featured_items
- transportation_railway_stations -> transportation_railway_mtr_stations
- transportation_railway_platforms -> transportation_railway_mtr_platforms
- transportation_railway_depots -> transportation_railway_mtr_depots
- transportation_railway_system_logs -> 不改名（保持 transportation_railway_system_logs）
- transportation_railway_system_routes -> 不改名（保持 transportation_railway_system_routes）
- transportation_railway_company_bindings -> transportation_railway_mtr_company_bindings
- transportation_railway_rails -> transportation_railway_mtr_rails
- transportation_railway_signal_blocks -> transportation_railway_mtr_signal_blocks
- transportation_railway_dimensions -> transportation_railway_mtr_dimensions
- transportation_railway_sync_jobs -> transportation_railway_mtr_sync_jobs
- transportation_railway_route_geometry_snapshots -> transportation_railway_mtr_route_geometry_snapshots
- transportation_railway_station_map_snapshots -> transportation_railway_mtr_station_map_snapshots
- transportation_railway_compute_scopes -> transportation_railway_mtr_compute_scopes

新增（确认命名）：
- transportation_railway_mtr_logs

## Prisma/DB 修改方案
1. Prisma schema
   - 更新各 model 的 `@@map` 表名。
   - 新增 `TransportationRailwayLog`（或命名统一为 MTR Log）模型，字段对齐 beacon `mtr_logs`。
   - 字段建议：
     - beacon 原始字段：`id`(beaconLogId)、`timestamp`、`player_name`、`player_uuid`、`class_name`、`entry_id`、`entry_name`、`position`、`change_type`、`old_data`、`new_data`、`source_file_path`、`source_line`、`dimension_context`
     - 业务字段：`serverId`、`railwayMod`、`syncedAt`（或 `createdAt`）
     - 唯一约束：`serverId + beaconLogId`
   - 根据查询用途补充索引（如 serverId、railwayMod、dimensionContext、entryId、timestamp）。

2. 数据库迁移
   - 使用 `ALTER TABLE ... RENAME TO ...` 迁移旧表名。
   - 重命名索引/约束（若数据库需显式改名）。
   - 新建 logs 表结构与索引。

3. 数据一致性
   - 若日志存量需要回灌：计划提供一次性任务从 beacon 读取历史并落库（不写死数据，基于实际字段）。

## 日志同步与接口调整方案
1. Sync 流程
   - 在 `TransportationRailwaySyncService.syncServer` 内新增 `syncLogs` 步骤（与 routes/stations 等同步同周期：半小时一次）。
   - 同步策略（增量 diff）：
     - 维护每个 server 的日志游标（lastId 或 lastTimestamp，使用任意一种即可）。
     - 首次同步：`get_player_mtr_logs` + `all: true` 全量拉取并落库。
     - 后续同步：仅拉最近两天（`startDate/endDate`）并进行 upsert diff；不做 delete。
     - 依据记录唯一键（serverId + beaconLogId）做 upsert，保证窗口内变更可覆盖。

2. 查询接口
   - 将 “search log / 相关 log 查询” 统一由 Sync Service 提供方法（全部走本地表缓存）：
     - `searchLogsByKeyword`
     - `getRouteLogs` / `getStationLogs` / `getDepotLogs` / `getSystemLogs`（如需要统一入口）
   - route-detail 的日志查询改为调用 sync service（必要时触发增量同步）。
   - beacon 日志默认不分页，允许 `all: true` 直接全量；后续接口只从本地表读取。
   - 目标接口示例：
     - `/api/transportation/railway/routes/mtr/:routeId/logs`
     - `/api/transportation/railway/stations/mtr/:stationId/logs`
     - `/api/transportation/railway/depots/mtr/:depotId/logs`
     - `/api/transportation/railway/systems/:id/logs`（如纳入同一缓存层）

3. 接口排查与改造范围
   - 全量检索 transportation/railway 模块内的 logs 查询入口，统一改为读取本地 logs 表。
   - 包括 route-detail 与 controller 直接 query beacon 的路径（如 `execute_sql` / `get_player_mtr_logs`）。

4. 后台操作入口
   - 在 Beacon 信息卡片内，MTR 同步按钮旁新增 “MTR 日志同步” 按钮。
   - 新增单独 API 触发日志同步（不依赖全量铁路同步）。

## 影响面与注意事项
- 需要调整所有 Prisma model 的 `@@map` 与迁移文件命名。
- routes/system/system_logs/system_routes 明确保留旧表名。
- 日志表是否保留 `railwayMod` 字段：若未来支持多 mod，建议保留。
- 日志量较大时需要考虑归档/清理策略（按时间窗口）。
- beacon 事件文档：`/home/aurlemon/code/hydroline-bukkit-beacon/docs/Socket IO API.md`
  - `get_player_mtr_logs` 支持 `all: true` 且默认不分页，后续可用于一次性回灌。

## 已确认事项
- 日志同步游标策略无强约束，后续实现优先 `lastId`。
- 需要一次性历史回灌开关：首次请求走 `all: true` 全量，其余走最近两天增量。
- system 为系统内概念，不属于 beacon/mtr，system 表名不带 mtr。
