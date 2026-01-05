import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyActionDto,
  CompanyApplicationConsentDecisionDto,
  CompanyBusinessScopeChangeApplyDto,
  CompanyCapitalChangeApplyDto,
  CompanyDeregistrationApplyDto,
  CompanyDomicileChangeApplyDto,
  CompanyEquityTransferApplyDto,
  CompanyManagementChangeApplyDto,
  CompanyOfficerChangeApplyDto,
  CompanyRenameApplyDto,
  CreateCompanyApplicationDto,
  LimitedLiabilityCompanyApplicationDto,
  WithdrawCompanyApplicationDto,
} from '../dto/company.dto';
import {
  CompanyApplicationListQueryDto,
  CompanyApplicationSettingsDto,
} from '../dto/admin-config.dto';
import {
  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE,
  DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
  DEFAULT_COMPANY_RENAME_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_DEFINITION,
} from '../company.constants';
import {
  CompanyApplicationConsentProgress,
  CompanyApplicationConsentRole,
  CompanyApplicationConsentStatus,
  CompanyApplicationStatus,
  CompanyLlcOfficerRole,
  CompanyLlcShareholderKind,
  CompanyStatus,
  Prisma,
  WorkflowInstanceStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { CompanyPermissionService } from './company-permission.service';
import { CompanySupportService } from './company-support.service';
import { CompanyGeoService } from './company-geo.service';
import { CompanyConfigService } from './company-config.service';
import { CompanyConsentService } from './company-consent.service';
import { CompanySerializerService } from './company-serializer.service';
import { CompanyWorkflowService } from './company-workflow.service';
import { companyInclude } from '../types/company.types';
import type { CompanyWithRelations } from '../types/company.types';

@Injectable()
export class CompanyApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly supportService: CompanySupportService,
    private readonly geoService: CompanyGeoService,
    private readonly companyConfigService: CompanyConfigService,
    private readonly consentService: CompanyConsentService,
    private readonly permissionService: CompanyPermissionService,
    private readonly serializerService: CompanySerializerService,
    private readonly companyWorkflowService: CompanyWorkflowService,
  ) {}

  private toJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
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
          ? await this.consentService.computeOfficerChangeConsentProgress(
              applicationId,
              application.companyId,
            )
          : isManagementChange
            ? await this.consentService.computeManagementChangeConsentProgress(
                applicationId,
              )
            : await this.consentService.computeDeregistrationConsentProgress(
                applicationId,
                application.companyId,
              )
        : await this.consentService.computeDefaultConsentProgress(
            applicationId,
          );

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

    await this.supportService.assertCompanyNameAvailable(dto.name, null);
    const type = await this.supportService.resolveCompanyType(
      dto.typeId,
      dto.typeCode,
    );
    const industry = await this.supportService.resolveIndustry(
      dto.industryId,
      dto.industryCode,
    );

    if (type?.code === 'limited_liability_company') {
      if (!dto.llc) {
        throw new BadRequestException('缺少有限责任公司登记所需字段');
      }
      this.validateLlcApplication(dto.llc);
      await this.geoService.normalizeAndValidateLlcRegistrationAuthority(
        dto.llc,
      );
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
      await this.geoService.normalizeAndValidateLlcRegistrationAuthority(
        dtoPayload.llc,
      );
      await this.consentService.initLlcApplicationConsents(
        applicationId,
        dtoPayload.llc,
      );
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

  async createApplication(userId: string, dto: CreateCompanyApplicationDto) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_WORKFLOW_DEFINITION,
    );
    await this.supportService.assertCompanyNameAvailable(dto.name, null);
    const type = await this.supportService.resolveCompanyType(
      dto.typeId,
      dto.typeCode,
    );
    const industry = await this.supportService.resolveIndustry(
      dto.industryId,
      dto.industryCode,
    );
    const now = new Date();

    if (type?.code === 'limited_liability_company') {
      if (!dto.llc) {
        throw new BadRequestException('缺少有限责任公司登记所需字段');
      }
      this.validateLlcApplication(dto.llc);
      await this.geoService.normalizeAndValidateLlcRegistrationAuthority(
        dto.llc,
      );
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
      await this.consentService.initLlcApplicationConsents(
        application.id,
        dto.llc,
      );
    }

    const settings =
      await this.companyConfigService.getCompanyApplicationSettings(
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
    await this.permissionService.assertCanInitiateDeregistration(
      company,
      userId,
    );
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
    await this.consentService.initDeregistrationApplicationConsents(
      application.id,
      company,
    );

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
        return this.serializerService.serializeCompany(refreshed, userId);
      }
      const systemUser = await this.resolveSystemUser();
      await this.companyWorkflowService.adminExecuteAction(
        company.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: { workflowInstanceId: workflowInstance.id },
        },
      );
      await this.companyWorkflowService.adminExecuteAction(
        company.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: { workflowInstanceId: workflowInstance.id },
        },
      );
    }

    const refreshed = await this.findCompanyOrThrow(company.id);
    return this.serializerService.serializeCompany(refreshed, userId);
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
    await this.permissionService.assertCanInitiateRename(company, userId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException('Company is not eligible for name change');
    }

    const newName = String(dto.newName ?? '').trim();
    await this.supportService.assertCompanyNameAvailable(newName, company.id);

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
    await this.consentService.initRenameApplicationConsents(
      application.id,
      company,
    );

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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
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
    await this.permissionService.assertCanInitiateRename(company, userId);
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
      await this.geoService.assertAuthorityNameAllowedForDivision(
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
    await this.consentService.initDeregistrationApplicationConsents(
      application.id,
      company,
    );

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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
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
    await this.permissionService.assertCanInitiateRename(company, userId);
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
    await this.consentService.initDeregistrationApplicationConsents(
      application.id,
      company,
    );

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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
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
    await this.permissionService.assertCanInitiateRename(company, userId);
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
          .map((o) => o.userId ?? ''),
      ),
    ).filter(Boolean) as string[];
    const currentSupervisors = Array.from(
      new Set(
        (company.llcRegistration.officers ?? [])
          .filter((o) => o.role === CompanyLlcOfficerRole.SUPERVISOR)
          .map((o) => o.userId ?? ''),
      ),
    ).filter(Boolean) as string[];

    const finalDirectorIds = (directorIdsInput ?? currentDirectors) as string[];
    const finalSupervisorIds = (supervisorIdsInput ??
      currentSupervisors) as string[];

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
    ) as string[];
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
    await this.consentService.initOfficerChangeApplicationConsents(
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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
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
    await this.permissionService.assertCanInitiateManagementChange(
      company,
      userId,
    );
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
      role: CompanyApplicationConsentRole;
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
    await this.consentService.initManagementChangeApplicationConsents(
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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
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
    await this.permissionService.assertCanInitiateRename(company, userId);
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
    await this.consentService.initCapitalChangeApplicationConsents(
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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
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

    await this.permissionService.assertCanInitiateEquityTransfer(
      company,
      userId,
      dto,
    );

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

    await this.consentService.initEquityTransferApplicationConsents(
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
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'route_to_review',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
      await this.companyWorkflowService.adminExecuteApplicationAction(
        application.id,
        systemUser.id,
        {
          actionKey: 'approve',
          comment: 'Auto approval enabled',
          payload: {},
        },
      );
    }

    return this.getApplicationConsents(application.id, userId);
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

  private async getCompanyApplicationSettings(
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    return this.companyConfigService.getCompanyApplicationSettings(
      workflowCode,
    );
  }
}
