import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyCategory,
  CompanyIndustry,
  CompanyLlcShareholderKind,
  CompanyStatus,
  CompanyType,
  CompanyVisibility,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';

import {
  AdminCompanyListQueryDto,
  AdminCreateCompanyDto,
  AdminUpdateCompanyDto,
  CompanyActionDto,
  CompanyAttachmentSearchDto,
  CompanyDeregistrationApplyDto,
  CompanyEquityTransferApplyDto,
  CompanyDirectoryQueryDto,
  CompanyRecommendationsQueryDto,
  CompanySearchDto,
  GeoDivisionSearchDto,
  CompanyUserSearchDto,
  CreateCompanyApplicationDto,
  CompanyApplicationConsentDecisionDto,
  CompanyRenameApplyDto,
  CompanyDomicileChangeApplyDto,
  CompanyBusinessScopeChangeApplyDto,
  CompanyOfficerChangeApplyDto,
  CompanyManagementChangeApplyDto,
  CompanyCapitalChangeApplyDto,
  UpdateCompanyProfileDto,
  WithdrawCompanyApplicationDto,
} from './dto/company.dto';
import {
  CreateWorldDivisionNodeDto,
  UpdateWorldDivisionNodeDto,
} from './dto/admin-geo-division.dto';
import { AttachmentsService } from '../attachments/attachments.service';
import type { UploadedStreamFile } from '../attachments/attachments.service';
import type { StoredUploadedFile } from '../attachments/uploaded-file.interface';
import {
  CompanyApplicationListQueryDto,
  CompanyApplicationSettingsDto,
  UpsertCompanyIndustryDto,
  UpsertCompanyTypeDto,
} from './dto/admin-config.dto';
import { SYSTEM_USER_EMAIL } from '../lib/shared/system-user';
import { CompanyMetaService } from './services/company-meta.service';
import { CompanyGeoService } from './services/company-geo.service';
import { CompanyConfigService } from './services/company-config.service';
import { CompanyApplicationService } from './services/company-application.service';
import { CompanyWorkflowService } from './services/company-workflow.service';
import { CompanySerializerService } from './services/company-serializer.service';
import { CompanyPermissionService } from './services/company-permission.service';
import { CompanySupportService } from './services/company-support.service';
import { CompanyAdminService } from './services/company-admin.service';
type CompanyMetaResult = {
  industries: CompanyIndustry[];
  types: CompanyType[];
};

// 旧“公司成员/岗位”系统已移除，仅保留 LLC 股东/高管体系。

@Injectable()
export class CompanyService implements OnModuleInit {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly attachmentsService: AttachmentsService,
    private readonly supportService: CompanySupportService,
    private readonly serializerService: CompanySerializerService,
    private readonly permissionService: CompanyPermissionService,
    private readonly companyWorkflowService: CompanyWorkflowService,
    private readonly metaService: CompanyMetaService,
    private readonly geoService: CompanyGeoService,
    private readonly companyConfigService: CompanyConfigService,
    private readonly applicationService: CompanyApplicationService,
    private readonly adminService: CompanyAdminService,
  ) {}

  async onModuleInit() {
    try {
      await this.metaService.ensureBaselineMetadata();
    } catch (error) {
      this.logger.warn(`加载工商基础配置失败: ${error}`);
    }
  }

  async getMeta(): Promise<CompanyMetaResult> {
    return this.metaService.getMeta();
  }

  async getDailyRegistrations(days?: number) {
    return this.metaService.getDailyRegistrations(days);
  }

  async listRecommendations(query: CompanyRecommendationsQueryDto) {
    return this.metaService.listRecommendations(query);
  }

  async listIndustries() {
    return this.metaService.listIndustries();
  }

  async searchUsers(query: CompanyUserSearchDto) {
    const keyword = query.query.trim();
    if (!keyword) {
      return [];
    }
    const limit = Math.min(query.limit ?? 20, 100);
    return this.prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { email: { contains: keyword, mode: 'insensitive' } },
              {
                profile: {
                  displayName: { contains: keyword, mode: 'insensitive' },
                },
              },
            ],
          },
          {
            NOT: { email: SYSTEM_USER_EMAIL },
          },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        profile: {
          select: {
            displayName: true,
          },
        },
      },
    });
  }

  async resolveUsers(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id?.trim())));
    if (!uniqueIds.length) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        name: true,
        email: true,
        profile: { select: { displayName: true } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      displayName: u.profile?.displayName ?? null,
    }));
  }

  async searchUserAttachments(
    userId: string,
    query: CompanyAttachmentSearchDto,
  ) {
    return this.attachmentsService.searchUserAttachments(
      userId,
      query.keyword,
      query.limit,
    );
  }

  async upsertIndustry(dto: UpsertCompanyIndustryDto) {
    return this.metaService.upsertIndustry(dto);
  }

  async listTypes() {
    return this.metaService.listTypes();
  }

  async upsertType(dto: UpsertCompanyTypeDto) {
    return this.metaService.upsertType(dto);
  }

  async listMine(userId: string) {
    const companies = await this.prisma.company.findMany({
      where: {
        OR: [
          // 允许“法定代表人”在未加入成员列表的情况下也能在用户侧看到对应主体
          {
            legalRepresentativeId: userId,
          },
          // 允许 “职员/管理层” 在未加入成员列表的情况下也能在用户侧看到对应主体
          {
            llcRegistration: {
              is: {
                officers: {
                  some: {
                    userId,
                  },
                },
              },
            },
          },
          // 允许 “股东” 在未加入成员列表的情况下也能在用户侧看到对应主体
          {
            llcRegistration: {
              is: {
                shareholders: {
                  some: {
                    kind: CompanyLlcShareholderKind.USER,
                    userId,
                  },
                },
              },
            },
          },
        ],
      },
      include: companyInclude,
      orderBy: { createdAt: 'desc' },
    });
    const stats = this.serializerService.calculateDashboardStats(companies);
    return {
      stats,
      companies: await Promise.all(
        companies.map((company) =>
          this.serializerService.serializeCompany(company, userId),
        ),
      ),
    };
  }

  async listDirectory(query: CompanyDirectoryQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 5), 50);
    const where: Prisma.CompanyWhereInput = {
      status: CompanyStatus.ACTIVE,
      visibility: CompanyVisibility.PUBLIC,
    };
    if (query.typeId) {
      where.typeId = query.typeId;
    }
    if (query.industryId) {
      where.industryId = query.industryId;
    }
    if (query.category) {
      where.category = query.category as CompanyCategory;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        include: companyInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
      items: await Promise.all(
        items.map((company) =>
          this.serializerService.serializeCompany(company),
        ),
      ),
    };
  }

  async listRegistrationAuthoritiesByDivisionId(divisionId: string) {
    return this.geoService.listRegistrationAuthoritiesByDivisionId(divisionId);
  }

  async resolveCompanies(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id?.trim())));
    if (!uniqueIds.length) {
      return [];
    }
    const companies = await this.prisma.company.findMany({
      where: {
        id: { in: uniqueIds },
        status: CompanyStatus.ACTIVE,
        visibility: CompanyVisibility.PUBLIC,
      },
      include: companyInclude,
    });
    return Promise.all(
      companies.map((company) =>
        this.serializerService.serializeCompany(company),
      ),
    );
  }

  async getCompanyDetail(id: string, viewerId?: string | null) {
    const company = await this.findCompanyOrThrow(id);
    if (!this.permissionService.canViewCompany(company, viewerId)) {
      throw new ForbiddenException(
        'No permission to view this company information',
      );
    }
    return this.serializerService.serializeCompany(
      company,
      viewerId ?? undefined,
    );
  }

  async searchCompanies(query: CompanySearchDto) {
    const keyword = query.query.trim();
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 10;
    if (!keyword) {
      return [];
    }
    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.ACTIVE,
        name: { contains: keyword, mode: 'insensitive' },
      },
      orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        type: { select: { id: true, code: true, name: true } },
        industry: { select: { id: true, code: true, name: true } },
      },
    });
    return companies;
  }

  async listWorldDivisions() {
    return this.geoService.listWorldDivisions();
  }

  async createWorldDivisionNode(
    body: CreateWorldDivisionNodeDto,
    userId?: string,
  ) {
    return this.geoService.createWorldDivisionNode(body, userId);
  }

  async updateWorldDivisionNode(
    id: string,
    body: UpdateWorldDivisionNodeDto,
    userId?: string,
  ) {
    return this.geoService.updateWorldDivisionNode(id, body, userId);
  }

  async deleteWorldDivisionNode(id: string, userId?: string) {
    return this.geoService.deleteWorldDivisionNode(id, userId);
  }

  async searchGeoDivisions(query: GeoDivisionSearchDto) {
    return this.geoService.searchGeoDivisions(query);
  }

  async getGeoDivisionPath(id: string) {
    return this.geoService.getGeoDivisionPath(id);
  }

  async getApplicationConsents(applicationId: string, userId: string) {
    return this.applicationService.getApplicationConsents(
      applicationId,
      userId,
    );
  }

  async decideApplicationConsents(
    applicationId: string,
    userId: string,
    approve: boolean,
    dto: CompanyApplicationConsentDecisionDto,
  ) {
    return this.applicationService.decideApplicationConsents(
      applicationId,
      userId,
      approve,
      dto,
    );
  }

  async listMyApplications(userId: string) {
    return this.applicationService.listMyApplications(userId);
  }

  async getMyApplicationDetail(applicationId: string, userId: string) {
    return this.applicationService.getMyApplicationDetail(
      applicationId,
      userId,
    );
  }

  async updateMyApplication(
    applicationId: string,
    userId: string,
    dto: CreateCompanyApplicationDto,
  ) {
    return this.applicationService.updateMyApplication(
      applicationId,
      userId,
      dto,
    );
  }

  async resubmitMyApplication(
    applicationId: string,
    userId: string,
    dto: { comment?: string },
  ) {
    return this.applicationService.resubmitMyApplication(
      applicationId,
      userId,
      dto,
    );
  }

  async withdrawMyApplication(
    applicationId: string,
    userId: string,
    dto: WithdrawCompanyApplicationDto,
  ) {
    return this.applicationService.withdrawMyApplication(
      applicationId,
      userId,
      dto,
    );
  }

  async listMyPendingConsents(userId: string) {
    return this.applicationService.listMyPendingConsents(userId);
  }

  async createApplication(userId: string, dto: CreateCompanyApplicationDto) {
    return this.applicationService.createApplication(userId, dto);
  }

  async createDeregistrationApplication(
    companyId: string,
    userId: string,
    dto: CompanyDeregistrationApplyDto,
  ) {
    return this.applicationService.createDeregistrationApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createRenameApplication(
    companyId: string,
    userId: string,
    dto: CompanyRenameApplyDto,
  ) {
    return this.applicationService.createRenameApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createDomicileChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyDomicileChangeApplyDto,
  ) {
    return this.applicationService.createDomicileChangeApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createBusinessScopeChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyBusinessScopeChangeApplyDto,
  ) {
    return this.applicationService.createBusinessScopeChangeApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createOfficerChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyOfficerChangeApplyDto,
  ) {
    return this.applicationService.createOfficerChangeApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createManagementChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyManagementChangeApplyDto,
  ) {
    return this.applicationService.createManagementChangeApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createCapitalChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyCapitalChangeApplyDto,
  ) {
    return this.applicationService.createCapitalChangeApplication(
      companyId,
      userId,
      dto,
    );
  }

  async createEquityTransferApplication(
    companyId: string,
    userId: string,
    dto: CompanyEquityTransferApplyDto,
  ) {
    return this.applicationService.createEquityTransferApplication(
      companyId,
      userId,
      dto,
    );
  }

  async updateCompanyAsOfficer(
    companyId: string,
    userId: string,
    dto: UpdateCompanyProfileDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    this.permissionService.assertCompanyEditor(company, userId);
    const industry = await this.supportService.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        summary: dto.summary,
        description: dto.description,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        contactAddress: dto.contactAddress,
        homepageUrl: dto.homepageUrl,
        industryId: industry?.id,
        extra: dto.extra ? this.toJsonValue(dto.extra) : Prisma.JsonNull,
        updatedById: userId,
      },
      include: companyInclude,
    });
    return this.serializerService.serializeCompany(updated, userId);
  }

  async updateCompanyLogo(
    companyId: string,
    userId: string,
    file: StoredUploadedFile,
  ) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const company = await this.findCompanyOrThrow(companyId);
    this.permissionService.assertCompanyEditor(company, userId);
    const attachment = await this.attachmentsService.uploadAttachment(
      userId,
      file,
      {
        name: `${company.slug}-logo`,
        isPublic: true,
        metadata: {
          scope: 'company-logo',
          companyId,
        },
      },
    );
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: userId,
      },
      include: companyInclude,
    });
    if (
      company.logoAttachmentId &&
      company.logoAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          company.logoAttachmentId,
        );
      } catch (error) {
        this.logger.warn(`Failed to clean old logo: ${error}`);
      }
    }
    return this.serializerService.serializeCompany(updated, userId);
  }

  async updateCompanyLogoStream(
    companyId: string,
    userId: string,
    file: UploadedStreamFile,
  ) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const company = await this.findCompanyOrThrow(companyId);
    this.permissionService.assertCompanyEditor(company, userId);

    const attachment = await this.attachmentsService.uploadAttachmentStream(
      userId,
      file,
      {
        name: `${company.slug}-logo`,
        isPublic: true,
        metadata: {
          scope: 'company-logo',
          companyId,
        },
      },
    );

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: userId,
      },
      include: companyInclude,
    });

    if (
      company.logoAttachmentId &&
      company.logoAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          company.logoAttachmentId,
        );
      } catch (error) {
        this.logger.warn(`Failed to clean old logo: ${error}`);
      }
    }

    return this.serializerService.serializeCompany(updated, userId);
  }

  async updateCompanyLogoAttachment(
    companyId: string,
    userId: string,
    attachmentId: string,
  ) {
    const attachment =
      await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (attachment.owner?.id !== userId) {
      throw new ForbiddenException('Attachment is not owned by the requester');
    }
    if (!attachment.isPublic) {
      throw new BadRequestException('Attachment must be public');
    }
    const company = await this.findCompanyOrThrow(companyId);
    this.permissionService.assertCompanyEditor(company, userId);
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: userId,
      },
      include: companyInclude,
    });
    if (
      company.logoAttachmentId &&
      company.logoAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          company.logoAttachmentId,
        );
      } catch (error) {
        this.logger.warn(`Failed to clean old logo: ${error}`);
      }
    }
    return this.serializerService.serializeCompany(updated, userId);
  }

  async updateCompanyAsAdmin(
    companyId: string,
    userId: string,
    dto: AdminUpdateCompanyDto,
  ) {
    return this.adminService.updateCompanyAsAdmin(companyId, userId, dto);
  }

  async createCompanyAsAdmin(actorId: string, dto: AdminCreateCompanyDto) {
    return this.adminService.createCompanyAsAdmin(actorId, dto);
  }

  async adminList(query: AdminCompanyListQueryDto) {
    return this.adminService.adminList(query);
  }

  async adminGet(companyId: string) {
    return this.adminService.adminGet(companyId);
  }

  async listApplications(query: CompanyApplicationListQueryDto) {
    return this.adminService.listApplications(query);
  }

  async getCompanyApplicationSettings(
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    return this.companyConfigService.getCompanyApplicationSettings(
      workflowCode,
    );
  }

  async updateCompanyApplicationSettings(
    autoApprove: boolean,
    userId: string,
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    return this.companyConfigService.updateCompanyApplicationSettings(
      autoApprove,
      userId,
      workflowCode,
    );
  }

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    return this.adminService.adminExecuteAction(companyId, actorId, dto);
  }

  async adminExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
    actorRoles: string[] = ['ADMIN'],
  ) {
    return this.adminService.adminExecuteApplicationAction(
      applicationId,
      actorId,
      dto,
      actorRoles,
    );
  }

  async listRegistryApplications(
    userId: string,
    query: CompanyApplicationListQueryDto,
  ) {
    return this.adminService.listRegistryApplications(userId, query);
  }

  async registryExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    return this.adminService.registryExecuteApplicationAction(
      applicationId,
      actorId,
      dto,
    );
  }

  async deleteCompanyAsAdmin(companyId: string, userId: string) {
    return this.adminService.deleteCompanyAsAdmin(companyId, userId);
  }

  private async findCompanyOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyInclude,
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  private toJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
