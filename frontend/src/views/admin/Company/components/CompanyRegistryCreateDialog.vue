<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import type {
  AdminCreateCompanyPayload,
  CompanyUserRef,
  CompanyType,
  CompanyIndustry,
  WorldDivisionNode,
  WorldDivisionPath,
} from '@/types/company'

const props = defineProps<{
  modelValue: boolean
  types: CompanyType[]
  industries: CompanyIndustry[]
  searchUsers: (keyword: string, limit: number) => Promise<CompanyUserRef[]>
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', payload: AdminCreateCompanyPayload): void
}>()

const toast = useToast()

const formState = reactive<AdminCreateCompanyPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  legalRepresentativeId: undefined,
  domicileDivisionId: undefined,
})

const selectedType = computed(() =>
  props.types.find((t) => t.id === formState.typeId),
)
const isStateOrganLegalPerson = computed(
  () => selectedType.value?.code === 'state_organ_legal_person',
)

const searchKeyword = ref('')
const candidates = ref<CompanyUserRef[]>([])
const selectedCandidateId = ref<string | undefined>(undefined)
let searchTimer: number | undefined

const typeOptions = computed(() =>
  props.types.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  props.industries.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const candidateOptions = computed(() =>
  candidates.value.map((user) => ({
    value: user.id,
    label: user.displayName || user.name || user.email || '未知用户',
  })),
)

// --- 行政区划选择（机关法人） ---
const divisionSearchKeyword = ref('')
const divisionCandidates = ref<WorldDivisionNode[]>([])
const selectedDivisionId = ref<string | undefined>(undefined)
const selectedDivisionPath = ref<WorldDivisionPath | null>(null)
let divisionSearchTimer: number | undefined

const divisionOptions = computed(() =>
  divisionCandidates.value.map((n) => ({
    value: n.id,
    label: `${n.name}（${n.id}）· ${n.level === 1 ? '一级' : n.level === 2 ? '二级' : '三级'}`,
  })),
)

const selectedDivisionPathLabel = computed(() => {
  const path = selectedDivisionPath.value
  if (!path) return ''
  const parts = [
    path.level1?.name,
    path.level2?.name,
    path.level3?.name,
  ].filter(Boolean) as string[]
  return parts.join(' / ')
})

watch(
  () => divisionSearchKeyword.value,
  (value) => {
    if (!isStateOrganLegalPerson.value) return
    const q = value.trim()
    if (!q) {
      divisionCandidates.value = []
      selectedDivisionId.value = undefined
      selectedDivisionPath.value = null
      formState.domicileDivisionId = undefined
      return
    }
    if (divisionSearchTimer) {
      window.clearTimeout(divisionSearchTimer)
    }
    divisionSearchTimer = window.setTimeout(async () => {
      try {
        divisionCandidates.value = await apiFetch<WorldDivisionNode[]>(
          `/companies/geo/divisions/search?q=${encodeURIComponent(q)}&limit=20`,
        )
      } catch {
        divisionCandidates.value = []
      }
    }, 360)
  },
)

watch(
  () => selectedDivisionId.value,
  async (value) => {
    formState.domicileDivisionId = value ?? undefined
    selectedDivisionPath.value = null
    if (!value) return
    try {
      selectedDivisionPath.value = await apiFetch<WorldDivisionPath>(
        `/companies/geo/divisions/${encodeURIComponent(value)}/path`,
      )
    } catch {
      selectedDivisionPath.value = null
    }
  },
)

watch(
  () => formState.typeId,
  () => {
    if (isStateOrganLegalPerson.value) {
      // 切入“机关法人”时：行业/描述不需要填写，清理以避免误提交
      formState.industryId = undefined
      formState.description = ''
      return
    }
    // 切出“机关法人”时清理专用字段
    divisionSearchKeyword.value = ''
    divisionCandidates.value = []
    selectedDivisionId.value = undefined
    selectedDivisionPath.value = null
    formState.domicileDivisionId = undefined
  },
)

watch(
  () => searchKeyword.value,
  (value) => {
    if (!value.trim()) {
      candidates.value = []
      selectedCandidateId.value = undefined
      formState.legalRepresentativeId = undefined
      return
    }
    if (searchTimer) {
      window.clearTimeout(searchTimer)
    }
    searchTimer = window.setTimeout(async () => {
      try {
        candidates.value = await props.searchUsers(value, 8)
      } catch {
        candidates.value = []
      }
    }, 360)
  },
)

watch(
  () => selectedCandidateId.value,
  (value) => {
    formState.legalRepresentativeId = value ?? undefined
  },
)

function closeDialog() {
  emit('update:modelValue', false)
}

function handleSubmit() {
  if (isStateOrganLegalPerson.value) {
    if (!formState.domicileDivisionId?.trim()) {
      toast.add({ title: '请选择所属行政区划', color: 'error' })
      return
    }
    if (!formState.legalRepresentativeId?.trim()) {
      toast.add({ title: '请选择法定代表人', color: 'error' })
      return
    }
  }
  const payload: AdminCreateCompanyPayload = { ...formState }
  if (isStateOrganLegalPerson.value) {
    // 机关法人：行业/描述不需要填写，也不提交空字符串
    payload.industryId = undefined
    payload.description = undefined
  }
  emit('submit', payload)
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
    :ui="{ content: 'w-full max-w-3xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              直接入库
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              管理员新增公司/个体
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
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">名称</label>
              <UInput v-model="formState.name" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">类型</label>
              <USelectMenu
                v-model="formState.typeId"
                :items="typeOptions"
                value-key="value"
                searchable
                placeholder="公司类型"
              />
            </div>
          </div>

          <div
            v-if="isStateOrganLegalPerson"
            class="rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">机关法人信息</h4>
              <p class="text-xs text-slate-500">必填</p>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">
                所属行政区划
              </label>
              <UInput
                v-model="divisionSearchKeyword"
                placeholder="输入区划名称搜索（如：北京、杭州市、海淀…）"
              />
              <USelectMenu
                v-model="selectedDivisionId"
                :items="divisionOptions"
                value-key="value"
                placeholder="选择所属行政区划"
                :clearable="false"
                :disabled="divisionOptions.length === 0"
              />
              <p
                v-if="selectedDivisionPathLabel"
                class="text-xs text-slate-500"
              >
                路径：{{ selectedDivisionPathLabel }}
              </p>
            </div>
          </div>

          <div v-if="!isStateOrganLegalPerson" class="space-y-2">
            <label class="text-xs font-semibold text-slate-500">行业</label>
            <USelectMenu
              v-model="formState.industryId"
              :items="industryOptions"
              value-key="value"
              searchable
              placeholder="行业"
            />
          </div>
          <div v-if="!isStateOrganLegalPerson" class="space-y-2">
            <label class="text-xs font-semibold text-slate-500">描述</label>
            <UTextarea v-model="formState.description" :rows="4" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-500">
              搜索法定代表人
            </label>
            <UInput v-model="searchKeyword" placeholder="用户名、邮箱、昵称" />
            <USelectMenu
              v-model="selectedCandidateId"
              :items="candidateOptions"
              value-key="value"
              placeholder="选择法定代表人"
              :clearable="false"
              :disabled="candidateOptions.length === 0"
            />
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="closeDialog">
            取消
          </UButton>
          <UButton color="primary" :loading="saving" @click="handleSubmit">
            直接创建
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
