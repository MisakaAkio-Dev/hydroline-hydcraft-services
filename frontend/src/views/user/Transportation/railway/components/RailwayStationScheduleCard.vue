<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'

const props = defineProps<{
  stationId: string
  serverId: string
  railwayType: string
}>()

type ScheduleItem = {
  routeName: string
  route: string
  color: number
  destination: string
  circular: string
  routeId: string | number
  arrivalMillis: number
  trainCars: number
  currentStationIndex: number
  platform?: string
}

const store = useTransportationRailwayStore()
const loading = ref(true)
const error = ref<string | null>(null)
const schedule = ref<ScheduleItem[]>([])
const now = ref(Date.now())
const failCount = ref(0)

let timerInterval: number | null = null
let pollingInterval: number | null = null

const fetchSchedule = async (isPolling = false) => {
  if (!isPolling) loading.value = true
  if (!isPolling) error.value = null
  try {
    const data = await store.fetchStationSchedule({
      id: props.stationId,
      serverId: props.serverId,
      railwayType: props.railwayType,
    })
    schedule.value = data
    failCount.value = 0
    error.value = null
  } catch (e) {
    console.error(e)
    failCount.value++
    if (!isPolling || failCount.value > 5) {
      error.value = '时刻表加载失败'
    }
  } finally {
    if (!isPolling) loading.value = false
  }
}

watch(
  () => [props.stationId, props.serverId, props.railwayType],
  () => {
    fetchSchedule()
  },
)

onMounted(() => {
  fetchSchedule()

  const updateTimer = () => {
    now.value = Date.now()
    timerInterval = requestAnimationFrame(updateTimer)
  }
  timerInterval = requestAnimationFrame(updateTimer)

  pollingInterval = window.setInterval(() => {
    fetchSchedule(true)
  }, 5000)
})

onUnmounted(() => {
  if (timerInterval) cancelAnimationFrame(timerInterval)
  if (pollingInterval) clearInterval(pollingInterval)
})

function colorToHex(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '#cccccc'
  const sanitized = Math.max(0, Math.floor(value))
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`
}

function formatTime(seconds: number) {
  if (seconds < 0) return ''
  if (seconds >= 3600) {
    return (
      Math.floor(seconds / 3600) +
      ':' +
      ('0' + Math.floor((seconds % 3600) / 60)).slice(-2) +
      ':' +
      ('0' + Math.floor(seconds % 60)).slice(-2)
    )
  } else {
    return (
      Math.floor(seconds / 60) +
      ':' +
      ('0' + Math.floor(seconds % 60)).slice(-2)
    )
  }
}

const displayItems = computed(() => {
  return schedule.value
    .map((item) => {
      const arrivalDifference = Math.floor(
        (item.arrivalMillis - now.value) / 1000,
      )

      // Parse names like "English|Chinese"
      const routeNameParts = (item.routeName || '').split('||')[0].split('|')
      const routeName = routeNameParts[0]
      const routeNameSub = routeNameParts[1] || ''

      const routeNumberParts = (item.route || '').split('|')
      const routeNumber = routeNumberParts[0]

      const destinationParts = (item.destination || '').split('|')
      const destination = destinationParts[0]

      return {
        ...item,
        arrivalDifference,
        displayTime: arrivalDifference < 0 ? '' : formatTime(arrivalDifference),
        routeNameDisplay: routeName,
        routeNameSubDisplay: routeNameSub,
        routeNumberDisplay: routeNumber,
        destinationDisplay: destination,
        hexColor: colorToHex(item.color),
      }
    })
    .sort((a, b) => a.arrivalMillis - b.arrivalMillis)
})
</script>

<template>
  <div>
    <h3
      class="flex items-center justify-between text-lg text-slate-600 dark:text-slate-300"
    >
      时刻表
      <span class="ml-2 text-xs text-slate-400 dark:text-slate-500">
        实时数据
      </span>
    </h3>

    <div
      class="mt-3 relative rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 overflow-hidden"
    >
      <div
        v-if="loading && !schedule.length"
        class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm z-10"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="h-6 w-6 animate-spin text-slate-400"
        />
      </div>

      <div v-if="error" class="p-4 text-center text-sm text-red-500">
        {{ error }}
      </div>

      <div
        v-else-if="!schedule.length && !loading"
        class="text-center text-sm text-slate-500"
      >
        暂无班次信息
      </div>

      <div v-else class="divide-y divide-slate-100 dark:divide-slate-800/60">
        <div
          v-for="item in displayItems"
          :key="`${item.routeId}-${item.arrivalMillis}`"
          class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
        >
          <div class="flex items-center gap-3 overflow-hidden">
            <div
              class="shrink-0 w-1.5 h-10 rounded-full"
              :style="{ backgroundColor: item.hexColor }"
            ></div>

            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="font-semibold text-slate-900 dark:text-white truncate"
                >
                  {{ item.routeNumberDisplay }}
                </span>
                <span
                  class="text-sm text-slate-600 dark:text-slate-300 truncate"
                >
                  {{ item.destinationDisplay }}
                </span>
                <UIcon
                  v-if="item.circular === 'cw'"
                  name="i-lucide-rotate-cw"
                  class="h-3.5 w-3.5 text-slate-400"
                />
                <UIcon
                  v-else-if="item.circular === 'ccw'"
                  name="i-lucide-rotate-ccw"
                  class="h-3.5 w-3.5 text-slate-400"
                />
              </div>
              <div
                class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
              >
                <span class="truncate">{{ item.routeNameDisplay }}</span>
                <span
                  v-if="item.platform"
                  class="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono"
                >
                  {{ item.platform.split('||')[0].split('|')[0] }}
                </span>
                <span
                  v-if="item.trainCars"
                  class="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
                >
                  {{ item.trainCars }} 节
                </span>
              </div>
            </div>
          </div>

          <div class="text-right shrink-0 ml-4">
            <div
              class="text-lg font-mono font-medium text-slate-900 dark:text-white"
            >
              {{ item.displayTime }}
            </div>
            <Transition
              mode="out-in"
              enter-active-class="transition-all duration-500 ease-out"
              enter-from-class="opacity-0 blur-sm"
              enter-to-class="opacity-100 blur-0"
              leave-active-class="transition-all duration-500 ease-in"
              leave-from-class="opacity-100 blur-0"
              leave-to-class="opacity-0 blur-sm"
            >
              <div
                v-if="item.arrivalDifference < 0"
                class="text-xs text-green-400"
                key="arrived"
              >
                已到站
              </div>
              <div v-else class="text-xs text-slate-400" key="arriving">
                后到达
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Loading overlay for polling updates if needed, or just keep it subtle -->
      <!-- User asked for "blur background + uicon ilucideloader" similar to logs -->
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="loading && schedule.length > 0"
          class="m-2 absolute inset-0 rounded-xl bg-white/60 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center z-20"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="h-5 w-5 animate-spin text-slate-400"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>
