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

export type CompanyMemberRole =
  | 'OWNER'
  | 'LEGAL_PERSON'
  | 'EXECUTIVE'
  | 'MANAGER'
  | 'MEMBER'
  | 'AUDITOR'

export type CompanyJoinPolicy = 'AUTO' | 'REVIEW'

export type CompanyPermissionKey =
  | 'VIEW_DASHBOARD'
  | 'MANAGE_MEMBERS'
  | 'EDIT_COMPANY'

export type CompanyJoinStatus = 'PENDING' | 'ACTIVE'

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

export interface LlcShareholderEntry {
  kind: LlcShareholderKind
  userId?: string
  companyId?: string
  ratio: number
}

export interface LimitedLiabilityCompanyApplicationPayload {
  domicileDivisionId: string
  domicileDivisionPath?: WorldDivisionPath
  registeredCapital: number
  administrativeDivisionLevel: WorldDivisionLevel
  brandName: string
  industryFeature: string
  registrationAuthorityName: string
  domicileAddress: string
  operatingTerm: { type: 'LONG_TERM' | 'YEARS'; years?: number }
  businessScope: string
  shareholders: LlcShareholderEntry[]
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

export interface CompanyPosition {
  code: string
  name: string
  description?: string | null
  role: CompanyMemberRole
}

export interface CompanyMemberUserRef {
  id: string
  name?: string | null
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface CompanyMember {
  id: string
  role: CompanyMemberRole
  title?: string | null
  joinStatus?: CompanyJoinStatus | null
  requestedTitle?: string | null
  requestedPositionCode?: string | null
  permissions?: CompanyPermissionKey[]
  isPrimary: boolean
  user?: CompanyMemberUserRef | null
  position?: CompanyPosition | null
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
  joinPolicy?: CompanyJoinPolicy
  positionPermissions?: Record<string, CompanyPermissionKey[]>
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  members: CompanyMember[]
  owners: CompanyMember[]
  legalPerson?: CompanyMember | null
  legalRepresentative?: CompanyMemberUserRef | null
  policies: CompanyPolicy[]
  auditTrail: CompanyAuditRecord[]
  applications: CompanyApplication[]
  workflow: CompanyWorkflowInfo | null
  availableActions: CompanyWorkflowActionOption[]
  contactEmail?: string | null
  contactPhone?: string | null
  contactAddress?: string | null
  homepageUrl?: string | null
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
  legalPerson?: CompanyMember | null
  legalRepresentative?: CompanyMemberUserRef | null
  owners: CompanyMember[]
  recommendationScore?: number | null
  lastActiveAt?: string | null
  approvedAt?: string | null
}

export interface CompanyMeta {
  industries: CompanyIndustry[]
  types: CompanyType[]
  memberWriteRoles: CompanyMemberRole[]
  positions: CompanyPosition[]
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

export interface CompanyMemberInvitePayload {
  userId: string
  role?: CompanyMemberRole
  title?: string
  positionCode?: string
}

export interface CompanyMemberJoinPayload {
  title?: string
  positionCode?: string
}
