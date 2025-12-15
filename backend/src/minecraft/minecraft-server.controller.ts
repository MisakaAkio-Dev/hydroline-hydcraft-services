import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MinecraftServerService } from './minecraft-server.service';
import { CreateMinecraftServerDto } from './dto/create-minecraft-server.dto';
import { UpdateMinecraftServerDto } from './dto/update-minecraft-server.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { McsmCommandDto } from './dto/mcsm-command.dto';
import { BeaconMtrLogsQueryDto } from './dto/beacon-mtr-logs.dto';
import {
  BeaconPlayerPagedQueryDto,
  BeaconPlayerSessionsQueryDto,
} from './dto/beacon-player.dto';
import { BeaconStatusQueryDto } from './dto/beacon-status.dto';

@ApiTags('Minecraft 服务器')
@ApiBearerAuth()
@Controller('admin/minecraft/servers')
@UseGuards(AuthGuard, PermissionsGuard)
export class MinecraftServerController {
  constructor(private readonly service: MinecraftServerService) {}

  @Get()
  @ApiOperation({ summary: '列出已配置的 Minecraft 服务器' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  list(@Query('keyword') keyword?: string) {
    return this.service.listServers({ keyword });
  }

  @Post()
  @ApiOperation({ summary: '创建新的服务器配置' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_SERVERS)
  create(@Body() dto: CreateMinecraftServerDto, @Req() req: Request) {
    return this.service.createServer(dto, req.user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '查看单个服务器配置详情' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  detail(@Param('id') id: string) {
    return this.service.getServerById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新服务器配置' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_SERVERS)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMinecraftServerDto,
    @Req() req: Request,
  ) {
    return this.service.updateServer(id, dto, req.user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除服务器配置' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_SERVERS)
  async remove(@Param('id') id: string) {
    await this.service.deleteServer(id);
    return { success: true };
  }

  @Post(':id/ping')
  @ApiOperation({ summary: 'Ping 指定服务器并返回状态' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  ping(@Param('id') id: string) {
    return this.service.pingManagedServer(id);
  }

  @Get(':id/ping/history')
  @ApiOperation({ summary: '获取服务器的 Ping 历史记录' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  history(@Param('id') id: string, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.service.listPingHistory(id, Number.isFinite(n) ? n : 30);
  }

  @Get('ping/settings')
  @ApiOperation({ summary: '获取自动 Ping 设置' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  getSettings() {
    return this.service.getPingSettings();
  }

  @Patch('ping/settings')
  @ApiOperation({ summary: '更新自动 Ping 设置' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_SERVERS)
  updateSettings(
    @Body() dto: { intervalMinutes?: number; retentionDays?: number },
  ) {
    return this.service.updatePingSettings(dto);
  }

  @Get(':id/mcsm/status')
  @ApiOperation({ summary: '获取 MCSM 实例状态' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  getMcsmStatus(@Param('id') id: string) {
    return this.service.getMcsmStatus(id);
  }

  @Get(':id/mcsm/output')
  @ApiOperation({ summary: '获取 MCSM 实例输出日志' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_VIEW_SERVERS)
  getMcsmOutput(@Param('id') id: string, @Query('size') size?: string) {
    const n = size ? Number(size) : undefined;
    return this.service.getMcsmOutput(
      id,
      n !== undefined && Number.isFinite(n) ? n : undefined,
    );
  }

  @Post(':id/mcsm/command')
  @ApiOperation({ summary: '向 MCSM 实例发送命令' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_MCSM_CONTROL)
  sendMcsmCommand(@Param('id') id: string, @Body() dto: McsmCommandDto) {
    return this.service.sendMcsmCommand(id, dto.command);
  }

  @Post(':id/mcsm/start')
  @ApiOperation({ summary: '启动 MCSM 实例' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_MCSM_CONTROL)
  startMcsm(@Param('id') id: string) {
    return this.service.startMcsmInstance(id);
  }

  @Post(':id/mcsm/stop')
  @ApiOperation({ summary: '停止 MCSM 实例' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_MCSM_CONTROL)
  stopMcsm(@Param('id') id: string) {
    return this.service.stopMcsmInstance(id);
  }

  @Post(':id/mcsm/restart')
  @ApiOperation({ summary: '重启 MCSM 实例' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_MCSM_CONTROL)
  restartMcsm(@Param('id') id: string) {
    return this.service.restartMcsmInstance(id);
  }

  @Post(':id/mcsm/kill')
  @ApiOperation({ summary: '强制终止 MCSM 实例进程' })
  @RequirePermissions(PERMISSIONS.MINECRAFT_MANAGE_MCSM_CONTROL)
  killMcsm(@Param('id') id: string) {
    return this.service.killMcsmInstance(id);
  }

  // Hydroline Beacon HTTP 网关
  @Get(':id/beacon/status')
  @ApiOperation({ summary: '获取 Beacon 服务器状态与在线玩家信息' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_STATUS)
  getBeaconStatus(
    @Param('id') id: string,
    @Query() _dto: BeaconStatusQueryDto,
  ) {
    // 目前仅预留 scope 等参数，后端暂不区分
    return this.service.getBeaconStatus(id);
  }

  @Get(':id/beacon/connection-status')
  @ApiOperation({ summary: '获取 Beacon Socket 连接状态' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_STATUS)
  getBeaconConnectionStatus(@Param('id') id: string) {
    return this.service.getBeaconConnectionStatus(id);
  }

  @Post(':id/beacon/connect')
  @ApiOperation({ summary: '手动触发 Beacon 连接/重连' })
  @RequirePermissions(PERMISSIONS.BEACON_MANAGE_CONNECTION)
  connectBeacon(@Param('id') id: string) {
    return this.service.connectBeacon(id);
  }

  @Post(':id/beacon/disconnect')
  @ApiOperation({ summary: '手动断开 Beacon 连接' })
  @RequirePermissions(PERMISSIONS.BEACON_MANAGE_CONNECTION)
  disconnectBeacon(@Param('id') id: string) {
    return this.service.disconnectBeacon(id);
  }

  @Post(':id/beacon/reconnect')
  @ApiOperation({ summary: '手动重连 Beacon' })
  @RequirePermissions(PERMISSIONS.BEACON_MANAGE_CONNECTION)
  reconnectBeacon(@Param('id') id: string) {
    return this.service.reconnectBeacon(id);
  }

  @Post(':id/beacon/check')
  @ApiOperation({ summary: '检查 Beacon 连通性（轻量请求）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_STATUS)
  checkBeacon(@Param('id') id: string) {
    return this.service.checkBeaconConnectivity(id);
  }

  @Get(':id/beacon/mtr-logs')
  @ApiOperation({ summary: '查询 Beacon MTR 审计日志（带分页/筛选）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  getBeaconMtrLogs(
    @Param('id') id: string,
    @Query() dto: BeaconMtrLogsQueryDto,
  ) {
    return this.service.getBeaconMtrLogs(id, dto);
  }

  @Get(':id/beacon/mtr-logs/:logId')
  @ApiOperation({ summary: '查询单条 Beacon MTR 日志详情' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  getBeaconMtrLogDetail(
    @Param('id') id: string,
    @Param('logId') logId: string,
  ) {
    return this.service.getBeaconMtrLogDetail(id, logId);
  }

  @Get(':id/beacon/players/advancements')
  @ApiOperation({ summary: '查询玩家成就信息（Beacon）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  getBeaconPlayerAdvancements(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.getBeaconPlayerAdvancements(id, dto);
  }

  @Get(':id/beacon/players/stats')
  @ApiOperation({ summary: '查询玩家统计信息（Beacon）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  getBeaconPlayerStats(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.getBeaconPlayerStats(id, dto);
  }

  @Get(':id/beacon/players/sessions')
  @ApiOperation({ summary: '查询玩家会话记录（Beacon）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  getBeaconPlayerSessions(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerSessionsQueryDto,
  ) {
    return this.service.getBeaconPlayerSessions(id, dto);
  }

  @Get(':id/beacon/players/nbt')
  @ApiOperation({ summary: '查询玩家 NBT 原始数据（Beacon）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  getBeaconPlayerNbt(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.getBeaconPlayerNbt(id, dto);
  }

  @Get(':id/beacon/players/identity')
  @ApiOperation({ summary: '查询玩家身份信息（Beacon）' })
  @RequirePermissions(PERMISSIONS.BEACON_VIEW_LOGS)
  lookupBeaconPlayerIdentity(
    @Param('id') id: string,
    @Query() dto: BeaconPlayerPagedQueryDto,
  ) {
    return this.service.lookupBeaconPlayerIdentity(id, dto);
  }

  @Post(':id/beacon/force-update')
  @ApiOperation({ summary: '触发 Beacon 全量 Diff 扫描' })
  @RequirePermissions(PERMISSIONS.BEACON_ADMIN_FORCE_UPDATE)
  triggerBeaconForceUpdate(@Param('id') id: string) {
    return this.service.triggerBeaconForceUpdate(id);
  }

  @Get(':id/beacon/railway-snapshot')
  @ApiOperation({ summary: '获取 Beacon MTR 铁路快照' })
  @RequirePermissions(PERMISSIONS.BEACON_ADMIN_FORCE_UPDATE)
  getBeaconRailwaySnapshot(@Param('id') id: string) {
    return this.service.getBeaconRailwaySnapshot(id);
  }

  @Post(':id/beacon/railway-sync')
  @ApiOperation({ summary: '手动触发 MTR 铁路数据同步' })
  @RequirePermissions(PERMISSIONS.BEACON_ADMIN_FORCE_UPDATE)
  syncRailwayEntities(@Param('id') id: string, @Req() req: Request) {
    return this.service.syncRailwayEntities(id, req.user?.id);
  }

  @Get(':id/beacon/railway-sync/:jobId')
  @ApiOperation({ summary: '查询铁路同步任务状态' })
  @RequirePermissions(PERMISSIONS.BEACON_ADMIN_FORCE_UPDATE)
  getRailwaySyncJob(@Param('jobId') jobId: string) {
    return this.service.getRailwaySyncJob(jobId);
  }

  @Get(':id/beacon/railway-sync')
  @ApiOperation({ summary: '获取当前铁路同步任务（若存在）' })
  @RequirePermissions(PERMISSIONS.BEACON_ADMIN_FORCE_UPDATE)
  getLatestRailwaySyncJob(@Param('id') id: string) {
    return this.service.getLatestRailwaySyncJob(id);
  }
}
