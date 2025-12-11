<script setup lang="ts">
import { computed, reactive } from 'vue'
import type {
  CompanyIndustry,
  CompanyType,
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

const formState = reactive<CreateCompanyApplicationPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  industryId: undefined,
  legalRepresentativeName: '',
  legalRepresentativeCode: '',
  contactEmail: '',
  contactPhone: '',
})

const typeOptions = computed(() =>
  props.types.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  props.industries.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const handleSubmit = () => {
  emit('submit', { ...formState })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500"
          >公司名称</label
        >
        <UInput v-model="formState.name" placeholder="例如：Hydroline 科技" />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">类型</label>
        <USelectMenu
          v-model="formState.typeId"
          :options="typeOptions"
          searchable
          placeholder="选择公司类型"
        />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500">行业</label>
        <USelectMenu
          v-model="formState.industryId"
          :options="industryOptions"
          searchable
          placeholder="选择所属行业"
        />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500"
          >一句话简介</label
        >
        <UInput v-model="formState.summary" placeholder="概括业务/定位" />
      </div>
    </div>
    <div class="space-y-2">
      <label class="block text-xs font-semibold text-slate-500">详细介绍</label>
      <UTextarea
        v-model="formState.description"
        :rows="4"
        placeholder="填写背景、制度设计、主要业务等"
      />
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500"
          >法人姓名</label
        >
        <UInput v-model="formState.legalRepresentativeName" />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500"
          >法人证件编号</label
        >
        <UInput v-model="formState.legalRepresentativeCode" />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500"
          >联系邮箱</label
        >
        <UInput v-model="formState.contactEmail" type="email" />
      </div>
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-500"
          >联系电话</label
        >
        <UInput v-model="formState.contactPhone" />
      </div>
    </div>
    <div class="flex justify-end">
      <UButton type="submit" color="primary" :loading="submitting">
        提交注册申请
      </UButton>
    </div>
  </form>
</template>
