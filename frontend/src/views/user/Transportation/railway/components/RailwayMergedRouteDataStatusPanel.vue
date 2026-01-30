<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { RailwayRouteDetail } from '@/types/transportation'

dayjs.extend(relativeTime)

const props = defineProps<{
  details: RailwayRouteDetail[]
}>()

interface DataItem {
  label: string
  values: Array<{
    value: string
    routeName: string
  }>
}

// Extract route name (split('||')[1].trim('|') logic, similar to RailwayMergedRouteDetailView)
function extractRouteName(detail: RailwayRouteDetail): string {
  const raw = detail.route.name
  if (!raw) return '未知线路'
  const parts = raw.split('||')
  // Prioritize the latter part, otherwise take the former part
  const target = parts[1] || parts[0] || ''
  // Replace | with space and trim
  const finalName = target.replace(/\|/g, ' ').trim()
  return finalName || '未知线路'
}

// Collect all data items
const dataItems = computed<DataItem[]>(() => {
  const items: DataItem[] = []

  // Transport mode
  const transportModeMap = new Map<string, string[]>()
  for (const detail of props.details) {
    const value = detail.route.transportMode || '—'
    const routeName = extractRouteName(detail)
    if (!transportModeMap.has(value)) {
      transportModeMap.set(value, [])
    }
    transportModeMap.get(value)!.push(routeName)
  }
  items.push({
    label: '运输模式',
    values: Array.from(transportModeMap.entries()).map(([value, routes]) => ({
      value,
      routeName: routes.join('、'),
    })),
  })

  // Route type
  const routeTypeMap = new Map<string, string[]>()
  for (const detail of props.details) {
    const value = (detail.route.payload?.route_type as string) || '—'
    const routeName = extractRouteName(detail)
    if (!routeTypeMap.has(value)) {
      routeTypeMap.set(value, [])
    }
    routeTypeMap.get(value)!.push(routeName)
  }
  items.push({
    label: '线路类型',
    values: Array.from(routeTypeMap.entries()).map(([value, routes]) => ({
      value,
      routeName: routes.join('、'),
    })),
  })

  // Circular attribute
  const circularStateMap = new Map<string, string[]>()
  for (const detail of props.details) {
    const value = (detail.route.payload?.circular_state as string) || '—'
    const routeName = extractRouteName(detail)
    if (!circularStateMap.has(value)) {
      circularStateMap.set(value, [])
    }
    circularStateMap.get(value)!.push(routeName)
  }
  items.push({
    label: '环线属性',
    values: Array.from(circularStateMap.entries()).map(([value, routes]) => ({
      value,
      routeName: routes.join('、'),
    })),
  })

  // Light rail number
  const lightRailNumberMap = new Map<string, string[]>()
  for (const detail of props.details) {
    const raw = detail.route.payload?.light_rail_route_number
    const value =
      typeof raw === 'string' ? raw.split('|').map((p) => p.trim())[0] : '—'
    const routeName = extractRouteName(detail)
    if (!lightRailNumberMap.has(value)) {
      lightRailNumberMap.set(value, [])
    }
    lightRailNumberMap.get(value)!.push(routeName)
  }
  items.push({
    label: '轻轨编号',
    values: Array.from(lightRailNumberMap.entries()).map(([value, routes]) => ({
      value,
      routeName: routes.join('、'),
    })),
  })

  // Data updated
  const lastUpdatedMap = new Map<string, string[]>()
  for (const detail of props.details) {
    const timestamp = detail.metadata.lastUpdated
    const value = timestamp
      ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
      : '—'
    const routeName = extractRouteName(detail)
    if (!lastUpdatedMap.has(value)) {
      lastUpdatedMap.set(value, [])
    }
    lastUpdatedMap.get(value)!.push(routeName)
  }
  items.push({
    label: '数据更新',
    values: Array.from(lastUpdatedMap.entries()).map(([value, routes]) => ({
      value,
      routeName: routes.join('、'),
    })),
  })

  return items
})
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-lg text-slate-600 dark:text-slate-300">数据状态</h3>
    <div
      class="grid gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 dark:border-slate-800/60 dark:bg-slate-700/60"
    >
      <div
        v-for="item in dataItems"
        :key="item.label"
        class="flex justify-between text-sm text-slate-600 dark:text-slate-300"
      >
        <span>{{ item.label }}</span>
        <div class="flex flex-wrap gap-1.5 justify-end items-center">
          <UTooltip
            v-for="(valueItem, index) in item.values"
            :key="index"
            :text="valueItem.routeName"
          >
            <span
              class="text-slate-900 dark:text-white cursor-help"
              :class="
                item.values.length > 1 ? 'underline decoration-dotted' : ''
              "
            >
              {{ valueItem.value }}
            </span>
          </UTooltip>
          <span
            v-if="item.values.length > 1"
            class="text-xs text-slate-400 dark:text-slate-500"
          >
            ({{ item.values.length }}种)
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
