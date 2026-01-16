<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimelineItem } from '@nuxt/ui'
import type {
  CompanyRef,
  CompanyUserRef,
  WorldDivisionNode,
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

type LlcDraft = {
  registeredCapital: number | null
  administrativeDivisionLevel: number
  brandName: string
  industryFeature: string
  companyNameDivisionLevels: number[]
  registrationAuthorityCompanyId: string | undefined
  registrationAuthorityName: string
  domicileAddress: string
  operatingTermLong: boolean
  operatingTermYears: number | null
  businessScope: string
  votingRightsMode: 'BY_CAPITAL_RATIO' | 'CUSTOM'
  shareholders: ShareholderDraft[]
  directors: {
    items: Array<{
      userId: string | undefined
      search: string
      candidates: CompanyUserRef[]
    }>
    chairpersonId: string | undefined
    viceChairpersonId: string | undefined
  }
  managers: {
    managerId: string | undefined
    deputyManagerId: string | undefined
    managerSearch: string
    deputySearch: string
    managerCandidates: CompanyUserRef[]
    deputyCandidates: CompanyUserRef[]
  }
  legalRepresentativeId: string | undefined
  supervisors: {
    enabled: boolean
    items: Array<{
      userId: string | undefined
      search: string
      candidates: CompanyUserRef[]
    }>
    chairpersonId: string | undefined
  }
  financialOfficer: {
    userId: string | undefined
    search: string
    candidates: CompanyUserRef[]
  }
}

type SelectItem = { value: string; label: string }

const props = defineProps<{
  selectedServerId: string | undefined
  serverSearch: string
  serverOptions: SelectItem[]
  visibleDivisionLevels: number[]
  divisionLevelSelectedIds: Array<string | undefined>
  divisionLevelOptions: WorldDivisionNode[][]
  level1Search: string
  hasActiveRegime: boolean
  industryLabel: string
  domicileDivision: WorldDivisionNode | null
  fullCompanyName: string
  authorityOptions: SelectItem[]
  authorityLoading?: boolean
  logoPreviewUrl?: string | null
  logoUploading?: boolean
  llcDraft: LlcDraft
  shareholderRatioSum: number
  shareholderVotingSum: number
  directorIds: string[]
  legalRepresentativeOptions: string[]
  userLabelCache: Record<string, string>
  forbiddenSupervisorIds: Set<string>
  buildUserItems: (
    candidates: CompanyUserRef[],
    selectedId?: string,
  ) => SelectItem[]
  buildCompanyItems: (
    candidates: CompanyRef[],
    selectedId?: string,
  ) => SelectItem[]
  handleUserSearchList: (target: CompanyUserRef[], keyword: string) => void
  handleCompanySearchList: (target: CompanyRef[], keyword: string) => void
  addShareholder: () => void
  removeShareholder: (index: number) => void
  addDirector: () => void
  removeDirector: (index: number) => void
  addSupervisor: () => void
  removeSupervisor: (index: number) => void
  activeSection?: string
}>()

const emit = defineEmits<{
  (event: 'update:selectedServerId', value: string | undefined): void
  (event: 'update:serverSearch', value: string): void
  (event: 'update:level1Search', value: string): void
  (
    event: 'update:divisionLevelSelectedIds',
    value: Array<string | undefined>,
  ): void
  (event: 'update:activeSection', value: string): void
  (event: 'request-authorities'): void
  (event: 'upload-logo', file: File): void
  (event: 'submit'): void
}>()

const selectedServerModel = computed({
  get: () => props.selectedServerId,
  set: (value) => emit('update:selectedServerId', value),
})

const serverSearchModel = computed({
  get: () => props.serverSearch,
  set: (value) => emit('update:serverSearch', value),
})

const level1SearchModel = computed({
  get: () => props.level1Search,
  set: (value) => emit('update:level1Search', value),
})

const logoUploadInput = ref<HTMLInputElement | null>(null)

function triggerLogoUpload() {
  logoUploadInput.value?.click()
}

function handleLogoUploadChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (file) {
    emit('upload-logo', file)
  }
  if (target) target.value = ''
}

function updateDivisionLevel(index: number, value: string | undefined) {
  const next = [...props.divisionLevelSelectedIds]
  next[index] = value
  emit('update:divisionLevelSelectedIds', next)
}

const level1Id = computed({
  get: () => props.divisionLevelSelectedIds[0],
  set: (value) => updateDivisionLevel(0, value),
})

const level2Id = computed({
  get: () => props.divisionLevelSelectedIds[1],
  set: (value) => updateDivisionLevel(1, value),
})

const stepperItems = ref([
  {
    title: '基本信息',
    icon: 'i-lucide-clipboard-list',
    value: 'basic',
  },
  {
    title: '公司成员',
    icon: 'i-lucide-users',
    value: 'members',
  },
  {
    title: '信息核验',
    icon: 'i-lucide-check-circle',
    value: 'review',
  },
])

const localSection = ref(props.activeSection ?? stepperItems.value[0].value)
const activeSection = computed({
  get: () => props.activeSection ?? localSection.value,
  set: (value) => {
    localSection.value = value
    emit('update:activeSection', value)
  },
})
const stepOrder = computed(() => stepperItems.value.map((item) => item.value))
const activeIndex = computed(() => stepOrder.value.indexOf(activeSection.value))
const hasPrev = computed(() => activeIndex.value > 0)
const hasNext = computed(
  () =>
    activeIndex.value >= 0 && activeIndex.value < stepOrder.value.length - 1,
)

function goPrev() {
  if (!hasPrev.value) return
  activeSection.value = stepOrder.value[activeIndex.value - 1]
}

function goNext() {
  if (!hasNext.value) return
  activeSection.value = stepOrder.value[activeIndex.value + 1]
}

function handlePrimaryAction() {
  if (hasNext.value) {
    goNext()
    return
  }
  emit('submit')
}

const basicTimelineItems: TimelineItem[] = [
  {
    title: '所属服务端与行政区',
    icon: 'i-lucide-map-pin',
    slot: 'basic-1',
    description: ' ',
  },
  {
    title: '注册资本',
    icon: 'i-lucide-wallet',
    slot: 'basic-2',
    description: ' ',
  },
  {
    title: '公司名称',
    icon: 'i-lucide-building-2',
    slot: 'basic-3',
    description: ' ',
  },
  {
    title: 'LOGO',
    icon: 'i-lucide-image',
    slot: 'basic-3-logo',
    description: ' ',
  },
  {
    title: '选择登记机关',
    icon: 'i-lucide-badge-check',
    slot: 'basic-4',
    description: ' ',
  },
  { title: '住所地', icon: 'i-lucide-home', slot: 'basic-5', description: ' ' },
  {
    title: '经营期限',
    icon: 'i-lucide-clock',
    slot: 'basic-6',
    description: ' ',
  },
  {
    title: '经营范围',
    icon: 'i-lucide-file-text',
    slot: 'basic-7',
    description: ' ',
  },
]

const memberTimelineItems: TimelineItem[] = [
  { title: '股东', icon: 'i-lucide-users', slot: 'member-8', description: ' ' },
  {
    title: '董事',
    icon: 'i-lucide-briefcase',
    slot: 'member-9',
    description: ' ',
  },
  {
    title: '经理与副经理',
    icon: 'i-lucide-id-card',
    slot: 'member-10',
    description: ' ',
  },
  {
    title: '法定代表人',
    icon: 'i-lucide-user-check',
    slot: 'member-11',
    description: ' ',
  },
  {
    title: '监事',
    icon: 'i-lucide-shield-check',
    slot: 'member-12',
    description: ' ',
  },
  {
    title: '财务负责人',
    icon: 'i-lucide-calculator',
    slot: 'member-13',
    description: ' ',
  },
]

const reviewTimelineItems = computed<TimelineItem[]>(() => [
  {
    title: '基本信息核验',
    icon: 'i-lucide-clipboard-check',
    slot: 'review-basic',
    description: ' ',
  },
  {
    title: '公司成员核验',
    icon: 'i-lucide-users',
    slot: 'review-members',
    description: ' ',
  },
  {
    title: '提交确认',
    icon: 'i-lucide-circle-check-big',
    slot: 'review-confirm',
    description: ' ',
  },
])

const selectedServerLabel = computed(
  () =>
    props.serverOptions.find((item) => item.value === props.selectedServerId)
      ?.label ?? '',
)
const selectedServerDisplay = computed(() =>
  selectedServerLabel.value ? selectedServerLabel.value : '未选择',
)

function resolveDivisionName(index: number) {
  const id = props.divisionLevelSelectedIds[index]
  if (!id) return ''
  const option = props.divisionLevelOptions[index]?.find((n) => n.id === id)
  if (option) return option.name
  if (props.domicileDivision?.id === id) return props.domicileDivision.name
  return id
}

const divisionLabel = computed(() => {
  const parts = [resolveDivisionName(0), resolveDivisionName(1)].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : '未选择'
})
const nameDivisionEnabled = computed(() =>
  Boolean(props.divisionLevelSelectedIds[0]),
)
const nameDivisionOptions = computed(() => {
  const items: Array<{ label: string; value: number }> = []
  for (
    let level = 1;
    level <= props.divisionLevelSelectedIds.length;
    level += 1
  ) {
    const selectedId = props.divisionLevelSelectedIds[level - 1]
    if (!selectedId) continue
    const name = resolveDivisionName(level - 1)
    if (!name) continue
    items.push({ label: name, value: level })
  }
  return items
})
const industryDisplay = computed(() =>
  props.industryLabel?.trim() ? props.industryLabel.trim() : '未选择',
)
const logoDisplay = computed(() =>
  props.logoPreviewUrl ? props.logoPreviewUrl : null,
)

const authorityLabel = computed(() => {
  const selected = props.authorityOptions.find(
    (item) => item.value === props.llcDraft.registrationAuthorityCompanyId,
  )
  if (selected?.label) return selected.label
  return props.llcDraft.registrationAuthorityName?.trim() || '未选择'
})
const authorityDisplay = computed(() =>
  authorityLabel.value ? authorityLabel.value : '未选择',
)

const operatingTermLabel = computed(() => {
  if (props.llcDraft.operatingTermLong) return '长期'
  if (props.llcDraft.operatingTermYears)
    return `${props.llcDraft.operatingTermYears} 年`
  return '按年限'
})
const domicileAddressDisplay = computed(
  () => props.llcDraft.domicileAddress?.trim() || '未填写',
)
const businessScopeDisplay = computed(
  () => props.llcDraft.businessScope?.trim() || '未填写',
)
const showCompanyPreview = computed(() => {
  const brand = props.llcDraft.brandName?.trim() || ''
  const feature = props.llcDraft.industryFeature?.trim() || ''
  return brand.length > 0 || feature.length > 0
})

const placeholderTexts = new Set(['未填写', '未选择'])
function placeholderClass(value: string) {
  return placeholderTexts.has(value) ? 'text-slate-400' : 'text-slate-900'
}

function resolveHolderLabel(entry: ShareholderDraft) {
  if (!entry.holderId) return '未选择'
  const options =
    entry.kind === 'USER'
      ? props.buildUserItems(entry.userCandidates, entry.holderId)
      : props.buildCompanyItems(entry.companyCandidates, entry.holderId)
  return (
    options.find((item) => item.value === entry.holderId)?.label ??
    entry.holderId
  )
}

function resolveUserLabel(id: string | undefined) {
  if (!id) return '未选择'
  return props.userLabelCache[id] ?? id
}

const shareholderSummary = computed(() =>
  props.llcDraft.shareholders.map((entry, index) => {
    const ratio = entry.ratio ?? 0
    const votingRatio =
      props.llcDraft.votingRightsMode === 'CUSTOM'
        ? (entry.votingRatio ?? 0)
        : ratio
    const holderLabel = resolveHolderLabel(entry)
    return {
      text: `#${index + 1} ${holderLabel}（${
        entry.kind === 'USER' ? '用户' : '公司'
      }） 出资 ${ratio}% / 表决权 ${votingRatio}%`,
      isPlaceholder: holderLabel === '未选择',
    }
  }),
)
const hasFilledShareholders = computed(() =>
  props.llcDraft.shareholders.some((entry) => Boolean(entry.holderId)),
)

const directorSummary = computed(() =>
  props.directorIds.map((id, index) => `#${index + 1} ${resolveUserLabel(id)}`),
)

const supervisorSummary = computed(() => {
  if (!props.llcDraft.supervisors.enabled) return []
  return props.llcDraft.supervisors.items
    .map((entry, index) =>
      entry.userId ? `#${index + 1} ${resolveUserLabel(entry.userId)}` : '',
    )
    .filter(Boolean)
})
</script>

<template>
  <div class="space-y-5">
    <UStepper v-model="activeSection" :items="stepperItems" />

    <div v-if="activeSection === 'basic'" class="space-y-4">
      <UTimeline :items="basicTimelineItems" size="xs">
        <template #basic-1-description>
          <div class="space-y-3">
            <div class="flex gap-3 flex-col w-full">
              <div class="space-y-2">
                <label class="text-xs text-slate-500">所属服务端</label>
                <USelectMenu
                  class="w-full"
                  v-model="selectedServerModel"
                  v-model:search-term="serverSearchModel"
                  :items="serverOptions"
                  value-key="value"
                  searchable
                  placeholder="选择所属服务端"
                >
                  <template #trailing="{ modelValue }">
                    <div class="flex items-center gap-1">
                      <UButton
                        v-if="
                          modelValue !== undefined &&
                          modelValue !== null &&
                          String(modelValue) !== ''
                        "
                        type="button"
                        color="neutral"
                        variant="ghost"
                        class="h-6 w-6 p-0 flex justify-center items-center"
                        aria-label="清空"
                        @click.stop.prevent="selectedServerModel = undefined"
                      >
                        <UIcon name="i-lucide-x" class="h-4 w-4" />
                      </UButton>
                      <span class="select-none text-slate-400">▾</span>
                    </div>
                  </template>
                </USelectMenu>
              </div>
            </div>
            <div
              v-if="visibleDivisionLevels.length > 0"
              class="grid grid-cols-1 gap-3 md:grid-cols-2"
            >
              <div
                v-for="level in visibleDivisionLevels"
                :key="level"
                class="space-y-2"
              >
                <template v-if="level === 1">
                  <label class="text-xs text-slate-500">
                    一级行政区<span class="text-red-500">*</span>
                  </label>
                  <USelectMenu
                    class="w-full"
                    v-model="level1Id"
                    v-model:search-term="level1SearchModel"
                    :items="
                      (divisionLevelOptions[0] || []).map((n) => ({
                        value: n.id,
                        label: n.name,
                      }))
                    "
                    value-key="value"
                    searchable
                    :disabled="!selectedServerId || !hasActiveRegime"
                    placeholder="搜索一级行政区"
                  >
                    <template #trailing="{ modelValue }">
                      <div class="flex items-center gap-1">
                        <UButton
                          v-if="
                            modelValue !== undefined &&
                            modelValue !== null &&
                            String(modelValue) !== ''
                          "
                          type="button"
                          color="neutral"
                          variant="ghost"
                          class="h-6 w-6 p-0 flex justify-center items-center"
                          aria-label="清空"
                          @click.stop.prevent="level1Id = undefined"
                        >
                          <UIcon name="i-lucide-x" class="h-4 w-4" />
                        </UButton>
                        <span class="select-none text-slate-400">▾</span>
                      </div>
                    </template>
                  </USelectMenu>
                </template>
                <template v-else>
                  <label class="text-xs text-slate-500">
                    二级行政区
                    <span class="text-slate-400">（选填）</span>
                  </label>
                  <USelectMenu
                    class="w-full"
                    v-model="level2Id"
                    :items="
                      (divisionLevelOptions[1] || []).map((n) => ({
                        value: n.id,
                        label: n.name,
                      }))
                    "
                    value-key="value"
                    :disabled="
                      !level1Id || (divisionLevelOptions[1] || []).length === 0
                    "
                    placeholder="选择二级行政区"
                  >
                    <template #trailing="{ modelValue }">
                      <div class="flex items-center gap-1">
                        <UButton
                          v-if="
                            modelValue !== undefined &&
                            modelValue !== null &&
                            String(modelValue) !== ''
                          "
                          type="button"
                          color="neutral"
                          variant="ghost"
                          class="h-6 w-6 p-0 flex justify-center items-center"
                          aria-label="清空"
                          @click.stop.prevent="level2Id = undefined"
                        >
                          <UIcon name="i-lucide-x" class="h-4 w-4" />
                        </UButton>
                        <span class="select-none text-slate-400">▾</span>
                      </div>
                    </template>
                  </USelectMenu>
                </template>
              </div>
            </div>
            <p
              v-if="selectedServerId && !hasActiveRegime"
              class="text-xs text-amber-600"
            >
              当前服务端尚未配置行政制度，暂时无法选择行政区。
            </p>
          </div>
        </template>

        <template #basic-2-description>
          <UInput
            class="w-full"
            v-model.number="llcDraft.registeredCapital"
            type="number"
            placeholder="填写数值"
          />
        </template>

        <template #basic-3-description>
          <div class="space-y-3">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs text-slate-500"
                  >出现在公司名中的行政区</label
                >
                <USelectMenu
                  v-model="llcDraft.companyNameDivisionLevels"
                  :items="nameDivisionOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  :disabled="!nameDivisionEnabled"
                  placeholder="选择需要拼接的行政区"
                  class="w-full"
                />
              </div>
              <div class="space-y-2">
                <label class="text-xs text-slate-500">字号</label>
                <UInput class="w-full" v-model="llcDraft.brandName" />
              </div>
              <div class="space-y-2">
                <label class="text-xs text-slate-500">行业或经营特点</label>
                <UInput class="w-full" v-model="llcDraft.industryFeature" />
              </div>
              <div class="space-y-2">
                <label class="text-xs text-slate-500">组织形式</label>
                <UInput class="w-full" model-value="有限公司" disabled />
              </div>
            </div>
            <div v-if="showCompanyPreview" class="text-xs text-slate-500">
              预览：<span class="font-semibold text-slate-900">{{
                fullCompanyName
              }}</span>
            </div>
          </div>
        </template>

        <template #basic-3-logo-description>
          <div class="flex flex-wrap items-center gap-4 mt-2">
            <div class="group relative">
              <div
                class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50"
              >
                <img
                  v-if="logoPreviewUrl"
                  :src="logoPreviewUrl"
                  alt="公司 Logo"
                  class="h-full w-full object-cover"
                />
                <span v-else class="text-xs text-slate-400">暂无 Logo</span>
              </div>
              <button
                type="button"
                class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/60 text-xs text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                :disabled="logoUploading"
                @click="triggerLogoUpload"
              >
                {{
                  logoUploading ? '上传中...' : logoPreviewUrl ? '更换' : '上传'
                }}
              </button>
            </div>
            <div class="text-xs text-slate-500">上传图片</div>
          </div>
          <input
            ref="logoUploadInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleLogoUploadChange"
          />
        </template>

        <template #basic-4-description>
          <USelectMenu
            class="w-full"
            v-model="llcDraft.registrationAuthorityCompanyId"
            :items="authorityOptions"
            value-key="value"
            label-key="label"
            :loading="authorityLoading"
            searchable
            placeholder="选择登记机关（机关法人）"
            @update:open="(open) => open && emit('request-authorities')"
          >
            <template #trailing="{ modelValue }">
              <div class="flex items-center gap-1">
                <UButton
                  v-if="
                    modelValue !== undefined &&
                    modelValue !== null &&
                    String(modelValue) !== ''
                  "
                  type="button"
                  color="neutral"
                  variant="ghost"
                  class="h-6 w-6 p-0 flex justify-center items-center"
                  aria-label="清空"
                  @click.stop.prevent="
                    ((llcDraft.registrationAuthorityCompanyId = undefined),
                    (llcDraft.registrationAuthorityName = ''))
                  "
                >
                  <UIcon name="i-lucide-x" class="h-4 w-4" />
                </UButton>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </template>

        <template #basic-5-description>
          <UInput class="w-full" v-model="llcDraft.domicileAddress" />
        </template>

        <template #basic-6-description>
          <div class="flex items-center gap-2 mt-2">
            <USwitch v-model="llcDraft.operatingTermLong" />
            <span class="text-sm text-slate-600">{{
              llcDraft.operatingTermLong ? '长期' : '按年限'
            }}</span>
            <UInput
              v-if="!llcDraft.operatingTermLong"
              class="w-24"
              v-model.number="llcDraft.operatingTermYears"
              type="number"
              placeholder="如：1 年"
              size="xs"
            />
          </div>
        </template>

        <template #basic-7-description>
          <UTextarea
            class="w-full"
            v-model="llcDraft.businessScope"
            :rows="3"
          />
        </template>
      </UTimeline>
    </div>

    <div v-else-if="activeSection === 'members'" class="space-y-4">
      <UTimeline :items="memberTimelineItems" size="xs">
        <template #member-8-description>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs text-slate-500">出资比例合计 100%</p>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="addShareholder"
              >
                添加股东
              </UButton>
            </div>

            <div class="rounded-xl border border-slate-200/70 p-3 space-y-2">
              <label class="text-xs font-semibold text-slate-700 block"
                >股东表决权行使方式</label
              >
              <div class="space-y-2">
                <USelectMenu
                  class="w-full"
                  v-model="llcDraft.votingRightsMode"
                  :items="[
                    {
                      value: 'BY_CAPITAL_RATIO',
                      label: '按出资比例行使',
                    },
                    {
                      value: 'CUSTOM',
                      label: '自定义',
                    },
                  ]"
                  value-key="value"
                  label-key="label"
                />
                <div class="text-xs text-slate-500 md:self-end">
                  <span v-if="llcDraft.votingRightsMode === 'BY_CAPITAL_RATIO'">
                    当前模式下无需单独填写表决权，系统将使用出资比例作为表决权比例。
                  </span>
                  <span v-else> 请确保所有股东表决权（%）相加为 100%。 </span>
                </div>
              </div>
            </div>

            <div
              v-for="(s, idx) in llcDraft.shareholders"
              :key="idx"
              class="rounded-xl border border-slate-200/70 p-3 space-y-2"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold text-slate-700">
                  股东 #{{ idx + 1 }}
                </p>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="llcDraft.shareholders.length <= 1"
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
                  @update:search-term="
                    (v: string) => handleUserSearchList(s.userCandidates, v)
                  "
                >
                  <template #trailing="{ modelValue }">
                    <div class="flex items-center gap-1">
                      <UButton
                        v-if="
                          modelValue !== undefined &&
                          modelValue !== null &&
                          String(modelValue) !== ''
                        "
                        type="button"
                        color="neutral"
                        variant="ghost"
                        class="h-6 w-6 p-0 flex justify-center items-center"
                        aria-label="清空"
                        @click.stop.prevent="s.holderId = undefined"
                      >
                        <UIcon name="i-lucide-x" class="h-4 w-4" />
                      </UButton>
                      <span class="select-none text-slate-400">▾</span>
                    </div>
                  </template>
                </USelectMenu>

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
                  @update:search-term="
                    (v: string) =>
                      handleCompanySearchList(s.companyCandidates, v)
                  "
                >
                  <template #trailing="{ modelValue }">
                    <div class="flex items-center gap-1">
                      <UButton
                        v-if="
                          modelValue !== undefined &&
                          modelValue !== null &&
                          String(modelValue) !== ''
                        "
                        type="button"
                        color="neutral"
                        variant="ghost"
                        class="h-6 w-6 p-0 flex justify-center items-center"
                        aria-label="清空"
                        @click.stop.prevent="s.holderId = undefined"
                      >
                        <UIcon name="i-lucide-x" class="h-4 w-4" />
                      </UButton>
                      <span class="select-none text-slate-400">▾</span>
                    </div>
                  </template>
                </USelectMenu>
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div class="space-y-1">
                  <label class="text-xs text-slate-500">出资比例（%）</label>
                  <UInput
                    class="w-full"
                    v-model.number="s.ratio"
                    type="number"
                  />
                </div>
                <div class="space-y-1 md:col-span-2">
                  <label class="text-xs text-slate-500">表决权（%）</label>
                  <UInput
                    v-if="llcDraft.votingRightsMode === 'CUSTOM'"
                    class="w-full"
                    v-model.number="s.votingRatio"
                    type="number"
                    placeholder="自定义表决权"
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

            <div v-if="shareholderRatioSum > 0" class="text-xs text-slate-500">
              当前合计：<span
                class="font-semibold"
                :class="
                  shareholderRatioSum === 100
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                "
                >{{ shareholderRatioSum }}%</span
              >
            </div>

            <div
              v-if="llcDraft.votingRightsMode === 'CUSTOM'"
              class="text-xs text-slate-500"
            >
              表决权合计：<span
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
        </template>

        <template #member-9-description>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs text-slate-500">
                董事人数必须为 1 人或 3 人及以上
              </p>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="addDirector"
              >
                添加董事
              </UButton>
            </div>

            <div
              v-for="(d, idx) in llcDraft.directors.items"
              :key="idx"
              class="rounded-xl border border-slate-200/70 p-3 space-y-2"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold text-slate-700">
                  董事 #{{ idx + 1 }}
                </p>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="llcDraft.directors.items.length <= 1"
                  @click="removeDirector(idx)"
                >
                  删除
                </UButton>
              </div>
              <USelectMenu
                class="w-full"
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
              >
                <template #trailing="{ modelValue }">
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="
                        modelValue !== undefined &&
                        modelValue !== null &&
                        String(modelValue) !== ''
                      "
                      type="button"
                      color="neutral"
                      variant="ghost"
                      class="h-6 w-6 p-0 flex justify-center items-center"
                      aria-label="清空"
                      @click.stop.prevent="d.userId = undefined"
                    >
                      <UIcon name="i-lucide-x" class="h-4 w-4" />
                    </UButton>
                    <span class="select-none text-slate-400">▾</span>
                  </div>
                </template>
              </USelectMenu>
            </div>

            <div
              v-if="directorIds.length > 1"
              class="grid grid-cols-1 gap-3 md:grid-cols-2"
            >
              <USelectMenu
                class="w-full"
                v-model="llcDraft.directors.chairpersonId"
                :items="
                  directorIds.map((id) => ({
                    value: id,
                    label: userLabelCache[id] ?? id,
                  }))
                "
                value-key="value"
                label-key="label"
                placeholder="选择董事长（必选）"
              >
                <template #trailing="{ modelValue }">
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="
                        modelValue !== undefined &&
                        modelValue !== null &&
                        String(modelValue) !== ''
                      "
                      type="button"
                      color="neutral"
                      variant="ghost"
                      class="h-6 w-6 p-0 flex justify-center items-center"
                      aria-label="清空"
                      @click.stop.prevent="
                        llcDraft.directors.chairpersonId = undefined
                      "
                    >
                      <UIcon name="i-lucide-x" class="h-4 w-4" />
                    </UButton>
                    <span class="select-none text-slate-400">▾</span>
                  </div>
                </template>
              </USelectMenu>
              <USelectMenu
                class="w-full"
                v-model="llcDraft.directors.viceChairpersonId"
                :items="
                  directorIds.map((id) => ({
                    value: id,
                    label: userLabelCache[id] ?? id,
                  }))
                "
                value-key="value"
                label-key="label"
                placeholder="选择副董事长（可选）"
              >
                <template #trailing="{ modelValue }">
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="
                        modelValue !== undefined &&
                        modelValue !== null &&
                        String(modelValue) !== ''
                      "
                      type="button"
                      color="neutral"
                      variant="ghost"
                      class="h-6 w-6 p-0 flex justify-center items-center"
                      aria-label="清空"
                      @click.stop.prevent="
                        llcDraft.directors.viceChairpersonId = undefined
                      "
                    >
                      <UIcon name="i-lucide-x" class="h-4 w-4" />
                    </UButton>
                    <span class="select-none text-slate-400">▾</span>
                  </div>
                </template>
              </USelectMenu>
            </div>
          </div>
        </template>

        <template #member-10-description>
          <p class="text-xs text-slate-500 mb-3">经理与副经理可选。</p>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <USelectMenu
              class="w-full"
              v-model="llcDraft.managers.managerId"
              v-model:search-term="llcDraft.managers.managerSearch"
              :items="
                buildUserItems(
                  llcDraft.managers.managerCandidates,
                  llcDraft.managers.managerId,
                )
              "
              value-key="value"
              label-key="label"
              searchable
              placeholder="选择经理（可选）"
              @update:search-term="
                (v: string) =>
                  handleUserSearchList(llcDraft.managers.managerCandidates, v)
              "
            >
              <template #trailing="{ modelValue }">
                <div class="flex items-center gap-1">
                  <UButton
                    v-if="
                      modelValue !== undefined &&
                      modelValue !== null &&
                      String(modelValue) !== ''
                    "
                    type="button"
                    color="neutral"
                    variant="ghost"
                    class="h-6 w-6 p-0 flex justify-center items-center"
                    aria-label="清空"
                    @click.stop.prevent="
                      llcDraft.managers.managerId = undefined
                    "
                  >
                    <UIcon name="i-lucide-x" class="h-4 w-4" />
                  </UButton>
                  <span class="select-none text-slate-400">▾</span>
                </div>
              </template>
            </USelectMenu>
            <USelectMenu
              class="w-full"
              v-model="llcDraft.managers.deputyManagerId"
              v-model:search-term="llcDraft.managers.deputySearch"
              :items="
                buildUserItems(
                  llcDraft.managers.deputyCandidates,
                  llcDraft.managers.deputyManagerId,
                )
              "
              value-key="value"
              label-key="label"
              searchable
              placeholder="选择副经理（可选）"
              @update:search-term="
                (v: string) =>
                  handleUserSearchList(llcDraft.managers.deputyCandidates, v)
              "
            >
              <template #trailing="{ modelValue }">
                <div class="flex items-center gap-1">
                  <UButton
                    v-if="
                      modelValue !== undefined &&
                      modelValue !== null &&
                      String(modelValue) !== ''
                    "
                    type="button"
                    color="neutral"
                    variant="ghost"
                    class="h-6 w-6 p-0 flex justify-center items-center"
                    aria-label="清空"
                    @click.stop.prevent="
                      llcDraft.managers.deputyManagerId = undefined
                    "
                  >
                    <UIcon name="i-lucide-x" class="h-4 w-4" />
                  </UButton>
                  <span class="select-none text-slate-400">▾</span>
                </div>
              </template>
            </USelectMenu>
          </div>
        </template>

        <template #member-11-description>
          <p class="text-xs text-slate-500 mb-3">法定代表人必须填写。</p>
          <USelectMenu
            class="w-full"
            v-model="llcDraft.legalRepresentativeId"
            :items="
              legalRepresentativeOptions.map((id) => ({
                value: id,
                label: userLabelCache[id] ?? id,
              }))
            "
            value-key="value"
            label-key="label"
            placeholder="选择法定代表人"
          >
            <template #trailing="{ modelValue }">
              <div class="flex items-center gap-1">
                <UButton
                  v-if="
                    modelValue !== undefined &&
                    modelValue !== null &&
                    String(modelValue) !== ''
                  "
                  type="button"
                  color="neutral"
                  variant="ghost"
                  class="h-6 w-6 p-0 flex justify-center items-center"
                  aria-label="清空"
                  @click.stop.prevent="
                    llcDraft.legalRepresentativeId = undefined
                  "
                >
                  <UIcon name="i-lucide-x" class="h-4 w-4" />
                </UButton>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </template>

        <template #member-12-description>
          <div class="space-y-3 mt-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-500">{{
                  llcDraft.supervisors.enabled ? '已启用' : '未填写'
                }}</span>
                <USwitch v-model="llcDraft.supervisors.enabled" />
              </div>
              <UButton
                v-if="llcDraft.supervisors.enabled"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="addSupervisor"
              >
                添加监事
              </UButton>
            </div>

            <div v-if="llcDraft.supervisors.enabled" class="space-y-3">
              <div
                v-for="(s, idx) in llcDraft.supervisors.items"
                :key="idx"
                class="rounded-xl border border-slate-200/70 p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">
                    监事 #{{ idx + 1 }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="llcDraft.supervisors.items.length <= 1"
                    @click="removeSupervisor(idx)"
                  >
                    删除
                  </UButton>
                </div>
                <USelectMenu
                  class="w-full"
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
                >
                  <template #trailing="{ modelValue }">
                    <div class="flex items-center gap-1">
                      <UButton
                        v-if="
                          modelValue !== undefined &&
                          modelValue !== null &&
                          String(modelValue) !== ''
                        "
                        type="button"
                        color="neutral"
                        variant="ghost"
                        class="h-6 w-6 p-0 flex justify-center items-center"
                        aria-label="清空"
                        @click.stop.prevent="s.userId = undefined"
                      >
                        <UIcon name="i-lucide-x" class="h-4 w-4" />
                      </UButton>
                      <span class="select-none text-slate-400">▾</span>
                    </div>
                  </template>
                </USelectMenu>
                <p
                  v-if="s.userId && forbiddenSupervisorIds.has(s.userId)"
                  class="text-xs text-rose-600"
                >
                  该用户当前已担任董事/经理/副经理/财务负责人，不能兼任监事
                </p>
              </div>

              <USelectMenu
                v-if="
                  llcDraft.supervisors.items.filter((x) => x.userId).length > 1
                "
                class="w-full"
                v-model="llcDraft.supervisors.chairpersonId"
                :items="
                  llcDraft.supervisors.items
                    .map((x) => x.userId)
                    .filter(Boolean)
                    .map((id) => ({
                      value: id as string,
                      label: userLabelCache[id as string] ?? (id as string),
                    }))
                "
                value-key="value"
                label-key="label"
                placeholder="选择监事会主席（可选）"
              >
                <template #trailing="{ modelValue }">
                  <div class="flex items-center gap-1">
                    <UButton
                      v-if="
                        modelValue !== undefined &&
                        modelValue !== null &&
                        String(modelValue) !== ''
                      "
                      type="button"
                      color="neutral"
                      variant="ghost"
                      class="h-6 w-6 p-0 flex justify-center items-center"
                      aria-label="清空"
                      @click.stop.prevent="
                        llcDraft.supervisors.chairpersonId = undefined
                      "
                    >
                      <UIcon name="i-lucide-x" class="h-4 w-4" />
                    </UButton>
                    <span class="select-none text-slate-400">▾</span>
                  </div>
                </template>
              </USelectMenu>
            </div>
          </div>
        </template>

        <template #member-13-description>
          <p class="text-xs text-slate-500 mb-3">财务负责人可选。</p>
          <USelectMenu
            class="w-full"
            v-model="llcDraft.financialOfficer.userId"
            v-model:search-term="llcDraft.financialOfficer.search"
            :items="
              buildUserItems(
                llcDraft.financialOfficer.candidates,
                llcDraft.financialOfficer.userId,
              )
            "
            value-key="value"
            label-key="label"
            searchable
            placeholder="选择财务负责人（可选）"
            @update:search-term="
              (v: string) =>
                handleUserSearchList(llcDraft.financialOfficer.candidates, v)
            "
          >
            <template #trailing="{ modelValue }">
              <div class="flex items-center gap-1">
                <UButton
                  v-if="
                    modelValue !== undefined &&
                    modelValue !== null &&
                    String(modelValue) !== ''
                  "
                  type="button"
                  color="neutral"
                  variant="ghost"
                  class="h-6 w-6 p-0 flex justify-center items-center"
                  aria-label="清空"
                  @click.stop.prevent="
                    llcDraft.financialOfficer.userId = undefined
                  "
                >
                  <UIcon name="i-lucide-x" class="h-4 w-4" />
                </UButton>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </template>
      </UTimeline>
    </div>

    <div v-else class="space-y-4">
      <UTimeline :items="reviewTimelineItems" size="xs">
        <template #review-basic-description>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <p class="text-xs text-slate-500">所属服务端</p>
              <p
                class="text-sm"
                :class="placeholderClass(selectedServerDisplay)"
              >
                {{ selectedServerDisplay }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">行政区划</p>
              <p class="text-sm" :class="placeholderClass(divisionLabel)">
                {{ divisionLabel }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">所属行业</p>
              <p class="text-sm" :class="placeholderClass(industryDisplay)">
                {{ industryDisplay }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">注册资本</p>
              <p class="text-sm text-slate-900">
                {{ llcDraft.registeredCapital ?? 0 }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">公司名称预览</p>
              <p class="text-sm text-slate-900">{{ fullCompanyName }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">登记机关</p>
              <p class="text-sm" :class="placeholderClass(authorityDisplay)">
                {{ authorityDisplay }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">公司 Logo</p>
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50"
                >
                  <img
                    v-if="logoDisplay"
                    :src="logoDisplay"
                    alt="公司 Logo 预览"
                    class="h-full w-full object-cover"
                  />
                  <span v-else class="text-xs text-slate-400">暂无</span>
                </div>
                <span
                  class="text-xs"
                  :class="logoDisplay ? 'text-slate-500' : 'text-slate-400'"
                >
                  {{ logoDisplay ? '已选择' : '未上传' }}
                </span>
              </div>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">住所地</p>
              <p
                class="text-sm"
                :class="placeholderClass(domicileAddressDisplay)"
              >
                {{ domicileAddressDisplay }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">经营期限</p>
              <p class="text-sm text-slate-900">{{ operatingTermLabel }}</p>
            </div>
            <div class="space-y-1 md:col-span-2">
              <p class="text-xs text-slate-500">经营范围</p>
              <p
                class="text-sm"
                :class="placeholderClass(businessScopeDisplay)"
              >
                {{ businessScopeDisplay }}
              </p>
            </div>
          </div>
        </template>

        <template #review-members-description>
          <div class="space-y-3 text-sm">
            <div>
              <p class="text-xs text-slate-500">股东</p>
              <ul class="mt-1 space-y-1">
                <template v-if="hasFilledShareholders">
                  <li
                    v-for="(item, index) in shareholderSummary"
                    :key="index"
                    :class="
                      item.isPlaceholder ? 'text-slate-400' : 'text-slate-900'
                    "
                  >
                    {{ item.text }}
                  </li>
                </template>
                <li v-if="!hasFilledShareholders" class="text-slate-400">
                  未填写
                </li>
              </ul>
            </div>
            <div>
              <p class="text-xs text-slate-500">董事</p>
              <ul class="mt-1 space-y-1">
                <li
                  v-for="(item, index) in directorSummary"
                  :key="index"
                  class="text-slate-900"
                >
                  {{ item }}
                </li>
                <li v-if="directorSummary.length === 0" class="text-slate-400">
                  未填写
                </li>
              </ul>
            </div>
            <div>
              <p class="text-xs text-slate-500">董事长</p>
              <p
                :class="
                  placeholderClass(
                    resolveUserLabel(llcDraft.directors.chairpersonId),
                  )
                "
              >
                {{ resolveUserLabel(llcDraft.directors.chairpersonId) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500">副董事长</p>
              <p
                :class="
                  placeholderClass(
                    resolveUserLabel(llcDraft.directors.viceChairpersonId),
                  )
                "
              >
                {{ resolveUserLabel(llcDraft.directors.viceChairpersonId) }}
              </p>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p class="text-xs text-slate-500">经理</p>
                <p
                  :class="
                    placeholderClass(
                      resolveUserLabel(llcDraft.managers.managerId),
                    )
                  "
                >
                  {{ resolveUserLabel(llcDraft.managers.managerId) }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500">副经理</p>
                <p
                  :class="
                    placeholderClass(
                      resolveUserLabel(llcDraft.managers.deputyManagerId),
                    )
                  "
                >
                  {{ resolveUserLabel(llcDraft.managers.deputyManagerId) }}
                </p>
              </div>
            </div>
            <div>
              <p class="text-xs text-slate-500">法定代表人</p>
              <p
                :class="
                  placeholderClass(
                    resolveUserLabel(llcDraft.legalRepresentativeId),
                  )
                "
              >
                {{ resolveUserLabel(llcDraft.legalRepresentativeId) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500">监事</p>
              <ul class="mt-1 space-y-1">
                <li v-for="(item, index) in supervisorSummary" :key="index">
                  <span class="text-slate-900">{{ item }}</span>
                </li>
                <li
                  v-if="supervisorSummary.length === 0"
                  class="text-slate-400"
                >
                  未填写
                </li>
              </ul>
            </div>
            <div>
              <p class="text-xs text-slate-500">监事会主席</p>
              <p
                :class="
                  placeholderClass(
                    resolveUserLabel(llcDraft.supervisors.chairpersonId),
                  )
                "
              >
                {{ resolveUserLabel(llcDraft.supervisors.chairpersonId) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500">财务负责人</p>
              <p
                :class="
                  placeholderClass(
                    resolveUserLabel(llcDraft.financialOfficer.userId),
                  )
                "
              >
                {{ resolveUserLabel(llcDraft.financialOfficer.userId) }}
              </p>
            </div>
          </div>
        </template>

        <template #review-confirm-description>
          <div class="text-sm text-slate-600">
            请核对上述信息，确认无误后提交。若需要修改，请点击上一步返回对应步骤调整。
          </div>
        </template>
      </UTimeline>
    </div>

    <div class="flex items-center justify-between">
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        :disabled="!hasPrev"
        @click="goPrev"
      >
        上一步
      </UButton>
      <UButton
        type="button"
        color="primary"
        variant="soft"
        @click="handlePrimaryAction"
      >
        {{ hasNext ? '下一步' : '提交注册申请' }}
      </UButton>
    </div>
  </div>
</template>
