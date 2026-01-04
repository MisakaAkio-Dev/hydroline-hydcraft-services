import { CompanyApplicationStatus, CompanyStatus } from '@prisma/client';
import { UpsertWorkflowDefinitionDto } from '../workflow/dto/upsert-workflow-definition.dto';

export const DEFAULT_COMPANY_WORKFLOW_CODE = 'company.registration';
export const DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE =
  'company.deregistration';
export const DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE =
  'company.equity_transfer';
export const DEFAULT_COMPANY_RENAME_WORKFLOW_CODE = 'company.rename';
export const DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE =
  'company.change_domicile';
export const DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE =
  'company.change_business_scope';
export const DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE =
  'company.capital_change';
export const DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE =
  'company.change_officers';
export const DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE =
  'company.change_management';

export const DEFAULT_COMPANY_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_WORKFLOW_CODE,
    name: '公司注册审批流程',
    description: '玩家提交工商主体申请，管理员审核后正式生效',
    category: 'company',
    states: [
      {
        key: 'under_review',
        label: '审核中',
        business: {
          companyStatus: CompanyStatus.UNDER_REVIEW,
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准并入库',
            to: 'approved',
            // 登记机关法定代表人审批；同时保留网站管理员后门权限
            roles: ['REGISTRY_AUTHORITY_LEGAL', 'ADMIN'],
          },
          {
            key: 'request_changes',
            label: '要求补件',
            to: 'needs_revision',
            roles: ['REGISTRY_AUTHORITY_LEGAL', 'ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['REGISTRY_AUTHORITY_LEGAL', 'ADMIN'],
          },
        ],
      },
      {
        key: 'needs_revision',
        label: '待补件',
        business: {
          companyStatus: CompanyStatus.NEEDS_REVISION,
          applicationStatus: CompanyApplicationStatus.NEEDS_CHANGES,
        },
        actions: [
          {
            key: 'resubmit',
            label: '重新提交',
            to: 'under_review',
            // 角色约束由业务层校验（申请人本人），不再依赖旧“公司成员角色”体系
            roles: [],
          },
          {
            key: 'withdraw',
            label: '撤回申请',
            to: 'rejected',
            // 角色约束由业务层校验（申请人本人），不再依赖旧“公司成员角色”体系
            roles: [],
          },
        ],
      },
      {
        key: 'approved',
        label: '已注册',
        final: true,
        business: {
          companyStatus: CompanyStatus.ACTIVE,
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [
          {
            key: 'suspend',
            label: '暂停主体',
            to: 'suspended',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'suspended',
        label: '暂停营业',
        business: {
          companyStatus: CompanyStatus.SUSPENDED,
          applicationStatus: CompanyApplicationStatus.ARCHIVED,
        },
        actions: [
          {
            key: 'reactivate',
            label: '重新激活',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'archive',
            label: '归档',
            to: 'archived',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'archived',
        label: '注销',
        final: true,
        business: {
          companyStatus: CompanyStatus.ARCHIVED,
          applicationStatus: CompanyApplicationStatus.ARCHIVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          companyStatus: CompanyStatus.REJECTED,
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [
          {
            key: 'reopen',
            label: '重新审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
        ],
      },
    ],
  };

export const DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
    name: '公司注销审批流程',
    description: '公司发起注销申请，审核通过后完成注销',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准注销',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已注销',
        final: true,
        business: {
          companyStatus: CompanyStatus.ARCHIVED,
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_EQUITY_TRANSFER_WORKFLOW_CODE,
    name: '公司股权转让审批流程',
    description: '股东发起股权/表决权转让申请，受让人同意后管理员审批生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准变更股东',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_RENAME_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
    name: '公司更名审批流程',
    description:
      '法人或股东发起公司名称变更申请，经享有表决权三分之二以上的股东同意后，管理员审批生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准更名',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
    name: '公司住所变更审批流程',
    description:
      '法人或股东发起公司住所变更申请，经享有表决权三分之二以上的股东同意后，管理员审批生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准变更',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
    name: '公司经营范围变更审批流程',
    description:
      '法人或股东发起公司经营范围变更申请，经享有表决权三分之二以上的股东同意后，管理员审批生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准变更',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
    name: '公司注册资本变更审批流程',
    description:
      '法人或股东发起公司注册资本变更（增资/减资）申请；如涉及新增股东，需新增股东同意 + 享有表决权三分之二以上的原股东同意后，管理员审批生效（如不涉及新增股东，则仅需原股东表决权达到三分之二以上）',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准变更',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
    name: '董事/监事变更审批流程',
    description:
      '法定代表人或股东发起董事/监事变更申请，经半数以上股东同意且新任董事/监事同意后，管理员审批生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准变更',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
    name: '经理/副经理/财务负责人变更审批流程',
    description:
      '任意董事发起更换经理/副经理/财务负责人申请，经半数董事（按人数）同意且新任人员同意后，管理员审批生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准变更',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已生效',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

// 旧“公司成员角色/岗位”系统已移除，仅保留 LLC 股东/高管体系。
