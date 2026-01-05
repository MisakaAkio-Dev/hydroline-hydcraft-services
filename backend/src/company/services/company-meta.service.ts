import { Injectable } from '@nestjs/common';
import {
  CompanyCategory,
  CompanyIndustry,
  CompanyStatus,
  CompanyType,
  CompanyVisibility,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { CompanyRecommendationsQueryDto } from '../dto/company.dto';
import {
  UpsertCompanyIndustryDto,
  UpsertCompanyTypeDto,
} from '../dto/admin-config.dto';
import { slugify } from '../utils/slugify';

export type CompanyMetaResult = {
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

@Injectable()
export class CompanyMetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

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

  async upsertIndustry(dto: UpsertCompanyIndustryDto) {
    const payload = {
      name: dto.name,
      code: dto.code?.trim() || slugify(dto.name),
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
      code: dto.code?.trim() || slugify(dto.name),
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

  async ensureBaselineMetadata() {
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
