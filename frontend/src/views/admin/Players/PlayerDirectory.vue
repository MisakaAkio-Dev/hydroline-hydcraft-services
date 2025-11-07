<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminPlayersStore } from '@/stores/adminPlayers'
import { useUiStore } from '@/stores/ui'
import { useAdminUsersStore } from '@/stores/adminUsers'

const uiStore = useUiStore()
const playersStore = useAdminPlayersStore()
const usersStore = useAdminUsersStore()

const keyword = ref(playersStore.keyword)
const rows = computed(() => playersStore.items)
const pagination = computed(() => playersStore.pagination)
const sourceStatus = computed(() => playersStore.sourceStatus)
const degradedMessage = computed(() => playersStore.error)

async function refresh(page?: number) {
  uiStore.startLoading()
  try {
    await playersStore.fetch({
      keyword: keyword.value,
      page,
    })
  } finally {
    uiStore.stopLoading()
  }
}

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh(1)
  }
})

async function handleSubmit() {
  await refresh(1)
}

async function goToPage(page: number) {
  if (
    page === pagination.value.page ||
    page < 1 ||
    page > pagination.value.pageCount
  )
    return
  await refresh(page)
}

function bindingUser(entry: typeof rows.value[number]['binding']) {
  if (!entry?.user) return '未关联'
  return entry.user.profile?.displayName ?? entry.user.email ?? entry.user.id
}

// ==== 行内操作：查看时间线、补录历史、绑定到用户 ====
const timelineOpen = ref(false)
import type { AdminBindingHistoryEntry } from '@/types/admin'
const timelineItems = ref<AdminBindingHistoryEntry[]>([])
const timelineTitle = ref('')
const historyLoading = ref(false)

async function openTimeline(username: string) {
  timelineTitle.value = username
  timelineOpen.value = true
  historyLoading.value = true
  try {
    const res = await playersStore.fetchHistory(username, 1, 50)
    timelineItems.value = res.items
  } finally {
    historyLoading.value = false
  }
}

const bindDialogOpen = ref(false)
const bindForm = reactive({ username: '', userId: '' })
const bindingSubmitting = ref(false)

async function openBindDialog(username: string) {
  bindForm.username = username
  bindForm.userId = ''
  bindDialogOpen.value = true
  if (usersStore.items.length === 0) {
    await usersStore.fetch({ page: 1 })
  }
}

async function submitBind() {
  if (!bindForm.username || !bindForm.userId) return
  bindingSubmitting.value = true
  try {
    await playersStore.bindToUser(bindForm.username, bindForm.userId)
    bindDialogOpen.value = false
    await refresh(pagination.value.page)
  } finally {
    bindingSubmitting.value = false
  }
}

const entryDialogOpen = ref(false)
const entryForm = reactive({ username: '', action: 'MANUAL_ENTRY', reason: '', payload: '' })
const entrySubmitting = ref(false)

function openEntryDialog(username: string) {
  entryForm.username = username
  entryForm.action = 'MANUAL_ENTRY'
  entryForm.reason = ''
  entryForm.payload = ''
  entryDialogOpen.value = true
}

async function submitEntry() {
  entrySubmitting.value = true
  try {
    const payloadJson = entryForm.payload ? JSON.parse(entryForm.payload) : {}
    await playersStore.createHistory(entryForm.username, { action: entryForm.action, reason: entryForm.reason, payload: payloadJson })
    entryDialogOpen.value = false
    if (timelineOpen.value && timelineTitle.value === entryForm.username) {
      await openTimeline(entryForm.username)
    }
  } catch {
    // 忽略解析异常，交由后端校验并由后端返回错误提示
  } finally {
    entrySubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">AuthMe 玩家列表</h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          从 AuthMe 数据库拉取的玩家数据，包含当前绑定的站内用户与绑定流转摘要。
        </p>
      </div>
      <form class="flex w-full max-w-md gap-2" @submit.prevent="handleSubmit">
        <UInput v-model="keyword" type="search" placeholder="搜索 AuthMe 用户名 / Realname" class="flex-1" />
        <UButton type="submit" color="primary">搜索</UButton>
      </form>
    </header>

    <UAlert
      v-if="sourceStatus === 'degraded'"
      color="warning"
      variant="soft"
      title="AuthMe 数据源暂不可用"
      class="rounded-2xl"
    >
      将展示最近缓存的绑定数据。{{ degradedMessage ?? '请稍后重试连接。' }}
    </UAlert>

    <div class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th class="px-4 py-3">玩家</th>
            <th class="px-4 py-3">绑定用户</th>
            <th class="px-4 py-3">最近事件</th>
            <th class="px-4 py-3">上次登录</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="(player, idx) in rows"
            :key="player.authme?.username ?? player.binding?.id ?? `fallback-${idx}`"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">
                  {{ player.authme?.username ?? player.binding?.authmeUsername ?? '未知玩家' }}
                </span>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  Realname：{{ player.authme?.realname ?? player.binding?.authmeRealname ?? '—' }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ bindingUser(player.binding) }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <div v-if="player.history.length > 0" class="space-y-0.5">
                <div class="font-medium text-slate-900 dark:text-white">
                  {{ player.history[0].action }}
                </div>
                <div class="text-[11px] text-slate-500">
                  {{ player.history[0].reason ?? '无原因' }} ·
                  {{ new Date(player.history[0].createdAt).toLocaleString() }}
                </div>
              </div>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="player.authme?.lastlogin">
                {{ new Date(player.authme.lastlogin).toLocaleString() }}
              </span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <UButton size="xs" color="neutral" variant="outline" @click="openTimeline(player.authme?.username ?? player.binding?.authmeUsername ?? '')">时间线</UButton>
                <UButton size="xs" color="primary" variant="soft" @click="openEntryDialog(player.authme?.username ?? player.binding?.authmeUsername ?? '')">补录事件</UButton>
                <UButton size="xs" color="primary" @click="openBindDialog(player.authme?.username ?? player.binding?.authmeUsername ?? '')">绑定到用户</UButton>
              </div>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              暂无玩家数据。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
      <span>
        第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共 {{ pagination.total }} 名玩家
      </span>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page <= 1 || playersStore.loading"
          @click="goToPage(pagination.page - 1)"
        >
          上一页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page >= pagination.pageCount || playersStore.loading"
          @click="goToPage(pagination.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>

  <!-- 时间线抽屉 -->
  <USlideover v-model:open="timelineOpen">
    <template #title>玩家 {{ timelineTitle }} 绑定流转</template>
    <div class="space-y-3 p-4">
      <USkeleton v-if="historyLoading" class="h-4 w-24" />
      <ul class="space-y-2">
        <li v-for="e in timelineItems" :key="e.id" class="rounded-xl border border-slate-200/70 p-3 text-xs dark:border-slate-800/60">
          <div class="flex items-center justify-between">
            <span class="font-semibold">{{ e.action }}</span>
            <span>{{ new Date(e.createdAt).toLocaleString() }}</span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500">{{ e.reason ?? '无备注' }}</div>
          <div class="mt-1 text-[11px] text-slate-500">操作人：{{ e.operator?.profile?.displayName ?? e.operator?.email ?? '系统' }}</div>
        </li>
        <li v-if="!historyLoading && timelineItems.length === 0" class="text-center text-sm text-slate-500">暂无记录。</li>
      </ul>
    </div>
  </USlideover>

  <!-- 绑定到用户对话框 -->
  <UModal :open="bindDialogOpen" @update:open="bindDialogOpen = $event" :ui="{ content: 'w-full max-w-2xl' }">
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <h3 class="text-lg font-semibold">绑定玩家到用户</h3>
        <p class="text-xs text-slate-500">玩家：{{ bindForm.username }}</p>
        <label class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-slate-500">选择用户</span>
          <select v-model="bindForm.userId" class="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <option value="" disabled>请选择用户</option>
            <option v-for="u in usersStore.items" :key="u.id" :value="u.id">{{ u.profile?.displayName ?? u.email }}</option>
          </select>
        </label>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="bindDialogOpen = false">取消</UButton>
          <UButton color="primary" :loading="bindingSubmitting" @click="submitBind">绑定</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- 补录历史 -->
  <UModal :open="entryDialogOpen" @update:open="entryDialogOpen = $event" :ui="{ content: 'w-full max-w-2xl' }">
    <template #content>
      <form class="space-y-4 p-6 text-sm" @submit.prevent="submitEntry">
        <h3 class="text-lg font-semibold">补录玩家事件</h3>
        <p class="text-xs text-slate-500">玩家：{{ entryForm.username }}</p>
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500">Action</span>
            <USelect v-model="entryForm.action" :options="[
              { label: 'MANUAL_ENTRY', value: 'MANUAL_ENTRY' },
              { label: 'BIND', value: 'BIND' },
              { label: 'UNBIND', value: 'UNBIND' },
              { label: 'TRANSFER', value: 'TRANSFER' },
            ]" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500">备注</span>
            <UInput v-model="entryForm.reason" placeholder="原因（可选）" />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-slate-500">Payload JSON（可选）</span>
          <UTextarea v-model="entryForm.payload" :rows="6" />
        </label>
        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" @click="entryDialogOpen = false">取消</UButton>
          <UButton type="submit" color="primary" :loading="entrySubmitting">保存</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
