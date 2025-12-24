import { apiFetch } from '@/utils/http/api'
import type { CompanyDirectoryResponse, CompanyModel } from '@/types/company'

export async function searchActiveCompanies(keyword: string, limit = 10) {
  const query = new URLSearchParams()
  if (keyword.trim()) query.set('search', keyword.trim())
  query.set('page', '1')
  query.set('pageSize', String(limit))
  const result = await apiFetch<CompanyDirectoryResponse>(
    `/companies/list?${query.toString()}`,
  )
  return result.items
}

export async function resolveCompaniesByIds(ids: string[]) {
  const unique = Array.from(new Set(ids.filter((id) => id?.trim())))
  if (!unique.length) return {}
  const result = await apiFetch<CompanyModel[]>('/companies/resolve', {
    method: 'POST',
    body: { ids: unique },
  })
  return result.reduce<Record<string, CompanyModel>>((acc, item) => {
    acc[item.id] = item
    return acc
  }, {})
}

export async function fetchCompanyDetail(companyId: string) {
  return apiFetch<CompanyModel>(`/companies/${companyId}`)
}
