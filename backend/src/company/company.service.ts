import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyApplicationStatus,
  CompanyApplicationConsentProgress,
  CompanyApplicationConsentRole,
  CompanyApplicationConsentStatus,
  CompanyCategory,
  CompanyIndustry,
  CompanyLlcOfficerRole,
  CompanyLlcOperatingTermType,
  CompanyLlcShareholderKind,
  CompanyStatus,
  CompanyType,
  CompanyVisibility,
  Prisma,
  WorkflowInstanceStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';

type ManagementOfficerConsentRole =
  | typeof CompanyApplicationConsentRole.MANAGER
  | typeof CompanyApplicationConsentRole.DEPUTY_MANAGER
  | typeof CompanyApplicationConsentRole.FINANCIAL_OFFICER;
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
  LimitedLiabilityCompanyApplicationDto,
  UpdateCompanyProfileDto,
  WithdrawCompanyApplicationDto,
} from './dto/company.dto';
import {
  CreateWorldDivisionNodeDto,
  UpdateWorldDivisionNodeDto,
} from './dto/admin-geo-division.dto';
import {
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE,
  DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
  DEFAULT_COMPANY_RENAME_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_DEFINITION,
} from './company.constants';
import { AttachmentsService } from '../attachments/attachments.service';
import type { UploadedStreamFile } from '../attachments/attachments.service';
import type { StoredUploadedFile } from '../attachments/uploaded-file.interface';
import { ConfigService } from '../config/config.service';
import {
  CompanyApplicationListQueryDto,
  CompanyApplicationSettingsDto,
  UpsertCompanyIndustryDto,
  UpsertCompanyTypeDto,
} from './dto/admin-config.dto';
import type {
  WorkflowDefinitionWithConfig,
  WorkflowTransitionResult,
} from '../workflow/workflow.types';

const companyInclude = Prisma.validator<Prisma.CompanyInclude>()({
  type: true,
  industry: true,
  legalRepresentative: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarAttachmentId: true,
      profile: {
        select: {
          displayName: true,
        },
      },
    },
  },
  policies: {
    orderBy: { createdAt: 'desc' },
  },
  auditRecords: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      actor: {
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
    },
  },
  applications: {
    orderBy: { submittedAt: 'desc' },
    take: 5,
  },
  llcRegistration: {
    include: {
      shareholders: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarAttachmentId: true,
              profile: { select: { displayName: true } },
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              legalRepresentativeId: true,
              unifiedSocialCreditCode: true,
              registrationNumber: true,
            },
          },
        },
      },
      officers: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarAttachmentId: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
    },
  },
  workflowInstance: {
    include: { definition: true },
  },
});

const COMPANY_CONFIG_NAMESPACE = 'company';
const COMPANY_CONFIG_AUTO_APPROVE_KEY = 'auto_approve_applications';
const WORLD_ADMIN_DIVISIONS_NAMESPACE = 'world.admin_divisions';
const WORLD_ADMIN_DIVISIONS_KEY = 'divisions_v1';

type WorldDivisionNode = {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  parentId?: string | null;
};

type CompanyWithRelations = Prisma.CompanyGetPayload<{
  include: typeof companyInclude;
}>;

type CompanyMetaResult = {
  industries: CompanyIndustry[];
  types: CompanyType[];
};

type CompanyRegistrationStatRow = {
  date: string;
  total: number;
  individual: number;
};

const DEFAULT_INDUSTRIES = [
  {
    code: 'it-service',
    name: '信息技术与服务',
    description: '软件、互联网、数字化运营服务。',
  },
  {
    code: 'manufacturing',
    name: '制造业',
    description: '传统与高端制造、自动化、装备。',
  },
  {
    code: 'finance',
    name: '金融与投资',
    description: '银行、支付、虚拟经济与资产管理。',
  },
  {
    code: 'culture',
    name: '文化创意',
    description: '媒体、设计、文娱和内容生产。',
  },
  {
    code: 'education',
    name: '教育与培训',
    description: '教育科技、职业培训与认证。',
  },
  {
    code: 'logistics',
    name: '交通与物流',
    description: '运输、仓储、供应链与港航。',
  },
  {
    code: 'energy',
    name: '能源与环境',
    description: '新能源、环保、能源服务。',
  },
  {
    code: 'healthcare',
    name: '医疗与健康',
    description: '医疗、康复、营养与保健。',
  },
  {
    code: 'real-estate',
    name: '房地产与建设',
    description: '地产开发、建筑施工与物业。',
  },
  {
    code: 'retail',
    name: '批发与零售',
    description: '消费零售、供应链与分销。',
  },
];

const DEFAULT_COMPANY_TYPES = [
  {
    code: 'limited_liability_company',
    name: '有限责任公司',
    description:
      '根据《中华人民共和国公司登记管理条例》规定登记注册，由五十个以下股东出资设立，股东以其所认缴的出资额为限对公司承担有限责任，公司以其全部财产对自身债务承担责任的经济组织。',
    category: CompanyCategory.FOR_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'join_stock_company_limited_by_shares',
    name: '股份有限公司',
    description: '公司资本由股份组成、股东以认购股份为限承担责任的法人组织。',
    category: CompanyCategory.FOR_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'other_enterprise_that_has_the_legal_person_status',
    name: '其他企业法人',
    description: '其他企业法人，如国有独资公司、集体所有制企业等。',
    category: CompanyCategory.FOR_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'public_institution',
    name: '事业单位',
    description:
      '国家为公益目的设立，由国家机关或其他组织利用国有资产举办，从事教育、科技、文化、卫生、体育等活动的社会服务组织。',
    category: CompanyCategory.NON_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'social_organization',
    name: '社会团体',
    description:
      '公民自愿组成，为实现会员共同意愿，按照其章程开展活动的非营利性社会组织。',
    category: CompanyCategory.NON_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'foundation',
    name: '基金会',
    description:
      '利用自然人、法人或其他组织捐赠的财产，以从事公益事业为目的成立的非营利性法人。',
    category: CompanyCategory.NON_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'social_service_institution',
    name: '社会服务机构',
    description:
      '由企业、事业单位、社会团体或个人利用非国有资产举办的公益性、非营利性社会组织。',
    category: CompanyCategory.NON_PROFIT_LEGAL_PERSON,
  },
  {
    code: 'state_organ_legal_person',
    name: '机关法人',
    description:
      '依照法律和行政命令组建，具有独立经费且自成立之日起即取得法人资格的各级国家机关及承担行政职能的法定机构。',
    category: CompanyCategory.SPECIAL_LEGAL_PERSON,
  },
  {
    code: 'rural_economic_collective_legal_person',
    name: '农村集体经济组织法人',
    description:
      '以土地集体所有为基础，依法代表成员集体行使所有权，实行家庭承包经营为基础、统分结合双层经营体制的区域性经济组织，包括乡镇级农村集体经济组织、村级农村集体经济组织、组级农村集体经济组织。',
    category: CompanyCategory.SPECIAL_LEGAL_PERSON,
  },
  {
    code: 'urban_and_rural_cooperative_economic_organization_legal_person',
    name: '城镇农村的合作经济组织法人',
    description: '',
    category: CompanyCategory.SPECIAL_LEGAL_PERSON,
  },
  {
    code: 'primary-level_self-governing_organization_legal_person',
    name: '基层群众性自治组织法人',
    description:
      '根据《中华人民共和国宪法》第111条设立的城乡居民实行自我管理、自我教育、自我服务的自治形式，包含村民委员会和居民委员会两类。',
    category: CompanyCategory.SPECIAL_LEGAL_PERSON,
  },
  {
    code: 'proprietorship',
    name: '个人独资企业',
    description:
      '个人出资经营、归个人所有和控制、由个人承担经营风险和享有全部经营收益的企业。',
    category: CompanyCategory.UNINCORPORATED_ORGANIZATION,
  },
  {
    code: 'partnership',
    name: '合伙企业',
    description:
      '自然人、法人或其他组织依法设立的经营实体，由两名及以上合伙人通过书面协议共同出资、共担风险，其核心特征为普通合伙人需对企业债务承担无限连带责任。',
    category: CompanyCategory.UNINCORPORATED_ORGANIZATION,
  },
  {
    code: 'professional_service_institution_that_dose_not_have_the_legal_person_status',
    name: '不具有法人资格的专业服务机构',
    description: '',
    category: CompanyCategory.UNINCORPORATED_ORGANIZATION,
  },
  {
    code: 'individual-run_industrial_and_commercial_households',
    name: '个体工商户',
    description:
      '在法律允许的范围内，依法经核准登记，从事工商经营活动的自然人或者家庭。',
    category: CompanyCategory.INDIVIDUAL,
  },
  {
    code: 'rural-land_contractual_management_households',
    name: '农村承包经营户',
    description:
      '在法律允许的范围内，按照农村土地承包经营合同的约定，利用农村集体土地从事种植业以及副业生产经营的农村集体经济组织成员或者家庭。',
    category: CompanyCategory.INDIVIDUAL,
  },
];

// 旧“公司成员/岗位”系统已移除，仅保留 LLC 股东/高管体系。

@Injectable()
export class CompanyService implements OnModuleInit {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly attachmentsService: AttachmentsService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureBaselineMetadata();
    } catch (error) {
      this.logger.warn(`加载工商基础配置失败: ${error}`);
    }
  }

  async getMeta(): Promise<CompanyMetaResult> {
    const [industries, types] = await this.prisma.$transaction([
      this.prisma.companyIndustry.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyType.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      industries,
      types,
    };
  }

  async getDailyRegistrations(days?: number) {
    const span = Math.min(Math.max(days ?? 30, 7), 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (span - 1));
    const rows = await this.prisma.$queryRaw<
      {
        date: string;
        total: number | Prisma.Decimal;
        individual: number | Prisma.Decimal;
      }[]
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "date",
        COUNT(*) AS "total",
        SUM(CASE WHEN "category" = 'INDIVIDUAL' THEN 1 ELSE 0 END) AS "individual"
      FROM "companies"
      WHERE "createdAt" >= ${start}
      GROUP BY date
      ORDER BY date ASC
    `);
    const normalized = rows.map((row) => ({
      date: row.date,
      total: Number(row.total ?? 0),
      individual: Number(row.individual ?? 0),
    }));
    const map = new Map(normalized.map((row) => [row.date, row]));
    const stats: CompanyRegistrationStatRow[] = [];
    for (let i = 0; i < span; i += 1) {
      const current = new Date(start);
      current.setDate(current.getDate() + i);
      const mark = current.toISOString().slice(0, 10);
      if (map.has(mark)) {
        stats.push(map.get(mark)!);
      } else {
        stats.push({ date: mark, individual: 0, total: 0 });
      }
    }
    return stats;
  }

  async listRecommendations(query: CompanyRecommendationsQueryDto) {
    const limit = query.limit ?? 6;
    const orderByRecent =
      query.kind === 'active'
        ? { lastActiveAt: 'desc' as const }
        : { approvedAt: 'desc' as const };
    const companies = await this.prisma.company.findMany({
      where: {
        visibility: CompanyVisibility.PUBLIC,
        status: {
          in: [
            CompanyStatus.ACTIVE,
            CompanyStatus.SUSPENDED,
            CompanyStatus.UNDER_REVIEW,
          ],
        },
      },
      orderBy: [orderByRecent, { createdAt: 'desc' }],
      take: limit,
      include: {
        type: true,
        industry: true,
        legalRepresentative: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarAttachmentId: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });

    const legalRepAvatarUrlMap =
      await this.attachmentsService.resolvePublicUrlsByIds(
        companies.map(
          (company) => company.legalRepresentative?.avatarAttachmentId,
        ),
      );

    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      summary: company.summary,
      status: company.status,
      type: company.type,
      industry: company.industry,
      legalRepresentative: company.legalRepresentative
        ? {
            id: company.legalRepresentative.id,
            name: company.legalRepresentative.name,
            email: company.legalRepresentative.email,
            displayName:
              company.legalRepresentative.profile?.displayName ?? null,
            avatarUrl: company.legalRepresentative.avatarAttachmentId
              ? (legalRepAvatarUrlMap.get(
                  company.legalRepresentative.avatarAttachmentId,
                ) ?? null)
              : null,
          }
        : null,
      recommendationScore: company.recommendationScore,
      lastActiveAt: company.lastActiveAt,
      approvedAt: company.approvedAt,
    }));
  }

  async listIndustries() {
    return this.prisma.companyIndustry.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async searchUsers(query: CompanyUserSearchDto) {
    const keyword = query.query.trim();
    if (!keyword) {
      return [];
    }
    const limit = Math.min(query.limit ?? 20, 100);
    return this.prisma.user.findMany({
      where: {
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
    const payload = {
      name: dto.name,
      code: dto.code?.trim() || this.slugify(dto.name),
      description: dto.description,
      icon: dto.icon,
      color: dto.color,
      parentId: dto.parentId,
      metadata: dto.metadata ? this.toJsonValue(dto.metadata) : Prisma.JsonNull,
    };
    if (dto.id) {
      return this.prisma.companyIndustry.update({
        where: { id: dto.id },
        data: payload,
      });
    }
    return this.prisma.companyIndustry.create({
      data: payload,
    });
  }

  async listTypes() {
    return this.prisma.companyType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async upsertType(dto: UpsertCompanyTypeDto) {
    const payload = {
      name: dto.name,
      code: dto.code?.trim() || this.slugify(dto.name),
      description: dto.description,
      category: dto.category,
      requiredDocuments: dto.requiredDocuments ?? undefined,
      config: dto.config ? this.toJsonValue(dto.config) : Prisma.JsonNull,
    };
    if (dto.id) {
      return this.prisma.companyType.update({
        where: { id: dto.id },
        data: payload,
      });
    }
    return this.prisma.companyType.create({
      data: payload,
    });
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
    const stats = this.calculateDashboardStats(companies);
    return {
      stats,
      companies: await Promise.all(
        companies.map((company) => this.serializeCompany(company, userId)),
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
        items.map((company) => this.serializeCompany(company)),
      ),
    };
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
      companies.map((company) => this.serializeCompany(company)),
    );
  }

  async getCompanyDetail(id: string, viewerId?: string | null) {
    const company = await this.findCompanyOrThrow(id);
    if (!this.canViewCompany(company, viewerId)) {
      throw new ForbiddenException(
        'No permission to view this company information',
      );
    }
    return this.serializeCompany(company, viewerId ?? undefined);
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

  private async loadWorldDivisions(): Promise<WorldDivisionNode[]> {
    const entry = await this.configService.getEntry(
      WORLD_ADMIN_DIVISIONS_NAMESPACE,
      WORLD_ADMIN_DIVISIONS_KEY,
    );
    const raw = entry?.value as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }
    const items: WorldDivisionNode[] = [];
    for (const node of raw) {
      if (!node || typeof node !== 'object') continue;
      const n = node;
      if (typeof n.id !== 'string' || typeof n.name !== 'string') continue;
      const level = Number(n.level) as 1 | 2 | 3;
      if (![1, 2, 3].includes(level)) continue;
      items.push({
        id: n.id,
        name: n.name,
        level,
        parentId:
          typeof n.parentId === 'string'
            ? n.parentId
            : n.parentId === null || n.parentId === undefined
              ? null
              : null,
      });
    }
    return items;
  }

  private async saveWorldDivisions(
    nodes: WorldDivisionNode[],
    userId?: string,
  ): Promise<void> {
    // Ensure namespace exists (admin console may not have created it yet)
    const namespace = await this.configService.ensureNamespaceByKey(
      WORLD_ADMIN_DIVISIONS_NAMESPACE,
      {
        name: '世界行政区划',
        description: '用于公司登记机关/住所等行政区划选择（三级）',
      },
    );

    const normalized = nodes.map((n) => ({
      id: String(n.id).trim(),
      name: String(n.name).trim(),
      level: n.level,
      parentId: n.parentId ?? null,
    }));

    const entry = await this.configService.getEntry(
      WORLD_ADMIN_DIVISIONS_NAMESPACE,
      WORLD_ADMIN_DIVISIONS_KEY,
    );

    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        { value: normalized },
        userId,
      );
      return;
    }

    await this.configService.createEntry(
      namespace.id,
      {
        key: WORLD_ADMIN_DIVISIONS_KEY,
        value: normalized,
        description:
          '行政区划节点列表（平铺），level=1/2/3，parentId 指向上一级',
      },
      userId,
    );
  }

  async listWorldDivisions() {
    const nodes = await this.loadWorldDivisions();
    nodes.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return nodes;
  }

  async createWorldDivisionNode(
    body: CreateWorldDivisionNodeDto,
    userId?: string,
  ) {
    const nodes = await this.loadWorldDivisions();
    const id = String(body.id ?? '').trim();
    const name = String(body.name ?? '').trim();
    const level = body.level;
    const parentId =
      body.parentId === undefined ? null : (body.parentId ?? null);

    if (!id) throw new BadRequestException('id 不能为空');
    if (!name) throw new BadRequestException('name 不能为空');
    if (![1, 2, 3].includes(level as any)) {
      throw new BadRequestException('level 必须为 1/2/3');
    }
    if (nodes.some((n) => n.id === id)) {
      throw new BadRequestException('id 已存在');
    }

    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    if (level === 1) {
      if (parentId)
        throw new BadRequestException('一级节点不允许设置 parentId');
    } else {
      if (!parentId) throw new BadRequestException('必须设置 parentId');
      const parent = byId.get(parentId);
      if (!parent) throw new BadRequestException('parentId 不存在');
      if (parent.level !== level - 1) {
        throw new BadRequestException('parentId 的 level 不匹配');
      }
    }

    const created: WorldDivisionNode = {
      id,
      name,
      level: level as 1 | 2 | 3,
      parentId,
    };
    nodes.push(created);
    await this.saveWorldDivisions(nodes, userId);
    return created;
  }

  async updateWorldDivisionNode(
    id: string,
    body: UpdateWorldDivisionNodeDto,
    userId?: string,
  ) {
    const nodes = await this.loadWorldDivisions();
    const targetId = String(id ?? '').trim();
    const idx = nodes.findIndex((n) => n.id === targetId);
    if (idx < 0) throw new BadRequestException('Division node not found');

    const current = nodes[idx]!;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));

    const nextName =
      body.name !== undefined ? String(body.name ?? '').trim() : current.name;
    if (!nextName) throw new BadRequestException('name 不能为空');

    let nextParentId = current.parentId ?? null;
    if (body.parentId !== undefined) {
      nextParentId = body.parentId ?? null;
    }

    // Validate parent constraints by level
    if (current.level === 1) {
      if (nextParentId) {
        throw new BadRequestException('一级节点不允许设置 parentId');
      }
    } else {
      if (!nextParentId) throw new BadRequestException('必须设置 parentId');
      if (nextParentId === current.id) {
        throw new BadRequestException('parentId 不能等于自身');
      }
      const parent = byId.get(nextParentId);
      if (!parent) throw new BadRequestException('parentId 不存在');
      if (parent.level !== current.level - 1) {
        throw new BadRequestException('parentId 的 level 不匹配');
      }

      // Cycle guard (walk ancestors)
      const seen = new Set<string>();
      let cursor: WorldDivisionNode | undefined = parent;
      while (cursor) {
        if (seen.has(cursor.id)) break;
        seen.add(cursor.id);
        if (cursor.id === current.id) {
          throw new BadRequestException('parentId 会导致循环引用');
        }
        const pid = cursor.parentId ?? null;
        cursor = pid ? byId.get(pid) : undefined;
      }
    }

    const updated: WorldDivisionNode = {
      ...current,
      name: nextName,
      parentId: nextParentId,
    };
    nodes[idx] = updated;
    await this.saveWorldDivisions(nodes, userId);
    return updated;
  }

  async deleteWorldDivisionNode(id: string, userId?: string) {
    const nodes = await this.loadWorldDivisions();
    const targetId = String(id ?? '').trim();
    const exists = nodes.some((n) => n.id === targetId);
    if (!exists) throw new BadRequestException('Division node not found');

    const hasChildren = nodes.some((n) => (n.parentId ?? null) === targetId);
    if (hasChildren) {
      throw new BadRequestException('仅允许删除叶子节点');
    }

    const next = nodes.filter((n) => n.id !== targetId);
    await this.saveWorldDivisions(next, userId);
  }

  async searchGeoDivisions(query: GeoDivisionSearchDto) {
    const q = query.q?.trim().toLowerCase() ?? '';
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 20;
    const nodes = await this.loadWorldDivisions();
    const filtered = nodes.filter((n) => {
      if (query.level && n.level !== query.level) return false;
      if (query.parentId && (n.parentId ?? null) !== query.parentId)
        return false;
      if (q && !n.name.toLowerCase().includes(q)) return false;
      return true;
    });
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return filtered.slice(0, limit);
  }

  async getGeoDivisionPath(id: string) {
    const nodes = await this.loadWorldDivisions();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const current = byId.get(id);
    if (!current) {
      throw new BadRequestException('Division node not found');
    }
    const path: WorldDivisionNode[] = [];
    let cursor: WorldDivisionNode | undefined = current;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      path.push(cursor);
      const parentId = cursor.parentId ?? null;
      cursor = parentId ? byId.get(parentId) : undefined;
    }
    path.sort((a, b) => a.level - b.level);
    return {
      level1: path.find((n) => n.level === 1) ?? null,
      level2: path.find((n) => n.level === 2) ?? null,
      level3: path.find((n) => n.level === 3) ?? null,
    };
  }

  private validateLlcApplication(dto: LimitedLiabilityCompanyApplicationDto) {
    const errors: string[] = [];

    // 股东出资比例合计 100%
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

    // 股东表决权：可选“按出资比例”或“自定义（合计 100%）”
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

      // 必须为每个股东填写 votingRatio（否则过滤后数量会变少）
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

    // 董事：要么 1 个，要么 >= 3 个；>1 时必须指定董事长（副董事长可选）
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

    // 经理/副经理：各最多 1 人
    if (
      dto.managers?.managerId &&
      dto.managers?.deputyManagerId &&
      dto.managers.managerId === dto.managers.deputyManagerId
    ) {
      errors.push('经理与副经理不能为同一人');
    }

    // 法定代表人：必须从董事或经理中选择（按需求：不含副经理）
    const legal = dto.legalRepresentativeId;
    const legalCandidates = new Set<string>([
      ...directorIds,
      ...(dto.managers?.managerId ? [dto.managers.managerId] : []),
    ]);
    if (!legalCandidates.has(legal)) {
      errors.push('法定代表人必须从董事或经理中选择');
    }

    // 监事：可多个；>1 可选监事会主席；监事不得兼任董事/经理/副经理/财务负责人
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

  private async initLlcApplicationConsents(
    applicationId: string,
    llc: LimitedLiabilityCompanyApplicationDto,
  ) {
    const now = new Date();

    const requirements: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
      shareholderCompanyId?: string | null;
      shareholderUserId?: string | null;
    }> = [];

    // 法定代表人
    requirements.push({
      requiredUserId: llc.legalRepresentativeId,
      role: CompanyApplicationConsentRole.LEGAL_REPRESENTATIVE,
    });

    // 股东
    const shareholderCompanyIds = new Set<string>();
    for (const s of llc.shareholders ?? []) {
      if (s.kind === 'USER' && s.userId) {
        requirements.push({
          requiredUserId: s.userId,
          role: CompanyApplicationConsentRole.SHAREHOLDER_USER,
          shareholderUserId: s.userId,
        });
      }
      if (s.kind === 'COMPANY' && s.companyId) {
        shareholderCompanyIds.add(s.companyId);
      }
    }
    if (shareholderCompanyIds.size) {
      const companies = await this.prisma.company.findMany({
        where: { id: { in: Array.from(shareholderCompanyIds) } },
        select: { id: true, legalRepresentativeId: true },
      });
      const byId = new Map(companies.map((c) => [c.id, c]));
      for (const cid of shareholderCompanyIds) {
        const company = byId.get(cid);
        if (!company) {
          throw new BadRequestException(`股东公司不存在：${cid}`);
        }
        if (!company.legalRepresentativeId) {
          throw new BadRequestException(`股东公司未设置法定代表人：${cid}`);
        }
        requirements.push({
          requiredUserId: company.legalRepresentativeId,
          role: CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL,
          shareholderCompanyId: cid,
        });
      }
    }

    // 董事/董事长/副董事长
    for (const id of llc.directors?.directorIds ?? []) {
      requirements.push({
        requiredUserId: id,
        role: CompanyApplicationConsentRole.DIRECTOR,
      });
    }
    if (llc.directors?.chairpersonId) {
      requirements.push({
        requiredUserId: llc.directors.chairpersonId,
        role: CompanyApplicationConsentRole.CHAIRPERSON,
      });
    }
    if (llc.directors?.viceChairpersonId) {
      requirements.push({
        requiredUserId: llc.directors.viceChairpersonId,
        role: CompanyApplicationConsentRole.VICE_CHAIRPERSON,
      });
    }

    // 经理/副经理
    if (llc.managers?.managerId) {
      requirements.push({
        requiredUserId: llc.managers.managerId,
        role: CompanyApplicationConsentRole.MANAGER,
      });
    }
    if (llc.managers?.deputyManagerId) {
      requirements.push({
        requiredUserId: llc.managers.deputyManagerId,
        role: CompanyApplicationConsentRole.DEPUTY_MANAGER,
      });
    }

    // 监事/监事会主席
    for (const id of llc.supervisors?.supervisorIds ?? []) {
      requirements.push({
        requiredUserId: id,
        role: CompanyApplicationConsentRole.SUPERVISOR,
      });
    }
    if (llc.supervisors?.chairpersonId) {
      requirements.push({
        requiredUserId: llc.supervisors.chairpersonId,
        role: CompanyApplicationConsentRole.SUPERVISOR_CHAIRPERSON,
      });
    }

    // 财务负责人
    if (llc.financialOfficerId) {
      requirements.push({
        requiredUserId: llc.financialOfficerId,
        role: CompanyApplicationConsentRole.FINANCIAL_OFFICER,
      });
    }

    await this.prisma.companyApplicationConsent.createMany({
      data: requirements.map((r) => ({
        id: randomUUID(),
        applicationId,
        requiredUserId: r.requiredUserId,
        role: r.role,
        shareholderCompanyId: r.shareholderCompanyId ?? null,
        shareholderUserId: r.shareholderUserId ?? null,
        status: CompanyApplicationConsentStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      })),
      skipDuplicates: true,
    });

    const pendingCount = await this.prisma.companyApplicationConsent.count({
      where: { applicationId, status: CompanyApplicationConsentStatus.PENDING },
    });
    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: pendingCount > 0 ? 'AWAITING_CONSENTS' : null,
        consentStatus:
          pendingCount > 0
            ? CompanyApplicationConsentProgress.PENDING
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt: pendingCount > 0 ? null : now,
      },
    });
  }

  async getApplicationConsents(applicationId: string, userId: string) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        company: {
          select: { id: true, name: true, slug: true, status: true },
        },
        applicantId: true,
        status: true,
        currentStage: true,
        consentStatus: true,
        consentCompletedAt: true,
        submittedAt: true,
        consents: {
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          include: {
            requiredUser: {
              select: {
                id: true,
                name: true,
                email: true,
                profile: { select: { displayName: true } },
              },
            },
            shareholderCompany: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    const canView =
      application.applicantId === userId ||
      application.consents.some((c) => c.requiredUserId === userId);
    if (!canView) {
      throw new ForbiddenException(
        'No permission to view application consents',
      );
    }
    return application;
  }

  async decideApplicationConsents(
    applicationId: string,
    userId: string,
    approve: boolean,
    dto: CompanyApplicationConsentDecisionDto,
  ) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        applicantId: true,
        status: true,
        consentStatus: true,
        workflowInstance: {
          select: {
            definitionCode: true,
          },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    // 兼容注册申请：新申请创建后已直接进入 UNDER_REVIEW，但仍可能处于“等待参与人同意”阶段。
    // 因此这里不要仅以 status === SUBMITTED 作为“可同意”的判定；只要申请未终结即可尝试更新。
    if (
      application.status === CompanyApplicationStatus.APPROVED ||
      application.status === CompanyApplicationStatus.REJECTED ||
      application.status === CompanyApplicationStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        'Application is no longer pending consents',
      );
    }

    const now = new Date();
    const updated = await this.prisma.companyApplicationConsent.updateMany({
      where: {
        applicationId,
        requiredUserId: userId,
        status: CompanyApplicationConsentStatus.PENDING,
      },
      data: {
        status: approve
          ? CompanyApplicationConsentStatus.APPROVED
          : CompanyApplicationConsentStatus.REJECTED,
        decidedAt: now,
        comment: dto.comment,
      },
    });
    if (updated.count === 0) {
      throw new BadRequestException('No pending consent items for this user');
    }

    const definitionCode = application.workflowInstance?.definitionCode ?? null;
    const isOfficerChange =
      definitionCode === DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE;
    const isManagementChange =
      definitionCode === DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE;
    const isVotingThreshold =
      definitionCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE ||
      definitionCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE ||
      definitionCode === DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE ||
      definitionCode === DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE ||
      definitionCode === DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE ||
      isOfficerChange ||
      isManagementChange;

    // 刷新汇总状态：
    // - 默认：必须所有人同意（任一拒绝即失败）
    // - 注销/更名：经“享有表决权三分之二以上”的股东同意即可（按 votingRatio 计权）
    const progress =
      isVotingThreshold && application.companyId
        ? isOfficerChange
          ? await this.computeOfficerChangeConsentProgress(
              applicationId,
              application.companyId,
            )
          : isManagementChange
            ? await this.computeManagementChangeConsentProgress(applicationId)
            : await this.computeDeregistrationConsentProgress(
                applicationId,
                application.companyId,
              )
        : await this.computeDefaultConsentProgress(applicationId);

    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        consentStatus: progress,
        consentCompletedAt:
          progress === CompanyApplicationConsentProgress.APPROVED ||
          progress === CompanyApplicationConsentProgress.REJECTED
            ? now
            : null,
        currentStage:
          progress === CompanyApplicationConsentProgress.APPROVED
            ? 'READY_FOR_AUTHORITY'
            : 'AWAITING_CONSENTS',
        ...(isVotingThreshold &&
        progress === CompanyApplicationConsentProgress.REJECTED
          ? {
              status: CompanyApplicationStatus.REJECTED,
              resolvedAt: now,
            }
          : {}),
      },
    });

    if (application.companyId) {
      await this.prisma.companyAuditRecord.create({
        data: {
          id: randomUUID(),
          companyId: application.companyId,
          applicationId,
          actorId: userId,
          actionKey: approve ? 'consent_approve' : 'consent_reject',
          actionLabel: approve ? '参与人同意' : '参与人拒绝',
          resultState: progress,
          comment: dto.comment,
          payload: Prisma.JsonNull,
          createdAt: now,
        },
      });
    }

    return this.getApplicationConsents(applicationId, userId);
  }

  async listMyApplications(userId: string) {
    const applications = await this.prisma.companyApplication.findMany({
      where: { applicantId: userId },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        companyId: true,
        workflowInstanceId: true,
        workflowInstance: {
          select: { definitionCode: true },
        },
        status: true,
        currentStage: true,
        consentStatus: true,
        consentCompletedAt: true,
        submittedAt: true,
        resolvedAt: true,
        rejectReason: true,
        payload: true,
        company: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    const ids = applications.map((a) => a.id);
    const instanceIds = applications
      .map((a) => a.workflowInstanceId)
      .filter((v): v is string => Boolean(v));
    const grouped = ids.length
      ? await this.prisma.companyApplicationConsent.groupBy({
          by: ['applicationId', 'status'],
          where: { applicationId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const counter = new Map<
      string,
      { pending: number; approved: number; rejected: number }
    >();
    for (const row of grouped) {
      const key = row.applicationId;
      const next = counter.get(key) ?? { pending: 0, approved: 0, rejected: 0 };
      const count = row._count._all;
      if (row.status === CompanyApplicationConsentStatus.PENDING)
        next.pending += count;
      if (row.status === CompanyApplicationConsentStatus.APPROVED)
        next.approved += count;
      if (row.status === CompanyApplicationConsentStatus.REJECTED)
        next.rejected += count;
      counter.set(key, next);
    }

    // 读取管理员在工作流动作（reject / request_changes）里填写的 comment，作为用户可见的“驳回/补件理由”
    // 注意：必须允许 comment 为 null。否则当管理员这次不填理由时，前端会回退显示上一次的旧理由。
    const adminActionComments = new Map<string, string | null>();
    if (instanceIds.length) {
      const actions = await this.prisma.workflowAction.findMany({
        where: {
          instanceId: { in: instanceIds },
          // 注册申请支持“登记机关法定代表人”审批；同时保留网站管理员后门权限。
          actorRole: { in: ['ADMIN', 'REGISTRY_AUTHORITY_LEGAL'] },
          actionKey: { in: ['reject', 'request_changes'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          instanceId: true,
          actionKey: true,
          comment: true,
          createdAt: true,
        },
      });
      for (const a of actions) {
        const key = `${a.instanceId}:${a.actionKey}`;
        if (!adminActionComments.has(key)) {
          adminActionComments.set(key, a.comment ?? null);
        }
      }
    }

    return applications.map((a) => {
      const payload = a.payload as any;
      const rejectKey = a.workflowInstanceId
        ? `${a.workflowInstanceId}:reject`
        : null;
      const requestChangesKey = a.workflowInstanceId
        ? `${a.workflowInstanceId}:request_changes`
        : null;

      const rejectComment =
        a.rejectReason ??
        (rejectKey && adminActionComments.has(rejectKey)
          ? (adminActionComments.get(rejectKey) ?? null)
          : null);
      const requestChangesComment =
        requestChangesKey && adminActionComments.has(requestChangesKey)
          ? (adminActionComments.get(requestChangesKey) ?? null)
          : null;

      const reviewComment =
        a.status === CompanyApplicationStatus.REJECTED
          ? rejectComment
          : a.status === CompanyApplicationStatus.NEEDS_CHANGES
            ? requestChangesComment
            : null;
      const workflowCode = a.workflowInstance?.definitionCode ?? null;
      const baseName =
        typeof payload?.name === 'string'
          ? payload.name
          : (a.company?.name ?? null);
      const requestedName =
        typeof payload?.newName === 'string' ? payload.newName.trim() : null;
      const requestedDomicileAddress =
        typeof payload?.domicileAddress === 'string'
          ? payload.domicileAddress.trim()
          : null;
      const requestedBusinessScope =
        typeof payload?.businessScope === 'string'
          ? payload.businessScope.trim()
          : null;
      const requestedNewCapitalRaw = payload?.newRegisteredCapital;
      const requestedNewCapital =
        typeof requestedNewCapitalRaw === 'number' &&
        Number.isFinite(requestedNewCapitalRaw)
          ? Math.floor(requestedNewCapitalRaw)
          : typeof requestedNewCapitalRaw === 'string' &&
              requestedNewCapitalRaw.trim() &&
              Number.isFinite(Number(requestedNewCapitalRaw))
            ? Math.floor(Number(requestedNewCapitalRaw))
            : null;
      const shorten = (text: string, max = 32) =>
        text.length > max ? `${text.slice(0, max)}…` : text;
      const displayName =
        workflowCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE && requestedName
          ? `${baseName ?? '（未命名公司）'}（更名为：${requestedName}）`
          : workflowCode === DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE &&
              requestedDomicileAddress
            ? `${baseName ?? '（未命名公司）'}（住所变更为：${shorten(requestedDomicileAddress, 40)}）`
            : workflowCode ===
                  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE &&
                requestedBusinessScope
              ? `${baseName ?? '（未命名公司）'}（经营范围变更）`
              : workflowCode === DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE &&
                  requestedNewCapital !== null
                ? `${baseName ?? '（未命名公司）'}（注册资本变更为：${requestedNewCapital}）`
                : baseName;
      return {
        id: a.id,
        companyId: a.companyId,
        company: a.company ?? null,
        workflowCode,
        status: a.status,
        currentStage: a.currentStage,
        submittedAt: a.submittedAt,
        resolvedAt: a.resolvedAt,
        consentStatus: a.consentStatus,
        consentCompletedAt: a.consentCompletedAt,
        name: displayName,
        reviewComment,
        rejectReason: rejectComment,
        requestChangesReason: requestChangesComment,
        consentCounts: counter.get(a.id) ?? {
          pending: 0,
          approved: 0,
          rejected: 0,
        },
      };
    });
  }

  async getMyApplicationDetail(applicationId: string, userId: string) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: {
        id: true,
        companyId: true,
        workflowInstanceId: true,
        status: true,
        currentStage: true,
        consentStatus: true,
        consentCompletedAt: true,
        submittedAt: true,
        resolvedAt: true,
        rejectReason: true,
        payload: true,
        company: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const instanceId = application.workflowInstanceId;
    let rejectComment: string | null = application.rejectReason ?? null;
    let requestChangesComment: string | null = null;
    if (instanceId) {
      const actions = await this.prisma.workflowAction.findMany({
        where: {
          instanceId,
          actorRole: 'ADMIN',
          actionKey: { in: ['reject', 'request_changes'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { actionKey: true, comment: true },
      });
      for (const a of actions) {
        if (a.actionKey === 'reject' && rejectComment === null)
          rejectComment = a.comment ?? null;
        if (a.actionKey === 'request_changes' && requestChangesComment === null)
          requestChangesComment = a.comment ?? null;
      }
    }

    const reviewComment =
      application.status === CompanyApplicationStatus.REJECTED
        ? rejectComment
        : application.status === CompanyApplicationStatus.NEEDS_CHANGES
          ? requestChangesComment
          : null;

    return {
      id: application.id,
      companyId: application.companyId,
      company: application.company ?? null,
      status: application.status,
      currentStage: application.currentStage,
      consentStatus: application.consentStatus,
      consentCompletedAt: application.consentCompletedAt,
      submittedAt: application.submittedAt,
      resolvedAt: application.resolvedAt,
      payload: application.payload,
      reviewComment,
      rejectReason: rejectComment,
      requestChangesReason: requestChangesComment,
    };
  }

  async updateMyApplication(
    applicationId: string,
    userId: string,
    dto: CreateCompanyApplicationDto,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: { id: true, status: true },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (application.status !== CompanyApplicationStatus.NEEDS_CHANGES) {
      throw new BadRequestException('当前申请状态不允许修改');
    }

    await this.assertCompanyNameAvailable(dto.name, null);
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode);
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
    );

    if (type?.code === 'limited_liability_company') {
      if (!dto.llc) {
        throw new BadRequestException('缺少有限责任公司登记所需字段');
      }
      this.validateLlcApplication(dto.llc);
      await this.normalizeAndValidateLlcRegistrationAuthority(dto.llc);
    }

    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        typeId: type?.id,
        industryId: industry?.id,
        payload: this.toJsonValue(dto),
      },
    });

    return this.getMyApplicationDetail(applicationId, userId);
  }

  async resubmitMyApplication(
    applicationId: string,
    userId: string,
    dto: { comment?: string },
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: { id: true, status: true, workflowInstanceId: true },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (application.status !== CompanyApplicationStatus.NEEDS_CHANGES) {
      throw new BadRequestException('当前申请状态不允许重新提交');
    }
    if (!application.workflowInstanceId) {
      throw new BadRequestException('申请缺少流程实例，无法重新提交');
    }

    const transition = await this.workflowService.performAction({
      instanceId: application.workflowInstanceId,
      actionKey: 'resubmit',
      actorId: userId,
      comment: dto.comment,
      payload: {},
    });

    const applicationStatus = transition.nextState.business
      ?.applicationStatus as CompanyApplicationStatus | undefined;

    // 重新提交：直接回到“审核中”，并按最新表单内容重新生成需同意人员
    const now = new Date();
    await this.prisma.companyApplicationConsent.deleteMany({
      where: { applicationId },
    });

    const latest = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, typeId: true, payload: true },
    });
    if (!latest) {
      throw new NotFoundException('Application not found');
    }
    const type = latest.typeId
      ? await this.prisma.companyType.findUnique({
          where: { id: latest.typeId },
          select: { code: true },
        })
      : null;
    const payload = latest.payload as any;
    const dtoPayload = payload as CreateCompanyApplicationDto;
    if (type?.code === 'limited_liability_company') {
      if (!dtoPayload?.llc) {
        throw new BadRequestException('缺少有限责任公司登记所需字段');
      }
      this.validateLlcApplication(dtoPayload.llc);
      await this.normalizeAndValidateLlcRegistrationAuthority(dtoPayload.llc);
      await this.initLlcApplicationConsents(applicationId, dtoPayload.llc);
    }

    const pendingCount = await this.prisma.companyApplicationConsent.count({
      where: { applicationId, status: CompanyApplicationConsentStatus.PENDING },
    });

    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: transition.nextState.key,
        status: applicationStatus ?? undefined,
        resolvedAt: null,
        payload: this.toJsonValue(dtoPayload),
        consentStatus:
          pendingCount > 0
            ? CompanyApplicationConsentProgress.PENDING
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt: pendingCount > 0 ? null : now,
      },
    });

    return this.getMyApplicationDetail(applicationId, userId);
  }

  async withdrawMyApplication(
    applicationId: string,
    userId: string,
    dto: WithdrawCompanyApplicationDto,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: {
        id: true,
        companyId: true,
        status: true,
        workflowInstanceId: true,
        workflowInstance: {
          select: { id: true, definitionCode: true, currentState: true },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (
      application.status === CompanyApplicationStatus.APPROVED ||
      application.status === CompanyApplicationStatus.REJECTED ||
      application.status === CompanyApplicationStatus.ARCHIVED
    ) {
      throw new BadRequestException('当前申请状态不可撤回');
    }

    const now = new Date();
    const comment = dto.comment?.trim() || '申请已撤回';
    const isDeregistration =
      application.workflowInstance?.definitionCode ===
      DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE;

    await this.prisma.$transaction(async (tx) => {
      // 1) 清空所有待同意项，避免继续出现在“待我同意”列表里
      await tx.companyApplicationConsent.updateMany({
        where: {
          applicationId,
          status: CompanyApplicationConsentStatus.PENDING,
        },
        data: {
          status: CompanyApplicationConsentStatus.REJECTED,
          decidedAt: now,
          comment,
        },
      });

      // 2) 申请标记为已撤回：并强制把 consentStatus 置为 REJECTED（避免管理员列表误入）
      await tx.companyApplication.update({
        where: { id: applicationId },
        data: {
          status: CompanyApplicationStatus.ARCHIVED,
          resolvedAt: now,
          currentStage: 'WITHDRAWN',
          consentStatus: CompanyApplicationConsentProgress.REJECTED,
          consentCompletedAt: now,
        },
      });

      // 3) 取消流程实例（不走 performAction，直接标记取消）
      if (application.workflowInstanceId) {
        await tx.workflowInstance.update({
          where: { id: application.workflowInstanceId },
          data: {
            status: WorkflowInstanceStatus.CANCELLED,
            cancelledAt: now,
            completedAt: null,
          },
        });
        await tx.workflowAction.create({
          data: {
            id: randomUUID(),
            instanceId: application.workflowInstanceId,
            state: application.workflowInstance?.currentState ?? 'unknown',
            actionKey: 'withdraw',
            actionName: '撤回申请',
            actorId: userId,
            actorRole: 'APPLICANT',
            comment,
            payload: Prisma.JsonNull,
            createdAt: now,
          },
        });
      }

      // 4) 注销申请撤回：恢复公司当前 workflow 关联到“上一个 company 实例”
      if (
        isDeregistration &&
        application.companyId &&
        application.workflowInstanceId
      ) {
        const previous = await tx.workflowInstance.findFirst({
          where: {
            targetType: 'company',
            targetId: application.companyId,
            id: { not: application.workflowInstanceId },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, definitionCode: true, currentState: true },
        });
        await tx.company.update({
          where: { id: application.companyId },
          data: {
            workflowInstanceId: previous?.id ?? null,
            workflowDefinitionCode: previous?.definitionCode ?? null,
            workflowState: previous?.currentState ?? null,
            updatedById: userId,
          },
        });
        await tx.companyAuditRecord.create({
          data: {
            id: randomUUID(),
            companyId: application.companyId,
            applicationId,
            actorId: userId,
            actionKey: 'withdraw_deregistration',
            actionLabel: '撤回注销申请',
            resultState: 'WITHDRAWN',
            comment,
            payload: Prisma.JsonNull,
            createdAt: now,
          },
        });
      }
    });

    return this.getMyApplicationDetail(applicationId, userId);
  }

  async listMyPendingConsents(userId: string) {
    const consents = await this.prisma.companyApplicationConsent.findMany({
      where: {
        requiredUserId: userId,
        status: CompanyApplicationConsentStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        application: {
          select: {
            id: true,
            applicantId: true,
            status: true,
            currentStage: true,
            consentStatus: true,
            submittedAt: true,
            resolvedAt: true,
            payload: true,
            workflowInstance: {
              select: { definitionCode: true },
            },
            company: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
        shareholderCompany: { select: { id: true, name: true, slug: true } },
      },
    });

    const byApp = new Map<
      string,
      {
        application: any;
        items: Array<{
          id: string;
          role: CompanyApplicationConsentRole;
          shareholderCompany?: {
            id: string;
            name: string;
            slug: string;
          } | null;
        }>;
      }
    >();

    for (const c of consents) {
      const appId = c.applicationId;
      const bucket = byApp.get(appId) ?? {
        application: c.application,
        items: [],
      };
      bucket.items.push({
        id: c.id,
        role: c.role,
        shareholderCompany: c.shareholderCompany
          ? {
              id: c.shareholderCompany.id,
              name: c.shareholderCompany.name,
              slug: c.shareholderCompany.slug,
            }
          : null,
      });
      byApp.set(appId, bucket);
    }

    return Array.from(byApp.values()).map((entry) => {
      const payload = entry.application?.payload;
      const workflowCode =
        entry.application.workflowInstance?.definitionCode ?? null;
      const baseName =
        typeof payload?.name === 'string'
          ? payload.name
          : (entry.application?.company?.name ?? null);
      const requestedName =
        typeof payload?.newName === 'string' ? payload.newName.trim() : null;
      const resolvedName =
        workflowCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE && requestedName
          ? `${baseName ?? '（未命名公司）'}（更名为：${requestedName}）`
          : baseName;
      return {
        applicationId: entry.application.id,
        workflowCode,
        status: entry.application.status,
        currentStage: entry.application.currentStage,
        consentStatus: entry.application.consentStatus,
        submittedAt: entry.application.submittedAt,
        resolvedAt: entry.application.resolvedAt,
        name: resolvedName,
        items: entry.items,
      };
    });
  }

  async createApplication(userId: string, dto: CreateCompanyApplicationDto) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_WORKFLOW_DEFINITION,
    );
    await this.assertCompanyNameAvailable(dto.name, null);
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode);
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
    );
    const now = new Date();

    if (type?.code === 'limited_liability_company') {
      if (!dto.llc) {
        throw new BadRequestException('缺少有限责任公司登记所需字段');
      }
      this.validateLlcApplication(dto.llc);
      await this.normalizeAndValidateLlcRegistrationAuthority(dto.llc);
    }

    const workflowCode = type?.defaultWorkflow ?? DEFAULT_COMPANY_WORKFLOW_CODE;

    const application = await this.prisma.companyApplication.create({
      data: {
        applicantId: userId,
        typeId: type?.id,
        industryId: industry?.id,
        // 提交后直接进入审核中（不再经过 SUBMITTED 阶段）
        status: CompanyApplicationStatus.UNDER_REVIEW,
        currentStage: 'under_review',
        // 管理端只在“所有参与人都已同意”后才看到申请：
        // - LLC 会在 initLlcApplicationConsents / decideApplicationConsents 里推进 consentStatus
        // - 非 LLC 默认视为“无需同意”，直接标记为 APPROVED
        consentStatus:
          type?.code === 'limited_liability_company'
            ? undefined
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt:
          type?.code === 'limited_liability_company' ? undefined : now,
        payload: this.toJsonValue(dto),
      },
    });

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: workflowCode,
      targetType: 'company_application',
      targetId: application.id,
      createdById: userId,
      context: {
        name: dto.name,
        typeCode: type?.code,
        industryCode: industry?.code,
        category: dto.category ?? type?.category,
      },
    });
    await this.prisma.companyApplication.update({
      where: { id: application.id },
      data: {
        workflowInstanceId: workflowInstance.id,
        // 以流程实例的初始状态为准（防止自定义流程初始状态与 currentStage 不一致）
        currentStage: workflowInstance.currentState,
      },
    });

    if (type?.code === 'limited_liability_company' && dto.llc) {
      await this.initLlcApplicationConsents(application.id, dto.llc);
    }

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      // 注意：注册申请的“最终审批通过”必须由【登记机关法定代表人】或【网站管理员】人工完成。
      // 历史上 autoApprove 仅用于“从 submitted 自动移交到 under_review”。
      // 现在创建时已直接进入 under_review，因此这里仅做“参与人同意完成”校验；无需再执行 route_to_review。
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createDeregistrationApplication(
    companyId: string,
    userId: string,
    dto: CompanyDeregistrationApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    await this.assertCanInitiateDeregistration(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for deregistration',
      );
    }
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Deregistration request already submitted');
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        payload: this.toJsonValue({
          name: company.name,
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    // 注销：提交后需要“享有表决权三分之二以上”的股东同意才能进入管理员审批列表（见 decideApplicationConsents 汇总逻辑）
    await this.initDeregistrationApplicationConsents(application.id, company);

    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowInstanceId: workflowInstance.id,
        workflowDefinitionCode: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
        workflowState: workflowInstance.currentState,
        updatedById: userId,
      },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_deregistration',
        actionLabel: '提交注销申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({ reason: dto.reason ?? null }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      // 自动审批也必须等待股东同意完成；否则走正常流程。
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        const refreshed = await this.findCompanyOrThrow(company.id);
        return this.serializeCompany(refreshed, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteAction(company.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: { workflowInstanceId: workflowInstance.id },
      });
      await this.adminExecuteAction(company.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: { workflowInstanceId: workflowInstance.id },
      });
    }

    const refreshed = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(refreshed, userId);
  }

  async createRenameApplication(
    companyId: string,
    userId: string,
    dto: CompanyRenameApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_RENAME_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    await this.assertCanInitiateRename(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException('Company is not eligible for name change');
    }

    const newName = String(dto.newName ?? '').trim();
    await this.assertCompanyNameAvailable(newName, company.id);

    // 防止重复提交：同一公司同一类型申请只允许一个进行中
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_RENAME_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Name change request already submitted');
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
        newName,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          newName,
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    // 更名：提交后需要“享有表决权三分之二以上”的股东同意才能进入管理员审批列表
    await this.initRenameApplicationConsents(application.id, company);

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_name_change',
        actionLabel: '提交更名申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({ newName, reason: dto.reason ?? null }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      // 自动审批也必须等待股东同意完成；否则走正常流程。
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createDomicileChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyDomicileChangeApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    // 发起权限：法人或任何股东（与更名一致）
    await this.assertCanInitiateRename(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for domicile change',
      );
    }
    if (!company.llcRegistration) {
      throw new BadRequestException('No LLC registration found');
    }

    const domicileAddress = String(dto.domicileAddress ?? '').trim();
    if (!domicileAddress) {
      throw new BadRequestException('Invalid domicile address');
    }

    const registrationAuthorityName = String(
      dto.registrationAuthorityName ?? '',
    ).trim();
    const registrationAuthorityCompanyId = String(
      (dto as unknown as { registrationAuthorityCompanyId?: string | null })
        .registrationAuthorityCompanyId ?? '',
    ).trim();
    let resolvedAuthorityName = registrationAuthorityName;

    if (registrationAuthorityCompanyId) {
      const authorityCompany = await this.prisma.company.findFirst({
        where: {
          id: registrationAuthorityCompanyId,
          status: CompanyStatus.ACTIVE,
          type: { is: { code: 'state_organ_legal_person' } },
        },
        select: { id: true, name: true },
      });
      if (!authorityCompany) {
        throw new BadRequestException('登记机关不存在或不可用');
      }
      resolvedAuthorityName = String(authorityCompany.name ?? '').trim();
    }
    if (dto.domicileDivisionId && !resolvedAuthorityName) {
      throw new BadRequestException('请选择新的登记机关（市场监督管理局）');
    }
    if (resolvedAuthorityName && dto.domicileDivisionId) {
      await this.assertAuthorityNameAllowedForDivision(
        resolvedAuthorityName,
        dto.domicileDivisionId,
      );
    }

    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Domicile change request already submitted',
      );
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
        domicileAddress,
        ...(resolvedAuthorityName
          ? { registrationAuthorityName: resolvedAuthorityName }
          : {}),
        ...(registrationAuthorityCompanyId
          ? { registrationAuthorityCompanyId }
          : {}),
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          domicileAddress,
          domicileDivisionId: dto.domicileDivisionId ?? null,
          domicileDivisionPath: dto.domicileDivisionPath ?? null,
          registrationAuthorityName: resolvedAuthorityName || null,
          registrationAuthorityCompanyId:
            registrationAuthorityCompanyId || null,
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    // 住所变更：提交后需要“享有表决权三分之二以上”的股东同意才能进入管理员审批列表
    await this.initDeregistrationApplicationConsents(application.id, company);

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_domicile_change',
        actionLabel: '提交住所变更申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({
          domicileAddress,
          domicileDivisionId: dto.domicileDivisionId ?? null,
          domicileDivisionPath: dto.domicileDivisionPath ?? null,
          reason: dto.reason ?? null,
        }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createBusinessScopeChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyBusinessScopeChangeApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    // 发起权限：法人或任何股东（与更名一致）
    await this.assertCanInitiateRename(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for business scope change',
      );
    }
    if (!company.llcRegistration) {
      throw new BadRequestException('No LLC registration found');
    }

    const businessScope = String(dto.businessScope ?? '').trim();
    if (!businessScope) {
      throw new BadRequestException('Invalid business scope');
    }

    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: {
            code: DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
          },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Business scope change request already submitted',
      );
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          businessScope,
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    // 经营范围变更：提交后需要“享有表决权三分之二以上”的股东同意才能进入管理员审批列表
    await this.initDeregistrationApplicationConsents(application.id, company);

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_business_scope_change',
        actionLabel: '提交经营范围变更申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({
          businessScope,
          reason: dto.reason ?? null,
        }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createOfficerChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyOfficerChangeApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    // 发起权限：法人或任何股东（与更名一致）
    await this.assertCanInitiateRename(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for officer change request',
      );
    }
    if (!company.llcRegistration) {
      throw new BadRequestException('No LLC registration found');
    }

    const normalizeIds = (ids?: string[]) =>
      Array.from(
        new Set(
          (ids ?? [])
            .map((v) => String(v ?? '').trim())
            .filter((v) => v.length > 0),
        ),
      );

    const directorIdsInput =
      dto.directorIds === undefined ? undefined : normalizeIds(dto.directorIds);
    const supervisorIdsInput =
      dto.supervisorIds === undefined
        ? undefined
        : normalizeIds(dto.supervisorIds);

    if (directorIdsInput === undefined && supervisorIdsInput === undefined) {
      throw new BadRequestException('请至少变更董事或监事之一');
    }

    const currentDirectors = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.DIRECTOR)
          .map((o) => o.userId),
      ),
    );
    const currentSupervisors = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.SUPERVISOR)
          .map((o) => o.userId),
      ),
    );

    const finalDirectorIds = directorIdsInput ?? currentDirectors;
    const finalSupervisorIds = supervisorIdsInput ?? currentSupervisors;

    if (!(finalDirectorIds.length === 1 || finalDirectorIds.length >= 3)) {
      throw new BadRequestException('董事人数必须为 1 人或 3 人及以上');
    }

    const overlap = new Set(finalDirectorIds);
    for (const id of finalSupervisorIds) {
      if (overlap.has(id)) {
        throw new BadRequestException('董事与监事不能为同一人');
      }
    }

    const changed =
      (directorIdsInput !== undefined &&
        (finalDirectorIds.length !== currentDirectors.length ||
          finalDirectorIds.some((id) => !currentDirectors.includes(id)) ||
          currentDirectors.some((id) => !finalDirectorIds.includes(id)))) ||
      (supervisorIdsInput !== undefined &&
        (finalSupervisorIds.length !== currentSupervisors.length ||
          finalSupervisorIds.some((id) => !currentSupervisors.includes(id)) ||
          currentSupervisors.some((id) => !finalSupervisorIds.includes(id))));
    if (!changed) {
      throw new BadRequestException('未检测到董事/监事变更');
    }

    // 校验用户存在（避免审批通过后落库失败）
    const allIds = Array.from(
      new Set([...finalDirectorIds, ...finalSupervisorIds]),
    );
    if (allIds.length) {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true },
      });
      const found = new Set(rows.map((r) => r.id));
      for (const id of allIds) {
        if (!found.has(id)) {
          throw new BadRequestException(`用户不存在：${id}`);
        }
      }
    }

    // 防止重复提交：同一公司同一类型申请只允许一个进行中
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Officer change request already submitted');
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
        directors: finalDirectorIds.length,
        supervisors: finalSupervisorIds.length,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          directorIds: finalDirectorIds,
          supervisorIds: finalSupervisorIds,
          from: {
            directorIds: currentDirectors,
            supervisorIds: currentSupervisors,
          },
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    const newDirectors = finalDirectorIds.filter(
      (id) => !currentDirectors.includes(id),
    );
    const newSupervisors = finalSupervisorIds.filter(
      (id) => !currentSupervisors.includes(id),
    );

    // 董事/监事变更：提交后需要“半数以上股东同意 + 新任董事/监事同意”才能进入管理员审批列表
    await this.initOfficerChangeApplicationConsents(
      application.id,
      company,
      newDirectors,
      newSupervisors,
    );

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_officer_change',
        actionLabel: '提交董事/监事变更申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({
          directorIds: finalDirectorIds,
          supervisorIds: finalSupervisorIds,
          reason: dto.reason ?? null,
        }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createManagementChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyManagementChangeApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    // 发起权限：任意董事
    await this.assertCanInitiateManagementChange(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for management change request',
      );
    }
    if (!company.llcRegistration) {
      throw new BadRequestException('No LLC registration found');
    }

    const hasAnyChangeInput =
      dto.managerId !== undefined ||
      dto.deputyManagerId !== undefined ||
      dto.financialOfficerId !== undefined;
    if (!hasAnyChangeInput) {
      throw new BadRequestException('请至少变更经理/副经理/财务负责人之一');
    }

    const normalizeId = (v: unknown) => {
      const s = String(v ?? '').trim();
      return s.length > 0 ? s : null;
    };

    const currentManagerIds = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.MANAGER)
          .map((o) => o.userId),
      ),
    );
    const currentDeputyManagerIds = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.DEPUTY_MANAGER)
          .map((o) => o.userId),
      ),
    );
    const currentFinancialOfficerIds = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.FINANCIAL_OFFICER)
          .map((o) => o.userId),
      ),
    );

    // 为了避免“多个同角色高管”导致审批通过后覆盖数据不可预期，这里要求每个角色最多 1 人
    if (currentManagerIds.length > 1) {
      throw new BadRequestException('当前存在多个经理记录，无法发起变更');
    }
    if (currentDeputyManagerIds.length > 1) {
      throw new BadRequestException('当前存在多个副经理记录，无法发起变更');
    }
    if (currentFinancialOfficerIds.length > 1) {
      throw new BadRequestException('当前存在多个财务负责人记录，无法发起变更');
    }

    const currentManagerId = currentManagerIds[0] ?? null;
    const currentDeputyManagerId = currentDeputyManagerIds[0] ?? null;
    const currentFinancialOfficerId = currentFinancialOfficerIds[0] ?? null;

    const finalManagerId =
      dto.managerId !== undefined
        ? normalizeId(dto.managerId)
        : currentManagerId;
    const finalDeputyManagerId =
      dto.deputyManagerId !== undefined
        ? normalizeId(dto.deputyManagerId)
        : currentDeputyManagerId;
    const finalFinancialOfficerId =
      dto.financialOfficerId !== undefined
        ? normalizeId(dto.financialOfficerId)
        : currentFinancialOfficerId;

    const changed =
      (dto.managerId !== undefined && finalManagerId !== currentManagerId) ||
      (dto.deputyManagerId !== undefined &&
        finalDeputyManagerId !== currentDeputyManagerId) ||
      (dto.financialOfficerId !== undefined &&
        finalFinancialOfficerId !== currentFinancialOfficerId);
    if (!changed) {
      throw new BadRequestException('未检测到经理/副经理/财务负责人变更');
    }

    // 校验用户存在（避免审批通过后落库失败）
    const allIds = Array.from(
      new Set(
        [finalManagerId, finalDeputyManagerId, finalFinancialOfficerId].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    );
    if (allIds.length) {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true },
      });
      const found = new Set(rows.map((r) => r.id));
      for (const id of allIds) {
        if (!found.has(id)) {
          throw new BadRequestException(`用户不存在：${id}`);
        }
      }
    }

    // 防止重复提交：同一公司同一类型申请只允许一个进行中
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Management change request already submitted',
      );
    }

    const currentDirectors = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.DIRECTOR)
          .map((o) => o.userId),
      ),
    );
    if (!currentDirectors.length) {
      throw new BadRequestException('当前公司未设置董事，无法发起变更');
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
        directors: currentDirectors.length,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          managerId: finalManagerId,
          deputyManagerId: finalDeputyManagerId,
          financialOfficerId: finalFinancialOfficerId,
          from: {
            managerId: currentManagerId,
            deputyManagerId: currentDeputyManagerId,
            financialOfficerId: currentFinancialOfficerId,
          },
          directors: currentDirectors,
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    const newOfficerConsents: Array<{
      requiredUserId: string;
      role: ManagementOfficerConsentRole;
    }> = [];
    if (
      dto.managerId !== undefined &&
      finalManagerId &&
      finalManagerId !== currentManagerId
    ) {
      newOfficerConsents.push({
        requiredUserId: finalManagerId,
        role: CompanyApplicationConsentRole.MANAGER,
      });
    }
    if (
      dto.deputyManagerId !== undefined &&
      finalDeputyManagerId &&
      finalDeputyManagerId !== currentDeputyManagerId
    ) {
      newOfficerConsents.push({
        requiredUserId: finalDeputyManagerId,
        role: CompanyApplicationConsentRole.DEPUTY_MANAGER,
      });
    }
    if (
      dto.financialOfficerId !== undefined &&
      finalFinancialOfficerId &&
      finalFinancialOfficerId !== currentFinancialOfficerId
    ) {
      newOfficerConsents.push({
        requiredUserId: finalFinancialOfficerId,
        role: CompanyApplicationConsentRole.FINANCIAL_OFFICER,
      });
    }

    // 经理/副经理/财务负责人变更：提交后需“半数董事同意 + 新任人员同意”才能进入管理员审批列表
    await this.initManagementChangeApplicationConsents(
      application.id,
      currentDirectors,
      newOfficerConsents,
    );

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_management_change',
        actionLabel: '提交经理/副经理/财务负责人变更申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({
          managerId: finalManagerId,
          deputyManagerId: finalDeputyManagerId,
          financialOfficerId: finalFinancialOfficerId,
          reason: dto.reason ?? null,
        }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createCapitalChangeApplication(
    companyId: string,
    userId: string,
    dto: CompanyCapitalChangeApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    // 发起权限：法人或任何股东（与更名一致）
    await this.assertCanInitiateRename(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for capital change',
      );
    }
    if (!company.llcRegistration) {
      throw new BadRequestException('No LLC registration found');
    }

    const oldCapital = Number(company.llcRegistration.registeredCapital ?? 0);
    const newCapitalRaw = Number(dto.newRegisteredCapital);
    if (!Number.isFinite(newCapitalRaw) || newCapitalRaw < 0) {
      throw new BadRequestException('Invalid new registered capital');
    }
    const newCapital = Math.floor(newCapitalRaw);
    if (newCapital === oldCapital) {
      throw new BadRequestException('新旧注册资本相同，无需提交变更申请');
    }

    const inferredChangeType: 'INCREASE' | 'DECREASE' =
      newCapital > oldCapital ? 'INCREASE' : 'DECREASE';
    const changeType =
      dto.changeType === 'INCREASE' || dto.changeType === 'DECREASE'
        ? dto.changeType
        : inferredChangeType;
    if (dto.changeType && dto.changeType !== inferredChangeType) {
      throw new BadRequestException(
        '变更类型与新旧注册资本大小关系不一致（请检查增资/减资选择）',
      );
    }

    const votingMode =
      dto.votingRightsMode === 'CUSTOM' ||
      dto.votingRightsMode === 'BY_CAPITAL_RATIO'
        ? dto.votingRightsMode
        : 'BY_CAPITAL_RATIO';

    const shareholders = Array.isArray(dto.shareholders)
      ? dto.shareholders
      : [];
    if (!shareholders.length) {
      throw new BadRequestException('请填写变更后股东结构');
    }

    // 1) 基本校验：比例合计、重复主体、表决权合计
    const eps = 1e-6;
    const keySet = new Set<string>();
    let ratioSum = 0;
    let votingSum = 0;
    const userIds = new Set<string>();
    const companyIds = new Set<string>();

    for (const s of shareholders) {
      const kind = s?.kind;
      const ratio = Number((s as { ratio?: unknown })?.ratio);
      const votingRatio = Number((s as { votingRatio?: unknown })?.votingRatio);
      if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
        throw new BadRequestException('股东出资比例必须在 0%～100% 之间');
      }
      ratioSum += ratio;

      if (votingMode === 'CUSTOM') {
        if (
          !Number.isFinite(votingRatio) ||
          votingRatio < 0 ||
          votingRatio > 100
        ) {
          throw new BadRequestException('股东表决权必须在 0%～100% 之间');
        }
        votingSum += votingRatio;
      }

      if (kind === 'USER') {
        const uid = String((s as { userId?: unknown })?.userId ?? '').trim();
        if (!uid) {
          throw new BadRequestException('股东类型为用户时必须填写 userId');
        }
        const key = `U:${uid}`;
        if (keySet.has(key)) {
          throw new BadRequestException('股东列表存在重复主体');
        }
        keySet.add(key);
        userIds.add(uid);
        continue;
      }

      if (kind === 'COMPANY') {
        const cid = String(
          (s as { companyId?: unknown })?.companyId ?? '',
        ).trim();
        if (!cid) {
          throw new BadRequestException('股东类型为公司时必须填写 companyId');
        }
        if (cid === companyId) {
          throw new BadRequestException('公司不能作为自身股东');
        }
        const key = `C:${cid}`;
        if (keySet.has(key)) {
          throw new BadRequestException('股东列表存在重复主体');
        }
        keySet.add(key);
        companyIds.add(cid);
        continue;
      }

      throw new BadRequestException('股东类型不合法（仅支持 USER / COMPANY）');
    }

    if (Math.abs(ratioSum - 100) > eps) {
      throw new BadRequestException('变更后股东出资比例之和必须为 100%');
    }
    if (votingMode === 'CUSTOM' && Math.abs(votingSum - 100) > eps) {
      throw new BadRequestException('变更后股东表决权之和必须为 100%');
    }

    // 2) 主体存在性校验（避免审批通过后落库失败 / 未来同意范围推送失败）
    if (userIds.size) {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true },
      });
      const found = new Set(rows.map((r) => r.id));
      for (const uid of userIds) {
        if (!found.has(uid)) {
          throw new BadRequestException(`股东用户不存在：${uid}`);
        }
      }
    }
    if (companyIds.size) {
      const rows = await this.prisma.company.findMany({
        where: { id: { in: Array.from(companyIds) } },
        select: { id: true, legalRepresentativeId: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const cid of companyIds) {
        const c = byId.get(cid);
        if (!c) {
          throw new BadRequestException(`股东公司不存在：${cid}`);
        }
        // 未来投票/同意范围推送会依赖公司股东的法定代表人
        if (!c.legalRepresentativeId) {
          throw new BadRequestException(`股东公司未设置法定代表人：${cid}`);
        }
      }
    }

    // 防止重复提交：同一公司同一类型申请只允许一个进行中
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Capital change request already submitted');
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
        changeType,
        newRegisteredCapital: newCapital,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          changeType,
          oldRegisteredCapital: oldCapital,
          newRegisteredCapital: newCapital,
          votingRightsMode: votingMode,
          shareholders,
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    // 资本变更：提交后需要“享有表决权三分之二以上”的股东同意才能进入管理员审批列表
    await this.initCapitalChangeApplicationConsents(
      application.id,
      company,
      shareholders,
    );

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_capital_change',
        actionLabel: '提交注册资本变更申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({
          changeType,
          oldRegisteredCapital: oldCapital,
          newRegisteredCapital: newCapital,
          votingRightsMode: votingMode,
          shareholders,
          reason: dto.reason ?? null,
        }),
        createdAt: new Date(),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      // 自动审批也必须等待股东同意完成；否则走正常流程。
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async createEquityTransferApplication(
    companyId: string,
    userId: string,
    dto: CompanyEquityTransferApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_DEFINITION,
    );
    const company = await this.findCompanyOrThrow(companyId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for equity transfer',
      );
    }
    const shareholders = company.llcRegistration?.shareholders ?? [];
    if (!shareholders.length) {
      throw new BadRequestException('No shareholder information found');
    }

    // 防止重复提交：同一公司同一类型申请只允许一个进行中
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Equity transfer request already submitted',
      );
    }

    await this.assertCanInitiateEquityTransfer(company, userId, dto);

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
        payload: this.toJsonValue({
          name: company.name,
          companyId: company.id,
          transferor: dto.transferor,
          transferee: dto.transferee,
          ratio: Number(dto.ratio),
          votingRatio: Number(dto.votingRatio),
          comment: dto.comment ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    await this.initEquityTransferApplicationConsents(
      application.id,
      company,
      dto,
    );

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      // 自动审批也必须等待受让人同意完成；否则走正常流程。
      const latest = await this.prisma.companyApplication.findUnique({
        where: { id: application.id },
        select: { consentStatus: true },
      });
      const consentOk =
        !latest?.consentStatus ||
        latest.consentStatus === CompanyApplicationConsentProgress.APPROVED;
      if (!consentOk) {
        return this.getApplicationConsents(application.id, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: {},
      });
      await this.adminExecuteApplicationAction(application.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: {},
      });
    }

    return this.getApplicationConsents(application.id, userId);
  }

  async updateCompanyAsOfficer(
    companyId: string,
    userId: string,
    dto: UpdateCompanyProfileDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyEditor(company, userId);
    const industry = await this.resolveIndustry(
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
    return this.serializeCompany(updated, userId);
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
    this.assertCompanyEditor(company, userId);
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
    return this.serializeCompany(updated, userId);
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
    this.assertCompanyEditor(company, userId);

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

    return this.serializeCompany(updated, userId);
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
    this.assertCompanyEditor(company, userId);
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
    return this.serializeCompany(updated, userId);
  }

  async updateCompanyAsAdmin(
    companyId: string,
    userId: string,
    dto: AdminUpdateCompanyDto,
  ) {
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode, true);
    const industry = await this.resolveIndustry(
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
        logoAttachmentId: dto.logoAttachmentId ?? undefined,
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
    return this.serializeCompany(updated, userId);
  }

  async createCompanyAsAdmin(actorId: string, dto: AdminCreateCompanyDto) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_WORKFLOW_DEFINITION,
    );
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode, true);
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    // 默认把“法定代表人”也作为主体 OWNER（除非显式传 ownerId）。
    // 这样管理员代创建时，权限会落在目标用户而不是管理员自己。
    const ownerId = dto.ownerId ?? dto.legalRepresentativeId ?? actorId;
    const legalRepresentativeId = dto.legalRepresentativeId ?? ownerId;
    const isStateOrganLegalPerson = type?.code === 'state_organ_legal_person';
    const domicileDivisionId = String(dto.domicileDivisionId ?? '').trim();
    let administrativeDivisionPath: unknown | null = null;
    let administrativeDivisionLevel: 1 | 2 | 3 | null = null;
    let administrativeDivisionName: string | null = null;
    if (isStateOrganLegalPerson) {
      // 需求：机关法人必须填写行政区划，并选择法定代表人
      if (!dto.legalRepresentativeId?.trim()) {
        throw new BadRequestException('请选择法定代表人');
      }
      if (!domicileDivisionId) {
        throw new BadRequestException('请选择所属行政区划');
      }
      const path = await this.getGeoDivisionPath(domicileDivisionId);
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
    const slug = await this.generateUniqueSlug(dto.name);
    const workflowCode = DEFAULT_COMPANY_WORKFLOW_CODE;
    // Note: Prisma Client types depend on `prisma generate`. We cast here to keep the
    // code compiling even when the client hasn't been regenerated yet (e.g. dev server is running).
    const createData: any = {
      name: dto.name,
      slug,
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
      workflowDefinitionCode: workflowCode,
      status: dto.status ?? CompanyStatus.ACTIVE,
      visibility: dto.visibility ?? CompanyVisibility.PUBLIC,
      createdById: ownerId,
      updatedById: actorId,
      lastActiveAt: new Date(),
      approvedAt: new Date(),
      activatedAt: new Date(),
      recommendationScore: 0,
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
    return this.serializeCompany(refreshed);
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
        items.map((company) => this.serializeCompany(company)),
      ),
    };
  }

  async adminGet(companyId: string) {
    const company = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(company);
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
          // 申请在“未入库”阶段 company 可能为 null，但申请本身已绑定 type/industry
          // 用于管理端申请列表显示正确的公司类型/行业
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

  async getCompanyApplicationSettings(
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      this.resolveAutoApproveKey(workflowCode),
    );
    const value = entry?.value;
    const autoApprove =
      typeof value === 'boolean'
        ? value
        : typeof value === 'object' && value !== null && 'autoApprove' in value
          ? Boolean((value as { autoApprove?: boolean }).autoApprove)
          : false;
    return { autoApprove };
  }

  async updateCompanyApplicationSettings(
    autoApprove: boolean,
    userId: string,
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    const namespace = await this.configService.ensureNamespaceByKey(
      COMPANY_CONFIG_NAMESPACE,
      {
        name: '工商系统配置',
        description: '工商系统全局设置',
      },
    );
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      this.resolveAutoApproveKey(workflowCode),
    );
    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        { value: autoApprove },
        userId,
      );
    } else {
      const description =
        workflowCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE
          ? '公司注销自动审批'
          : workflowCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE
            ? '公司更名自动审批'
            : workflowCode === DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE
              ? '公司住所变更自动审批'
              : workflowCode ===
                  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE
                ? '公司经营范围变更自动审批'
                : workflowCode === DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE
                  ? '公司注册资本变更自动审批'
                  : workflowCode ===
                      DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE
                    ? '公司董事/监事变更自动审批'
                    : '公司申请自动审批';
      await this.configService.createEntry(
        namespace.id,
        {
          key: this.resolveAutoApproveKey(workflowCode),
          value: autoApprove,
          description,
        },
        userId,
      );
    }
    return { autoApprove };
  }

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    const payload = dto.payload as
      | { workflowInstanceId?: string; [key: string]: unknown }
      | undefined;
    const instanceId =
      payload?.workflowInstanceId ?? company.workflowInstanceId;
    if (!instanceId) {
      throw new BadRequestException(
        'This company is not yet associated with a process instance',
      );
    }
    const sanitizedPayload =
      payload && 'workflowInstanceId' in payload
        ? Object.fromEntries(
            Object.entries(payload).filter(
              ([key]) => key !== 'workflowInstanceId',
            ),
          )
        : dto.payload;
    return this.executeWorkflowAction(
      company,
      actorId,
      { ...dto, payload: sanitizedPayload },
      instanceId,
    );
  }

  async adminExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
    actorRoles: string[] = ['ADMIN'],
  ) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        workflowInstanceId: true,
      },
    });
    if (!application?.workflowInstanceId) {
      throw new BadRequestException('Application is not linked to a process');
    }
    // 注册申请：审批通过前不会创建 company
    if (!application.companyId) {
      return this.executeRegistrationApplicationWorkflowAction(
        application.id,
        actorId,
        dto,
        application.workflowInstanceId,
        actorRoles,
      );
    }
    const company = await this.findCompanyOrThrow(application.companyId);
    return this.executeWorkflowAction(
      company,
      actorId,
      dto,
      application.workflowInstanceId,
      application.id,
      actorRoles,
    );
  }

  private async executeRegistrationApplicationWorkflowAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
    instanceId: string,
    actorRoles: string[],
  ) {
    if (dto.actionKey === 'route_to_review' || dto.actionKey === 'approve') {
      const app = await this.prisma.companyApplication.findUnique({
        where: { id: applicationId },
        select: { consentStatus: true },
      });
      if (
        app &&
        app.consentStatus !== CompanyApplicationConsentProgress.APPROVED
      ) {
        throw new BadRequestException(
          '等待申请表涉及到的所有用户同意后才能提交登记机关',
        );
      }
    }

    const transition = await this.workflowService.performAction({
      instanceId,
      actionKey: dto.actionKey,
      actorId,
      actorRoles,
      comment: dto.comment,
      payload: dto.payload,
    });

    const applicationStatus = transition.nextState.business
      ?.applicationStatus as CompanyApplicationStatus | undefined;

    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: transition.nextState.key,
        status: applicationStatus ?? undefined,
        resolvedAt: applicationStatus ? new Date() : undefined,
        rejectReason:
          dto.actionKey === 'reject' ? (dto.comment ?? undefined) : undefined,
      },
    });

    // 管理员要求补件：清空需同意人员，等待申请人修改并重新提交后按最新表单重新推送
    if (dto.actionKey === 'request_changes') {
      await this.prisma.companyApplicationConsent.deleteMany({
        where: { applicationId },
      });
      await this.prisma.companyApplication.update({
        where: { id: applicationId },
        data: {
          consentStatus: CompanyApplicationConsentProgress.PENDING,
          consentCompletedAt: null,
          currentStage: 'AWAITING_RESUBMIT',
        },
      });
    }

    if (dto.actionKey === 'approve') {
      const companyId = await this.createCompanyFromApprovedApplication(
        applicationId,
        instanceId,
        actorId,
      );
      const company = await this.findCompanyOrThrow(companyId);
      return this.serializeCompany(company);
    }

    return this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        status: true,
        currentStage: true,
        consentStatus: true,
        submittedAt: true,
        resolvedAt: true,
        workflowInstanceId: true,
      },
    });
  }

  private async createCompanyFromApprovedApplication(
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        applicantId: true,
        typeId: true,
        industryId: true,
        payload: true,
        consentStatus: true,
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('参与人同意未完成，无法创建公司');
    }

    const payload =
      application.payload as unknown as CreateCompanyApplicationDto & {
        llc?: LimitedLiabilityCompanyApplicationDto;
      };
    const dto = payload;
    const llc = payload.llc ?? null;

    const legalRepresentativeId =
      llc?.legalRepresentativeId ??
      dto.legalRepresentativeId ??
      application.applicantId;
    const legalRepresentative = await this.prisma.user.findUnique({
      where: { id: legalRepresentativeId },
      select: {
        id: true,
        name: true,
        profile: { select: { displayName: true } },
      },
    });
    if (!legalRepresentative) {
      throw new BadRequestException('Legal representative user not found');
    }

    const type = await this.resolveCompanyType(
      application.typeId ?? undefined,
      dto.typeCode,
      true,
    );
    const workflowCode = type?.defaultWorkflow ?? DEFAULT_COMPANY_WORKFLOW_CODE;

    const slug = await this.generateUniqueSlug(dto.name);
    const now = new Date();

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        slug,
        summary: dto.summary,
        description: dto.description,
        typeId: application.typeId ?? null,
        industryId: application.industryId ?? null,
        category: dto.category ?? type?.category ?? undefined,
        legalRepresentativeId,
        legalNameSnapshot:
          legalRepresentative.profile?.displayName ??
          legalRepresentative.name ??
          undefined,
        workflowDefinitionCode: workflowCode,
        workflowInstanceId: instanceId,
        workflowState: 'approved',
        status: CompanyStatus.ACTIVE,
        visibility: CompanyVisibility.PUBLIC,
        createdById: application.applicantId,
        updatedById: actorId,
        lastActiveAt: now,
        approvedAt: now,
      },
    });

    await this.prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { targetType: 'company', targetId: company.id },
    });

    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: { companyId: company.id },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId: company.id,
        applicationId,
        actorId,
        actionKey: 'approve',
        actionLabel: '批准并入库',
        resultState: 'approved',
        comment: 'approved',
        payload: Prisma.JsonNull,
        createdAt: now,
      },
    });

    // LLC 入库（结构化）
    await this.persistLlcRegistrationFromApplication(applicationId, company.id);

    return company.id;
  }

  private async persistLlcRegistrationFromApplication(
    applicationId: string,
    companyId: string,
  ) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('参与人同意未完成，无法入库');
    }
    const payload = application.payload as unknown as {
      llc?: LimitedLiabilityCompanyApplicationDto;
    };
    const llc = payload.llc;
    if (!llc) return;

    const now = new Date();
    const registrationAuthorityName = String(
      llc.registrationAuthorityName ?? '',
    ).trim();
    if (!registrationAuthorityName) {
      throw new BadRequestException('登记机关名称不能为空');
    }
    const operatingTermType =
      llc.operatingTerm?.type === 'YEARS'
        ? CompanyLlcOperatingTermType.YEARS
        : CompanyLlcOperatingTermType.LONG_TERM;
    const operatingTermYears =
      llc.operatingTerm?.type === 'YEARS'
        ? Number(llc.operatingTerm?.years ?? null)
        : null;
    const registeredCapital = Number(llc.registeredCapital);
    if (!Number.isFinite(registeredCapital)) {
      throw new BadRequestException('注册资本必须为数字');
    }

    const registration = await this.prisma.companyLlcRegistration.upsert({
      where: { applicationId: application.id },
      create: {
        id: randomUUID(),
        companyId,
        applicationId: application.id,
        domicileDivisionId: llc.domicileDivisionId,
        domicileDivisionPath: llc.domicileDivisionPath
          ? (llc.domicileDivisionPath as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        registeredCapital: Math.floor(registeredCapital),
        administrativeDivisionLevel: Number(llc.administrativeDivisionLevel),
        brandName: llc.brandName,
        industryFeature: llc.industryFeature,
        registrationAuthorityName,
        registrationAuthorityCompanyId:
          llc.registrationAuthorityCompanyId ?? null,
        domicileAddress: llc.domicileAddress,
        operatingTermType,
        operatingTermYears: operatingTermYears ?? undefined,
        businessScope: llc.businessScope,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        domicileDivisionId: llc.domicileDivisionId,
        domicileDivisionPath: llc.domicileDivisionPath
          ? (llc.domicileDivisionPath as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        registeredCapital: Math.floor(registeredCapital),
        administrativeDivisionLevel: Number(llc.administrativeDivisionLevel),
        brandName: llc.brandName,
        industryFeature: llc.industryFeature,
        registrationAuthorityName,
        registrationAuthorityCompanyId:
          llc.registrationAuthorityCompanyId ?? null,
        domicileAddress: llc.domicileAddress,
        operatingTermType,
        operatingTermYears: operatingTermYears ?? undefined,
        businessScope: llc.businessScope,
        updatedAt: now,
      },
    });

    await this.prisma.companyLlcRegistrationShareholder.deleteMany({
      where: { registrationId: registration.id },
    });
    await this.prisma.companyLlcRegistrationOfficer.deleteMany({
      where: { registrationId: registration.id },
    });

    const votingMode =
      llc.votingRightsMode === 'CUSTOM' ||
      llc.votingRightsMode === 'BY_CAPITAL_RATIO'
        ? llc.votingRightsMode
        : 'BY_CAPITAL_RATIO';

    const shareholders = (llc.shareholders ?? []).map((s) => ({
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
      await this.prisma.companyLlcRegistrationShareholder.createMany({
        data: shareholders,
      });
    }

    const officers: Array<{ userId: string; role: CompanyLlcOfficerRole }> = [];
    officers.push({
      userId: llc.legalRepresentativeId,
      role: CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
    });
    for (const id of llc.directors?.directorIds ?? []) {
      officers.push({ userId: id, role: CompanyLlcOfficerRole.DIRECTOR });
    }
    if (llc.directors?.chairpersonId) {
      officers.push({
        userId: llc.directors.chairpersonId,
        role: CompanyLlcOfficerRole.CHAIRPERSON,
      });
    }
    if (llc.directors?.viceChairpersonId) {
      officers.push({
        userId: llc.directors.viceChairpersonId,
        role: CompanyLlcOfficerRole.VICE_CHAIRPERSON,
      });
    }
    if (llc.managers?.managerId) {
      officers.push({
        userId: llc.managers.managerId,
        role: CompanyLlcOfficerRole.MANAGER,
      });
    }
    if (llc.managers?.deputyManagerId) {
      officers.push({
        userId: llc.managers.deputyManagerId,
        role: CompanyLlcOfficerRole.DEPUTY_MANAGER,
      });
    }
    for (const id of llc.supervisors?.supervisorIds ?? []) {
      officers.push({ userId: id, role: CompanyLlcOfficerRole.SUPERVISOR });
    }
    if (llc.supervisors?.chairpersonId) {
      officers.push({
        userId: llc.supervisors.chairpersonId,
        role: CompanyLlcOfficerRole.SUPERVISOR_CHAIRPERSON,
      });
    }
    if (llc.financialOfficerId) {
      officers.push({
        userId: llc.financialOfficerId,
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
      await this.prisma.companyLlcRegistrationOfficer.createMany({
        data: officerRows,
      });
    }
  }

  async deleteCompanyAsAdmin(companyId: string, userId: string) {
    await this.findCompanyOrThrow(companyId);
    await this.prisma.company.delete({ where: { id: companyId } });
    this.logger.log(`Company ${companyId} deleted by ${userId}`);
    return { success: true };
  }

  private async applyWorkflowEffects(
    company: CompanyWithRelations,
    transition: WorkflowTransitionResult,
  ) {
    const companyStatus = transition.nextState.business?.companyStatus as
      | CompanyStatus
      | undefined;
    const applicationStatus = transition.nextState.business
      ?.applicationStatus as CompanyApplicationStatus | undefined;
    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowState: transition.nextState.key,
        status: companyStatus ?? undefined,
        visibility:
          companyStatus === CompanyStatus.ACTIVE
            ? CompanyVisibility.PUBLIC
            : undefined,
        lastActiveAt:
          companyStatus === CompanyStatus.ACTIVE ? new Date() : undefined,
        approvedAt:
          companyStatus === CompanyStatus.ACTIVE
            ? new Date()
            : company.approvedAt,
        archivedAt:
          companyStatus === CompanyStatus.ARCHIVED
            ? new Date()
            : company.archivedAt,
      },
    });
    if (applicationStatus) {
      await this.prisma.companyApplication.updateMany({
        where: {
          companyId: company.id,
          workflowInstanceId: transition.instance.id,
        },
        data: { status: applicationStatus, resolvedAt: new Date() },
      });
    }
  }

  private async executeWorkflowAction(
    company: CompanyWithRelations,
    actorId: string,
    dto: CompanyActionDto,
    instanceId: string,
    applicationId?: string,
    actorRoles: string[] = ['ADMIN'],
  ) {
    if (dto.actionKey === 'route_to_review' || dto.actionKey === 'approve') {
      const application = await this.prisma.companyApplication.findFirst({
        where: { companyId: company.id, workflowInstanceId: instanceId },
        select: { id: true, consentStatus: true },
      });
      if (
        application &&
        application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
      ) {
        throw new BadRequestException(
          '等待申请表涉及的所有参与人同意后才能提交登记机关',
        );
      }
    }

    const transition = await this.workflowService.performAction({
      instanceId,
      actionKey: dto.actionKey,
      actorId,
      actorRoles,
      comment: dto.comment,
      payload: dto.payload,
    });
    await this.applyWorkflowEffects(company, transition);

    const resolvedApplicationId =
      applicationId ??
      company.applications.find(
        (entry) => entry.workflowInstanceId === transition.instance.id,
      )?.id;

    if (dto.actionKey === 'approve') {
      // 注册流程在 approve 时会通过 applicationId->companyId 入库 LLC；
      // 这里保留对“已有 companyId 的流程”（例如注销/其他）的兼容。
      await this.persistLlcRegistrationIfNeeded(company.id, instanceId);

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistEquityTransferIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
        );
      }

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_RENAME_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistCompanyRenameIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
          actorId,
        );
      }

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistCompanyDomicileChangeIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
          actorId,
        );
      }

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistCompanyBusinessScopeChangeIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
          actorId,
        );
      }

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistCompanyCapitalChangeIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
          actorId,
        );
      }

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistCompanyOfficerChangeIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
          actorId,
        );
      }

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.persistCompanyManagementChangeIfNeeded(
          company.id,
          resolvedApplicationId,
          instanceId,
          actorId,
        );
      }
    }
    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: resolvedApplicationId,
        actorId,
        actionKey: transition.action.key,
        actionLabel: transition.action.label,
        resultState: transition.nextState.key,
        comment: dto.comment,
        payload: dto.payload ? this.toJsonValue(dto.payload) : Prisma.JsonNull,
      },
    });
    const updated = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(updated);
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
    return llcName || null;
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
    return llcId || null;
  }

  private async resolveRegistrationAuthorityForApplication(
    applicationId: string,
  ) {
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

  private async assertIsRegistryLegalRepresentativeForApplication(
    applicationId: string,
    actorId: string,
  ) {
    const authority =
      await this.resolveRegistrationAuthorityForApplication(applicationId);
    if (!authority.companyId && !authority.name) {
      throw new BadRequestException('该申请未关联登记机关，无法由登记机关审批');
    }
    /**
     * 优先使用 payload/登记信息里的 registrationAuthorityCompanyId 做资源级校验：
     * - companyId 是强标识，直接按公司 ID 校验“该公司法定代表人 == 当前用户”
     * - 不强制限定公司类型，避免前端把登记机关指向了非 state_organ_legal_person 时无法审批
     *
     * 只有在缺少 companyId（仅有名称）时，才回退到“按名称+登记机关类型”做兼容匹配，
     * 以避免名称碰撞带来的越权风险。
     */
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

  private async listRegistryAuthoritiesForUser(userId: string) {
    const authorities = await this.prisma.company.findMany({
      where: {
        // 登记机关主体不应被强制限定为 ACTIVE：
        // 只要公司存在且未归档，并且 userId 是法定代表人，就可以作为审批主体。
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
    return (
      authorities
        .map((c) => ({ id: c.id, name: String(c.name ?? '').trim() }))
        // id 必须存在；name 允许为空（仅用于 name-based 兼容匹配）
        .filter((c) => Boolean(c.id))
    );
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
    await this.assertIsRegistryLegalRepresentativeForApplication(
      applicationId,
      actorId,
    );
    // 复用现有工作流审批逻辑；但权限由上面的“登记机关法代”资源级校验兜底。
    return this.adminExecuteApplicationAction(applicationId, actorId, dto, [
      'REGISTRY_AUTHORITY_LEGAL',
    ]);
  }

  private async persistLlcRegistrationIfNeeded(
    companyId: string,
    instanceId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('参与人同意未完成，无法入库');
    }
    const payload = application.payload as unknown as {
      llc?: LimitedLiabilityCompanyApplicationDto;
    };
    const llc = payload.llc;
    if (!llc) return;

    const now = new Date();
    const registrationAuthorityName = String(
      llc.registrationAuthorityName ?? '',
    ).trim();
    if (!registrationAuthorityName) {
      throw new BadRequestException('登记机关名称不能为空');
    }
    const operatingTermType =
      llc.operatingTerm?.type === 'YEARS'
        ? CompanyLlcOperatingTermType.YEARS
        : CompanyLlcOperatingTermType.LONG_TERM;
    const operatingTermYears =
      llc.operatingTerm?.type === 'YEARS'
        ? Number(llc.operatingTerm?.years ?? null)
        : null;

    const registration = await this.prisma.companyLlcRegistration.upsert({
      where: { applicationId: application.id },
      create: {
        id: randomUUID(),
        companyId,
        applicationId: application.id,
        domicileDivisionId: llc.domicileDivisionId,
        domicileDivisionPath: llc.domicileDivisionPath
          ? (llc.domicileDivisionPath as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        registeredCapital: Math.floor(Number(llc.registeredCapital ?? 0)),
        administrativeDivisionLevel: Number(llc.administrativeDivisionLevel),
        brandName: llc.brandName,
        industryFeature: llc.industryFeature,
        registrationAuthorityName,
        registrationAuthorityCompanyId:
          llc.registrationAuthorityCompanyId ?? null,
        domicileAddress: llc.domicileAddress,
        operatingTermType,
        operatingTermYears: operatingTermYears ?? undefined,
        businessScope: llc.businessScope,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        domicileDivisionId: llc.domicileDivisionId,
        domicileDivisionPath: llc.domicileDivisionPath
          ? (llc.domicileDivisionPath as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        registeredCapital: Math.floor(Number(llc.registeredCapital ?? 0)),
        administrativeDivisionLevel: Number(llc.administrativeDivisionLevel),
        brandName: llc.brandName,
        industryFeature: llc.industryFeature,
        registrationAuthorityName,
        registrationAuthorityCompanyId:
          llc.registrationAuthorityCompanyId ?? null,
        domicileAddress: llc.domicileAddress,
        operatingTermType,
        operatingTermYears: operatingTermYears ?? undefined,
        businessScope: llc.businessScope,
        updatedAt: now,
      },
    });

    await this.prisma.companyLlcRegistrationShareholder.deleteMany({
      where: { registrationId: registration.id },
    });
    await this.prisma.companyLlcRegistrationOfficer.deleteMany({
      where: { registrationId: registration.id },
    });

    const votingMode =
      llc.votingRightsMode === 'CUSTOM' ||
      llc.votingRightsMode === 'BY_CAPITAL_RATIO'
        ? llc.votingRightsMode
        : 'BY_CAPITAL_RATIO';

    const shareholders = (llc.shareholders ?? []).map((s) => ({
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
      await this.prisma.companyLlcRegistrationShareholder.createMany({
        data: shareholders,
      });
    }

    const officers: Array<{ userId: string; role: CompanyLlcOfficerRole }> = [];
    officers.push({
      userId: llc.legalRepresentativeId,
      role: CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
    });
    for (const id of llc.directors?.directorIds ?? []) {
      officers.push({ userId: id, role: CompanyLlcOfficerRole.DIRECTOR });
    }
    if (llc.directors?.chairpersonId) {
      officers.push({
        userId: llc.directors.chairpersonId,
        role: CompanyLlcOfficerRole.CHAIRPERSON,
      });
    }
    if (llc.directors?.viceChairpersonId) {
      officers.push({
        userId: llc.directors.viceChairpersonId,
        role: CompanyLlcOfficerRole.VICE_CHAIRPERSON,
      });
    }
    if (llc.managers?.managerId) {
      officers.push({
        userId: llc.managers.managerId,
        role: CompanyLlcOfficerRole.MANAGER,
      });
    }
    if (llc.managers?.deputyManagerId) {
      officers.push({
        userId: llc.managers.deputyManagerId,
        role: CompanyLlcOfficerRole.DEPUTY_MANAGER,
      });
    }
    for (const id of llc.supervisors?.supervisorIds ?? []) {
      officers.push({ userId: id, role: CompanyLlcOfficerRole.SUPERVISOR });
    }
    if (llc.supervisors?.chairpersonId) {
      officers.push({
        userId: llc.supervisors.chairpersonId,
        role: CompanyLlcOfficerRole.SUPERVISOR_CHAIRPERSON,
      });
    }
    if (llc.financialOfficerId) {
      officers.push({
        userId: llc.financialOfficerId,
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
      await this.prisma.companyLlcRegistrationOfficer.createMany({
        data: officerRows,
      });
    }
  }

  private async persistEquityTransferIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('受让人同意未完成，无法生效股权变更');
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid equity transfer payload');
    }

    const transferor = payload.transferor as
      | { kind?: unknown; userId?: unknown; companyId?: unknown }
      | undefined;
    const transferee = payload.transferee as
      | { kind?: unknown; userId?: unknown; companyId?: unknown }
      | undefined;
    const ratio = Number(payload.ratio);
    const votingRatio = Number(payload.votingRatio);

    if (!transferor || !transferee) {
      throw new BadRequestException('Invalid equity transfer parties');
    }
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 100) {
      throw new BadRequestException('Invalid equity transfer ratio');
    }
    if (
      !Number.isFinite(votingRatio) ||
      votingRatio <= 0 ||
      votingRatio > 100
    ) {
      throw new BadRequestException('Invalid equity transfer voting ratio');
    }

    const transferorKind = String(transferor.kind);
    const transfereeKind = String(transferee.kind);
    const transferorUserId =
      transferorKind === 'USER' ? String(transferor.userId ?? '') : '';
    const transferorCompanyId =
      transferorKind === 'COMPANY' ? String(transferor.companyId ?? '') : '';
    const transfereeUserId =
      transfereeKind === 'USER' ? String(transferee.userId ?? '') : '';
    const transfereeCompanyId =
      transfereeKind === 'COMPANY' ? String(transferee.companyId ?? '') : '';

    if (
      (transferorKind === 'USER' && !transferorUserId) ||
      (transferorKind === 'COMPANY' && !transferorCompanyId) ||
      (transfereeKind === 'USER' && !transfereeUserId) ||
      (transfereeKind === 'COMPANY' && !transfereeCompanyId) ||
      (transferorKind !== 'USER' && transferorKind !== 'COMPANY') ||
      (transfereeKind !== 'USER' && transfereeKind !== 'COMPANY')
    ) {
      throw new BadRequestException('Invalid equity transfer parties');
    }

    if (
      transferorKind === transfereeKind &&
      ((transferorKind === 'USER' && transferorUserId === transfereeUserId) ||
        (transferorKind === 'COMPANY' &&
          transferorCompanyId === transfereeCompanyId))
    ) {
      throw new BadRequestException('转让方与受让方不能为同一主体');
    }

    const eps = 1e-9;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const registration = await tx.companyLlcRegistration.findUnique({
        where: { companyId },
        include: { shareholders: true },
      });
      if (!registration) {
        throw new BadRequestException('No LLC registration found');
      }

      const shareholders = registration.shareholders ?? [];
      const from = shareholders.find((s) => {
        if (transferorKind === 'USER') {
          return (
            s.kind === CompanyLlcShareholderKind.USER &&
            s.userId === transferorUserId
          );
        }
        return (
          s.kind === CompanyLlcShareholderKind.COMPANY &&
          s.companyId === transferorCompanyId
        );
      });
      if (!from) {
        throw new BadRequestException('转让方不是该公司的现有股东');
      }

      if (Number(from.ratio) + eps < ratio) {
        throw new BadRequestException('转让股权比例超过转让方持有比例');
      }
      if (Number(from.votingRatio) + eps < votingRatio) {
        throw new BadRequestException('转让表决权比例超过转让方持有表决权比例');
      }

      const to = shareholders.find((s) => {
        if (transfereeKind === 'USER') {
          return (
            s.kind === CompanyLlcShareholderKind.USER &&
            s.userId === transfereeUserId
          );
        }
        return (
          s.kind === CompanyLlcShareholderKind.COMPANY &&
          s.companyId === transfereeCompanyId
        );
      });

      const nextFromRatio = Math.max(0, Number(from.ratio) - ratio);
      const nextFromVoting = Math.max(
        0,
        Number(from.votingRatio) - votingRatio,
      );
      if (nextFromRatio <= eps && nextFromVoting <= eps) {
        await tx.companyLlcRegistrationShareholder.delete({
          where: { id: from.id },
        });
      } else {
        await tx.companyLlcRegistrationShareholder.update({
          where: { id: from.id },
          data: {
            ratio: nextFromRatio,
            votingRatio: nextFromVoting,
            updatedAt: now,
          },
        });
      }

      if (to) {
        await tx.companyLlcRegistrationShareholder.update({
          where: { id: to.id },
          data: {
            ratio: Number(to.ratio) + ratio,
            votingRatio: Number(to.votingRatio) + votingRatio,
            updatedAt: now,
          },
        });
      } else {
        await tx.companyLlcRegistrationShareholder.create({
          data: {
            id: randomUUID(),
            registrationId: registration.id,
            kind:
              transfereeKind === 'COMPANY'
                ? CompanyLlcShareholderKind.COMPANY
                : CompanyLlcShareholderKind.USER,
            userId: transfereeKind === 'USER' ? transfereeUserId : null,
            companyId:
              transfereeKind === 'COMPANY' ? transfereeCompanyId : null,
            ratio,
            votingRatio,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });
  }

  private async persistCompanyRenameIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('股东同意未完成，无法生效更名');
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid name change payload');
    }
    const newNameRaw = payload.newName;
    const newName =
      typeof newNameRaw === 'string'
        ? newNameRaw.trim()
        : String(newNameRaw ?? '').trim();
    if (!newName) {
      throw new BadRequestException('Invalid new company name');
    }

    await this.assertCompanyNameAvailable(newName, companyId);

    const before = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: newName,
        updatedById: actorId,
      },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_rename',
        actionLabel: '公司更名生效',
        resultState: 'APPLIED',
        comment: `公司更名：${before?.name ?? '（未知）'} -> ${newName}`,
        payload: this.toJsonValue({
          from: before?.name ?? null,
          to: newName,
        }),
      },
    });
  }

  private async persistCompanyDomicileChangeIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('股东同意未完成，无法生效住所变更');
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid domicile change payload');
    }

    const domicileAddressRaw = payload.domicileAddress;
    const domicileAddress =
      typeof domicileAddressRaw === 'string'
        ? domicileAddressRaw.trim()
        : String(domicileAddressRaw ?? '').trim();
    if (!domicileAddress) {
      throw new BadRequestException('Invalid domicile address');
    }

    const domicileDivisionIdRaw = payload.domicileDivisionId;
    const domicileDivisionId =
      typeof domicileDivisionIdRaw === 'string'
        ? domicileDivisionIdRaw.trim()
        : '';
    const domicileDivisionPathRaw = payload.domicileDivisionPath;
    const domicileDivisionPath =
      domicileDivisionPathRaw &&
      typeof domicileDivisionPathRaw === 'object' &&
      !Array.isArray(domicileDivisionPathRaw)
        ? (domicileDivisionPathRaw as Prisma.InputJsonValue)
        : null;

    const registrationAuthorityCompanyIdRaw =
      payload.registrationAuthorityCompanyId;
    const registrationAuthorityCompanyId =
      typeof registrationAuthorityCompanyIdRaw === 'string'
        ? registrationAuthorityCompanyIdRaw.trim()
        : String(registrationAuthorityCompanyIdRaw ?? '').trim();

    const registrationAuthorityNameRaw = payload.registrationAuthorityName;
    let registrationAuthorityName =
      typeof registrationAuthorityNameRaw === 'string'
        ? registrationAuthorityNameRaw.trim()
        : String(registrationAuthorityNameRaw ?? '').trim();

    if (registrationAuthorityCompanyId) {
      const authorityCompany = await this.prisma.company.findFirst({
        where: {
          id: registrationAuthorityCompanyId,
          status: CompanyStatus.ACTIVE,
          type: { is: { code: 'state_organ_legal_person' } },
        },
        select: { id: true, name: true },
      });
      if (!authorityCompany) {
        throw new BadRequestException('登记机关不存在或不可用');
      }
      registrationAuthorityName = String(authorityCompany.name ?? '').trim();
    }

    if (domicileDivisionId && registrationAuthorityName) {
      await this.assertAuthorityNameAllowedForDivision(
        registrationAuthorityName,
        domicileDivisionId,
      );
    }

    const now = new Date();
    const before = await this.prisma.companyLlcRegistration.findUnique({
      where: { companyId },
      select: {
        domicileAddress: true,
        domicileDivisionId: true,
        registrationAuthorityName: true,
      },
    });
    if (!before) {
      throw new BadRequestException('No LLC registration found');
    }

    await this.prisma.companyLlcRegistration.update({
      where: { companyId },
      data: {
        domicileAddress,
        ...(domicileDivisionId ? { domicileDivisionId } : {}),
        ...(domicileDivisionPath ? { domicileDivisionPath } : {}),
        ...(registrationAuthorityName ? { registrationAuthorityName } : {}),
        ...(registrationAuthorityCompanyId
          ? { registrationAuthorityCompanyId }
          : {}),
        updatedAt: now,
      },
    });

    await this.prisma.company.update({
      where: { id: companyId },
      data: { updatedById: actorId },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_change_domicile',
        actionLabel: '公司住所变更生效',
        resultState: 'APPLIED',
        comment: `公司住所变更：${before.domicileAddress ?? '（未设置）'} -> ${domicileAddress}`,
        payload: this.toJsonValue({
          from: {
            domicileAddress: before.domicileAddress ?? null,
            domicileDivisionId: before.domicileDivisionId ?? null,
            registrationAuthorityName: before.registrationAuthorityName ?? null,
          },
          to: {
            domicileAddress,
            domicileDivisionId: domicileDivisionId || null,
            registrationAuthorityName: registrationAuthorityName || null,
          },
        }),
        createdAt: now,
      },
    });
  }

  private async persistCompanyBusinessScopeChangeIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('股东同意未完成，无法生效经营范围变更');
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid business scope change payload');
    }

    const businessScopeRaw = payload.businessScope;
    const businessScope =
      typeof businessScopeRaw === 'string'
        ? businessScopeRaw.trim()
        : String(businessScopeRaw ?? '').trim();
    if (!businessScope) {
      throw new BadRequestException('Invalid business scope');
    }

    const now = new Date();
    const before = await this.prisma.companyLlcRegistration.findUnique({
      where: { companyId },
      select: { businessScope: true },
    });
    if (!before) {
      throw new BadRequestException('No LLC registration found');
    }

    await this.prisma.companyLlcRegistration.update({
      where: { companyId },
      data: {
        businessScope,
        updatedAt: now,
      },
    });

    await this.prisma.company.update({
      where: { id: companyId },
      data: { updatedById: actorId },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_change_business_scope',
        actionLabel: '公司经营范围变更生效',
        resultState: 'APPLIED',
        comment: '公司经营范围变更已生效',
        payload: this.toJsonValue({
          from: before.businessScope ?? null,
          to: businessScope,
        }),
        createdAt: now,
      },
    });
  }

  private async persistCompanyCapitalChangeIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('股东同意未完成，无法生效注册资本变更');
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid capital change payload');
    }

    const newRegisteredCapital = Math.floor(
      Number(payload.newRegisteredCapital),
    );
    if (!Number.isFinite(newRegisteredCapital) || newRegisteredCapital < 0) {
      throw new BadRequestException('Invalid new registered capital');
    }

    const votingModeRaw = String(payload.votingRightsMode ?? '');
    const votingMode =
      votingModeRaw === 'CUSTOM' || votingModeRaw === 'BY_CAPITAL_RATIO'
        ? (votingModeRaw as 'CUSTOM' | 'BY_CAPITAL_RATIO')
        : 'BY_CAPITAL_RATIO';

    const shareholdersRaw = payload.shareholders;
    if (!Array.isArray(shareholdersRaw) || shareholdersRaw.length === 0) {
      throw new BadRequestException('Invalid shareholders payload');
    }

    const eps = 1e-6;
    const keySet = new Set<string>();
    let ratioSum = 0;
    let votingSum = 0;

    const normalizedShareholders: Array<{
      kind: CompanyLlcShareholderKind;
      userId: string | null;
      companyId: string | null;
      ratio: number;
      votingRatio: number;
    }> = [];

    for (const raw of shareholdersRaw) {
      const s =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : null;
      if (!s) throw new BadRequestException('Invalid shareholder entry');

      const kind = String(s.kind ?? '');
      const ratio = Number(s.ratio);
      const votingRatioInput = Number(s.votingRatio);
      if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
        throw new BadRequestException('股东出资比例必须在 0%～100% 之间');
      }
      ratioSum += ratio;

      if (votingMode === 'CUSTOM') {
        if (
          !Number.isFinite(votingRatioInput) ||
          votingRatioInput < 0 ||
          votingRatioInput > 100
        ) {
          throw new BadRequestException('股东表决权必须在 0%～100% 之间');
        }
        votingSum += votingRatioInput;
      }

      if (kind === 'USER') {
        const uid = String(s.userId ?? '').trim();
        if (!uid)
          throw new BadRequestException('股东类型为用户时必须填写 userId');
        const key = `U:${uid}`;
        if (keySet.has(key))
          throw new BadRequestException('股东列表存在重复主体');
        keySet.add(key);
        normalizedShareholders.push({
          kind: CompanyLlcShareholderKind.USER,
          userId: uid,
          companyId: null,
          ratio,
          votingRatio: votingMode === 'CUSTOM' ? votingRatioInput : ratio,
        });
        continue;
      }

      if (kind === 'COMPANY') {
        const cid = String(s.companyId ?? '').trim();
        if (!cid)
          throw new BadRequestException('股东类型为公司时必须填写 companyId');
        if (cid === companyId) {
          throw new BadRequestException('公司不能作为自身股东');
        }
        const key = `C:${cid}`;
        if (keySet.has(key))
          throw new BadRequestException('股东列表存在重复主体');
        keySet.add(key);
        normalizedShareholders.push({
          kind: CompanyLlcShareholderKind.COMPANY,
          userId: null,
          companyId: cid,
          ratio,
          votingRatio: votingMode === 'CUSTOM' ? votingRatioInput : ratio,
        });
        continue;
      }

      throw new BadRequestException('股东类型不合法（仅支持 USER / COMPANY）');
    }

    if (Math.abs(ratioSum - 100) > eps) {
      throw new BadRequestException('变更后股东出资比例之和必须为 100%');
    }
    if (votingMode === 'CUSTOM' && Math.abs(votingSum - 100) > eps) {
      throw new BadRequestException('变更后股东表决权之和必须为 100%');
    }

    const now = new Date();
    const { beforeCapital, beforeShareholders } =
      await this.prisma.$transaction(async (tx) => {
        const registration = await tx.companyLlcRegistration.findUnique({
          where: { companyId },
          include: { shareholders: true },
        });
        if (!registration) {
          throw new BadRequestException('No LLC registration found');
        }

        const beforeCapital = Number(registration.registeredCapital ?? 0);
        const beforeShareholders = (registration.shareholders ?? []).map(
          (s) => ({
            kind: s.kind,
            userId: s.userId ?? null,
            companyId: s.companyId ?? null,
            ratio: Number(s.ratio),
            votingRatio: Number(s.votingRatio),
          }),
        );

        await tx.companyLlcRegistration.update({
          where: { companyId },
          data: {
            registeredCapital: newRegisteredCapital,
            updatedAt: now,
          },
        });

        await tx.companyLlcRegistrationShareholder.deleteMany({
          where: { registrationId: registration.id },
        });
        await tx.companyLlcRegistrationShareholder.createMany({
          data: normalizedShareholders.map((s) => ({
            id: randomUUID(),
            registrationId: registration.id,
            kind: s.kind,
            userId: s.userId,
            companyId: s.companyId,
            ratio: s.ratio,
            votingRatio: s.votingRatio,
            createdAt: now,
            updatedAt: now,
          })),
        });

        return { beforeCapital, beforeShareholders };
      });

    await this.prisma.company.update({
      where: { id: companyId },
      data: { updatedById: actorId },
    });

    const changeType =
      newRegisteredCapital > beforeCapital ? 'INCREASE' : 'DECREASE';

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_change_capital',
        actionLabel: '公司注册资本变更生效',
        resultState: 'APPLIED',
        comment:
          changeType === 'INCREASE'
            ? `公司增资：${beforeCapital} -> ${newRegisteredCapital}`
            : `公司减资：${beforeCapital} -> ${newRegisteredCapital}`,
        payload: this.toJsonValue({
          changeType,
          from: {
            registeredCapital: beforeCapital,
            shareholders: beforeShareholders,
          },
          to: {
            registeredCapital: newRegisteredCapital,
            votingRightsMode: votingMode,
            shareholders: normalizedShareholders,
          },
        }),
        createdAt: now,
      },
    });
  }

  private async persistCompanyOfficerChangeIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException('同意未完成，无法生效董事/监事变更');
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid officer change payload');
    }

    const directorIdsRaw = payload.directorIds;
    const supervisorIdsRaw = payload.supervisorIds;
    if (!Array.isArray(directorIdsRaw) || !Array.isArray(supervisorIdsRaw)) {
      throw new BadRequestException(
        'Invalid officer change payload (directorIds/supervisorIds)',
      );
    }
    const directorIds = Array.from(
      new Set(
        directorIdsRaw
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length > 0),
      ),
    );
    const supervisorIds = Array.from(
      new Set(
        supervisorIdsRaw
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length > 0),
      ),
    );

    if (!(directorIds.length === 1 || directorIds.length >= 3)) {
      throw new BadRequestException('董事人数必须为 1 人或 3 人及以上');
    }
    const overlap = new Set(directorIds);
    for (const id of supervisorIds) {
      if (overlap.has(id)) {
        throw new BadRequestException('董事与监事不能为同一人');
      }
    }

    const registration = await this.prisma.companyLlcRegistration.findUnique({
      where: { companyId },
      include: { officers: true },
    });
    if (!registration) {
      throw new BadRequestException('No LLC registration found');
    }

    const now = new Date();
    const beforeDirectors = Array.from(
      new Set(
        (registration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.DIRECTOR)
          .map((o) => o.userId),
      ),
    );
    const beforeSupervisors = Array.from(
      new Set(
        (registration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.SUPERVISOR)
          .map((o) => o.userId),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.companyLlcRegistrationOfficer.deleteMany({
        where: {
          registrationId: registration.id,
          role: {
            in: [
              CompanyLlcOfficerRole.DIRECTOR,
              CompanyLlcOfficerRole.SUPERVISOR,
            ],
          },
        },
      });

      const rows: Array<{
        id: string;
        registrationId: string;
        userId: string;
        role: CompanyLlcOfficerRole;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (const id of directorIds) {
        rows.push({
          id: randomUUID(),
          registrationId: registration.id,
          userId: id,
          role: CompanyLlcOfficerRole.DIRECTOR,
          createdAt: now,
          updatedAt: now,
        });
      }
      for (const id of supervisorIds) {
        rows.push({
          id: randomUUID(),
          registrationId: registration.id,
          userId: id,
          role: CompanyLlcOfficerRole.SUPERVISOR,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (rows.length) {
        await tx.companyLlcRegistrationOfficer.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }

      await tx.company.update({
        where: { id: companyId },
        data: { updatedById: actorId },
      });
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_change_officers',
        actionLabel: '公司董事/监事变更生效',
        resultState: 'APPLIED',
        comment: '公司董事/监事变更已生效',
        payload: this.toJsonValue({
          from: {
            directorIds: beforeDirectors,
            supervisorIds: beforeSupervisors,
          },
          to: { directorIds, supervisorIds },
        }),
        createdAt: now,
      },
    });
  }

  private async persistCompanyManagementChangeIfNeeded(
    companyId: string,
    applicationId: string,
    instanceId: string,
    actorId: string,
  ) {
    const application = await this.prisma.companyApplication.findFirst({
      where: { id: applicationId, companyId, workflowInstanceId: instanceId },
      select: { id: true, payload: true, consentStatus: true },
    });
    if (!application) return;
    if (
      application.consentStatus !== CompanyApplicationConsentProgress.APPROVED
    ) {
      throw new BadRequestException(
        '同意未完成，无法生效经理/副经理/财务负责人变更',
      );
    }

    const payload =
      application.payload &&
      typeof application.payload === 'object' &&
      !Array.isArray(application.payload)
        ? (application.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      throw new BadRequestException('Invalid management change payload');
    }

    const normalizeId = (v: unknown) => {
      const s = String(v ?? '').trim();
      return s.length > 0 ? s : null;
    };
    const managerId = normalizeId(payload.managerId);
    const deputyManagerId = normalizeId(payload.deputyManagerId);
    const financialOfficerId = normalizeId(payload.financialOfficerId);

    const registration = await this.prisma.companyLlcRegistration.findUnique({
      where: { companyId },
      include: { officers: true },
    });
    if (!registration) {
      throw new BadRequestException('No LLC registration found');
    }

    const now = new Date();
    const beforeManagerIds = Array.from(
      new Set(
        (registration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.MANAGER)
          .map((o) => o.userId),
      ),
    );
    const beforeDeputyManagerIds = Array.from(
      new Set(
        (registration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.DEPUTY_MANAGER)
          .map((o) => o.userId),
      ),
    );
    const beforeFinancialOfficerIds = Array.from(
      new Set(
        (registration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.FINANCIAL_OFFICER)
          .map((o) => o.userId),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.companyLlcRegistrationOfficer.deleteMany({
        where: {
          registrationId: registration.id,
          role: {
            in: [
              CompanyLlcOfficerRole.MANAGER,
              CompanyLlcOfficerRole.DEPUTY_MANAGER,
              CompanyLlcOfficerRole.FINANCIAL_OFFICER,
            ],
          },
        },
      });

      const rows: Array<{
        id: string;
        registrationId: string;
        userId: string;
        role: CompanyLlcOfficerRole;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      if (managerId) {
        rows.push({
          id: randomUUID(),
          registrationId: registration.id,
          userId: managerId,
          role: CompanyLlcOfficerRole.MANAGER,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (deputyManagerId) {
        rows.push({
          id: randomUUID(),
          registrationId: registration.id,
          userId: deputyManagerId,
          role: CompanyLlcOfficerRole.DEPUTY_MANAGER,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (financialOfficerId) {
        rows.push({
          id: randomUUID(),
          registrationId: registration.id,
          userId: financialOfficerId,
          role: CompanyLlcOfficerRole.FINANCIAL_OFFICER,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (rows.length) {
        await tx.companyLlcRegistrationOfficer.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }

      await tx.company.update({
        where: { id: companyId },
        data: { updatedById: actorId },
      });
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_change_management',
        actionLabel: '公司经理/副经理/财务负责人变更生效',
        resultState: 'APPLIED',
        comment: '公司经理/副经理/财务负责人变更已生效',
        payload: this.toJsonValue({
          from: {
            managerIds: beforeManagerIds,
            deputyManagerIds: beforeDeputyManagerIds,
            financialOfficerIds: beforeFinancialOfficerIds,
          },
          to: {
            managerId,
            deputyManagerId,
            financialOfficerId,
          },
        }),
        createdAt: now,
      },
    });
  }

  private canViewCompany(
    company: CompanyWithRelations,
    viewerId?: string | null,
  ) {
    if (viewerId) {
      if (company.legalRepresentativeId === viewerId) return true;
      const llc = company.llcRegistration;
      if (
        (llc?.officers ?? []).some((o) => o.userId === viewerId) ||
        (llc?.shareholders ?? []).some(
          (s) =>
            s.kind === CompanyLlcShareholderKind.USER && s.userId === viewerId,
        )
      ) {
        return true;
      }
    }
    if (company.visibility === CompanyVisibility.PUBLIC) {
      return company.status !== CompanyStatus.REJECTED;
    }
    return false;
  }

  private async resolveCompanyType(
    typeId?: string,
    typeCode?: string,
    optional = false,
  ) {
    if (!typeId && !typeCode) {
      return null;
    }
    const type = await this.prisma.companyType.findFirst({
      where: {
        OR: [
          typeId ? { id: typeId } : undefined,
          typeCode ? { code: typeCode } : undefined,
        ].filter(Boolean) as Prisma.CompanyTypeWhereInput[],
      },
    });
    if (!type && !optional) {
      throw new BadRequestException('Company type not found');
    }
    return type;
  }

  private async resolveIndustry(
    industryId?: string,
    industryCode?: string,
    optional = false,
  ) {
    if (!industryId && !industryCode) {
      return null;
    }
    const industry = await this.prisma.companyIndustry.findFirst({
      where: {
        OR: [
          industryId ? { id: industryId } : undefined,
          industryCode ? { code: industryCode } : undefined,
        ].filter(Boolean) as Prisma.CompanyIndustryWhereInput[],
      },
    });
    if (!industry && !optional) {
      throw new BadRequestException('Industry category not found');
    }
    return industry;
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

  private assertCompanyEditor(company: CompanyWithRelations, userId: string) {
    const isLegalRepresentative = company.legalRepresentativeId === userId;
    const editorOfficerRoles = new Set<CompanyLlcOfficerRole>([
      CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      CompanyLlcOfficerRole.MANAGER,
      CompanyLlcOfficerRole.DEPUTY_MANAGER,
    ]);
    const isEditorOfficer = (company.llcRegistration?.officers ?? []).some(
      (o) => o.userId === userId && editorOfficerRoles.has(o.role),
    );
    if (!isLegalRepresentative && !isEditorOfficer) {
      throw new ForbiddenException(
        'Only legal representative or authorized officers can edit company profile',
      );
    }
  }

  private resolveAutoApproveKey(workflowCode?: string) {
    if (workflowCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE) {
      return 'auto_approve_deregistration';
    }
    if (workflowCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE) {
      return 'auto_approve_name_change';
    }
    if (workflowCode === DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_domicile_change';
    }
    if (workflowCode === DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_business_scope_change';
    }
    if (workflowCode === DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_capital_change';
    }
    if (workflowCode === DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_officer_change';
    }
    if (workflowCode === DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_management_change';
    }
    return COMPANY_CONFIG_AUTO_APPROVE_KEY;
  }

  private async assertCanInitiateDeregistration(
    company: CompanyWithRelations,
    userId: string,
  ) {
    // 1) 法定代表人可发起
    if (company.legalRepresentativeId === userId) return;
    if (
      (company.llcRegistration?.officers ?? []).some(
        (o) =>
          o.userId === userId &&
          o.role === CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      )
    ) {
      return;
    }

    // 2) 股东（LLC 股东表）也可发起：USER 股东本人 / COMPANY 股东的法定代表人
    const llc = company.llcRegistration;
    const shareholders = llc?.shareholders ?? [];
    if (!shareholders.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request deregistration',
      );
    }

    for (const s of shareholders) {
      if (s.kind === CompanyLlcShareholderKind.USER && s.userId === userId) {
        return;
      }
    }

    const shareholderCompanyIds = shareholders
      .filter(
        (s) =>
          s.kind === CompanyLlcShareholderKind.COMPANY && Boolean(s.companyId),
      )
      .map((s) => s.companyId as string);
    if (!shareholderCompanyIds.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request deregistration',
      );
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: shareholderCompanyIds } },
      select: { id: true, legalRepresentativeId: true },
    });
    const byId = new Map(companies.map((c) => [c.id, c]));
    for (const cid of shareholderCompanyIds) {
      const c = byId.get(cid);
      if (!c) continue;
      if (c.legalRepresentativeId === userId) {
        return;
      }
    }

    throw new ForbiddenException(
      'Only legal representative or shareholders can request deregistration',
    );
  }

  private async assertCanInitiateRename(
    company: CompanyWithRelations,
    userId: string,
  ) {
    // 1) 法定代表人可发起
    if (company.legalRepresentativeId === userId) return;
    if (
      (company.llcRegistration?.officers ?? []).some(
        (o) =>
          o.userId === userId &&
          o.role === CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      )
    ) {
      return;
    }

    // 2) 股东（LLC 股东表）也可发起：USER 股东本人 / COMPANY 股东的法定代表人
    const llc = company.llcRegistration;
    const shareholders = llc?.shareholders ?? [];
    if (!shareholders.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request company name change',
      );
    }

    for (const s of shareholders) {
      if (s.kind === CompanyLlcShareholderKind.USER && s.userId === userId) {
        return;
      }
    }

    const shareholderCompanyIds = shareholders
      .filter(
        (s) =>
          s.kind === CompanyLlcShareholderKind.COMPANY && Boolean(s.companyId),
      )
      .map((s) => s.companyId as string);
    if (!shareholderCompanyIds.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request company name change',
      );
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: shareholderCompanyIds } },
      select: { id: true, legalRepresentativeId: true },
    });
    const byId = new Map(companies.map((c) => [c.id, c]));
    for (const cid of shareholderCompanyIds) {
      const c = byId.get(cid);
      if (!c) continue;
      if (c.legalRepresentativeId === userId) {
        return;
      }
    }

    throw new ForbiddenException(
      'Only legal representative or shareholders can request company name change',
    );
  }

  private async assertCanInitiateManagementChange(
    company: CompanyWithRelations,
    userId: string,
  ) {
    // 必须是董事会成员（以 LLC 注册信息里的董事/董事长/副董事长为准）
    const directorRoles = new Set<CompanyLlcOfficerRole>([
      CompanyLlcOfficerRole.DIRECTOR,
      CompanyLlcOfficerRole.CHAIRPERSON,
      CompanyLlcOfficerRole.VICE_CHAIRPERSON,
    ]);
    const ok = (company.llcRegistration?.officers ?? []).some(
      (o) => o.userId === userId && directorRoles.has(o.role),
    );
    if (!ok) {
      throw new ForbiddenException(
        'Only directors can request management change',
      );
    }
  }

  private async assertCanInitiateEquityTransfer(
    company: CompanyWithRelations,
    userId: string,
    dto: CompanyEquityTransferApplyDto,
  ) {
    const transferor = dto.transferor;
    const transferee = dto.transferee;

    if (
      transferor.kind === transferee.kind &&
      ((transferor.kind === 'USER' &&
        transferor.userId === transferee.userId) ||
        (transferor.kind === 'COMPANY' &&
          transferor.companyId === transferee.companyId))
    ) {
      throw new BadRequestException('转让方与受让方不能为同一主体');
    }

    if (transferor.kind === 'USER') {
      if (!transferor.userId) {
        throw new BadRequestException('转让方为用户时必须填写 userId');
      }
      if (transferor.userId !== userId) {
        throw new ForbiddenException('只有拟转让股权的股东本人可以发起申请');
      }
    } else {
      if (!transferor.companyId) {
        throw new BadRequestException('转让方为公司时必须填写 companyId');
      }
      const shareholderCompany = await this.prisma.company.findUnique({
        where: { id: transferor.companyId },
        select: { id: true, legalRepresentativeId: true },
      });
      if (!shareholderCompany) {
        throw new BadRequestException('转让方公司不存在');
      }
      if (!shareholderCompany.legalRepresentativeId) {
        throw new BadRequestException('转让方公司未设置法定代表人');
      }
      if (shareholderCompany.legalRepresentativeId !== userId) {
        throw new ForbiddenException('只有股东公司的法定代表人可以发起申请');
      }
    }

    if (transferee.kind === 'USER') {
      if (!transferee.userId) {
        throw new BadRequestException('受让方为用户时必须填写 userId');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: transferee.userId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('受让方用户不存在');
      }
    } else {
      if (!transferee.companyId) {
        throw new BadRequestException('受让方为公司时必须填写 companyId');
      }
      const targetCompany = await this.prisma.company.findUnique({
        where: { id: transferee.companyId },
        select: { id: true, legalRepresentativeId: true },
      });
      if (!targetCompany) {
        throw new BadRequestException('受让方公司不存在');
      }
      if (!targetCompany.legalRepresentativeId) {
        throw new BadRequestException('受让方公司未设置法定代表人');
      }
    }

    const shareholders = company.llcRegistration?.shareholders ?? [];
    const from = shareholders.find((s) => {
      if (transferor.kind === 'USER') {
        return (
          s.kind === CompanyLlcShareholderKind.USER &&
          s.userId === transferor.userId
        );
      }
      return (
        s.kind === CompanyLlcShareholderKind.COMPANY &&
        s.companyId === transferor.companyId
      );
    });
    if (!from) {
      throw new BadRequestException('转让方不是该公司的现有股东');
    }
    if (Number(dto.ratio) > Number(from.ratio) + 1e-9) {
      throw new BadRequestException('转让股权比例超过转让方持有比例');
    }
    if (Number(dto.votingRatio) > Number(from.votingRatio) + 1e-9) {
      throw new BadRequestException('转让表决权比例超过转让方持有表决权比例');
    }
  }

  private async initEquityTransferApplicationConsents(
    applicationId: string,
    company: CompanyWithRelations,
    dto: CompanyEquityTransferApplyDto,
  ) {
    const now = new Date();
    const transferee = dto.transferee;

    let requiredUserId: string;
    let role: CompanyApplicationConsentRole;
    let shareholderCompanyId: string | null = null;
    let shareholderUserId: string | null = null;

    if (transferee.kind === 'USER') {
      if (!transferee.userId) {
        throw new BadRequestException('受让方为用户时必须填写 userId');
      }
      requiredUserId = transferee.userId;
      role = CompanyApplicationConsentRole.TRANSFEREE_USER;
      shareholderUserId = transferee.userId;
    } else {
      if (!transferee.companyId) {
        throw new BadRequestException('受让方为公司时必须填写 companyId');
      }
      const c = await this.prisma.company.findUnique({
        where: { id: transferee.companyId },
        select: { id: true, legalRepresentativeId: true },
      });
      if (!c) {
        throw new BadRequestException('受让方公司不存在');
      }
      if (!c.legalRepresentativeId) {
        throw new BadRequestException('受让方公司未设置法定代表人');
      }
      requiredUserId = c.legalRepresentativeId;
      role = CompanyApplicationConsentRole.TRANSFEREE_COMPANY_LEGAL;
      shareholderCompanyId = transferee.companyId;
    }

    await this.prisma.companyApplicationConsent.create({
      data: {
        id: randomUUID(),
        applicationId,
        requiredUserId,
        role,
        shareholderCompanyId,
        shareholderUserId,
        status: CompanyApplicationConsentStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      },
    });

    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: 'AWAITING_CONSENTS',
        consentStatus: CompanyApplicationConsentProgress.PENDING,
        consentCompletedAt: null,
      },
    });
  }

  private async initDeregistrationApplicationConsents(
    applicationId: string,
    company: CompanyWithRelations,
  ) {
    const now = new Date();

    const requirements: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
      shareholderCompanyId?: string | null;
      shareholderUserId?: string | null;
    }> = [];

    const llc = company.llcRegistration;
    const shareholders = llc?.shareholders ?? [];

    // 优先：使用 LLC 股东表作为“股东范围”
    if (shareholders.length) {
      const shareholderCompanyIds = new Set<string>();
      for (const s of shareholders) {
        if (s.kind === CompanyLlcShareholderKind.USER && s.userId) {
          requirements.push({
            requiredUserId: s.userId,
            role: CompanyApplicationConsentRole.SHAREHOLDER_USER,
            shareholderUserId: s.userId,
          });
        }
        if (s.kind === CompanyLlcShareholderKind.COMPANY && s.companyId) {
          shareholderCompanyIds.add(s.companyId);
        }
      }

      if (shareholderCompanyIds.size) {
        const companies = await this.prisma.company.findMany({
          where: { id: { in: Array.from(shareholderCompanyIds) } },
          select: { id: true, legalRepresentativeId: true },
        });
        const byId = new Map(companies.map((c) => [c.id, c]));
        for (const cid of shareholderCompanyIds) {
          const c = byId.get(cid);
          if (!c) {
            throw new BadRequestException(`股东公司不存在：${cid}`);
          }
          if (!c.legalRepresentativeId) {
            throw new BadRequestException(`股东公司未设置法定代表人：${cid}`);
          }
          requirements.push({
            requiredUserId: c.legalRepresentativeId,
            role: CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL,
            shareholderCompanyId: cid,
          });
        }
      }
    } else {
      throw new BadRequestException('LLC 股东数据缺失，无法初始化股东同意清单');
    }

    // 去重
    const unique = new Map<string, (typeof requirements)[number]>();
    for (const r of requirements) {
      unique.set(
        `${r.requiredUserId}:${r.role}:${r.shareholderCompanyId ?? ''}:${r.shareholderUserId ?? ''}`,
        r,
      );
    }
    const rows = Array.from(unique.values());

    if (rows.length) {
      await this.prisma.companyApplicationConsent.createMany({
        data: rows.map((r) => ({
          id: randomUUID(),
          applicationId,
          requiredUserId: r.requiredUserId,
          role: r.role,
          shareholderCompanyId: r.shareholderCompanyId ?? null,
          shareholderUserId: r.shareholderUserId ?? null,
          status: CompanyApplicationConsentStatus.PENDING,
          createdAt: now,
          updatedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    const pendingCount = await this.prisma.companyApplicationConsent.count({
      where: { applicationId, status: CompanyApplicationConsentStatus.PENDING },
    });
    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: pendingCount > 0 ? 'AWAITING_CONSENTS' : null,
        consentStatus:
          pendingCount > 0
            ? CompanyApplicationConsentProgress.PENDING
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt: pendingCount > 0 ? null : now,
      },
    });
  }

  private async initCapitalChangeApplicationConsents(
    applicationId: string,
    company: CompanyWithRelations,
    shareholdersAfterChange: Array<{
      kind?: unknown;
      userId?: unknown;
      companyId?: unknown;
    }>,
  ) {
    const now = new Date();

    const requirements: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
      shareholderCompanyId?: string | null;
      shareholderUserId?: string | null;
    }> = [];

    const llc = company.llcRegistration;
    const currentShareholders = llc?.shareholders ?? [];

    const originalKeySet = new Set<string>();

    // 1) 原股东范围（用于 2/3 投票权阈值的“原股东”口径）
    if (currentShareholders.length) {
      const shareholderCompanyIds = new Set<string>();
      for (const s of currentShareholders) {
        if (s.kind === CompanyLlcShareholderKind.USER && s.userId) {
          originalKeySet.add(`U:${s.userId}`);
          requirements.push({
            requiredUserId: s.userId,
            role: CompanyApplicationConsentRole.SHAREHOLDER_USER,
            shareholderUserId: s.userId,
          });
        }
        if (s.kind === CompanyLlcShareholderKind.COMPANY && s.companyId) {
          originalKeySet.add(`C:${s.companyId}`);
          shareholderCompanyIds.add(s.companyId);
        }
      }

      if (shareholderCompanyIds.size) {
        const companies = await this.prisma.company.findMany({
          where: { id: { in: Array.from(shareholderCompanyIds) } },
          select: { id: true, legalRepresentativeId: true },
        });
        const byId = new Map(companies.map((c) => [c.id, c]));
        for (const cid of shareholderCompanyIds) {
          const c = byId.get(cid);
          if (!c) {
            throw new BadRequestException(`股东公司不存在：${cid}`);
          }
          if (!c.legalRepresentativeId) {
            throw new BadRequestException(`股东公司未设置法定代表人：${cid}`);
          }
          requirements.push({
            requiredUserId: c.legalRepresentativeId,
            role: CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL,
            shareholderCompanyId: cid,
          });
        }
      }
    } else {
      throw new BadRequestException(
        'LLC 股东数据缺失，无法初始化注册资本变更同意清单',
      );
    }

    // 2) 新增股东：若变更后股东结构出现“新股东”，则必须额外取得新股东同意
    // 规则：新股东同意 + 享有表决权三分之二以上的原股东同意
    const newUserIds = new Set<string>();
    const newCompanyIds = new Set<string>();
    for (const raw of shareholdersAfterChange ?? []) {
      const kind = String((raw as { kind?: unknown })?.kind ?? '');
      if (kind === 'USER') {
        const uid = String((raw as { userId?: unknown })?.userId ?? '').trim();
        if (!uid) continue;
        const key = `U:${uid}`;
        if (!originalKeySet.has(key)) newUserIds.add(uid);
        continue;
      }
      if (kind === 'COMPANY') {
        const cid = String(
          (raw as { companyId?: unknown })?.companyId ?? '',
        ).trim();
        if (!cid) continue;
        const key = `C:${cid}`;
        if (!originalKeySet.has(key)) newCompanyIds.add(cid);
        continue;
      }
    }

    for (const uid of newUserIds) {
      requirements.push({
        requiredUserId: uid,
        role: CompanyApplicationConsentRole.SHAREHOLDER_USER,
        shareholderUserId: uid,
      });
    }
    if (newCompanyIds.size) {
      const companies = await this.prisma.company.findMany({
        where: { id: { in: Array.from(newCompanyIds) } },
        select: { id: true, legalRepresentativeId: true },
      });
      const byId = new Map(companies.map((c) => [c.id, c]));
      for (const cid of newCompanyIds) {
        const c = byId.get(cid);
        if (!c) {
          throw new BadRequestException(`股东公司不存在：${cid}`);
        }
        if (!c.legalRepresentativeId) {
          throw new BadRequestException(`股东公司未设置法定代表人：${cid}`);
        }
        requirements.push({
          requiredUserId: c.legalRepresentativeId,
          role: CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL,
          shareholderCompanyId: cid,
        });
      }
    }

    // 去重
    const unique = new Map<string, (typeof requirements)[number]>();
    for (const r of requirements) {
      unique.set(
        `${r.requiredUserId}:${r.role}:${r.shareholderCompanyId ?? ''}:${r.shareholderUserId ?? ''}`,
        r,
      );
    }
    const rows = Array.from(unique.values());

    if (rows.length) {
      await this.prisma.companyApplicationConsent.createMany({
        data: rows.map((r) => ({
          id: randomUUID(),
          applicationId,
          requiredUserId: r.requiredUserId,
          role: r.role,
          shareholderCompanyId: r.shareholderCompanyId ?? null,
          shareholderUserId: r.shareholderUserId ?? null,
          status: CompanyApplicationConsentStatus.PENDING,
          createdAt: now,
          updatedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    const pendingCount = await this.prisma.companyApplicationConsent.count({
      where: { applicationId, status: CompanyApplicationConsentStatus.PENDING },
    });
    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: pendingCount > 0 ? 'AWAITING_CONSENTS' : null,
        consentStatus:
          pendingCount > 0
            ? CompanyApplicationConsentProgress.PENDING
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt: pendingCount > 0 ? null : now,
      },
    });
  }

  private async initOfficerChangeApplicationConsents(
    applicationId: string,
    company: CompanyWithRelations,
    newDirectorIds: string[],
    newSupervisorIds: string[],
  ) {
    const now = new Date();

    const requirements: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
      shareholderCompanyId?: string | null;
      shareholderUserId?: string | null;
    }> = [];

    // 1) 股东范围（用于“半数以上股东同意”的口径）
    const llc = company.llcRegistration;
    const shareholders = llc?.shareholders ?? [];
    if (shareholders.length) {
      const shareholderCompanyIds = new Set<string>();
      for (const s of shareholders) {
        if (s.kind === CompanyLlcShareholderKind.USER && s.userId) {
          requirements.push({
            requiredUserId: s.userId,
            role: CompanyApplicationConsentRole.SHAREHOLDER_USER,
            shareholderUserId: s.userId,
          });
        }
        if (s.kind === CompanyLlcShareholderKind.COMPANY && s.companyId) {
          shareholderCompanyIds.add(s.companyId);
        }
      }
      if (shareholderCompanyIds.size) {
        const companies = await this.prisma.company.findMany({
          where: { id: { in: Array.from(shareholderCompanyIds) } },
          select: { id: true, legalRepresentativeId: true },
        });
        const byId = new Map(companies.map((c) => [c.id, c]));
        for (const cid of shareholderCompanyIds) {
          const c = byId.get(cid);
          if (!c) {
            throw new BadRequestException(`股东公司不存在：${cid}`);
          }
          if (!c.legalRepresentativeId) {
            throw new BadRequestException(`股东公司未设置法定代表人：${cid}`);
          }
          requirements.push({
            requiredUserId: c.legalRepresentativeId,
            role: CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL,
            shareholderCompanyId: cid,
          });
        }
      }
    } else {
      throw new BadRequestException(
        'LLC 股东数据缺失，无法初始化董事/监事变更同意清单',
      );
    }

    // 2) 新任董事/监事同意（只对“新增人员”发起同意项）
    for (const uid of Array.from(new Set(newDirectorIds ?? [])).filter(
      Boolean,
    )) {
      requirements.push({
        requiredUserId: uid,
        role: CompanyApplicationConsentRole.DIRECTOR,
        shareholderUserId: uid,
      });
    }
    for (const uid of Array.from(new Set(newSupervisorIds ?? [])).filter(
      Boolean,
    )) {
      requirements.push({
        requiredUserId: uid,
        role: CompanyApplicationConsentRole.SUPERVISOR,
        shareholderUserId: uid,
      });
    }

    // 去重
    const unique = new Map<string, (typeof requirements)[number]>();
    for (const r of requirements) {
      unique.set(
        `${r.requiredUserId}:${r.role}:${r.shareholderCompanyId ?? ''}:${r.shareholderUserId ?? ''}`,
        r,
      );
    }
    const rows = Array.from(unique.values());
    if (rows.length) {
      await this.prisma.companyApplicationConsent.createMany({
        data: rows.map((r) => ({
          id: randomUUID(),
          applicationId,
          requiredUserId: r.requiredUserId,
          role: r.role,
          shareholderCompanyId: r.shareholderCompanyId ?? null,
          shareholderUserId: r.shareholderUserId ?? null,
          status: CompanyApplicationConsentStatus.PENDING,
          createdAt: now,
          updatedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    const pendingCount = await this.prisma.companyApplicationConsent.count({
      where: { applicationId, status: CompanyApplicationConsentStatus.PENDING },
    });
    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: pendingCount > 0 ? 'AWAITING_CONSENTS' : null,
        consentStatus:
          pendingCount > 0
            ? CompanyApplicationConsentProgress.PENDING
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt: pendingCount > 0 ? null : now,
      },
    });
  }

  private async initManagementChangeApplicationConsents(
    applicationId: string,
    directorIds: string[],
    newOfficerConsents: Array<{
      requiredUserId: string;
      role: ManagementOfficerConsentRole;
    }>,
  ) {
    const now = new Date();

    const requirements: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
    }> = [];

    // 1) 董事范围（用于“半数董事同意”的口径）
    for (const uid of Array.from(new Set(directorIds ?? [])).filter(Boolean)) {
      requirements.push({
        requiredUserId: uid,
        role: CompanyApplicationConsentRole.DIRECTOR,
      });
    }

    // 2) 新任人员同意（仅对“变更的新人员”发起同意项）
    for (const item of newOfficerConsents ?? []) {
      const uid = String(item?.requiredUserId ?? '').trim();
      if (!uid) continue;
      requirements.push({
        requiredUserId: uid,
        role: item.role,
      });
    }

    // 去重
    const unique = new Map<string, (typeof requirements)[number]>();
    for (const r of requirements) {
      unique.set(`${r.requiredUserId}:${r.role}`, r);
    }
    const rows = Array.from(unique.values());
    if (rows.length) {
      await this.prisma.companyApplicationConsent.createMany({
        data: rows.map((r) => ({
          id: randomUUID(),
          applicationId,
          requiredUserId: r.requiredUserId,
          role: r.role,
          shareholderCompanyId: null,
          shareholderUserId: null,
          status: CompanyApplicationConsentStatus.PENDING,
          createdAt: now,
          updatedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    const pendingCount = await this.prisma.companyApplicationConsent.count({
      where: { applicationId, status: CompanyApplicationConsentStatus.PENDING },
    });
    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        currentStage: pendingCount > 0 ? 'AWAITING_CONSENTS' : null,
        consentStatus:
          pendingCount > 0
            ? CompanyApplicationConsentProgress.PENDING
            : CompanyApplicationConsentProgress.APPROVED,
        consentCompletedAt: pendingCount > 0 ? null : now,
      },
    });
  }

  private async initRenameApplicationConsents(
    applicationId: string,
    company: CompanyWithRelations,
  ) {
    // 更名同意范围：股东（按 LLC 股东表；无数据则 OWNER 兜底）
    return this.initDeregistrationApplicationConsents(applicationId, company);
  }

  private async computeDefaultConsentProgress(applicationId: string) {
    const [pendingCount, rejectedCount] = await Promise.all([
      this.prisma.companyApplicationConsent.count({
        where: {
          applicationId,
          status: CompanyApplicationConsentStatus.PENDING,
        },
      }),
      this.prisma.companyApplicationConsent.count({
        where: {
          applicationId,
          status: CompanyApplicationConsentStatus.REJECTED,
        },
      }),
    ]);
    return rejectedCount > 0
      ? CompanyApplicationConsentProgress.REJECTED
      : pendingCount > 0
        ? CompanyApplicationConsentProgress.PENDING
        : CompanyApplicationConsentProgress.APPROVED;
  }

  private async computeDeregistrationConsentProgress(
    applicationId: string,
    companyId: string,
  ) {
    const [consents, company] = await Promise.all([
      this.prisma.companyApplicationConsent.findMany({
        where: { applicationId },
        select: {
          status: true,
          shareholderUserId: true,
          shareholderCompanyId: true,
        },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          llcRegistration: {
            select: {
              shareholders: {
                select: {
                  kind: true,
                  userId: true,
                  companyId: true,
                  votingRatio: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const weightByShareholderKey = new Map<string, number>();

    const llcShareholders = company?.llcRegistration?.shareholders ?? [];
    if (!llcShareholders.length) {
      return this.computeDefaultConsentProgress(applicationId);
    }
    for (const s of llcShareholders) {
      if (s.kind === CompanyLlcShareholderKind.USER && s.userId) {
        weightByShareholderKey.set(`U:${s.userId}`, Number(s.votingRatio));
      }
      if (s.kind === CompanyLlcShareholderKind.COMPANY && s.companyId) {
        weightByShareholderKey.set(`C:${s.companyId}`, Number(s.votingRatio));
      }
    }

    const totalVoting = Array.from(weightByShareholderKey.values()).reduce(
      (acc, v) => acc + (Number.isFinite(v) ? v : 0),
      0,
    );
    if (totalVoting <= 0) {
      // 极端兜底：没有可计算的投票权时，退回默认“全体一致”规则
      return this.computeDefaultConsentProgress(applicationId);
    }

    const priority = (s: CompanyApplicationConsentStatus) => {
      if (s === CompanyApplicationConsentStatus.REJECTED) return 3;
      if (s === CompanyApplicationConsentStatus.PENDING) return 2;
      return 1; // APPROVED
    };

    const statusByKey = new Map<string, CompanyApplicationConsentStatus>();
    for (const c of consents) {
      const key = c.shareholderCompanyId
        ? `C:${c.shareholderCompanyId}`
        : c.shareholderUserId
          ? `U:${c.shareholderUserId}`
          : null;
      if (!key) continue;
      const prev = statusByKey.get(key);
      if (!prev || priority(c.status) > priority(prev)) {
        statusByKey.set(key, c.status);
      }
    }

    // 额外同意项（不在“原股东投票权口径”内）：必须全部同意
    // 用于资本变更：新增股东同意（不计入原股东投票权阈值，但必须先同意）
    let hasExtraRejected = false;
    let hasExtraPending = false;
    for (const [key, s] of statusByKey.entries()) {
      if (weightByShareholderKey.has(key)) continue;
      if (s === CompanyApplicationConsentStatus.REJECTED)
        hasExtraRejected = true;
      else if (s === CompanyApplicationConsentStatus.PENDING)
        hasExtraPending = true;
    }

    let approvedVoting = 0;
    let pendingVoting = 0;
    for (const [key, weight] of weightByShareholderKey.entries()) {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) continue;
      const s = statusByKey.get(key) ?? CompanyApplicationConsentStatus.PENDING;
      if (s === CompanyApplicationConsentStatus.APPROVED) approvedVoting += w;
      else if (s === CompanyApplicationConsentStatus.PENDING)
        pendingVoting += w;
      // REJECTED：不计入 pending
    }

    const threshold = (totalVoting * 2) / 3;
    const eps = 1e-9;
    if (hasExtraRejected) {
      return CompanyApplicationConsentProgress.REJECTED;
    }
    if (approvedVoting + pendingVoting + eps < threshold) {
      // 即使剩余未表态全部同意，也无法达到 2/3
      return CompanyApplicationConsentProgress.REJECTED;
    }
    if (approvedVoting + eps >= threshold && !hasExtraPending) {
      return CompanyApplicationConsentProgress.APPROVED;
    }
    return CompanyApplicationConsentProgress.PENDING;
  }

  private async computeOfficerChangeConsentProgress(
    applicationId: string,
    companyId: string,
  ) {
    const [consents, company] = await Promise.all([
      this.prisma.companyApplicationConsent.findMany({
        where: { applicationId },
        select: {
          status: true,
          role: true,
          shareholderUserId: true,
          shareholderCompanyId: true,
          requiredUserId: true,
        },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          llcRegistration: {
            select: {
              shareholders: {
                select: {
                  kind: true,
                  userId: true,
                  companyId: true,
                  votingRatio: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // 1) 新任董事/监事：必须全部同意
    const officerConsents = consents.filter(
      (c) =>
        c.role === CompanyApplicationConsentRole.DIRECTOR ||
        c.role === CompanyApplicationConsentRole.SUPERVISOR,
    );
    if (
      officerConsents.some(
        (c) => c.status === CompanyApplicationConsentStatus.REJECTED,
      )
    ) {
      return CompanyApplicationConsentProgress.REJECTED;
    }
    const hasOfficerPending = officerConsents.some(
      (c) => c.status === CompanyApplicationConsentStatus.PENDING,
    );

    // 2) 股东投票：半数以上（按 votingRatio 计权）
    const weightByShareholderKey = new Map<string, number>();
    const llcShareholders = company?.llcRegistration?.shareholders ?? [];
    if (llcShareholders.length) {
      for (const s of llcShareholders) {
        if (s.kind === CompanyLlcShareholderKind.USER && s.userId) {
          weightByShareholderKey.set(`U:${s.userId}`, Number(s.votingRatio));
        }
        if (s.kind === CompanyLlcShareholderKind.COMPANY && s.companyId) {
          weightByShareholderKey.set(`C:${s.companyId}`, Number(s.votingRatio));
        }
      }
    } else {
      // 兜底：未建立 LLC 股东表时，按“需要股东同意”的同意项推断投票参与者，并按人数均分权重。
      const keys = new Set<string>();
      for (const c of consents) {
        if (
          c.role !== CompanyApplicationConsentRole.SHAREHOLDER_USER &&
          c.role !== CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL
        ) {
          continue;
        }
        const key = c.shareholderCompanyId
          ? `C:${c.shareholderCompanyId}`
          : c.shareholderUserId
            ? `U:${c.shareholderUserId}`
            : null;
        if (key) keys.add(key);
      }
      for (const key of keys) {
        weightByShareholderKey.set(key, 1);
      }
    }

    const totalVoting = Array.from(weightByShareholderKey.values()).reduce(
      (acc, v) => acc + (Number.isFinite(v) ? v : 0),
      0,
    );
    if (totalVoting <= 0) {
      // 极端兜底：没有可计算的投票权时，退回默认“全体一致”规则 + 新任同意规则
      if (hasOfficerPending) return CompanyApplicationConsentProgress.PENDING;
      return this.computeDefaultConsentProgress(applicationId);
    }

    const priority = (s: CompanyApplicationConsentStatus) => {
      if (s === CompanyApplicationConsentStatus.REJECTED) return 3;
      if (s === CompanyApplicationConsentStatus.PENDING) return 2;
      return 1; // APPROVED
    };

    const shareholderStatusByKey = new Map<
      string,
      CompanyApplicationConsentStatus
    >();
    for (const c of consents) {
      if (
        c.role !== CompanyApplicationConsentRole.SHAREHOLDER_USER &&
        c.role !== CompanyApplicationConsentRole.SHAREHOLDER_COMPANY_LEGAL
      ) {
        continue;
      }
      const key = c.shareholderCompanyId
        ? `C:${c.shareholderCompanyId}`
        : c.shareholderUserId
          ? `U:${c.shareholderUserId}`
          : null;
      if (!key) continue;
      const prev = shareholderStatusByKey.get(key);
      if (!prev || priority(c.status) > priority(prev)) {
        shareholderStatusByKey.set(key, c.status);
      }
    }

    let approvedVoting = 0;
    let pendingVoting = 0;
    for (const [key, weight] of weightByShareholderKey.entries()) {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) continue;
      const s =
        shareholderStatusByKey.get(key) ??
        CompanyApplicationConsentStatus.PENDING;
      if (s === CompanyApplicationConsentStatus.APPROVED) approvedVoting += w;
      else if (s === CompanyApplicationConsentStatus.PENDING)
        pendingVoting += w;
    }

    const threshold = totalVoting / 2;
    const eps = 1e-9;
    if (approvedVoting + pendingVoting + eps < threshold) {
      // 即使剩余未表态全部同意，也无法达到 1/2
      return CompanyApplicationConsentProgress.REJECTED;
    }

    const shareholderApproved = approvedVoting + eps >= threshold;
    if (shareholderApproved && !hasOfficerPending) {
      return CompanyApplicationConsentProgress.APPROVED;
    }
    return CompanyApplicationConsentProgress.PENDING;
  }

  private async computeManagementChangeConsentProgress(applicationId: string) {
    const consents = await this.prisma.companyApplicationConsent.findMany({
      where: { applicationId },
      select: { status: true, role: true, requiredUserId: true },
    });

    // 1) 新任人员：必须全部同意
    const officerConsents = consents.filter(
      (c) =>
        c.role === CompanyApplicationConsentRole.MANAGER ||
        c.role === CompanyApplicationConsentRole.DEPUTY_MANAGER ||
        c.role === CompanyApplicationConsentRole.FINANCIAL_OFFICER,
    );
    if (
      officerConsents.some(
        (c) => c.status === CompanyApplicationConsentStatus.REJECTED,
      )
    ) {
      return CompanyApplicationConsentProgress.REJECTED;
    }
    const hasOfficerPending = officerConsents.some(
      (c) => c.status === CompanyApplicationConsentStatus.PENDING,
    );

    // 2) 董事投票：半数（按人数）即可
    const directorConsents = consents.filter(
      (c) => c.role === CompanyApplicationConsentRole.DIRECTOR,
    );
    const directorIds = Array.from(
      new Set(directorConsents.map((c) => c.requiredUserId).filter(Boolean)),
    );
    const totalDirectors = directorIds.length;
    if (totalDirectors <= 0) {
      // 没有董事同意项：无法计算阈值，视为失败（避免误通过）
      return CompanyApplicationConsentProgress.REJECTED;
    }

    let approvedCount = 0;
    let pendingCount = 0;
    for (const c of directorConsents) {
      if (c.status === CompanyApplicationConsentStatus.APPROVED)
        approvedCount += 1;
      else if (c.status === CompanyApplicationConsentStatus.PENDING)
        pendingCount += 1;
    }

    const threshold = Math.ceil(totalDirectors / 2);
    if (approvedCount + pendingCount < threshold) {
      // 即使剩余未表态全部同意，也无法达到半数
      return CompanyApplicationConsentProgress.REJECTED;
    }

    if (approvedCount >= threshold && !hasOfficerPending) {
      return CompanyApplicationConsentProgress.APPROVED;
    }
    return CompanyApplicationConsentProgress.PENDING;
  }

  private async resolveSystemUser() {
    let systemUser = await this.prisma.user.findFirst({
      where: { email: 'system@hydroline.local' },
      select: { id: true },
    });
    if (!systemUser) {
      systemUser = await this.prisma.user.create({
        data: {
          email: 'system@hydroline.local',
          name: 'System',
        },
        select: { id: true },
      });
    }
    return systemUser;
  }

  private readonly SUPER_AUTHORITY_NAME = '氢气市场监督管理总局';

  /**
   * 生成“登记机关（机关法人）”候选行政区划 ID 集合：
   * - 等于“住所地所在地区（三级）”中任一级（level1/2/3）的 id
   * - 用于 companies.administrativeDivisionId 精确匹配
   */
  private async resolveAuthorityDivisionIdsByDivisionId(divisionId: string) {
    const id = String(divisionId ?? '').trim();
    if (!id) return [];
    const path = await this.getGeoDivisionPath(id);
    const ids = [path.level1?.id, path.level2?.id, path.level3?.id].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    return Array.from(new Set(ids));
  }

  /**
   * 生成“登记机关（机关法人）”候选匹配串：
   * - 同级：区/县级市场监督管理局（level3）
   * - 上级：市/州级市场监督管理局（level2）
   * - 上上级：省/直辖市级市场监督管理局（level1）
   * - 最高：市场监督管理总局
   *
   * 说明：这里使用“contains 匹配串”而非完全相等，便于兼容名称带后缀（如“xx市市场监督管理局机关服务中心”）的机关法人。
   */
  private async resolveAuthorityMatchersByDivisionId(divisionId: string) {
    const id = String(divisionId ?? '').trim();
    if (!id) {
      return [this.SUPER_AUTHORITY_NAME, '市场监督管理总局'];
    }
    const path = await this.getGeoDivisionPath(id);
    const items: string[] = [];
    // 由下到上：区/县 -> 市 -> 省/直辖市 -> 总局
    if (path.level3?.name) items.push(`${path.level3.name}`);
    if (path.level2?.name) items.push(`${path.level2.name}`);
    if (path.level1?.name) items.push(`${path.level1.name}`);
    // 总局：既包含定制名，也允许其它“市场监督管理总局”变体
    items.push(this.SUPER_AUTHORITY_NAME);
    items.push('市场监督管理总局');
    // 去重
    return Array.from(new Set(items.filter((v) => v.trim().length > 0)));
  }

  /**
   * 根据行政区划返回“可选登记机关（机关法人）”。
   * - 仅返回“机关法人”（company.type.code = state_organ_legal_person）
   * - 仅返回名称包含“市场监督”的公司
   * - companies.administrativeDivisionId 必须等于住所地三级路径中的任一级（level1/2/3）的 id
   * - 返回顺序：level3 -> level2 -> level1（同一层级内按名称排序）
   */
  async listRegistrationAuthoritiesByDivisionId(divisionId: string) {
    const divisionIds =
      await this.resolveAuthorityDivisionIdsByDivisionId(divisionId);
    if (!divisionIds.length) return [];

    // 注意：Prisma client 类型可能滞后于 schema（Windows 下 generate 时还可能被运行中的进程锁文件）。
    // 这里用 queryRaw 直接按列查询，避免 TS 类型不识别新字段导致编译失败。
    const companies = await this.prisma.$queryRaw<
      Array<{ id: string; name: string }>
    >(
      Prisma.sql`
        SELECT
          c."id",
          c."name"
        FROM "companies" c
        JOIN "company_types" t
          ON t."id" = c."typeId"
        WHERE
          c."status"::text = ${CompanyStatus.ACTIVE}
          AND t."code" = ${'state_organ_legal_person'}
          AND c."administrativeDivisionId" IN (${Prisma.join(divisionIds)})
          AND c."name" ILIKE ${'%市场监督%'}
        ORDER BY
          c."administrativeDivisionLevel" DESC NULLS LAST,
          c."name" ASC
        LIMIT 200
      `,
    );

    // 去重（按 id）+ 规范化输出
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
    return uniq;
  }

  private async assertAuthorityNameAllowedForDivision(
    authorityName: string,
    domicileDivisionId: string,
  ) {
    const name = String(authorityName ?? '').trim();
    if (!name) {
      throw new BadRequestException('登记机关信息无效');
    }
    const matchers =
      await this.resolveAuthorityMatchersByDivisionId(domicileDivisionId);
    const ok = matchers.some((m) => name.includes(m));
    if (!ok) {
      throw new BadRequestException('登记机关不属于所选行政区划的可选范围');
    }
  }

  private async normalizeAndValidateLlcRegistrationAuthority(
    llc: LimitedLiabilityCompanyApplicationDto,
  ) {
    const domicileDivisionId = String(llc.domicileDivisionId ?? '').trim();
    const authorityCompanyId = String(
      (llc as unknown as { registrationAuthorityCompanyId?: string | null })
        .registrationAuthorityCompanyId ?? '',
    ).trim();
    const authorityNameRaw = String(llc.registrationAuthorityName ?? '').trim();

    if (!domicileDivisionId) {
      throw new BadRequestException('缺少住所地行政区划，无法校验登记机关');
    }

    // 新逻辑：优先用 companyId 精确绑定登记机关
    if (authorityCompanyId) {
      const authorityCompany = await this.prisma.company.findFirst({
        where: {
          id: authorityCompanyId,
          status: CompanyStatus.ACTIVE,
          type: { is: { code: 'state_organ_legal_person' } },
        },
        select: { id: true, name: true },
      });
      if (!authorityCompany) {
        throw new BadRequestException('登记机关不存在或不可用');
      }
      const authorityName = String(authorityCompany.name ?? '').trim();
      await this.assertAuthorityNameAllowedForDivision(
        authorityName,
        domicileDivisionId,
      );
      // 回填 name，确保后续“展示/筛选/兼容路径”一致
      llc.registrationAuthorityName = authorityName;
      return;
    }

    // 兼容旧逻辑：仅保存 name
    if (!authorityNameRaw) {
      throw new BadRequestException('请选择登记机关（市场监督管理局）');
    }
    await this.assertAuthorityNameAllowedForDivision(
      authorityNameRaw,
      domicileDivisionId,
    );
    llc.registrationAuthorityName = authorityNameRaw;
  }

  private async generateUniqueSlug(name: string) {
    const base = this.slugify(name);
    for (let i = 0; i < 20; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i}`;
      const exists = await this.prisma.company.findUnique({
        where: { slug: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private normalizeCompanyName(name: string) {
    return (name ?? '').trim();
  }

  /**
   * 申请注册的公司名不能与库中已有公司名相同（大小写不敏感）。
   * - 当 application 已关联 companyId 时，允许与该 company 自身同名（兜底兼容）。
   */
  private async assertCompanyNameAvailable(
    name: string,
    companyIdToIgnore?: string | null,
  ) {
    const normalized = this.normalizeCompanyName(name);
    if (!normalized) {
      return;
    }
    const exists = await this.prisma.company.findFirst({
      where: {
        name: { equals: normalized, mode: 'insensitive' },
        ...(companyIdToIgnore ? { id: { not: companyIdToIgnore } } : {}),
      },
      select: { id: true },
    });
    if (exists) {
      throw new BadRequestException('公司名称已被占用，请更换一个名称');
    }
  }

  private slugify(input: string) {
    const normalized = input
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized.length > 0
      ? normalized
      : `company-${randomUUID().slice(0, 6)}`;
  }

  private async serializeCompany(
    company: CompanyWithRelations,
    viewerId?: string,
  ) {
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
                (domicileDivisionPath as { level1?: { name?: string } | null })
                  ?.level1?.name ?? '',
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

    // --- 待审批/未入库阶段兜底展示 ---
    // 有些公司在待审核阶段可能会使用占位名称/未绑定类型，但流程实例 context 内包含真实名称与类型编码。
    // 为了让管理端列表能展示正确的公司名称/类型，这里做轻量兜底（仅在缺失时补全）。
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
      description: company.description,
      logoAttachmentId: company.logoAttachmentId,
      logoUrl,
      registrationNumber: company.registrationNumber ?? null,
      unifiedSocialCreditCode: company.unifiedSocialCreditCode ?? null,
      administrativeDivision,
      status: company.status,
      visibility: company.visibility,
      category: company.category,
      recommendationScore: company.recommendationScore,
      highlighted: company.highlighted,
      establishedAt: company.establishedAt ?? null,
      llcRegistration: company.llcRegistration
        ? {
            registeredCapital: company.llcRegistration.registeredCapital,
            registrationAuthorityName:
              company.llcRegistration.registrationAuthorityName,
            registrationAuthorityCompanyId:
              company.llcRegistration.registrationAuthorityCompanyId ?? null,
            domicileAddress: company.llcRegistration.domicileAddress,
            operatingTermType: company.llcRegistration.operatingTermType,
            operatingTermYears:
              company.llcRegistration.operatingTermYears ?? null,
            businessScope: company.llcRegistration.businessScope,
            officers: (company.llcRegistration.officers ?? []).map((o) => ({
              role: o.role,
              user: o.user
                ? {
                    id: o.user.id,
                    name: o.user.name,
                    email: o.user.email,
                    displayName: o.user.profile?.displayName ?? null,
                    avatarUrl: o.user.avatarAttachmentId
                      ? (attachmentUrlMap.get(o.user.avatarAttachmentId) ??
                        null)
                      : null,
                  }
                : null,
            })),
            votingRightsMode: (() => {
              const holders = company.llcRegistration?.shareholders ?? [];
              if (!holders.length) return 'BY_CAPITAL_RATIO';
              const allEqual = holders.every((s) => {
                const r = Number(s.ratio);
                const v = Number(s.votingRatio);
                return (
                  Number.isFinite(r) &&
                  Number.isFinite(v) &&
                  Math.abs(r - v) < 1e-9
                );
              });
              return allEqual ? 'BY_CAPITAL_RATIO' : 'CUSTOM';
            })(),
            shareholders: (company.llcRegistration.shareholders ?? []).map(
              (s) => ({
                kind: s.kind,
                userId: s.userId ?? null,
                companyId: s.companyId ?? null,
                holderLegalRepresentativeId:
                  s.kind === CompanyLlcShareholderKind.COMPANY
                    ? (s.company?.legalRepresentativeId ?? null)
                    : null,
                holderName:
                  s.kind === CompanyLlcShareholderKind.COMPANY
                    ? (s.company?.name ?? null)
                    : (s.user?.profile?.displayName ?? s.user?.name ?? null),
                holderRegistrationNumber:
                  s.kind === CompanyLlcShareholderKind.COMPANY
                    ? (s.company?.registrationNumber ?? null)
                    : null,
                holderUnifiedSocialCreditCode:
                  s.kind === CompanyLlcShareholderKind.COMPANY
                    ? (s.company?.unifiedSocialCreditCode ?? null)
                    : null,
                ratio: Number(s.ratio),
                votingRatio: Number(s.votingRatio),
              }),
            ),
          }
        : null,
      legalRepresentative: company.legalRepresentative
        ? {
            id: company.legalRepresentative.id,
            name: company.legalRepresentative.name,
            email: company.legalRepresentative.email,
            displayName:
              company.legalRepresentative.profile?.displayName ?? null,
            avatarUrl: company.legalRepresentative.avatarAttachmentId
              ? (attachmentUrlMap.get(
                  company.legalRepresentative.avatarAttachmentId,
                ) ?? null)
              : null,
          }
        : null,
      workflow: company.workflowInstance
        ? {
            id: company.workflowInstance.id,
            state:
              company.workflowState ?? company.workflowInstance.currentState,
            definitionCode: company.workflowInstance.definitionCode,
            definitionName: company.workflowInstance.definition?.name,
          }
        : null,
      type: effectiveType,
      industry: effectiveIndustry,
      policies: company.policies,
      auditTrail: company.auditRecords,
      applications: company.applications,
      lastActiveAt: company.lastActiveAt,
      approvedAt: company.approvedAt,
      contactEmail: company.contactEmail,
      contactPhone: company.contactPhone,
      contactAddress: company.contactAddress,
      homepageUrl: company.homepageUrl,
      permissions: {
        canEdit,
        canManageMembers,
        canViewDashboard,
      },
      availableActions: this.getAvailableActions(company),
    };
  }

  private getAvailableActions(company: CompanyWithRelations) {
    const instance = company.workflowInstance;
    if (!instance?.definition) {
      return [];
    }
    try {
      const config = this.workflowService.parseDefinitionConfig(
        instance.definition as WorkflowDefinitionWithConfig,
      );
      const stateKey = company.workflowState ?? instance.currentState;
      const state = config.states.find((entry) => entry.key === stateKey);
      if (!state) {
        return [];
      }
      return state.actions.map((action) => ({
        key: action.key,
        label: action.label,
        roles: action.roles ?? [],
      }));
    } catch (error) {
      this.logger.warn(`解析流程配置失败: ${error}`);
      return [];
    }
  }

  private calculateDashboardStats(companies: CompanyWithRelations[]) {
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

  private async ensureBaselineMetadata() {
    await Promise.all([this.ensureIndustries(), this.ensureTypes()]);
  }

  private async ensureIndustries() {
    await Promise.all(
      DEFAULT_INDUSTRIES.map((industry) =>
        this.prisma.companyIndustry.upsert({
          where: { code: industry.code },
          update: {
            name: industry.name,
            description: industry.description,
            isActive: true,
          },
          create: {
            ...industry,
            isActive: true,
          },
        }),
      ),
    );
  }

  private async ensureTypes() {
    await Promise.all(
      DEFAULT_COMPANY_TYPES.map((type) =>
        this.prisma.companyType.upsert({
          where: { code: type.code },
          update: {
            name: type.name,
            description: type.description,
            category: type.category,
          },
          create: {
            ...type,
          },
        }),
      ),
    );
  }

  private toJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
