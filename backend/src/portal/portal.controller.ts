import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/services/roles.service';

@ApiTags('门户接口')
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('home')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取门户首页内容（可选登录）' })
  async home(@Req() req: Request) {
    return this.portalService.getHomePortal(req.user?.id);
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取后台门户总览数据' })
  async adminOverview() {
    return this.portalService.getAdminOverview();
  }
}
