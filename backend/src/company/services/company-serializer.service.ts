import { Injectable } from '@nestjs/common';
import {
  CompanyCategory,
  CompanyLlcOfficerRole,
  CompanyLlcShareholderKind,
  CompanyStatus,
  CompanyVisibility,
  Prisma,
} from '@prisma/client';
import { AttachmentsService } from '../../attachments/attachments.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CompanyWithRelations } from '../types/company.types';

@Injectable()
export class CompanySerializerService {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly prisma: PrismaService,
  ) {}

  async serializeCompany(company: CompanyWithRelations, viewerId?: string) {
    const extra =
      company.extra &&
      typeof company.extra === 'object' &&
      !Array.isArray(company.extra)
        ? (company.extra as Record<string, unknown>)
        : null;
    const registryExtra =
      extra &&
      typeof extra.registry === 'object' &&
      extra.registry &&
      !Array.isArray(extra.registry)
        ? (extra.registry as Record<string, unknown>)
        : null;
    const administrativeDivision = (() => {
      const idFromColumn =
        typeof (company as unknown as { administrativeDivisionId?: unknown })
          .administrativeDivisionId === 'string'
          ? String(
              (company as unknown as { administrativeDivisionId?: string })
                .administrativeDivisionId,
            ).trim()
          : '';
      const nameFromColumn =
        typeof (company as unknown as { administrativeDivisionName?: unknown })
          .administrativeDivisionName === 'string'
          ? String(
              (company as unknown as { administrativeDivisionName?: string })
                .administrativeDivisionName,
            ).trim()
          : '';
      const levelFromColumnRaw = Number(
        (company as unknown as { administrativeDivisionLevel?: unknown })
          .administrativeDivisionLevel,
      );
      const levelFromColumn: 1 | 2 | 3 | null = [1, 2, 3].includes(
        levelFromColumnRaw,
      )
        ? (levelFromColumnRaw as 1 | 2 | 3)
        : null;

      const domicileDivisionIdRaw = registryExtra?.domicileDivisionId;
      const domicileDivisionIdFromExtra =
        typeof domicileDivisionIdRaw === 'string'
          ? domicileDivisionIdRaw.trim()
          : '';
      const domicileDivisionId = idFromColumn || domicileDivisionIdFromExtra;
      if (!domicileDivisionId) return null;
      const domicileDivisionPathRaw = registryExtra?.domicileDivisionPath;
      const domicileDivisionPath =
        domicileDivisionPathRaw &&
        typeof domicileDivisionPathRaw === 'object' &&
        !Array.isArray(domicileDivisionPathRaw)
          ? domicileDivisionPathRaw
          : null;
      const levelRaw = Number(registryExtra?.administrativeDivisionLevel);
      const levelFromExtra: 1 | 2 | 3 | null = [1, 2, 3].includes(levelRaw)
        ? (levelRaw as 1 | 2 | 3)
        : null;
      const inferredLevel: 1 | 2 | 3 | null =
        domicileDivisionPath && typeof domicileDivisionPath === 'object'
          ? (domicileDivisionPath as { level1?: { id?: string } | null })
              ?.level1?.id === domicileDivisionId
            ? 1
            : (domicileDivisionPath as { level2?: { id?: string } | null })
                  ?.level2?.id === domicileDivisionId
              ? 2
              : (domicileDivisionPath as { level3?: { id?: string } | null })
                    ?.level3?.id === domicileDivisionId
                ? 3
                : null
          : null;
      const level = levelFromColumn ?? levelFromExtra ?? inferredLevel;
      const inferredName =
        domicileDivisionPath && typeof domicileDivisionPath === 'object'
          ? level === 1
            ? String(
                (
                  domicileDivisionPath as {
                    level1?: { name?: string } | null;
                  }
                )?.level1?.name ?? '',
              ).trim()
            : level === 2
              ? String(
                  (
                    domicileDivisionPath as {
                      level2?: { name?: string } | null;
                    }
                  )?.level2?.name ?? '',
                ).trim()
              : level === 3
                ? String(
                    (
                      domicileDivisionPath as {
                        level3?: { name?: string } | null;
                      }
                    )?.level3?.name ?? '',
                  ).trim()
                : ''
          : '';
      return {
        domicileDivisionId,
        domicileDivisionName: nameFromColumn || inferredName || null,
        domicileDivisionPath,
        administrativeDivisionLevel: level ?? null,
      };
    })();

    const viewerOfficerRoles = new Set<CompanyLlcOfficerRole>();
    if (viewerId) {
      for (const officer of company.llcRegistration?.officers ?? []) {
        if (officer.userId === viewerId) {
          viewerOfficerRoles.add(officer.role);
        }
      }
    }

    const isLegalRepresentative =
      Boolean(viewerId && company.legalRepresentativeId === viewerId) ||
      viewerOfficerRoles.has(CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE);

    const isShareholder = Boolean(
      viewerId &&
        (company.llcRegistration?.shareholders ?? []).some(
          (s) =>
            s.kind === CompanyLlcShareholderKind.USER && s.userId === viewerId,
        ),
    );

    const canEdit =
      Boolean(viewerId) &&
      (isLegalRepresentative ||
        viewerOfficerRoles.has(CompanyLlcOfficerRole.MANAGER) ||
        viewerOfficerRoles.has(CompanyLlcOfficerRole.DEPUTY_MANAGER));
    const canManageMembers = false;
    const canViewDashboard =
      Boolean(viewerId) &&
      (canEdit || isShareholder || viewerOfficerRoles.size > 0);

    const attachmentUrlMap =
      await this.attachmentsService.resolvePublicUrlsByIds([
        company.logoAttachmentId,
        company.legalRepresentative?.avatarAttachmentId,
        ...(company.llcRegistration?.officers ?? []).map(
          (o) => o.user?.avatarAttachmentId,
        ),
        ...(company.llcRegistration?.shareholders ?? []).map(
          (s) => s.user?.avatarAttachmentId,
        ),
      ]);

    const logoUrl = company.logoAttachmentId
      ? (attachmentUrlMap.get(company.logoAttachmentId) ?? null)
      : null;

    const workflowContext =
      company.workflowInstance?.context &&
      typeof company.workflowInstance.context === 'object' &&
      !Array.isArray(company.workflowInstance.context)
        ? (company.workflowInstance.context as Record<string, unknown>)
        : null;
    const contextName =
      workflowContext && typeof workflowContext.name === 'string'
        ? workflowContext.name.trim()
        : '';
    const contextTypeCode =
      workflowContext && typeof workflowContext.typeCode === 'string'
        ? workflowContext.typeCode.trim()
        : '';
    const contextIndustryCode =
      workflowContext && typeof workflowContext.industryCode === 'string'
        ? workflowContext.industryCode.trim()
        : '';

    const isPendingRegistryStatus =
      company.status === CompanyStatus.DRAFT ||
      company.status === CompanyStatus.PENDING_REVIEW ||
      company.status === CompanyStatus.UNDER_REVIEW ||
      company.status === CompanyStatus.NEEDS_REVISION;

    const effectiveName =
      isPendingRegistryStatus &&
      contextName &&
      (!company.name ||
        company.name.trim() === '' ||
        company.name === '未知公司')
        ? contextName
        : company.name;

    const effectiveType =
      !company.type && isPendingRegistryStatus && contextTypeCode
        ? await this.prisma.companyType.findUnique({
            where: { code: contextTypeCode },
          })
        : company.type;

    const effectiveIndustry =
      !company.industry && isPendingRegistryStatus && contextIndustryCode
        ? await this.prisma.companyIndustry.findUnique({
            where: { code: contextIndustryCode },
          })
        : company.industry;

    return {
      id: company.id,
      name: effectiveName,
      slug: company.slug,
      summary: company.summary,
      description: company.description ?? null,
      type: effectiveType,
      industry: effectiveIndustry,
      category: company.category,
      status: company.status,
      visibility: company.visibility,
      logoUrl,
      legalRepresentative: company.legalRepresentative,
      llcRegistration: company.llcRegistration,
      policies: company.policies,
      auditRecords: company.auditRecords,
      applications: company.applications,
      workflowInstance: company.workflowInstance,
      extra: company.extra ?? null,
      administrativeDivision,
      capabilities: {
        canEdit,
        canManageMembers,
        canViewDashboard,
      },
    };
  }

  calculateDashboardStats(companies: CompanyWithRelations[]) {
    const companyCount = companies.length;
    const individualBusinessCount = companies.filter(
      (company) => company.category === CompanyCategory.INDIVIDUAL,
    ).length;
    const memberCount = companies.reduce((sum, company) => {
      const ids = new Set<string>();
      if (company.legalRepresentativeId) {
        ids.add(company.legalRepresentativeId);
      }
      for (const officer of company.llcRegistration?.officers ?? []) {
        if (officer.userId) ids.add(officer.userId);
      }
      for (const shareholder of company.llcRegistration?.shareholders ?? []) {
        if (
          shareholder.kind === CompanyLlcShareholderKind.USER &&
          shareholder.userId
        ) {
          ids.add(shareholder.userId);
        }
      }
      return sum + ids.size;
    }, 0);
    return {
      companyCount,
      individualBusinessCount,
      memberCount,
    };
  }
}
