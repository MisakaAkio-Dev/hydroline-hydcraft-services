<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RailwayStationMapPanel from '@/views/user/Transportation/railway/components/RailwayStationMapPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayStationDetail } from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'
import modpackCreateImg from '@/assets/resources/modpacks/Create.jpg'
import modpackMtrImg from '@/assets/resources/modpacks/MTR.png'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayStationDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const params = computed(() => {
  return {
    stationId: route.params.stationId as string | undefined,
    railwayType: route.params.railwayType as string | undefined,
    serverId: route.query.serverId as string | undefined,
    dimension: (route.query.dimension as string | undefined) ?? undefined,
  }
})

const stationName = computed(
  () => detail.value?.station.name ?? detail.value?.station.id ?? '未知车站',
)
const serverBadge = computed(
  () => detail.value?.server.name ?? params.value.serverId ?? '—',
)
const dimensionName = computed(() =>
  getDimensionName(detail.value?.station.dimension || params.value.dimension),
)

const associatedRoutes = computed(() => detail.value?.routes ?? [])
const platforms = computed(() => detail.value?.platforms ?? [])

const modpackInfo = computed(() => {
  const modRaw = detail.value?.railwayType ?? params.value.railwayType
  const mod = typeof modRaw === 'string' ? modRaw.toUpperCase() : null
  if (mod === 'MTR') {
    return { label: 'MTR', image: modpackMtrImg }
  }
  if (mod === 'CREATE') {
    return { label: '机械动力', image: modpackCreateImg }
  }
  return { label: modRaw || '—', image: null as string | null }
})

const routeColor = computed(
  () => detail.value?.station.color ?? detail.value?.routes?.[0]?.color ?? null,
)
const routeColorHex = computed(() => colorToHex(routeColor.value))

function colorToHex(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null
  const sanitized = Math.max(0, Math.floor(value))
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`
}

function formatSecondsFromTicks(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  const seconds = value / 20
  const rounded = Math.round(seconds * 100) / 100
  return rounded
    .toFixed(2)
    .replace(/\.0+$/, '')
    .replace(/\.(\d*[1-9])0+$/, '.$1')
}

async function fetchDetail() {
  const { stationId, railwayType, serverId, dimension } = params.value
  if (!stationId || !railwayType || !serverId) {
    errorMessage.value = '缺少 stationId、serverId 或铁路类型参数'
    detail.value = null
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const result = await transportationStore.fetchStationDetail(
      {
        id: stationId,
        railwayType,
        serverId,
        dimension,
      },
      true,
    )
    detail.value = result
  } catch (error) {
    console.error(error)
    errorMessage.value =
      error instanceof Error ? error.message : '加载失败，请稍后再试'
    toast.add({ title: errorMessage.value, color: 'error' })
    detail.value = null
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'transportation.railway' })
}

function goRoute(routeId: string) {
  if (!detail.value) return
  router.push({
    name: 'transportation.railway.route',
    params: {
      railwayType: detail.value.railwayType.toLowerCase(),
      routeId,
    },
    query: {
      serverId: detail.value.server.id,
      dimension: detail.value.station.dimension,
    },
  })
}

watch(
  () => route.fullPath,
  () => {
    void fetchDetail()
  },
)

onMounted(() => {
  void fetchDetail()
})
</script>

<template>
  <div class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      icon="i-lucide-arrow-left"
      @click="goBack"
    >
      返回概览
    </UButton>

    <div>
      <div class="flex flex-col gap-1">
        <p class="text-sm uppercase text-slate-500">铁路车站信息</p>
        <div>
          <p class="text-4xl font-semibold text-slate-900 dark:text-white">
            {{ stationName.split('|')[0] }}

            <span class="inline-flex items-center gap-1.5">
              <UTooltip
                v-if="modpackInfo.image && modpackInfo.label"
                :text="`${modpackInfo.label} Mod`"
              >
                <img
                  :src="modpackInfo.image"
                  :alt="modpackInfo.label"
                  class="h-5 w-6 object-cover"
                />
              </UTooltip>
            </span>
          </p>
          <div class="-mt-1 flex flex-wrap items-center gap-2 text-sm">
            <UTooltip :text="`线路色 ${routeColorHex}`">
              <span
                class="block h-3 w-3 rounded-full"
                :style="
                  routeColorHex ? { backgroundColor: routeColorHex } : undefined
                "
              ></span>
            </UTooltip>

            <span
              class="text-lg font-semibold text-slate-600 dark:text-slate-300"
              v-if="stationName.split('|')[1]"
            >
              {{ stationName.split('|')[1] }}
            </span>

            <UBadge variant="soft" size="sm">{{ serverBadge }}</UBadge>
            <UBadge variant="soft" size="sm">{{
              dimensionName || '未知维度'
            }}</UBadge>
          </div>
        </div>
      </div>
    </div>

    <RailwayStationMapPanel
      :bounds="detail?.station.bounds ?? null"
      :platforms="platforms"
      :color="detail?.station.color ?? detail?.routes[0]?.color ?? null"
      :loading="loading"
      height="460px"
    />

    <div v-if="loading" class="text-sm text-slate-500">
      <UIcon
        name="i-lucide-loader-2"
        class="inline-block h-5 w-5 animate-spin text-slate-400"
      />
    </div>
    <div v-else-if="detail" class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 class="text-lg text-slate-600 dark:text-slate-300">基本信息</h3>
          <dl
            class="mt-3 space-y-2 text-sm rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
          >
            <div class="flex justify-between gap-4">
              <dt>站点 ID</dt>
              <dd class="font-mono text-slate-900 dark:text-white">
                {{ detail.station.id }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>所属服务器</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ detail.server.name }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>区域</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ detail.station.zone ?? '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>最后更新</dt>
              <dd class="text-slate-900 dark:text-white">
                {{
                  detail.metadata.lastUpdated
                    ? new Date(detail.metadata.lastUpdated).toLocaleString()
                    : '—'
                }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="space-y-6">
          <div>
            <h3 class="text-lg text-slate-600 dark:text-slate-300">服务线路</h3>
            <div
              class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <p
                v-if="associatedRoutes.length === 0"
                class="text-sm text-slate-500"
              >
                暂无线路数据
              </p>
              <div
                v-for="route in associatedRoutes"
                :key="route.id"
                class="flex items-center justify-between rounded-xl border border-slate-100/70 px-3 py-2 text-sm transition hover:border-primary-200 dark:border-slate-800/60 dark:hover:border-primary-400/60"
              >
                <div>
                  <p class="font-medium text-slate-900 dark:text-white">
                    {{ route.name || route.id }}
                  </p>
                  <p class="text-xs text-slate-500">
                    {{ route.server.name }} ·
                    {{ getDimensionName(route.dimension) || '未知维度' }}
                  </p>
                </div>
                <UButton size="xs" variant="soft" @click="goRoute(route.id)">
                  查看
                </UButton>
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-lg text-slate-600 dark:text-slate-300">站台详情</h3>
            <div
              class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
            >
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="text-slate-500">
                    <th class="py-2">站台</th>
                    <th class="py-2">停靠线路</th>
                    <th class="py-2">停留时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="platform in platforms"
                    :key="platform.id"
                    class="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200"
                  >
                    <td class="py-2 font-medium">
                      {{ platform.name || platform.id }}
                    </td>
                    <td class="py-2">
                      <div class="flex flex-wrap gap-1">
                        <UBadge
                          v-for="routeId in platform.routeIds"
                          :key="routeId"
                          size="xs"
                          variant="soft"
                        >
                          {{ routeId }}
                        </UBadge>
                      </div>
                    </td>
                    <td class="py-2">
                      <span v-if="platform.dwellTime == null">—</span>
                      <UTooltip
                        v-else
                        :text="`真实停留：${platform.dwellTime} tick`"
                      >
                        <span
                          >{{
                            formatSecondsFromTicks(platform.dwellTime)
                          }}
                          s</span
                        >
                      </UTooltip>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
