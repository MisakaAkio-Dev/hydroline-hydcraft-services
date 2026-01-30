<script setup lang="ts">
import { computed } from 'vue'
import type {
  RailwayCurveParameters,
  RailwayRouteGeometryRegenerateResult,
} from '@/types/transportation'

const props = defineProps<{
  result: RailwayRouteGeometryRegenerateResult | null
}>()

const routeGeometryRows = computed(() => {
  const result = props.result
  if (!result) return []
  const rows: Array<{ label: string; value: string }> = []
  const push = (label: string, value: string) => {
    rows.push({ label, value })
  }
  push('状态', formatValue(result.status))
  push('错误信息', formatValue(result.errorMessage))
  push('线路 ID', formatValue(result.routeId))
  push('服务器 ID', formatValue(result.serverId))
  push('铁路类型', formatValue(result.railwayType))
  push('维度', formatValue(result.dimension))
  push('维度上下文', formatValue(result.dimensionContext))
  push('指纹', formatValue(result.fingerprint))
  push('路径来源', formatValue(result.source))
  push('已写入快照', formatValue(result.persisted))

  push('报告: 点数量', formatValue(result.report.pointCount))
  push('报告: 节点数量', formatValue(result.report.pathNodeCount))
  push('报告: 片段数量', formatValue(result.report.pathEdgeCount))
  push('报告: 停靠点数量', formatValue(result.report.stopCount))
  push('报告: 边界', formatBounds(result.report.bounds))

  if (result.snapshot) {
    push('快照: 状态', formatValue(result.snapshot.status))
    push('快照: 错误信息', formatValue(result.snapshot.errorMessage))
    push('快照: 生成时间', formatValue(result.snapshot.generatedAt))
    push('快照: 指纹', formatValue(result.snapshot.sourceFingerprint))
    push('快照: 路径数量', formatValue(result.snapshot.geometryPathCount))
    push('快照: 点数量', formatValue(result.snapshot.geometryPointCount))
    push('快照: 停靠点数量', formatValue(result.snapshot.stopCount))
    push('快照: 节点数量', formatValue(result.snapshot.pathNodeCount))
    push('快照: 片段数量', formatValue(result.snapshot.pathEdgeCount))
    push('快照: 边界', formatBounds(result.snapshot.bounds))
  }

  push('数据集: 线路数量', formatValue(result.dataset.routeCount))
  push('数据集: 站台数量', formatValue(result.dataset.platformCount))
  push('数据集: 车站数量', formatValue(result.dataset.stationCount))
  push('数据集: 轨道数量', formatValue(result.dataset.railCount))

  return rows
})

const curveDiagnostics = computed(() => props.result?.curveDiagnostics ?? null)

const missingCurveSegments = computed(
  () => props.result?.missingCurveSegments ?? [],
)

const routeDiagnostics = computed(() => props.result?.routeDiagnostics ?? null)

const platformDiagnostics = computed(
  () => props.result?.platformDiagnostics ?? [],
)

const routeIds = computed(() => props.result?.routeIds ?? [])
const platformIds = computed(() => props.result?.platformIds ?? [])
const railIds = computed(() => props.result?.railIds ?? [])
const fallbackDiagnostics = computed(
  () => props.result?.fallbackDiagnostics ?? null,
)

function formatBounds(
  bounds:
    | {
        xMin: number
        xMax: number
        zMin: number
        zMax: number
      }
    | null
    | undefined,
) {
  if (!bounds) return '—'
  return `x: ${bounds.xMin} ~ ${bounds.xMax}, z: ${bounds.zMin} ~ ${bounds.zMax}`
}

function formatValue(value: unknown) {
  if (value == null) return '—'
  if (typeof value === 'string') return value || '—'
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value, null, 2)
}

function formatCurveParams(value: RailwayCurveParameters | null | undefined) {
  if (!value) return '—'
  const entries: string[] = []
  if (value.r != null) entries.push(`r=${value.r}`)
  if (value.h != null) entries.push(`h=${value.h}`)
  if (value.k != null) entries.push(`k=${value.k}`)
  if (value.tStart != null) entries.push(`tStart=${value.tStart}`)
  if (value.tEnd != null) entries.push(`tEnd=${value.tEnd}`)
  if (value.reverse != null) entries.push(`reverse=${value.reverse}`)
  if (value.isStraight != null) entries.push(`straight=${value.isStraight}`)
  return entries.length ? entries.join(', ') : '—'
}

function formatSegmentPosition(value: { x: number; y: number; z: number }) {
  return `(${value.x}, ${value.y}, ${value.z})`
}

function formatFallbackReason(value: string) {
  switch (value) {
    case 'graph_empty':
      return '轨道图为空或未构建'
    case 'platform_nodes_missing':
      return '站台节点缺失（缺 pos_1/pos_2）'
    case 'platform_nodes_not_snapped':
      return '站台节点未能吸附到轨道图'
    case 'path_not_found':
      return '路径未找到（无法连通）'
    case 'route_platforms_disconnected':
      return '线路站台跨多个连通分量'
    default:
      return value
  }
}
</script>

<template>
  <div
    v-if="result"
    class="rounded-xl border border-slate-200/70 dark:border-slate-800"
  >
    <table class="w-full text-sm">
      <tbody>
        <tr
          v-for="row in routeGeometryRows"
          :key="row.label"
          class="border-b border-slate-100 dark:border-slate-800 last:border-b-0"
        >
          <td
            class="w-36 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400"
          >
            {{ row.label }}
          </td>
          <td
            class="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all text-slate-700 dark:text-slate-200"
          >
            {{ row.value }}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="space-y-4 p-4 border-t border-slate-100 dark:border-slate-800">
      <div
        class="rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40"
      >
        <p
          class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          Fallback 诊断
        </p>
        <div v-if="fallbackDiagnostics" class="space-y-2 text-xs">
          <div>路径来源: {{ fallbackDiagnostics.source ?? '—' }}</div>
          <div>
            轨道图存在:
            {{ fallbackDiagnostics.graphPresent ? '是' : '否' }}
          </div>
          <div>轨道图节点数: {{ fallbackDiagnostics.graphNodeCount }}</div>
          <div>轨道图边数: {{ fallbackDiagnostics.graphEdgeCount }}</div>
          <div>站台总数: {{ fallbackDiagnostics.platformCount }}</div>
          <div>
            站台有节点数: {{ fallbackDiagnostics.platformWithNodesCount }}
          </div>
          <div>
            站台缺 pos 数:
            {{ fallbackDiagnostics.platformMissingPosCount }}
          </div>
          <div>站台节点总数: {{ fallbackDiagnostics.platformNodeCount }}</div>
          <div>
            吸附成功站台数: {{ fallbackDiagnostics.snappedPlatformCount }}
          </div>
          <div>吸附节点数: {{ fallbackDiagnostics.snappedNodeCount }}</div>
          <div>
            未吸附节点数:
            {{ fallbackDiagnostics.snappedMissingNodeCount }}
          </div>
          <div>路径使用节点数: {{ fallbackDiagnostics.usedPathNodeCount }}</div>
          <div>路径片段数: {{ fallbackDiagnostics.pathSegmentCount }}</div>
          <div>连通分量数: {{ fallbackDiagnostics.graphComponentCount }}</div>
          <div>线路站台数: {{ fallbackDiagnostics.routePlatformCount }}</div>
          <div>
            线路站台缺节点数:
            {{ fallbackDiagnostics.routePlatformMissingNodes }}
          </div>
          <div>
            线路站台连通分量数:
            {{ fallbackDiagnostics.routePlatformComponentCount }}
          </div>
          <div class="font-mono break-all">
            可能原因:
            {{
              fallbackDiagnostics.reasons.length
                ? fallbackDiagnostics.reasons
                    .map((item) => formatFallbackReason(item))
                    .join('、')
                : '—'
            }}
          </div>
          <details class="mt-2">
            <summary
              class="cursor-pointer text-xs text-slate-600 dark:text-slate-300"
            >
              线路站台连通分量明细
            </summary>
            <div class="mt-2 max-h-40 overflow-auto space-y-1 font-mono">
              <div
                v-for="entry in fallbackDiagnostics.routePlatformComponents"
                :key="entry.platformId"
                class="text-xs"
              >
                {{ entry.platformId }} -> components:
                {{
                  entry.componentIds.length
                    ? entry.componentIds.join(', ')
                    : '—'
                }}, nodes:
                {{ entry.nodeIds.length ? entry.nodeIds.join(', ') : '—' }}
              </div>
            </div>
          </details>
          <details class="mt-2">
            <summary
              class="cursor-pointer text-xs text-slate-600 dark:text-slate-300"
            >
              断开段坐标点（最近节点）
            </summary>
            <div class="mt-2 max-h-40 overflow-auto space-y-2 font-mono">
              <div
                v-for="item in fallbackDiagnostics.disconnectedSegments"
                :key="`${item.fromComponent}-${item.toComponent}-${item.fromNodeId}-${item.toNodeId}`"
                class="text-xs"
              >
                C{{ item.fromComponent }} → C{{ item.toComponent }} |
                {{ item.fromNodeId }} ({{ item.from.x }}, {{ item.from.y }},
                {{ item.from.z }}) → {{ item.toNodeId }} ({{ item.to.x }},
                {{ item.to.y }}, {{ item.to.z }}) | 距离 {{ item.distance }}
              </div>
              <div
                v-if="fallbackDiagnostics.disconnectedSegments.length === 0"
                class="text-xs text-slate-500"
              >
                暂无断开段坐标点
              </div>
            </div>
          </details>
        </div>
        <p v-else class="text-xs text-slate-500">暂无 fallback 诊断信息。</p>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40"
      >
        <p
          class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          曲线诊断统计
        </p>
        <div v-if="curveDiagnostics" class="grid gap-2 md:grid-cols-2 text-xs">
          <div>总片段数: {{ curveDiagnostics.totalSegments }}</div>
          <div>包含曲线片段: {{ curveDiagnostics.segmentsWithAnyCurve }}</div>
          <div>主曲线片段: {{ curveDiagnostics.segmentsWithPrimaryCurve }}</div>
          <div>
            次曲线片段: {{ curveDiagnostics.segmentsWithSecondaryCurve }}
          </div>
          <div>无曲线片段: {{ curveDiagnostics.segmentsWithoutCurve }}</div>
          <div>标记直线: {{ curveDiagnostics.segmentsStraight }}</div>
          <div>
            垂直曲线片段: {{ curveDiagnostics.segmentsWithVerticalCurve }}
          </div>
        </div>
        <p v-else class="text-xs text-slate-500">暂无曲线统计信息。</p>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40"
      >
        <p
          class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          缺少曲线参数的片段
        </p>
        <div
          v-if="missingCurveSegments.length === 0"
          class="text-xs text-slate-500"
        >
          没有缺少曲线参数的片段。
        </div>
        <div v-else class="overflow-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500">
                <th class="py-1 pr-2">#</th>
                <th class="py-1 pr-2">起点</th>
                <th class="py-1 pr-2">终点</th>
                <th class="py-1 pr-2">Rail 类型</th>
                <th class="py-1 pr-2">模型</th>
                <th class="py-1 pr-2">运输模式</th>
                <th class="py-1 pr-2">偏好曲线</th>
                <th class="py-1 pr-2">垂直曲线</th>
                <th class="py-1 pr-2">主曲线参数</th>
                <th class="py-1 pr-2">次曲线参数</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="segment in missingCurveSegments"
                :key="`${segment.index}-${segment.start.x}-${segment.start.y}-${segment.start.z}`"
                class="border-t border-slate-100 dark:border-slate-800"
              >
                <td class="py-1 pr-2 font-mono">{{ segment.index }}</td>
                <td class="py-1 pr-2 font-mono">
                  {{ formatSegmentPosition(segment.start) }}
                </td>
                <td class="py-1 pr-2 font-mono">
                  {{ formatSegmentPosition(segment.end) }}
                </td>
                <td class="py-1 pr-2">
                  {{ segment.connection?.railType ?? '—' }}
                </td>
                <td class="py-1 pr-2">
                  {{ segment.connection?.modelKey ?? '—' }}
                </td>
                <td class="py-1 pr-2">
                  {{ segment.connection?.transportMode ?? '—' }}
                </td>
                <td class="py-1 pr-2">
                  {{ segment.connection?.preferredCurve ?? '—' }}
                </td>
                <td class="py-1 pr-2">
                  {{ segment.connection?.verticalCurveRadius ?? '—' }}
                </td>
                <td class="py-1 pr-2 font-mono">
                  {{ formatCurveParams(segment.connection?.primary ?? null) }}
                </td>
                <td class="py-1 pr-2 font-mono">
                  {{ formatCurveParams(segment.connection?.secondary ?? null) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40"
      >
        <p
          class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          线路关联站台信息
        </p>
        <div v-if="routeDiagnostics" class="space-y-3 text-xs">
          <div class="font-mono break-all">
            线路平台 ID:
            {{
              routeDiagnostics.platformIds.length
                ? routeDiagnostics.platformIds.join(', ')
                : '—'
            }}
          </div>
          <div class="font-mono break-all">
            已匹配平台 ID:
            {{
              routeDiagnostics.resolvedPlatformIds.length
                ? routeDiagnostics.resolvedPlatformIds.join(', ')
                : '—'
            }}
          </div>
          <div class="font-mono break-all">
            未匹配平台 ID:
            {{
              routeDiagnostics.missingPlatformIds.length
                ? routeDiagnostics.missingPlatformIds.join(', ')
                : '—'
            }}
          </div>
        </div>
        <div v-else class="text-xs text-slate-500">暂无站台诊断信息。</div>
        <div v-if="platformDiagnostics.length" class="mt-3 overflow-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500">
                <th class="py-1 pr-2">平台 ID</th>
                <th class="py-1 pr-2">名称</th>
                <th class="py-1 pr-2">站点 ID</th>
                <th class="py-1 pr-2">运输模式</th>
                <th class="py-1 pr-2">pos_1</th>
                <th class="py-1 pr-2">pos_2</th>
                <th class="py-1 pr-2">平台 routeIds</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="platform in platformDiagnostics"
                :key="platform.platformId"
                class="border-t border-slate-100 dark:border-slate-800"
              >
                <td class="py-1 pr-2 font-mono">
                  {{ platform.platformId }}
                </td>
                <td class="py-1 pr-2">{{ platform.name ?? '—' }}</td>
                <td class="py-1 pr-2 font-mono">
                  {{ platform.stationId ?? '—' }}
                </td>
                <td class="py-1 pr-2">
                  {{ platform.transportMode ?? '—' }}
                </td>
                <td class="py-1 pr-2">
                  {{ platform.hasPos1 ? '有' : '无' }}
                </td>
                <td class="py-1 pr-2">
                  {{ platform.hasPos2 ? '有' : '无' }}
                </td>
                <td class="py-1 pr-2 font-mono">
                  {{
                    platform.routeIds.length
                      ? platform.routeIds.join(', ')
                      : '—'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40"
      >
        <p
          class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          数据集 ID 列表
        </p>
        <div class="space-y-2 text-xs">
          <div>
            <div class="mb-1 text-slate-500">
              线路 IDs ({{ routeIds.length }})
            </div>
            <div
              class="max-h-28 overflow-auto font-mono whitespace-pre-wrap break-all"
            >
              {{ routeIds.length ? routeIds.join(', ') : '—' }}
            </div>
          </div>
          <div>
            <div class="mb-1 text-slate-500">
              站台 IDs ({{ platformIds.length }})
            </div>
            <div
              class="max-h-28 overflow-auto font-mono whitespace-pre-wrap break-all"
            >
              {{ platformIds.length ? platformIds.join(', ') : '—' }}
            </div>
          </div>
          <div>
            <div class="mb-1 text-slate-500">
              轨道 IDs ({{ railIds.length }})
            </div>
            <div
              class="max-h-28 overflow-auto font-mono whitespace-pre-wrap break-all"
            >
              {{ railIds.length ? railIds.join(', ') : '—' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="text-sm text-slate-500">暂无数据</div>
</template>
