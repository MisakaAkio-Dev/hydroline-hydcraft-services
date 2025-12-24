import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  RailwayCompanyBindingListQueryDto,
  RailwayCompanyBindingStatsQueryDto,
} from '../../dto/railway-binding.dto';
import { TransportationRailwayCompanyBindingService } from '../services/railway-company-binding.service';

@ApiTags('交通系统 - 铁路公司绑定统计')
@Controller('transportation/railway/companies')
export class TransportationRailwayCompanyController {
  constructor(
    private readonly bindingService: TransportationRailwayCompanyBindingService,
  ) {}

  @Get('statistics')
  @ApiOperation({ summary: '铁路公司绑定统计' })
  async statistics(@Query() query: RailwayCompanyBindingStatsQueryDto) {
    return this.bindingService.listCompanyBindingStats({
      bindingType: query.bindingType,
      entityType: query.entityType,
    });
  }

  @Get(':companyId/bindings')
  @ApiOperation({ summary: '公司绑定的铁路设施列表' })
  async bindings(
    @Param('companyId') companyId: string,
    @Query() query: RailwayCompanyBindingListQueryDto,
  ) {
    return this.bindingService.listCompanyBindings({
      companyId,
      bindingType: query.bindingType,
    });
  }
}
