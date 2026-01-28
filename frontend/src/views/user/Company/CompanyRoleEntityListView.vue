<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyProfileForm from '@/components/company/CompanyProfileForm.vue'
import type { CompanyModel, UpdateCompanyPayload } from '@/types/company'

type RoleKey =
  | 'legalRepresentative'
  | 'shareholding'
  | 'director'
  | 'manager'
  | 'supervisor'
  | 'financialOfficer'
  | 'related'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const currentUserId = computed(() => authStore.user?.id ?? null)

const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const profileDialogOpen = ref(false)
const profileSaving = ref(false)
const profileCompanyId = ref<string | null>(null)

const roleKey = computed<RoleKey>(() => {
  const key = route.meta?.roleKey as RoleKey | undefined
  return key ?? 'legalRepresentative'
})

const title = computed(() => String(route.meta?.title || '主体列表'))
const isRelatedMode = computed(() => roleKey.value === 'related')

const subtitle = computed(() => {
  const map: Record<RoleKey, string> = {
    legalRepresentative: '由您担任法定代表人的民事主体',
    shareholding: '由您持股的民事主体',
    director: '由您担任董事的民事主体',
    manager: '由您担任经理（包含副经理）的民事主体',
    supervisor: '由您担任监事的民事主体',
    financialOfficer: '由您担任财务负责人的民事主体',
    related: '与您有关的公司/个体工商户/事业单位等主体',
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

function buildRelationTags(company: CompanyModel, userId: string | null) {
  if (!userId) return []
  const tags: Array<{ label: string; color: string }> = []
  if (
    company.legalRepresentative?.id === userId ||
    hasOfficerRole(company, userId, ['LEGAL_REPRESENTATIVE'])
  ) {
    tags.push({ label: '法定代表人', color: 'primary' })
  }
  if (hasShareholding(company, userId)) {
    tags.push({ label: '股东', color: 'emerald' })
  }
  if (
    hasOfficerRole(company, userId, [
      'DIRECTOR',
      'CHAIRPERSON',
      'VICE_CHAIRPERSON',
    ])
  ) {
    tags.push({ label: '董事', color: 'amber' })
  }
  if (hasOfficerRole(company, userId, ['MANAGER', 'DEPUTY_MANAGER'])) {
    tags.push({ label: '经理', color: 'sky' })
  }
  if (
    hasOfficerRole(company, userId, ['SUPERVISOR', 'SUPERVISOR_CHAIRPERSON'])
  ) {
    tags.push({ label: '监事', color: 'teal' })
  }
  if (hasOfficerRole(company, userId, ['FINANCIAL_OFFICER'])) {
    tags.push({ label: '财务负责人', color: 'orange' })
  }
  return tags
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
    case 'related':
      return all.filter(
        (company) => buildRelationTags(company, userId).length > 0,
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

const profileCompany = computed(() =>
  companyStore.dashboard.find(
    (company) => company.id === profileCompanyId.value,
  ),
)

const profileIndustries = computed(() => companyStore.meta?.industries ?? [])

function openProfileEditor(company: CompanyModel) {
  if (!authStore.isAuthenticated) return
  profileCompanyId.value = company.id
  profileDialogOpen.value = true
}

async function handleProfileUpdate(payload: UpdateCompanyPayload) {
  if (!authStore.isAuthenticated) return
  if (!profileCompany.value) return
  profileSaving.value = true
  try {
    await companyStore.update(profileCompany.value.id, payload)
    toast.add({ title: '企业资料已更新', color: 'primary' })
    profileDialogOpen.value = false
  } catch (error) {
    toast.add({
      title: (error as Error).message || '更新失败',
      color: 'error',
    })
  } finally {
    profileSaving.value = false
  }
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
      <UButton color="primary" variant="ghost" @click="router.push('/company')">
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
                <div v-if="isRelatedMode" class="mt-2 flex flex-wrap gap-2">
                  <UBadge
                    v-for="tag in buildRelationTags(company, currentUserId)"
                    :key="tag.label"
                    variant="soft"
                    :color="tag.color"
                    size="xs"
                  >
                    {{ tag.label }}
                  </UBadge>
                </div>
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
                <UButton
                  v-if="isRelatedMode"
                  size="xs"
                  color="primary"
                  variant="soft"
                  class="ml-2"
                  @click="openProfileEditor(company)"
                >
                  编辑资料
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

    <UModal
      :open="profileDialogOpen"
      @update:open="(value) => (profileDialogOpen = value)"
      :ui="{ content: 'w-full max-w-2xl w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div class="flex h-full flex-col">
          <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700"
          >
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                编辑资料
              </p>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ profileCompany?.name || '企业信息' }}
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="profileDialogOpen = false"
            />
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <CompanyProfileForm
              :company="profileCompany"
              :industries="profileIndustries"
              :saving="profileSaving"
              @submit="handleProfileUpdate"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
