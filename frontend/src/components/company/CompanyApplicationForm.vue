<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCompanyStore } from '@/stores/user/companies'
import type {
  CompanyIndustry,
  CompanyType,
  CompanyMemberUserRef,
  CreateCompanyApplicationPayload,
} from '@/types/company'

const props = defineProps<{
  industries: CompanyIndustry[]
  types: CompanyType[]
  submitting?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit', payload: CreateCompanyApplicationPayload): void
}>()

const companyStore = useCompanyStore()
const formState = reactive<CreateCompanyApplicationPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  isIndividualBusiness: false,
  legalRepresentativeId: undefined,
})
const legalSearch = ref('')
const legalCandidates = ref<CompanyMemberUserRef[]>([])
const legalRepresentativeId = ref<string | null>(null)
let searchTimer: number | undefined

watch(
  () => legalRepresentativeId.value,
  (value) => {
    formState.legalRepresentativeId = value ?? undefined
  },
)

watch(
  () => legalSearch.value,
  (value) => {
    const query = value.trim()
    if (!query) {
      return
    }
    if (searchTimer) {
      window.clearTimeout(searchTimer)
    }
    searchTimer = window.setTimeout(async () => {
      try {
        legalCandidates.value = await companyStore.searchUsers(query, 8)
      } catch {
        legalCandidates.value = []
      }
    }, 360)
  },
)

watch(
  () => formState.isIndividualBusiness,
  (isIndividual) => {
    if (isIndividual) {
      formState.typeId = undefined
    }
  },
)

onBeforeUnmount(() => {
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }
})

onMounted(() => {
  void companyStore.fetchMeta()
})

const resolvedTypes = computed(() => {
  if (props.types.length > 0) {
    return props.types
  }
  return companyStore.meta?.types ?? []
})

const resolvedIndustries = computed(() => {
  if (props.industries.length > 0) {
    return props.industries
  }
  return companyStore.meta?.industries ?? []
})

const typeOptions = computed(() =>
  resolvedTypes.value.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  resolvedIndustries.value.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const showCompanyTypeField = computed(() => !formState.isIndividualBusiness)

const legalOptions = computed(() =>
  legalCandidates.value.map((user) => ({
    value: user.id,
    label: user.displayName || user.name || user.email || '未知用户',
  })),
)

const handleSubmit = () => {
  if (!formState.legalRepresentativeId) {
    return
  }
  emit('submit', { ...formState })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div class="flex items-center justify-between">
      <p class="text-xs text-slate-500 dark:text-slate-500">主体类型</p>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-500">{{
          formState.isIndividualBusiness ? '个体工商户' : '公司'
        }}</span>
        <USwitch v-model="formState.isIndividualBusiness" />
      </div>
    </div>

    <div class="space-y-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">
          公司名称
        </label>
        <UInput class="w-full" v-model="formState.name" />
      </div>

      <div v-if="showCompanyTypeField" class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">类型</label>
        <USelectMenu
          class="w-full"
          v-model="formState.typeId"
          :items="typeOptions"
          value-key="value"
          searchable
          placeholder="选择公司类型"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">行业</label>
        <USelectMenu
          class="w-full"
          v-model="formState.industryId"
          :items="industryOptions"
          value-key="value"
          searchable
          placeholder="选择所属行业"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">
          简介（可选）
        </label>
        <UInput
          class="w-full"
          v-model="formState.summary"
          placeholder="概括业务/定位"
        />
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">
          搜索并选择法人
        </label>
        <USelectMenu
          class="w-full"
          v-model="legalRepresentativeId"
          v-model:search-term="legalSearch"
          :items="legalOptions"
          value-key="value"
          searchable
          placeholder="请输入用户名、邮箱或昵称"
          :clearable="false"
        />
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-xs text-slate-500 dark:text-slate-500"
          >详细介绍</label
        >
        <UTextarea
          class="w-full"
          v-model="formState.description"
          :rows="4"
          placeholder="填写背景、制度设计、主要业务等"
        />
      </div>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        :loading="submitting"
        :disabled="!formState.legalRepresentativeId"
      >
        提交注册申请
      </UButton>
    </div>
  </form>
</template>
