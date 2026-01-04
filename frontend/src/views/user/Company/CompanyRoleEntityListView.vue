<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyModel } from '@/types/company'

type RoleKey =
  | 'legalRepresentative'
  | 'shareholding'
  | 'director'
  | 'manager'
  | 'supervisor'
  | 'financialOfficer'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const route = useRoute()

const currentUserId = computed(() => authStore.user?.id ?? null)

const page = ref(1)
const pageSize = ref(10)
const search = ref('')

const roleKey = computed<RoleKey>(() => {
  const key = route.meta?.roleKey as RoleKey | undefined
  return key ?? 'legalRepresentative'
})

const title = computed(() => String(route.meta?.title || '主体列表'))

const subtitle = computed(() => {
  const map: Record<RoleKey, string> = {
    legalRepresentative: '由您担任法定代表人的民事主体',
    shareholding: '由您持股的民事主体',
    director: '由您担任董事的民事主体',
    manager: '由您担任经理（包含副经理）的民事主体',
    supervisor: '由您担任监事的民事主体',
    financialOfficer: '由您担任财务负责人的民事主体',
  }
  return map[roleKey.value]
})

function hasOfficerRole(
  company: CompanyModel,
  userId: string | null,
  roles: string[],
) {
  if (!userId) return false
  const officers = company.llcRegistration?.officers ?? []
  return officers.some((o) => o.user?.id === userId && roles.includes(o.role))
}

function hasShareholding(company: CompanyModel, userId: string | null) {
  if (!userId) return false
  const shareholders = company.llcRegistration?.shareholders ?? []
  const asShareholder = shareholders.some(
    (sh) => sh.kind === 'USER' && sh.userId === userId,
  )
  if (asShareholder) return true
  return shareholders.some(
    (sh) => sh.kind === 'COMPANY' && sh.holderLegalRepresentativeId === userId,
  )
}

const entities = computed(() => {
  const userId = currentUserId.value
  const all = companyStore.dashboard

  switch (roleKey.value) {
    case 'legalRepresentative':
      return all.filter((company) => {
        const byCompany = company.legalRepresentative?.id === userId
        const byOfficers = hasOfficerRole(company, userId, [
          'LEGAL_REPRESENTATIVE',
        ])
        return Boolean(byCompany || byOfficers)
      })
    case 'shareholding':
      return all.filter((company) => hasShareholding(company, userId))
    case 'director':
      return all.filter((company) => {
        const byOfficers = hasOfficerRole(company, userId, [
          'DIRECTOR',
          'CHAIRPERSON',
          'VICE_CHAIRPERSON',
        ])
        return Boolean(byOfficers)
      })
    case 'manager':
      return all.filter((company) => {
        const byOfficers = hasOfficerRole(company, userId, [
          'MANAGER',
          'DEPUTY_MANAGER',
        ])
        return Boolean(byOfficers)
      })
    case 'supervisor':
      return all.filter((company) => {
        const byOfficers = hasOfficerRole(company, userId, [
          'SUPERVISOR',
          'SUPERVISOR_CHAIRPERSON',
        ])
        return Boolean(byOfficers)
      })
    case 'financialOfficer':
      return all.filter((company) =>
        hasOfficerRole(company, userId, ['FINANCIAL_OFFICER']),
      )
    default:
      return []
  }
})

const filteredEntities = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return entities.value
  return entities.value.filter((company) =>
    String(company.name || '')
      .toLowerCase()
      .includes(q),
  )
})

const pageCount = computed(() =>
  Math.max(Math.ceil(filteredEntities.value.length / pageSize.value), 1),
)

const pagedEntities = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredEntities.value.slice(start, start + pageSize.value)
})

function goToPage(target: number) {
  const safePage = Math.max(1, Math.min(target, pageCount.value))
  page.value = safePage
}

function openDetail(companyId: string) {
  void router.push({
    name: 'company.database.detail',
    params: { companyId },
  })
}

function handleRefresh() {
  if (!authStore.isAuthenticated) return
  void companyStore.fetchDashboard()
}

watch(search, () => {
  page.value = 1
})

watch(roleKey, () => {
  page.value = 1
  search.value = ''
})

onMounted(() => {
  void companyStore.fetchMeta()
  if (authStore.isAuthenticated) {
    void companyStore.fetchDashboard()
  }
})

watch(
  () => authStore.isAuthenticated,
  (value) => {
    if (value) {
      void companyStore.fetchDashboard()
    }
  },
)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <UButton
        color="primary"
        variant="ghost"
        @click="router.push('/company/dashboard')"
      >
        <UIcon name="i-lucide-arrow-left" />
        返回仪表盘
      </UButton>

      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          placeholder="搜索主体名称"
          icon="i-lucide-search"
          @keyup.enter="goToPage(1)"
        />
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :disabled="!authStore.isAuthenticated"
          @click="handleRefresh"
        />
      </div>
    </div>

    <div>
      <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
        {{ title }}
      </h2>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {{ subtitle }} · 共 {{ filteredEntities.length }} 条
      </p>
    </div>

    <div
      class="mt-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-[960px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
        >
          <thead
            class="bg-slate-50 text-xs uppercase tracking-wide whitespace-nowrap text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <tr>
              <th class="px-4 py-3">主体</th>
              <th class="px-4 py-3">行业</th>
              <th class="px-4 py-3">类型</th>
              <th class="px-4 py-3">状态</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="company in pagedEntities"
              :key="company.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/60"
            >
              <td class="px-4 py-3">
                <div class="font-semibold text-slate-900 dark:text-white">
                  {{ company.name }}
                </div>
                <p class="text-xs text-slate-500">
                  {{ company.summary || '暂无简介' }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.industry?.name || '—' }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ company.type?.name || '—' }}
              </td>
              <td class="px-4 py-3">
                <CompanyStatusBadge :status="company.status" />
              </td>
              <td class="px-4 py-3 text-right">
                <UButton
                  size="xs"
                  color="primary"
                  variant="ghost"
                  @click="openDetail(company.id)"
                >
                  查看详情
                </UButton>
              </td>
            </tr>
            <tr v-if="pagedEntities.length === 0">
              <td
                colspan="5"
                class="px-4 py-10 text-center text-sm text-slate-500"
              >
                暂无匹配的主体
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        class="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500 dark:border-slate-800"
      >
        <div>
          共 {{ filteredEntities.length }} 条 · 第 {{ page }} /
          {{ pageCount }} 页
        </div>
        <div class="flex items-center gap-2">
          <UButton
            variant="ghost"
            size="sm"
            :disabled="page <= 1"
            @click="goToPage(page - 1)"
          >
            上一页
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            :disabled="page >= pageCount"
            @click="goToPage(page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
