import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyCategory,
  CompanyLlcOfficerRole,
  CompanyStatus,
  CompanyVisibility,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdministrationService } from '../../administration/administration.service';
import { ConfigService } from '../../config/config.service';
import { CompanySupportService } from './company-support.service';
import { SYSTEM_USER_EMAIL } from '../../lib/shared/system-user';
import {
  GeoDivisionSearchDto,
  IndividualBusinessApplicationDto,
  LimitedLiabilityCompanyApplicationDto,
  PublicInstitutionApplicationDto,
} from '../dto/company.dto';
const COMPANY_CONFIG_NAMESPACE = 'company';
const COMPANY_SUPER_AUTHORITY_COMPANY_ID_KEY =
  'registry_super_authority_company_id';

export type WorldDivisionNode = {
  id: string;
  name: string;
  level: number;
  parentId?: string | null;
};

@Injectable()
export class CompanyGeoService {
  private readonly SUPER_AUTHORITY_NAME = '服务器市场监督管理总局';
  private readonly LEGACY_SUPER_AUTHORITY_NAME = '氢气市场监督管理总局';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly administrationService: AdministrationService,
    private readonly supportService: CompanySupportService,
  ) {}

  /**
   * 确保最高登记机关（总局）公司存在，并将其 companyId 持久化到配置项。
   * - 只记录 UUID，不依赖 name，避免后续更名导致重复创建
   */
  async ensureSuperAuthorityCompany() {
    const systemUser = await this.resolveSystemUser();
    const configured = await this.readSuperAuthorityCompanyId();

    if (configured) {
      const exists = await this.prisma.company.findFirst({
        where: {
          id: configured,
          status: { not: CompanyStatus.ARCHIVED },
        },
        select: { id: true, name: true, isAuthority: true },
      });
      if (exists) {
        if (!exists.isAuthority) {
          return this.prisma.company.update({
            where: { id: exists.id },
            data: {
              isAuthority: true,
              updatedById: systemUser.id,
            },
            select: { id: true, name: true, isAuthority: true },
          });
        }
        return exists;
      }
    }

    let fallback = await this.prisma.company.findFirst({
      where: {
        status: { not: CompanyStatus.ARCHIVED },
        type: { is: { code: 'state_organ_legal_person' } },
        OR: [
          { name: this.SUPER_AUTHORITY_NAME },
          { name: this.LEGACY_SUPER_AUTHORITY_NAME },
        ],
      },
      select: { id: true, name: true, isAuthority: true },
    });
    if (fallback) {
      if (!fallback.isAuthority) {
        fallback = await this.prisma.company.update({
          where: { id: fallback.id },
          data: {
            isAuthority: true,
            updatedById: systemUser.id,
          },
          select: { id: true, name: true, isAuthority: true },
        });
      }
      await this.writeSuperAuthorityCompanyId(fallback.id, systemUser.id);
      return fallback;
    }

    const type = await this.prisma.companyType.findFirst({
      where: { code: 'state_organ_legal_person' },
      select: { id: true, category: true },
    });
    if (!type) {
      throw new BadRequestException(
        '缺少 company type: state_organ_legal_person',
      );
    }

    const now = new Date();
    const created = await this.prisma.company.create({
      data: {
        name: this.SUPER_AUTHORITY_NAME,
        slug: await this.supportService.generateUniqueSlug(
          this.SUPER_AUTHORITY_NAME,
        ),
        typeId: type.id,
        category: type.category ?? CompanyCategory.SPECIAL_LEGAL_PERSON,
        visibility: CompanyVisibility.PUBLIC,
        status: CompanyStatus.ACTIVE,
        isAuthority: true,
        legalRepresentativeId: systemUser.id,
        legalNameSnapshot: systemUser.name ?? 'System',
        createdById: systemUser.id,
        updatedById: systemUser.id,
        approvedAt: now,
        activatedAt: now,
        lastActiveAt: now,
      },
      select: { id: true, name: true },
    });
    await this.writeSuperAuthorityCompanyId(created.id, systemUser.id);
    return created;
  }

  async searchGeoDivisions(query: GeoDivisionSearchDto) {
    const q = query.q?.trim().toLowerCase() ?? '';
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 20;
    if (!query.serverId) {
      throw new BadRequestException('serverId is required');
    }
    return this.administrationService.searchDivisions(query.serverId, {
      q,
      level: query.level,
      parentId: query.parentId,
      limit,
    });
  }

  async getGeoDivisionPath(id: string, serverId: string) {
    const path = await this.getGeoDivisionPathNodes(id, serverId);
    return {
      level1: path.find((n) => n.level === 1) ?? null,
      level2: path.find((n) => n.level === 2) ?? null,
      level3: path.find((n) => n.level === 3) ?? null,
    };
  }

  async resolveAuthorityDivisionIdsByDivisionId(
    divisionId: string,
    serverId: string,
  ) {
    const id = String(divisionId ?? '').trim();
    if (!id) return [];
    const path = await this.getGeoDivisionPathNodes(id, serverId);
    return Array.from(
      new Set(
        path
          .map((n) => n.id)
          .filter(
            (x): x is string => typeof x === 'string' && x.trim().length > 0,
          ),
      ),
    );
  }

  async resolveAuthorityMatchersByDivisionId(
    divisionId: string,
    serverId: string,
  ) {
    const id = String(divisionId ?? '').trim();
    if (!id) {
      return [this.SUPER_AUTHORITY_NAME, '市场监督管理总局'];
    }
    const path = await this.getGeoDivisionPathNodes(id, serverId);
    const items: string[] = [];
    for (const node of path.slice().reverse()) {
      if (node?.name) items.push(`${node.name}`);
    }
    items.push(this.SUPER_AUTHORITY_NAME);
    items.push('市场监督管理总局');
    return Array.from(new Set(items.filter((v) => v.trim().length > 0)));
  }

  async listRegistrationAuthoritiesByDivisionId(
    divisionId: string,
    serverId?: string,
  ) {
    const companies = await this.prisma.$queryRaw<
      Array<{ id: string; name: string }>
    >(
      Prisma.sql`
        SELECT
          c."id",
          c."name"
        FROM "companies" c
        WHERE
          c."status"::text = ${CompanyStatus.ACTIVE}
          AND c."isAuthority" = true
        ORDER BY
          c."administrativeDivisionLevel" DESC NULLS LAST,
          c."name" ASC
        LIMIT 200
      `,
    );

    const seen = new Set<string>();
    const uniq: Array<{ id: string; name: string }> = [];
    for (const c of companies) {
      if (!c?.id) continue;
      if (seen.has(c.id)) continue;
      const name = String(c.name ?? '').trim();
      if (!name) continue;
      seen.add(c.id);
      uniq.push({ id: c.id, name });
    }

    // 总局（最高登记机关）：无论行政区划如何都应可选
    try {
      const superAuthority = await this.ensureSuperAuthorityCompany();
      if (!seen.has(superAuthority.id)) {
        uniq.unshift({
          id: superAuthority.id,
          name:
            String(superAuthority.name ?? '').trim() ||
            this.SUPER_AUTHORITY_NAME,
        });
      }
    } catch {
      // best-effort: 不影响常规列表
    }

    if (uniq.length > 200) return uniq.slice(0, 200);
    return uniq;
  }

  async normalizeAndValidateLlcRegistrationAuthority(
    llc: LimitedLiabilityCompanyApplicationDto,
  ) {
    const domicileDivisionId = String(llc.domicileDivisionId ?? '').trim();
    const serverId = String(llc.serverId ?? '').trim();
    const authorityCompanyId = String(
      (llc as unknown as { registrationAuthorityCompanyId?: string | null })
        .registrationAuthorityCompanyId ?? '',
    ).trim();
    const authorityNameRaw = String(llc.registrationAuthorityName ?? '').trim();

    if (!domicileDivisionId) {
      throw new BadRequestException('缺少住所地行政区划，无法校验登记机关');
    }
    if (!serverId) {
      throw new BadRequestException(
        'Missing serverId for registration authority validation',
      );
    }

    const authorities = await this.listRegistrationAuthoritiesByDivisionId(
      domicileDivisionId,
      serverId,
    );

    if (authorityCompanyId) {
      const matched = authorities.find(
        (item) => item.id === authorityCompanyId,
      );
      if (!matched) {
        throw new BadRequestException('登记机关不存在或不可用');
      }
      llc.registrationAuthorityName = matched.name;
      return;
    }

    if (!authorityNameRaw) {
      throw new BadRequestException('请选择登记机关（市场监督管理局）');
    }
    const matchedByName = authorities.find(
      (item) => item.name.trim() === authorityNameRaw,
    );
    if (!matchedByName) {
      throw new BadRequestException('登记机关不属于所选行政区划的可选范围');
    }
    llc.registrationAuthorityName = matchedByName.name;
    if (
      !(llc as unknown as { registrationAuthorityCompanyId?: string | null })
        .registrationAuthorityCompanyId
    ) {
      (
        llc as unknown as { registrationAuthorityCompanyId?: string | null }
      ).registrationAuthorityCompanyId = matchedByName.id;
    }
  }

  async normalizeAndValidateIndividualRegistrationAuthority(
    individual: IndividualBusinessApplicationDto,
  ) {
    const domicileDivisionId = String(
      individual.domicileDivisionId ?? '',
    ).trim();
    const serverId = String(individual.serverId ?? '').trim();
    const authorityCompanyId = String(
      (
        individual as unknown as {
          registrationAuthorityCompanyId?: string | null;
        }
      ).registrationAuthorityCompanyId ?? '',
    ).trim();
    const authorityNameRaw = String(
      individual.registrationAuthorityName ?? '',
    ).trim();

    if (!domicileDivisionId) {
      throw new BadRequestException('缺少住所地行政区划，无法校验登记机关');
    }
    if (!serverId) {
      throw new BadRequestException(
        'Missing serverId for registration authority validation',
      );
    }

    const authorities = await this.listRegistrationAuthoritiesByDivisionId(
      domicileDivisionId,
      serverId,
    );

    if (authorityCompanyId) {
      const matched = authorities.find(
        (item) => item.id === authorityCompanyId,
      );
      if (!matched) {
        throw new BadRequestException('登记机关不存在或不可用');
      }
      individual.registrationAuthorityName = matched.name;
      return;
    }

    if (!authorityNameRaw) {
      throw new BadRequestException('请选择登记机关（市场监督管理局）');
    }
    const matchedByName = authorities.find(
      (item) => item.name.trim() === authorityNameRaw,
    );
    if (!matchedByName) {
      throw new BadRequestException('登记机关不属于所选行政区划的可选范围');
    }
    individual.registrationAuthorityName = matchedByName.name;
    if (
      !(
        individual as unknown as {
          registrationAuthorityCompanyId?: string | null;
        }
      ).registrationAuthorityCompanyId
    ) {
      (
        individual as unknown as {
          registrationAuthorityCompanyId?: string | null;
        }
      ).registrationAuthorityCompanyId = matchedByName.id;
    }
  }

  async normalizeAndValidatePublicInstitutionRegistrationAuthority(
    institution: PublicInstitutionApplicationDto,
  ) {
    const domicileDivisionId = String(
      institution.domicileDivisionId ?? '',
    ).trim();
    const serverId = String(institution.serverId ?? '').trim();
    const authorityCompanyId = String(
      (
        institution as unknown as {
          registrationAuthorityCompanyId?: string | null;
        }
      ).registrationAuthorityCompanyId ?? '',
    ).trim();
    const authorityNameRaw = String(
      institution.registrationAuthorityName ?? '',
    ).trim();

    if (!domicileDivisionId) {
      throw new BadRequestException('缺少住所地行政区划，无法校验登记机关');
    }
    if (!serverId) {
      throw new BadRequestException(
        'Missing serverId for registration authority validation',
      );
    }

    const authorities = await this.listRegistrationAuthoritiesByDivisionId(
      domicileDivisionId,
      serverId,
    );

    if (authorityCompanyId) {
      const matched = authorities.find(
        (item) => item.id === authorityCompanyId,
      );
      if (!matched) {
        throw new BadRequestException('登记机关不存在或不可用');
      }
      institution.registrationAuthorityName = matched.name;
      return;
    }

    if (!authorityNameRaw) {
      throw new BadRequestException('请选择登记机关（市场监督管理局）');
    }
    const matchedByName = authorities.find(
      (item) => item.name.trim() === authorityNameRaw,
    );
    if (!matchedByName) {
      throw new BadRequestException('登记机关不属于所选行政区划的可选范围');
    }
    institution.registrationAuthorityName = matchedByName.name;
    if (
      !(
        institution as unknown as {
          registrationAuthorityCompanyId?: string | null;
        }
      ).registrationAuthorityCompanyId
    ) {
      (
        institution as unknown as {
          registrationAuthorityCompanyId?: string | null;
        }
      ).registrationAuthorityCompanyId = matchedByName.id;
    }
  }

  async resolveRegistrationAuthorityForApplication(applicationId: string) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        payload: true,
        company: {
          select: {
            llcRegistration: {
              select: {
                registrationAuthorityName: true,
                registrationAuthorityCompanyId: true,
              },
            },
          },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    const payloadAuthorityCompanyId =
      this.extractRegistrationAuthorityCompanyIdFromApplicationPayload(
        application.payload,
      );
    const payloadAuthority =
      this.extractRegistrationAuthorityNameFromApplicationPayload(
        application.payload,
      );
    if (payloadAuthorityCompanyId || payloadAuthority) {
      return {
        companyId: payloadAuthorityCompanyId,
        name: payloadAuthority,
      };
    }
    const companyAuthority =
      application.company?.llcRegistration?.registrationAuthorityName ?? null;
    const companyAuthorityCompanyId =
      application.company?.llcRegistration?.registrationAuthorityCompanyId ??
      null;
    return {
      companyId: companyAuthorityCompanyId
        ? String(companyAuthorityCompanyId).trim() || null
        : null,
      name: companyAuthority ? String(companyAuthority).trim() || null : null,
    };
  }

  async assertIsRegistryLegalRepresentativeForApplication(
    applicationId: string,
    actorId: string,
  ) {
    const authority =
      await this.resolveRegistrationAuthorityForApplication(applicationId);
    if (!authority.companyId && !authority.name) {
      throw new BadRequestException('该申请未关联登记机关，无法由登记机关审批');
    }
    if (authority.companyId) {
      const companyId = String(authority.companyId).trim();
      const authorityCompany = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          status: { not: CompanyStatus.ARCHIVED },
          OR: [
            { legalRepresentativeId: actorId },
            {
              llcRegistration: {
                is: {
                  officers: {
                    some: {
                      userId: actorId,
                      role: CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
                    },
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
        },
      });
      if (!authorityCompany) {
        throw new ForbiddenException('仅登记机关法定代表人可审批该申请');
      }
      return authorityCompany;
    }

    const authorityCompany = await this.prisma.company.findFirst({
      where: {
        status: { not: CompanyStatus.ARCHIVED },
        type: { is: { code: 'state_organ_legal_person' } },
        name: authority.name ?? '',
        OR: [
          { legalRepresentativeId: actorId },
          {
            llcRegistration: {
              is: {
                officers: {
                  some: {
                    userId: actorId,
                    role: CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true, name: true },
    });
    if (!authorityCompany) {
      throw new ForbiddenException('仅登记机关法定代表人可审批该申请');
    }
    return authorityCompany;
  }

  async listRegistryAuthoritiesForUser(userId: string) {
    const authorities = await this.prisma.company.findMany({
      where: {
        status: { not: CompanyStatus.ARCHIVED },
        OR: [
          { legalRepresentativeId: userId },
          {
            llcRegistration: {
              is: {
                officers: {
                  some: {
                    userId,
                    role: CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true, name: true },
      take: 50,
    });
    return authorities
      .map((c) => ({ id: c.id, name: String(c.name ?? '').trim() }))
      .filter((c) => Boolean(c.id));
  }

  private async getGeoDivisionPathNodes(id: string, serverId: string) {
    return this.administrationService.getDivisionPath(serverId, id);
  }

  private extractRegistrationAuthorityNameFromApplicationPayload(
    payload: Prisma.JsonValue | null,
  ) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const raw = payload as Record<string, unknown>;
    const top = raw.registrationAuthorityName;
    const topName =
      typeof top === 'string' ? top.trim() : String(top ?? '').trim();
    if (topName) return topName;

    const llc = raw.llc;
    if (!llc || typeof llc !== 'object' || Array.isArray(llc)) return null;
    const llcRaw = llc as Record<string, unknown>;
    const llcAuthority = llcRaw.registrationAuthorityName;
    const llcName =
      typeof llcAuthority === 'string'
        ? llcAuthority.trim()
        : String(llcAuthority ?? '').trim();
    if (llcName) return llcName;

    const individual = raw.individual;
    if (
      individual &&
      typeof individual === 'object' &&
      !Array.isArray(individual)
    ) {
      const individualRaw = individual as Record<string, unknown>;
      const individualAuthority = individualRaw.registrationAuthorityName;
      const individualName =
        typeof individualAuthority === 'string'
          ? individualAuthority.trim()
          : String(individualAuthority ?? '').trim();
      if (individualName) return individualName;
    }

    const institution = raw.publicInstitution;
    if (
      !institution ||
      typeof institution !== 'object' ||
      Array.isArray(institution)
    ) {
      return null;
    }
    const institutionRaw = institution as Record<string, unknown>;
    const institutionAuthority = institutionRaw.registrationAuthorityName;
    const institutionName =
      typeof institutionAuthority === 'string'
        ? institutionAuthority.trim()
        : String(institutionAuthority ?? '').trim();
    return institutionName || null;
  }

  private extractRegistrationAuthorityCompanyIdFromApplicationPayload(
    payload: Prisma.JsonValue | null,
  ) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const raw = payload as Record<string, unknown>;
    const top = raw.registrationAuthorityCompanyId;
    const topId =
      typeof top === 'string' ? top.trim() : String(top ?? '').trim();
    if (topId) return topId;

    const llc = raw.llc;
    if (!llc || typeof llc !== 'object' || Array.isArray(llc)) return null;
    const llcRaw = llc as Record<string, unknown>;
    const llcAuthorityId = llcRaw.registrationAuthorityCompanyId;
    const llcId =
      typeof llcAuthorityId === 'string'
        ? llcAuthorityId.trim()
        : String(llcAuthorityId ?? '').trim();
    if (llcId) return llcId;

    const individual = raw.individual;
    if (
      individual &&
      typeof individual === 'object' &&
      !Array.isArray(individual)
    ) {
      const individualRaw = individual as Record<string, unknown>;
      const individualAuthorityId =
        individualRaw.registrationAuthorityCompanyId;
      const individualId =
        typeof individualAuthorityId === 'string'
          ? individualAuthorityId.trim()
          : String(individualAuthorityId ?? '').trim();
      if (individualId) return individualId;
    }

    const institution = raw.publicInstitution;
    if (
      !institution ||
      typeof institution !== 'object' ||
      Array.isArray(institution)
    ) {
      return null;
    }
    const institutionRaw = institution as Record<string, unknown>;
    const institutionAuthorityId =
      institutionRaw.registrationAuthorityCompanyId;
    const institutionId =
      typeof institutionAuthorityId === 'string'
        ? institutionAuthorityId.trim()
        : String(institutionAuthorityId ?? '').trim();
    return institutionId || null;
  }

  async assertAuthorityNameAllowedForDivision(
    authorityName: string,
    domicileDivisionId: string,
    serverId?: string,
  ) {
    const name = String(authorityName ?? '').trim();
    if (!name) {
      throw new BadRequestException('登记机关信息无效');
    }
    const resolvedServerId =
      serverId && serverId.trim().length > 0
        ? serverId
        : await this.administrationService.getDivisionServerId(
            domicileDivisionId,
          );
    const authorities = await this.listRegistrationAuthoritiesByDivisionId(
      domicileDivisionId,
      resolvedServerId,
    );
    const ok = authorities.some((item) => item.name.trim() === name);
    if (!ok) {
      throw new BadRequestException('登记机关不属于所选行政区划的可选范围');
    }
  }

  private async resolveSystemUser() {
    const systemUser =
      (await this.prisma.user.findFirst({
        where: { email: SYSTEM_USER_EMAIL },
        select: { id: true, name: true },
      })) ??
      (await this.prisma.user.create({
        data: {
          email: SYSTEM_USER_EMAIL,
          name: 'System',
        },
        select: { id: true, name: true },
      }));
    return systemUser;
  }

  private normalizeCompanyId(value: unknown) {
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'object' && value !== null) {
      const raw = (value as { companyId?: unknown }).companyId;
      if (typeof raw === 'string') return raw.trim() || null;
    }
    return null;
  }

  private async readSuperAuthorityCompanyId() {
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      COMPANY_SUPER_AUTHORITY_COMPANY_ID_KEY,
    );
    return this.normalizeCompanyId(entry?.value);
  }

  private async writeSuperAuthorityCompanyId(
    companyId: string,
    userId: string,
  ) {
    const id = String(companyId ?? '').trim();
    if (!id) return;
    const namespace = await this.configService.ensureNamespaceByKey(
      COMPANY_CONFIG_NAMESPACE,
      {
        name: '工商系统配置',
        description: '工商系统全局设置',
      },
    );
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      COMPANY_SUPER_AUTHORITY_COMPANY_ID_KEY,
    );
    if (entry) {
      await this.configService.updateEntry(entry.id, { value: id }, userId);
      return;
    }
    await this.configService.createEntry(
      namespace.id,
      {
        key: COMPANY_SUPER_AUTHORITY_COMPANY_ID_KEY,
        value: id,
        description:
          '最高登记机关（总局）companyId（UUID），避免更名导致重复创建',
      },
      userId,
    );
  }
}
