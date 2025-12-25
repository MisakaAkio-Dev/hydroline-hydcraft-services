import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AttachmentFolder, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { buildPublicUrl } from '../lib/shared/url';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { QueryAttachmentsDto } from './dto/query-attachments.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { GenerateShareTokenDto } from './dto/generate-share-token.dto';
import type { StoredUploadedFile } from './uploaded-file.interface';
import { ATTACHMENT_STORAGE } from './storage/attachment-storage.token';
import type { AttachmentStorage } from './storage/attachment-storage.interface';
import {
  AttachmentsDeliveryMode,
  AttachmentsStorageConfig,
  AttachmentsStorageDriver,
  readAttachmentsStorageConfig,
} from './storage/attachments-storage.config';
import { LocalAttachmentStorage } from './storage/local-attachment.storage';

const ATTACHMENT_RELATIONS = {
  folder: {
    select: {
      id: true,
      name: true,
      path: true,
    },
  },
  owner: { select: { id: true, name: true, email: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.AttachmentInclude;

type AttachmentWithRelations = Prisma.AttachmentGetPayload<{
  include: typeof ATTACHMENT_RELATIONS;
}> & {
  ownerId: string | null;
  uploaderNameSnapshot: string | null;
  uploaderEmailSnapshot: string | null;
};
type AttachmentSummary = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  isPublic: boolean;
  hash: string | null;
  metadata: Prisma.JsonValue | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  folder: {
    id: string;
    name: string;
    path: string;
  } | null;
  owner: {
    id: string | null;
    name: string | null;
    email: string | null;
    deleted: boolean;
  };
  tags: Array<{ id: string; key: string; name: string }>;
  publicUrl: string | null;
};

type AttachmentStorageInfo = {
  driver: AttachmentsStorageDriver;
  deliveryMode: AttachmentsDeliveryMode;
  attachmentsDir?: string;
  publicBaseUrl?: string;
  s3?: {
    endpoint: string;
    region: string;
    bucket: string;
    forcePathStyle: boolean;
    keyPrefix?: string;
    publicBaseUrl?: string;
  };
};

export type UploadedStreamFile = {
  originalName: string;
  mimeType: string;
  stream: Readable;
};

@Injectable()
export class AttachmentsService implements OnModuleInit {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly attachmentIncludes = ATTACHMENT_RELATIONS;
  private readonly storageConfig = readAttachmentsStorageConfig();
  private readonly isLocalStorage: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {
    this.isLocalStorage = storage instanceof LocalAttachmentStorage;
  }

  async onModuleInit() {
    if (this.isLocalStorage) {
      await fs.mkdir(LocalAttachmentStorage.resolveRootDir(), {
        recursive: true,
      });
    }
  }

  private buildDirectUrlForKey(storageKey: string): string | null {
    if (this.storageConfig.deliveryMode === 'proxy') {
      return null;
    }

    const configuredBase = this.storageConfig.publicBaseUrl?.trim();
    if (configuredBase) {
      return new URL(
        storageKey.replace(/^\/+/, ''),
        configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`,
      ).toString();
    }

    const fromStorage = this.storage.getPublicUrl?.(storageKey) ?? null;
    return fromStorage;
  }

  private buildProxyUrlForAttachmentId(attachmentId: string): string {
    return buildPublicUrl(`/attachments/public/${attachmentId}`);
  }

  async resolvePublicUrl(
    attachmentId: string | null | undefined,
  ): Promise<string | null> {
    if (!attachmentId) {
      return null;
    }

    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        storageKey: true,
        deletedAt: true,
        isPublic: true,
      },
    });

    if (!attachment || attachment.deletedAt || !attachment.isPublic) {
      return null;
    }

    const exists = await this.storage.headObject(attachment.storageKey);
    if (!exists.exists) {
      return null;
    }

    const direct = this.buildDirectUrlForKey(attachment.storageKey);
    if (direct) {
      return direct;
    }
    return this.buildProxyUrlForAttachmentId(attachment.id);
  }

  async resolvePublicUrlsByIds(
    attachmentIds: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = Array.from(
      new Set(
        attachmentIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    );
    const result = new Map<string, string>();
    if (ids.length === 0) {
      return result;
    }

    const records = await this.prisma.attachment.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        isPublic: true,
      },
      select: { id: true, storageKey: true },
    });

    const concurrency = 10;
    let index = 0;
    const workers = Array.from({
      length: Math.min(concurrency, records.length),
    }).map(async () => {
      while (index < records.length) {
        const current = records[index++];
        try {
          const head = await this.storage.headObject(current.storageKey);
          if (!head.exists) {
            continue;
          }
          const direct = this.buildDirectUrlForKey(current.storageKey);
          result.set(
            current.id,
            direct ?? this.buildProxyUrlForAttachmentId(current.id),
          );
        } catch {
          // ignore resolution failure
        }
      }
    });

    await Promise.all(workers);
    return result;
  }

  getStorageInfo(): AttachmentStorageInfo {
    const config = this.storageConfig;
    return {
      driver: config.driver,
      deliveryMode: config.deliveryMode,
      attachmentsDir: config.attachmentsDir,
      publicBaseUrl: config.publicBaseUrl,
      s3: config.s3
        ? {
            endpoint: config.s3.endpoint,
            region: config.s3.region,
            bucket: config.s3.bucket,
            forcePathStyle: config.s3.forcePathStyle,
            keyPrefix: config.s3.keyPrefix || undefined,
            publicBaseUrl: config.s3.publicBaseUrl,
          }
        : undefined,
    };
  }

  async listFolders() {
    const folders = await this.prisma.attachmentFolder.findMany({
      orderBy: [{ path: 'asc' }],
    });
    return folders;
  }

  async createFolder(userId: string, dto: CreateFolderDto) {
    const parent = dto.parentId
      ? await this.prisma.attachmentFolder.findUnique({
          where: { id: dto.parentId },
        })
      : null;
    if (dto.parentId && !parent) {
      throw new NotFoundException('Parent folder not found');
    }

    const slug = this.slugify(dto.name);
    const path = parent ? `${parent.path}/${slug}` : slug;

    await this.ensureUniqueFolder(parent?.id ?? null, dto.name);

    const folder = await this.prisma.attachmentFolder.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId ?? null,
        path,
        createdById: userId ?? null,
      },
    });

    await this.ensurePhysicalDirectory(folder.path);

    return folder;
  }

  async updateFolder(folderId: string, dto: UpdateFolderDto) {
    const folder = await this.prisma.attachmentFolder.findUnique({
      where: { id: folderId },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (dto.parentId === folderId) {
      throw new BadRequestException('Folder cannot reference itself as parent');
    }

    const targetParentId =
      dto.parentId === undefined ? folder.parentId : (dto.parentId ?? null);

    let parent: AttachmentFolder | null = null;
    if (targetParentId) {
      parent = await this.prisma.attachmentFolder.findUnique({
        where: { id: targetParentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent folder not found');
      }
      if (parent.path.startsWith(`${folder.path}/`)) {
        throw new BadRequestException('Cannot move folder into its descendant');
      }
    }

    const nextName = dto.name ?? folder.name;
    await this.ensureUniqueFolder(targetParentId, nextName, folderId);

    const slug = dto.name
      ? this.slugify(dto.name)
      : (folder.slug ?? this.slugify(folder.name));
    const path: string = parent ? `${parent.path}/${slug}` : slug;

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.attachmentFolder.update({
        where: { id: folderId },
        data: {
          name: dto.name ?? folder.name,
          slug,
          description: dto.description ?? folder.description,
          parentId: targetParentId,
          path,
        },
      });

      // 同步子目录 path
      const descendants = await tx.attachmentFolder.findMany({
        where: {
          path: {
            startsWith: `${folder.path}/`,
          },
        },
        select: { id: true, path: true },
      });
      for (const child of descendants) {
        const childPath = child.path.replace(
          `${folder.path}/`,
          `${record.path}/`,
        );
        await tx.attachmentFolder.update({
          where: { id: child.id },
          data: { path: childPath },
        });
      }
      return record;
    });

    await this.ensurePhysicalDirectory(updated.path);
    return updated;
  }

  async deleteFolder(folderId: string) {
    const folder = await this.prisma.attachmentFolder.findUnique({
      where: { id: folderId },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const [childFolders, attachments] = await Promise.all([
      this.prisma.attachmentFolder.count({ where: { parentId: folderId } }),
      this.prisma.attachment.count({ where: { folderId } }),
    ]);

    if (childFolders > 0) {
      throw new BadRequestException('Folder is not empty: contains subfolders');
    }
    if (attachments > 0) {
      throw new BadRequestException(
        'Folder is not empty: contains attachments',
      );
    }

    await this.prisma.attachmentFolder.delete({ where: { id: folderId } });
    return { success: true } as const;
  }

  async listTags() {
    return this.prisma.attachmentTag.findMany({ orderBy: { key: 'asc' } });
  }

  async createTag(userId: string, dto: CreateTagDto) {
    const existing = await this.prisma.attachmentTag.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new BadRequestException('Tag key already exists');
    }

    return this.prisma.attachmentTag.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        createdById: userId ?? null,
      },
    });
  }

  async updateTag(tagId: string, dto: UpdateTagDto) {
    const tag = await this.prisma.attachmentTag.findUnique({
      where: { id: tagId },
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return this.prisma.attachmentTag.update({
      where: { id: tagId },
      data: {
        name: dto.name ?? tag.name,
        description: dto.description ?? tag.description,
      },
    });
  }

  async deleteTag(tagId: string) {
    const tag = await this.prisma.attachmentTag.findUnique({
      where: { id: tagId },
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    const usage = await this.prisma.attachmentTagging.count({
      where: { tagId },
    });
    if (usage > 0) {
      throw new BadRequestException('Tag is in use and cannot be deleted');
    }

    await this.prisma.attachmentTag.delete({ where: { id: tagId } });
  }

  async listAttachments(dto: QueryAttachmentsDto) {
    const filters: Prisma.AttachmentWhereInput = {
      deletedAt: dto.includeDeleted ? undefined : null,
    };
    if (dto.folderId) {
      filters.folderId = dto.folderId;
    }
    if (dto.tagKeys && dto.tagKeys.length > 0) {
      filters.tags = {
        some: {
          tag: {
            key: { in: dto.tagKeys },
          },
        },
      };
    }

    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const sizeInput = dto.pageSize && dto.pageSize > 0 ? dto.pageSize : 10;
    const pageSize = Math.min(sizeInput, 100);
    const skip = (page - 1) * pageSize;

    const [total, attachments] = await this.prisma.$transaction([
      this.prisma.attachment.count({ where: filters }),
      this.prisma.attachment.findMany({
        where: filters,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: this.attachmentIncludes,
      }),
    ]);

    const pageCount = Math.max(Math.ceil(total / pageSize), 1);
    return {
      items: await Promise.all(
        attachments.map((item) => this.serializeAttachmentAsync(item)),
      ),
      pagination: {
        total,
        page,
        pageSize,
        pageCount,
      },
    };
  }

  async searchAttachments(keyword?: string, limit?: number, onlyPublic = true) {
    const take = Math.min(Math.max(limit ?? 20, 1), 50);
    const trimmed = keyword?.trim();
    const filters: Prisma.AttachmentWhereInput = {
      deletedAt: null,
      isPublic: onlyPublic ? true : undefined,
    };
    if (trimmed?.length) {
      filters.OR = [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { originalName: { contains: trimmed, mode: 'insensitive' } },
        { id: { equals: trimmed } },
        {
          folder: {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { path: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
        },
        {
          tags: {
            some: {
              tag: {
                OR: [
                  { key: { contains: trimmed, mode: 'insensitive' } },
                  { name: { contains: trimmed, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    const attachments = await this.prisma.attachment.findMany({
      where: filters,
      orderBy: [{ createdAt: 'desc' }],
      take,
      include: this.attachmentIncludes,
    });
    return await Promise.all(
      attachments.map((item) => this.serializeAttachmentAsync(item)),
    );
  }

  async searchUserAttachments(
    userId: string,
    keyword?: string,
    limit?: number,
  ) {
    const take = Math.min(Math.max(limit ?? 20, 1), 50);
    const trimmed = keyword?.trim();
    const filters: Prisma.AttachmentWhereInput = {
      deletedAt: null,
      ownerId: userId,
    };
    if (trimmed?.length) {
      filters.OR = [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { originalName: { contains: trimmed, mode: 'insensitive' } },
        { id: { equals: trimmed } },
        {
          folder: {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' } },
              { path: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
        },
        {
          tags: {
            some: {
              tag: {
                OR: [
                  { key: { contains: trimmed, mode: 'insensitive' } },
                  { name: { contains: trimmed, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    const attachments = await this.prisma.attachment.findMany({
      where: filters,
      orderBy: [{ createdAt: 'desc' }],
      take,
      include: this.attachmentIncludes,
    });
    return await Promise.all(
      attachments.map((item) => this.serializeAttachmentAsync(item)),
    );
  }

  async uploadAttachment(
    userId: string,
    file: StoredUploadedFile | undefined,
    dto: CreateAttachmentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const streamFile: UploadedStreamFile = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      stream: Readable.from(file.buffer),
    };

    return this.uploadAttachmentStream(userId, streamFile, dto, {
      contentLength: file.size,
    });
  }

  private async putObjectWithHash(params: {
    key: string;
    mimeType: string;
    stream: Readable;
    contentLength?: number;
  }): Promise<{ hash: string; size: number }> {
    const hash = createHash('sha256');
    let size = 0;

    const hashing = new Transform({
      transform: (chunk, _encoding, callback) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        hash.update(buffer);
        callback(null, buffer);
      },
    });

    const putPromise = this.storage.putObject({
      key: params.key,
      contentType: params.mimeType,
      contentLength: params.contentLength,
      body: hashing,
    });

    await pipeline(params.stream, hashing);
    await putPromise;

    return {
      hash: hash.digest('hex'),
      size,
    };
  }

  async uploadAttachmentStream(
    userId: string,
    file: UploadedStreamFile | undefined,
    dto: CreateAttachmentDto,
    options?: { contentLength?: number },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const folderId = dto.folderId ?? null;
    const folder = folderId
      ? await this.prisma.attachmentFolder.findUnique({
          where: { id: folderId },
        })
      : null;
    if (folderId && !folder) {
      throw new NotFoundException('Folder not found');
    }

    const tagRecords =
      dto.tagKeys && dto.tagKeys.length > 0
        ? await this.prisma.attachmentTag.findMany({
            where: { key: { in: dto.tagKeys } },
          })
        : [];
    if (dto.tagKeys && tagRecords.length !== dto.tagKeys.length) {
      const missing = dto.tagKeys.filter(
        (key) => !tagRecords.find((tag) => tag.key === key),
      );
      throw new BadRequestException(`Tags not found: ${missing.join(', ')}`);
    }

    const uploader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!uploader) {
      throw new NotFoundException('Uploader not found');
    }

    const isPublic = dto.isPublic ?? true;

    const normalizedOriginalName =
      this.normalizeAttachmentName(file.originalName) ||
      file.originalName ||
      'attachment';
    const ext = extname(normalizedOriginalName) || '';
    const randomName = `${Date.now()}-${randomUUID()}${ext}`;
    const storageKey = folder
      ? join(folder.path, randomName)
      : join('root', randomName);

    const stored = await this.putObjectWithHash({
      key: storageKey.replace(/\\/g, '/'),
      mimeType: file.mimeType,
      stream: file.stream,
      contentLength: options?.contentLength,
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        folderId: folderId,
        ownerId: userId,
        uploaderNameSnapshot: uploader.name ?? null,
        uploaderEmailSnapshot: uploader.email ?? null,
        name:
          (dto.name && dto.name.trim().length > 0
            ? dto.name.trim()
            : normalizedOriginalName.replace(ext, '')) ||
          normalizedOriginalName,
        originalName: normalizedOriginalName,
        fileName: randomName,
        mimeType: file.mimeType,
        size: stored.size,
        storageKey: storageKey.replace(/\\/g, '/'),
        hash: stored.hash,
        isPublic,
        metadata: this.buildMetadata(dto),
        tags: tagRecords.length
          ? {
              create: tagRecords.map((tag) => ({
                tagId: tag.id,
                assignedById: userId,
              })),
            }
          : undefined,
      },
      include: {
        folder: true,
        owner: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });

    return await this.serializeAttachmentAsync(attachment);
  }

  async updateAttachment(
    attachmentId: string,
    userId: string,
    dto: UpdateAttachmentDto,
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        tags: true,
        folder: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const folderIdInput = dto.folderId;
    const folder =
      typeof folderIdInput === 'string'
        ? await this.prisma.attachmentFolder.findUnique({
            where: { id: folderIdInput },
          })
        : null;
    if (typeof folderIdInput === 'string' && !folder) {
      throw new NotFoundException('Folder not found');
    }

    let tagConnect: { tagId: string; assignedById: string }[] | undefined;
    if (dto.tagKeys) {
      const tags = await this.prisma.attachmentTag.findMany({
        where: { key: { in: dto.tagKeys } },
      });
      if (tags.length !== dto.tagKeys.length) {
        const missing = dto.tagKeys.filter(
          (key) => !tags.find((tag) => tag.key === key),
        );
        throw new BadRequestException(`Tags not found: ${missing.join(', ')}`);
      }
      tagConnect = tags.map((tag) => ({ tagId: tag.id, assignedById: userId }));
    }

    const updated = await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        name: dto.name ?? attachment.name,
        folderId:
          folderIdInput !== undefined ? folderIdInput : attachment.folderId,
        isPublic: dto.isPublic ?? attachment.isPublic,
        metadata:
          dto.metadata !== undefined
            ? this.buildMetadata(dto)
            : (attachment.metadata as Prisma.InputJsonValue | undefined),
        tags:
          dto.tagKeys !== undefined
            ? {
                deleteMany: { attachmentId },
                create: tagConnect ?? [],
              }
            : undefined,
      },
      include: this.attachmentIncludes,
    });

    return await this.serializeAttachmentAsync(updated);
  }

  async deleteAttachment(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (attachment.deletedAt) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });

      await tx.user.updateMany({
        where: { avatarAttachmentId: attachmentId },
        data: { avatarAttachmentId: null },
      });

      await tx.company.updateMany({
        where: { logoAttachmentId: attachmentId },
        data: { logoAttachmentId: null },
      });

      await tx.transportationRailwaySystem.updateMany({
        where: { logoAttachmentId: attachmentId },
        data: { logoAttachmentId: null },
      });
    });
  }

  async generateShareToken(
    attachmentId: string,
    userId: string,
    dto: GenerateShareTokenDto,
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (attachment.deletedAt) {
      throw new BadRequestException('Attachment has been deleted');
    }

    const token = randomUUID().replace(/-/g, '');
    const expiresInMinutes = dto.expiresInMinutes ?? 60;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const share = await this.prisma.attachmentShareToken.create({
      data: {
        attachmentId,
        token,
        expiresAt,
        createdById: userId ?? null,
      },
    });

    return {
      token: share.token,
      expiresAt: share.expiresAt,
      url: `/attachments/share/${share.token}`,
    };
  }

  async resolveShareToken(token: string) {
    const share = await this.prisma.attachmentShareToken.findUnique({
      where: { token },
      include: {
        attachment: true,
      },
    });
    if (!share || share.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Share token invalid or expired');
    }
    return share.attachment;
  }

  async getAttachmentOrThrow(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        folder: true,
        owner: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!attachment || attachment.deletedAt) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  async ensureSeededAttachment(params: {
    seedKey: string;
    filePath: string;
    fileName: string;
    tagKeys?: string[];
    folderPath?: string[];
    isPublic?: boolean;
    description?: string;
  }): Promise<AttachmentSummary | null> {
    try {
      const existing = await this.prisma.attachment.findFirst({
        where: {
          metadata: {
            path: ['seedKey'],
            equals: params.seedKey,
          },
        },
        include: {
          folder: true,
          owner: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
        },
      });

      if (existing) {
        return await this.serializeAttachmentAsync(existing);
      }
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2021'
      ) {
        this.logger.warn(
          'Attachment table missing. Skip seeding seeded asset.',
        );
        return null;
      }
      throw error;
    }

    const buffer = await fs.readFile(params.filePath);
    const hash = createHash('sha256').update(buffer).digest('hex');
    const ext = extname(params.fileName);

    // 使用系统虚拟用户记录（seed），虽然 ownerId 允许在上传者删除后置空，但默认仍记录该系统用户。
    const systemUser = await this.resolveSystemUser();

    const folder = await this.resolveFolderByPath(
      systemUser.id,
      params.folderPath ?? [],
    );

    const randomName = `${Date.now()}-${randomUUID()}${ext}`;
    const storageKey = folder
      ? join(folder.path, randomName)
      : join('seed', randomName);

    await this.storage.putObject({
      key: storageKey.replace(/\\/g, '/'),
      contentType: this.detectMimeType(ext),
      contentLength: buffer.length,
      body: Readable.from(buffer),
    });

    let tags =
      params.tagKeys && params.tagKeys.length > 0
        ? await this.prisma.attachmentTag.findMany({
            where: { key: { in: params.tagKeys } },
          })
        : [];
    if (params.tagKeys && tags.length !== params.tagKeys.length) {
      const missing = params.tagKeys.filter(
        (key) => !tags.find((tag) => tag.key === key),
      );
      for (const key of missing) {
        const name = key
          .split('.')
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' ');
        await this.prisma.attachmentTag.create({
          data: {
            key,
            name,
            createdById: systemUser.id,
          },
        });
      }
      tags = await this.prisma.attachmentTag.findMany({
        where: { key: { in: params.tagKeys } },
      });
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        folderId: folder?.id ?? null,
        ownerId: systemUser.id,
        uploaderNameSnapshot: systemUser.name ?? null,
        uploaderEmailSnapshot: systemUser.email ?? null,
        name: params.fileName.replace(ext, ''),
        originalName: params.fileName,
        fileName: randomName,
        mimeType: this.detectMimeType(ext),
        size: buffer.length,
        storageKey: storageKey.replace(/\\/g, '/'),
        hash,
        isPublic: params.isPublic ?? true,
        metadata: {
          seedKey: params.seedKey,
          description: params.description ?? null,
        } as Prisma.InputJsonValue,
        tags: tags.length
          ? {
              create: tags.map((tag) => ({
                tagId: tag.id,
                assignedById: systemUser.id,
              })),
            }
          : undefined,
      },
      include: {
        folder: true,
        owner: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });

    return await this.serializeAttachmentAsync(attachment);
  }

  private async resolveSystemUser() {
    let systemUser = await this.prisma.user.findFirst({
      where: {
        email: 'system@hydroline.local',
      },
    });
    if (!systemUser) {
      systemUser = await this.prisma.user.create({
        data: {
          email: 'system@hydroline.local',
          name: 'Hydroline System',
        },
      });
    }
    return systemUser;
  }

  private async resolveFolderByPath(
    userId: string,
    segments: string[],
  ): Promise<AttachmentFolder | null> {
    if (segments.length === 0) {
      return null;
    }
    let currentParentId: string | null = null;
    let folder: AttachmentFolder | null = null;

    for (const segment of segments) {
      const slug = this.slugify(segment);
      const existing = await this.prisma.attachmentFolder.findFirst({
        where: { parentId: currentParentId, slug },
      });
      if (existing) {
        currentParentId = existing.id;
        folder = existing;
        continue;
      }
      const created = await this.createFolder(userId, {
        name: segment,
        parentId: currentParentId ?? undefined,
      });
      currentParentId = created.id;
      folder = created;
    }
    return folder;
  }

  async resolveUserAvatarFolder(
    userId: string,
  ): Promise<AttachmentFolder | null> {
    return this.resolveFolderByPath(userId, ['userAvatar']);
  }

  private buildMetadata(dto: CreateAttachmentDto | UpdateAttachmentDto) {
    const metadata = dto.metadata ?? {};
    if ('description' in dto && dto.description) {
      return {
        ...metadata,
        description: dto.description,
      } as Prisma.InputJsonValue;
    }
    return metadata as Prisma.InputJsonValue | undefined;
  }

  private detectMimeType(ext: string) {
    const normalized = ext.toLowerCase();
    switch (normalized) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.svg':
        return 'image/svg+xml';
      default:
        return 'application/octet-stream';
    }
  }

  async openAttachmentStream(attachment: { storageKey: string }) {
    try {
      const head = await this.storage.headObject(attachment.storageKey);
      if (!head.exists) {
        throw new NotFoundException('Attachment file missing in storage');
      }
      return await this.storage.getObjectStream(attachment.storageKey);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('Attachment file missing in storage');
    }
  }

  private serializeAttachment(
    attachment: AttachmentWithRelations,
  ): AttachmentSummary {
    const ownerSummary = attachment.owner
      ? {
          id: attachment.owner.id,
          name: attachment.owner.name,
          email: attachment.owner.email,
          deleted: false,
        }
      : {
          id: attachment.ownerId,
          name: attachment.uploaderNameSnapshot,
          email: attachment.uploaderEmailSnapshot,
          deleted: true,
        };

    const metadata = attachment.metadata;
    const description =
      metadata && typeof metadata === 'object' && metadata !== null
        ? (metadata as Record<string, unknown>)['description']
        : null;
    const normalizedDescription =
      typeof description === 'string' ? description : null;

    return {
      id: attachment.id,
      name: this.normalizeAttachmentName(attachment.name),
      originalName: this.normalizeAttachmentName(attachment.originalName),
      mimeType: attachment.mimeType,
      size: attachment.size,
      isPublic: attachment.isPublic,
      hash: attachment.hash,
      metadata,
      description: normalizedDescription,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
      folder: attachment.folder
        ? {
            id: attachment.folder.id,
            name: attachment.folder.name,
            path: attachment.folder.path,
          }
        : null,
      owner: ownerSummary,
      tags: attachment.tags.map((tag) => ({
        id: tag.tag.id,
        key: tag.tag.key,
        name: tag.tag.name,
      })),
      publicUrl: attachment.isPublic
        ? (this.buildDirectUrlForKey(attachment.storageKey) ??
          this.buildProxyUrlForAttachmentId(attachment.id))
        : null,
    };
  }

  private async serializeAttachmentAsync(
    attachment: AttachmentWithRelations,
  ): Promise<AttachmentSummary> {
    const summary = this.serializeAttachment(attachment);
    if (!summary.publicUrl) {
      return summary;
    }

    try {
      const head = await this.storage.headObject(attachment.storageKey);
      if (!head.exists) {
        return { ...summary, publicUrl: null };
      }
    } catch {
      return { ...summary, publicUrl: null };
    }

    return summary;
  }

  private normalizeAttachmentName(input: string | null | undefined): string {
    if (!input) {
      return '';
    }
    try {
      const candidate = Buffer.from(input, 'latin1').toString('utf8');
      if (candidate.includes('�')) {
        return input;
      }
      return candidate;
    } catch {
      return input;
    }
  }

  private async ensureUniqueFolder(
    parentId: string | null | undefined,
    name: string,
    ignoreId?: string,
  ) {
    const existing = await this.prisma.attachmentFolder.findFirst({
      where: {
        parentId: parentId ?? null,
        name,
        NOT: ignoreId ? { id: ignoreId } : undefined,
      },
    });
    if (existing) {
      throw new BadRequestException('Folder with the same name already exists');
    }
  }

  private slugify(name: string) {
    const slug = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    return slug || `folder-${randomUUID().slice(0, 8)}`;
  }

  private async ensurePhysicalDirectory(pathFragment: string) {
    if (!this.isLocalStorage) {
      return;
    }
    await (this.storage as LocalAttachmentStorage).ensureDirectory(
      pathFragment,
    );
  }
}
