<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'
import RailwaySystemEditDialog from '@/views/user/Transportation/railway/components/RailwaySystemEditDialog.vue'
import RailwayFacilityEditorDialog from '@/views/user/Transportation/railway/components/RailwayFacilityEditorDialog.vue'
import type { RailwaySystemListResponse } from '@/types/transportation'

type EditAction = 'system' | 'facility'

const props = withDefaults(
  defineProps<{
    open: boolean
    initialAction?: EditAction | null
  }>(),
  { initialAction: null },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const localOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const action = ref<EditAction | null>(props.initialAction ?? null)

watch(
  () => props.initialAction,
  (next) => {
    if (next) action.value = next
  },
)

const stepperItems = computed(() => {
  const base = [
    { title: '编辑内容', icon: 'i-lucide-clipboard-edit', value: 'edit' },
  ]
  if (props.initialAction) return base
  return [
    { title: '选择事项', icon: 'i-lucide-layout-template', value: 'choose' },
    ...base,
  ]
})

const activeSection = ref(stepperItems.value[0].value)

watch(
  () => localOpen.value,
  (open) => {
    if (!open) return
    activeSection.value = stepperItems.value[0].value
    action.value = props.initialAction ?? null
    systemSearch.value = ''
    systems.value = []
    systemPagination.page = 1
  },
)

const systemsStore = useTransportationRailwaySystemsStore()
const systemsLoading = ref(false)
const systems = ref<RailwaySystemListResponse['items']>([])
const systemSearch = ref('')
const systemPagination = reactive({
  page: 1,
  pageSize: 8,
  pageCount: 1,
  total: 0,
})

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadSystems() {
  if (action.value !== 'system') return
  systemsLoading.value = true
  try {
    const response = await systemsStore.fetchSystems({
      search: systemSearch.value.trim() || undefined,
      page: systemPagination.page,
      pageSize: systemPagination.pageSize,
    })
    systems.value = response.items
    systemPagination.pageCount = response.pageCount
    systemPagination.total = response.total
  } finally {
    systemsLoading.value = false
  }
}

watch(
  () => [localOpen.value, action.value, systemPagination.page],
  ([open]) => {
    if (!open) return
    if (action.value !== 'system') return
    void loadSystems()
  },
)

watch(
  () => systemSearch.value,
  () => {
    systemPagination.page = 1
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void loadSystems()
    }, 300)
  },
)

const systemEditOpen = ref(false)
const facilityEditorOpen = ref(false)
const selectedSystemId = ref<string | null>(null)

function openSystemEdit(systemId: string) {
  selectedSystemId.value = systemId
  systemEditOpen.value = true
  localOpen.value = false
}

function openFacilityEditor() {
  facilityEditorOpen.value = true
  localOpen.value = false
}

function handleSystemSaved() {
  void loadSystems()
}
</script>

<template>
  <UModal
    :open="localOpen"
    @update:open="(value) => (localOpen = value)"
    :ui="{ content: 'w-full max-w-4xl w-[calc(100vw-2rem)]' }"
    title="编辑铁路设施"
    description="选择要编辑的模块后继续。"
  >
    <template #content>
      <div class="flex max-h-[80vh] flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700"
        >
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              交通系统铁路模块
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              编辑铁路设施
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="localOpen = false"
          />
        </div>

        <div class="grid gap-6 p-6 md:grid-cols-[220px,1fr] overflow-auto">
          <UStepper v-model="activeSection" :items="stepperItems" />

          <div class="space-y-6">
            <div v-if="activeSection === 'choose'" class="space-y-4">
              <div class="grid gap-3 md:grid-cols-2">
                <UButton
                  class="px-3 py-2"
                  :color="action === 'system' ? 'primary' : 'neutral'"
                  :variant="action === 'system' ? 'soft' : 'ghost'"
                  :ui="{
                    base: 'h-auto items-start justify-start px-4 py-4 text-left whitespace-normal',
                  }"
                  @click="
                    () => {
                      action = 'system'
                      activeSection = 'edit'
                    }
                  "
                >
                  <div class="flex items-center gap-3 w-full">
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                      :class="
                        action === 'system'
                          ? 'bg-white text-primary-600 dark:bg-slate-900 dark:text-primary-400'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      "
                    >
                      <UIcon name="i-lucide-layout-grid" class="h-5 w-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-semibold">线路系统</div>
                      <div
                        class="text-xs opacity-80 font-normal leading-relaxed"
                      >
                        修改线路系统名称、Logo 与线路组成。
                      </div>
                    </div>
                  </div>
                </UButton>

                <UButton
                  class="px-3 py-2"
                  :color="action === 'facility' ? 'primary' : 'neutral'"
                  :variant="action === 'facility' ? 'soft' : 'ghost'"
                  :ui="{
                    base: 'h-auto items-start justify-start px-4 py-4 text-left whitespace-normal',
                  }"
                  @click="
                    () => {
                      action = 'facility'
                      activeSection = 'edit'
                    }
                  "
                >
                  <div class="flex items-center gap-3 w-full">
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                      :class="
                        action === 'facility'
                          ? 'bg-white text-primary-600 dark:bg-slate-900 dark:text-primary-400'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      "
                    >
                      <UIcon name="i-lucide-building-2" class="h-5 w-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-semibold">设施绑定</div>
                      <div
                        class="text-xs opacity-80 font-normal leading-relaxed"
                      >
                        维护线路、车站、车厂的运营/建设单位。
                      </div>
                    </div>
                  </div>
                </UButton>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div
                v-if="action === 'system'"
                class="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <UInput
                    v-model="systemSearch"
                    placeholder="搜索线路系统"
                    class="min-w-[200px] flex-1"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    :loading="systemsLoading"
                    @click="loadSystems"
                  >
                    刷新
                  </UButton>
                </div>
                <div
                  v-if="systemsLoading"
                  class="flex items-center justify-center rounded-xl border border-dashed border-slate-200/70 py-8 text-sm text-slate-500 dark:border-slate-800/70"
                >
                  正在加载线路系统…
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="item in systems"
                    :key="item.id"
                    class="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm dark:border-slate-800/70 dark:bg-slate-900/70"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="h-10 w-10 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50 dark:border-slate-800/70 dark:bg-slate-800/60"
                      >
                        <img
                          v-if="item.logoUrl"
                          :src="item.logoUrl"
                          :alt="item.name"
                          class="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <div class="text-slate-900 dark:text-white">
                          {{ item.name }}
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">
                          {{ item.englishName || '—' }}
                        </div>
                      </div>
                    </div>
                    <UButton
                      size="xs"
                      color="primary"
                      variant="soft"
                      :disabled="item.canEdit === false"
                      @click="openSystemEdit(item.id)"
                    >
                      编辑
                    </UButton>
                  </div>
                  <div
                    v-if="systems.length === 0"
                    class="text-xs text-slate-500"
                  >
                    暂无可编辑的线路系统。
                  </div>
                </div>
                <div
                  v-if="systemPagination.pageCount > 1"
                  class="flex justify-center"
                >
                  <UPagination
                    v-model:page="systemPagination.page"
                    :items-per-page="systemPagination.pageSize"
                    :total="systemPagination.total"
                  />
                </div>
              </div>

              <div
                v-else-if="action === 'facility'"
                class="rounded-2xl border border-slate-200/70 bg-white p-4 text-sm text-slate-600 dark:border-slate-800/70 dark:bg-slate-900 dark:text-slate-300"
              >
                <p>进入设施绑定编辑器，支持线路/车站/车厂的批量维护。</p>
                <div class="mt-3">
                  <UButton
                    size="sm"
                    color="primary"
                    @click="openFacilityEditor"
                  >
                    打开设施编辑
                  </UButton>
                </div>
              </div>

              <div v-else class="text-sm text-slate-500">
                请先选择要编辑的模块。
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <RailwaySystemEditDialog
    v-model:open="systemEditOpen"
    :system-id="selectedSystemId"
    @saved="handleSystemSaved"
  />

  <RailwayFacilityEditorDialog v-model:open="facilityEditorOpen" />
</template>
