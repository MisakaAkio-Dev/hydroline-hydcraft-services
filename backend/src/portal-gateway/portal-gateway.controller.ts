import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { PortalGatewayService } from './portal-gateway.service';

@ApiTags('门户接口')
@Controller('portal')
export class PortalGatewayController {
  constructor(private readonly portalGateway: PortalGatewayService) {}

  @Get('home')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取门户首页内容（可选登录）' })
  async home(@Req() req: Request) {
    return this.portalGateway.getHomePortal(req.user?.id);
  }

  @Get('header/minecraft-status')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: '获取门户 Header 显示用的 Minecraft 公共状态（无需权限）',
    description:
      '返回所有已启用服务器的最近 Ping、Beacon 时钟与 MCSM 连接状态，供前端头部时钟和悬浮卡片展示。',
  })
  async publicHeaderMinecraftStatus() {
    return this.portalGateway.getPublicHeaderMinecraftStatus();
  }

  @Get('rank/categories')
  @ApiOperation({ summary: '获取排行榜类别' })
  async rankCategories() {
    return this.portalGateway.getRankCategories();
  }

  @Get('rank/leaderboard')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '排行榜列表' })
  async rankLeaderboard(
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalGateway.getRankLeaderboard(
      category ?? 'login-count',
      period,
      {
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
    );
  }

  @Get('rank/me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前玩家的排行榜名次' })
  async rankMe(
    @Req() req: Request,
    @Query('category') category?: string,
    @Query('period') period?: string,
  ) {
    return this.portalGateway.getRankContextForUser(
      category ?? 'login-count',
      period,
      req.user!.id,
    );
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_ADMIN_DASHBOARD)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取后台门户总览数据' })
  async adminOverview(@Req() req: Request) {
    return this.portalGateway.getAdminOverview(req.user?.id ?? null);
  }
}
