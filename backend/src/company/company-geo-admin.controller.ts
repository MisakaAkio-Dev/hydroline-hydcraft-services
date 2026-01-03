import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { CompanyService } from './company.service';
import {
  CreateWorldDivisionNodeDto,
  UpdateWorldDivisionNodeDto,
} from './dto/admin-geo-division.dto';

@ApiTags('工商配置（行政区划）')
@Controller('admin/company/geo/divisions')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CompanyGeoAdminController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '行政区划节点列表（平铺）' })
  async list() {
    return this.companyService.listWorldDivisions();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '创建行政区划节点' })
  async create(@Body() body: CreateWorldDivisionNodeDto, @Req() req: Request) {
    return this.companyService.createWorldDivisionNode(body, req.user!.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '更新行政区划节点（改名/改父级）' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateWorldDivisionNodeDto,
    @Req() req: Request,
  ) {
    return this.companyService.updateWorldDivisionNode(id, body, req.user!.id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '删除行政区划节点（仅允许删除叶子节点）' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.companyService.deleteWorldDivisionNode(id, req.user!.id);
    return { success: true };
  }
}


