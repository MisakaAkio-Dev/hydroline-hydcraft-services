import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  CompanyDashboardStats,
  CompanyDailyRegistration,
  CompanyDirectoryResponse,
  CompanyUserRef,
  CompanyRef,
  CompanyMeta,
  CompanyModel,
  CompanyRecommendation,
  CompanyDeregistrationApplyPayload,
  CompanyRenameApplyPayload,
  CompanyDomicileChangeApplyPayload,
  CompanyBusinessScopeChangeApplyPayload,
  CompanyManagementChangeApplyPayload,
  CompanyCapitalChangeApplyPayload,
  CompanyEquityTransferApplyPayload,
  CreateCompanyApplicationPayload,
  MyCompanyApplicationEntry,
  MyPendingConsentEntry,
  UpdateCompanyPayload,
} from '@/types/company'

export type RecommendationKind = 'recent' | 'active'

export const useCompanyStore = defineStore('companies', {
  state: () => ({
    meta: null as CompanyMeta | null,
    metaLoading: false,
    recommendations: {
      recent: [] as CompanyRecommendation[],
      active: [] as CompanyRecommendation[],
    },
    recommendationsLoading: false,
    dashboard: [] as CompanyModel[],
    dashboardLoading: false,
    dashboardStats: {
      companyCount: 0,
      individualBusinessCount: 0,
      memberCount: 0,
    } as CompanyDashboardStats,
    directory: {
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 1,
      items: [],
    } as CompanyDirectoryResponse,
    directoryLoading: false,
    dailyRegistrations: [] as CompanyDailyRegistration[],
    dailyRegistrationsLoading: false,
    submitting: false,
    myApplications: [] as MyCompanyApplicationEntry[],
    myApplicationsLoading: false,
    pendingConsents: [] as MyPendingConsentEntry[],
    pendingConsentsLoading: false,
  }),
  getters: {
    hasCompanies(state): boolean {
      return state.dashboard.length > 0
    },
  },
  actions: {
    async fetchMeta(force = false) {
      if (this.meta && !force) {
        return this.meta
      }
      this.metaLoading = true
      try {
        this.meta = await apiFetch<CompanyMeta>('/companies/meta')
        return this.meta
      } finally {
        this.metaLoading = false
      }
    },
    async fetchRecommendations(kind: RecommendationKind) {
      this.recommendationsLoading = true
      try {
        const items = await apiFetch<CompanyRecommendation[]>(
          `/companies/public/recommendations?kind=${kind}`,
        )
        this.recommendations[kind] = items
      } finally {
        this.recommendationsLoading = false
      }
    },
    async fetchDashboard() {
      this.dashboardLoading = true
      try {
        const authStore = useAuthStore()
        const response = await apiFetch<{
          stats: CompanyDashboardStats
          companies: CompanyModel[]
        }>('/companies/dashboard', {
          token: authStore.token,
        })
        this.dashboardStats = response.stats
        this.dashboard = response.companies
        return this.dashboard
      } finally {
        this.dashboardLoading = false
      }
    },
    recalculateStats() {
      const companyCount = this.dashboard.length
      const individualBusinessCount = this.dashboard.filter(
        (company) => company.category === 'INDIVIDUAL',
      ).length
      const memberCount = this.dashboard.reduce((sum, company) => {
        const ids = new Set<string>()
        if (company.legalRepresentative?.id) ids.add(company.legalRepresentative.id)
        for (const officer of company.llcRegistration?.officers ?? []) {
          if (officer.user?.id) ids.add(officer.user.id)
        }
        for (const sh of company.llcRegistration?.shareholders ?? []) {
          if (sh.kind === 'USER' && sh.userId) ids.add(sh.userId)
        }
        return sum + ids.size
      }, 0)
      this.dashboardStats = {
        companyCount,
        individualBusinessCount,
        memberCount,
      }
    },
    async searchUsers(
      keyword: string,
      limit = 10,
    ): Promise<CompanyUserRef[]> {
      if (!keyword.trim()) {
        return []
      }
      const authStore = useAuthStore()
      return apiFetch<CompanyUserRef[]>(
        `/companies/users/search?query=${encodeURIComponent(keyword)}&limit=${limit}`,
        {
          token: authStore.token,
        },
      )
    },
    async searchCompanies(keyword: string, limit = 10): Promise<CompanyRef[]> {
      if (!keyword.trim()) {
        return []
      }
      const authStore = useAuthStore()
      return apiFetch<CompanyRef[]>(
        `/companies/search?query=${encodeURIComponent(keyword)}&limit=${limit}`,
        {
          token: authStore.token,
        },
      )
    },
    async apply(payload: CreateCompanyApplicationPayload) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        const application = await apiFetch<{ id: string; status: string }>(
          '/companies/apply',
          {
          method: 'POST',
          body: payload,
          token: authStore.token,
          },
        )
        // 注册申请在审批通过前不会生成公司记录，因此这里不更新 dashboard
        return application
      } finally {
        this.submitting = false
      }
    },
    async fetchMyApplications() {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('未登录，无法查询我的申请')
      this.myApplicationsLoading = true
      try {
        const result = await apiFetch<MyCompanyApplicationEntry[]>(
          '/companies/applications/mine',
          { token: authStore.token },
        )
        this.myApplications = result
        return result
      } finally {
        this.myApplicationsLoading = false
      }
    },
    async fetchPendingConsents() {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('未登录，无法查询待同意清单')
      this.pendingConsentsLoading = true
      try {
        const result = await apiFetch<MyPendingConsentEntry[]>(
          '/companies/consents/pending',
          { token: authStore.token },
        )
        this.pendingConsents = result
        return result
      } finally {
        this.pendingConsentsLoading = false
      }
    },
    async getApplicationConsents(applicationId: string) {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('未登录，无法查看同意明细')
      return apiFetch(`/companies/applications/${applicationId}/consents`, {
        token: authStore.token,
      })
    },
    async approveMyApplicationConsents(applicationId: string, comment?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('未登录，无法同意')
      return apiFetch(`/companies/applications/${applicationId}/consents/approve`, {
        method: 'POST',
        body: { comment },
        token: authStore.token,
      })
    },
    async rejectMyApplicationConsents(applicationId: string, comment?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('未登录，无法拒绝')
      return apiFetch(`/companies/applications/${applicationId}/consents/reject`, {
        method: 'POST',
        body: { comment },
        token: authStore.token,
      })
    },
    async withdrawMyApplication(applicationId: string, comment?: string) {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('未登录，无法撤回申请')
      return apiFetch(`/companies/applications/${applicationId}/withdraw`, {
        method: 'POST',
        body: { comment },
        token: authStore.token,
      })
    },
    async applyDeregistration(
      companyId: string,
      payload: CompanyDeregistrationApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交注销申请')
        // 后端返回“申请+同意明细”，公司状态不会在提交时立即改变，因此不更新 dashboard
        return apiFetch(`/companies/${companyId}/deregistration`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },
    async applyNameChange(companyId: string, payload: CompanyRenameApplyPayload) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交更名申请')
        // 后端返回“申请+同意明细”，公司状态不会在提交时立即改变，因此不更新 dashboard
        return apiFetch(`/companies/${companyId}/name-change`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },
    async applyDomicileChange(
      companyId: string,
      payload: CompanyDomicileChangeApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交住所变更申请')
        // 后端返回“申请+同意明细”，公司状态不会在提交时立即改变，因此不更新 dashboard
        return apiFetch(`/companies/${companyId}/domicile-change`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },
    async applyBusinessScopeChange(
      companyId: string,
      payload: CompanyBusinessScopeChangeApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交经营范围变更申请')
        // 后端返回“申请+同意明细”，公司状态不会在提交时立即改变，因此不更新 dashboard
        return apiFetch(`/companies/${companyId}/business-scope-change`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },
    async applyCapitalChange(
      companyId: string,
      payload: CompanyCapitalChangeApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交注册资本变更申请')
        // 后端返回“申请+同意明细”，公司状态不会在提交时立即改变，因此不更新 dashboard
        return apiFetch(`/companies/${companyId}/capital-change`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },
    async applyEquityTransfer(
      companyId: string,
      payload: CompanyEquityTransferApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交股权转让申请')
        return apiFetch(`/companies/${companyId}/equity-transfer`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },

    async applyManagementChange(
      companyId: string,
      payload: CompanyManagementChangeApplyPayload,
    ) {
      this.submitting = true
      try {
        const authStore = useAuthStore()
        if (!authStore.token) throw new Error('未登录，无法提交管理层变更申请')
        // 后端返回“申请+同意明细”，公司状态不会在提交时立即改变，因此不更新 dashboard
        return apiFetch(`/companies/${companyId}/management-change`, {
          method: 'POST',
          body: payload as unknown as Record<string, unknown>,
          token: authStore.token,
        })
      } finally {
        this.submitting = false
      }
    },
    async update(companyId: string, payload: UpdateCompanyPayload) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(`/companies/${companyId}`, {
        method: 'PATCH',
        body: payload,
        token: authStore.token,
      })
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      this.recalculateStats()
      return company
    },
    async refreshCompany(companyId: string) {
      const authStore = useAuthStore()
      const detail = await apiFetch<CompanyModel>(`/companies/${companyId}`, {
        token: authStore.token,
      })
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = detail
      } else {
        this.dashboard.unshift(detail)
      }
      this.recalculateStats()
      return detail
    },
    async uploadLogo(companyId: string, file: File) {
      const authStore = useAuthStore()
      const formData = new FormData()
      formData.append('logo', file)
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/logo`,
        {
          method: 'PATCH',
          body: formData,
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      return company
    },
    async setLogoAttachment(companyId: string, attachmentId: string) {
      const authStore = useAuthStore()
      const company = await apiFetch<CompanyModel>(
        `/companies/${companyId}/logo/attachment`,
        {
          method: 'PATCH',
          body: { attachmentId },
          token: authStore.token,
        },
      )
      const index = this.dashboard.findIndex((item) => item.id === companyId)
      if (index !== -1) {
        this.dashboard[index] = company
      }
      return company
    },
    async fetchDailyRegistrations(days = 30) {
      this.dailyRegistrationsLoading = true
      try {
        const params = new URLSearchParams()
        params.set('days', `${days}`)
        const stats = await apiFetch<CompanyDailyRegistration[]>(
          `/companies/statistics/registrations?${params.toString()}`,
        )
        this.dailyRegistrations = stats
        return stats
      } finally {
        this.dailyRegistrationsLoading = false
      }
    },
    async fetchDirectory(params: {
      page?: number
      pageSize?: number
      typeId?: string
      industryId?: string
      search?: string
      category?: string
    }) {
      const query = new URLSearchParams()
      if (params.page) query.set('page', String(params.page))
      if (params.pageSize) query.set('pageSize', String(params.pageSize))
      if (params.typeId) query.set('typeId', params.typeId)
      if (params.industryId) query.set('industryId', params.industryId)
      if (params.search) query.set('search', params.search)
      if (params.category) query.set('category', params.category)
      this.directoryLoading = true
      try {
        const response = await apiFetch<CompanyDirectoryResponse>(
          `/companies/list?${query.toString()}`,
        )
        this.directory = response
        return response
      } finally {
        this.directoryLoading = false
      }
    },
  },
})
