import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompanyApplicationConsentProgress,
  CompanyLlcOfficerRole,
  CompanyLlcOperatingTermType,
  CompanyLlcShareholderKind,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyRegistrationPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async persistLlcRegistrationFromApplication(
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
    const llc = payload?.llc as any;
    if (!llc) return;
    await this.persistLlcRegistration(companyId, application.id, llc);
  }

  async persistLlcRegistrationIfNeeded(companyId: string, instanceId: string) {
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
    const llc = payload?.llc as any;
    if (!llc) return;
    await this.persistLlcRegistration(companyId, application.id, llc);
  }

  private async persistLlcRegistration(
    companyId: string,
    applicationId: string,
    llc: any,
  ) {
    if (!llc.registrationAuthorityName?.trim()) {
      throw new BadRequestException('登记机关名称不能为空');
    }
    const now = new Date();
    const operatingTermType =
      llc.operatingTerm?.type === 'YEARS'
        ? CompanyLlcOperatingTermType.YEARS
        : CompanyLlcOperatingTermType.LONG_TERM;
    const operatingTermYears =
      llc.operatingTerm?.type === 'YEARS'
        ? Number(llc.operatingTerm?.years ?? null)
        : null;
    const registeredCapital = Number(llc.registeredCapital ?? 0);
    if (!Number.isFinite(registeredCapital)) {
      throw new BadRequestException('注册资本必须为数字');
    }

    const registration = await this.prisma.companyLlcRegistration.upsert({
      where: { applicationId },
      create: {
        id: randomUUID(),
        companyId,
        applicationId,
        domicileDivisionId: llc.domicileDivisionId,
        domicileDivisionPath: llc.domicileDivisionPath ?? Prisma.JsonNull,
        registeredCapital: Math.floor(registeredCapital),
        administrativeDivisionLevel: Number(llc.administrativeDivisionLevel),
        brandName: llc.brandName,
        industryFeature: llc.industryFeature,
        registrationAuthorityName: llc.registrationAuthorityName,
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
        domicileDivisionPath: llc.domicileDivisionPath ?? Prisma.JsonNull,
        registeredCapital: Math.floor(registeredCapital),
        administrativeDivisionLevel: Number(llc.administrativeDivisionLevel),
        brandName: llc.brandName,
        industryFeature: llc.industryFeature,
        registrationAuthorityName: llc.registrationAuthorityName,
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

  async persistEquityTransferIfNeeded(
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
            updatedAt: new Date(),
          },
        });
      }

      if (to) {
        await tx.companyLlcRegistrationShareholder.update({
          where: { id: to.id },
          data: {
            ratio: Number(to.ratio) + ratio,
            votingRatio: Number(to.votingRatio) + votingRatio,
            updatedAt: new Date(),
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
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    });
  }
}
