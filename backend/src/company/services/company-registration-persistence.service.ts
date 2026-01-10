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
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const application = await client.companyApplication.findUnique({
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
    await this.persistLlcRegistration(companyId, application.id, llc, client);
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
    await this.persistLlcRegistration(
      companyId,
      application.id,
      llc,
      this.prisma,
    );
  }

  private async persistLlcRegistration(
    companyId: string,
    applicationId: string,
    llc: any,
    tx: Prisma.TransactionClient,
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

    const registration = await tx.companyLlcRegistration.upsert({
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

    await tx.companyLlcRegistrationShareholder.deleteMany({
      where: { registrationId: registration.id },
    });
    await tx.companyLlcRegistrationOfficer.deleteMany({
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
      await tx.companyLlcRegistrationShareholder.createMany({
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
      await tx.companyLlcRegistrationOfficer.createMany({
        data: officerRows,
      });
    }
  }
}
