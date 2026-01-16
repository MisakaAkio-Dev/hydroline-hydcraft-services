<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  AdminUpdateCompanyMembersPayload,
  CompanyModel,
  CompanyRef,
  CompanyUserRef,
} from '@/types/company'

type ShareholderDraft = {
  kind: 'USER' | 'COMPANY'
  userSearch: string
  companySearch: string
  userCandidates: CompanyUserRef[]
  companyCandidates: CompanyRef[]
  holderId: string | undefined
  ratio: number
  votingRatio: number | undefined
}

type SelectItem = { value: string; label: string }

type OfficerDraft = {
  userId: string | undefined
  search: string
  candidates: CompanyUserRef[]
}

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'save', payload: AdminUpdateCompanyMembersPayload): void
}>()

const authStore = useAuthStore()

const draft = reactive({
  votingRightsMode: 'BY_CAPITAL_RATIO' as 'BY_CAPITAL_RATIO' | 'CUSTOM',
  shareholders: [] as ShareholderDraft[],
  directors: {
    items: [] as OfficerDraft[],
    chairpersonId: undefined as string | undefined,
    viceChairpersonId: undefined as string | undefined,
  },
  managers: {
    managerId: undefined as string | undefined,
    deputyManagerId: undefined as string | undefined,
    managerSearch: '',
    deputySearch: '',
    managerCandidates: [] as CompanyUserRef[],
    deputyCandidates: [] as CompanyUserRef[],
  },
  legalRepresentativeId: undefined as string | undefined,
  supervisors: {
    enabled: false,
    items: [] as OfficerDraft[],
    chairpersonId: undefined as string | undefined,
  },
  financialOfficer: {
    userId: undefined as string | undefined,
    search: '',
    candidates: [] as CompanyUserRef[],
  },
  comment: '',
})

const userLabelCache = ref<Record<string, string>>({})
const companyLabelCache = ref<Record<string, string>>({})

const votingModeOptions = [
  { value: 'BY_CAPITAL_RATIO', label: '按出资比例' },
  { value: 'CUSTOM', label: '自定义表决权' },
]

function normalizeUserLabel(user: CompanyUserRef) {
  return user.displayName || user.name || user.email || user.id
}

function cacheUsers(users: CompanyUserRef[]) {
  const next = { ...userLabelCache.value }
  for (const user of users) {
    if (!user?.id) continue
    next[user.id] = normalizeUserLabel(user)
  }
  userLabelCache.value = next
}

function cacheCompanies(companies: CompanyRef[]) {
  const next = { ...companyLabelCache.value }
  for (const company of companies) {
    if (!company?.id) continue
    next[company.id] = company.name || company.slug || company.id
  }
  companyLabelCache.value = next
}

function resolveUserLabel(id?: string) {
  if (!id) return ''
  return userLabelCache.value[id] || id
}

function resolveCompanyLabel(id?: string) {
  if (!id) return ''
  return companyLabelCache.value[id] || id
}

function buildUserItems(
  candidates: CompanyUserRef[],
  selectedId?: string,
): SelectItem[] {
  const items = candidates.map((user) => ({
    value: user.id,
    label: normalizeUserLabel(user),
  }))
  if (selectedId && !items.some((item) => item.value === selectedId)) {
    items.unshift({ value: selectedId, label: resolveUserLabel(selectedId) })
  }
  return items
}

function buildCompanyItems(
  candidates: CompanyRef[],
  selectedId?: string,
): SelectItem[] {
  const items = candidates.map((company) => ({
    value: company.id,
    label: company.name || company.slug || company.id,
  }))
  if (selectedId && !items.some((item) => item.value === selectedId)) {
    items.unshift({ value: selectedId, label: resolveCompanyLabel(selectedId) })
  }
  return items
}

const userSearchTimers = new WeakMap<CompanyUserRef[], number>()
const companySearchTimers = new WeakMap<CompanyRef[], number>()

async function handleUserSearchList(target: CompanyUserRef[], keyword: string) {
  const value = keyword.trim()
  if (!value) {
    target.splice(0, target.length)
    return
  }
  const existing = userSearchTimers.get(target)
  if (existing) window.clearTimeout(existing)
  const timer = window.setTimeout(async () => {
    if (!authStore.token) return
    try {
      const results = await apiFetch<CompanyUserRef[]>(
        `/companies/users/search?query=${encodeURIComponent(value)}&limit=10`,
        { token: authStore.token },
      )
      target.splice(0, target.length, ...results)
      cacheUsers(results)
    } catch {
      target.splice(0, target.length)
    }
  }, 280)
  userSearchTimers.set(target, timer)
}

async function handleCompanySearchList(target: CompanyRef[], keyword: string) {
  const value = keyword.trim()
  if (!value) {
    target.splice(0, target.length)
    return
  }
  const existing = companySearchTimers.get(target)
  if (existing) window.clearTimeout(existing)
  const timer = window.setTimeout(async () => {
    if (!authStore.token) return
    try {
      const results = await apiFetch<CompanyRef[]>(
        `/companies/search?query=${encodeURIComponent(value)}&limit=10`,
        { token: authStore.token },
      )
      target.splice(0, target.length, ...results)
      cacheCompanies(results)
    } catch {
      target.splice(0, target.length)
    }
  }, 280)
  companySearchTimers.set(target, timer)
}

function createShareholderDraft(entry?: {
  kind?: 'USER' | 'COMPANY'
  userId?: string | null
  companyId?: string | null
  ratio?: number
  votingRatio?: number
}): ShareholderDraft {
  const kind = entry?.kind ?? 'USER'
  const holderId =
    kind === 'USER'
      ? (entry?.userId ?? undefined)
      : (entry?.companyId ?? undefined)
  return {
    kind,
    userSearch: '',
    companySearch: '',
    userCandidates: [],
    companyCandidates: [],
    holderId,
    ratio: Number.isFinite(entry?.ratio) ? Number(entry?.ratio) : 0,
    votingRatio:
      entry?.votingRatio !== undefined ? Number(entry?.votingRatio) : undefined,
  }
}

function createOfficerDraft(userId?: string): OfficerDraft {
  return {
    userId: userId ?? undefined,
    search: '',
    candidates: [],
  }
}

function ensureDraftArrays() {
  if (draft.shareholders.length === 0) {
    draft.shareholders.push(createShareholderDraft())
  }
  if (draft.directors.items.length === 0) {
    draft.directors.items.push(createOfficerDraft())
  }
  if (draft.supervisors.enabled && draft.supervisors.items.length === 0) {
    draft.supervisors.items.push(createOfficerDraft())
  }
}

function resetDraftFromCompany(company: CompanyModel | null) {
  if (!company?.llcRegistration) {
    draft.shareholders = []
    draft.directors.items = []
    draft.supervisors.items = []
    draft.supervisors.enabled = false
    draft.managers.managerId = undefined
    draft.managers.deputyManagerId = undefined
    draft.legalRepresentativeId = undefined
    draft.financialOfficer.userId = undefined
    draft.comment = ''
    ensureDraftArrays()
    return
  }

  const llc = company.llcRegistration
  const shareholders = llc.shareholders ?? []
  const hasCustomVoting = shareholders.some(
    (s) => Math.abs(Number(s.votingRatio) - Number(s.ratio)) > 1e-6,
  )
  draft.votingRightsMode = hasCustomVoting ? 'CUSTOM' : 'BY_CAPITAL_RATIO'
  draft.shareholders = shareholders.map((s) =>
    createShareholderDraft({
      kind: s.kind,
      userId: s.userId,
      companyId: s.companyId,
      ratio: Number(s.ratio),
      votingRatio: Number(s.votingRatio),
    }),
  )

  const officers = llc.officers ?? []
  const collectIds = (role: string) =>
    officers
      .filter((o) => o.role === role)
      .map((o) => o.user?.id)
      .filter((id): id is string => Boolean(id && id.trim()))

  const directorIds = collectIds('DIRECTOR')
  const chairpersonId = collectIds('CHAIRPERSON')[0]
  const viceChairpersonId = collectIds('VICE_CHAIRPERSON')[0]
  if (chairpersonId && !directorIds.includes(chairpersonId)) {
    directorIds.push(chairpersonId)
  }
  if (viceChairpersonId && !directorIds.includes(viceChairpersonId)) {
    directorIds.push(viceChairpersonId)
  }

  draft.directors.items = directorIds.map((id) => createOfficerDraft(id))
  draft.directors.chairpersonId = chairpersonId
  draft.directors.viceChairpersonId = viceChairpersonId

  draft.managers.managerId = collectIds('MANAGER')[0]
  draft.managers.deputyManagerId = collectIds('DEPUTY_MANAGER')[0]

  const legalRepresentativeId =
    collectIds('LEGAL_REPRESENTATIVE')[0] ||
    company.legalRepresentative?.id ||
    directorIds[0] ||
    draft.managers.managerId
  draft.legalRepresentativeId = legalRepresentativeId

  const supervisorIds = collectIds('SUPERVISOR')
  const supervisorChairpersonId = collectIds('SUPERVISOR_CHAIRPERSON')[0]
  if (
    supervisorChairpersonId &&
    !supervisorIds.includes(supervisorChairpersonId)
  ) {
    supervisorIds.push(supervisorChairpersonId)
  }
  draft.supervisors.enabled = supervisorIds.length > 0
  draft.supervisors.items = supervisorIds.map((id) => createOfficerDraft(id))
  draft.supervisors.chairpersonId = supervisorChairpersonId

  draft.financialOfficer.userId = collectIds('FINANCIAL_OFFICER')[0]
  draft.comment = ''

  ensureDraftArrays()
}

async function hydrateLabels(company: CompanyModel | null) {
  if (!authStore.token || !company?.llcRegistration) return

  const userIds = new Set<string>()
  const companyIds = new Set<string>()

  for (const shareholder of company.llcRegistration.shareholders ?? []) {
    if (shareholder.kind === 'USER' && shareholder.userId) {
      userIds.add(shareholder.userId)
    }
    if (shareholder.kind === 'COMPANY' && shareholder.companyId) {
      companyIds.add(shareholder.companyId)
    }
    if (shareholder.holderName && shareholder.companyId) {
      companyLabelCache.value = {
        ...companyLabelCache.value,
        [shareholder.companyId]: shareholder.holderName,
      }
    }
  }

  for (const officer of company.llcRegistration.officers ?? []) {
    if (officer.user?.id) userIds.add(officer.user.id)
  }
  if (company.legalRepresentative?.id) {
    userIds.add(company.legalRepresentative.id)
  }

  if (userIds.size > 0) {
    const users = await apiFetch<CompanyUserRef[]>('/companies/users/resolve', {
      method: 'POST',
      body: { ids: Array.from(userIds) },
      token: authStore.token,
    })
    cacheUsers(users)
  }

  if (companyIds.size > 0) {
    const companies = await apiFetch<CompanyModel[]>('/companies/resolve', {
      method: 'POST',
      body: { ids: Array.from(companyIds) },
      token: authStore.token,
    })
    cacheCompanies(
      companies.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    )
  }
}

const shareholderRatioSum = computed(() =>
  draft.shareholders.reduce((sum, s) => sum + Number(s.ratio || 0), 0),
)

const shareholderVotingSum = computed(() => {
  if (draft.votingRightsMode === 'BY_CAPITAL_RATIO') {
    return shareholderRatioSum.value
  }
  return draft.shareholders.reduce(
    (sum, s) => sum + Number(s.votingRatio ?? 0),
    0,
  )
})

const directorIds = computed(() =>
  draft.directors.items
    .map((item) => item.userId)
    .filter((id): id is string => Boolean(id && id.trim())),
)

const legalRepresentativeOptions = computed(() => {
  const items = new Set<string>(directorIds.value)
  if (draft.managers.managerId) items.add(draft.managers.managerId)
  return Array.from(items)
})

const legalRepresentativeItems = computed(() =>
  legalRepresentativeOptions.value.map((id) => ({
    value: id,
    label: resolveUserLabel(id),
  })),
)

const forbiddenSupervisorIds = computed(() => {
  const ids = new Set<string>(directorIds.value)
  if (draft.managers.managerId) ids.add(draft.managers.managerId)
  if (draft.managers.deputyManagerId) ids.add(draft.managers.deputyManagerId)
  if (draft.financialOfficer.userId) ids.add(draft.financialOfficer.userId)
  return ids
})

watch(
  () => draft.supervisors.enabled,
  (value) => {
    if (!value) {
      draft.supervisors.items = []
      draft.supervisors.chairpersonId = undefined
      return
    }
    if (draft.supervisors.items.length === 0) {
      draft.supervisors.items.push(createOfficerDraft())
    }
  },
)

watch(
  () => legalRepresentativeOptions.value,
  (options) => {
    if (
      !draft.legalRepresentativeId ||
      !options.includes(draft.legalRepresentativeId)
    ) {
      draft.legalRepresentativeId = options[0]
    }
  },
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    resetDraftFromCompany(props.company)
    void hydrateLabels(props.company)
  },
)

watch(
  () => props.company,
  (company) => {
    if (!props.modelValue) return
    resetDraftFromCompany(company)
    void hydrateLabels(company)
  },
)

function addShareholder() {
  draft.shareholders.push(createShareholderDraft())
}

function removeShareholder(index: number) {
  if (draft.shareholders.length <= 1) return
  draft.shareholders.splice(index, 1)
}

function addDirector() {
  draft.directors.items.push(createOfficerDraft())
}

function removeDirector(index: number) {
  if (draft.directors.items.length <= 1) return
  draft.directors.items.splice(index, 1)
}

function addSupervisor() {
  draft.supervisors.items.push(createOfficerDraft())
}

function removeSupervisor(index: number) {
  if (draft.supervisors.items.length <= 1) return
  draft.supervisors.items.splice(index, 1)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function handleSave() {
  if (!props.company?.llcRegistration) return

  const shareholders = draft.shareholders.map((s) => ({
    kind: s.kind,
    userId: s.kind === 'USER' ? s.holderId : undefined,
    companyId: s.kind === 'COMPANY' ? s.holderId : undefined,
    ratio: Number(s.ratio || 0),
    votingRatio:
      draft.votingRightsMode === 'CUSTOM'
        ? s.votingRatio === undefined
          ? undefined
          : Number(s.votingRatio)
        : undefined,
  }))

  const payload: AdminUpdateCompanyMembersPayload = {
    shareholders,
    votingRightsMode: draft.votingRightsMode,
    directors: {
      directorIds: directorIds.value,
      chairpersonId: draft.directors.chairpersonId || undefined,
      viceChairpersonId: draft.directors.viceChairpersonId || undefined,
    },
    managers: {
      managerId: draft.managers.managerId || undefined,
      deputyManagerId: draft.managers.deputyManagerId || undefined,
    },
    legalRepresentativeId: draft.legalRepresentativeId || '',
    supervisors: {
      supervisorIds: draft.supervisors.enabled
        ? draft.supervisors.items
            .map((item) => item.userId)
            .filter((id): id is string => Boolean(id && id.trim()))
        : [],
      chairpersonId: draft.supervisors.enabled
        ? draft.supervisors.chairpersonId || undefined
        : undefined,
    },
    financialOfficerId: draft.financialOfficer.userId || undefined,
    comment: draft.comment || undefined,
  }

  emit('save', payload)
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
    :ui="{
      content:
        'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-none overflow-visible',
    }"
  >
    <template #content>
      <div class="flex flex-col overflow-x-auto">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              成员管理
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              {{ company?.name || '公司成员' }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>

        <div class="px-6 py-4 grid gap-4 lg:grid-cols-2">
          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-5">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">股东结构</h4>
              <UButton size="sm" variant="ghost" @click="addShareholder">
                添加股东
              </UButton>
            </div>

            <div class="mt-3 space-y-3">
              <div class="flex items-center gap-3">
                <p class="text-xs text-slate-500">表决权模式</p>
                <USelectMenu
                  v-model="draft.votingRightsMode"
                  :items="votingModeOptions"
                  value-key="value"
                  placeholder="选择模式"
                />
              </div>

              <div
                v-for="(s, index) in draft.shareholders"
                :key="index"
                class="rounded-xl border border-slate-200/70 p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">
                    股东 #{{ index + 1 }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="draft.shareholders.length <= 1"
                    @click="removeShareholder(index)"
                  >
                    删除
                  </UButton>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <USelectMenu
                    v-model="s.kind"
                    :items="[
                      { value: 'USER', label: '用户' },
                      { value: 'COMPANY', label: '公司' },
                    ]"
                    value-key="value"
                  />

                  <USelectMenu
                    v-if="s.kind === 'USER'"
                    class="md:col-span-2"
                    v-model="s.holderId"
                    v-model:search-term="s.userSearch"
                    :items="buildUserItems(s.userCandidates, s.holderId)"
                    value-key="value"
                    label-key="label"
                    searchable
                    placeholder="搜索用户"
                    @update:search-term="
                      (v: string) => handleUserSearchList(s.userCandidates, v)
                    "
                  />

                  <USelectMenu
                    v-else
                    class="md:col-span-2"
                    v-model="s.holderId"
                    v-model:search-term="s.companySearch"
                    :items="buildCompanyItems(s.companyCandidates, s.holderId)"
                    value-key="value"
                    label-key="label"
                    searchable
                    placeholder="搜索公司"
                    @update:search-term="
                      (v: string) =>
                        handleCompanySearchList(s.companyCandidates, v)
                    "
                  />
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div class="space-y-1">
                    <label class="text-xs text-slate-500">出资比例（%）</label>
                    <UInput v-model.number="s.ratio" type="number" />
                  </div>
                  <div class="space-y-1 md:col-span-2">
                    <label class="text-xs text-slate-500">表决权（%）</label>
                    <UInput
                      v-if="draft.votingRightsMode === 'CUSTOM'"
                      v-model.number="s.votingRatio"
                      type="number"
                    />
                    <UInput v-else :model-value="s.ratio" disabled />
                  </div>
                </div>
              </div>

              <div class="text-xs text-slate-500">
                出资合计：
                <span
                  class="font-semibold"
                  :class="
                    shareholderRatioSum === 100
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  "
                  >{{ shareholderRatioSum }}%</span
                >
              </div>

              <div class="text-xs text-slate-500">
                表决权合计：
                <span
                  class="font-semibold"
                  :class="
                    shareholderVotingSum === 100
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  "
                  >{{ shareholderVotingSum }}%</span
                >
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-5">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">董事与经理</h4>
              <UButton size="sm" variant="ghost" @click="addDirector">
                添加董事
              </UButton>
            </div>
            <div class="mt-3 space-y-3">
              <div
                v-for="(d, index) in draft.directors.items"
                :key="index"
                class="rounded-xl border border-slate-200/70 p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">
                    董事 #{{ index + 1 }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="draft.directors.items.length <= 1"
                    @click="removeDirector(index)"
                  >
                    删除
                  </UButton>
                </div>
                <USelectMenu
                  v-model="d.userId"
                  v-model:search-term="d.search"
                  :items="buildUserItems(d.candidates, d.userId)"
                  value-key="value"
                  label-key="label"
                  searchable
                  placeholder="搜索用户"
                  @update:search-term="
                    (v: string) => handleUserSearchList(d.candidates, v)
                  "
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <USelectMenu
                  v-model="draft.directors.chairpersonId"
                  :items="
                    directorIds.map((id) => ({
                      value: id,
                      label: resolveUserLabel(id),
                    }))
                  "
                  value-key="value"
                  label-key="label"
                  placeholder="选择董事长"
                />
                <USelectMenu
                  v-model="draft.directors.viceChairpersonId"
                  :items="
                    directorIds.map((id) => ({
                      value: id,
                      label: resolveUserLabel(id),
                    }))
                  "
                  value-key="value"
                  label-key="label"
                  placeholder="选择副董事长（可选）"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <USelectMenu
                  v-model="draft.managers.managerId"
                  v-model:search-term="draft.managers.managerSearch"
                  :items="
                    buildUserItems(
                      draft.managers.managerCandidates,
                      draft.managers.managerId,
                    )
                  "
                  value-key="value"
                  label-key="label"
                  searchable
                  placeholder="选择经理（可选）"
                  @update:search-term="
                    (v: string) =>
                      handleUserSearchList(draft.managers.managerCandidates, v)
                  "
                />
                <USelectMenu
                  v-model="draft.managers.deputyManagerId"
                  v-model:search-term="draft.managers.deputySearch"
                  :items="
                    buildUserItems(
                      draft.managers.deputyCandidates,
                      draft.managers.deputyManagerId,
                    )
                  "
                  value-key="value"
                  label-key="label"
                  searchable
                  placeholder="选择副经理（可选）"
                  @update:search-term="
                    (v: string) =>
                      handleUserSearchList(draft.managers.deputyCandidates, v)
                  "
                />
              </div>

              <USelectMenu
                v-model="draft.legalRepresentativeId"
                :items="legalRepresentativeItems"
                value-key="value"
                label-key="label"
                placeholder="选择法定代表人"
              />
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-5">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">监事与财务</h4>
              <div class="flex items-center gap-2 text-xs text-slate-500">
                <span>{{
                  draft.supervisors.enabled ? '已启用' : '未启用'
                }}</span>
                <USwitch v-model="draft.supervisors.enabled" />
              </div>
            </div>

            <div v-if="draft.supervisors.enabled" class="mt-3 space-y-3">
              <div
                v-for="(s, index) in draft.supervisors.items"
                :key="index"
                class="rounded-xl border border-slate-200/70 p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">
                    监事 #{{ index + 1 }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="draft.supervisors.items.length <= 1"
                    @click="removeSupervisor(index)"
                  >
                    删除
                  </UButton>
                </div>
                <USelectMenu
                  v-model="s.userId"
                  v-model:search-term="s.search"
                  :items="buildUserItems(s.candidates, s.userId)"
                  value-key="value"
                  label-key="label"
                  searchable
                  placeholder="搜索用户"
                  @update:search-term="
                    (v: string) => handleUserSearchList(s.candidates, v)
                  "
                />
                <p
                  v-if="s.userId && forbiddenSupervisorIds.has(s.userId)"
                  class="text-xs text-rose-600"
                >
                  该用户当前已担任董事/经理/副经理/财务负责人，不能兼任监事
                </p>
              </div>

              <USelectMenu
                v-if="draft.supervisors.items.length > 1"
                v-model="draft.supervisors.chairpersonId"
                :items="
                  draft.supervisors.items
                    .map((item) => item.userId)
                    .filter((id): id is string => Boolean(id && id.trim()))
                    .map((id) => ({ value: id, label: resolveUserLabel(id) }))
                "
                value-key="value"
                label-key="label"
                placeholder="选择监事会主席（可选）"
              />

              <UButton size="sm" variant="ghost" @click="addSupervisor">
                添加监事
              </UButton>
            </div>

            <div class="mt-3">
              <USelectMenu
                v-model="draft.financialOfficer.userId"
                v-model:search-term="draft.financialOfficer.search"
                :items="
                  buildUserItems(
                    draft.financialOfficer.candidates,
                    draft.financialOfficer.userId,
                  )
                "
                value-key="value"
                label-key="label"
                searchable
                placeholder="选择财务负责人（可选）"
                @update:search-term="
                  (v: string) =>
                    handleUserSearchList(draft.financialOfficer.candidates, v)
                "
              />
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-5">
            <h4 class="text-sm font-semibold text-slate-900">修改原因</h4>
            <UTextarea
              v-model="draft.comment"
              rows="2"
              placeholder="请输入修改原因"
            />
          </div>
        </div>

        <div class="border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="closeDialog">
            取消
          </UButton>
          <UButton color="primary" :loading="saving" @click="handleSave">
            保存修改
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
