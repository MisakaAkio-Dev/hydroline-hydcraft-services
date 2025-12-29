<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { RailwayRouteGeometryCalculate } from '@/types/transportation'

const props = defineProps<{
  calculate: RailwayRouteGeometryCalculate | null
  popoverMode: 'hover' | 'click'
}>()

const fallbackSnapshot = computed(() => props.calculate?.snapshot ?? null)
const fallbackReasons = computed(
  () => props.calculate?.fallbackDiagnostics?.reasons ?? [],
)
const fallbackSegments = computed(
  () => props.calculate?.fallbackDiagnostics?.disconnectedSegments ?? [],
)
const fallbackRawJson = computed(() => {
  if (!props.calculate) return ''
  return JSON.stringify(props.calculate, null, 2)
})

const isCritical = computed(() => {
  if (!props.calculate) return false
  if (props.calculate.status !== 'READY') return true
  const reasons = fallbackReasons.value
  return reasons.includes('path_not_found') || reasons.includes('graph_empty')
})

const fallbackTooltipText = computed(() => {
  if (!props.calculate) return '线路路径已经正常生成'
  if (!fallbackReasons.value.length) return '线路使用 fallback 记录'
  return fallbackReasons.value
    .map((item) => formatFallbackReason(item))
    .join('、')
})

const reasonExplanationMap: Record<string, string> = {
  route_platforms_disconnected:
    '线路连接跨多个连通分量：线路站台分布在多个不连通子图里，导致线路被拆成几段。',
  path_not_found:
    '路径无法连通：在当前轨道图里找不到站台间可达路径，属于直接断开。',
  graph_empty: '轨道图为空或未构建，无法进行路径连通判断。',
}

const reasonExplanations = computed(() =>
  fallbackReasons.value
    .map((reason) => reasonExplanationMap[reason])
    .filter((value): value is string => Boolean(value)),
)

const fallbackRows = computed(() => {
  const entry = props.calculate
  if (!entry) return []
  const dataset = entry.dataset ?? null
  return [
    { label: '状态', value: entry.status },
    { label: '错误信息', value: entry.errorMessage || '—' },
    { label: '路径来源', value: entry.pathSource },
    { label: '是否写入快照', value: entry.persistedSnapshot ? '是' : '否' },
    { label: '报告: 点数量', value: entry.report.pointCount },
    { label: '报告: 节点数量', value: entry.report.pathNodeCount },
    { label: '报告: 片段数量', value: entry.report.pathEdgeCount },
    { label: '数据集: 线路', value: dataset ? dataset.routeCount : '—' },
    { label: '数据集: 站台', value: dataset ? dataset.platformCount : '—' },
    { label: '数据集: 站点', value: dataset ? dataset.stationCount : '—' },
    { label: '数据集: 轨道', value: dataset ? dataset.railCount : '—' },
    { label: '快照: 状态', value: fallbackSnapshot.value?.status || '—' },
    {
      label: '快照: 生成时间',
      value: fallbackSnapshot.value?.generatedAt
        ? dayjs(fallbackSnapshot.value?.generatedAt).format(
            'YYYY-MM-DD HH:mm:ss',
          )
        : '—',
    },
    {
      label: '最后同步',
      value: entry.createdAt
        ? dayjs(entry.createdAt).format('YYYY-MM-DD HH:mm:ss')
        : '—',
    },
  ]
})

const badgeClass = computed(() =>
  isCritical.value
    ? 'border-rose-200/80 bg-rose-50 text-rose-600 dark:border-rose-500/50 dark:bg-rose-900/30 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/50'
    : 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50',
)

const reasonClass = computed(() =>
  isCritical.value
    ? 'border-rose-200/80 bg-rose-50 text-rose-600 dark:border-rose-500/50 dark:bg-rose-900/40 dark:text-rose-200'
    : 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-900/40 dark:text-amber-200',
)

function formatFallbackReason(value: string) {
  switch (value) {
    case 'graph_empty':
      return '轨道图为空或未构建'
    case 'platform_nodes_missing':
      return '站台节点缺失（缺 pos）'
    case 'platform_nodes_not_snapped':
      return '站台节点未吸附到轨道图'
    case 'path_not_found':
      return '路径无法连通'
    case 'route_platforms_disconnected':
      return '线路连接跨多个连通分量'
    default:
      return value
  }
}

function formatSegmentPosition(value: { x: number; y: number; z: number }) {
  return `(${value.x}, ${value.y}, ${value.z})`
}
</script>

<template>
  <UPopover
    v-if="calculate"
    :mode="popoverMode"
    :popper="{ placement: 'bottom-start' }"
    :portal="false"
    :ui="{ content: 'z-[1000]' }"
  >
    <span
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold cursor-pointer select-none transition"
      :class="badgeClass"
    >
      <UIcon
        :name="isCritical ? 'i-lucide-alert-triangle' : 'i-lucide-alert-circle'"
        class="h-3.5 w-3.5"
      />
      {{ isCritical ? '线路路径异常' : '线路路径警告' }}
    </span>

    <template #content>
      <div class="w-96 max-w-[90vw] space-y-3 p-4 text-xs text-slate-700">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <p class="text-base font-semibold text-slate-900 dark:text-white">
              Fallback 详细信息
            </p>
            <span
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              :class="badgeClass"
            >
              {{ isCritical ? '严重警告' : '警告' }}
            </span>
          </div>
          <p class="text-xs text-slate-500">
            警告信息：{{ fallbackTooltipText }}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div
            v-for="row in fallbackRows"
            :key="row.label"
            class="rounded-lg border border-slate-100/80 bg-slate-50/70 px-3 py-2 text-[11px] font-semibold text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-200"
          >
            <p class="text-[10px] font-semibold text-slate-500">
              {{ row.label }}
            </p>
            <p class="mt-1 text-sm font-medium text-slate-900 dark:text-white">
              {{ row.value }}
            </p>
          </div>
        </div>
        <div v-if="fallbackReasons.length" class="space-y-1">
          <p class="text-[11px] font-semibold text-slate-500">诊断原因</p>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="reason in fallbackReasons"
              :key="reason"
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
              :class="reasonClass"
            >
              {{ formatFallbackReason(reason) }}
            </span>
          </div>
        </div>
        <div v-if="fallbackSegments.length" class="space-y-1">
          <p class="text-[11px] font-semibold text-slate-500">
            断开段（{{ fallbackSegments.length }}）
          </p>
          <ul
            class="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-100/80 bg-slate-50/70 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-200"
          >
            <li
              v-for="segment in fallbackSegments"
              :key="`${segment.fromNodeId}-${segment.toNodeId}`"
              class="whitespace-nowrap"
            >
              C{{ segment.fromComponent }} → C{{ segment.toComponent }} ·
              {{ formatSegmentPosition(segment.from) }} →
              {{ formatSegmentPosition(segment.to) }} · {{ segment.distance }}m
            </li>
          </ul>
        </div>
        <div v-if="reasonExplanations.length" class="space-y-1">
          <p class="text-[11px] font-semibold text-slate-500">原因说明</p>
          <ul
            class="space-y-1 rounded-lg border border-slate-100/80 bg-slate-50/70 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-200"
          >
            <li v-for="entry in reasonExplanations" :key="entry">
              {{ entry }}
            </li>
          </ul>
        </div>
        <div v-if="fallbackRawJson" class="space-y-1">
          <p class="text-[11px] font-semibold text-slate-500">原始数据</p>
          <pre
            class="max-h-52 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border border-slate-100/80 bg-slate-50/70 p-2 text-[11px] text-slate-700 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-200"
          >
            <code>{{ fallbackRawJson }}</code>
          </pre>
        </div>
      </div>
    </template>
  </UPopover>
</template>
