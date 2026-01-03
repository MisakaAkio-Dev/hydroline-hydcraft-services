export type CompanyStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'ARCHIVED'

export type CompanyVisibility = 'PUBLIC' | 'PRIVATE' | 'INTERNAL'

export interface CompanyIndustry {
  id: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
}

export interface CompanyType {
  id: string
  code: string
  name: string
  description?: string | null
  category?: string | null
}

export interface CompanyRef {
  id: string
  name: string
  slug: string
  category?: string | null
  type?: { id: string; code: string; name: string } | null
  industry?: { id: string; code: string; name: string } | null
}

export type WorldDivisionLevel = 1 | 2 | 3

export interface WorldDivisionNode {
  id: string
  name: string
  level: WorldDivisionLevel
  parentId?: string | null
}

export interface WorldDivisionPath {
  level1: WorldDivisionNode | null
  level2: WorldDivisionNode | null
  level3: WorldDivisionNode | null
}

export type LlcShareholderKind = 'USER' | 'COMPANY'

export type CompanyLlcOfficerRole =
  | 'LEGAL_REPRESENTATIVE'
  | 'DIRECTOR'
  | 'CHAIRPERSON'
  | 'VICE_CHAIRPERSON'
  | 'MANAGER'
  | 'DEPUTY_MANAGER'
  | 'SUPERVISOR'
  | 'SUPERVISOR_CHAIRPERSON'
  | 'FINANCIAL_OFFICER'

export interface LlcShareholderEntry {
  kind: LlcShareholderKind
  userId?: string
  companyId?: string
  ratio: number
  /**
   * 表决权比例（%）。
   * - 当 llc.votingRightsMode === 'CUSTOM' 时必填，且所有股东合计必须为 100%
   * - 当 llc.votingRightsMode === 'BY_CAPITAL_RATIO' 时可省略（后端会默认使用 ratio）
   */
  votingRatio?: number
}

export interface LimitedLiabilityCompanyApplicationPayload {
  domicileDivisionId: string
  domicileDivisionPath?: WorldDivisionPath
  registeredCapital: number
  administrativeDivisionLevel: WorldDivisionLevel
  brandName: string
  industryFeature: string
  /**
   * 登记机关（机关法人主体）。
   * 推荐字段：用于将审批精确推送给该机关的法定代表人。
   */
  registrationAuthorityCompanyId?: string
  /**
   * 登记机关名称（兼容/展示字段）。
   * 新前端通常会同时提交 registrationAuthorityCompanyId 与该字段（由后端再次校验/回填）。
   */
  registrationAuthorityName?: string
  domicileAddress: string
  operatingTerm: { type: 'LONG_TERM' | 'YEARS'; years?: number }
  businessScope: string
  shareholders: LlcShareholderEntry[]
  /**
   * 股东表决权行使方式：
   * - BY_CAPITAL_RATIO：按出资比例行使（默认）
   * - CUSTOM：自定义各股东表决权比例（合计 100%）
   */
  votingRightsMode?: 'BY_CAPITAL_RATIO' | 'CUSTOM'
  directors: {
    directorIds: string[]
    chairpersonId?: string
    viceChairpersonId?: string
  }
  managers: { managerId?: string; deputyManagerId?: string }
  legalRepresentativeId: string
  supervisors?: { supervisorIds?: string[]; chairpersonId?: string }
  financialOfficerId?: string
}

/**
 * 轻量用户引用（用于选择框/展示等）。
 * 注意：这里不再与任何“公司成员/岗位角色”系统绑定，仅代表用户基本信息。
 */
export interface CompanyUserRef {
  id: string
  name?: string | null
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface CompanyWorkflowInfo {
  id: string
  state: string
  definitionCode: string
  definitionName?: string | null
}

export interface CompanyWorkflowActionOption {
  key: string
  label: string
  roles?: string[]
}

export interface CompanyPolicy {
  id: string
  title: string
  summary?: string | null
  status: string
  version: number
  updatedAt: string
}

export interface CompanyAuditRecord {
  id: string
  actionKey: string
  actionLabel?: string | null
  resultState?: string | null
  comment?: string | null
  payload?: Record<string, unknown> | null
  createdAt: string
  actor?: {
    id: string
    name?: string | null
    email?: string | null
    profile?: { displayName?: string | null } | null
  } | null
}

export interface CompanyApplication {
  id: string
  status: string
  submittedAt: string
  resolvedAt?: string | null
}

export type CompanyApplicationConsentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type CompanyApplicationConsentProgress = 'PENDING' | 'APPROVED' | 'REJECTED'

export type CompanyApplicationConsentRole =
  | 'LEGAL_REPRESENTATIVE'
  | 'SHAREHOLDER_USER'
  | 'SHAREHOLDER_COMPANY_LEGAL'
  | 'TRANSFEREE_USER'
  | 'TRANSFEREE_COMPANY_LEGAL'
  | 'DIRECTOR'
  | 'CHAIRPERSON'
  | 'VICE_CHAIRPERSON'
  | 'MANAGER'
  | 'DEPUTY_MANAGER'
  | 'SUPERVISOR'
  | 'SUPERVISOR_CHAIRPERSON'
  | 'FINANCIAL_OFFICER'

export interface MyCompanyApplicationEntry {
  id: string
  name?: string | null
  workflowCode?: string | null
  status: CompanyApplicationStatus | string
  currentStage?: string | null
  submittedAt: string
  resolvedAt?: string | null
  consentStatus: CompanyApplicationConsentProgress
  consentCompletedAt?: string | null
  consentCounts: { pending: number; approved: number; rejected: number }
  companyId?: string | null
  company?: { id: string; name: string; slug: string; status?: string | null } | null
  /** 管理员在“驳回/要求补件”时填写的理由（后端已按当前状态挑选匹配的 comment） */
  reviewComment?: string | null
  /** 兼容字段：驳回理由（可能来自历史字段或工作流动作 comment） */
  rejectReason?: string | null
  /** 要求补件理由（来自工作流动作 request_changes 的 comment） */
  requestChangesReason?: string | null
}

export interface MyPendingConsentEntry {
  applicationId: string
  name?: string | null
  workflowCode?: string | null
  status: CompanyApplicationStatus | string
  currentStage?: string | null
  consentStatus: CompanyApplicationConsentProgress
  submittedAt: string
  resolvedAt?: string | null
  items: Array<{
    id: string
    role: CompanyApplicationConsentRole
    shareholderCompany?: { id: string; name: string; slug: string } | null
  }>
}

export type CompanyApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_CHANGES'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED'

export interface ApplicationWorkflowDefinitionRef {
  id: string
  code: string
  name?: string | null
}

export interface CompanyWorkflowInstanceRef {
  id: string
  definition?: ApplicationWorkflowDefinitionRef | null
}

export interface AdminCompanyApplicationEntry {
  id: string
  status: CompanyApplicationStatus
  submittedAt: string
  resolvedAt?: string | null
  notes?: string | null
  rejectReason?: string | null
  /**
   * 申请提交时的原始 payload（包含公司名、typeId/typeCode 等）。
   * 注意：公司未入库时 company 可能为 null，需要依赖该字段做展示兜底。
   */
  payload?: Record<string, unknown> | null
  /** 公司未入库时，用申请本身关联的类型/行业做兜底展示 */
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  company?: {
    id: string
    name: string
    slug: string
    type?: CompanyType | null
    industry?: CompanyIndustry | null
    status?: CompanyStatus | null
    workflowState?: string | null
  } | null
  applicant: {
    id: string
    name?: string | null
    email?: string | null
    profile?: {
      displayName?: string | null
    } | null
  }
  workflowInstance?: CompanyWorkflowInstanceRef | null
}

export interface CompanyPermissions {
  canEdit: boolean
  canManageMembers: boolean
  canViewDashboard: boolean
}

export interface CompanyModel {
  id: string
  name: string
  slug: string
  summary?: string | null
  description?: string | null
  logoUrl?: string | null
  logoAttachmentId?: string | null
  status: CompanyStatus
  visibility: CompanyVisibility
  category?: string | null
  recommendationScore?: number | null
  highlighted?: boolean | null
  lastActiveAt?: string | null
  approvedAt?: string | null
  /**
   * 机关法人专用：所属行政区划信息（用于展示/筛选等）。
   * 说明：后端历史上可能仅在 extra.registry 中保存 path/level；因此字段整体为可选。
   */
  administrativeDivision?: {
    domicileDivisionId: string
    domicileDivisionName?: string | null
    domicileDivisionPath?: WorldDivisionPath | null
    administrativeDivisionLevel: WorldDivisionLevel | null
  } | null
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  legalRepresentative?: CompanyUserRef | null
  policies: CompanyPolicy[]
  auditTrail: CompanyAuditRecord[]
  applications: CompanyApplication[]
  workflow: CompanyWorkflowInfo | null
  availableActions: CompanyWorkflowActionOption[]
  contactEmail?: string | null
  contactPhone?: string | null
  contactAddress?: string | null
  homepageUrl?: string | null
  /**
   * 公司工商登记信息（用于变更类业务的表单预填）。
   * - 仅在公司为 LLC 且已入库时存在
   */
  llcRegistration?: {
    registeredCapital: number
    registrationAuthorityName?: string | null
    registrationAuthorityCompanyId?: string | null
    domicileAddress?: string | null
    operatingTermType?: 'LONG_TERM' | 'YEARS' | null
    operatingTermYears?: number | null
    businessScope?: string | null
    officers?: Array<{
      role: CompanyLlcOfficerRole
      user: CompanyUserRef | null
    }>
    votingRightsMode?: 'BY_CAPITAL_RATIO' | 'CUSTOM'
    shareholders: Array<{
      kind: LlcShareholderKind
      userId: string | null
      companyId: string | null
      holderLegalRepresentativeId?: string | null
      holderName?: string | null
      holderRegistrationNumber?: string | null
      holderUnifiedSocialCreditCode?: string | null
      ratio: number
      votingRatio: number
    }>
  } | null
  permissions: CompanyPermissions
}

export interface CompanyRecommendation {
  id: string
  name: string
  slug: string
  summary?: string | null
  status: CompanyStatus
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  legalRepresentative?: CompanyUserRef | null
  recommendationScore?: number | null
  lastActiveAt?: string | null
  approvedAt?: string | null
}

export interface CompanyMeta {
  industries: CompanyIndustry[]
  types: CompanyType[]
}

export interface CompanyDirectoryResponse {
  total: number
  page: number
  pageSize: number
  pageCount: number
  items: CompanyModel[]
}

export interface CompanyDashboardStats {
  companyCount: number
  individualBusinessCount: number
  memberCount: number
}

export interface CompanyDailyRegistration {
  date: string
  total: number
  individual: number
}

export interface AdminCreateCompanyPayload {
  name: string
  summary?: string
  description?: string
  typeId?: string
  industryId?: string
  legalRepresentativeId?: string
  /**
   * 机关法人专用：所属行政区划节点 id（支持 1/2/3 级）。
   */
  domicileDivisionId?: string
  category?: string
  status?: CompanyStatus
  visibility?: CompanyVisibility
}

export interface CreateCompanyApplicationPayload {
  name: string
  summary?: string
  description?: string
  typeId?: string
  typeCode?: string
  industryId?: string
  industryCode?: string
  category?: string
  legalRepresentativeId?: string
  llc?: LimitedLiabilityCompanyApplicationPayload
}

export interface CompanyDeregistrationApplyPayload {
  reason?: string
}

export interface CompanyRenameApplyPayload {
  newName: string
  reason?: string
}

export interface CompanyDomicileChangeApplyPayload {
  domicileAddress: string
  /** 可选：变更所属行政区划（不填则保持不变） */
  domicileDivisionId?: string
  /** 可选：前端缓存的区划路径（不填则保持不变） */
  domicileDivisionPath?: WorldDivisionPath
  /**
   * 新登记机关名称（市场监督管理局体系）。
   * 通常由前端根据 domicileDivisionId 的区划路径生成候选，并让玩家选择其一。
   */
  registrationAuthorityName?: string
  /** 新登记机关（机关法人主体） */
  registrationAuthorityCompanyId?: string
  reason?: string
}

export interface CompanyBusinessScopeChangeApplyPayload {
  businessScope: string
  reason?: string
}

export interface CompanyManagementChangeApplyPayload {
  /** 新经理 userId（不填表示不变更） */
  managerId?: string
  /** 新副经理 userId（不填表示不变更） */
  deputyManagerId?: string
  /** 新财务负责人 userId（不填表示不变更） */
  financialOfficerId?: string
  reason?: string
}

export interface CompanyCapitalChangeApplyPayload {
  /**
   * 变更类型：
   * - INCREASE：增资
   * - DECREASE：减资
   *
   * 可选：不填时后端会根据新旧注册资本大小推断
   */
  changeType?: 'INCREASE' | 'DECREASE'
  /** 新注册资本金额 */
  newRegisteredCapital: number
  /** 变更后股东结构（出资比例合计 100%） */
  shareholders: LlcShareholderEntry[]
  /** 股东表决权行使方式 */
  votingRightsMode?: 'BY_CAPITAL_RATIO' | 'CUSTOM'
  reason?: string
}

export type EquityTransferParty =
  | { kind: 'USER'; userId: string }
  | { kind: 'COMPANY'; companyId: string }

export interface CompanyEquityTransferApplyPayload {
  transferor: EquityTransferParty
  transferee: EquityTransferParty
  /** 转让股权比例（%） */
  ratio: number
  /** 转让表决权比例（%） */
  votingRatio: number
  comment?: string
}

export interface UpdateCompanyPayload {
  summary?: string
  description?: string
  contactEmail?: string
  contactPhone?: string
  contactAddress?: string
  homepageUrl?: string
  industryId?: string
  industryCode?: string
  extra?: Record<string, unknown>
}
