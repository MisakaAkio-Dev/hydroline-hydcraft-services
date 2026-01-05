import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminCompanyListQueryDto,
  AdminCreateCompanyDto,
  AdminUpdateCompanyDto,
  CompanyActionDto,
} from '../dto/company.dto';
import { CompanyApplicationListQueryDto } from '../dto/admin-config.dto';
import {
  DEFAULT_COMPANY_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_DEFINITION,
} from '../company.constants';
import {
  CompanyApplicationConsentProgress,
  CompanyCategory,
  CompanyLlcOfficerRole,
  CompanyStatus,
  CompanyVisibility,
  WorkflowInstanceStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { CompanySupportService } from './company-support.service';
import { CompanySerializerService } from './company-serializer.service';
import { CompanyWorkflowService } from './company-workflow.service';
import { CompanyGeoService } from './company-geo.service';
import { companyInclude } from '../types/company.types';

@Injectable()
export class CompanyAdminService {
  private readonly logger = new Logger(CompanyAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly attachmentsService: AttachmentsService,
    private readonly supportService: CompanySupportService,
    private readonly serializerService: CompanySerializerService,
    private readonly companyWorkflowService: CompanyWorkflowService,
    private readonly geoService: CompanyGeoService,
  ) {}

  async updateCompanyAsAdmin(
    companyId: string,
    userId: string,
    dto: AdminUpdateCompanyDto,
  ) {
    const type = await this.supportService.resolveCompanyType(
      dto.typeId,
      dto.typeCode,
      true,
    );
    const industry = await this.supportService.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    if (dto.logoAttachmentId) {
      await this.attachmentsService.getAttachmentOrThrow(dto.logoAttachmentId);
    }
    const legalRepresentativeId = dto.legalRepresentativeId?.trim();
    const legalRepresentative = legalRepresentativeId
      ? await this.prisma.user.findUnique({
          where: { id: legalRepresentativeId },
          select: {
            id: true,
            name: true,
            profile: { select: { displayName: true } },
          },
        })
      : null;
    if (legalRepresentativeId && !legalRepresentative) {
      throw new BadRequestException('Invalid legal representative user');
    }
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        summary: dto.summary,
        description: dto.description,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        contactAddress: dto.contactAddress,
        homepageUrl: dto.homepageUrl,
        industryId: industry?.id ?? undefined,
        typeId: type?.id ?? undefined,
        category: dto.category,
        extra: dto.extra ? this.toJsonValue(dto.extra) : Prisma.JsonNull,
        ...(legalRepresentativeId
          ? {
              legalRepresentativeId,
              legalNameSnapshot:
                legalRepresentative?.profile?.displayName ??
                legalRepresentative?.name ??
                undefined,
            }
          : {}),
        status: dto.status,
        visibility: dto.visibility,
        highlighted: dto.highlighted,
        recommendationScore: dto.recommendationScore,
        logoAttachmentId: dto.logoAttachmentId,
        updatedById: userId,
      },
      include: companyInclude,
    });
    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: updated.id,
        actorId: userId,
        actionKey: 'admin_update',
        actionLabel: '管理员更新公司信息',
        comment: dto.auditReason ?? '管理员更新公司信息',
      },
    });
    return this.serializerService.serializeCompany(updated, userId);
  }

  async createCompanyAsAdmin(actorId: string, dto: AdminCreateCompanyDto) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_WORKFLOW_DEFINITION,
    );
    const type = await this.supportService.resolveCompanyType(
      dto.typeId,
      dto.typeCode,
      true,
    );
    const industry = await this.supportService.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    const ownerId = dto.ownerId ?? dto.legalRepresentativeId ?? actorId;
    const legalRepresentativeId = dto.legalRepresentativeId ?? ownerId;
    const isStateOrganLegalPerson = type?.code === 'state_organ_legal_person';
    const domicileDivisionId = String(dto.domicileDivisionId ?? '').trim();
    let administrativeDivisionPath: unknown | null = null;
    let administrativeDivisionLevel: 1 | 2 | 3 | null = null;
    let administrativeDivisionName: string | null = null;
    if (isStateOrganLegalPerson) {
      if (!dto.legalRepresentativeId?.trim()) {
        throw new BadRequestException('请选择法定代表人');
      }
      if (!domicileDivisionId) {
        throw new BadRequestException('请选择所属行政区划');
      }
      const path = await this.geoService.getGeoDivisionPath(domicileDivisionId);
      administrativeDivisionPath = path;
      administrativeDivisionLevel =
        path.level1?.id === domicileDivisionId
          ? 1
          : path.level2?.id === domicileDivisionId
            ? 2
            : path.level3?.id === domicileDivisionId
              ? 3
              : null;
      if (!administrativeDivisionLevel) {
        throw new BadRequestException('所属行政区划节点无效');
      }
      administrativeDivisionName = String(
        administrativeDivisionLevel === 1
          ? path.level1?.name
          : administrativeDivisionLevel === 2
            ? path.level2?.name
            : path.level3?.name,
      ).trim();
      if (!administrativeDivisionName) {
        throw new BadRequestException('所属行政区划名称无效');
      }
    }
    const ownerExists = await this.prisma.user.findUnique({
      where: { id: ownerId },
    });
    if (!ownerExists) {
      throw new BadRequestException('Invalid owner');
    }
    const legalRepresentative = await this.prisma.user.findUnique({
      where: { id: legalRepresentativeId },
      select: {
        id: true,
        name: true,
        profile: { select: { displayName: true } },
      },
    });
    if (!legalRepresentative) {
      throw new BadRequestException('Invalid legal representative user');
    }
    const workflowCode = DEFAULT_COMPANY_WORKFLOW_CODE;
    const createData: any = {
      name: dto.name,
      slug: await this.supportService.generateUniqueSlug(dto.name),
      summary: dto.summary,
      description: dto.description,
      typeId: type?.id ?? null,
      industryId: industry?.id ?? null,
      category:
        dto.category ??
        type?.category ??
        CompanyCategory.FOR_PROFIT_LEGAL_PERSON,
      legalRepresentativeId,
      legalNameSnapshot:
        legalRepresentative.profile?.displayName ??
        legalRepresentative.name ??
        undefined,
      workflowDefinitionCode: workflowCode,
      status: dto.status ?? CompanyStatus.ACTIVE,
      visibility: dto.visibility ?? CompanyVisibility.PUBLIC,
      createdById: ownerId,
      updatedById: actorId,
      lastActiveAt: new Date(),
      approvedAt: new Date(),
      activatedAt: new Date(),
      recommendationScore: 0,
      ...(isStateOrganLegalPerson
        ? {
            administrativeDivisionId: domicileDivisionId,
            administrativeDivisionName: administrativeDivisionName ?? undefined,
            administrativeDivisionLevel:
              administrativeDivisionLevel ?? undefined,
            extra: this.toJsonValue({
              registry: {
                domicileDivisionId,
                domicileDivisionPath: administrativeDivisionPath,
                administrativeDivisionLevel:
                  administrativeDivisionLevel ?? undefined,
              },
            }),
          }
        : {}),
    };
    const company = await this.prisma.company.create({ data: createData });
    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: workflowCode,
      targetType: 'company',
      targetId: company.id,
      createdById: actorId,
      context: {
        name: dto.name,
        typeCode: type?.code,
        industryCode: industry?.code,
      },
    });
    await this.prisma.workflowInstance.update({
      where: { id: workflowInstance.id },
      data: {
        currentState: 'approved',
        status: WorkflowInstanceStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowInstanceId: workflowInstance.id,
        workflowState: 'approved',
      },
    });
    const refreshed = await this.findCompanyOrThrow(company.id);
    return this.serializerService.serializeCompany(refreshed);
  }

  async adminList(query: AdminCompanyListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CompanyWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.typeId) {
      where.typeId = query.typeId;
    }
    if (query.industryId) {
      where.industryId = query.industryId;
    }
    if (query.search) {
      const keyword = query.search.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { summary: { contains: keyword, mode: 'insensitive' } },
        { slug: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: companyInclude,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: await Promise.all(
        items.map((company) =>
          this.serializerService.serializeCompany(company),
        ),
      ),
    };
  }

  async adminGet(companyId: string) {
    const company = await this.findCompanyOrThrow(companyId);
    return this.serializerService.serializeCompany(company);
  }

  async listApplications(query: CompanyApplicationListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CompanyApplicationWhereInput = {
      consentStatus: CompanyApplicationConsentProgress.APPROVED,
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.workflowCode) {
      where.workflowInstance = {
        definition: {
          code: query.workflowCode,
        },
      };
    }
    if (query.search) {
      const keyword = query.search.trim();
      where.OR = [
        {
          notes: { contains: keyword, mode: 'insensitive' },
        },
        {
          company: {
            name: { contains: keyword, mode: 'insensitive' },
          },
        },
        {
          applicant: {
            name: { contains: keyword, mode: 'insensitive' },
          },
        },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.companyApplication.count({ where }),
      this.prisma.companyApplication.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          type: true,
          industry: true,
          company: {
            include: {
              type: true,
              industry: true,
            },
          },
          applicant: {
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
          },
          workflowInstance: {
            include: {
              definition: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
      items,
    };
  }

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const result = await this.companyWorkflowService.adminExecuteAction(
      companyId,
      actorId,
      dto,
    );
    if (result.type === 'company') {
      const company = await this.findCompanyOrThrow(result.companyId);
      return this.serializerService.serializeCompany(company);
    }
    return result.application;
  }

  async adminExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
    actorRoles: string[] = ['ADMIN'],
  ) {
    const result =
      await this.companyWorkflowService.adminExecuteApplicationAction(
        applicationId,
        actorId,
        dto,
        actorRoles,
      );
    if (result.type === 'company') {
      const company = await this.findCompanyOrThrow(result.companyId);
      return this.serializerService.serializeCompany(company);
    }
    return result.application;
  }

  async listRegistryApplications(
    userId: string,
    query: CompanyApplicationListQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const workflowCode = query.workflowCode?.trim();
    const keyword = query.search?.trim();

    const authorityCompanyIdExpr = Prisma.sql`NULLIF(BTRIM(COALESCE(a."payload" #>> '{llc,registrationAuthorityCompanyId}', a."payload" #>> '{registrationAuthorityCompanyId}')), '')`;

    const fromAndWhere = Prisma.sql`
      FROM "company_applications" a
      JOIN "companies" authCompany ON authCompany."id" = ${authorityCompanyIdExpr}
      JOIN "users" applicant ON applicant."id" = a."applicantId"
      LEFT JOIN "companies" targetCompany ON targetCompany."id" = a."companyId"
      ${workflowCode ? Prisma.sql`JOIN "workflow_instances" wi ON wi."id" = a."workflowInstanceId"` : Prisma.empty}
      WHERE
        a."consentStatus" = (${CompanyApplicationConsentProgress.APPROVED}::"CompanyApplicationConsentProgress")
        ${query.status ? Prisma.sql`AND a."status" = (${query.status}::"CompanyApplicationStatus")` : Prisma.empty}
        ${workflowCode ? Prisma.sql`AND wi."definitionCode" = ${workflowCode}` : Prisma.empty}
        ${
          keyword
            ? Prisma.sql`
            AND (
              a."notes" ILIKE ${`%${keyword}%`}
              OR targetCompany."name" ILIKE ${`%${keyword}%`}
              OR applicant."name" ILIKE ${`%${keyword}%`}
            )
          `
            : Prisma.empty
        }
        AND (
          authCompany."legalRepresentativeId" = ${userId}
          OR EXISTS (
            SELECT 1
            FROM "company_llc_registrations" r
            JOIN "company_llc_registration_officers" o
              ON o."registrationId" = r."id"
            WHERE
              r."companyId" = authCompany."id"
              AND o."userId" = ${userId}
              AND o."role" = (${CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE}::"CompanyLlcOfficerRole")
          )
        )
    `;

    const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint as "count" ${fromAndWhere}`,
    );
    const total = Number(totalRows?.[0]?.count ?? 0);

    if (!total) {
      return {
        total: 0,
        page,
        pageSize,
        pageCount: 1,
        items: [],
      };
    }

    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT a."id" as "id"
        ${fromAndWhere}
        ORDER BY a."submittedAt" DESC
        LIMIT ${pageSize}
        OFFSET ${(page - 1) * pageSize}
      `,
    );
    const ids = idRows.map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      return {
        total,
        page,
        pageSize,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
        items: [],
      };
    }

    const itemsRaw = await this.prisma.companyApplication.findMany({
      where: { id: { in: ids } },
      include: {
        type: true,
        industry: true,
        company: {
          include: {
            type: true,
            industry: true,
            llcRegistration: true,
          },
        },
        applicant: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        workflowInstance: {
          include: { definition: true },
        },
      },
    });

    const order = new Map(ids.map((id, idx) => [id, idx]));
    const items = [...itemsRaw].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
      items,
    };
  }

  async registryExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const result =
      await this.companyWorkflowService.registryExecuteApplicationAction(
        applicationId,
        actorId,
        dto,
      );
    if (result.type === 'company') {
      const company = await this.findCompanyOrThrow(result.companyId);
      return this.serializerService.serializeCompany(company);
    }
    return result.application;
  }

  async deleteCompanyAsAdmin(companyId: string, userId: string) {
    await this.findCompanyOrThrow(companyId);
    await this.prisma.company.delete({ where: { id: companyId } });
    this.logger.log(`Company ${companyId} deleted by ${userId}`);
    return { success: true };
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
