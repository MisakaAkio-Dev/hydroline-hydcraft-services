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

const LIMITED_LIABILITY_CODE = 'limited_liability_company'
const INDIVIDUAL_BUSINESS_CODE =
  'individual-run_industrial_and_commercial_households'
const PUBLIC_INSTITUTION_CODE = 'public_institution'

const applicationGatewayOpen = ref(false)
const applicationFormOpen = ref(false)
const selectedRegistrationType = ref(LIMITED_LIABILITY_CODE)
const selectedIndustryId = ref<string | undefined>(undefined)

const industries = computed(() => companyStore.meta?.industries ?? [])
const industryOptions = computed(() =>
  industries.value.map((item) => ({ label: item.name, value: item.id })),
)
const limitedLiabilityType = computed(() =>
  (companyStore.meta?.types ?? []).find(
    (type) => type.code === LIMITED_LIABILITY_CODE,
  ),
)
const individualBusinessType = computed(() =>
  (companyStore.meta?.types ?? []).find(
    (type) => type.code === INDIVIDUAL_BUSINESS_CODE,
  ),
)
const publicInstitutionType = computed(() =>
  (companyStore.meta?.types ?? []).find(
    (type) => type.code === PUBLIC_INSTITUTION_CODE,
  ),
)
const registrationTypeOptions = computed(() => {
  return [
    {
      value: LIMITED_LIABILITY_CODE,
      label: limitedLiabilityType.value?.name || '有限责任公司',
      available: true,
      typeId: limitedLiabilityType.value?.id,
    },
    {
      value: PUBLIC_INSTITUTION_CODE,
      label: publicInstitutionType.value?.name || '事业单位',
      available: Boolean(publicInstitutionType.value?.id),
      typeId: publicInstitutionType.value?.id,
    },
    {
      value: INDIVIDUAL_BUSINESS_CODE,
      label: individualBusinessType.value?.name || '个体工商户',
      available: Boolean(individualBusinessType.value?.id),
      typeId: individualBusinessType.value?.id,
    },
  ]
})
const selectedRegistrationTypeOption = computed(() =>
  registrationTypeOptions.value.find(
    (option) => option.value === selectedRegistrationType.value,
  ),
)
const selectedRegistrationTypeLabel = computed(
  () => selectedRegistrationTypeOption.value?.label || '单位注册',
)
const selectedTypeAvailable = computed(() =>
  Boolean(
    selectedRegistrationTypeOption.value?.available &&
      selectedRegistrationTypeOption.value?.typeId,
  ),
)
const showIndustrySelector = computed(
  () => selectedRegistrationType.value !== PUBLIC_INSTITUTION_CODE,
)
const industryRequired = computed(() => showIndustrySelector.value)
const canEnterRegistration = computed(() => {
  if (!selectedTypeAvailable.value) return false
  if (!industryRequired.value) return true
  return Boolean(selectedIndustryId.value)
})
const applicationFormInitial = computed<CreateCompanyApplicationPayload | null>(
  () => {
    if (industryRequired.value && !selectedIndustryId.value) return null
    const typeId = selectedTypeAvailable.value
      ? selectedRegistrationTypeOption.value?.typeId
      : undefined
    return {
      name: '',
      typeId,
      industryId: selectedIndustryId.value,
      typeCode: selectedTypeAvailable.value
        ? selectedRegistrationType.value
        : undefined,
    }
  },
)

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
  if (!authStore.isAuthenticated) return false
  return authStore.hasPermission('company.admin.applications')
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
  applicationGatewayOpen.value = true
}

function openRegistrationForm() {
  if (!canEnterRegistration.value) return
  applicationGatewayOpen.value = false
  applicationFormOpen.value = true
}

function returnToGateway() {
  applicationFormOpen.value = false
  applicationGatewayOpen.value = true
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
    applicationFormOpen.value = false
    applicationGatewayOpen.value = false
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
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
            工商仪表盘
          </h2>
        </div>
        <div class="flex flex-wrap items-center gap-2">
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
          <UButton
            color="neutral"
            variant="soft"
            @click="requireLogin('/company/dashboard/my-legal-entities')"
          >
            我的法人
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
    </div>

    <UModal
      :open="applicationGatewayOpen"
      @update:open="(value) => (applicationGatewayOpen = value)"
      :ui="{ content: 'w-full max-w-2xl w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div
          class="relative overflow-hidden bg-white/90 p-6 shadow-sm dark:bg-slate-900/80"
        >
          <div
            class="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-linear-to-br from-sky-200/70 via-emerald-200/50 to-transparent blur-3xl dark:from-sky-500/20 dark:via-emerald-500/10"
          ></div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            class="absolute right-4 top-4 z-20"
            @click="applicationGatewayOpen = false"
          />
          <div class="relative z-10 space-y-6">
            <div class="flex flex-col gap-5 md:flex-row md:items-center">
              <div
                class="relative flex h-20 w-20 items-center justify-center rounded-full bg-slate-100/80 shadow-sm dark:bg-slate-800/80"
              >
                <span class="registry-orbit"></span>
                <svg
                  class="registry-icon h-10 w-10 text-sky-500 dark:text-sky-300"
                  viewBox="0 0 48 48"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="10"
                    stroke="currentColor"
                    stroke-width="2.5"
                  />
                  <path
                    d="M24 9c6.8 0 12.5 5.1 13.4 11.7"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <path
                    d="M24 39c-6.8 0-12.5-5.1-13.4-11.7"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                </svg>
              </div>
              <div class="space-y-2">
                <h3
                  class="text-2xl font-semibold text-slate-900 dark:text-white"
                >
                  单位注册
                </h3>
                <p class="text-sm text-slate-600 dark:text-slate-300">
                  本系统的相关概念以中华人民共和国《公司法》等工商法律为依据构建。虽名为“工商系统”，但“法人”并非仅属于工商环节的概念，而是所有单位、机构、组织的通用身份与基本组织单元。系统中的法人类别划分（营利法人、非营利法人、特别法人）与我国相关法律保持一致。
                </p>
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  类型
                </label>
                <USelectMenu
                  v-model="selectedRegistrationType"
                  :items="registrationTypeOptions"
                  value-key="value"
                  label-key="label"
                  :searchable="false"
                  class="w-full"
                  :class="selectedTypeAvailable ? '' : 'opacity-70'"
                >
                  <template #option="{ item }">
                    <div
                      class="flex items-center justify-between"
                      :class="
                        item.available
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-400 dark:text-slate-500'
                      "
                    >
                      <span class="text-sm">{{ item.label }}</span>
                      <span v-if="!item.available" class="text-xs">
                        即将开放
                      </span>
                    </div>
                  </template>
                </USelectMenu>
              </div>
              <div v-if="showIndustrySelector" class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  行业
                </label>
                <USelectMenu
                  v-model="selectedIndustryId"
                  :items="industryOptions"
                  value-key="value"
                  searchable
                  clearable
                  placeholder="选择所属行业"
                  class="w-full"
                />
              </div>
            </div>

            <div
              class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p class="text-xs text-slate-500 dark:text-slate-400">
                当前开放有限责任公司、个体工商户、事业单位登记。
              </p>
              <UButton
                color="primary"
                :disabled="!canEnterRegistration"
                @click="openRegistrationForm"
              >
                进入注册流程
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="applicationFormOpen"
      @update:open="(value) => (applicationFormOpen = value)"
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
                {{ selectedRegistrationTypeLabel }}
              </p>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                注册流程
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="returnToGateway"
            />
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <CompanyApplicationForm
              v-if="applicationFormOpen"
              :industries="industries"
              :types="companyStore.meta?.types ?? []"
              :initial="applicationFormInitial"
              :show-entry-selectors="false"
              :submitting="companyStore.submitting"
              @submit="handleApply"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.registry-orbit {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  border: 1px dashed rgba(56, 189, 248, 0.5);
  transform-origin: 50% 50%;
  animation: registry-spin 10s linear infinite;
}

.registry-orbit::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 100%;
  width: 6px;
  height: 6px;
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.9);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
}

.registry-icon {
  transform-origin: 50% 50%;
  animation: registry-spin-reverse 9s linear infinite;
}

@keyframes registry-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes registry-spin-reverse {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}
</style>
