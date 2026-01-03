<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminCompanyApplicationsStore } from '@/stores/admin/companyApplications'
import type {
  AdminCompanyApplicationEntry,
  CompanyApplicationStatus,
} from '@/types/company'

const store = useAdminCompanyApplicationsStore()
const router = useRouter()
const toast = useToast()

const workflowCode = 'company.capital_change'

const filters = reactive({
  status: undefined as CompanyApplicationStatus | undefined,
  search: '',
})

const statusOptions = [
  { label: '全部', value: undefined },
  { label: '已提交', value: 'SUBMITTED' },
  { label: '审核中', value: 'UNDER_REVIEW' },
  { label: '需补件', value: 'NEEDS_CHANGES' },
  { label: '已通过', value: 'APPROVED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '已归档', value: 'ARCHIVED' },
] as const

const statusLabels: Record<CompanyApplicationStatus, string> = {
  SUBMITTED: '已提交',
  UNDER_REVIEW: '审核中',
  NEEDS_CHANGES: '需补件',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
}

const pageInput = ref(store.pagination.page)
const safePageCount = computed(() =>
  Math.max(store.pagination.pageCount ?? 1, 1),
)

const actionDialogOpen = ref(false)
const actionTarget = ref<AdminCompanyApplicationEntry | null>(null)
const actionKey = ref<string | null>(null)
const actionComment = ref('')
const actionLoading = ref(false)
const autoApproveDraft = ref(false)
const autoApproveSyncing = ref(false)
const settingsLoaded = ref(false)

const autoApproveLoading = computed(
  () => store.settingsLoading || autoApproveSyncing.value,
)

const loadList = async (page = 1) => {
  try {
    await store.fetchList({
      status: filters.status,
      search: filters.search.trim() || undefined,
      page,
      workflowCode,
    })
    pageInput.value = store.pagination.page
  } catch (error) {
    toast.add({
      title: (error as Error).message || '无法加载申请',
      color: 'error',
    })
  }
}

const applyFilters = async () => {
  await loadList(1)
}

const goToPage = async (target: number) => {
  const normalized = Math.max(1, Math.min(target, safePageCount.value))
  if (normalized === store.pagination.page) {
    pageInput.value = normalized
    return
  }
  await loadList(normalized)
}

const handlePageInput = async () => {
  if (!pageInput.value) return
  await goToPage(pageInput.value)
}

const formatApplicant = (entry: AdminCompanyApplicationEntry) => {
  return (
    entry.applicant.profile?.displayName ||
    entry.applicant.name ||
    entry.applicant.email ||
    '未知申请人'
  )
}

function actionsForEntry(entry: AdminCompanyApplicationEntry) {
  switch (entry.status) {
    case 'SUBMITTED':
      return [
        { key: 'route_to_review', label: '进入审核', color: 'primary' },
        { key: 'reject', label: '驳回申请', color: 'neutral' },
      ]
    case 'UNDER_REVIEW':
      return [
        { key: 'approve', label: '批准变更', color: 'primary' },
        { key: 'reject', label: '驳回申请', color: 'neutral' },
      ]
    default:
      return []
  }
}

const actionOptions = computed(() =>
  actionTarget.value ? actionsForEntry(actionTarget.value) : [],
)

function openActionDialog(entry: AdminCompanyApplicationEntry, key: string) {
  actionTarget.value = entry
  actionKey.value = key
  actionComment.value = ''
  actionDialogOpen.value = true
}

async function handleActionConfirm() {
  if (!actionTarget.value || !actionKey.value) return
  actionLoading.value = true
  try {
    await store.executeAction(actionTarget.value.id, {
      actionKey: actionKey.value,
      comment: actionComment.value || undefined,
    })
    toast.add({ title: '审批操作已完成', color: 'primary' })
    actionDialogOpen.value = false
    await loadList(store.pagination.page)
  } catch (error) {
    toast.add({
      title: (error as Error).message || '审批失败',
      color: 'error',
    })
  } finally {
    actionLoading.value = false
  }
}

const openCompany = (companyId: string | undefined) => {
  if (!companyId) return
  void router.push({
    name: 'admin.company.registry',
    query: { companyId },
  })
}

onMounted(() => {
  void loadList()
  void store
    .fetchSettingsByWorkflow(workflowCode)
    .then(() => {
      settingsLoaded.value = true
    })
    .catch((error) => {
      settingsLoaded.value = true
      toast.add({
        title: (error as Error).message || '无法获取审批设置',
        color: 'error',
      })
    })
})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  pollTimer = setInterval(() => {
    void loadList(store.pagination.page)
  }, 10000)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

watch(
  () => store.pagination.page,
  (page) => {
    pageInput.value = page
  },
  { immediate: true },
)

watch(
  () => store.autoApproveEnabled,
  (value) => {
    autoApproveDraft.value = value
  },
  { immediate: true },
)

watch(autoApproveDraft, async (value) => {
  if (!settingsLoaded.value) return
  if (autoApproveSyncing.value) return
  if (value === store.autoApproveEnabled) return
  autoApproveSyncing.value = true
  const previous = store.autoApproveEnabled
  try {
    await store.updateSettingsByWorkflow(value, workflowCode)
    toast.add({
      title: value ? '已开启自动审批' : '已关闭自动审批',
      color: 'primary',
    })
  } catch (error) {
    autoApproveDraft.value = previous
    toast.add({
      title: (error as Error).message || '更新自动审批失败',
      color: 'error',
    })
  } finally {
    autoApproveSyncing.value = false
  }
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="w-full flex flex-wrap justify-between items-center">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          注册资本变更审批
        </h1>

        <div class="flex flex-wrap items-center gap-3">
          <USelectMenu
            v-model="filters.status"
            :items="statusOptions"
            value-key="value"
            placeholder="按状态筛选"
            :clearable="false"
          />
          <UInput
            v-model="filters.search"
            placeholder="搜索公司名称或申请人"
            icon="i-lucide-search"
            @keyup.enter="applyFilters"
          />
          <UButton color="primary" @click="applyFilters"> 查询 </UButton>
          <div class="flex items-center gap-2 text-sm">
            <span>自动审批</span>
            <USwitch v-model="autoApproveDraft" :disabled="autoApproveLoading" />
          </div>
        </div>
      </div>
    </div>

    <div
      class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <th class="px-4 py-3">公司</th>
              <th class="px-4 py-3">申请人</th>
              <th class="px-4 py-3">状态</th>
              <th class="px-4 py-3">提交时间</th>
              <th class="px-4 py-3">处理时间</th>
              <th class="px-4 py-3">流程</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="item in store.items"
              :key="item.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3">
                <div class="font-medium text-slate-900 dark:text-white">
                  {{ item.company?.name || '未知公司' }}
                </div>
                <p class="text-xs text-slate-500">
                  {{ item.company?.type?.name || '未绑定类型' }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ formatApplicant(item) }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                <span
                  class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {{ statusLabels[item.status] || item.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500">
                {{ new Date(item.submittedAt).toLocaleString() }}
              </td>
              <td class="px-4 py-3 text-xs text-slate-500">
                <span v-if="item.resolvedAt">
                  {{ new Date(item.resolvedAt).toLocaleString() }}
                </span>
                <span v-else>待处理</span>
              </td>
              <td class="px-4 py-3 text-slate-500">
                <div class="font-medium text-slate-900 dark:text-white">
                  {{ item.workflowInstance?.definition?.name || '未配置流程' }}
                </div>
                <p class="text-[11px] text-slate-400">
                  {{ item.workflowInstance?.definition?.code || '—' }}
                </p>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex flex-wrap justify-end gap-2">
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    @click="openCompany(item.company?.id)"
                    :disabled="!item.company?.id"
                  >
                    查看公司
                  </UButton>
                  <UButton
                    v-for="action in actionsForEntry(item)"
                    :key="action.key"
                    size="xs"
                    :color="action.color"
                    variant="soft"
                    @click="openActionDialog(item, action.key)"
                  >
                    {{ action.label }}
                  </UButton>
                </div>
              </td>
            </tr>
            <tr v-if="store.items.length === 0">
              <td
                colspan="7"
                class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                没有匹配的申请记录
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>
          第 {{ store.pagination.page }} / {{ safePageCount }} 页，共
          {{ store.pagination.total }} 条
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="store.pagination.page <= 1 || store.loading"
            @click="goToPage(1)"
          >
            首页
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="store.pagination.page <= 1 || store.loading"
            @click="goToPage(store.pagination.page - 1)"
          >
            上一页
          </UButton>
          <div class="flex items-center gap-1">
            <UInput
              v-model.number="pageInput"
              type="number"
              size="xs"
              class="w-16 text-center"
              :disabled="store.loading"
              min="1"
              :max="safePageCount"
              @keydown.enter.prevent="handlePageInput"
            />
            <span class="text-xs text-slate-500 dark:text-slate-400">
              / {{ safePageCount }}
            </span>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            :disabled="store.loading"
            @click="handlePageInput"
          >
            跳转
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="store.loading"
            @click="goToPage(safePageCount)"
          >
            末页
          </UButton>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="actionDialogOpen"
      :ui="{ content: 'w-full max-w-lg w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-slate-900 dark:text-white">
                  公司注册资本变更审批
                </h3>
                <p class="mt-1 text-xs text-slate-500">
                  {{ actionTarget?.company?.name || '未知公司' }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                :disabled="actionLoading"
                @click="actionDialogOpen = false"
              />
            </div>
          </template>

          <div class="space-y-3 p-4">
            <div class="text-sm text-slate-600 dark:text-slate-300">
              选择操作：
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="action in actionOptions"
                :key="action.key"
                size="sm"
                :color="action.color"
                variant="soft"
                :disabled="actionLoading"
                @click="actionKey = action.key"
              >
                {{ action.label }}
              </UButton>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">备注（可选）</label>
              <UTextarea v-model="actionComment" :rows="3" :disabled="actionLoading" />
            </div>

            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="actionLoading"
                @click="actionDialogOpen = false"
              >
                取消
              </UButton>
              <UButton
                color="primary"
                :loading="actionLoading"
                :disabled="actionLoading || !actionKey"
                @click="handleActionConfirm"
              >
                确认
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>
  </section>
</template>


