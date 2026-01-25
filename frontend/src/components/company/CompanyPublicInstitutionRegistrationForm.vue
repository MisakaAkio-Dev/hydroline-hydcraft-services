<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimelineItem } from '@nuxt/ui'
import type {
  CompanyRef,
  CompanyUserRef,
  WorldDivisionNode,
} from '@/types/company'

type PublicInstitutionDraft = {
  brandName: string
  industryFeature: string
  companyNameDivisionLevels: number[]
  registrationAuthorityCompanyId: string | undefined
  registrationAuthorityName: string
  domicileAddress: string
  operatingTermLong: boolean
  operatingTermYears: number | null
  businessScope: string
  principalId: string | undefined
  principalSearch: string
  principalCandidates: CompanyUserRef[]
  supervisingOrganizationId: string | undefined
}

type SelectItem = { value: string | number; label: string }

type OrganizationOption = {
  value: string
  label: string
}

const props = defineProps<{
  selectedServerId: string | undefined
  serverSearch: string
  serverOptions: SelectItem[]
  visibleDivisionLevels: number[]
  divisionLevelSelectedIds: Array<string | undefined>
  divisionLevelOptions: WorldDivisionNode[][]
  level1Search: string
  hasActiveRegime: boolean
  domicileDivision: WorldDivisionNode | null
  fullInstitutionName: string
  authorityOptions: SelectItem[]
  authorityLoading?: boolean
  supervisingOrganizationOptions: OrganizationOption[]
  supervisingOrganizationLoading?: boolean
  logoPreviewUrl?: string | null
  logoUploading?: boolean
  publicInstitutionDraft: PublicInstitutionDraft
  userLabelCache: Record<string, string>
  buildUserItems: (
    candidates: CompanyUserRef[],
    selectedId?: string,
  ) => SelectItem[]
  handleUserSearchList: (target: CompanyUserRef[], keyword: string) => void
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
  (event: 'request-supervisors'): void
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

const nameDivisionOptions = computed(() => {
  const options: SelectItem[] = []
  props.divisionLevelSelectedIds.forEach((id, index) => {
    if (!id) return
    const node = props.divisionLevelOptions[index]?.find((n) => n.id === id)
    options.push({
      value: index + 1,
      label: node?.name || `第 ${index + 1} 级行政区`,
    })
  })
  return options
})

const nameDivisionEnabled = computed(() => nameDivisionOptions.value.length > 0)

const stepperItems = ref([
  {
    title: '基本信息',
    icon: 'i-lucide-clipboard-list',
    value: 'basic',
  },
  {
    title: '机构成员',
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
    title: '事业单位名称',
    icon: 'i-lucide-building-2',
    slot: 'basic-2',
    description: ' ',
  },
  {
    title: 'LOGO',
    icon: 'i-lucide-image',
    slot: 'basic-3',
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
    title: '业务范围',
    icon: 'i-lucide-notebook-text',
    slot: 'basic-7',
    description: ' ',
  },
]

const memberTimelineItems: TimelineItem[] = [
  {
    title: '负责人',
    icon: 'i-lucide-user-check',
    slot: 'member-1',
    description: ' ',
  },
  {
    title: '主管单位',
    icon: 'i-lucide-shield-check',
    slot: 'member-2',
    description: ' ',
  },
]

const reviewTimelineItems = computed<TimelineItem[]>(() => [
  {
    title: '登记信息确认',
    icon: 'i-lucide-list-check',
    slot: 'review-1',
    description: ' ',
  },
])

function resolveUserLabel(id?: string) {
  if (!id) return '未选择'
  return props.userLabelCache[id] ?? id
}

const supervisingDisplay = computed(() => {
  const option = props.supervisingOrganizationOptions.find(
    (item) =>
      item.value === props.publicInstitutionDraft.supervisingOrganizationId,
  )
  return option?.label ?? '未选择'
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
                    searchable
                    :disabled="!selectedServerId || !hasActiveRegime"
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
          </div>
        </template>

        <template #basic-2-description>
          <div class="space-y-3">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs text-slate-500"
                  >出现在名称中的行政区</label
                >
                <USelectMenu
                  v-model="publicInstitutionDraft.companyNameDivisionLevels"
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
                <UInput
                  class="w-full"
                  v-model="publicInstitutionDraft.brandName"
                />
              </div>
              <div class="space-y-2">
                <label class="text-xs text-slate-500">业务特点</label>
                <UInput
                  class="w-full"
                  v-model="publicInstitutionDraft.industryFeature"
                />
              </div>
              <div class="space-y-2">
                <label class="text-xs text-slate-500">组织形式</label>
                <UInput class="w-full" model-value="事业单位" disabled />
              </div>
            </div>
            <div v-if="fullInstitutionName" class="text-xs text-slate-500">
              预览：<span class="font-semibold text-slate-900">{{
                fullInstitutionName
              }}</span>
            </div>
          </div>
        </template>

        <template #basic-3-description>
          <div class="flex flex-wrap items-center gap-4 mt-2">
            <div class="group relative">
              <div
                class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50"
              >
                <img
                  v-if="logoPreviewUrl"
                  :src="logoPreviewUrl"
                  alt="事业单位 Logo"
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
            v-model="publicInstitutionDraft.registrationAuthorityCompanyId"
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
                    publicInstitutionDraft.registrationAuthorityCompanyId =
                      undefined
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
          <UInput
            class="w-full"
            v-model="publicInstitutionDraft.domicileAddress"
            placeholder="填写详细地址"
          />
        </template>

        <template #basic-6-description>
          <div class="flex items-center gap-2 mt-2">
            <USwitch v-model="publicInstitutionDraft.operatingTermLong" />
            <span class="text-sm text-slate-600">{{
              publicInstitutionDraft.operatingTermLong ? '长期' : '按年限'
            }}</span>
            <UInput
              v-if="!publicInstitutionDraft.operatingTermLong"
              class="w-24"
              v-model.number="publicInstitutionDraft.operatingTermYears"
              type="number"
              placeholder="如：1 年"
              size="xs"
            />
          </div>
        </template>

        <template #basic-7-description>
          <UTextarea
            class="w-full"
            v-model="publicInstitutionDraft.businessScope"
            :rows="3"
            placeholder="填写主营业务与业务范围"
          />
        </template>
      </UTimeline>
    </div>

    <div v-else-if="activeSection === 'members'" class="space-y-4">
      <UTimeline :items="memberTimelineItems" size="xs">
        <template #member-1-description>
          <div class="space-y-2">
            <label class="text-xs text-slate-500">负责人</label>
            <USelectMenu
              class="w-full"
              v-model="publicInstitutionDraft.principalId"
              v-model:search-term="publicInstitutionDraft.principalSearch"
              :items="
                buildUserItems(
                  publicInstitutionDraft.principalCandidates,
                  publicInstitutionDraft.principalId,
                )
              "
              value-key="value"
              label-key="label"
              searchable
              placeholder="搜索负责人"
              @update:search-term="
                (v: string) =>
                  handleUserSearchList(
                    publicInstitutionDraft.principalCandidates,
                    v,
                  )
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
                      publicInstitutionDraft.principalId = undefined
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

        <template #member-2-description>
          <div class="space-y-2">
            <label class="text-xs text-slate-500">主管单位</label>
            <USelectMenu
              class="w-full"
              v-model="publicInstitutionDraft.supervisingOrganizationId"
              :items="supervisingOrganizationOptions"
              value-key="value"
              label-key="label"
              searchable
              :loading="supervisingOrganizationLoading"
              placeholder="选择主管单位（机关法人）"
              @update:open="(open) => open && emit('request-supervisors')"
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
                      publicInstitutionDraft.supervisingOrganizationId =
                        undefined
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
      </UTimeline>
    </div>

    <div v-else class="space-y-4">
      <UTimeline :items="reviewTimelineItems" size="xs">
        <template #review-1-description>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <p class="text-xs text-slate-500">事业单位名称</p>
              <p class="text-sm text-slate-900">{{ fullInstitutionName }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">业务特点</p>
              <p class="text-sm text-slate-700">
                {{ publicInstitutionDraft.industryFeature || '未填写' }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">登记机关</p>
              <p class="text-sm text-slate-700">
                {{
                  authorityOptions.find(
                    (item) =>
                      item.value ===
                      publicInstitutionDraft.registrationAuthorityCompanyId,
                  )?.label ||
                  publicInstitutionDraft.registrationAuthorityName ||
                  '未选择'
                }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">住所地</p>
              <p class="text-sm text-slate-700">
                {{ publicInstitutionDraft.domicileAddress || '未填写' }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">经营期限</p>
              <p class="text-sm text-slate-900">
                {{
                  publicInstitutionDraft.operatingTermLong
                    ? '长期'
                    : `${publicInstitutionDraft.operatingTermYears ?? '未填写'} 年`
                }}
              </p>
            </div>
            <div class="space-y-1 md:col-span-2">
              <p class="text-xs text-slate-500">业务范围</p>
              <p class="text-sm text-slate-700 whitespace-pre-wrap">
                {{ publicInstitutionDraft.businessScope || '未填写' }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">负责人</p>
              <p class="text-sm text-slate-700">
                {{ resolveUserLabel(publicInstitutionDraft.principalId) }}
              </p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-slate-500">主管单位</p>
              <p class="text-sm text-slate-700">{{ supervisingDisplay }}</p>
            </div>
          </div>
        </template>
      </UTimeline>
    </div>

    <div class="flex items-center justify-between gap-3">
      <UButton
        color="neutral"
        variant="soft"
        :disabled="!hasPrev"
        @click="goPrev"
      >
        上一步
      </UButton>
      <UButton color="primary" @click="handlePrimaryAction">
        {{ hasNext ? '下一步' : '提交注册申请' }}
      </UButton>
    </div>
  </div>
</template>
