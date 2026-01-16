<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyRegistryMembersDialog from './CompanyRegistryMembersDialog.vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  CompanyIndustry,
  CompanyModel,
  CompanyType,
  CompanyVisibility,
  AdminUpdateCompanyMembersPayload,
} from '@/types/company'

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
  industries: CompanyIndustry[]
  types: CompanyType[]
  saving?: boolean
}>()

const authStore = useAuthStore()
const toast = useToast()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'save', payload: Record<string, unknown>): void
  (event: 'save-members', payload: AdminUpdateCompanyMembersPayload): void
}>()

const editDialogOpen = ref(false)
const membersDialogOpen = ref(false)

const formState = reactive({
  name: '',
  summary: '',
  description: '',
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  visibility: undefined as CompanyVisibility | undefined,
  status: undefined as CompanyModel['status'] | undefined,
  logoAttachmentId: '',
  isAuthority: false,
  auditReason: '',
})

const visibilityOptions = [
  { value: 'PUBLIC', label: '公开' },
  { value: 'PRIVATE', label: '仅成员' },
  { value: 'INTERNAL', label: '内部' },
]

type AttachmentUploadResult = {
  id: string
  publicUrl: string | null
}

const logoUploadInput = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)
const logoPreviewUrl = ref<string | null>(null)

function triggerLogoUpload() {
  logoUploadInput.value?.click()
}

async function handleLogoUploadChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file || !authStore.token) return
  logoUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('isPublic', 'true')
    const attachment = await apiFetch<AttachmentUploadResult>('/attachments', {
      method: 'POST',
      body: formData,
      token: authStore.token,
    })
    formState.logoAttachmentId = attachment.id
    logoPreviewUrl.value = attachment.publicUrl ?? null
    emit('save', {
      logoAttachmentId: attachment.id,
      auditReason: '管理员更新公司 Logo',
    })
    toast.add({ title: 'Logo 已上传', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || 'Logo 上传失败',
      color: 'error',
    })
  } finally {
    logoUploading.value = false
    if (target) target.value = ''
  }
}

const selectedLogoPreview = computed(
  () => logoPreviewUrl.value ?? props.company?.logoUrl ?? null,
)

const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'UNDER_REVIEW', label: '审核中' },
  { value: 'NEEDS_REVISION', label: '待补件' },
  { value: 'ACTIVE', label: '已注册' },
  { value: 'SUSPENDED', label: '暂停营业' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'ARCHIVED', label: '注销' },
]

const typeOptions = computed(() =>
  props.types.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  props.industries.map((item) => ({ value: item.id, label: item.name })),
)

const selectedType = computed(() =>
  props.types.find((type) => type.id === formState.typeId),
)

const displayType = computed(
  () => props.company?.type ?? selectedType.value ?? null,
)

const isStateOrganLegalPerson = computed(
  () => displayType.value?.code === 'state_organ_legal_person',
)

const isLimitedLiabilityCompany = computed(
  () => displayType.value?.code === 'limited_liability_company',
)

const isEditStateOrganLegalPerson = computed(
  () => selectedType.value?.code === 'state_organ_legal_person',
)

const showAdministrativeDivision = computed(
  () =>
    isStateOrganLegalPerson.value ||
    Boolean(props.company?.administrativeDivision),
)

const showLlcSection = computed(
  () =>
    isLimitedLiabilityCompany.value || Boolean(props.company?.llcRegistration),
)

function displayText(value?: string | null) {
  const text = String(value ?? '').trim()
  return text || '—'
}

const detailTitle = computed(() => props.company?.name ?? '公司管理')

const administrativeDivisionPathLabel = computed(() => {
  const division = props.company?.administrativeDivision
  const path = division?.domicileDivisionPath
  if (!path) return ''
  const parts = [
    path.level1?.name,
    path.level2?.name,
    path.level3?.name,
  ].filter(Boolean) as string[]
  return parts.join(' / ')
})

const administrativeDivisionLevelLabel = computed(() => {
  const level =
    props.company?.administrativeDivision?.administrativeDivisionLevel
  if (level === 1) return '一级（省/自治区/直辖市）'
  if (level === 2) return '二级（地市/州）'
  if (level === 3) return '三级（区/县）'
  return '—'
})

const companyVisibilityLabel = computed(() => {
  const value = props.company?.visibility
  return (
    visibilityOptions.find((option) => option.value === value)?.label || '—'
  )
})

const companyStatusLabel = computed(() => {
  const value = props.company?.status
  return statusOptions.find((option) => option.value === value)?.label || '—'
})

const companyTypeLabel = computed(() => displayType.value?.name ?? '—')

const companyIndustryLabel = computed(
  () => props.company?.industry?.name ?? '—',
)

const authorityLabel = computed(() =>
  props.company?.isAuthority ? '已启用' : '未启用',
)

const summaryDisplay = computed(() => displayText(props.company?.summary))
const descriptionDisplay = computed(() =>
  displayText(props.company?.description),
)

const llcOfficerCount = computed(
  () => props.company?.llcRegistration?.officers?.length ?? 0,
)
const llcShareholderCount = computed(
  () => props.company?.llcRegistration?.shareholders?.length ?? 0,
)

const auditPreview = computed(() =>
  (props.company?.auditTrail ?? []).slice(0, 5),
)

function syncFormState(company: CompanyModel | null) {
  if (!company) return
  formState.name = company.name
  formState.summary = company.summary ?? ''
  formState.description = company.description ?? ''
  formState.typeId = company.type?.id
  formState.industryId = company.industry?.id
  formState.visibility = company.visibility
  formState.status = company.status
  formState.logoAttachmentId = company.logoAttachmentId ?? ''
  formState.isAuthority = company.isAuthority ?? false
  formState.auditReason = ''
  logoPreviewUrl.value = null
}

watch(
  () => props.company,
  (company) => {
    syncFormState(company)
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (open) => {
    if (open) return
    editDialogOpen.value = false
    membersDialogOpen.value = false
  },
)

watch(
  () => editDialogOpen.value,
  (open) => {
    if (!open) return
    syncFormState(props.company)
  },
)

watch(
  () => formState.typeId,
  () => {
    if (isEditStateOrganLegalPerson.value) {
      formState.industryId = undefined
      return
    }
    formState.isAuthority = false
  },
)

function closeDialog() {
  emit('update:modelValue', false)
}

function openEditDialog() {
  editDialogOpen.value = true
}

function openMembersDialog() {
  membersDialogOpen.value = true
}

function closeEditDialog() {
  editDialogOpen.value = false
}

function handleSave() {
  if (!props.company) return
  emit('save', {
    name: formState.name,
    summary: formState.summary,
    description: formState.description,
    typeId: formState.typeId,
    industryId: isEditStateOrganLegalPerson.value
      ? undefined
      : formState.industryId,
    visibility: formState.visibility,
    status: formState.status,
    logoAttachmentId: formState.logoAttachmentId || undefined,
    isAuthority: formState.isAuthority,
    auditReason: formState.auditReason || '管理员更新公司信息',
  })
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
          class="flex items-start justify-between border-b border-slate-200 px-6 py-4"
        >
          <div class="flex items-center gap-4">
            <div class="group relative">
              <div
                class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50"
              >
                <img
                  v-if="selectedLogoPreview"
                  :src="selectedLogoPreview"
                  alt="公司 Logo"
                  class="h-full w-full object-cover"
                />
                <span v-else class="text-xs text-slate-400">暂无 Logo</span>
              </div>
              <button
                type="button"
                class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/60 text-xs text-white opacity-0 transition group-hover:opacity-100"
                :disabled="logoUploading"
                @click="triggerLogoUpload"
              >
                {{ logoUploading ? '上传中...' : '更换' }}
              </button>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                公司管理
              </p>
              <h3 class="text-lg font-semibold text-slate-900">
                {{ detailTitle }}
              </h3>
              <div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>类型：{{ companyTypeLabel }}</span>
                <span>状态：{{ companyStatusLabel }}</span>
                <span>可见性：{{ companyVisibilityLabel }}</span>
                <span v-if="isStateOrganLegalPerson || company?.isAuthority">
                  审批权限：{{ authorityLabel }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <CompanyStatusBadge :status="company?.status ?? 'DRAFT'" />
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              @click="closeDialog"
            />
          </div>
        </div>

        <input
          ref="logoUploadInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleLogoUploadChange"
        />

        <div class="px-6 py-4 space-y-4">
          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-6">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">基础信息</h4>
              <UButton size="sm" variant="ghost" @click="openEditDialog">
                编辑信息
              </UButton>
            </div>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <div class="space-y-1">
                <p class="text-xs text-slate-500">公司类型</p>
                <p class="text-sm text-slate-900">{{ companyTypeLabel }}</p>
              </div>
              <div v-if="!isStateOrganLegalPerson" class="space-y-1">
                <p class="text-xs text-slate-500">行业</p>
                <p class="text-sm text-slate-900">{{ companyIndustryLabel }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-slate-500">公司状态</p>
                <p class="text-sm text-slate-900">{{ companyStatusLabel }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-slate-500">可见性</p>
                <p class="text-sm text-slate-900">
                  {{ companyVisibilityLabel }}
                </p>
              </div>
              <div
                v-if="isStateOrganLegalPerson || company?.isAuthority"
                class="space-y-1"
              >
                <p class="text-xs text-slate-500">审批权限</p>
                <p class="text-sm text-slate-900">{{ authorityLabel }}</p>
              </div>
            </div>
            <div class="mt-4 space-y-1">
              <p class="text-xs text-slate-500">概要</p>
              <p
                class="text-sm"
                :class="
                  summaryDisplay === '—' ? 'text-slate-400' : 'text-slate-900'
                "
              >
                {{ summaryDisplay }}
              </p>
            </div>
            <div class="mt-4 space-y-1">
              <p class="text-xs text-slate-500">详细介绍</p>
              <p
                class="text-sm whitespace-pre-line"
                :class="
                  descriptionDisplay === '—'
                    ? 'text-slate-400'
                    : 'text-slate-900'
                "
              >
                {{ descriptionDisplay }}
              </p>
            </div>
          </div>

          <div
            v-if="showAdministrativeDivision"
            class="rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">机关法人信息</h4>
              <p class="text-xs text-slate-500">行政区划</p>
            </div>
            <dl class="mt-3 grid gap-3 md:grid-cols-2 text-sm">
              <div>
                <dt class="text-xs font-semibold text-slate-500">
                  所属行政区划
                </dt>
                <dd class="mt-1 text-slate-900">
                  {{
                    administrativeDivisionPathLabel ||
                    company?.administrativeDivision?.domicileDivisionId ||
                    '—'
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-xs font-semibold text-slate-500">区划级别</dt>
                <dd class="mt-1 text-slate-900">
                  {{ administrativeDivisionLevelLabel }}
                </dd>
              </div>
            </dl>
          </div>

          <div
            v-if="showLlcSection"
            class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900">
                人员结构（LLC）
              </h4>
              <UButton
                size="sm"
                variant="ghost"
                :disabled="!company?.llcRegistration"
                @click="openMembersDialog"
              >
                管理成员
              </UButton>
            </div>
            <div class="mt-3 grid gap-4 md:grid-cols-2 text-sm">
              <div class="space-y-1">
                <p class="text-xs text-slate-500">法定代表人</p>
                <p class="text-sm text-slate-900">
                  {{
                    company?.legalRepresentative?.displayName ||
                    company?.legalRepresentative?.name ||
                    '—'
                  }}
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-slate-500">高管数量</p>
                <p class="text-sm text-slate-900">{{ llcOfficerCount }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-slate-500">股东数量</p>
                <p class="text-sm text-slate-900">{{ llcShareholderCount }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-6">
            <h4 class="text-sm font-semibold text-slate-900">审计记录</h4>
            <div class="mt-3 space-y-2 text-sm">
              <div
                v-for="record in auditPreview"
                :key="record.id"
                class="rounded-xl border border-slate-200/70 p-3"
              >
                <div
                  class="flex items-center justify-between text-xs text-slate-500"
                >
                  <span>
                    {{
                      record.actor?.profile?.displayName ||
                      record.actor?.name ||
                      record.actor?.email ||
                      '系统'
                    }}
                  </span>
                  <span>{{ new Date(record.createdAt).toLocaleString() }}</span>
                </div>
                <p class="text-slate-900">
                  {{ record.comment || record.actionLabel || '公司信息更新' }}
                </p>
              </div>
              <div
                v-if="auditPreview.length === 0"
                class="rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500"
              >
                暂无审计记录
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="editDialogOpen"
    @update:open="closeEditDialog"
    :ui="{ content: 'w-full max-w-xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              编辑信息
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              {{ detailTitle }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeEditDialog"
          />
        </div>
        <div class="px-6 py-4 space-y-3">
          <div class="grid grid-cols-[96px,1fr] items-center gap-4">
            <label class="text-xs font-semibold text-slate-500">公司名称</label>
            <UInput v-model="formState.name" />
          </div>
          <div class="grid grid-cols-[96px,1fr] items-center gap-4">
            <label class="text-xs font-semibold text-slate-500">公司类型</label>
            <USelectMenu
              v-model="formState.typeId"
              :items="typeOptions"
              value-key="value"
              placeholder="公司类型"
            />
          </div>
          <div
            v-if="!isEditStateOrganLegalPerson"
            class="grid grid-cols-[96px,1fr] items-center gap-4"
          >
            <label class="text-xs font-semibold text-slate-500">行业</label>
            <USelectMenu
              v-model="formState.industryId"
              :items="industryOptions"
              value-key="value"
              placeholder="行业"
            />
          </div>
          <div class="grid grid-cols-[96px,1fr] items-center gap-4">
            <label class="text-xs font-semibold text-slate-500">公司状态</label>
            <USelectMenu
              v-model="formState.status"
              :items="statusOptions"
              value-key="value"
              placeholder="选择状态"
            />
          </div>
          <div class="grid grid-cols-[96px,1fr] items-center gap-4">
            <label class="text-xs font-semibold text-slate-500">可见性</label>
            <USelectMenu
              v-model="formState.visibility"
              :items="visibilityOptions"
              value-key="value"
              placeholder="选择可见性"
            />
          </div>
          <div
            v-if="isEditStateOrganLegalPerson"
            class="grid grid-cols-[96px,1fr] items-center gap-4"
          >
            <label class="text-xs font-semibold text-slate-500">审批权限</label>
            <div class="flex items-center gap-2">
              <USwitch v-model="formState.isAuthority" />
              <span class="text-xs text-slate-500">标记为可审批机关</span>
            </div>
          </div>
          <div class="grid grid-cols-[96px,1fr] items-center gap-4">
            <label class="text-xs font-semibold text-slate-500">概要</label>
            <UInput
              v-model="formState.summary"
              placeholder="一句话说明公司定位"
            />
          </div>
          <div class="grid grid-cols-[96px,1fr] items-start gap-4">
            <label class="pt-2 text-xs font-semibold text-slate-500">
              详细介绍
            </label>
            <UTextarea v-model="formState.description" rows="4" />
          </div>
          <div class="grid grid-cols-[96px,1fr] items-start gap-4">
            <label class="pt-2 text-xs font-semibold text-slate-500">
              修改原因
            </label>
            <UTextarea
              v-model="formState.auditReason"
              rows="2"
              placeholder="请输入修改原因"
            />
          </div>
        </div>
        <div class="border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="closeEditDialog">
            取消
          </UButton>
          <UButton color="primary" :loading="saving" @click="handleSave">
            保存修改
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <CompanyRegistryMembersDialog
    :model-value="membersDialogOpen"
    :company="company"
    :saving="saving"
    @update:modelValue="(value) => (membersDialogOpen = value)"
    @save="(payload) => emit('save-members', payload)"
  />
</template>
