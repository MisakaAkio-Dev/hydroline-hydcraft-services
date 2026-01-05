import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompanyApplicationConsentProgress,
  CompanyApplicationConsentRole,
  CompanyApplicationConsentStatus,
  CompanyLlcShareholderKind,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CompanyEquityTransferApplyDto,
  LimitedLiabilityCompanyApplicationDto,
} from '../dto/company.dto';
import type { CompanyWithRelations } from '../types/company.types';

@Injectable()
export class CompanyConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async initLlcApplicationConsents(
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

    requirements.push({
      requiredUserId: llc.legalRepresentativeId,
      role: CompanyApplicationConsentRole.LEGAL_REPRESENTATIVE,
    });

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

  async initEquityTransferApplicationConsents(
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

  async initDeregistrationApplicationConsents(
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

  async initCapitalChangeApplicationConsents(
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

  async initOfficerChangeApplicationConsents(
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

  async initManagementChangeApplicationConsents(
    applicationId: string,
    directorIds: string[],
    newOfficerConsents: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
    }>,
  ) {
    const now = new Date();

    const requirements: Array<{
      requiredUserId: string;
      role: CompanyApplicationConsentRole;
    }> = [];

    for (const uid of Array.from(new Set(directorIds ?? [])).filter(Boolean)) {
      requirements.push({
        requiredUserId: uid,
        role: CompanyApplicationConsentRole.DIRECTOR,
      });
    }

    for (const item of newOfficerConsents ?? []) {
      const uid = String(item?.requiredUserId ?? '').trim();
      if (!uid) continue;
      requirements.push({
        requiredUserId: uid,
        role: item.role,
      });
    }

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

  async initRenameApplicationConsents(
    applicationId: string,
    company: CompanyWithRelations,
  ) {
    return this.initDeregistrationApplicationConsents(applicationId, company);
  }

  async computeDefaultConsentProgress(applicationId: string) {
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

  async computeDeregistrationConsentProgress(
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
      return this.computeDefaultConsentProgress(applicationId);
    }

    const priority = (s: CompanyApplicationConsentStatus) => {
      if (s === CompanyApplicationConsentStatus.REJECTED) return 3;
      if (s === CompanyApplicationConsentStatus.PENDING) return 2;
      return 1;
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
    }

    const threshold = (totalVoting * 2) / 3;
    const eps = 1e-9;
    if (hasExtraRejected) {
      return CompanyApplicationConsentProgress.REJECTED;
    }
    if (approvedVoting + pendingVoting + eps < threshold) {
      return CompanyApplicationConsentProgress.REJECTED;
    }
    if (approvedVoting + eps >= threshold && !hasExtraPending) {
      return CompanyApplicationConsentProgress.APPROVED;
    }
    return CompanyApplicationConsentProgress.PENDING;
  }

  async computeOfficerChangeConsentProgress(
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
      if (hasOfficerPending) return CompanyApplicationConsentProgress.PENDING;
      return this.computeDefaultConsentProgress(applicationId);
    }

    const priority = (s: CompanyApplicationConsentStatus) => {
      if (s === CompanyApplicationConsentStatus.REJECTED) return 3;
      if (s === CompanyApplicationConsentStatus.PENDING) return 2;
      return 1;
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
      return CompanyApplicationConsentProgress.REJECTED;
    }

    const shareholderApproved = approvedVoting + eps >= threshold;
    if (shareholderApproved && !hasOfficerPending) {
      return CompanyApplicationConsentProgress.APPROVED;
    }
    return CompanyApplicationConsentProgress.PENDING;
  }

  async computeManagementChangeConsentProgress(applicationId: string) {
    const consents = await this.prisma.companyApplicationConsent.findMany({
      where: { applicationId },
      select: { status: true, role: true, requiredUserId: true },
    });

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

    const directorConsents = consents.filter(
      (c) => c.role === CompanyApplicationConsentRole.DIRECTOR,
    );
    const directorIds = Array.from(
      new Set(directorConsents.map((c) => c.requiredUserId).filter(Boolean)),
    );
    const totalDirectors = directorIds.length;
    if (totalDirectors <= 0) {
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
      return CompanyApplicationConsentProgress.REJECTED;
    }

    if (approvedCount >= threshold && !hasOfficerPending) {
      return CompanyApplicationConsentProgress.APPROVED;
    }
    return CompanyApplicationConsentProgress.PENDING;
  }
}
