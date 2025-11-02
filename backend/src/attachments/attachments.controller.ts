import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { QueryAttachmentsDto } from './dto/query-attachments.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/roles.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { GenerateShareTokenDto } from './dto/generate-share-token.dto';
import type { StoredUploadedFile } from './uploaded-file.interface';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Get()
  async list(@Query() query: QueryAttachmentsDto) {
    return this.attachmentsService.listAttachments(query);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 64 * 1024 * 1024 },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFile() file: StoredUploadedFile,
    @Body() body: CreateAttachmentDto,
  ) {
    return this.attachmentsService.uploadAttachment(req.user!.id, file, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Patch(':attachmentId')
  async update(
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
    @Body() body: UpdateAttachmentDto,
  ) {
    return this.attachmentsService.updateAttachment(attachmentId, req.user!.id, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Delete(':attachmentId')
  async remove(@Param('attachmentId') attachmentId: string) {
    await this.attachmentsService.deleteAttachment(attachmentId);
    return { success: true };
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Get('folders/all')
  async folders() {
    return this.attachmentsService.listFolders();
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Post('folders')
  async createFolder(@Req() req: Request, @Body() body: CreateFolderDto) {
    return this.attachmentsService.createFolder(req.user!.id, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Patch('folders/:folderId')
  async updateFolder(@Param('folderId') folderId: string, @Body() body: UpdateFolderDto) {
    return this.attachmentsService.updateFolder(folderId, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Get('tags/all')
  async tags() {
    return this.attachmentsService.listTags();
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Post('tags')
  async createTag(@Req() req: Request, @Body() body: CreateTagDto) {
    return this.attachmentsService.createTag(req.user!.id, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Patch('tags/:tagId')
  async updateTag(@Param('tagId') tagId: string, @Body() body: UpdateTagDto) {
    return this.attachmentsService.updateTag(tagId, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Delete('tags/:tagId')
  async deleteTag(@Param('tagId') tagId: string) {
    await this.attachmentsService.deleteTag(tagId);
    return { success: true };
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ATTACHMENTS)
  @Post(':attachmentId/share')
  async share(
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
    @Body() body: GenerateShareTokenDto,
  ) {
    return this.attachmentsService.generateShareToken(attachmentId, req.user!.id, body);
  }

  @Get('public/:attachmentId')
  async publicDownload(@Param('attachmentId') attachmentId: string, @Res() res: Response) {
    const attachment = await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (!attachment.isPublic) {
      throw new NotFoundException('Attachment is not public');
    }
    const stream = await this.attachmentsService.openAttachmentStream(attachment);
    res.setHeader('Content-Type', attachment.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    stream.pipe(res);
  }

  @Get('share/:token')
  async shareDownload(@Param('token') token: string, @Res() res: Response) {
    const attachment = await this.attachmentsService.resolveShareToken(token);
    const stream = await this.attachmentsService.openAttachmentStream(attachment);
    res.setHeader('Content-Type', attachment.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    stream.pipe(res);
  }
}
