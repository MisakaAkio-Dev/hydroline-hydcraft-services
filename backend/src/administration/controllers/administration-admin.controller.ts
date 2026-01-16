/**
 * Admin API for administration system configuration.
 */
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { PERMISSIONS } from '../../auth/services/roles.service';
import { AdministrationService } from '../administration.service';
import {
  CreateAdministrationDivisionDto,
  CreateAdministrationDivisionTypeDto,
  CreateAdministrationRegimeDto,
  UpdateAdministrationDivisionTypeDto,
  UpdateAdministrationRegimeDto,
  UpdateAdministrationDivisionDto,
} from '../dto/administration.dto';

@ApiTags('行政系统（后台）')
@Controller('admin/administration')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdministrationAdminController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Get('servers')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '获取服务端列表（含行政制度摘要）' })
  async listServers() {
    return this.administrationService.listServersWithRegimeSummary();
  }

  @Get('servers/:serverId/regime')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '获取服务端当前生效的行政制度' })
  async getActiveRegime(@Param('serverId') serverId: string) {
    return this.administrationService.getActiveRegime(serverId);
  }

  @Get('regimes')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '获取行政制度列表（可选服务端）' })
  async listRegimes(@Query('serverId') serverId?: string) {
    return this.administrationService.listRegimes(serverId);
  }

  @Post('servers/:serverId/regimes')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '创建行政制度' })
  async createRegime(
    @Param('serverId') serverId: string,
    @Body() body: CreateAdministrationRegimeDto,
    @Req() req: Request,
  ) {
    return this.administrationService.createRegime(
      serverId,
      body,
      req.user?.id,
    );
  }

  @Post('regimes/:regimeId/activate')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '激活行政制度' })
  async activateRegime(
    @Param('regimeId') regimeId: string,
    @Req() req: Request,
  ) {
    return this.administrationService.activateRegime(regimeId, req.user?.id);
  }

  @Patch('regimes/:regimeId')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '更新行政制度' })
  async updateRegime(
    @Param('regimeId') regimeId: string,
    @Body() body: UpdateAdministrationRegimeDto,
    @Req() req: Request,
  ) {
    return this.administrationService.updateRegime(
      regimeId,
      body,
      req.user?.id,
    );
  }

  @Get('servers/:serverId/division-types')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '获取行政区类型列表' })
  async listDivisionTypes(@Param('serverId') serverId: string) {
    return this.administrationService.listDivisionTypes(serverId);
  }

  @Get('division-types')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '获取行政区类型列表（可选服务端）' })
  async listDivisionTypesAll(@Query('serverId') serverId?: string) {
    return this.administrationService.listDivisionTypes(serverId);
  }

  @Post('servers/:serverId/division-types')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '创建行政区类型' })
  async createDivisionType(
    @Param('serverId') serverId: string,
    @Body() body: CreateAdministrationDivisionTypeDto,
    @Req() req: Request,
  ) {
    return this.administrationService.createDivisionType(
      serverId,
      body,
      req.user?.id,
    );
  }

  @Patch('division-types/:divisionTypeId')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '更新行政区类型' })
  async updateDivisionType(
    @Param('divisionTypeId') divisionTypeId: string,
    @Body() body: UpdateAdministrationDivisionTypeDto,
    @Req() req: Request,
  ) {
    return this.administrationService.updateDivisionType(
      divisionTypeId,
      body,
      req.user?.id,
    );
  }

  @Get('servers/:serverId/divisions')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '行政区列表（后台）' })
  async listDivisions(
    @Param('serverId') serverId: string,
    @Query('q') q?: string,
  ) {
    return this.administrationService.listDivisions(serverId, q);
  }

  @Get('divisions')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_VIEW_ADMIN)
  @ApiOperation({ summary: '行政区列表（可选服务端）' })
  async listDivisionsAll(
    @Query('serverId') serverId?: string,
    @Query('q') q?: string,
  ) {
    return this.administrationService.listDivisions(serverId, q);
  }

  @Post('servers/:serverId/divisions')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '创建行政区' })
  async createDivision(
    @Param('serverId') serverId: string,
    @Body() body: CreateAdministrationDivisionDto,
    @Req() req: Request,
  ) {
    return this.administrationService.createDivision(
      serverId,
      body,
      req.user?.id,
    );
  }

  @Patch('divisions/:divisionId')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '更新行政区（改名/改类型）' })
  async updateDivision(
    @Param('divisionId') divisionId: string,
    @Body() body: UpdateAdministrationDivisionDto,
    @Req() req: Request,
  ) {
    return this.administrationService.updateDivision(
      divisionId,
      body,
      req.user?.id,
    );
  }

  @Delete('divisions/:divisionId')
  @RequirePermissions(PERMISSIONS.ADMINISTRATION_MANAGE_ADMIN)
  @ApiOperation({ summary: '删除行政区（仅允许删除叶子节点）' })
  async deleteDivision(@Param('divisionId') divisionId: string) {
    await this.administrationService.deleteDivision(divisionId);
    return { success: true };
  }
}
