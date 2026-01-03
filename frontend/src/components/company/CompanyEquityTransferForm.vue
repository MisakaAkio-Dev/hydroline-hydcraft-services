<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import type {
  CompanyEquityTransferApplyPayload,
  CompanyUserRef,
  CompanyRef,
  EquityTransferParty,
} from '@/types/company'

const props = defineProps<{
  submitting?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit', payload: CompanyEquityTransferApplyPayload): void
}>()

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const toast = useToast()

const kindOptions = [
  { value: 'USER', label: '用户' },
  { value: 'COMPANY', label: '公司' },
] as const

const form = reactive<CompanyEquityTransferApplyPayload>({
  transferor: { kind: 'USER', userId: authStore.user?.id ?? '' },
  transferee: { kind: 'USER', userId: '' },
  ratio: 1,
  votingRatio: 1,
  comment: '',
})

// --- 转让方公司搜索 ---
const transferorCompanyQuery = ref('')
const transferorCompanyOptions = ref<CompanyRef[]>([])
let transferorCompanyTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => transferorCompanyQuery.value,
  (q) => {
    if (transferorCompanyTimer) clearTimeout(transferorCompanyTimer)
    transferorCompanyTimer = setTimeout(async () => {
      if (form.transferor.kind !== 'COMPANY') return
      try {
        transferorCompanyOptions.value = await companyStore.searchCompanies(q, 10)
      } catch {
        transferorCompanyOptions.value = []
      }
    }, 250)
  },
)

// --- 受让方用户/公司搜索 ---
const transfereeUserQuery = ref('')
const transfereeUserOptions = ref<CompanyUserRef[]>([])
let transfereeUserTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => transfereeUserQuery.value,
  (q) => {
    if (transfereeUserTimer) clearTimeout(transfereeUserTimer)
    transfereeUserTimer = setTimeout(async () => {
      if (form.transferee.kind !== 'USER') return
      try {
        transfereeUserOptions.value = await companyStore.searchUsers(q, 10)
      } catch {
        transfereeUserOptions.value = []
      }
    }, 250)
  },
)

const transfereeCompanyQuery = ref('')
const transfereeCompanyOptions = ref<CompanyRef[]>([])
let transfereeCompanyTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => transfereeCompanyQuery.value,
  (q) => {
    if (transfereeCompanyTimer) clearTimeout(transfereeCompanyTimer)
    transfereeCompanyTimer = setTimeout(async () => {
      if (form.transferee.kind !== 'COMPANY') return
      try {
        transfereeCompanyOptions.value = await companyStore.searchCompanies(q, 10)
      } catch {
        transfereeCompanyOptions.value = []
      }
    }, 250)
  },
)

const canSubmit = computed(() => {
  if (!authStore.isAuthenticated) return false
  if (!Number.isFinite(form.ratio) || form.ratio <= 0) return false
  if (!Number.isFinite(form.votingRatio) || form.votingRatio <= 0) return false
  const transfereeOk =
    (form.transferee.kind === 'USER' && Boolean((form.transferee as any).userId)) ||
    (form.transferee.kind === 'COMPANY' && Boolean((form.transferee as any).companyId))
  const transferorOk =
    (form.transferor.kind === 'USER' && Boolean((form.transferor as any).userId)) ||
    (form.transferor.kind === 'COMPANY' && Boolean((form.transferor as any).companyId))
  return transfereeOk && transferorOk
})

function normalizeParty(party: EquityTransferParty): EquityTransferParty {
  if (party.kind === 'USER') return { kind: 'USER', userId: party.userId }
  return { kind: 'COMPANY', companyId: party.companyId }
}

function handleSubmit() {
  if (!canSubmit.value) {
    toast.add({ title: '请完整填写转让信息', color: 'warning' })
    return
  }
  emit('submit', {
    transferor: normalizeParty(form.transferor),
    transferee: normalizeParty(form.transferee),
    ratio: Number(form.ratio),
    votingRatio: Number(form.votingRatio),
    comment: form.comment?.trim() || undefined,
  })
}

watch(
  () => form.transferor.kind,
  (kind) => {
    if (kind === 'USER') {
      form.transferor = { kind: 'USER', userId: authStore.user?.id ?? '' }
      transferorCompanyQuery.value = ''
      transferorCompanyOptions.value = []
    } else {
      form.transferor = { kind: 'COMPANY', companyId: '' }
    }
  },
)

watch(
  () => form.transferee.kind,
  (kind) => {
    if (kind === 'USER') {
      form.transferee = { kind: 'USER', userId: '' }
      transfereeCompanyQuery.value = ''
      transfereeCompanyOptions.value = []
    } else {
      form.transferee = { kind: 'COMPANY', companyId: '' }
      transfereeUserQuery.value = ''
      transfereeUserOptions.value = []
    }
  },
)
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-2">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          转让方（股东）
        </div>
        <USelectMenu
          v-model="form.transferor.kind"
          :items="kindOptions"
          value-key="value"
          label-key="label"
          :disabled="props.submitting"
        />

        <div v-if="form.transferor.kind === 'USER'" class="text-xs text-slate-500">
          当前登录用户：{{ authStore.user?.name || authStore.user?.email || '—' }}
        </div>

        <div v-else class="space-y-2">
          <UInput
            v-model="transferorCompanyQuery"
            placeholder="搜索股东公司名称"
            :disabled="props.submitting"
          />
          <USelectMenu
            v-model="(form.transferor as any).companyId"
            :items="transferorCompanyOptions"
            value-key="id"
            label-key="name"
            placeholder="选择股东公司"
            :disabled="props.submitting"
          />
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          受让方
        </div>
        <USelectMenu
          v-model="form.transferee.kind"
          :items="kindOptions"
          value-key="value"
          label-key="label"
          :disabled="props.submitting"
        />

        <div v-if="form.transferee.kind === 'USER'" class="space-y-2">
          <UInput
            v-model="transfereeUserQuery"
            placeholder="搜索受让人（用户名/邮箱）"
            :disabled="props.submitting"
          />
          <USelectMenu
            v-model="(form.transferee as any).userId"
            :items="transfereeUserOptions"
            value-key="id"
            label-key="displayName"
            placeholder="选择受让人用户"
            :disabled="props.submitting"
          >
            <template #item="{ item }">
              <div class="flex flex-col">
                <div class="font-medium">
                  {{ item.displayName || item.name || item.email || item.id }}
                </div>
                <div class="text-xs text-slate-500">
                  {{ item.email || item.id }}
                </div>
              </div>
            </template>
          </USelectMenu>
        </div>

        <div v-else class="space-y-2">
          <UInput
            v-model="transfereeCompanyQuery"
            placeholder="搜索受让公司名称"
            :disabled="props.submitting"
          />
          <USelectMenu
            v-model="(form.transferee as any).companyId"
            :items="transfereeCompanyOptions"
            value-key="id"
            label-key="name"
            placeholder="选择受让公司"
            :disabled="props.submitting"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-2">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          转让股权比例（%）
        </div>
        <UInput
          v-model.number="form.ratio"
          type="number"
          min="0"
          max="100"
          step="0.01"
          :disabled="props.submitting"
        />
      </div>
      <div class="space-y-2">
        <div class="text-sm font-semibold text-slate-900 dark:text-white">
          转让表决权比例（%）
        </div>
        <UInput
          v-model.number="form.votingRatio"
          type="number"
          min="0"
          max="100"
          step="0.01"
          :disabled="props.submitting"
        />
      </div>
    </div>

    <div class="space-y-2">
      <div class="text-sm font-semibold text-slate-900 dark:text-white">备注</div>
      <UTextarea
        v-model="form.comment"
        rows="3"
        placeholder="可选：备注（会写入记录）"
        :disabled="props.submitting"
      />
    </div>

    <div class="flex justify-end gap-2">
      <UButton color="primary" :disabled="!canSubmit" :loading="props.submitting" @click="handleSubmit">
        提交股权转让申请
      </UButton>
    </div>

    <div class="text-xs text-slate-500 dark:text-slate-400">
      提示：申请提交后，需先由受让人同意，随后才会进入管理员审批队列。
    </div>
  </div>
</template>


