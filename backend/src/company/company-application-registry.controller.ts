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
import { CompanyService } from './company.service';
import { CompanyActionDto } from './dto/company.dto';
import { CompanyApplicationListQueryDto } from './dto/admin-config.dto';

@ApiTags('登记机关审批')
@Controller('companies/registry/applications')
@UseGuards(AuthGuard)
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
  @ApiOperation({ summary: '登记机关（法定代表人）分页查询可审批的公司申请' })
  async list(@Query() query: CompanyApplicationListQueryDto, @Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.listRegistryApplications(userId, query);
  }

  @Post(':id/actions')
  @ApiOperation({ summary: '登记机关（法定代表人）审批公司申请' })
  async action(
    @Param('id') id: string,
    @Body() body: CompanyActionDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.registryExecuteApplicationAction(id, userId, body);
  }
}



