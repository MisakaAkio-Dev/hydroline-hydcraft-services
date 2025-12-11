import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { CompanyService } from './company.service';
import {
  UpsertCompanyIndustryDto,
  UpsertCompanyTypeDto,
} from './dto/admin-config.dto';

@ApiTags('工商配置')
@Controller('admin/company/config')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CompanyConfigAdminController {
  constructor(private readonly companyService: CompanyService) {}

  @Get('industries')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '行业分类列表' })
  async listIndustries() {
    return this.companyService.listIndustries();
  }

  @Post('industries')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '创建或更新行业' })
  async upsertIndustry(@Body() body: UpsertCompanyIndustryDto) {
    return this.companyService.upsertIndustry(body);
  }

  @Get('types')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '公司类型列表' })
  async listTypes() {
    return this.companyService.listTypes();
  }

  @Post('types')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_CONFIG)
  @ApiOperation({ summary: '创建或更新公司类型' })
  async upsertType(@Body() body: UpsertCompanyTypeDto) {
    return this.companyService.upsertType(body);
  }
}
