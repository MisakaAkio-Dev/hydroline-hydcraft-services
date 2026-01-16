/**
 * Public API for administration divisions.
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdministrationService } from '../administration.service';
import { DivisionSearchDto } from '../dto/administration.dto';

@ApiTags('行政系统（公开）')
@Controller('administration/servers/:serverId')
export class AdministrationPublicController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Get('divisions/search')
  @ApiOperation({ summary: '搜索行政区（公开）' })
  async searchDivisions(
    @Param('serverId') serverId: string,
    @Query() query: DivisionSearchDto,
  ) {
    return this.administrationService.searchDivisions(serverId, query);
  }

  @Get('divisions/:divisionId')
  @ApiOperation({ summary: '获取行政区详情（公开）' })
  async getDivision(
    @Param('serverId') serverId: string,
    @Param('divisionId') divisionId: string,
  ) {
    return this.administrationService.getDivisionById(serverId, divisionId);
  }

  @Get('divisions/:divisionId/path')
  @ApiOperation({ summary: '获取行政区路径（公开）' })
  async getDivisionPath(
    @Param('serverId') serverId: string,
    @Param('divisionId') divisionId: string,
  ) {
    return this.administrationService.getDivisionPath(serverId, divisionId);
  }
}
