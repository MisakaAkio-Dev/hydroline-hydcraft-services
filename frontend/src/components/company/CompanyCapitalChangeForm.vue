<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import type {
  CompanyCapitalChangeApplyPayload,
  CompanyUserRef,
  CompanyRef,
  LlcShareholderEntry,
} from '@/types/company'

type ShareholderDraft = {
  kind: 'USER' | 'COMPANY'
  userSearch: string
  companySearch: string
  userCandidates: CompanyUserRef[]
  companyCandidates: CompanyRef[]
  holderId: string | undefined
  ratio: number | undefined
  votingRatio: number | undefined
}

const props = defineProps<{
  submitting?: boolean
  initial?: {
    registeredCapital: number
    votingRightsMode?: 'BY_CAPITAL_RATIO' | 'CUSTOM'
    shareholders: Array<{
      kind: 'USER' | 'COMPANY'
      userId: string | null
      companyId: string | null
      ratio: number
      votingRatio: number
    }>
  } | null
}>()

const emit = defineEmits<{
  (event: 'submit', payload: CompanyCapitalChangeApplyPayload): void
}>()

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const toast = useToast()

// ---------- 选择框显示：缓存已见过的 name，避免 items 变化后回退显示 id ----------
const userLabelCache = reactive<Record<string, string>>({})
const companyLabelCache = reactive<Record<string, string>>({})
function getUserLabel(u: CompanyUserRef) {
  return u.displayName || u.name || u.email || '未知用户'
}
function upsertUserLabel(u: CompanyUserRef) {
  userLabelCache[u.id] = getUserLabel(u)
}
function upsertCompanyLabel(c: CompanyRef) {
  companyLabelCache[c.id] = c.name
}
function buildUserItems(candidates: CompanyUserRef[], selectedId?: string) {
  const items = candidates.map((u) => {
    upsertUserLabel(u)
    return { value: u.id, label: getUserLabel(u) }
  })
  if (selectedId && !items.some((x) => x.value === selectedId)) {
    items.unshift({
      value: selectedId,
      label: userLabelCache[selectedId] ?? selectedId,
    })
  }
  return items
}
function buildCompanyItems(candidates: CompanyRef[], selectedId?: string) {
  const items = candidates.map((c) => {
    upsertCompanyLabel(c)
    return { value: c.id, label: c.name }
  })
  if (selectedId && !items.some((x) => x.value === selectedId)) {
    items.unshift({
      value: selectedId,
      label: companyLabelCache[selectedId] ?? selectedId,
    })
  }
  return items
}

let searchTimer: number | undefined
let companySearchTimer: number | undefined

function handleUserSearchList(candidates: CompanyUserRef[], query: string) {
  const q = query.trim()
  if (!q) {
    candidates.splice(0, candidates.length)
    return
  }
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    try {
      const next = await companyStore.searchUsers(q, 8)
      candidates.splice(0, candidates.length, ...next)
    } catch {
      candidates.splice(0, candidates.length)
    }
  }, 240)
}

function handleCompanySearchList(candidates: CompanyRef[], query: string) {
  const q = query.trim()
  if (!q) {
    candidates.splice(0, candidates.length)
    return
  }
  if (companySearchTimer) window.clearTimeout(companySearchTimer)
  companySearchTimer = window.setTimeout(async () => {
    try {
      const next = await companyStore.searchCompanies(q, 8)
      candidates.splice(0, candidates.length, ...next)
    } catch {
      candidates.splice(0, candidates.length)
    }
  }, 240)
}

async function prefillSelectedLabels(shareholders: ShareholderDraft[]) {
  const userIds = new Set<string>()
  const companyIds = new Set<string>()
  for (const s of shareholders) {
    if (s.kind === 'USER' && s.holderId) userIds.add(s.holderId)
    if (s.kind === 'COMPANY' && s.holderId) companyIds.add(s.holderId)
  }

  // 公司解析不需要 token，可先做
  if (companyIds.size) {
    const companies = await apiFetch<Array<{ id: string; name: string }>>(
      '/companies/resolve',
      { method: 'POST', body: { ids: Array.from(companyIds) } },
    )
    for (const c of companies) upsertCompanyLabel(c as CompanyRef)
  }

  if (userIds.size && authStore.token) {
    const users = await apiFetch<CompanyUserRef[]>('/companies/users/resolve', {
      method: 'POST',
      body: { ids: Array.from(userIds) },
      token: authStore.token,
    })
    for (const u of users) upsertUserLabel(u)
  }
}

const form = reactive<{
  changeType: 'AUTO' | 'INCREASE' | 'DECREASE'
  newRegisteredCapital: number | null
  votingRightsMode: 'BY_CAPITAL_RATIO' | 'CUSTOM'
  shareholders: ShareholderDraft[]
  reason: string
}>({
  changeType: 'AUTO',
  newRegisteredCapital: null,
  votingRightsMode: 'BY_CAPITAL_RATIO',
  shareholders: [
    {
      kind: 'USER',
      userSearch: '',
      companySearch: '',
      userCandidates: [],
      companyCandidates: [],
      holderId: undefined,
      ratio: undefined,
      votingRatio: undefined,
    },
  ],
  reason: '',
})

const initialApplied = ref(false)
watch(
  () => props.initial,
  async (value) => {
    if (!value || initialApplied.value) return
    initialApplied.value = true
    form.newRegisteredCapital = value.registeredCapital ?? null
    form.votingRightsMode = value.votingRightsMode ?? 'BY_CAPITAL_RATIO'
    if (value.shareholders?.length) {
      form.shareholders = value.shareholders.map((s) => ({
        kind: s.kind,
        userSearch: '',
        companySearch: '',
        userCandidates: [],
        companyCandidates: [],
        holderId: s.kind === 'USER' ? (s.userId ?? undefined) : (s.companyId ?? undefined),
        ratio: Number(s.ratio),
        votingRatio: Number(s.votingRatio),
      }))
      try {
        await prefillSelectedLabels(form.shareholders)
      } catch {
        // ignore: 仅影响展示
      }
    }
  },
  { immediate: true },
)

watch(
  () => authStore.token,
  async (token) => {
    if (!token) return
    if (!props.initial) return
    try {
      await prefillSelectedLabels(form.shareholders)
    } catch {
      // ignore
    }
  },
)

function addShareholder() {
  form.shareholders.push({
    kind: 'USER',
    userSearch: '',
    companySearch: '',
    userCandidates: [],
    companyCandidates: [],
    holderId: undefined,
    ratio: undefined,
    votingRatio: undefined,
  })
}

function removeShareholder(index: number) {
  if (form.shareholders.length <= 1) return
  form.shareholders.splice(index, 1)
}

const shareholderRatioSum = computed(() =>
  Math.round(
    form.shareholders.reduce((sum, s) => sum + (Number(s.ratio) || 0), 0) * 1e6,
  ) / 1e6,
)

const shareholderVotingSum = computed(() =>
  Math.round(
    form.shareholders.reduce((sum, s) => sum + (Number(s.votingRatio) || 0), 0) * 1e6,
  ) / 1e6,
)

function buildPayload(): CompanyCapitalChangeApplyPayload | null {
  if (!authStore.isAuthenticated) {
    toast.add({ title: '请先登录', color: 'warning' })
    return null
  }
  const newCap = Number(form.newRegisteredCapital)
  if (!Number.isFinite(newCap) || newCap < 0) {
    toast.add({ title: '请填写有效的新注册资本金额', color: 'warning' })
    return null
  }

  // 校验股东结构
  const eps = 1e-6
  const ratioSum = form.shareholders.reduce((sum, s) => sum + (Number(s.ratio) || 0), 0)
  if (Math.abs(ratioSum - 100) > eps) {
    toast.add({ title: '所有股东的出资比例之和必须为 100%', color: 'error' })
    return null
  }
  for (const s of form.shareholders) {
    if (!s.holderId) {
      toast.add({ title: '请为所有股东选择用户或公司', color: 'error' })
      return null
    }
    const r = Number(s.ratio)
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      toast.add({ title: '股东出资比例必须在 0%～100% 之间', color: 'error' })
      return null
    }
    if (form.votingRightsMode === 'CUSTOM') {
      const v = Number(s.votingRatio)
      if (!Number.isFinite(v)) {
        toast.add({ title: '请为所有股东填写表决权（%）', color: 'error' })
        return null
      }
      if (v < 0 || v > 100) {
        toast.add({ title: '股东表决权必须在 0%～100% 之间', color: 'error' })
        return null
      }
    }
  }
  if (form.votingRightsMode === 'CUSTOM') {
    const votingSum = form.shareholders.reduce(
      (sum, s) => sum + (Number(s.votingRatio) || 0),
      0,
    )
    if (Math.abs(votingSum - 100) > eps) {
      toast.add({ title: '所有股东的表决权之和必须为 100%', color: 'error' })
      return null
    }
  }

  const shareholders: LlcShareholderEntry[] = form.shareholders.map((s) => {
    const base: LlcShareholderEntry =
      s.kind === 'USER'
        ? { kind: 'USER', userId: s.holderId!, ratio: Number(s.ratio) }
        : { kind: 'COMPANY', companyId: s.holderId!, ratio: Number(s.ratio) }
    if (form.votingRightsMode === 'CUSTOM') {
      return { ...base, votingRatio: Number(s.votingRatio) }
    }
    return base
  })

  return {
    ...(form.changeType === 'AUTO' ? {} : { changeType: form.changeType }),
    newRegisteredCapital: Math.floor(newCap),
    votingRightsMode: form.votingRightsMode,
    shareholders,
    reason: form.reason.trim() || undefined,
  }
}

function handleSubmit() {
  const payload = buildPayload()
  if (!payload) return
  emit('submit', payload)
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="space-y-2 sm:col-span-1">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          变更类型
        </div>
        <USelectMenu
          v-model="form.changeType"
          :items="[
            { value: 'AUTO', label: '自动推断（按新旧资本大小）' },
            { value: 'INCREASE', label: '增资' },
            { value: 'DECREASE', label: '减资' },
          ]"
          value-key="value"
          label-key="label"
          :disabled="props.submitting"
        />
      </div>
      <div class="space-y-2 sm:col-span-2">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          新注册资本金额
        </div>
        <UInput
          v-model.number="form.newRegisteredCapital"
          type="number"
          placeholder="例如：100000"
          :disabled="props.submitting"
        />
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="space-y-2 sm:col-span-1">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          股东表决权行使方式
        </div>
        <USelectMenu
          v-model="form.votingRightsMode"
          :items="[
            { value: 'BY_CAPITAL_RATIO', label: '按出资比例行使（表决权=出资比例）' },
            { value: 'CUSTOM', label: '自定义表决权（合计 100%）' },
          ]"
          value-key="value"
          label-key="label"
          :disabled="props.submitting"
        />
      </div>
      <div class="sm:col-span-2 text-xs text-slate-500 sm:self-end">
        <span v-if="form.votingRightsMode === 'BY_CAPITAL_RATIO'">
          当前模式下无需单独填写表决权，系统将使用出资比例作为表决权比例。
        </span>
        <span v-else> 请确保所有股东表决权（%）相加为 100%。 </span>
      </div>
    </div>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          变更后股东结构（出资比例合计 100%）
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="props.submitting"
          @click="addShareholder"
        >
          添加股东
        </UButton>
      </div>

      <div
        v-for="(s, idx) in form.shareholders"
        :key="idx"
        class="rounded-xl border border-slate-200/70 p-3 space-y-3 dark:border-slate-800/60"
      >
        <div class="flex items-center justify-between">
          <div class="text-xs font-semibold text-slate-700 dark:text-slate-200">
            股东 #{{ idx + 1 }}
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="props.submitting || form.shareholders.length <= 1"
            @click="removeShareholder(idx)"
          >
            删除
          </UButton>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <USelectMenu
            class="w-full"
            v-model="s.kind"
            :items="[
              { value: 'USER', label: '用户' },
              { value: 'COMPANY', label: '公司' },
            ]"
            value-key="value"
            label-key="label"
            :disabled="props.submitting"
          />

          <USelectMenu
            v-if="s.kind === 'USER'"
            class="w-full md:col-span-2"
            v-model="s.holderId"
            v-model:search-term="s.userSearch"
            :items="buildUserItems(s.userCandidates, s.holderId)"
            value-key="value"
            label-key="label"
            searchable
            placeholder="搜索用户"
            :disabled="props.submitting"
            @update:search-term="(v: string) => handleUserSearchList(s.userCandidates, v)"
          />

          <USelectMenu
            v-else
            class="w-full md:col-span-2"
            v-model="s.holderId"
            v-model:search-term="s.companySearch"
            :items="buildCompanyItems(s.companyCandidates, s.holderId)"
            value-key="value"
            label-key="label"
            searchable
            placeholder="搜索公司"
            :disabled="props.submitting"
            @update:search-term="
              (v: string) => handleCompanySearchList(s.companyCandidates, v)
            "
          />
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="space-y-1">
            <label class="text-xs text-slate-500">出资比例（%）</label>
            <UInput
              class="w-full"
              v-model.number="s.ratio"
              type="number"
              :disabled="props.submitting"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-slate-500">表决权（%）</label>
            <UInput
              v-if="form.votingRightsMode === 'CUSTOM'"
              class="w-full"
              v-model.number="s.votingRatio"
              type="number"
              placeholder="自定义表决权"
              :disabled="props.submitting"
            />
            <UInput
              v-else
              class="w-full"
              :model-value="s.ratio ?? 0"
              disabled
            />
          </div>
        </div>
      </div>

      <div class="text-xs text-slate-500">
        当前合计：<span
          class="font-semibold"
          :class="shareholderRatioSum === 100 ? 'text-emerald-600' : 'text-rose-600'"
          >{{ shareholderRatioSum }}%</span
        >
      </div>
      <div v-if="form.votingRightsMode === 'CUSTOM'" class="text-xs text-slate-500">
        表决权合计：<span
          class="font-semibold"
          :class="shareholderVotingSum === 100 ? 'text-emerald-600' : 'text-rose-600'"
          >{{ shareholderVotingSum }}%</span
        >
      </div>
    </div>

    <div class="space-y-2">
      <div class="text-sm font-semibold text-slate-900 dark:text-white">备注</div>
      <UTextarea
        v-model="form.reason"
        :rows="3"
        placeholder="说明增资/减资原因（可选）"
        :disabled="props.submitting"
      />
    </div>

    <div class="flex justify-end">
      <UButton
        color="primary"
        :loading="props.submitting"
        :disabled="props.submitting"
        @click="handleSubmit"
      >
        提交申请
      </UButton>
    </div>
  </div>
</template>


