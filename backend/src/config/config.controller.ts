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
import { Request } from 'express';
import { ConfigService } from './config.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/roles.service';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import { CreateConfigEntryDto } from './dto/create-config-entry.dto';
import { UpdateConfigEntryDto } from './dto/update-config-entry.dto';

@Controller('config')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('namespaces')
  async listNamespaces() {
    return this.configService.listNamespaces();
  }

  @Post('namespaces')
  async createNamespace(@Body() dto: CreateNamespaceDto) {
    return this.configService.createNamespace(dto);
  }

  @Patch('namespaces/:namespaceId')
  async updateNamespace(
    @Param('namespaceId') namespaceId: string,
    @Body() dto: UpdateNamespaceDto,
  ) {
    return this.configService.updateNamespace(namespaceId, dto);
  }

  @Delete('namespaces/:namespaceId')
  async deleteNamespace(@Param('namespaceId') namespaceId: string) {
    await this.configService.removeNamespace(namespaceId);
    return { success: true };
  }

  @Get('namespaces/:namespaceId/entries')
  async listEntries(@Param('namespaceId') namespaceId: string) {
    return this.configService.listEntries(namespaceId);
  }

  @Post('namespaces/:namespaceId/entries')
  async createEntry(
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateConfigEntryDto,
    @Req() req: Request,
  ) {
    return this.configService.createEntry(namespaceId, dto, req.user!.id);
  }

  @Patch('entries/:entryId')
  async updateEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateConfigEntryDto,
    @Req() req: Request,
  ) {
    return this.configService.updateEntry(entryId, dto, req.user!.id);
  }

  @Delete('entries/:entryId')
  async deleteEntry(@Param('entryId') entryId: string) {
    await this.configService.removeEntry(entryId);
    return { success: true };
  }
}
