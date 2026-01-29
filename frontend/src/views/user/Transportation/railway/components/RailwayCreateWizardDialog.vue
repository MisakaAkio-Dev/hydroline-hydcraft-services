<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'
import type {
  RailwayEntity,
  RailwayManualMergeCreatePayload,
  RailwayRoute,
} from '@/types/transportation'

type WizardAction = 'system' | 'merge-route' | 'merge-station' | 'merge-depot'

const props = withDefaults(
  defineProps<{
    open: boolean
    initialAction?: WizardAction | null
  }>(),
  { initialAction: null },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const router = useRouter()
const railwayStore = useTransportationRailwayStore()
const systemsStore = useTransportationRailwaySystemsStore()
const toast = useToast()

const localOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const action = ref<WizardAction | null>(props.initialAction ?? null)

watch(
  () => props.initialAction,
  (next) => {
    if (next) action.value = next
  },
)

const stepperItems = computed(() => {
  const base = [
    { title: '填写信息', icon: 'i-lucide-clipboard-list', value: 'basic' },
    { title: '选择数据', icon: 'i-lucide-search', value: 'select' },
    { title: '确认提交', icon: 'i-lucide-check-circle', value: 'review' },
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
    selected.items = []
    basic.name = ''
    basic.englishName = ''
    basic.colorText = ''
    search.term = ''
    search.results = []
    search.pagination = { total: 0, page: 1, pageSize: 10, pageCount: 1 }
  },
)

const basic = reactive({
  name: '',
  englishName: '',
  colorText: '',
})

const selected = reactive({
  items: [] as Array<RailwayRoute | RailwayEntity>,
})

const selectedScope = computed(() => {
  const first = selected.items[0]
  if (!first) return null
  return {
    serverId: first.server.id,
    railwayType: String(first.railwayType ?? '').toLowerCase(),
    dimension: first.dimension ?? null,
  }
})

function isSameScope(item: RailwayRoute | RailwayEntity) {
  const scope = selectedScope.value
  if (!scope) return true
  return (
    item.server.id === scope.serverId &&
    String(item.railwayType ?? '').toLowerCase() === scope.railwayType &&
    (item.dimension ?? null) === (scope.dimension ?? null)
  )
}

function removeSelected(id: string) {
  selected.items = selected.items.filter((it) => it.id !== id) as any
}

function addSelected(item: RailwayRoute | RailwayEntity) {
  if (!isSameScope(item)) return
  if (selected.items.some((it) => it.id === item.id)) return
  selected.items.push(item)
}

const search = reactive({
  term: '',
  loading: false,
  results: [] as Array<RailwayRoute | RailwayEntity>,
  pagination: { total: 0, page: 1, pageSize: 10, pageCount: 1 },
})

async function performSearch(page = 1) {
  const keyword = search.term.trim()
  if (!keyword || !action.value) {
    search.results = []
    search.pagination = { total: 0, page: 1, pageSize: 10, pageCount: 1 }
    return
  }
  search.loading = true
  try {
    if (action.value === 'system' || action.value === 'merge-route') {
      const res = await railwayStore.searchRoutes({
        search: keyword,
        page,
        pageSize: search.pagination.pageSize,
      })
      search.results = (res.items ?? []).filter(
        (it) => String(it.railwayType ?? '').toLowerCase() !== 'local',
      )
      search.pagination = res.pagination
    } else if (action.value === 'merge-station') {
      const res = await railwayStore.fetchStationList({
        search: keyword,
        page,
        pageSize: search.pagination.pageSize,
      })
      search.results = (res.items ?? []).filter(
        (it) => String(it.railwayType ?? '').toLowerCase() !== 'local',
      )
      search.pagination = res.pagination
    } else {
      const res = await railwayStore.fetchDepotList({
        search: keyword,
        page,
        pageSize: search.pagination.pageSize,
      })
      search.results = (res.items ?? []).filter(
        (it) => String(it.railwayType ?? '').toLowerCase() !== 'local',
      )
      search.pagination = res.pagination
    }
  } finally {
    search.loading = false
  }
}

function goNext() {
  const order = stepperItems.value.map((i) => i.value)
  const idx = order.indexOf(activeSection.value)
  if (idx < 0 || idx >= order.length - 1) return

  if (activeSection.value === 'choose') {
    if (!action.value) {
      toast.add({ title: '请先选择要创建的类型', color: 'red' })
      return
    }
  }
  if (activeSection.value === 'basic') {
    if (!basic.name.trim()) {
      toast.add({ title: '请填写名称', color: 'red' })
      return
    }
    if (action.value?.startsWith('merge') && selected.items.length < 2) {
      // merge requires >=2 but we check again on review
    }
  }

  activeSection.value = order[idx + 1]
}

function goPrev() {
  const order = stepperItems.value.map((i) => i.value)
  const idx = order.indexOf(activeSection.value)
  if (idx <= 0) return
  activeSection.value = order[idx - 1]
}

const submitting = ref(false)

async function handleSubmit() {
  if (!action.value) return
  if (!basic.name.trim()) {
    toast.add({ title: '请填写名称', color: 'red' })
    return
  }
  if (!selected.items.length) {
    toast.add({ title: '请至少选择一条数据', color: 'red' })
    return
  }

  submitting.value = true
  try {
    if (action.value === 'system') {
      const payload = {
        name: basic.name.trim(),
        englishName: basic.englishName.trim() || null,
        routes: selected.items.map((it) => ({
          entityId: it.id,
          railwayType: it.railwayType,
          serverId: it.server.id,
          dimension: it.dimension ?? null,
        })),
      }
      const created = await systemsStore.createSystem(payload as any)
      localOpen.value = false
      router.push({
        name: 'transportation.railway.system.detail',
        params: { systemId: created.id },
      })
      return
    }

    if (selected.items.length < 2) {
      toast.add({ title: '合并至少需要选择 2 条数据', color: 'red' })
      return
    }

    const colorRaw = basic.colorText.trim()
    const color = colorRaw ? Number.parseInt(colorRaw, 10) : null
    if (colorRaw && !Number.isFinite(color)) {
      toast.add({ title: '颜色必须是数字', color: 'red' })
      return
    }

    const entityType =
      action.value === 'merge-route'
        ? 'ROUTE'
        : action.value === 'merge-station'
          ? 'STATION'
          : 'DEPOT'

    const mergePayload: RailwayManualMergeCreatePayload = {
      entityType,
      name: basic.name.trim(),
      englishName: basic.englishName.trim() || null,
      color,
      members: selected.items.map((it) => ({
        entityId: it.id,
        railwayType: it.railwayType,
        serverId: it.server.id,
        dimension: it.dimension ?? null,
      })),
    }

    const created = await railwayStore.createManualMerge(mergePayload)
    localOpen.value = false

    if (entityType === 'ROUTE') {
      router.push({
        name: 'transportation.railway.route.local',
        params: { routeId: created.id },
      })
      return
    }
    if (entityType === 'STATION') {
      router.push({
        name: 'transportation.railway.station.local',
        params: { stationId: created.id },
      })
      return
    }
    router.push({
      name: 'transportation.railway.depot.local',
      params: { depotId: created.id },
    })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '提交失败',
      color: 'red',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    :open="localOpen"
    @update:open="(v) => (localOpen = v)"
    :ui="{ content: 'w-full max-w-3xl w-[calc(100vw-2rem)]' }"
    title="添加信息"
    description="创建线路系统或手动合并线路/车站/车厂。"
  >
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
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
              添加信息
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

        <div class="grid gap-6 p-6 md:grid-cols-[240px,1fr] overflow-auto">
          <UStepper v-model="activeSection" :items="stepperItems" />

          <div class="space-y-6">
            <div v-if="activeSection === 'choose'" class="space-y-4">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                  >
                    <UIcon name="i-lucide-plus" class="h-6 w-6 text-sky-500" />
                  </div>
                  <div>
                    <div
                      class="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      选择创建类型
                    </div>
                    <div class="text-sm text-slate-500 dark:text-slate-400">
                      先选一个入口，再按步骤填写信息与选择数据。
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div
                  class="text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  选择要创建的内容
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    class="group rounded-2xl border px-4 py-4 text-left transition"
                    :class="
                      action === 'system'
                        ? 'border-sky-400/60 bg-sky-50/60 dark:border-sky-500/40 dark:bg-sky-900/20'
                        : 'border-slate-200/70 bg-white hover:bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-800/40 dark:hover:bg-slate-800/60'
                    "
                    @click="action = 'system'"
                    :disabled="Boolean(props.initialAction)"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        <UIcon name="i-lucide-layout-grid" class="h-5 w-5" />
                      </div>
                      <div class="min-w-0">
                        <div
                          class="text-sm font-semibold text-slate-900 dark:text-white"
                        >
                          铁路线路系统
                        </div>
                        <div
                          class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                        >
                          选择多条线路组成系统，组合地图与预览。
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    class="group rounded-2xl border px-4 py-4 text-left transition"
                    :class="
                      action === 'merge-route'
                        ? 'border-sky-400/60 bg-sky-50/60 dark:border-sky-500/40 dark:bg-sky-900/20'
                        : 'border-slate-200/70 bg-white hover:bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-800/40 dark:hover:bg-slate-800/60'
                    "
                    @click="action = 'merge-route'"
                    :disabled="Boolean(props.initialAction)"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        <UIcon name="i-lucide-git-merge" class="h-5 w-5" />
                      </div>
                      <div class="min-w-0">
                        <div
                          class="text-sm font-semibold text-slate-900 dark:text-white"
                        >
                          铁路线路（手动合并）
                        </div>
                        <div
                          class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                        >
                          合并多条源线路为一个本地 UUID 线路。
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div v-else-if="activeSection === 'basic'" class="space-y-4">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
              >
                <div
                  class="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  填写基础信息
                </div>
                <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  这些信息会用于列表展示与详情页标题。
                </div>
              </div>

              <div class="space-y-3">
                <div
                  class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        名称
                      </div>
                      <div
                        class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                      >
                        必填，用于显示与搜索。
                      </div>
                    </div>
                    <UIcon
                      name="i-lucide-text"
                      class="h-5 w-5 text-slate-400"
                    />
                  </div>
                  <div class="mt-3">
                    <UInput v-model="basic.name" placeholder="填写名称" />
                  </div>
                </div>

                <div
                  class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        英文名（可选）
                      </div>
                      <div
                        class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                      >
                        可选，用于国际化展示。
                      </div>
                    </div>
                    <UIcon
                      name="i-lucide-languages"
                      class="h-5 w-5 text-slate-400"
                    />
                  </div>
                  <div class="mt-3">
                    <UInput
                      v-model="basic.englishName"
                      placeholder="填写英文名（可选）"
                    />
                  </div>
                </div>

                <div
                  v-if="action?.startsWith('merge')"
                  class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        颜色（可选）
                      </div>
                      <div
                        class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                      >
                        十进制整数（例如：16711680 表示红色）。
                      </div>
                    </div>
                    <UIcon
                      name="i-lucide-palette"
                      class="h-5 w-5 text-slate-400"
                    />
                  </div>
                  <div class="mt-3">
                    <UInput
                      v-model="basic.colorText"
                      type="number"
                      placeholder="颜色（十进制，可选）"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeSection === 'select'" class="space-y-4">
              <div class="space-y-3">
                <div
                  class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        搜索并添加数据
                      </div>
                      <div
                        class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                      >
                        输入关键词搜索，然后将数据添加到右侧已选择列表。
                      </div>
                    </div>
                    <UIcon
                      name="i-lucide-search"
                      class="h-5 w-5 text-slate-400"
                    />
                  </div>

                  <div class="mt-3 space-y-2">
                    <div class="flex items-center gap-2">
                      <UInput
                        v-model="search.term"
                        placeholder="输入关键词搜索"
                        class="flex-1"
                        @keyup.enter="performSearch(1)"
                      />
                      <UButton
                        color="primary"
                        :loading="search.loading"
                        @click="performSearch(1)"
                      >
                        搜索
                      </UButton>
                    </div>

                    <div class="space-y-2">
                      <div
                        v-for="item in search.results"
                        :key="item.id"
                        class="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm dark:border-slate-800/60 dark:bg-slate-800/40"
                        :class="isSameScope(item) ? '' : 'opacity-60'"
                      >
                        <div class="min-w-0">
                          <div class="truncate text-slate-900 dark:text-white">
                            {{
                              item.name?.split('||')[0].split('|')[0] || item.id
                            }}
                          </div>
                          <div
                            class="text-xs text-slate-500 dark:text-slate-400"
                          >
                            {{ item.server.name }} · {{ item.railwayType }} ·
                            {{ item.dimension ?? '主世界' }}
                          </div>
                        </div>
                        <UButton
                          size="xs"
                          color="primary"
                          variant="soft"
                          :disabled="!isSameScope(item)"
                          @click="addSelected(item)"
                        >
                          添加
                        </UButton>
                      </div>

                      <div
                        v-if="search.pagination.pageCount > 1"
                        class="flex items-center justify-between pt-2 text-xs text-slate-500 dark:text-slate-400"
                      >
                        <span>
                          第 {{ search.pagination.page }}/{{
                            search.pagination.pageCount
                          }}
                          页
                        </span>
                        <div class="flex items-center gap-2">
                          <UButton
                            size="xs"
                            variant="soft"
                            color="neutral"
                            :disabled="search.pagination.page <= 1"
                            @click="performSearch(search.pagination.page - 1)"
                          >
                            上一页
                          </UButton>
                          <UButton
                            size="xs"
                            variant="soft"
                            color="neutral"
                            :disabled="
                              search.pagination.page >=
                              search.pagination.pageCount
                            "
                            @click="performSearch(search.pagination.page + 1)"
                          >
                            下一页
                          </UButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        已选择列表
                      </div>
                      <div
                        class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                      >
                        合并至少需要选择 2 条数据；线路系统可选择 1 条或更多。
                      </div>
                    </div>
                    <UIcon
                      name="i-lucide-list-checks"
                      class="h-5 w-5 text-slate-400"
                    />
                  </div>

                  <div class="mt-3 space-y-2">
                    <div
                      v-if="selected.items.length === 0"
                      class="rounded-xl border border-dashed border-slate-200/70 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/20 dark:text-slate-400"
                    >
                      暂未选择任何数据
                    </div>
                    <div
                      v-for="item in selected.items"
                      :key="item.id"
                      class="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm dark:border-slate-800/60 dark:bg-slate-800/40"
                    >
                      <div class="min-w-0">
                        <div class="truncate text-slate-900 dark:text-white">
                          {{
                            item.name?.split('||')[0].split('|')[0] || item.id
                          }}
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">
                          {{ item.server.name }} · {{ item.railwayType }} ·
                          {{ item.dimension ?? '主世界' }}
                        </div>
                      </div>
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        icon="i-lucide-trash-2"
                        @click="removeSelected(item.id)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800/60 dark:bg-slate-800/40"
              >
                <div class="text-sm text-slate-600 dark:text-slate-300">
                  <div class="flex justify-between gap-3">
                    <span>名称</span>
                    <span class="text-slate-900 dark:text-white">
                      {{ basic.name || '—' }}
                    </span>
                  </div>
                  <div class="mt-2 flex justify-between gap-3">
                    <span>英文名</span>
                    <span class="text-slate-900 dark:text-white">
                      {{ basic.englishName || '—' }}
                    </span>
                  </div>
                  <div
                    v-if="action?.startsWith('merge')"
                    class="mt-2 flex justify-between gap-3"
                  >
                    <span>颜色</span>
                    <span class="text-slate-900 dark:text-white">
                      {{ basic.colorText || '—' }}
                    </span>
                  </div>
                  <div class="mt-2 flex justify-between gap-3">
                    <span>已选择</span>
                    <span class="text-slate-900 dark:text-white">
                      {{ selected.items.length }} 条
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="activeSection === stepperItems[0].value"
                @click="goPrev"
              >
                上一步
              </UButton>

              <div class="flex items-center gap-2">
                <UButton
                  v-if="activeSection !== 'review'"
                  color="primary"
                  @click="goNext"
                >
                  下一步
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  :loading="submitting"
                  @click="handleSubmit"
                >
                  提交
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
