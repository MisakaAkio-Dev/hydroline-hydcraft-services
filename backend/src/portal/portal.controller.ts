import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/roles.service';

@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('home')
  @UseGuards(OptionalAuthGuard)
  async home(@Req() req: Request) {
    return this.portalService.getHomePortal(req.user?.id);
  }

  @Get('admin/overview')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
  async adminOverview() {
    return this.portalService.getAdminOverview();
  }
}
