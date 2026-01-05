import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompanyApplicationConsentProgress,
  CompanyLlcOfficerRole,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyChangePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async persistCompanyRenameIfNeeded(
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
        comment: `公司更名：${newName}`,
        payload: Prisma.JsonNull,
        createdAt: new Date(),
      },
    });
  }

  async persistCompanyDomicileChangeIfNeeded(
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

    await this.prisma.companyLlcRegistration.updateMany({
      where: { companyId },
      data: {
        domicileAddress,
        ...(payload.domicileDivisionId
          ? { domicileDivisionId: payload.domicileDivisionId }
          : {}),
        ...(payload.domicileDivisionPath
          ? {
              domicileDivisionPath:
                payload.domicileDivisionPath as Prisma.InputJsonValue,
            }
          : {}),
        ...(payload.registrationAuthorityName
          ? { registrationAuthorityName: payload.registrationAuthorityName }
          : {}),
        ...(payload.registrationAuthorityCompanyId
          ? {
              registrationAuthorityCompanyId:
                payload.registrationAuthorityCompanyId,
            }
          : {}),
        updatedAt: new Date(),
      },
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
        comment: '公司住所变更已生效',
        payload: Prisma.JsonNull,
        createdAt: new Date(),
      },
    });
  }

  async persistCompanyBusinessScopeChangeIfNeeded(
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

    await this.prisma.companyLlcRegistration.updateMany({
      where: { companyId },
      data: {
        businessScope,
        updatedAt: new Date(),
      },
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
        payload: Prisma.JsonNull,
        createdAt: new Date(),
      },
    });
  }

  async persistCompanyCapitalChangeIfNeeded(
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

    await this.prisma.companyLlcRegistration.updateMany({
      where: { companyId },
      data: {
        registeredCapital: newRegisteredCapital,
        updatedAt: new Date(),
      },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationId,
        actorId,
        actionKey: 'company_change_capital',
        actionLabel: '公司注册资本变更生效',
        resultState: 'APPLIED',
        comment: '公司注册资本变更已生效',
        payload: Prisma.JsonNull,
        createdAt: new Date(),
      },
    });
  }

  async persistCompanyOfficerChangeIfNeeded(
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

    await this.prisma.$transaction(async (tx) => {
      const registration = await tx.companyLlcRegistration.findUnique({
        where: { companyId },
        include: { officers: true },
      });
      if (!registration) {
        throw new BadRequestException('No LLC registration found');
      }

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
      const now = new Date();
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
        });
      }
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
        payload: Prisma.JsonNull,
        createdAt: new Date(),
      },
    });
  }

  async persistCompanyManagementChangeIfNeeded(
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
    const managerId = String(payload.managerId ?? '').trim();
    const deputyManagerId = String(payload.deputyManagerId ?? '').trim();
    const financialOfficerId = String(payload.financialOfficerId ?? '').trim();

    const registration = await this.prisma.companyLlcRegistration.findUnique({
      where: { companyId },
    });
    if (!registration) {
      throw new BadRequestException('No LLC registration found');
    }

    await this.prisma.companyLlcRegistrationOfficer.deleteMany({
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

    const now = new Date();
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
      await this.prisma.companyLlcRegistrationOfficer.createMany({
        data: rows,
      });
    }

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
        payload: Prisma.JsonNull,
        createdAt: new Date(),
      },
    });
  }
}
