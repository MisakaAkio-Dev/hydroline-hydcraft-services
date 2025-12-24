<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import RailwaySystemMapPanel from '@/views/user/Transportation/railway/components/RailwaySystemMapPanel.vue'
import RailwaySystemMapFullscreenOverlay from '@/views/user/Transportation/railway/components/RailwaySystemMapFullscreenOverlay.vue'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useTransportationRailwayBindingsStore } from '@/stores/transportation/railwayBindings'
import type {
  RailwayRouteDetail,
  RailwaySystemDetail,
  RailwaySystemLogResponse,
} from '@/types/transportation'

const route = useRoute()
const router = useRouter()
const systemsStore = useTransportationRailwaySystemsStore()
const railwayStore = useTransportationRailwayStore()
const bindingStore = useTransportationRailwayBindingsStore()
const toast = useToast()

const system = ref<RailwaySystemDetail | null>(null)
const loading = ref(true)
const routeDetails = ref<RailwayRouteDetail[]>([])
const fullscreenOpen = ref(false)
const bindingPayload = ref({
  operatorCompanyIds: [] as string[],
  builderCompanyIds: [] as string[],
})
const relatedSystems = ref<Array<{ id: string; name: string }>>([])

const deleteLoading = ref(false)
const deleteModalOpen = ref(false)

const logs = ref<RailwaySystemLogResponse | null>(null)
const logLoading = ref(false)
const logError = ref<string | null>(null)
const logPage = ref(1)
const logPageSize = 8
const logContentRef = ref<HTMLElement | null>(null)
let lastLogContentHeight: number | null = null

const logPageCount = computed(() => {
  const total = logs.value?.total ?? 0
  const pageSize = logs.value?.pageSize ?? logPageSize
  return Math.max(1, Math.ceil(total / pageSize))
})

const canGoLogPrev = computed(() => (logs.value?.page ?? logPage.value) > 1)
const canGoLogNext = computed(
  () => (logs.value?.page ?? logPage.value) < logPageCount.value,
)

const systemId = computed(() => route.params.systemId as string)

const systemDimension = computed(() => {
  const context = system.value?.dimensionContext
  if (!context) return null
  const parts = context.split(':')
  return parts.length > 1 ? parts[1] : context
})

const combinedSvgEntries = computed(() => {
  return routeDetails.value
    .map((detail) => detail.route.previewSvg)
    .filter((svg): svg is string => Boolean(svg))
})

const totalLengthKm = computed(() => {
  let total = 0
  for (const detail of routeDetails.value) {
    if (detail.metadata.lengthKm) {
      total += detail.metadata.lengthKm
    }
  }
  return total > 0 ? Number(total.toFixed(2)) : null
})

async function fetchSystemDetail() {
  loading.value = true
  try {
    const detail = await systemsStore.fetchSystemDetail(systemId.value)
    system.value = detail

    if (detail.bindings) {
      bindingPayload.value = detail.bindings
    } else {
      await fetchBindings(detail)
    }

    if (detail.routeDetails) {
      routeDetails.value = detail.routeDetails
    } else {
      await fetchRouteDetails(detail)
    }

    await fetchRelatedSystems(detail)
    await fetchLogs()
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '加载失败',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

async function fetchLogs() {
  if (!systemId.value) return
  logLoading.value = true
  logError.value = null
  try {
    const result = await systemsStore.fetchSystemLogs(
      systemId.value,
      logPage.value,
      logPageSize,
    )
    logs.value = result
    logPage.value = result.page
  } catch (error) {
    logError.value = error instanceof Error ? error.message : '加载日志失败'
  } finally {
    logLoading.value = false
  }
}

function goLogPrev() {
  if (!canGoLogPrev.value) return
  logPage.value--
  void fetchLogs()
}

function goLogNext() {
  if (!canGoLogNext.value) return
  logPage.value++
  void fetchLogs()
}

function formatLogTimestamp(ts: string) {
  if (!ts) return '—'
  const d = dayjs(ts)
  if (!d.isValid()) return ts
  return d.format('YYYY-MM-DD HH:mm')
}

function goPlayerProfile(name: string | null) {
  if (!name) return
  router.push({ name: 'profile.detail', params: { name } })
}

watch(
  () => [logs.value?.page, logs.value?.entries.length] as const,
  async () => {
    await nextTick()
    const el = logContentRef.value
    if (!el) return

    const nextHeight = el.getBoundingClientRect().height
    if (lastLogContentHeight == null) {
      lastLogContentHeight = nextHeight
      return
    }
    if (Math.abs(nextHeight - lastLogContentHeight) < 1) return

    el.style.height = `${lastLogContentHeight}px`
    el.style.overflow = 'hidden'
    // force reflow
    void el.getBoundingClientRect()
    el.style.transition = 'height 200ms ease'
    el.style.height = `${nextHeight}px`

    window.setTimeout(() => {
      if (el !== logContentRef.value) return
      el.style.transition = ''
      el.style.height = ''
      el.style.overflow = ''
    }, 220)

    lastLogContentHeight = nextHeight
  },
  { flush: 'post' },
)

async function fetchRelatedSystems(detail: RailwaySystemDetail) {
  try {
    const response = await systemsStore.fetchSystems({
      serverId: detail.serverId,
      dimension: systemDimension.value ?? undefined,
      page: 1,
      pageSize: 10,
    })
    relatedSystems.value = response.items
      .filter((item) => item.id !== detail.id)
      .map((item) => ({ id: item.id, name: item.name }))
  } catch {
    relatedSystems.value = []
  }
}

async function fetchBindings(detail: RailwaySystemDetail) {
  try {
    const payload = await bindingStore.fetchBindings({
      entityType: 'SYSTEM',
      entityId: detail.id,
      serverId: detail.serverId,
      railwayType: detail.routes[0]?.railwayType ?? null,
      dimension: systemDimension.value ?? null,
    })
    bindingPayload.value = {
      operatorCompanyIds: payload.operatorCompanyIds,
      builderCompanyIds: payload.builderCompanyIds,
    }
  } catch {
    bindingPayload.value = { operatorCompanyIds: [], builderCompanyIds: [] }
  }
}

async function handleDelete() {
  deleteLoading.value = true
  try {
    await systemsStore.deleteSystem(systemId.value)
    toast.add({
      title: '删除成功',
      color: 'green',
    })
    router.push({ name: 'transportation.railway' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '删除失败',
      color: 'red',
    })
  } finally {
    deleteLoading.value = false
    deleteModalOpen.value = false
  }
}

async function fetchRouteDetails(detail: RailwaySystemDetail) {
  const results: RailwayRouteDetail[] = []
  for (const routeInfo of detail.routes) {
    try {
      const routeDetail = await railwayStore.fetchRouteDetail(
        {
          routeId: routeInfo.entityId,
          serverId: routeInfo.server.id,
          railwayType: routeInfo.railwayType.toLowerCase(),
          dimension: routeInfo.dimension ?? undefined,
        },
        true,
      )
      results.push(routeDetail)
    } catch (error) {
      // ignore single route errors
    }
  }
  routeDetails.value = results
}

watch(
  () => systemId.value,
  () => {
    void fetchSystemDetail()
  },
)

onMounted(() => {
  void fetchSystemDetail()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-1">
      <p class="text-sm uppercase text-slate-500">铁路线路系统信息</p>
      <div class="flex items-center gap-2">
        <img
          v-if="system?.logoUrl"
          :src="system.logoUrl"
          :alt="system.name"
          class="h-16 w-16 rounded-xl object-cover"
        />
        <div>
          <h1
            class="flex items-center gap-1 text-4xl font-semibold text-slate-900 dark:text-white"
            v-if="system?.name"
          >
            {{ system?.name }}
          </h1>
          <p class="text-sm text-slate-500" v-if="system?.englishName">
            {{ system?.englishName }}
          </p>
          <div v-if="relatedSystems.length" class="mt-2 flex flex-wrap gap-2">
            <span class="text-xs text-slate-400">相关线路系统：</span>
            <RouterLink
              v-for="item in relatedSystems"
              :key="item.id"
              :to="{
                name: 'transportation.railway.system.detail',
                params: { systemId: item.id },
              }"
              class="text-xs text-primary hover:underline"
            >
              {{ item.name }}
            </RouterLink>
          </div>
        </div>
      </div>
      <UButton
        size="sm"
        class="absolute left-4 top-6 md:top-10"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <div v-if="loading" class="text-sm text-slate-500">
      <UIcon name="i-lucide-loader-2" class="animate-spin" />
    </div>

    <div v-else-if="system" class="space-y-6">
      <div
        class="mt-3 relative rounded-3xl border border-slate-200/70 dark:border-slate-800"
      >
        <RailwaySystemMapPanel
          :routes="routeDetails"
          :loading="routeDetails.length === 0"
          height="520px"
        />

        <div class="pointer-events-none absolute bottom-3 left-3 z-998">
          <div
            class="rounded-lg text-xl font-semibold text-white"
            style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
          >
            <span class="text-xs mr-1">系统总长</span>
            <span>
              {{ totalLengthKm ? `${totalLengthKm} km` : '—' }}
            </span>
          </div>
        </div>

        <div
          class="pointer-events-none absolute inset-x-4 top-4 flex justify-end z-999"
        >
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            class="flex items-center gap-1 pointer-events-auto backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 hover:bg-white/10 dark:hover:bg-slate-900/20 shadow"
            @click="fullscreenOpen = true"
          >
            <UIcon name="i-lucide-maximize" class="h-3.5 w-3.5" />
            全屏
          </UButton>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-6">
          <div class="space-y-3">
            <div class="flex items-center gap-1">
              <h3 class="text-lg text-slate-600 dark:text-slate-300">
                基本信息
              </h3>
              <UButton
                v-if="system.canEdit"
                size="xs"
                variant="link"
                color="primary"
                @click="
                  router.push({
                    name: 'transportation.railway.system.edit',
                    params: { systemId: system.id },
                  })
                "
              >
                编辑
              </UButton>
              <UButton
                v-if="system.canDelete"
                size="xs"
                variant="link"
                color="red"
                @click="deleteModalOpen = true"
              >
                删除
              </UButton>
            </div>

            <div class="space-y-3">
              <div class="mt-1 flex gap-3 items-center">
                <div
                  class="h-32 w-32 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <img
                    v-if="system.logoUrl"
                    :src="system.logoUrl"
                    :alt="system.name"
                    class="h-full w-full object-cover block"
                  />
                </div>

                <div
                  class="relative h-32 w-32 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-500"
                >
                  <div
                    v-for="(svg, index) in combinedSvgEntries"
                    :key="index"
                    class="absolute inset-0 flex items-center justify-center opacity-90"
                    v-html="svg"
                  ></div>
                </div>
              </div>

              <div
                class="space-y-3 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:bg-slate-700/60 dark:text-slate-300"
              >
                <div class="flex justify-between">
                  <span>中文名</span>
                  <span class="text-slate-900 dark:text-white">{{
                    system.name
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span>英文名</span>
                  <span class="text-slate-900 dark:text-white">{{
                    system.englishName
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span>所属服务端</span>
                  <span class="text-slate-900 dark:text-white">{{
                    system.server?.name || system.serverId
                  }}</span>
                </div>

                <RailwayCompanyBindingSection
                  entity-type="SYSTEM"
                  :entity-id="system.id"
                  :server-id="system.serverId"
                  :railway-type="system.routes[0]?.railwayType ?? null"
                  :dimension="systemDimension"
                  :operator-company-ids="bindingPayload.operatorCompanyIds"
                  :builder-company-ids="bindingPayload.builderCompanyIds"
                />
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-lg text-slate-600 dark:text-slate-300">
                线路系统修改日志
              </h3>
              <div class="flex items-center gap-2">
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-chevron-left"
                  :disabled="logLoading || !canGoLogPrev"
                  @click="goLogPrev"
                >
                  上一页
                </UButton>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  第 {{ logs?.page ?? logPage }} / {{ logPageCount }} 页
                </span>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-chevron-right"
                  :disabled="logLoading || !canGoLogNext"
                  @click="goLogNext"
                >
                  下一页
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-refresh-cw"
                  :disabled="logLoading"
                  @click="fetchLogs"
                >
                  刷新
                </UButton>
              </div>
            </div>

            <div ref="logContentRef" class="relative">
              <p v-if="!logs && logLoading" class="text-sm text-slate-500">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-5 w-5 animate-spin text-slate-400"
                />
              </p>
              <p v-else-if="!logs && logError" class="text-sm text-red-500">
                {{ logError }}
              </p>
              <p
                v-else-if="!logs || logs.entries.length === 0"
                class="text-sm text-slate-500"
              >
                暂无日志记录
              </p>
              <div v-else class="space-y-3">
                <div
                  v-for="entry in logs.entries"
                  :key="entry.id"
                  class="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250 outline-2 outline-transparent hover:outline-primary"
                  @click="goPlayerProfile(entry.playerName)"
                >
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="shrink-0"
                      @click="goPlayerProfile(entry.playerName)"
                    >
                      <img
                        v-if="entry.playerAvatar"
                        :src="entry.playerAvatar"
                        class="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700"
                        alt="player avatar"
                      />
                      <div
                        v-else
                        class="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                      >
                        无
                      </div>
                    </button>
                    <div>
                      <p
                        class="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        {{ entry.playerName || '未知玩家' }}
                      </p>
                      <p class="text-xs text-slate-500">
                        {{ entry.changeType }} · {{ system?.name }}
                      </p>
                      <p class="text-xs text-slate-400">
                        {{ formatLogTimestamp(entry.timestamp) }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="space-y-3">
            <h3 class="text-lg text-slate-600 dark:text-slate-300">包含线路</h3>
            <div
              v-if="routeDetails.length === 0"
              class="text-sm text-slate-500"
            >
              暂无线路数据
            </div>
            <div
              v-else
              class="space-y-3 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
                <RouterLink
                  v-for="detail in routeDetails"
                  :key="detail.route.id"
                  :to="{
                    name: 'transportation.railway.route',
                    params: {
                      railwayType: detail.route.railwayType.toLowerCase(),
                      routeId: detail.route.id,
                    },
                    query: {
                      serverId: detail.server.id,
                      dimension: detail.dimension ?? undefined,
                    },
                  }"
                  class="flex items-center justify-between py-3 first:pt-0 last:pb-0 group"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="h-2.5 w-2.5 rounded-full"
                      :style="{
                        backgroundColor: detail.route.color
                          ? `#${(detail.route.color >>> 0)
                              .toString(16)
                              .padStart(6, '0')}`
                          : '#cbd5e1',
                      }"
                    ></div>
                    <div>
                      <div
                        class="font-medium text-slate-900 dark:text-white group-hover:underline"
                      >
                        {{ detail.route.name?.split('||')[0].split('|')[0] }}
                      </div>
                      <div class="text-xs text-slate-500">
                        {{
                          detail.metadata.lengthKm
                            ? `${detail.metadata.lengthKm} km`
                            : '—'
                        }}
                        · {{ detail.stops.length }} 站
                      </div>
                    </div>
                  </div>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="h-4 w-4 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white"
                  />
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <RailwaySystemMapFullscreenOverlay
      v-model="fullscreenOpen"
      :routes="routeDetails"
      :loading="routeDetails.length === 0"
    />

    <UModal v-model:open="deleteModalOpen">
      <template #content>
        <UCard
          :ui="{
            ring: '',
            divide: 'divide-y divide-gray-100 dark:divide-gray-800',
          }"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <h3
                class="text-base font-semibold leading-6 text-gray-900 dark:text-white"
              >
                确认删除
              </h3>
              <UButton
                color="gray"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                @click="deleteModalOpen = false"
              />
            </div>
          </template>

          <div class="p-4">
            <p class="text-sm text-gray-500">
              确定要删除线路系统
              <span class="font-bold text-gray-900 dark:text-white">{{
                system?.name
              }}</span>
              吗？此操作不可撤销。
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="gray"
                variant="ghost"
                @click="deleteModalOpen = false"
              >
                取消
              </UButton>
              <UButton
                color="red"
                :loading="deleteLoading"
                @click="handleDelete"
              >
                确认删除
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
