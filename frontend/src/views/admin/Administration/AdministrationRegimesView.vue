<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'

type ServerSummary = {
  id: string
  name: string
}

type RegimeItem = {
  id: string
  serverId: string
  name: string
  version: number
  levelCount: number
  isActive: boolean
}

type RegimeRow = RegimeItem & { serverName: string }

const authStore = useAuthStore()
const toast = useToast()

const servers = ref<ServerSummary[]>([])
const selectedServerId = ref<string | undefined>('all')
const dialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingRegime = ref<RegimeRow | null>(null)

const regimeForm = reactive({
  serverId: '',
  name: '',
  levelCount: 3,
  activate: true,
})

const serverOptions = computed(() => [
  { value: 'all', label: '全部服务端' },
  ...servers.value.map((server) => ({
    value: server.id,
    label: server.name,
  })),
])

const createServerOptions = computed(() =>
  servers.value.map((server) => ({
    value: server.id,
    label: server.name,
  })),
)

const serverNameMap = computed(() => {
  const map = new Map<string, string>()
  servers.value.forEach((server) => map.set(server.id, server.name))
  return map
})

const token = computed(() => authStore.token)

async function fetchServers() {
  servers.value = await apiFetch<ServerSummary[]>(
    '/admin/administration/servers',
    {
      token: token.value,
    },
  )
}

const regimeRows = ref<RegimeRow[]>([])

async function refreshRegimes() {
  const serverId =
    selectedServerId.value && selectedServerId.value !== 'all'
      ? selectedServerId.value
      : undefined
  const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : ''
  const items = await apiFetch<RegimeItem[]>(
    `/admin/administration/regimes${query}`,
    { token: token.value },
  )
  regimeRows.value = items.map((item) => ({
    ...item,
    serverName: serverNameMap.value.get(item.serverId) ?? '—',
  }))
}

async function handleCreateRegime() {
  if (!regimeForm.serverId) {
    toast.add({ title: '请先选择服务端', color: 'warning' })
    return
  }
  const name = regimeForm.name.trim()
  if (!name) {
    toast.add({ title: '请输入行政制度名称', color: 'warning' })
    return
  }
  try {
    await apiFetch(
      `/admin/administration/servers/${regimeForm.serverId}/regimes`,
      {
        method: 'POST',
        token: token.value,
        body: {
          name,
          levelCount: regimeForm.levelCount,
          activate: regimeForm.activate,
        },
      },
    )
    toast.add({ title: '行政制度已创建', color: 'primary' })
    regimeForm.serverId = ''
    regimeForm.name = ''
    dialogOpen.value = false
    await refreshRegimes()
  } catch (error) {
    toast.add({ title: (error as Error).message || '创建失败', color: 'error' })
  }
}

function openCreateDialog() {
  regimeForm.serverId =
    selectedServerId.value && selectedServerId.value !== 'all'
      ? selectedServerId.value
      : ''
  dialogOpen.value = true
}

const editForm = reactive({
  name: '',
  levelCount: 1,
  activate: false,
})

function openEditDialog(regime: RegimeRow) {
  editingRegime.value = regime
  editForm.name = regime.name
  editForm.levelCount = regime.levelCount
  editForm.activate = regime.isActive
  editDialogOpen.value = true
}

async function handleEditRegime() {
  if (!editingRegime.value) return
  const name = editForm.name.trim()
  if (!name) {
    toast.add({ title: '请输入行政制度名称', color: 'warning' })
    return
  }
  try {
    await apiFetch(`/admin/administration/regimes/${editingRegime.value.id}`, {
      method: 'PATCH',
      token: token.value,
      body: {
        name,
        levelCount: editForm.levelCount,
        activate: editForm.activate,
      },
    })
    toast.add({ title: '行政制度已更新', color: 'primary' })
    editDialogOpen.value = false
    editingRegime.value = null
    await refreshRegimes()
  } catch (error) {
    toast.add({ title: (error as Error).message || '更新失败', color: 'error' })
  }
}

onMounted(() => {
  void fetchServers().then(() => {
    void refreshRegimes()
  })
})

watch(
  () => selectedServerId.value,
  () => {
    void refreshRegimes()
  },
)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          行政制度
        </h1>
        <p class="text-xs text-slate-500">设置当前服务端的行政制度。</p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="selectedServerId"
          :items="serverOptions"
          value-key="value"
          placeholder="选择服务端"
          class="w-48"
        />
        <UButton color="primary" @click="openCreateDialog">新增制度</UButton>
      </div>
    </div>

    <div
      class="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <table
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th class="px-4 py-3">服务端</th>
            <th class="px-4 py-3">制度名称</th>
            <th class="px-4 py-3">版本</th>
            <th class="px-4 py-3">级数</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="regime in regimeRows"
            :key="regime.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3 text-slate-500">
              {{ regime.serverName ?? '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900 dark:text-white">
                {{ regime.name }}
              </div>
            </td>
            <td class="px-4 py-3 text-slate-500">v{{ regime.version }}</td>
            <td class="px-4 py-3 text-slate-500">{{ regime.levelCount }}</td>
            <td class="px-4 py-3 text-slate-500">
              {{ regime.isActive ? '生效中' : '未启用' }}
            </td>
            <td class="px-4 py-3 text-right">
              <UButton
                size="xs"
                color="primary"
                variant="ghost"
                @click="openEditDialog(regime)"
              >
                编辑
              </UButton>
            </td>
          </tr>
          <tr v-if="regimeRows.length === 0">
            <td
              colspan="6"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无行政制度
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal
      v-model:open="dialogOpen"
      :ui="{ content: 'w-full max-w-xl max-h-[calc(100vh-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <div class="flex items-center justify-between gap-6 pb-3">
            <div class="space-y-1">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                新增行政制度
              </h3>
              <p class="text-xs text-slate-500">创建后可选择立即生效。</p>
            </div>
            <UButton
              type="button"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              @click="dialogOpen = false"
            />
          </div>
          <form class="space-y-4" @submit.prevent="handleCreateRegime">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">服务端</label>
              <USelectMenu
                v-model="regimeForm.serverId"
                :items="createServerOptions"
                value-key="value"
                placeholder="选择服务端"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >制度名称</label
              >
              <UInput
                v-model="regimeForm.name"
                placeholder="例如：七周目行政制度"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >层级数量</label
              >
              <UInput
                v-model.number="regimeForm.levelCount"
                type="number"
                min="1"
              />
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-600">
              <input
                id="activate-regime"
                v-model="regimeForm.activate"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
              />
              <label for="activate-regime">创建后立即激活</label>
            </div>
            <div class="flex justify-end gap-3">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                @click="dialogOpen = false"
              >
                取消
              </UButton>
              <UButton type="submit" color="primary">确认新增</UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="editDialogOpen"
      :ui="{ content: 'w-full max-w-xl max-h-[calc(100vh-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <div class="flex items-center justify-between gap-6 pb-3">
            <div class="space-y-1">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                编辑行政制度
              </h3>
              <p class="text-xs text-slate-500">
                服务端：{{ editingRegime?.serverName ?? '—' }}
              </p>
            </div>
            <UButton
              type="button"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              @click="editDialogOpen = false"
            />
          </div>
          <form class="space-y-4" @submit.prevent="handleEditRegime">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >制度名称</label
              >
              <UInput
                v-model="editForm.name"
                placeholder="例如：七周目行政制度"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >层级数量</label
              >
              <UInput
                v-model.number="editForm.levelCount"
                type="number"
                min="1"
              />
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-600">
              <input
                id="activate-regime-edit"
                v-model="editForm.activate"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
              />
              <label for="activate-regime-edit">设为当前生效制度</label>
            </div>
            <div class="flex justify-end gap-3">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                @click="editDialogOpen = false"
              >
                取消
              </UButton>
              <UButton type="submit" color="primary">保存修改</UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>
  </section>
</template>
