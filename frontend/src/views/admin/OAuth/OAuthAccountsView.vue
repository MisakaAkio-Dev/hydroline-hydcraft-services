<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useOAuthStore } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)

type AccountRecord = {
  id: string
  provider: string
  providerAccountId: string
  userId: string
  createdAt: string
  user?: { id: string; email?: string | null; name?: string | null }
}

const records = ref<AccountRecord[]>([])
const loading = ref(false)
const pagination = ref({
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
})
const errorMessage = ref('')
const filters = reactive({
  providerKey: '',
  email: '',
  page: 1,
})

async function fetchAccounts() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await oauthStore.listAccounts({
      providerKey: filters.providerKey || undefined,
      email: filters.email || undefined,
      page: filters.page,
    })
    records.value = result.items as AccountRecord[]
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
  void fetchAccounts()
})

async function handleRemove(accountId: string) {
  if (!window.confirm('确定要解除该绑定吗？')) return
  await oauthStore.removeAccount(accountId)
  records.value = records.value.filter((item) => item.id !== accountId)
}

function goTo(page: number) {
  if (page < 1 || page > pagination.value.pageCount) return
  filters.page = page
  void fetchAccounts()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          绑定记录管理
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          查看与解除用户的第三方账号绑定。
        </p>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        @click="fetchAccounts"
      >
        刷新
      </UButton>
    </div>

    <UCard>
      <template #header>
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="grid flex-1 gap-3 md:grid-cols-3">
            <UFormGroup label="Provider">
              <USelectMenu
                v-model="filters.providerKey"
                :options="[
                  { label: '全部', value: '' },
                  ...providers.map((item) => ({
                    label: item.name,
                    value: item.key,
                  })),
                ]"
              />
            </UFormGroup>
            <UFormGroup label="邮箱/账号">
              <UInput
                v-model="filters.email"
                placeholder="按邮箱模糊搜索"
                icon="i-lucide-search"
              />
            </UFormGroup>
            <div class="flex items-end">
              <UButton color="primary" class="w-full" @click="() => { filters.page = 1; fetchAccounts() }">
                应用筛选
              </UButton>
            </div>
          </div>
        </div>
      </template>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="n in 5" :key="n" class="h-16 w-full rounded" />
      </div>
      <div v-else>
        <div
          v-if="errorMessage"
          class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
        >
          {{ errorMessage }}
        </div>
        <div
          v-else-if="records.length === 0"
          class="rounded-lg border border-dashed border-slate-200/80 px-4 py-16 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          暂无符合条件的绑定记录
        </div>
        <div v-else class="-mx-4 overflow-x-auto px-4">
          <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-slate-500">
                <th class="px-3 py-2">Provider</th>
                <th class="px-3 py-2">绑定账号</th>
                <th class="px-3 py-2">用户</th>
                <th class="px-3 py-2">创建时间</th>
                <th class="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="item in records" :key="item.id" class="text-slate-700 dark:text-slate-200">
                <td class="px-3 py-3 font-semibold uppercase text-xs">
                  {{ item.provider }}
                </td>
                <td class="px-3 py-3 font-mono text-xs text-slate-500">
                  {{ item.providerAccountId }}
                </td>
                <td class="px-3 py-3">
                  <div class="text-sm font-medium">
                    {{ item.user?.name ?? item.user?.email ?? '未知用户' }}
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ item.user?.email ?? 'ID: ' + item.userId }}
                  </div>
                </td>
                <td class="px-3 py-3 text-xs text-slate-500">
                  {{ new Date(item.createdAt).toLocaleString() }}
                </td>
                <td class="px-3 py-3 text-right">
                  <UButton
                    color="error"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-link-2-off"
                    @click="handleRemove(item.id)"
                  >
                    解除
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-if="pagination.pageCount > 1"
        class="mt-6 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400"
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
