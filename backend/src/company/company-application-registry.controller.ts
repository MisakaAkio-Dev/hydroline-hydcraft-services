import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CompanyActionDto } from './dto/company.dto';
import { CompanyApplicationListQueryDto } from './dto/admin-config.dto';

@ApiTags('登记机关审批')
@Controller('companies/registry/applications')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CompanyRegistryApplicationController {
  constructor(private readonly companyService: CompanyService) {}

  private requireUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User session has expired');
    }
    return userId;
  }

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_VIEW_APPLICATIONS)
  @ApiOperation({
    summary: '登记机关审批：分页查询可审批的公司申请（基于权限）',
  })
  async list(@Query() query: CompanyApplicationListQueryDto) {
    // 基于 RBAC 授权：有权限即可查看登记机关审批队列（不再限定必须是登记机关法定代表人）
    return this.companyService.listApplications(query);
  }

  @Post(':id/actions')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_APPLICATIONS)
  @ApiOperation({ summary: '登记机关审批：审批公司申请（基于权限）' })
  async action(
    @Param('id') id: string,
    @Body() body: CompanyActionDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    // 基于 RBAC 授权：有权限即可执行审批动作（使用 ADMIN 角色参与流程动作判定）
    return this.companyService.adminExecuteApplicationAction(id, userId, body, [
      'ADMIN',
    ]);
  }
}
