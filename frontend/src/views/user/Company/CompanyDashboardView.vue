<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import { useUiStore } from '@/stores/shared/ui'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyApplicationForm from '@/components/company/CompanyApplicationForm.vue'
import type {
  CompanyModel,
  CreateCompanyApplicationPayload,
} from '@/types/company'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const uiStore = useUiStore()
const toast = useToast()

const applicationModalOpen = ref(false)

const industries = computed(() => companyStore.meta?.industries ?? [])

const currentUserId = computed<string | null>(() => {
  const user = authStore.user as { id?: string } | null
  return user?.id ?? null
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
  return shareholders.some((sh) => {
    if (sh.kind === 'USER' && sh.userId === userId) return true
    if (sh.kind === 'COMPANY' && sh.holderLegalRepresentativeId === userId)
      return true
    return false
  })
}

const legalRepresentativeEntities = computed(() =>
  companyStore.dashboard.filter((company) => {
    const byCompany = company.legalRepresentative?.id === currentUserId.value
    const byOfficers = hasOfficerRole(company, currentUserId.value, [
      'LEGAL_REPRESENTATIVE',
    ])
    return Boolean(byCompany || byOfficers)
  }),
)

const hasRegistryApprovalRole = computed(() => {
  const userId = currentUserId.value
  if (!userId) return false
  return companyStore.dashboard.some(
    (company) =>
      company.status === 'ACTIVE' &&
      company.type?.code === 'state_organ_legal_person' &&
      (company.legalRepresentative?.id === userId ||
        hasOfficerRole(company, userId, ['LEGAL_REPRESENTATIVE'])),
  )
})

const categoryCards = computed(() => {
  const order = [
    'FOR_PROFIT_LEGAL_PERSON',
    'NON_PROFIT_LEGAL_PERSON',
    'SPECIAL_LEGAL_PERSON',
    'UNINCORPORATED_ORGANIZATION',
    'INDIVIDUAL',
  ]

  const labels: Record<string, string> = {
    FOR_PROFIT_LEGAL_PERSON: '营利法人',
    NON_PROFIT_LEGAL_PERSON: '非营利法人',
    SPECIAL_LEGAL_PERSON: '特别法人',
    UNINCORPORATED_ORGANIZATION: '非法人组织',
    INDIVIDUAL: '个体工商户',
  }

  const counts: Record<string, number> = {}
  for (const key of order) counts[key] = 0

  // 仅统计“由您担任法定代表人”的主体
  for (const company of legalRepresentativeEntities.value) {
    const key = company.category
    if (!key) continue
    if (!order.includes(key)) continue
    counts[key] = (counts[key] ?? 0) + 1
  }

  return order.map((key) => ({
    key,
    label: labels[key] || key,
    count: counts[key] ?? 0,
    hint: '由您担任法定代表人的主体数量。',
  }))
})

const shareholdingEntities = computed(() =>
  companyStore.dashboard.filter((company) =>
    hasShareholding(company, currentUserId.value),
  ),
)

const directorEntities = computed(() =>
  companyStore.dashboard.filter((company) => {
    const byOfficers = hasOfficerRole(company, currentUserId.value, [
      'DIRECTOR',
      'CHAIRPERSON',
      'VICE_CHAIRPERSON',
    ])
    return Boolean(byOfficers)
  }),
)

const managerEntities = computed(() =>
  companyStore.dashboard.filter((company) => {
    const byOfficers = hasOfficerRole(company, currentUserId.value, [
      'MANAGER',
      'DEPUTY_MANAGER',
    ])
    return Boolean(byOfficers)
  }),
)

const supervisorEntities = computed(() =>
  companyStore.dashboard.filter((company) => {
    const byOfficers = hasOfficerRole(company, currentUserId.value, [
      'SUPERVISOR',
      'SUPERVISOR_CHAIRPERSON',
    ])
    return Boolean(byOfficers)
  }),
)

const financialOfficerEntities = computed(() =>
  companyStore.dashboard.filter((company) =>
    hasOfficerRole(company, currentUserId.value, ['FINANCIAL_OFFICER']),
  ),
)

const legalRepresentativePreview = computed(() =>
  legalRepresentativeEntities.value.slice(0, 5),
)
const shareholdingPreview = computed(() =>
  shareholdingEntities.value.slice(0, 5),
)
const directorPreview = computed(() => directorEntities.value.slice(0, 5))
const managerPreview = computed(() => managerEntities.value.slice(0, 5))
const supervisorPreview = computed(() => supervisorEntities.value.slice(0, 5))
const financialOfficerPreview = computed(() =>
  financialOfficerEntities.value.slice(0, 5),
)

function requireLogin(target: string) {
  if (!authStore.isAuthenticated) {
    uiStore.openLoginDialog()
    return
  }
  router.push(target)
}

function openApplicationModal() {
  if (!authStore.isAuthenticated) {
    uiStore.openLoginDialog()
    return
  }
  applicationModalOpen.value = true
}

async function handleApply(payload: CreateCompanyApplicationPayload) {
  if (!authStore.isAuthenticated) {
    toast.add({ title: '请先登录', color: 'warning' })
    return
  }
  try {
    await companyStore.apply(payload)
    toast.add({
      title: '申请已提交，等待相关人员同意与登记机关审批',
      color: 'primary',
    })
    // 仅在提交成功后关闭表单；失败/校验报错时保持打开，避免用户重填
    applicationModalOpen.value = false
    await router.push('/company/dashboard/applications')
  } catch (error) {
    toast.add({
      title: (error as Error).message || '提交失败',
      color: 'error',
    })
  }
}

function handleRefresh() {
  if (!authStore.isAuthenticated) return
  void companyStore.fetchDashboard()
}

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
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          工商仪表盘
        </h2>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :disabled="!authStore.isAuthenticated"
          @click="handleRefresh"
        />
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          @click="openApplicationModal"
        >
          提交注册申请
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          @click="requireLogin('/company/dashboard/applications')"
        >
          我的申请/待同意
        </UButton>
        <UButton
          v-if="hasRegistryApprovalRole"
          color="primary"
          variant="soft"
          @click="requireLogin('/company/dashboard/registry-applications')"
        >
          登记机关审批
        </UButton>
      </div>
    </div>

    <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <div
        v-for="item in categoryCards"
        :key="item.key"
        class="rounded-xl border border-slate-200 bg-white/90 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <p
          class="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400"
        >
          {{ item.label }}
        </p>
        <p class="text-3xl font-semibold text-slate-900 dark:text-white">
          {{ item.count }}
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          {{ item.hint }}
        </p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div
        class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              法定代表人
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              前 5 概览
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              由您担任法定代表人的民事主体。
            </p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/legal-representative')"
          >
            查看更多
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in legalRepresentativePreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300"
          >
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="legalRepresentativePreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
          >
            暂无由您担任法定代表人的民事主体。
          </div>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              持股
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              前 5 概览
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              由您持股的民事主体。
            </p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/shareholding')"
          >
            查看更多
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in shareholdingPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300"
          >
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="shareholdingPreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
          >
            暂无由您持股的民事主体。
          </div>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              董事
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              前 5 概览
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              由您担任董事的民事主体。
            </p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/director')"
          >
            查看更多
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in directorPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300"
          >
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="directorPreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
          >
            暂无由您担任董事的民事主体。
          </div>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              经理
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              前 5 概览
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              由您担任经理（包含副经理）的民事主体。
            </p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/manager')"
          >
            查看更多
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in managerPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300"
          >
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="managerPreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
          >
            暂无由您担任经理（包含副经理）的民事主体。
          </div>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              监事
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              前 5 概览
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              由您担任监事的民事主体。
            </p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/supervisor')"
          >
            查看更多
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in supervisorPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300"
          >
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="supervisorPreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
          >
            暂无由您担任监事的民事主体。
          </div>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/90 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70"
      >
        <div class="flex items-center justify-between">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              财务负责人
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              前 5 概览
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              由您担任财务负责人的民事主体。
            </p>
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="requireLogin('/company/dashboard/financial-officer')"
          >
            查看更多
          </UButton>
        </div>
        <div class="mt-4 space-y-3">
          <div
            v-for="company in financialOfficerPreview"
            :key="company.id"
            class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300"
          >
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ company.name }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ company.type?.name || '未归类类型' }} ·
                {{ company.industry?.name || '未归类行业' }}
              </p>
            </div>
            <CompanyStatusBadge :status="company.status" />
          </div>
          <div
            v-if="financialOfficerPreview.length === 0"
            class="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400"
          >
            暂无由您担任财务负责人的民事主体。
          </div>
        </div>
      </div>
    </div>

    <UModal
      :open="applicationModalOpen"
      @update:open="(value) => (applicationModalOpen = value)"
      :ui="{ content: 'w-full max-w-3xl w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div class="flex h-full max-h-[85vh] flex-col">
          <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700"
          >
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                提交注册申请
              </p>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                注册单位
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="applicationModalOpen = false"
            />
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <CompanyApplicationForm
              :industries="industries"
              :types="companyStore.meta?.types ?? []"
              :submitting="companyStore.submitting"
              @submit="handleApply"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
