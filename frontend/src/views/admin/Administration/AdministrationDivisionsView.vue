<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'

type ServerSummary = {
  id: string
  name: string
}

type DivisionType = {
  id: string
  name: string
  suffix: string
  abbrSuffix?: string | null
  sortOrder: number
  allowedLevels: number[]
}

type DivisionItem = {
  id: string
  serverId: string
  properName: string
  fullName: string
  levelIndex: number
  parentId?: string | null
  divisionTypeId: string
  status: string
}

type DivisionRow = DivisionItem & { serverId: string; serverName: string }

const authStore = useAuthStore()
const toast = useToast()

const servers = ref<ServerSummary[]>([])
const selectedServerId = ref<string | undefined>('all')
const divisionTypes = ref<DivisionType[]>([])
const divisionTypesAll = ref<DivisionType[]>([])
const parentDivisions = ref<DivisionItem[]>([])
const divisionRows = ref<DivisionRow[]>([])
const keyword = ref('')
const dialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingDivision = ref<DivisionRow | null>(null)

const divisionForm = reactive({
  serverId: '',
  properName: '',
  divisionTypeId: '',
  parentId: '',
  levelIndex: 1,
})

const editForm = reactive({
  properName: '',
  divisionTypeId: '',
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

const divisionTypeOptions = computed(() =>
  divisionTypes.value.map((t) => ({
    value: t.id,
    label: `${t.name}（${t.suffix}）${
      t.allowedLevels.length
        ? ` · ${t.allowedLevels.map((l) => `${l}级`).join('/')}`
        : ''
    }`,
  })),
)

const divisionOptions = computed(() =>
  parentDivisions.value.map((d) => ({
    value: d.id,
    label: `${d.fullName}（${d.levelIndex}级）`,
  })),
)

const divisionTypeMap = computed(() => {
  const map = new Map<string, DivisionType>()
  divisionTypesAll.value.forEach((item) => map.set(item.id, item))
  return map
})

function divisionTypeOptionsForServer(serverId: string) {
  return divisionTypesAll.value
    .filter((item) => item.serverId === serverId)
    .map((item) => ({
      value: item.id,
      label: `${item.name}（${item.suffix}）${
        item.allowedLevels.length
          ? ` · ${item.allowedLevels.map((l) => `${l}级`).join('/')}`
          : ''
      }`,
    }))
}

const divisionMap = computed(() => {
  const map = new Map<string, DivisionRow>()
  divisionRows.value.forEach((item) => map.set(item.id, item))
  return map
})

const token = computed(() => authStore.token)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function fetchServers() {
  servers.value = await apiFetch<ServerSummary[]>(
    '/admin/administration/servers',
    {
      token: token.value,
    },
  )
}

async function fetchDivisionTypes(serverId: string) {
  divisionTypes.value = await apiFetch<DivisionType[]>(
    `/admin/administration/servers/${serverId}/division-types`,
    { token: token.value },
  )
}

async function fetchParentDivisions(serverId: string) {
  parentDivisions.value = await apiFetch<DivisionItem[]>(
    `/admin/administration/servers/${serverId}/divisions`,
    { token: token.value },
  )
}

async function fetchDivisionTypesAll() {
  divisionTypesAll.value = await apiFetch<DivisionType[]>(
    `/admin/administration/division-types`,
    { token: token.value },
  )
}

async function fetchDivisionRowsAll() {
  const queryValue = keyword.value.trim()
  const serverId =
    selectedServerId.value && selectedServerId.value !== 'all'
      ? selectedServerId.value
      : undefined
  const params = new URLSearchParams()
  if (serverId) params.set('serverId', serverId)
  if (queryValue) params.set('q', queryValue)
  const query = params.toString() ? `?${params.toString()}` : ''
  const items = await apiFetch<DivisionItem[]>(
    `/admin/administration/divisions${query}`,
    { token: token.value },
  )
  divisionRows.value = items.map((division) => ({
    ...division,
    serverName: serverNameMap.value.get(division.serverId) ?? '—',
  }))
}

async function fetchServerData(serverId: string) {
  await Promise.all([
    fetchDivisionTypes(serverId),
    fetchParentDivisions(serverId),
  ])
}

async function handleCreateDivision() {
  if (!divisionForm.serverId) {
    toast.add({ title: '请先选择服务端', color: 'warning' })
    return
  }
  if (!divisionForm.properName.trim()) {
    toast.add({ title: '请输入行政区专名', color: 'warning' })
    return
  }
  if (!divisionForm.divisionTypeId) {
    toast.add({ title: '请选择行政区类型', color: 'warning' })
    return
  }
  try {
    await apiFetch(
      `/admin/administration/servers/${divisionForm.serverId}/divisions`,
      {
        method: 'POST',
        token: token.value,
        body: {
          properName: divisionForm.properName.trim(),
          divisionTypeId: divisionForm.divisionTypeId,
          parentId: divisionForm.parentId || undefined,
          levelIndex: divisionForm.parentId
            ? undefined
            : divisionForm.levelIndex,
        },
      },
    )
    const createdServerId = divisionForm.serverId
    toast.add({ title: '行政区已创建', color: 'primary' })
    divisionForm.serverId = ''
    divisionForm.properName = ''
    divisionForm.parentId = ''
    divisionForm.levelIndex = 1
    dialogOpen.value = false
    if (createdServerId) {
      await fetchParentDivisions(createdServerId)
    }
    await fetchDivisionRowsAll()
  } catch (error) {
    toast.add({ title: (error as Error).message || '创建失败', color: 'error' })
  }
}

function openCreateDialog() {
  divisionForm.serverId =
    selectedServerId.value && selectedServerId.value !== 'all'
      ? selectedServerId.value
      : ''
  dialogOpen.value = true
}

function openEditDialog(division: DivisionRow) {
  editingDivision.value = division
  editForm.properName = division.properName
  editForm.divisionTypeId = division.divisionTypeId
  editDialogOpen.value = true
}

async function handleEditDivision() {
  if (!editingDivision.value) return
  const properName = editForm.properName.trim()
  if (!properName) {
    toast.add({ title: '请输入行政区专名', color: 'warning' })
    return
  }
  if (!editForm.divisionTypeId) {
    toast.add({ title: '请选择行政区类型', color: 'warning' })
    return
  }
  try {
    await apiFetch(
      `/admin/administration/divisions/${editingDivision.value.id}`,
      {
        method: 'PATCH',
        token: token.value,
        body: {
          properName,
          divisionTypeId: editForm.divisionTypeId,
        },
      },
    )
    toast.add({ title: '行政区已更新', color: 'primary' })
    editDialogOpen.value = false
    editingDivision.value = null
    await fetchDivisionRowsAll()
  } catch (error) {
    toast.add({ title: (error as Error).message || '更新失败', color: 'error' })
  }
}

watch(
  () => divisionForm.serverId,
  (value) => {
    if (!value) {
      divisionTypes.value = []
      parentDivisions.value = []
      divisionForm.divisionTypeId = ''
      divisionForm.parentId = ''
      divisionForm.levelIndex = 1
      return
    }
    divisionForm.divisionTypeId = ''
    divisionForm.parentId = ''
    divisionForm.levelIndex = 1
    void fetchServerData(value)
  },
)

watch(
  () => [divisionForm.parentId, divisionForm.levelIndex, divisionTypes.value],
  () => {
    if (!divisionForm.divisionTypeId) return
    const allowedIds = new Set(divisionTypeOptions.value.map((o) => o.value))
    if (!allowedIds.has(divisionForm.divisionTypeId)) {
      divisionForm.divisionTypeId = ''
    }
  },
)

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    void fetchDivisionRowsAll()
  }, 500)
}

watch(
  () => selectedServerId.value,
  (value) => {
    if (!value || value === 'all') {
      divisionTypes.value = []
      parentDivisions.value = []
      void fetchDivisionRowsAll()
      return
    }
    void fetchServerData(value)
    void fetchDivisionRowsAll()
  },
)

onMounted(() => {
  void fetchServers().then(() => {
    void fetchDivisionTypesAll()
    void fetchDivisionRowsAll()
  })
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          行政区管理
        </h1>
        <p class="text-xs text-slate-500">维护行政区树结构与归属层级。</p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="selectedServerId"
          :items="serverOptions"
          value-key="value"
          placeholder="选择服务端"
          class="w-48"
        />
        <UInput
          v-model="keyword"
          type="search"
          placeholder="搜索行政区"
          class="w-56"
          @input="debouncedSearch"
        />
        <UButton color="primary" @click="openCreateDialog">新增行政区</UButton>
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
            <th class="px-4 py-3">行政区</th>
            <th class="px-4 py-3">类型</th>
            <th class="px-4 py-3">层级</th>
            <th class="px-4 py-3">父级</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="division in divisionRows"
            :key="division.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3 text-slate-500">
              {{ division.serverName ?? '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900 dark:text-white">
                {{ division.fullName }}
              </div>
              <div class="text-xs text-slate-500">
                专名：{{ division.properName }}
              </div>
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{ divisionTypeMap.get(division.divisionTypeId)?.name || '—' }}
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{ division.levelIndex }} 级
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{
                division.parentId
                  ? (divisionMap.get(division.parentId)?.fullName ?? '—')
                  : '根节点'
              }}
            </td>
            <td class="px-4 py-3 text-slate-500">{{ division.status }}</td>
            <td class="px-4 py-3 text-right">
              <UButton
                size="xs"
                color="primary"
                variant="ghost"
                @click="openEditDialog(division)"
              >
                编辑
              </UButton>
            </td>
          </tr>
          <tr v-if="divisionRows.length === 0">
            <td
              colspan="7"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无行政区
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
                新增行政区
              </h3>
              <p class="text-xs text-slate-500">填写行政区专名与归属。</p>
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
          <form class="space-y-4" @submit.prevent="handleCreateDivision">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">服务端</label>
              <USelectMenu
                v-model="divisionForm.serverId"
                :items="createServerOptions"
                value-key="value"
                placeholder="选择服务端"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >行政区专名</label
              >
              <UInput
                v-model="divisionForm.properName"
                placeholder="例如：江户"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >行政区类型</label
              >
              <USelectMenu
                v-model="divisionForm.divisionTypeId"
                :items="divisionTypeOptions"
                value-key="value"
                placeholder="选择行政区类型"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">父级</label>
              <USelectMenu
                v-model="divisionForm.parentId"
                :items="divisionOptions"
                value-key="value"
                placeholder="可选"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">层级</label>
              <UInput
                v-model.number="divisionForm.levelIndex"
                type="number"
                min="1"
                :disabled="Boolean(divisionForm.parentId)"
                placeholder="根节点层级"
              />
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
                编辑行政区
              </h3>
              <p class="text-xs text-slate-500">
                服务端：{{ editingDivision?.serverName ?? '—' }}
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
          <form class="space-y-4" @submit.prevent="handleEditDivision">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >行政区专名</label
              >
              <UInput v-model="editForm.properName" placeholder="例如：江户" />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >行政区类型</label
              >
              <USelectMenu
                v-model="editForm.divisionTypeId"
                :items="
                  editingDivision
                    ? divisionTypeOptionsForServer(editingDivision.serverId)
                    : []
                "
                value-key="value"
                placeholder="选择行政区类型"
              />
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
