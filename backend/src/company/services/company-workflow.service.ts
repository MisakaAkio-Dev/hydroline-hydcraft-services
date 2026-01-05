import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyApplicationConsentProgress,
  CompanyApplicationStatus,
  CompanyLlcOfficerRole,
  CompanyStatus,
  CompanyVisibility,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../../workflow/workflow.service';
import type { WorkflowTransitionResult } from '../../workflow/workflow.types';
import {
  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE,
  DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_CODE,
} from '../company.constants';
import type {
  CompanyActionDto,
  CreateCompanyApplicationDto,
  LimitedLiabilityCompanyApplicationDto,
} from '../dto/company.dto';
import { CompanyChangePersistenceService } from './company-change-persistence.service';
import { CompanyRegistrationPersistenceService } from './company-registration-persistence.service';
import { CompanySupportService } from './company-support.service';

type WorkflowCompanyContext = {
  id: string;
  workflowInstanceId: string | null;
  status: CompanyStatus | null;
  visibility: CompanyVisibility | null;
  workflowState: string | null;
  approvedAt: Date | null;
  archivedAt: Date | null;
  applications: Array<{
    id: string;
    workflowInstanceId: string | null;
  }>;
};

type WorkflowApplicationSummary = {
  id: string;
  companyId: string | null;
  status: CompanyApplicationStatus | null;
  currentStage: string | null;
  consentStatus: CompanyApplicationConsentProgress | null;
  submittedAt: Date | null;
  resolvedAt: Date | null;
  workflowInstanceId: string | null;
};

export type CompanyWorkflowActionResult =
  | { type: 'company'; companyId: string }
  | { type: 'application'; application: WorkflowApplicationSummary | null };

@Injectable()
export class CompanyWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly registrationPersistenceService: CompanyRegistrationPersistenceService,
    private readonly changePersistenceService: CompanyChangePersistenceService,
    private readonly supportService: CompanySupportService,
  ) {}

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ): Promise<CompanyWorkflowActionResult> {
    const company = await this.loadCompanyForWorkflowAction(companyId);
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
  ): Promise<CompanyWorkflowActionResult> {
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
    if (!application.companyId) {
      return this.executeRegistrationApplicationWorkflowAction(
        application.id,
        actorId,
        dto,
        application.workflowInstanceId,
        actorRoles,
      );
    }
    const company = await this.loadCompanyForWorkflowAction(
      application.companyId,
    );
    return this.executeWorkflowAction(
      company,
      actorId,
      dto,
      application.workflowInstanceId,
      application.id,
      actorRoles,
    );
  }

  async registryExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
  ): Promise<CompanyWorkflowActionResult> {
    await this.assertIsRegistryLegalRepresentativeForApplication(
      applicationId,
      actorId,
    );
    return this.adminExecuteApplicationAction(applicationId, actorId, dto, [
      'REGISTRY_AUTHORITY_LEGAL',
    ]);
  }

  private async executeRegistrationApplicationWorkflowAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
    instanceId: string,
    actorRoles: string[],
  ): Promise<CompanyWorkflowActionResult> {
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
      return { type: 'company', companyId };
    }

    const application = await this.prisma.companyApplication.findUnique({
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
    return { type: 'application', application };
  }

  private async executeWorkflowAction(
    company: WorkflowCompanyContext,
    actorId: string,
    dto: CompanyActionDto,
    instanceId: string,
    applicationId?: string,
    actorRoles: string[] = ['ADMIN'],
  ): Promise<CompanyWorkflowActionResult> {
    if (dto.actionKey === 'route_to_review' || dto.actionKey === 'approve') {
      const app = await this.prisma.companyApplication.findFirst({
        where: { companyId: company.id, workflowInstanceId: instanceId },
        select: { consentStatus: true },
      });
      if (
        app &&
        app.consentStatus !== CompanyApplicationConsentProgress.APPROVED
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
      await this.registrationPersistenceService.persistLlcRegistrationIfNeeded(
        company.id,
        instanceId,
      );

      if (
        transition.instance.definitionCode ===
          DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE &&
        resolvedApplicationId
      ) {
        await this.registrationPersistenceService.persistEquityTransferIfNeeded(
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
        await this.changePersistenceService.persistCompanyRenameIfNeeded(
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
        await this.changePersistenceService.persistCompanyDomicileChangeIfNeeded(
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
        await this.changePersistenceService.persistCompanyBusinessScopeChangeIfNeeded(
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
        await this.changePersistenceService.persistCompanyCapitalChangeIfNeeded(
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
        await this.changePersistenceService.persistCompanyOfficerChangeIfNeeded(
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
        await this.changePersistenceService.persistCompanyManagementChangeIfNeeded(
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

    return { type: 'company', companyId: company.id };
  }

  private async applyWorkflowEffects(
    company: WorkflowCompanyContext,
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

  private async loadCompanyForWorkflowAction(
    companyId: string,
  ): Promise<WorkflowCompanyContext> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        workflowInstanceId: true,
        status: true,
        visibility: true,
        workflowState: true,
        approvedAt: true,
        archivedAt: true,
        applications: {
          select: {
            id: true,
            workflowInstanceId: true,
          },
        },
      },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  private async createCompanyFromApprovedApplication(
    applicationId: string,
    instanceId: string,
    actorId: string,
  ): Promise<string> {
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

    const type = await this.supportService.resolveCompanyType(
      application.typeId ?? undefined,
      dto.typeCode,
      true,
    );
    const workflowCode = type?.defaultWorkflow ?? DEFAULT_COMPANY_WORKFLOW_CODE;

    const slug = await this.supportService.generateUniqueSlug(dto.name);
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

    await this.registrationPersistenceService.persistLlcRegistrationFromApplication(
      applicationId,
      company.id,
    );

    return company.id;
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

  private toJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
