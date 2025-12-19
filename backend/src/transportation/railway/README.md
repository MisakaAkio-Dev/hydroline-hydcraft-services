# Transportation / Railway

本目录实现 Portal 的铁路（MTR）交通模块：从 Beacon 同步实体数据（routes/stations/platforms/rails...），并对线路几何与站点途经线路地图做离线预计算落库，提供前台与管理端 API。

## 目录结构（约定）

- `controllers/`：HTTP Controllers（前台/管理端）
- `services/`：面向业务的 Nest Services（list/sync/map 等）
- `route-detail/`：线路/站点/车厂详情服务与其子模块（geometry/logs/storage 等）
- `snapshot/`：sync job 预计算与快照落库（route geometry / station map / compute scope）
- `types/`：rail graph、DTO 产物等共享类型
- `utils/`：beacon 调用、normalizer、配置等通用工具

## 关键行为

- Sync job：`TransportationRailwaySyncService` 在完成 Beacon 数据同步后，会调用 `TransportationRailwaySnapshotService` 进行预计算并写入快照表；若同一维度的 fingerprint 无变化则直接跳过计算。
- Station map：`GET /transportation/railway/stations/:railwayType/:stationId/map` 只读 `station_map_snapshots`，未生成则返回 `pending`（不在线现算、不使用缓存）。
- Route detail / variants：优先读取 `route_geometry_snapshots`，未 READY 时回退在线现算（无缓存，便于用响应耗时判断是否命中快照）。

## 数据表（Prisma）

- `transportation_railway_route_geometry_snapshots`
- `transportation_railway_station_map_snapshots`
- `transportation_railway_compute_scopes`
