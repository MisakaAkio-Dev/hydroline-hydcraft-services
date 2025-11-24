<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePlayerPortalStore } from '@/stores/playerPortal'
import { apiFetch } from '@/utils/api'
import type { PlayerLoginCluster } from '@/types/portal'
import PlayerLoginPrompt from './components/PlayerLoginPrompt.vue'
import PlayerProfileContent from './components/PlayerProfileContent.vue'
import PlayerPermissionDialog from './components/PlayerPermissionDialog.vue'
import PlayerRestartDialog from './components/PlayerRestartDialog.vue'

const auth = useAuthStore()
const playerStore = usePlayerPortalStore()
const route = useRoute()
const statsPeriod = ref('30d')
const serverOptions = ref<Array<{ id: string; displayName: string }>>([])
const permissionDialog = reactive({
  open: false,
  targetGroup: '',
  reason: '',
})
const restartDialog = reactive({
  open: false,
  serverId: '',
  reason: '',
})
const actionsPage = ref(1)
const toast = useToast()

const targetPlayerParam = computed(() => {
  const param = route.params.playerId
  if (Array.isArray(param)) {
    return param[0] ?? null
  }
  return (param as string | undefined) ?? null
})

const canViewProfile = computed(
  () => Boolean(targetPlayerParam.value) || auth.isAuthenticated,
)

const isViewingSelf = computed(() => {
  if (!auth.user?.id || !playerStore.targetUserId) {
    return false
  }
  return auth.user.id === playerStore.targetUserId
})

const summary = computed(() => playerStore.summary)
const ownership = computed(() => summary.value?.ownership ?? null)
const loginMap = computed(() => playerStore.loginMap)
const loginClusters = computed<PlayerLoginCluster[]>(
  () => playerStore.loginMap?.clusters ?? [],
)

const assets = computed(() => playerStore.assets)
const region = computed(() => playerStore.region)
const minecraft = computed(() => playerStore.minecraft)
const stats = computed(() => playerStore.stats)
const actions = computed(() => playerStore.actions)
const storeLoading = computed(() => playerStore.loading)

const regionPositions: Record<string, { x: number; y: number }> = {
  北京: { x: 70, y: 18 },
  上海: { x: 82, y: 32 },
  广东: { x: 68, y: 58 },
  江苏: { x: 80, y: 30 },
  浙江: { x: 82, y: 38 },
  湖北: { x: 70, y: 38 },
  湖南: { x: 66, y: 45 },
  四川: { x: 58, y: 40 },
  重庆: { x: 60, y: 36 },
  天津: { x: 72, y: 20 },
  辽宁: { x: 76, y: 12 },
  陕西: { x: 60, y: 30 },
  山西: { x: 64, y: 24 },
  广西: { x: 58, y: 60 },
  云南: { x: 48, y: 58 },
  福建: { x: 78, y: 48 },
  浙江省: { x: 82, y: 38 },
  江苏省: { x: 80, y: 30 },
  Taiwan: { x: 88, y: 52 },
  日本: { x: 92, y: 28 },
  Singapore: { x: 70, y: 70 },
  UnitedStates: { x: 10, y: 30 },
}

async function loadServerOptions() {
  const publicServers = await apiFetch<{
    servers: Array<{ id: string; displayName: string }>
  }>('/portal/header/minecraft-status')
  serverOptions.value = publicServers.servers ?? []
}

async function loadProfile(actionsPageOverride?: number) {
  if (!canViewProfile.value) {
    playerStore.reset()
    return
  }
  const nextPage = actionsPageOverride ?? actionsPage.value
  actionsPage.value = nextPage
  await playerStore.fetchProfile({
    id: targetPlayerParam.value ?? undefined,
    period: statsPeriod.value,
    actionsPage: nextPage,
  })
}

onMounted(() => {
  void loadServerOptions()
  void loadProfile(1)
})

watch(
  () => [targetPlayerParam.value, statsPeriod.value],
  () => {
    actionsPage.value = 1
    void loadProfile(1)
  },
)

watch(
  () => auth.isAuthenticated,
  () => {
    if (!targetPlayerParam.value) {
      actionsPage.value = 1
      void loadProfile(1)
    }
  },
)

async function refreshActions(page = 1) {
  actionsPage.value = page
  await playerStore.fetchActions(
    actionsPage.value,
    targetPlayerParam.value ?? undefined,
  )
}

async function handleAuthmeReset() {
  try {
    await playerStore.requestAuthmeReset()
    toast.add({ title: '已提交 AuthMe 密码重置申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function handleForceLogin() {
  try {
    await playerStore.requestForceLogin()
    toast.add({ title: '已提交强制登陆申请', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function submitPermissionChange() {
  if (!permissionDialog.targetGroup.trim()) {
    toast.add({ title: '请输入目标权限组', color: 'warning' })
    return
  }
  try {
    await playerStore.requestPermissionChange(
      permissionDialog.targetGroup,
      permissionDialog.reason,
    )
    toast.add({ title: '已提交权限组调整申请', color: 'primary' })
    permissionDialog.open = false
    permissionDialog.targetGroup = ''
    permissionDialog.reason = ''
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function submitRestartRequest() {
  if (!restartDialog.serverId) {
    toast.add({ title: '请选择服务器', color: 'warning' })
    return
  }
  try {
    await playerStore.requestServerRestart(
      restartDialog.serverId,
      restartDialog.reason,
    )
    toast.add({ title: '已提交重启请求', color: 'primary' })
    restartDialog.open = false
    restartDialog.serverId = ''
    restartDialog.reason = ''
  } catch (error) {
    toast.add({
      title: '提交失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

function markerStyle(cluster: PlayerLoginCluster) {
  const key =
    cluster.province ||
    cluster.city ||
    cluster.country ||
    cluster.id ||
    'default'
  const mapped = regionPositions[key] ??
    regionPositions[key.replace(/省|市|自治区|特别行政区/g, '')] ?? {
      x: 55,
      y: 35,
    }
  return {
    left: `${mapped.x}%`,
    top: `${mapped.y}%`,
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return date.toLocaleString()
}

function formatMetricValue(value: number, unit: string) {
  if (unit === 'seconds') {
    return `${Math.round(value / 3600)} 小时`
  }
  if (unit === 'times') {
    return `${value} 次`
  }
  if (unit === 'days') {
    return `${value} 天`
  }
  return `${value}`
}
</script>

<template>
  <section class="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
    <PlayerLoginPrompt :can-view-profile="canViewProfile" />

    <PlayerProfileContent
      v-if="canViewProfile"
      :is-viewing-self="isViewingSelf"
      :summary="summary"
      :login-map="loginMap"
      :login-clusters="loginClusters"
      :actions="actions"
      :ownership="ownership"
      :minecraft="minecraft"
      :stats="stats"
      :stats-period="statsPeriod"
      :format-date-time="formatDateTime"
      :format-metric-value="formatMetricValue"
      :marker-style="markerStyle"
      @update:stats-period="statsPeriod = $event"
      @refresh-actions="refreshActions"
      @authme-reset="handleAuthmeReset"
      @force-login="handleForceLogin"
      @open-permission-dialog="permissionDialog.open = true"
      @open-restart-dialog="restartDialog.open = true"
    />

    <PlayerPermissionDialog
      :open="permissionDialog.open"
      :target-group="permissionDialog.targetGroup"
      :reason="permissionDialog.reason"
      @update:open="permissionDialog.open = $event"
      @update:target-group="permissionDialog.targetGroup = $event"
      @update:reason="permissionDialog.reason = $event"
      @submit="submitPermissionChange"
    />

    <PlayerRestartDialog
      :open="restartDialog.open"
      :server-id="restartDialog.serverId"
      :reason="restartDialog.reason"
      :server-options="serverOptions"
      @update:open="restartDialog.open = $event"
      @update:server-id="restartDialog.serverId = $event"
      @update:reason="restartDialog.reason = $event"
      @submit="submitRestartRequest"
    />
  </section>
</template>
