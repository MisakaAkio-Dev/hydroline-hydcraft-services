import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/services/roles.service';
import { LuckpermsService } from './luckperms.service';
import { UpdateLuckpermsConfigDto } from './dto/update-luckperms-config.dto';
import { UpdateLuckpermsGroupLabelsDto } from './dto/update-luckperms-group-labels.dto';

@ApiTags('LuckPerms 管理')
@ApiBearerAuth()
@Controller('luckperms/admin')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
export class LuckpermsAdminController {
  constructor(private readonly luckpermsService: LuckpermsService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取 LuckPerms 配置与状态' })
  async getOverview() {
    const [health, configSnapshot, groupLabels] = await Promise.all([
      this.luckpermsService.health().catch((error: unknown) => ({
        ok: false as const,
        stage: 'CONNECT' as const,
        message: error instanceof Error ? error.message : 'unknown',
      })),
      this.luckpermsService.getConfigSnapshot(),
      this.luckpermsService.getGroupLabelSnapshot(),
    ]);

    return {
      health,
      config: configSnapshot.config,
      configMeta: configSnapshot.meta,
      groupLabels,
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Patch('config')
  @ApiOperation({ summary: '更新 LuckPerms 连接配置' })
  async updateConfig(
    @Body() dto: UpdateLuckpermsConfigDto,
    @Req() req: Request,
  ) {
    await this.luckpermsService.upsertConfig(dto, req.user?.id);
    return this.getOverview();
  }

  @Patch('group-labels')
  @ApiOperation({ summary: '批量更新权限组标签' })
  async updateGroupLabels(
    @Body() dto: UpdateLuckpermsGroupLabelsDto,
    @Req() req: Request,
  ) {
    await this.luckpermsService.upsertGroupLabels(
      dto.entries ?? [],
      req.user?.id,
    );
    return this.getOverview();
  }
}
