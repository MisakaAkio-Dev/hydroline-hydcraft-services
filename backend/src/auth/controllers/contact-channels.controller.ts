import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth.guard';
import { PermissionsGuard } from '../permissions.guard';
import { RequirePermissions } from '../permissions.decorator';
import { PERMISSIONS } from '../services/roles.service';
import { ContactChannelsService } from '../services/contact-channels.service';
import { CreateContactChannelDto } from '../dto/create-contact-channel.dto';
import { UpdateContactChannelDto } from '../dto/update-contact-channel.dto';

@ApiTags('联系渠道')
@ApiBearerAuth()
@Controller('auth/contact-channels')
@UseGuards(AuthGuard, PermissionsGuard)
export class ContactChannelsController {
  constructor(
    private readonly contactChannelsService: ContactChannelsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '列出联系渠道' })
  @RequirePermissions(PERMISSIONS.CONFIG_VIEW_GENERAL)
  async list() {
    return this.contactChannelsService.listChannels();
  }

  @Post()
  @ApiOperation({ summary: '创建联系渠道' })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE_GENERAL)
  async create(@Body() dto: CreateContactChannelDto) {
    return this.contactChannelsService.createChannel(dto);
  }

  @Patch(':channelId')
  @ApiOperation({ summary: '更新联系渠道' })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE_GENERAL)
  async update(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateContactChannelDto,
  ) {
    return this.contactChannelsService.updateChannel(channelId, dto);
  }

  @Delete(':channelId')
  @ApiOperation({ summary: '删除联系渠道' })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE_GENERAL)
  async remove(@Param('channelId') channelId: string) {
    await this.contactChannelsService.deleteChannel(channelId);
    return { success: true };
  }
}
