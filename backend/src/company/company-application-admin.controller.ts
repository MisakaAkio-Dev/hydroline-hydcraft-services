import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { CompanyService } from './company.service';
import { CompanyApplicationListQueryDto } from './dto/admin-config.dto';

@ApiTags('公司申请审批')
@Controller('admin/company/applications')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CompanyApplicationAdminController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_VIEW_APPLICATIONS)
  @ApiOperation({ summary: '分页查询公司申请' })
  async list(@Query() query: CompanyApplicationListQueryDto) {
    return this.companyService.listApplications(query);
  }
}
