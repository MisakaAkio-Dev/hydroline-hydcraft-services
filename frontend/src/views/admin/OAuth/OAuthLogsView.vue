<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)

type LogRecord = {
  id: string
  providerKey: string
  providerType: string
  action: string
  status: string
  message?: string | null
  user?: { id: string; email?: string | null; name?: string | null }
  createdAt: string
  metadata?: Record<string, unknown> | null
}

const logs = ref<LogRecord[]>([])
const loading = ref(false)
const errorMessage = ref('')
const pagination = ref({
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
})

const filters = reactive({
  providerKey: '',
  action: '',
  status: '',
  userId: '',
  search: '',
  page: 1,
})

const actionOptions = [
  { label: '全部动作', value: '' },
  { label: 'Authorize', value: 'AUTHORIZE' },
  { label: 'Token Exchange', value: 'TOKEN' },
  { label: '登录', value: 'LOGIN' },
  { label: '注册', value: 'REGISTER' },
  { label: '绑定', value: 'BIND' },
  { label: '解绑', value: 'UNBIND' },
  { label: '错误', value: 'ERROR' },
]

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '成功', value: 'SUCCESS' },
  { label: '失败', value: 'FAILURE' },
]

async function fetchLogs() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await oauthStore.listLogs({
      providerKey: filters.providerKey || undefined,
      action: filters.action || undefined,
      status: filters.status || undefined,
      userId: filters.userId || undefined,
      search: filters.search || undefined,
      page: filters.page,
    })
    logs.value = result.items as LogRecord[]
    pagination.value = result.pagination
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : '加载失败，请稍后再试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!oauthStore.providersLoaded) {
    void oauthStore.fetchProviders()
  }
  void fetchLogs()
})

function goTo(page: number) {
  if (page < 1 || page > pagination.value.pageCount) return
  filters.page = page
  void fetchLogs()
}

const providerOptions = computed(() => [
  { label: '全部 Provider', value: '' },
  ...providers.value.map((item) => ({ label: item.name, value: item.key })),
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          OAuth 日志
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          查询第三方登录的授权、绑定与错误日志。
        </p>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="fetchLogs"
      >
        刷新
      </UButton>
    </div>

    <UCard>
      <template #header>
        <div class="grid gap-3 md:grid-cols-5">
          <USelectMenu v-model="filters.providerKey" :options="providerOptions" />
          <USelectMenu v-model="filters.action" :options="actionOptions" />
          <USelectMenu v-model="filters.status" :options="statusOptions" />
          <UInput v-model="filters.search" placeholder="关键词" icon="i-lucide-search" />
          <UButton color="primary" @click="() => { filters.page = 1; fetchLogs() }"
            >应用筛选</UButton
          >
        </div>
      </template>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="n in 6" :key="n" class="h-14 w-full rounded" />
      </div>
      <div v-else>
        <div
          v-if="errorMessage"
          class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
        >
          {{ errorMessage }}
        </div>
        <div
          v-else-if="logs.length === 0"
          class="rounded-lg border border-dashed border-slate-200/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          暂无日志记录
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="item in logs"
            :key="item.id"
            class="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <UBadge size="xs" variant="soft">{{ item.providerKey }}</UBadge>
              <UBadge
                size="xs"
                :color="item.status === 'SUCCESS' ? 'primary' : 'error'"
                variant="soft"
              >
                {{ item.status }}
              </UBadge>
              <span class="uppercase text-xs text-slate-500">
                {{ item.action }}
              </span>
              <span class="text-xs text-slate-400">
                {{ new Date(item.createdAt).toLocaleString() }}
              </span>
            </div>
            <div class="mt-2 text-sm text-slate-700 dark:text-slate-200">
              {{ item.message || '—' }}
            </div>
            <div class="mt-2 text-xs text-slate-500 dark:text-slate-400">
              账户：{{ item.user?.email ?? '未知用户' }}（ID:
              {{ item.user?.id || 'N/A' }}）
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="pagination.pageCount > 1"
        class="mt-6 flex items-center justify-between text-sm text-slate-500"
      >
        <span>
          共 {{ pagination.total }} 条，{{ pagination.page }}/{{ pagination.pageCount }} 页
        </span>
        <div class="space-x-2">
          <UButton
            size="xs"
            :disabled="filters.page <= 1"
            @click="goTo(filters.page - 1)"
          >
            上一页
          </UButton>
          <UButton
            size="xs"
            :disabled="filters.page >= pagination.pageCount"
            @click="goTo(filters.page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
