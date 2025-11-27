import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { PortalAttachmentSearchDto } from './dto/portal-attachment-search.dto';
@ApiTags('门户附件')
@Controller('portal')
export class PortalController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get('attachments/search')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PORTAL_VIEW_HOME_CONFIG)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索可公开引用的附件' })
  async searchAttachments(@Query() query: PortalAttachmentSearchDto) {
    return this.attachmentsService.searchAttachments(
      query.keyword,
      query.limit,
      query.publicOnly ?? true,
    );
  }
}
