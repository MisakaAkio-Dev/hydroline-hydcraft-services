import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  AdminCompanyApplicationEntry,
  CompanyApplicationStatus,
} from '@/types/company'

interface FetchOptions {
  status?: CompanyApplicationStatus
  search?: string
  page?: number
  pageSize?: number
  workflowCode?: string
}

export const useRegistryCompanyApplicationsStore = defineStore(
  'registry-company-applications',
  {
    state: () => ({
      items: [] as AdminCompanyApplicationEntry[],
      pagination: {
        total: 0,
        page: 1,
        pageSize: 20,
        pageCount: 1,
      },
      loading: false,
    }),
    actions: {
      async fetchList(options: FetchOptions = {}) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法查询申请')
        }
        const page = options.page ?? this.pagination.page
        const pageSize = options.pageSize ?? this.pagination.pageSize
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        })
        if (options.status) {
          params.set('status', options.status)
        }
        if (options.search) {
          params.set('search', options.search)
        }
        if (options.workflowCode) {
          params.set('workflowCode', options.workflowCode)
        }
        this.loading = true
        try {
          const result = await apiFetch<{
            total: number
            page: number
            pageSize: number
            pageCount: number
            items: AdminCompanyApplicationEntry[]
          }>(`/companies/registry/applications?${params.toString()}`, {
            token: auth.token,
          })
          this.items = result.items
          this.pagination = {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            pageCount: result.pageCount,
          }
          return result
        } finally {
          this.loading = false
        }
      },
      async executeAction(
        applicationId: string,
        payload: { actionKey: string; comment?: string },
      ) {
        const auth = useAuthStore()
        if (!auth.token) {
          throw new Error('未登录，无法审批申请')
        }
        return apiFetch(`/companies/registry/applications/${applicationId}/actions`, {
          method: 'POST',
          body: payload,
          token: auth.token,
        })
      },
    },
  },
)



