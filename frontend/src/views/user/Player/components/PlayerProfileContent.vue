<script setup lang="ts">
import { computed } from 'vue'
import type {
  PlayerActionsResponse,
  PlayerLoginCluster,
  PlayerLoginMap,
  PlayerMinecraftResponse,
  PlayerStatsResponse,
  PlayerSummary,
  PortalOwnershipOverview,
} from '@/types/portal'

const props = defineProps<{
  isViewingSelf: boolean
  summary: PlayerSummary | null
  loginMap: PlayerLoginMap | null
  loginClusters: PlayerLoginCluster[]
  actions: PlayerActionsResponse | null
  ownership: PortalOwnershipOverview | null
  minecraft: PlayerMinecraftResponse | null
  stats: PlayerStatsResponse | null
  statsPeriod: string
  formatDateTime: (value: string | null | undefined) => string
  formatMetricValue: (value: number, unit: string) => string
  markerStyle: (cluster: PlayerLoginCluster) => { left: string; top: string }
}>()

const emit = defineEmits<{
  (e: 'update:statsPeriod', value: string): void
  (e: 'refresh-actions', page: number): void
  (e: 'authme-reset'): void
  (e: 'force-login'): void
  (e: 'open-permission-dialog'): void
  (e: 'open-restart-dialog'): void
}>()

const statsPeriodModel = computed({
  get: () => props.statsPeriod,
  set: (value: string) => emit('update:statsPeriod', value),
})
</script>

<template>
  <div class="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
    <div class="space-y-6">
      <div
        v-if="props.isViewingSelf"
        class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70"
      >
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          档案概要
        </p>
        <div v-if="props.summary" class="space-y-3">
          <div class="flex items-center gap-4">
            <img
              :src="
                props.summary.minecraftProfiles[0]?.nickname
                  ? `https://mc-heads.net/avatar/${
                      props.summary.minecraftProfiles[0]?.nickname
                    }/64`
                  : 'https://mc-heads.net/avatar/Steve/64'
              "
              :alt="props.summary.displayName ?? props.summary.email"
              class="h-16 w-16 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
            />
            <div>
              <p class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ props.summary.displayName || props.summary.email }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                PIIC：{{ props.summary.piic || '未分配' }}
              </p>
            </div>
          </div>
          <dl
            class="grid grid-cols-1 gap-3 text-sm text-slate-700 dark:text-slate-200"
          >
            <div>
              <dt class="text-xs text-slate-500 dark:text-slate-400">
                注册时间
              </dt>
              <dd>{{ props.formatDateTime(props.summary.createdAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-500 dark:text-slate-400">
                最近登录
              </dt>
              <dd>
                {{ props.formatDateTime(props.summary.lastLoginAt) }}
                <span
                  v-if="props.summary.lastLoginLocation"
                  class="text-xs text-slate-500 dark:text-slate-400"
                >
                  · {{ props.summary.lastLoginLocation }}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        <USkeleton v-else class="h-32 w-full" />
      </div>

      <div class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            登录地图
          </p>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {{ props.loginMap?.range.from }} - {{ props.loginMap?.range.to }}
          </span>
        </div>
        <div
          class="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:border-slate-800/70 dark:from-slate-800 dark:to-slate-900"
        >
          <div
            class="relative h-56 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,_#cbd5f5,_transparent_60%),radial-gradient(circle_at_bottom,_#f1f5ff,_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_#1e293b,_transparent_60%),radial-gradient(circle_at_bottom,_#0f172a,_transparent_55%)]"
          >
            <div
              v-for="cluster in props.loginClusters"
              :key="cluster.id"
              class="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-primary-500/80 text-xs font-semibold text-white shadow"
              :style="props.markerStyle(cluster)"
            >
              {{ cluster.count }}
            </div>
          </div>
          <ul class="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li
              v-for="cluster in props.loginClusters.slice(0, 4)"
              :key="cluster.id"
              class="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 shadow-sm dark:bg-slate-900/60"
            >
              <span>
                {{
                  cluster.city || cluster.province || cluster.country || '未知'
                }}
              </span>
              <span class="font-semibold text-slate-900 dark:text-white">
                {{ cluster.count }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          操作记录
        </p>
        <div v-if="props.actions?.items.length" class="space-y-3 text-sm">
          <div
            v-for="item in props.actions.items"
            :key="item.id"
            class="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800/70"
          >
            <p class="font-semibold text-slate-900 dark:text-white">
              {{ item.action }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ props.formatDateTime(item.createdAt) }}
            </p>
            <p
              v-if="item.reason"
              class="text-xs text-slate-600 dark:text-slate-300"
            >
              {{ item.reason }}
            </p>
          </div>
          <UButton
            v-if="
              props.actions?.pagination.pageCount &&
              props.actions.pagination.page < props.actions.pagination.pageCount
            "
            block
            variant="ghost"
            color="neutral"
            @click="emit('refresh-actions', props.actions.pagination.page + 1)"
          >
            查看更多
          </UButton>
        </div>
        <p
          v-else
          class="text-center text-sm text-slate-500 dark:text-slate-400"
        >
          暂无操作记录
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <div class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          名下资产
        </p>
        <div v-if="props.ownership" class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              AuthMe 绑定
            </p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.authmeBindings }}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Minecraft 档案
            </p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.minecraftProfiles }}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">公司/铁路</p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.companyCount + props.ownership.railwayCount }}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">角色授权</p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.roleAssignments }}
            </p>
          </div>
        </div>
        <USkeleton v-else class="h-28 w-full" />
      </div>

      <div class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            服务器账户
          </p>
          <UBadge color="primary" variant="soft">
            {{ props.minecraft?.permissionRoles.length ?? 0 }} 权限组
          </UBadge>
        </div>
        <div v-if="props.minecraft" class="space-y-4">
          <div
            v-for="binding in props.minecraft.bindings"
            :key="binding.id"
            class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800/70"
          >
            <p class="font-semibold text-slate-900 dark:text-white">
              {{ binding.username }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              绑定时间：{{ props.formatDateTime(binding.boundAt) }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="role in props.minecraft.permissionRoles"
              :key="role.id"
              color="neutral"
              variant="soft"
            >
              {{ role.name || role.key }}
            </UBadge>
          </div>
        </div>
        <USkeleton v-else class="h-32 w-full" />
      </div>

      <div class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            统计信息
          </p>
          <USelectMenu
            v-model="statsPeriodModel"
            :options="[
              { label: '近 30 天', value: '30d' },
              { label: '近 7 天', value: '7d' },
              { label: '全部', value: 'all' },
            ]"
            class="w-28"
          />
        </div>
        <div v-if="props.stats" class="grid gap-4 md:grid-cols-2">
          <div
            v-for="metric in props.stats.metrics"
            :key="metric.id"
            class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800/70"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ metric.label }}
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              {{ props.formatMetricValue(metric.value, metric.unit) }}
            </p>
          </div>
        </div>
        <USkeleton v-else class="h-28 w-full" />
      </div>

      <div class="bg-white/85 shadow-sm backdrop-blur dark:bg-slate-900/70">
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          自助操作
        </p>
        <div class="grid gap-3 md:grid-cols-2">
          <UButton color="primary" variant="soft" @click="emit('authme-reset')">
            AuthMe 密码重置
          </UButton>
          <UButton color="primary" variant="ghost" @click="emit('force-login')">
            强制登陆
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            @click="emit('open-permission-dialog')"
          >
            权限组调整申请
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="emit('open-restart-dialog')"
          >
            炸服重启申请
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
