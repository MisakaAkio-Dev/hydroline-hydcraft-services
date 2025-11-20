import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { PortalAttachmentSearchDto } from './dto/portal-attachment-search.dto';

@ApiTags('门户接口')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Get('home')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取门户首页内容（可选登录）' })
  async home(@Req() req: Request) {
    return this.portalService.getHomePortal(req.user?.id);
  }

  @Get('header/minecraft-status')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: '获取门户 Header 显示用的 Minecraft 公共状态（无需权限）',
    description:
      '返回所有已启用服务器的最近 Ping、Beacon 时钟与 MCSM 连接状态，供前端头部时钟和悬浮卡片展示。',
  })
  async publicHeaderMinecraftStatus() {
    return this.portalService.getPublicHeaderMinecraftStatus();
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_ADMIN_DASHBOARD)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取后台门户总览数据' })
  async adminOverview(@Req() req: Request) {
    return this.portalService.getAdminOverview(req.user?.id ?? null);
  }

  @Get('attachments/search')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_HOME_CONFIG)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索可公开引用的附件' })
  async searchAttachments(@Query() query: PortalAttachmentSearchDto) {
    return this.attachmentsService.searchAttachments(
      query.keyword,
      query.limit,
      query.publicOnly ?? true,
    );
  }
}
