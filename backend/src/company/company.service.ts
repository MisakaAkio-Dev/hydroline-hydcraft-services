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
  CompanyMemberRole,
  CompanyPosition,
  CompanyStatus,
  CompanyType,
  CompanyVisibility,
  Prisma,
  WorkflowInstanceStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import {
  AdminCompanyListQueryDto,
  AdminCreateCompanyDto,
  AdminUpdateCompanyDto,
  CompanyActionDto,
  CompanyAttachmentSearchDto,
  CompanyDeregistrationApplyDto,
  CompanyDirectoryQueryDto,
  CompanyMemberApprovalDto,
  CompanyMemberInviteDto,
  CompanyMemberJoinDto,
  CompanyMemberRejectDto,
  CompanyMemberUpdateDto,
  CompanyRecommendationsQueryDto,
  CompanySearchDto,
  GeoDivisionSearchDto,
  CompanySettingsDto,
  CompanyUserSearchDto,
  CreateCompanyApplicationDto,
  CompanyApplicationConsentDecisionDto,
  LimitedLiabilityCompanyApplicationDto,
  UpdateCompanyProfileDto,
  WithdrawCompanyApplicationDto,
} from './dto/company.dto';
import {
  COMPANY_MEMBER_WRITE_ROLES,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION,
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
  members: {
    include: {
      user: {
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
      position: true,
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
      shareholders: true,
      officers: true,
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
  positions: CompanyPosition[];
};

type CompanyRegistrationStatRow = {
  date: string;
  total: number;
  individual: number;
};

type CompanyDashboardStats = {
  companyCount: number;
  individualBusinessCount: number;
  memberCount: number;
};

type CompanySettings = {
  joinPolicy?: 'AUTO' | 'REVIEW';
  positionPermissions?: Record<string, string[]>;
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

const DEFAULT_POSITIONS = [
  {
    code: 'legal_person',
    name: '法定代表人',
    description: '对外承担法律责任的法人，具备流程审批权。',
    role: CompanyMemberRole.LEGAL_PERSON,
  },
  {
    code: 'owner',
    name: '股东 / 持有人',
    description: '拥有公司份额，决定重大运营方向。',
    role: CompanyMemberRole.OWNER,
  },
  {
    code: 'board_director',
    name: '董事',
    description: '董事会成员，负责制度与监督。',
    role: CompanyMemberRole.EXECUTIVE,
  },
  {
    code: 'general_manager',
    name: '总经理 / 经理',
    description: '负责日常运营与团队管理。',
    role: CompanyMemberRole.MANAGER,
  },
  {
    code: 'auditor',
    name: '监事 / 审计',
    description: '监督公司财务与合规。',
    role: CompanyMemberRole.AUDITOR,
  },
  {
    code: 'staff',
    name: '职员 / 成员',
    description: '普通职级，承担执行任务。',
    role: CompanyMemberRole.MEMBER,
  },
];

const INVITEABLE_MEMBER_ROLES: CompanyMemberRole[] = [
  CompanyMemberRole.MEMBER,
  CompanyMemberRole.MANAGER,
  CompanyMemberRole.EXECUTIVE,
  CompanyMemberRole.AUDITOR,
];

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

  async getMeta(): Promise<
    CompanyMetaResult & { memberWriteRoles: CompanyMemberRole[] }
  > {
    const [industries, types, positions] = await this.prisma.$transaction([
      this.prisma.companyIndustry.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyType.findMany({
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyPosition.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      industries,
      types,
      positions,
      memberWriteRoles: COMPANY_MEMBER_WRITE_ROLES,
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
        members: {
          where: {
            role: {
              in: [CompanyMemberRole.LEGAL_PERSON, CompanyMemberRole.OWNER],
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profile: { select: { displayName: true } },
              },
            },
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
      legalPerson: this.pickMember(
        company.members,
        CompanyMemberRole.LEGAL_PERSON,
      ),
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
      owners: company.members.filter(
        (member) => member.role === CompanyMemberRole.OWNER,
      ),
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
        members: {
          some: {
            userId,
          },
        },
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
    if (application.status !== CompanyApplicationStatus.SUBMITTED) {
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

    // 刷新汇总状态
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
    const progress =
      rejectedCount > 0
        ? CompanyApplicationConsentProgress.REJECTED
        : pendingCount > 0
          ? CompanyApplicationConsentProgress.PENDING
          : CompanyApplicationConsentProgress.APPROVED;
    const isDeregistration =
      application.workflowInstance?.definitionCode ===
      DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE;
    await this.prisma.companyApplication.update({
      where: { id: applicationId },
      data: {
        consentStatus: progress,
        consentCompletedAt:
          progress === CompanyApplicationConsentProgress.APPROVED ? now : null,
        currentStage:
          progress === CompanyApplicationConsentProgress.APPROVED
            ? 'READY_FOR_AUTHORITY'
            : 'AWAITING_CONSENTS',
        ...(isDeregistration && progress === CompanyApplicationConsentProgress.REJECTED
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
          actorRole: 'ADMIN',
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
          ? adminActionComments.get(rejectKey) ?? null
          : null);
      const requestChangesComment =
        requestChangesKey && adminActionComments.has(requestChangesKey)
          ? adminActionComments.get(requestChangesKey) ?? null
          : null;

      const reviewComment =
        a.status === CompanyApplicationStatus.REJECTED
          ? rejectComment
          : a.status === CompanyApplicationStatus.NEEDS_CHANGES
            ? requestChangesComment
            : null;
      return {
        id: a.id,
        companyId: a.companyId,
        company: a.company ?? null,
        workflowCode: a.workflowInstance?.definitionCode ?? null,
        status: a.status,
        currentStage: a.currentStage,
        submittedAt: a.submittedAt,
        resolvedAt: a.resolvedAt,
        consentStatus: a.consentStatus,
        consentCompletedAt: a.consentCompletedAt,
        name:
          typeof payload?.name === 'string'
            ? payload.name
            : a.company?.name ?? null,
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
    const industry = await this.resolveIndustry(dto.industryId, dto.industryCode);

    if (type?.code === 'limited_liability_company') {
      if (!dto.llc) {
        throw new BadRequestException('缺少有限责任公司登记所需字段');
      }
      this.validateLlcApplication(dto.llc);
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
      actorRoles: ['OWNER', 'LEGAL_PERSON'],
      comment: dto.comment,
      payload: {},
    });

    const applicationStatus = transition.nextState.business
      ?.applicationStatus as CompanyApplicationStatus | undefined;

    // 重新提交：回到“已提交”，并按最新表单内容重新生成需同意人员
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
      const resolvedName =
        typeof payload?.name === 'string'
          ? payload.name
          : entry.application?.company?.name ?? null;
      return {
        applicationId: entry.application.id,
        workflowCode: entry.application.workflowInstance?.definitionCode ?? null,
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
    }

    const workflowCode = type?.defaultWorkflow ?? DEFAULT_COMPANY_WORKFLOW_CODE;

    const application = await this.prisma.companyApplication.create({
      data: {
        applicantId: userId,
        typeId: type?.id,
        industryId: industry?.id,
        status: CompanyApplicationStatus.SUBMITTED,
        currentStage: 'submitted',
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
      data: { workflowInstanceId: workflowInstance.id },
    });

    if (type?.code === 'limited_liability_company' && dto.llc) {
      await this.initLlcApplicationConsents(application.id, dto.llc);
    }

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      // 自动移交/自动审批仅在“参与人同意已完成”时才允许继续推进到登记机关；
      // 否则这是正常流程：申请已提交，等待所有参与人同意后系统再移交。
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

    // 注销：提交后需要“全体股东一致同意”才能进入管理员审批列表（见 listApplications 过滤逻辑）
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

  async updateCompanyAsMember(
    companyId: string,
    userId: string,
    dto: UpdateCompanyProfileDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
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

  async inviteMember(
    companyId: string,
    actorId: string,
    dto: CompanyMemberInviteDto,
  ) {
    await this.assertMemberPermission(companyId, actorId, 'MANAGE_MEMBERS');
    const role = dto.role ?? CompanyMemberRole.MEMBER;
    if (!INVITEABLE_MEMBER_ROLES.includes(role)) {
      throw new BadRequestException('Disallowed member role');
    }
    const company = await this.findCompanyOrThrow(companyId);
    const settings = this.parseCompanySettings(company.settings ?? null);
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser) {
      throw new BadRequestException('Invalid member user');
    }
    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: dto.userId,
      },
    });
    if (existingMember) {
      throw new BadRequestException('This user is already a member');
    }
    const position = await this.resolvePosition(dto.positionCode ?? 'staff');
    const basePermissions = this.resolvePositionPermissions(
      settings,
      position?.code ?? null,
    );
    await this.prisma.companyMember.create({
      data: {
        companyId,
        userId: dto.userId,
        role,
        title: dto.title,
        positionCode: position?.code,
        permissions: basePermissions,
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        lastActiveAt: new Date(),
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, actorId);
  }

  async joinCompany(
    companyId: string,
    userId: string,
    dto: CompanyMemberJoinDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    if (company.status !== CompanyStatus.ACTIVE) {
      throw new BadRequestException('Can only join active entities');
    }
    const settings = this.parseCompanySettings(company.settings ?? null);
    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId,
      },
    });
    if (existingMember) {
      throw new BadRequestException('You are already a member of this entity');
    }
    const position = await this.resolvePosition(dto.positionCode ?? 'staff');
    const joinPolicy = this.resolveJoinPolicy(settings);
    const basePermissions = this.resolvePositionPermissions(
      settings,
      position?.code ?? null,
    );
    const metadata =
      joinPolicy === 'REVIEW'
        ? this.toJsonValue(
            this.buildMemberMetadata(null, {
              joinStatus: 'PENDING',
              requestedPositionCode: position?.code ?? null,
              requestedTitle: dto.title ?? null,
            }),
          )
        : Prisma.JsonNull;
    await this.prisma.companyMember.create({
      data: {
        companyId,
        userId,
        role: CompanyMemberRole.MEMBER,
        title: joinPolicy === 'AUTO' ? dto.title : null,
        positionCode: joinPolicy === 'AUTO' ? position?.code : null,
        permissions: basePermissions,
        metadata,
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        lastActiveAt: joinPolicy === 'AUTO' ? new Date() : undefined,
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async approveJoinRequest(
    companyId: string,
    userId: string,
    dto: CompanyMemberApprovalDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'MANAGE_MEMBERS');
    const company = await this.findCompanyOrThrow(companyId);
    const settings = this.parseCompanySettings(company.settings ?? null);
    const member = await this.prisma.companyMember.findFirst({
      where: { id: dto.memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Pending member not found');
    }
    if (this.resolveJoinStatus(member.metadata) !== 'PENDING') {
      throw new BadRequestException('Member is not pending approval');
    }
    const requestedPositionCode =
      (member.metadata as { requestedPositionCode?: string })
        ?.requestedPositionCode ?? null;
    const position = await this.resolvePosition(
      dto.positionCode ?? requestedPositionCode ?? 'staff',
    );
    const permissions = this.resolvePositionPermissions(
      settings,
      position?.code ?? null,
    );
    await this.prisma.companyMember.update({
      where: { id: member.id },
      data: {
        positionCode: position?.code ?? null,
        title: dto.title ?? member.title ?? null,
        permissions,
        metadata: this.toJsonValue(
          this.buildMemberMetadata(member.metadata, {
            joinStatus: 'ACTIVE',
          }),
        ),
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: { lastActiveAt: new Date() },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async rejectJoinRequest(
    companyId: string,
    userId: string,
    dto: CompanyMemberRejectDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'MANAGE_MEMBERS');
    const member = await this.prisma.companyMember.findFirst({
      where: { id: dto.memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Pending member not found');
    }
    if (this.resolveJoinStatus(member.metadata) !== 'PENDING') {
      throw new BadRequestException('Member is not pending approval');
    }
    await this.prisma.companyMember.delete({ where: { id: member.id } });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async updateMember(
    companyId: string,
    userId: string,
    dto: CompanyMemberUpdateDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'MANAGE_MEMBERS');
    const member = await this.prisma.companyMember.findFirst({
      where: { id: dto.memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    const position = dto.positionCode
      ? await this.resolvePosition(dto.positionCode)
      : null;
    await this.prisma.companyMember.update({
      where: { id: member.id },
      data: {
        positionCode: position?.code ?? null,
        title: dto.title ?? null,
        permissions: dto.permissions ?? member.permissions ?? [],
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async updateCompanySettings(
    companyId: string,
    userId: string,
    dto: CompanySettingsDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    const company = await this.findCompanyOrThrow(companyId);
    const currentSettings = this.parseCompanySettings(company.settings ?? null);
    const merged = this.buildCompanySettings(currentSettings, {
      joinPolicy: dto.joinPolicy,
      positionPermissions: dto.positionPermissions ?? {},
    });
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        settings: this.toJsonValue(merged),
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
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const company = await this.findCompanyOrThrow(companyId);
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
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const company = await this.findCompanyOrThrow(companyId);

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
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    const attachment =
      await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (attachment.owner?.id !== userId) {
      throw new ForbiddenException('Attachment is not owned by the requester');
    }
    if (!attachment.isPublic) {
      throw new BadRequestException('Attachment must be public');
    }
    const company = await this.findCompanyOrThrow(companyId);
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
    const ownerId = dto.ownerId ?? actorId;
    const legalRepresentativeId = dto.legalRepresentativeId ?? ownerId;
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
    const company = await this.prisma.company.create({
      data: {
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
        workflowDefinitionCode: workflowCode,
        status: dto.status ?? CompanyStatus.ACTIVE,
        visibility: dto.visibility ?? CompanyVisibility.PUBLIC,
        createdById: ownerId,
        updatedById: actorId,
        lastActiveAt: new Date(),
        approvedAt: new Date(),
        activatedAt: new Date(),
        recommendationScore: 0,
      },
    });
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
    const ownerPosition = await this.resolvePosition('owner');
    const legalPosition = await this.resolvePosition('legal_person');
    await this.prisma.companyMember.createMany({
      data: [
        {
          companyId: company.id,
          userId: ownerId,
          role: CompanyMemberRole.OWNER,
          title: '公司持有者',
          isPrimary: true,
          positionCode: ownerPosition?.code,
        },
        {
          companyId: company.id,
          userId: legalRepresentativeId,
          role: CompanyMemberRole.LEGAL_PERSON,
          title: '法定代表人',
          isPrimary: true,
          positionCode: legalPosition?.code,
        },
      ],
      skipDuplicates: true,
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
      );
    }
    const company = await this.findCompanyOrThrow(application.companyId);
    return this.executeWorkflowAction(
      company,
      actorId,
      dto,
      application.workflowInstanceId,
      application.id,
    );
  }

  private async executeRegistrationApplicationWorkflowAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
    instanceId: string,
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
      actorRoles: ['ADMIN'],
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
      const now = new Date();
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

    const payload = application.payload as any;
    const dto = payload as CreateCompanyApplicationDto;
    const llc = (payload?.llc ??
      null) as LimitedLiabilityCompanyApplicationDto | null;

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

    const ownerPosition = await this.resolvePosition('owner');
    const legalPosition = await this.resolvePosition('legal_person');
    await this.prisma.companyMember.createMany({
      data: [
        {
          id: randomUUID(),
          companyId: company.id,
          userId: application.applicantId,
          role: CompanyMemberRole.OWNER,
          title: '公司持有者',
          isPrimary: true,
          positionCode: ownerPosition?.code ?? null,
          permissions: [],
          metadata: Prisma.JsonNull,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          companyId: company.id,
          userId: legalRepresentativeId,
          role: CompanyMemberRole.LEGAL_PERSON,
          title: '法定代表人',
          isPrimary: true,
          positionCode: legalPosition?.code ?? null,
          permissions: [],
          metadata: Prisma.JsonNull,
          createdAt: now,
          updatedAt: now,
        },
      ],
      skipDuplicates: true,
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
    const payload = application.payload as any;
    const llc = payload?.llc as
      | LimitedLiabilityCompanyApplicationDto
      | undefined;
    if (!llc) return;

    const now = new Date();
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
        registrationAuthorityName: llc.registrationAuthorityName,
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
        registrationAuthorityName: llc.registrationAuthorityName,
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
      actorRoles: ['ADMIN'],
      comment: dto.comment,
      payload: dto.payload,
    });
    await this.applyWorkflowEffects(company, transition);

    if (dto.actionKey === 'approve') {
      // 注册流程在 approve 时会通过 applicationId->companyId 入库 LLC；
      // 这里保留对“已有 companyId 的流程”（例如注销/其他）的兼容。
      await this.persistLlcRegistrationIfNeeded(company.id, instanceId);
    }

    const resolvedApplicationId =
      applicationId ??
      company.applications.find(
        (entry) => entry.workflowInstanceId === transition.instance.id,
      )?.id;
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
    const payload = application.payload as any;
    const llc = payload?.llc as
      | LimitedLiabilityCompanyApplicationDto
      | undefined;
    if (!llc) return;

    const now = new Date();
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
        registrationAuthorityName: llc.registrationAuthorityName,
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
        registrationAuthorityName: llc.registrationAuthorityName,
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

  private canViewCompany(
    company: CompanyWithRelations,
    viewerId?: string | null,
  ) {
    if (viewerId) {
      const isMember = company.members.some(
        (member) => member.userId === viewerId,
      );
      if (isMember) return true;
    }
    if (company.visibility === CompanyVisibility.PUBLIC) {
      return company.status !== CompanyStatus.REJECTED;
    }
    return false;
  }

  private pickMember<T extends { role: CompanyMemberRole }>(
    members: T[],
    role: CompanyMemberRole,
  ) {
    return members.find((member) => member.role === role);
  }

  private async assertMemberPermission(
    companyId: string,
    userId: string,
    permission: 'MANAGE_MEMBERS' | 'EDIT_COMPANY',
  ) {
    const member = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId,
      },
    });
    if (!member) {
      throw new ForbiddenException('Not a company member');
    }
    if (this.resolveJoinStatus(member.metadata) !== 'ACTIVE') {
      throw new ForbiddenException('Pending members cannot manage company');
    }
    if (
      member.role === CompanyMemberRole.OWNER ||
      member.role === CompanyMemberRole.LEGAL_PERSON
    ) {
      return;
    }
    if (member.permissions?.includes(permission)) {
      return;
    }
    throw new ForbiddenException('Insufficient member permissions');
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

  private resolveAutoApproveKey(workflowCode?: string) {
    return workflowCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE
      ? 'auto_approve_deregistration'
      : COMPANY_CONFIG_AUTO_APPROVE_KEY;
  }

  private async assertCanInitiateDeregistration(
    company: CompanyWithRelations,
    userId: string,
  ) {
    // 1) 法定代表人 / OWNER（一般也属于股东）可发起
    const member = company.members.find(
      (m) =>
        m.userId === userId &&
        (m.role === CompanyMemberRole.OWNER ||
          m.role === CompanyMemberRole.LEGAL_PERSON),
    );
    if (member) {
      if (this.resolveJoinStatus(member.metadata) !== 'ACTIVE') {
        throw new ForbiddenException('Pending members cannot request deregistration');
      }
      return;
    }

    // 2) 股东（LLC 股东表）也可发起：USER 股东本人 / COMPANY 股东的法定代表人
    const llc = company.llcRegistration;
    const shareholders = llc?.shareholders ?? [];
    if (!shareholders.length) {
      throw new ForbiddenException('Only legal representative or shareholders can request deregistration');
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
      throw new ForbiddenException('Only legal representative or shareholders can request deregistration');
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

    throw new ForbiddenException('Only legal representative or shareholders can request deregistration');
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
      // 兜底：无 LLC 股东数据时，把 OWNER 成员视为股东范围
      for (const m of company.members) {
        if (m.role !== CompanyMemberRole.OWNER) continue;
        requirements.push({
          requiredUserId: m.userId,
          role: CompanyApplicationConsentRole.SHAREHOLDER_USER,
          shareholderUserId: m.userId,
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
  private async assertCompanyNameAvailable(name: string, companyIdToIgnore?: string | null) {
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

  private parseCompanySettings(
    value: Prisma.JsonValue | null,
  ): CompanySettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const settings = value as Record<string, unknown>;
    const joinPolicy = settings.joinPolicy;
    const positionPermissions = settings.positionPermissions;
    return {
      joinPolicy: joinPolicy === 'AUTO' ? 'AUTO' : 'REVIEW',
      positionPermissions:
        typeof positionPermissions === 'object' && positionPermissions
          ? (positionPermissions as Record<string, string[]>)
          : {},
    };
  }

  private buildCompanySettings(
    existing: CompanySettings,
    next: CompanySettings,
  ) {
    return {
      ...existing,
      ...next,
      positionPermissions: {
        ...(existing.positionPermissions ?? {}),
        ...(next.positionPermissions ?? {}),
      },
    };
  }

  private resolveJoinPolicy(settings: CompanySettings | null | undefined) {
    return settings?.joinPolicy === 'AUTO' ? 'AUTO' : 'REVIEW';
  }

  private resolvePositionPermissions(
    settings: CompanySettings | null | undefined,
    positionCode?: string | null,
  ) {
    if (!positionCode) return [];
    return settings?.positionPermissions?.[positionCode] ?? [];
  }

  private resolveJoinStatus(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return 'ACTIVE';
    }
    const status = (metadata as { joinStatus?: string }).joinStatus;
    return status === 'PENDING' ? 'PENDING' : 'ACTIVE';
  }

  private buildMemberMetadata(
    metadata: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ) {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    return {
      ...base,
      ...patch,
    };
  }

  private async serializeCompany(
    company: CompanyWithRelations,
    viewerId?: string,
  ) {
    const settings = this.parseCompanySettings(company.settings ?? null);
    const viewerMember = viewerId
      ? company.members.find(
          (member) =>
            member.userId === viewerId &&
            this.resolveJoinStatus(member.metadata) === 'ACTIVE',
        )
      : undefined;
    const isOwner =
      viewerMember?.role === CompanyMemberRole.OWNER ||
      viewerMember?.role === CompanyMemberRole.LEGAL_PERSON;
    const memberPermissions = viewerMember?.permissions ?? [];
    const canEdit =
      Boolean(isOwner) ||
      COMPANY_MEMBER_WRITE_ROLES.includes(viewerMember?.role ?? 'MEMBER') ||
      memberPermissions.includes('EDIT_COMPANY');
    const canManageMembers =
      Boolean(isOwner) || memberPermissions.includes('MANAGE_MEMBERS');
    const canViewDashboard =
      Boolean(isOwner) ||
      memberPermissions.includes('VIEW_DASHBOARD') ||
      memberPermissions.includes('MANAGE_MEMBERS') ||
      memberPermissions.includes('EDIT_COMPANY');

    const attachmentUrlMap =
      await this.attachmentsService.resolvePublicUrlsByIds([
        company.logoAttachmentId,
        company.legalRepresentative?.avatarAttachmentId,
        ...company.members.map((member) => member.user?.avatarAttachmentId),
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
      (!company.name || company.name.trim() === '' || company.name === '未知公司')
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
      status: company.status,
      visibility: company.visibility,
      category: company.category,
      recommendationScore: company.recommendationScore,
      highlighted: company.highlighted,
      joinPolicy: this.resolveJoinPolicy(settings),
      positionPermissions: settings.positionPermissions ?? {},
      workflow: company.workflowInstance
        ? {
            id: company.workflowInstance.id,
            state:
              company.workflowState ?? company.workflowInstance.currentState,
            definitionCode: company.workflowInstance.definitionCode,
            definitionName: company.workflowInstance.definition?.name,
          }
        : null,
      members: company.members.map((member) => ({
        id: member.id,
        role: member.role,
        title: member.title,
        joinStatus: this.resolveJoinStatus(member.metadata),
        requestedPositionCode: (
          member.metadata as { requestedPositionCode?: string }
        )?.requestedPositionCode,
        requestedTitle: (member.metadata as { requestedTitle?: string })
          ?.requestedTitle,
        permissions: member.permissions ?? [],
        isPrimary: member.isPrimary,
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              displayName: member.user.profile?.displayName ?? null,
              avatarUrl: member.user.avatarAttachmentId
                ? (attachmentUrlMap.get(member.user.avatarAttachmentId) ?? null)
                : null,
            }
          : null,
        position: member.position
          ? {
              code: member.position.code,
              name: member.position.name,
              description: member.position.description ?? null,
              role: member.position.role,
            }
          : null,
      })),
      legalPerson: this.pickMember(
        company.members,
        CompanyMemberRole.LEGAL_PERSON,
      ),
      owners: company.members.filter(
        (member) => member.role === CompanyMemberRole.OWNER,
      ),
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
    const memberCount = companies.reduce(
      (sum, company) =>
        sum +
        company.members.filter(
          (member) => this.resolveJoinStatus(member.metadata) === 'ACTIVE',
        ).length,
      0,
    );
    return {
      companyCount,
      individualBusinessCount,
      memberCount,
    };
  }

  private async ensureBaselineMetadata() {
    await Promise.all([
      this.ensureIndustries(),
      this.ensureTypes(),
      this.ensurePositions(),
    ]);
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

  private async ensurePositions() {
    await Promise.all(
      DEFAULT_POSITIONS.map((position) =>
        this.prisma.companyPosition.upsert({
          where: { code: position.code },
          update: {
            name: position.name,
            description: position.description,
            role: position.role,
          },
          create: {
            ...position,
          },
        }),
      ),
    );
  }

  private async resolvePosition(code?: string | null) {
    if (!code) {
      return null;
    }
    const position = await this.prisma.companyPosition.findUnique({
      where: { code },
    });
    if (!position) {
      throw new BadRequestException('Invalid position code');
    }
    return position;
  }

  private toJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
