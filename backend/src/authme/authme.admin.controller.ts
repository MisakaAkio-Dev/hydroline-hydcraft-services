import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../auth/services/roles.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AuthmeService } from './authme.service';
import { AuthFeatureService } from './auth-feature.service';
import { UpdateAuthmeConfigDto } from './dto/update-authme-config.dto';
import { UpdateAuthmeFeatureDto } from './dto/update-authme-feature.dto';
import { ScheduledFetchService } from '../lib/sync/scheduled-fetch.service';

@ApiTags('AuthMe 管理')
@ApiBearerAuth()
@Controller('authme/admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AuthmeAdminController {
  constructor(
    private readonly authmeService: AuthmeService,
    private readonly authFeatureService: AuthFeatureService,
    private readonly scheduledFetch: ScheduledFetchService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取 AuthMe 连接及功能状态' })
  @RequirePermissions(PERMISSIONS.CONFIG_VIEW_AUTHME)
  async getOverview() {
    const [health, configSnapshot, featureSnapshot] = await Promise.all([
      this.authmeService.health().catch((error: unknown) => ({
        ok: false as const,
        stage: 'CONNECT' as const,
        message: error instanceof Error ? error.message : 'unknown',
      })),
      this.authmeService.getConfigSnapshot(),
      this.authFeatureService.getFeatureSnapshot(),
    ]);

    return {
      health,
      config: configSnapshot.config,
      configMeta: configSnapshot.meta,
      featureFlags: featureSnapshot.flags,
      featureMeta: featureSnapshot.meta,
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Patch('config')
  @ApiOperation({ summary: '更新 AuthMe 数据库配置' })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE_AUTHME)
  async updateConfig(@Body() dto: UpdateAuthmeConfigDto, @Req() req: Request) {
    await this.authmeService.upsertConfig(dto, req.user?.id);
    return this.getOverview();
  }

  @Patch('feature')
  @ApiOperation({ summary: '更新 AuthMe 功能开关' })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE_AUTHME)
  async updateFeature(
    @Body() dto: UpdateAuthmeFeatureDto,
    @Req() req: Request,
  ) {
    await this.authFeatureService.setFlags(dto, req.user?.id);
    return this.getOverview();
  }

  @Post('sync-cache')
  @ApiOperation({ summary: '手动触发 AuthMe 缓存同步' })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE_AUTHME)
  async triggerCacheSync() {
    await this.scheduledFetch.triggerTask('authme-cache', 'manual');
    return { success: true };
  }
}
