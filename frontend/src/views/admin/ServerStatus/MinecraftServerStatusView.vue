<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMinecraftServerStore } from '@/stores/minecraftServers'
import { useUiStore } from '@/stores/ui'
import { apiFetch } from '@/utils/api'
import type {
  MinecraftPingResult,
  MinecraftServer,
  MinecraftServerEdition,
} from '@/types/minecraft'

const serverStore = useMinecraftServerStore()
const uiStore = useUiStore()
const toast = useToast()

const { items: servers } = storeToRefs(serverStore)

const dialogOpen = ref(false)
const editingServer = ref<MinecraftServer | null>(null)
const saving = ref(false)
const deleting = ref(false)
const pingLoading = ref(false)
const lastPing = ref<MinecraftPingResult | null>(null)
const motdHtml = ref<string | null>(null)

const form = reactive({
  displayName: '',
  internalCodeCn: '',
  internalCodeEn: '',
  host: '',
  port: 25565,
  edition: 'JAVA' as MinecraftServerEdition,
  description: '',
  isActive: true,
  displayOrder: 0,
})

const columns = [
  { key: 'displayName', label: '显示名称' },
  { key: 'code', label: '内部代号' },
  { key: 'host', label: '服务器地址' },
  { key: 'edition', label: '版本' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作' },
]

const tableRows = computed(() =>
  servers.value.map((item) => ({
    ...item,
    code: `${item.internalCodeCn} / ${item.internalCodeEn}`,
    hostLabel: `${item.host}:${item.port ?? (item.edition === 'BEDROCK' ? 19132 : 25565)}`,
  })),
)

const dialogTitle = computed(() =>
  editingServer.value ? `编辑：${editingServer.value.displayName}` : '新建服务器',
)

const editionOptions = [
  { label: 'Java 版', value: 'JAVA' },
  { label: '基岩版', value: 'BEDROCK' },
]

onMounted(async () => {
  uiStore.startLoading()
  try {
    await serverStore.fetchAll()
  } finally {
    uiStore.stopLoading()
  }
})

function openCreateDialog() {
  editingServer.value = null
  resetForm()
  dialogOpen.value = true
}

function openEditDialog(server: MinecraftServer) {
  editingServer.value = server
  populateForm(server)
  dialogOpen.value = true
}

function populateForm(server: MinecraftServer) {
  form.displayName = server.displayName
  form.internalCodeCn = server.internalCodeCn
  form.internalCodeEn = server.internalCodeEn
  form.host = server.host
  form.port = server.port ?? (server.edition === 'BEDROCK' ? 19132 : 25565)
  form.edition = server.edition
  form.description = server.description ?? ''
  form.isActive = server.isActive
  form.displayOrder = server.displayOrder ?? 0
}

function resetForm() {
  form.displayName = ''
  form.internalCodeCn = ''
  form.internalCodeEn = ''
  form.host = ''
  form.port = 25565
  form.edition = 'JAVA'
  form.description = ''
  form.isActive = true
  form.displayOrder = 0
}

function buildPayload() {
  return {
    displayName: form.displayName.trim(),
    internalCodeCn: form.internalCodeCn.trim(),
    internalCodeEn: form.internalCodeEn.trim(),
    host: form.host.trim(),
    port: form.port,
    edition: form.edition,
    description: form.description.trim() || undefined,
    isActive: form.isActive,
    displayOrder: form.displayOrder,
  }
}

async function saveServer() {
  if (!form.displayName || !form.host) {
    toast.add({
      title: '请完善表单',
      description: '显示名称与 Host 不能为空',
      color: 'warning',
    })
    return
  }
  saving.value = true
  try {
    if (editingServer.value) {
      const updated = await serverStore.update(editingServer.value.id, buildPayload())
      toast.add({ title: '服务器已更新', color: 'success' })
      editingServer.value = updated
    } else {
      const created = await serverStore.create(buildPayload())
      toast.add({ title: '服务器已创建', color: 'success' })
      editingServer.value = created
    }
    dialogOpen.value = false
    await triggerPing(editingServer.value?.id ?? null)
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function removeServer(server: MinecraftServer) {
  deleting.value = true
  try {
    await serverStore.remove(server.id)
    toast.add({ title: '服务器已删除', color: 'warning' })
    if (editingServer.value?.id === server.id) {
      editingServer.value = null
      lastPing.value = null
      motdHtml.value = null
    }
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    deleting.value = false
  }
}

async function parseMotd(motd: unknown, bedrock: boolean) {
  const result = await apiFetch<{ html: string }>('/minecraft/motd/parse', {
    method: 'POST',
    body: { motd, bedrock },
  })
  return result.html
}

async function triggerPing(serverId: string | null) {
  if (!serverId) return
  pingLoading.value = true
  try {
    const result = await serverStore.ping(serverId)
    lastPing.value = result
    const motdPayload =
      result.edition === 'JAVA'
        ? result.response.description
        : result.response.motd
    motdHtml.value = await parseMotd(
      motdPayload,
      result.edition === 'BEDROCK',
    )
    toast.add({ title: 'Ping 成功', color: 'success' })
  } catch (error) {
    lastPing.value = null
    motdHtml.value = null
    toast.add({
      title: 'Ping 失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    pingLoading.value = false
  }
}

function editionLabel(edition: MinecraftServerEdition) {
  return edition === 'BEDROCK' ? '基岩版' : 'Java 版'
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">服务器状态</h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            配置 Hydroline 专属的 Minecraft 服务器，并实时检查其在线状态与 MOTD。
          </p>
        </div>
        <UButton color="primary" icon="i-lucide-plus" @click="openCreateDialog">新建服务器</UButton>
      </div>
    </header>

    <UCard>
      <UTable :rows="tableRows" :columns="columns" :loading="serverStore.loading">
        <template #code-data="{ row }">
          <div class="text-xs text-slate-500 dark:text-slate-400">{{ row.code }}</div>
        </template>
        <template #host-data="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-slate-900 dark:text-white">{{ row.hostLabel }}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">{{ row.description || '—' }}</span>
          </div>
        </template>
        <template #edition-data="{ row }">
          <UBadge variant="soft" color="neutral">{{ editionLabel(row.edition) }}</UBadge>
        </template>
        <template #status-data="{ row }">
          <UBadge :color="row.isActive ? 'success' : 'neutral'" variant="soft">
            {{ row.isActive ? '启用' : '停用' }}
          </UBadge>
        </template>
        <template #actions-data="{ row }">
          <div class="flex gap-2">
            <UButton size="2xs" variant="ghost" @click="triggerPing(row.id)" :loading="pingLoading && editingServer?.id === row.id">
              Ping
            </UButton>
            <UButton size="2xs" variant="ghost" color="primary" @click="openEditDialog(row)">编辑</UButton>
            <UPopover>
              <UButton size="2xs" color="error" variant="ghost">删除</UButton>
              <template #panel>
                <div class="space-y-2 p-3 text-sm">
                  <p>确认删除 {{ row.displayName }}？</p>
                  <div class="flex gap-2">
                    <UButton size="2xs" color="error" :loading="deleting" @click="removeServer(row)">确定</UButton>
                    <UButton size="2xs" variant="ghost">取消</UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </template>
      </UTable>
      <template #footer>
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>共 {{ servers.length }} 台服务器</span>
          <UButton variant="ghost" size="2xs" icon="i-lucide-refresh-ccw" @click="serverStore.fetchAll()">刷新列表</UButton>
        </div>
      </template>
    </UCard>

    <UCard v-if="lastPing">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">最近一次 Ping</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ editionLabel(lastPing.edition) }} · 延迟 {{ lastPing.response.latency ?? '—' }} ms
            </p>
          </div>
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-refresh-ccw"
            :loading="pingLoading"
            @click="triggerPing(editingServer?.id ?? null)"
          >
            重新 Ping
          </UButton>
        </div>
      </template>
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400">版本</p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            {{
              lastPing.edition === 'BEDROCK'
                ? lastPing.response.version
                : lastPing.response.version?.name ?? '未知'
            }}
          </p>
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400">玩家</p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            {{
              lastPing.response.players?.online ?? 0
            }} / {{ lastPing.response.players?.max ?? 0 }}
          </p>
        </div>
        <div>
          <p class="text-xs text-slate-500 dark:text-slate-400">延迟</p>
          <p class="text-base font-semibold text-slate-900 dark:text-white">{{ lastPing.response.latency ?? '—' }} ms</p>
        </div>
      </div>
      <div class="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/60">
        <p class="text-xs text-slate-500 dark:text-slate-400">MOTD</p>
        <div v-if="motdHtml" class="prose prose-sm mt-2 dark:prose-invert" v-html="motdHtml"></div>
        <p v-else class="mt-2 text-sm text-slate-500 dark:text-slate-400">暂无 MOTD 数据</p>
      </div>
    </UCard>

    <UModal :open="dialogOpen" @update:open="dialogOpen = $event">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">{{ dialogTitle }}</h3>
              <UTooltip text="保存后可立即 Ping">
                <UIcon name="i-lucide-info" class="h-4 w-4 text-slate-400 dark:text-slate-500" />
              </UTooltip>
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormGroup label="显示名称" required>
                <UInput v-model="form.displayName" placeholder="示例：主城 Lobby" />
              </UFormGroup>
              <UFormGroup label="中文内部代号" required>
                <UInput v-model="form.internalCodeCn" placeholder="示例：主城" />
              </UFormGroup>
              <UFormGroup label="英文内部代号" required>
                <UInput v-model="form.internalCodeEn" placeholder="示例：lobby" />
              </UFormGroup>
              <UFormGroup label="版本">
                <USelectMenu v-model="form.edition" :options="editionOptions" />
              </UFormGroup>
            </div>

            <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
              <UFormGroup label="服务器 Host" required>
                <UInput v-model="form.host" placeholder="mc.hydroline.example" />
              </UFormGroup>
              <UFormGroup label="端口">
                <UInput v-model.number="form.port" type="number" min="1" max="65535" />
              </UFormGroup>
            </div>

            <UFormGroup label="描述">
              <UTextarea v-model="form.description" placeholder="用于后台备注信息" />
            </UFormGroup>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormGroup label="显示顺序">
                <UInput v-model.number="form.displayOrder" type="number" />
              </UFormGroup>
              <UFormGroup label="状态">
                <UToggle v-model="form.isActive" label="启用" />
              </UFormGroup>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-between">
              <div class="text-xs text-slate-500 dark:text-slate-400">
                保存后会自动刷新服务器状态
              </div>
              <div class="flex gap-2">
                <UButton variant="ghost" @click="dialogOpen = false">取消</UButton>
                <UButton color="primary" :loading="saving" @click="saveServer">
                  {{ editingServer ? '保存修改' : '创建' }}
                </UButton>
              </div>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
