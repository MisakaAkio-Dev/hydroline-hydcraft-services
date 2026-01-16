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
  serverId: string
  name: string
  suffix: string
  abbrSuffix?: string | null
  sortOrder: number
  allowedLevels: number[]
}

type DivisionTypeRow = DivisionType & { serverId: string; serverName: string }

const authStore = useAuthStore()
const toast = useToast()

const servers = ref<ServerSummary[]>([])
const selectedServerId = ref<string | undefined>('all')
const divisionTypes = ref<DivisionType[]>([])
const dialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingType = ref<DivisionTypeRow | null>(null)

const divisionTypeForm = reactive({
  serverId: '',
  name: '',
  suffix: '',
  abbrSuffix: '',
  sortOrder: 0,
  allowedLevels: [] as number[],
})

const editForm = reactive({
  name: '',
  suffix: '',
  abbrSuffix: '',
  sortOrder: 0,
  allowedLevels: [] as number[],
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
const createRegimeLevels = ref<number[]>([])
const editRegimeLevels = ref<number[]>([])
const createLevelItems = computed(() =>
  createRegimeLevels.value.map((level) => ({
    label: `${level}级`,
    value: level,
  })),
)
const editLevelItems = computed(() =>
  editRegimeLevels.value.map((level) => ({
    label: `${level}级`,
    value: level,
  })),
)

async function fetchServers() {
  servers.value = await apiFetch<ServerSummary[]>(
    '/admin/administration/servers',
    {
      token: token.value,
    },
  )
}

const divisionTypeRows = ref<DivisionTypeRow[]>([])

async function refreshDivisionTypes() {
  const serverId =
    selectedServerId.value && selectedServerId.value !== 'all'
      ? selectedServerId.value
      : undefined
  const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : ''
  const items = await apiFetch<DivisionType[]>(
    `/admin/administration/division-types${query}`,
    { token: token.value },
  )
  divisionTypes.value = items
  divisionTypeRows.value = items.map((type) => ({
    ...type,
    serverName: serverNameMap.value.get(type.serverId) ?? '—',
  })) as DivisionTypeRow[]
}

async function handleCreateDivisionType() {
  if (!divisionTypeForm.serverId) {
    toast.add({ title: '请先选择服务端', color: 'warning' })
    return
  }
  const name = divisionTypeForm.name.trim()
  const suffix = divisionTypeForm.suffix.trim()
  if (!name || !suffix) {
    toast.add({ title: '请填写类型名称与后缀', color: 'warning' })
    return
  }
  if (divisionTypeForm.allowedLevels.length === 0) {
    toast.add({ title: '请选择适用级别', color: 'warning' })
    return
  }
  try {
    await apiFetch(
      `/admin/administration/servers/${divisionTypeForm.serverId}/division-types`,
      {
        method: 'POST',
        token: token.value,
        body: {
          name,
          suffix,
          abbrSuffix: divisionTypeForm.abbrSuffix?.trim() || undefined,
          sortOrder: divisionTypeForm.sortOrder,
          allowedLevels: divisionTypeForm.allowedLevels,
        },
      },
    )
    toast.add({ title: '行政区类型已创建', color: 'primary' })
    divisionTypeForm.serverId = ''
    divisionTypeForm.name = ''
    divisionTypeForm.suffix = ''
    divisionTypeForm.abbrSuffix = ''
    divisionTypeForm.sortOrder = 0
    divisionTypeForm.allowedLevels = []
    dialogOpen.value = false
    await refreshDivisionTypes()
  } catch (error) {
    toast.add({ title: (error as Error).message || '创建失败', color: 'error' })
  }
}

function openCreateDialog() {
  divisionTypeForm.serverId =
    selectedServerId.value && selectedServerId.value !== 'all'
      ? selectedServerId.value
      : ''
  divisionTypeForm.allowedLevels = []
  dialogOpen.value = true
}

function openEditDialog(divisionType: DivisionTypeRow) {
  editingType.value = divisionType
  editForm.name = divisionType.name
  editForm.suffix = divisionType.suffix
  editForm.abbrSuffix = divisionType.abbrSuffix ?? ''
  editForm.sortOrder = divisionType.sortOrder
  editForm.allowedLevels = [...divisionType.allowedLevels]
  editDialogOpen.value = true
  void loadRegimeLevels(divisionType.serverId, 'edit')
}

async function handleEditDivisionType() {
  if (!editingType.value) return
  const name = editForm.name.trim()
  const suffix = editForm.suffix.trim()
  if (!name || !suffix) {
    toast.add({ title: '请填写类型名称与后缀', color: 'warning' })
    return
  }
  if (editForm.allowedLevels.length === 0) {
    toast.add({ title: '请选择适用级别', color: 'warning' })
    return
  }
  try {
    await apiFetch(
      `/admin/administration/division-types/${editingType.value.id}`,
      {
        method: 'PATCH',
        token: token.value,
        body: {
          name,
          suffix,
          abbrSuffix: editForm.abbrSuffix?.trim() || undefined,
          sortOrder: editForm.sortOrder,
          allowedLevels: editForm.allowedLevels,
        },
      },
    )
    toast.add({ title: '行政区类型已更新', color: 'primary' })
    editDialogOpen.value = false
    editingType.value = null
    await refreshDivisionTypes()
  } catch (error) {
    toast.add({ title: (error as Error).message || '更新失败', color: 'error' })
  }
}

async function loadRegimeLevels(serverId: string, target: 'create' | 'edit') {
  const regime = await apiFetch<{ levelCount: number } | null>(
    `/admin/administration/servers/${serverId}/regime`,
    { token: token.value },
  )
  const levels = regime
    ? Array.from({ length: regime.levelCount }, (_, index) => index + 1)
    : []
  if (target === 'create') {
    createRegimeLevels.value = levels
  } else {
    editRegimeLevels.value = levels
  }
}

onMounted(() => {
  void fetchServers().then(() => {
    void refreshDivisionTypes()
  })
})

watch(
  () => selectedServerId.value,
  () => {
    void refreshDivisionTypes()
  },
)

watch(
  () => divisionTypeForm.serverId,
  (value) => {
    if (!value) {
      createRegimeLevels.value = []
      divisionTypeForm.allowedLevels = []
      return
    }
    void loadRegimeLevels(value, 'create')
  },
)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          行政类别
        </h1>
        <p class="text-xs text-slate-500">维护行政区类型与后缀规则。</p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="selectedServerId"
          :items="serverOptions"
          value-key="value"
          placeholder="选择服务端"
          class="w-48"
        />
        <UButton color="primary" @click="openCreateDialog">新增类型</UButton>
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
            <th class="px-4 py-3">类型名称</th>
            <th class="px-4 py-3">后缀</th>
            <th class="px-4 py-3">简称后缀</th>
            <th class="px-4 py-3">适用级别</th>
            <th class="px-4 py-3">排序</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="divisionType in divisionTypeRows"
            :key="divisionType.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3 text-slate-500">
              {{ divisionType.serverName ?? '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900 dark:text-white">
                {{ divisionType.name }}
              </div>
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{ divisionType.suffix }}
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{ divisionType.abbrSuffix || '—' }}
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{
                divisionType.allowedLevels.length
                  ? divisionType.allowedLevels.map((l) => `${l}级`).join(' / ')
                  : '—'
              }}
            </td>
            <td class="px-4 py-3 text-slate-500">
              {{ divisionType.sortOrder }}
            </td>
            <td class="px-4 py-3 text-right">
              <UButton
                size="xs"
                color="primary"
                variant="ghost"
                @click="openEditDialog(divisionType)"
              >
                编辑
              </UButton>
            </td>
          </tr>
          <tr v-if="divisionTypeRows.length === 0">
            <td
              colspan="7"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无行政区类型
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
                新增行政区类型
              </h3>
              <p class="text-xs text-slate-500">配置类型名称与后缀。</p>
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
          <form class="space-y-4" @submit.prevent="handleCreateDivisionType">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">服务端</label>
              <USelectMenu
                v-model="divisionTypeForm.serverId"
                :items="createServerOptions"
                value-key="value"
                placeholder="选择服务端"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label
                class="flex items-center gap-1 text-xs font-semibold text-slate-500"
              >
                类型名称
                <UTooltip text="类型本身的名字，用于后台配置与下拉选择。">
                  <button
                    type="button"
                    class="text-slate-400 transition hover:text-slate-600 focus:outline-none"
                  >
                    <UIcon name="i-lucide-info" class="h-4 w-4" />
                    <span class="sr-only">类型名称说明</span>
                  </button>
                </UTooltip>
              </label>
              <UInput
                v-model="divisionTypeForm.name"
                placeholder="例如：直辖市"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label
                class="flex items-center gap-1 text-xs font-semibold text-slate-500"
              >
                后缀
                <UTooltip text="拼接到行政区专名后生成完整名称。">
                  <button
                    type="button"
                    class="text-slate-400 transition hover:text-slate-600 focus:outline-none"
                  >
                    <UIcon name="i-lucide-info" class="h-4 w-4" />
                    <span class="sr-only">后缀说明</span>
                  </button>
                </UTooltip>
              </label>
              <UInput
                v-model="divisionTypeForm.suffix"
                placeholder="例如：市"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label
                class="flex items-center gap-1 text-xs font-semibold text-slate-500"
              >
                简称后缀
                <UTooltip text="用于生成简称（可留空）。">
                  <button
                    type="button"
                    class="text-slate-400 transition hover:text-slate-600 focus:outline-none"
                  >
                    <UIcon name="i-lucide-info" class="h-4 w-4" />
                    <span class="sr-only">简称后缀说明</span>
                  </button>
                </UTooltip>
              </label>
              <UInput
                v-model="divisionTypeForm.abbrSuffix"
                placeholder="可选"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">排序</label>
              <UInput
                v-model.number="divisionTypeForm.sortOrder"
                type="number"
                min="0"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >适用级别</label
              >
              <div class="space-y-2">
                <UCheckboxGroup
                  v-model="divisionTypeForm.allowedLevels"
                  :items="createLevelItems"
                />
                <span
                  v-if="createRegimeLevels.length === 0"
                  class="text-xs text-slate-500"
                >
                  请先配置行政制度
                </span>
              </div>
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
                编辑行政区类型
              </h3>
              <p class="text-xs text-slate-500">
                服务端：{{ editingType?.serverName ?? '—' }}
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
          <form class="space-y-4" @submit.prevent="handleEditDivisionType">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >类型名称</label
              >
              <UInput v-model="editForm.name" placeholder="例如：直辖市" />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">后缀</label>
              <UInput v-model="editForm.suffix" placeholder="例如：市" />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >简称后缀</label
              >
              <UInput v-model="editForm.abbrSuffix" placeholder="可选" />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">排序</label>
              <UInput
                v-model.number="editForm.sortOrder"
                type="number"
                min="0"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >适用级别</label
              >
              <div class="space-y-2">
                <UCheckboxGroup
                  v-model="editForm.allowedLevels"
                  :items="editLevelItems"
                />
                <span
                  v-if="editRegimeLevels.length === 0"
                  class="text-xs text-slate-500"
                >
                  请先配置行政制度
                </span>
              </div>
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
