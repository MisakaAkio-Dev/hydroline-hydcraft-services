<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import VChart from 'vue-echarts'
import { storeToRefs } from 'pinia'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)

type StatPoint = { date: string; action: string; count: number }

const stats = ref<StatPoint[]>([])
const loading = ref(false)
const errorMessage = ref('')
const filters = reactive({
  providerKey: '',
  days: 14,
})

async function fetchStats() {
  loading.value = true
  errorMessage.value = ''
  try {
    stats.value = await oauthStore.fetchStats({
      providerKey: filters.providerKey || undefined,
      days: filters.days,
    })
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : '加载失败，请稍后再试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!oauthStore.providersLoaded) {
    void oauthStore.fetchProviders()
  }
  void fetchStats()
})

const dateLabels = computed(() => {
  const unique = Array.from(new Set(stats.value.map((item) => item.date)))
  return unique.sort()
})

const series = computed<
  Array<{ name: string; data: number[]; type: string; smooth: boolean; showSymbol: boolean }>
>(() => {
  const groups = new Map<string, number[]>()
  const labels = dateLabels.value
  for (const point of stats.value) {
    if (!groups.has(point.action)) {
      groups.set(point.action, Array(labels.length).fill(0))
    }
    const seriesValues = groups.get(point.action)!
    const dateIndex = labels.indexOf(point.date)
    if (dateIndex >= 0) {
      seriesValues[dateIndex] = Number(point.count ?? 0)
    }
  }
  return Array.from(groups.entries()).map(([action, values]) => ({
    type: 'line',
    name: action,
    smooth: true,
    showSymbol: false,
    data: values,
  }))
})

const chartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: series.value.map((entry) => entry.name), top: 0 },
  grid: { left: 40, right: 20, top: 50, bottom: 40 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: dateLabels.value.map((date) => date.slice(5)),
  },
  yAxis: {
    type: 'value',
    min: 0,
    splitLine: { lineStyle: { type: 'dashed' } },
  },
  series: series.value,
}))

const hasData = computed(() => stats.value.length > 0)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          OAuth 数据统计
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          近况概览以及不同动作的趋势变化。
        </p>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="fetchStats"
      >
        刷新
      </UButton>
    </div>

    <UCard>
      <template #header>
        <div class="grid gap-3 md:grid-cols-3">
          <USelectMenu
            v-model="filters.providerKey"
            :options="[
              { label: '全部 Provider', value: '' },
              ...providers.map((item) => ({ label: item.name, value: item.key })),
            ]"
          />
          <USelectMenu
            v-model="filters.days"
            :options="[
              { label: '近 7 天', value: 7 },
              { label: '近 14 天', value: 14 },
              { label: '近 30 天', value: 30 },
            ]"
          />
          <UButton
            color="primary"
            @click="() => {
              fetchStats()
            }"
          >
            应用筛选
          </UButton>
        </div>
      </template>

      <div v-if="loading" class="space-y-3">
        <USkeleton class="h-72 w-full rounded-xl" />
      </div>
      <div v-else-if="errorMessage" class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
        {{ errorMessage }}
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="!hasData"
          class="rounded-lg border border-dashed border-slate-200/80 px-4 py-16 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          暂无统计数据
        </div>
        <div v-else class="h-[360px]">
          <VChart :option="chartOption" autoresize />
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          <div
            v-for="seriesEntry in series"
            :key="seriesEntry.name"
            class="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div class="text-xs uppercase text-slate-500">
              {{ seriesEntry.name }}
            </div>
            <div class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
              {{
                seriesEntry.data.reduce(
                  (total: number, current: number) => total + Number(current ?? 0),
                  0,
                )
              }}
            </div>
            <div class="text-xs text-slate-500">
              最近 {{ filters.days }} 天累计
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
