<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimelineItem } from '@nuxt/ui'
import type {
  CompanyRef,
  CompanyUserRef,
  WorldDivisionNode,
} from '@/types/company'

type IndividualDraft = {
  brandName: string
  industryFeature: string
  companyNameDivisionLevels: number[]
  registrationAuthorityCompanyId: string | undefined
  registrationAuthorityName: string
  domicileAddress: string
  operatingTermLong: boolean
  operatingTermYears: number | null
  businessScope: string
  operatorId: string | undefined
  assistants: Array<{
    userId: string | undefined
    search: string
    candidates: CompanyUserRef[]
  }>
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
  fullBusinessName: string
  authorityOptions: SelectItem[]
  authorityLoading?: boolean
  logoPreviewUrl?: string | null
  logoUploading?: boolean
  individualDraft: IndividualDraft
  operatorLabel: string
  userLabelCache: Record<string, string>
  buildUserItems: (
    candidates: CompanyUserRef[],
    selectedId?: string,
  ) => SelectItem[]
  handleUserSearchList: (target: CompanyUserRef[], keyword: string) => void
  addAssistant: () => void
  removeAssistant: (index: number) => void
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
    title: '经营成员',
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
    title: '个体工商户名称',
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
    title: '经营范围',
    icon: 'i-lucide-notebook-text',
    slot: 'basic-7',
    description: ' ',
  },
]

const memberTimelineItems: TimelineItem[] = [
  {
    title: '经营者',
    icon: 'i-lucide-user-check',
    slot: 'member-1',
    description: ' ',
  },
  {
    title: '其他经营成员',
    icon: 'i-lucide-user-plus',
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

const assistantSummary = computed(() =>
  props.individualDraft.assistants
    .map((entry, index) =>
      entry.userId ? `#${index + 1} ${resolveUserLabel(entry.userId)}` : '',
    )
    .filter(Boolean),
)
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
            <div class="space-y-2">
              <label class="text-xs text-slate-500">字号</label>
              <UInput
                class="w-full"
                v-model="individualDraft.brandName"
                placeholder="填写字号（可选）"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs text-slate-500">
                行业特点<span class="text-red-500">*</span>
              </label>
              <UInput
                class="w-full"
                v-model="individualDraft.industryFeature"
                placeholder="例如：餐饮、科技、零售"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs text-slate-500">组织形式</label>
              <UInput class="w-full" model-value="个体工商户" disabled />
            </div>
            <div v-if="fullBusinessName" class="text-xs text-slate-500">
              预览：<span class="font-semibold text-slate-900">{{
                fullBusinessName
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
                  alt="个体工商户 Logo"
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
            v-model="individualDraft.registrationAuthorityCompanyId"
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
                    individualDraft.registrationAuthorityCompanyId = undefined
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
            v-model="individualDraft.domicileAddress"
            placeholder="填写详细地址"
          />
        </template>

        <template #basic-6-description>
          <div class="flex items-center gap-2 mt-2">
            <USwitch v-model="individualDraft.operatingTermLong" />
            <span class="text-sm text-slate-600">{{
              individualDraft.operatingTermLong ? '长期' : '按年限'
            }}</span>
            <UInput
              v-if="!individualDraft.operatingTermLong"
              class="w-24"
              v-model.number="individualDraft.operatingTermYears"
              type="number"
              placeholder="如：1 年"
              size="xs"
            />
          </div>
        </template>

        <template #basic-7-description>
          <UTextarea
            class="w-full"
            v-model="individualDraft.businessScope"
            :rows="3"
            placeholder="填写主营业务与经营范围"
          />
        </template>
      </UTimeline>
    </div>

    <div v-if="activeSection === 'members'" class="space-y-4">
      <UTimeline :items="memberTimelineItems" size="xs">
        <template #member-1-description>
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div class="text-xs text-slate-500">经营者（申请人）</div>
            <div class="mt-1 text-sm font-semibold text-slate-900">
              {{ operatorLabel }}
            </div>
            <p class="mt-1 text-xs text-slate-400">
              经营者固定为当前申请人，无需选择。
            </p>
          </div>
        </template>

        <template #member-2-description>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs text-slate-500">经营成员可以为多个</p>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="addAssistant"
              >
                添加成员
              </UButton>
            </div>

            <div
              v-if="individualDraft.assistants.length === 0"
              class="text-xs text-slate-400"
            >
              暂无其他经营成员。
            </div>

            <div
              v-for="(assistant, index) in individualDraft.assistants"
              :key="index"
              class="rounded-xl border border-slate-200/70 p-3 space-y-2"
            >
              <div class="flex items-center justify-between">
                <p class="text-xs font-semibold text-slate-700">
                  成员 #{{ index + 1 }}
                </p>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="removeAssistant(index)"
                >
                  删除
                </UButton>
              </div>
              <USelectMenu
                class="w-full"
                v-model="assistant.userId"
                v-model:search-term="assistant.search"
                :items="buildUserItems(assistant.candidates, assistant.userId)"
                value-key="value"
                label-key="label"
                searchable
                placeholder="搜索用户"
                @update:search-term="
                  (v: string) => handleUserSearchList(assistant.candidates, v)
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
                      @click.stop.prevent="assistant.userId = undefined"
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
      </UTimeline>
    </div>

    <div v-if="activeSection === 'review'" class="space-y-4">
      <UTimeline :items="reviewTimelineItems" size="xs">
        <template #review-1-description>
          <div
            class="space-y-4 rounded-xl border border-slate-200 bg-white px-4 py-4"
          >
            <div class="space-y-1">
              <p class="text-xs text-slate-500">个体工商户名称</p>
              <p class="text-sm font-semibold text-slate-900">
                {{ fullBusinessName || '未生成' }}
              </p>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p class="text-xs text-slate-500">行业</p>
                <p class="text-sm text-slate-700">{{ industryLabel }}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500">登记机关</p>
                <p class="text-sm text-slate-700">
                  {{
                    authorityOptions.find(
                      (item) =>
                        item.value ===
                        individualDraft.registrationAuthorityCompanyId,
                    )?.label ||
                    individualDraft.registrationAuthorityName ||
                    '未选择'
                  }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500">住所地</p>
                <p class="text-sm text-slate-700">
                  {{ individualDraft.domicileAddress || '未填写' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-slate-500">经营期限</p>
                <p class="text-sm text-slate-700">
                  {{
                    individualDraft.operatingTermLong
                      ? '长期'
                      : `${individualDraft.operatingTermYears ?? '未填写'} 年`
                  }}
                </p>
              </div>
            </div>
            <div>
              <p class="text-xs text-slate-500">经营范围</p>
              <p class="text-sm text-slate-700 whitespace-pre-wrap">
                {{ individualDraft.businessScope || '未填写' }}
              </p>
            </div>
            <div>
              <p class="text-xs text-slate-500">经营者</p>
              <p class="text-sm text-slate-700">{{ operatorLabel }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-500">其他经营成员</p>
              <div
                v-if="assistantSummary.length === 0"
                class="text-sm text-slate-400"
              >
                暂无
              </div>
              <div v-else class="flex flex-col gap-1">
                <p
                  v-for="item in assistantSummary"
                  :key="item"
                  class="text-sm text-slate-700"
                >
                  {{ item }}
                </p>
              </div>
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
