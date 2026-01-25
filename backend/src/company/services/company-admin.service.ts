import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminCompanyListQueryDto,
  AdminCreateCompanyDto,
  AdminUpdateCompanyLlcMembersDto,
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
  CompanyLlcShareholderKind,
  CompanyStatus,
  CompanyVisibility,
  WorkflowInstanceStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
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
        isAuthority: dto.isAuthority,
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

  async updateCompanyLlcMembersAsAdmin(
    companyId: string,
    userId: string,
    dto: AdminUpdateCompanyLlcMembersDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    if (!company.llcRegistration) {
      throw new BadRequestException('该公司暂无 LLC 登记信息');
    }

    this.validateAdminLlcMembers(dto);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const registration = await tx.companyLlcRegistration.findUnique({
        where: { companyId },
        select: { id: true },
      });
      if (!registration) {
        throw new BadRequestException('该公司暂无 LLC 登记信息');
      }

      const userIds = Array.from(
        new Set(
          [
            dto.legalRepresentativeId,
            ...(dto.directors?.directorIds ?? []),
            dto.directors?.chairpersonId,
            dto.directors?.viceChairpersonId,
            dto.managers?.managerId,
            dto.managers?.deputyManagerId,
            ...(dto.supervisors?.supervisorIds ?? []),
            dto.supervisors?.chairpersonId,
            dto.financialOfficerId,
            ...(dto.shareholders ?? [])
              .filter((s) => s.kind === 'USER')
              .map((s) => s.userId),
          ].filter((id): id is string => Boolean(id && id.trim())),
        ),
      );
      const companyIds = Array.from(
        new Set(
          (dto.shareholders ?? [])
            .filter((s) => s.kind === 'COMPANY')
            .map((s) => s.companyId)
            .filter((id): id is string => Boolean(id && id.trim())),
        ),
      );

      if (userIds.length) {
        const users = await tx.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            profile: { select: { displayName: true } },
          },
        });
        if (users.length !== userIds.length) {
          throw new BadRequestException('成员列表包含无效用户');
        }
      }

      if (companyIds.length) {
        const companies = await tx.company.findMany({
          where: {
            id: { in: companyIds },
            status: { not: CompanyStatus.ARCHIVED },
          },
          select: { id: true },
        });
        if (companies.length !== companyIds.length) {
          throw new BadRequestException('股东公司不存在或不可用');
        }
      }

      const legalRepresentative = await tx.user.findUnique({
        where: { id: dto.legalRepresentativeId },
        select: {
          id: true,
          name: true,
          profile: { select: { displayName: true } },
        },
      });
      if (!legalRepresentative) {
        throw new BadRequestException('法定代表人不存在');
      }

      await tx.company.update({
        where: { id: companyId },
        data: {
          legalRepresentativeId: dto.legalRepresentativeId,
          legalNameSnapshot:
            legalRepresentative.profile?.displayName ??
            legalRepresentative.name ??
            undefined,
          updatedById: userId,
        },
      });

      await tx.companyLlcRegistration.update({
        where: { id: registration.id },
        data: { updatedAt: now },
      });

      await tx.companyLlcRegistrationShareholder.deleteMany({
        where: { registrationId: registration.id },
      });
      await tx.companyLlcRegistrationOfficer.deleteMany({
        where: { registrationId: registration.id },
      });

      const votingMode =
        dto.votingRightsMode === 'CUSTOM' ? 'CUSTOM' : 'BY_CAPITAL_RATIO';
      const shareholders = (dto.shareholders ?? []).map((s) => ({
        id: randomUUID(),
        registrationId: registration.id,
        kind:
          s.kind === 'COMPANY'
            ? CompanyLlcShareholderKind.COMPANY
            : CompanyLlcShareholderKind.USER,
        userId: s.kind === 'USER' ? (s.userId ?? null) : null,
        companyId: s.kind === 'COMPANY' ? (s.companyId ?? null) : null,
        ratio: Number(s.ratio),
        votingRatio:
          votingMode === 'CUSTOM'
            ? Number(s.votingRatio ?? s.ratio)
            : Number(s.ratio),
        createdAt: now,
        updatedAt: now,
      }));
      if (shareholders.length) {
        await tx.companyLlcRegistrationShareholder.createMany({
          data: shareholders,
        });
      }

      const officers: Array<{ userId: string; role: CompanyLlcOfficerRole }> =
        [];
      officers.push({
        userId: dto.legalRepresentativeId,
        role: CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      });
      for (const id of dto.directors?.directorIds ?? []) {
        officers.push({ userId: id, role: CompanyLlcOfficerRole.DIRECTOR });
      }
      if (dto.directors?.chairpersonId) {
        officers.push({
          userId: dto.directors.chairpersonId,
          role: CompanyLlcOfficerRole.CHAIRPERSON,
        });
      }
      if (dto.directors?.viceChairpersonId) {
        officers.push({
          userId: dto.directors.viceChairpersonId,
          role: CompanyLlcOfficerRole.VICE_CHAIRPERSON,
        });
      }
      if (dto.managers?.managerId) {
        officers.push({
          userId: dto.managers.managerId,
          role: CompanyLlcOfficerRole.MANAGER,
        });
      }
      if (dto.managers?.deputyManagerId) {
        officers.push({
          userId: dto.managers.deputyManagerId,
          role: CompanyLlcOfficerRole.DEPUTY_MANAGER,
        });
      }
      for (const id of dto.supervisors?.supervisorIds ?? []) {
        officers.push({ userId: id, role: CompanyLlcOfficerRole.SUPERVISOR });
      }
      if (dto.supervisors?.chairpersonId) {
        officers.push({
          userId: dto.supervisors.chairpersonId,
          role: CompanyLlcOfficerRole.SUPERVISOR_CHAIRPERSON,
        });
      }
      if (dto.financialOfficerId) {
        officers.push({
          userId: dto.financialOfficerId,
          role: CompanyLlcOfficerRole.FINANCIAL_OFFICER,
        });
      }

      const unique = new Map<
        string,
        { userId: string; role: CompanyLlcOfficerRole }
      >();
      for (const o of officers) {
        unique.set(`${o.userId}:${o.role}`, o);
      }
      const officerRows = Array.from(unique.values()).map((o) => ({
        id: randomUUID(),
        registrationId: registration.id,
        userId: o.userId,
        role: o.role,
        createdAt: now,
        updatedAt: now,
      }));
      if (officerRows.length) {
        await tx.companyLlcRegistrationOfficer.createMany({
          data: officerRows,
        });
      }
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId,
        actorId: userId,
        actionKey: 'admin_update_llc_members',
        actionLabel: '管理员更新公司成员',
        comment: dto.comment ?? '管理员更新公司成员',
      },
    });

    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializerService.serializeCompany(refreshed, userId);
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
    const serverId = String(dto.serverId ?? '').trim();
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
      if (!serverId) {
        throw new BadRequestException('Server is required');
      }
      const path = await this.geoService.getGeoDivisionPath(
        domicileDivisionId,
        serverId,
      );
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
      isAuthority: dto.isAuthority ?? false,
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
                serverId,
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

    const authorityCompanyIdExpr = Prisma.sql`NULLIF(BTRIM(COALESCE(a."payload" #>> '{llc,registrationAuthorityCompanyId}', a."payload" #>> '{individual,registrationAuthorityCompanyId}', a."payload" #>> '{registrationAuthorityCompanyId}')), '')`;

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

  private validateAdminLlcMembers(dto: AdminUpdateCompanyLlcMembersDto) {
    const errors: string[] = [];

    const shareholders = Array.isArray(dto.shareholders)
      ? dto.shareholders
      : [];
    const normalized = shareholders
      .map((s) => ({
        kind: s.kind,
        userId: s.userId,
        companyId: s.companyId,
        ratio: typeof s.ratio === 'number' ? s.ratio : Number(s.ratio),
      }))
      .filter((s) => Number.isFinite(s.ratio));
    const sum = normalized.reduce((acc, s) => acc + (s.ratio ?? 0), 0);
    if (Math.abs(sum - 100) > 1e-6) {
      errors.push('所有股东的出资比例之和必须为 100%');
    }
    for (const s of normalized) {
      if (s.kind === 'USER' && !s.userId) {
        errors.push('股东类型为用户时必须选择 userId');
      }
      if (s.kind === 'COMPANY' && !s.companyId) {
        errors.push('股东类型为公司时必须选择 companyId');
      }
    }

    const votingMode =
      dto.votingRightsMode === 'CUSTOM' ||
      dto.votingRightsMode === 'BY_CAPITAL_RATIO'
        ? dto.votingRightsMode
        : 'BY_CAPITAL_RATIO';
    if (votingMode === 'CUSTOM') {
      const votingNormalized = (dto.shareholders ?? [])
        .map((s) => ({
          votingRatio:
            typeof s.votingRatio === 'number'
              ? s.votingRatio
              : Number(s.votingRatio),
        }))
        .filter((s) => Number.isFinite(s.votingRatio));

      if (votingNormalized.length !== (dto.shareholders ?? []).length) {
        errors.push('自定义表决权时必须为每个股东填写表决权比例');
      } else {
        const votingSum = votingNormalized.reduce(
          (acc, s) => acc + (s.votingRatio ?? 0),
          0,
        );
        if (Math.abs(votingSum - 100) > 1e-6) {
          errors.push('所有股东的表决权之和必须为 100%');
        }
        for (const s of votingNormalized) {
          if ((s.votingRatio ?? 0) < 0 || (s.votingRatio ?? 0) > 100) {
            errors.push('股东表决权必须在 0%～100% 之间');
            break;
          }
        }
      }
    }

    const directorIds = dto.directors?.directorIds ?? [];
    const uniqueDirectorIds = Array.from(new Set(directorIds));
    if (uniqueDirectorIds.length !== directorIds.length) {
      errors.push('董事名单不能重复');
    }
    if (!(directorIds.length === 1 || directorIds.length >= 3)) {
      errors.push('董事人数必须为 1 人或 3 人及以上');
    }
    if (directorIds.length > 1) {
      if (!dto.directors?.chairpersonId) {
        errors.push('董事人数大于 1 人时必须指定董事长');
      } else if (!directorIds.includes(dto.directors.chairpersonId)) {
        errors.push('董事长必须从董事中选择');
      }
      if (
        dto.directors?.viceChairpersonId &&
        !directorIds.includes(dto.directors.viceChairpersonId)
      ) {
        errors.push('副董事长必须从董事中选择');
      }
    }

    if (
      dto.managers?.managerId &&
      dto.managers?.deputyManagerId &&
      dto.managers.managerId === dto.managers.deputyManagerId
    ) {
      errors.push('经理与副经理不能为同一人');
    }

    const legal = dto.legalRepresentativeId;
    const legalCandidates = new Set<string>([
      ...directorIds,
      ...(dto.managers?.managerId ? [dto.managers.managerId] : []),
    ]);
    if (!legalCandidates.has(legal)) {
      errors.push('法定代表人必须从董事或经理中选择');
    }

    const supervisorIds = dto.supervisors?.supervisorIds ?? [];
    const uniqueSupervisorIds = Array.from(new Set(supervisorIds));
    if (uniqueSupervisorIds.length !== supervisorIds.length) {
      errors.push('监事名单不能重复');
    }
    if (supervisorIds.length > 1 && dto.supervisors?.chairpersonId) {
      if (!supervisorIds.includes(dto.supervisors.chairpersonId)) {
        errors.push('监事会主席必须从监事中选择');
      }
    }
    const forbidden = new Set<string>([
      ...directorIds,
      ...(dto.managers?.managerId ? [dto.managers.managerId] : []),
      ...(dto.managers?.deputyManagerId ? [dto.managers.deputyManagerId] : []),
      ...(dto.financialOfficerId ? [dto.financialOfficerId] : []),
    ]);
    for (const sid of supervisorIds) {
      if (forbidden.has(sid)) {
        errors.push('监事不得由董事、经理、副经理或财务负责人兼任');
        break;
      }
    }

    if (errors.length) {
      throw new BadRequestException(errors.join('；'));
    }
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
