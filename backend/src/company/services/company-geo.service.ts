import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyLlcOfficerRole, CompanyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '../../config/config.service';
import {
  GeoDivisionSearchDto,
  LimitedLiabilityCompanyApplicationDto,
} from '../dto/company.dto';
import {
  CreateWorldDivisionNodeDto,
  UpdateWorldDivisionNodeDto,
} from '../dto/admin-geo-division.dto';

const WORLD_ADMIN_DIVISIONS_NAMESPACE = 'world.admin_divisions';
const WORLD_ADMIN_DIVISIONS_KEY = 'divisions_v1';

export type WorldDivisionNode = {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  parentId?: string | null;
};

@Injectable()
export class CompanyGeoService {
  private readonly SUPER_AUTHORITY_NAME = '氢气市场监督管理总局';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  async resolveAuthorityDivisionIdsByDivisionId(divisionId: string) {
    const id = String(divisionId ?? '').trim();
    if (!id) return [];
    const path = await this.getGeoDivisionPath(id);
    const ids = [path.level1?.id, path.level2?.id, path.level3?.id].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    return Array.from(new Set(ids));
  }

  async resolveAuthorityMatchersByDivisionId(divisionId: string) {
    const id = String(divisionId ?? '').trim();
    if (!id) {
      return [this.SUPER_AUTHORITY_NAME, '市场监督管理总局'];
    }
    const path = await this.getGeoDivisionPath(id);
    const items: string[] = [];
    if (path.level3?.name) items.push(`${path.level3.name}`);
    if (path.level2?.name) items.push(`${path.level2.name}`);
    if (path.level1?.name) items.push(`${path.level1.name}`);
    items.push(this.SUPER_AUTHORITY_NAME);
    items.push('市场监督管理总局');
    return Array.from(new Set(items.filter((v) => v.trim().length > 0)));
  }

  async listRegistrationAuthoritiesByDivisionId(divisionId: string) {
    const divisionIds =
      await this.resolveAuthorityDivisionIdsByDivisionId(divisionId);
    if (!divisionIds.length) return [];

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

  async normalizeAndValidateLlcRegistrationAuthority(
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
      llc.registrationAuthorityName = authorityName;
      return;
    }

    if (!authorityNameRaw) {
      throw new BadRequestException('请选择登记机关（市场监督管理局）');
    }
    await this.assertAuthorityNameAllowedForDivision(
      authorityNameRaw,
      domicileDivisionId,
    );
    llc.registrationAuthorityName = authorityNameRaw;
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

  private async loadWorldDivisions(): Promise<WorldDivisionNode[]> {
    const entry = await this.configService.getEntry(
      WORLD_ADMIN_DIVISIONS_NAMESPACE,
      WORLD_ADMIN_DIVISIONS_KEY,
    );
    if (!entry || !Array.isArray(entry.value)) {
      return [];
    }
    const raw = entry.value as unknown[];
    const items: WorldDivisionNode[] = [];
    for (const node of raw) {
      if (!node || typeof node !== 'object') continue;
      const n = node as Record<string, unknown>;
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

  async assertAuthorityNameAllowedForDivision(
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
}
