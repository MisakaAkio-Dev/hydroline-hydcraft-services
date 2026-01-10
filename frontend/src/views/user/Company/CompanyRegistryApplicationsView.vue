<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRegistryCompanyApplicationsStore } from '@/stores/user/registryCompanyApplications'
import { useAuthStore } from '@/stores/user/auth'
import { ApiError } from '@/utils/http/api'
import type {
  AdminCompanyApplicationEntry,
  CompanyApplicationStatus,
} from '@/types/company'

const store = useRegistryCompanyApplicationsStore()
const authStore = useAuthStore()
const router = useRouter()
const toast = useToast()

const workflowCode = 'company.registration'

const tableColumns = [
  {
    id: 'main',
    header: '申请信息',
  },
]

const filters = reactive({
  status: undefined as CompanyApplicationStatus | undefined,
  search: '',
})

const statusOptions = [
  { label: '全部', value: undefined },
  { label: '审核中', value: 'UNDER_REVIEW' },
  { label: '需补件', value: 'NEEDS_CHANGES' },
  { label: '已通过', value: 'APPROVED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '已归档', value: 'ARCHIVED' },
] as const

const statusLabel = (status: CompanyApplicationStatus) => {
  const map: Record<string, string> = {
    UNDER_REVIEW: '审核中',
    NEEDS_CHANGES: '需补件',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    ARCHIVED: '已归档',
  }
  return map[status] ?? String(status)
}

const pageInput = ref(store.pagination.page)
const safePageCount = computed(() =>
  Math.max(store.pagination.pageCount ?? 1, 1),
)

const actionDialogOpen = ref(false)
const actionTarget = ref<AdminCompanyApplicationEntry | null>(null)
const actionKey = ref<string | undefined>(undefined)
const actionComment = ref('')
const actionLoading = ref(false)

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
    if (error instanceof ApiError && error.status === 403) {
      toast.add({
        title: '无权访问登记机关审批',
        color: 'warning',
      })
      await router.replace('/company/dashboard')
      return
    }
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

function getCompanyName(entry: AdminCompanyApplicationEntry) {
  if (entry.company?.name) return entry.company.name
  const payloadName = entry.payload?.name
  return typeof payloadName === 'string' && payloadName.trim()
    ? payloadName.trim()
    : '未知公司'
}

function getWorkflowLabel(entry: AdminCompanyApplicationEntry) {
  return (
    entry.workflowInstance?.definition?.name ||
    entry.workflowInstance?.definition?.code ||
    '未绑定流程'
  )
}

function entryOf(row: unknown): AdminCompanyApplicationEntry {
  const maybe = row as { original?: unknown }
  return (
    (maybe?.original as AdminCompanyApplicationEntry) ??
    (row as AdminCompanyApplicationEntry)
  )
}

function actionsForEntry(entry: AdminCompanyApplicationEntry) {
  const canManage =
    authStore.hasPermission('company.admin.applications.manage') ||
    authStore.hasPermission('company.admin.manage')
  if (!canManage) return []
  switch (entry.status) {
    case 'UNDER_REVIEW':
      return [
        { key: 'approve', label: '通过入库', color: 'primary' },
        { key: 'request_changes', label: '打回修改', color: 'neutral' },
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
  if (
    (actionKey.value === 'reject' || actionKey.value === 'request_changes') &&
    !actionComment.value.trim()
  ) {
    toast.add({
      title: '该审批动作需要填写备注',
      color: 'warning',
    })
    return
  }
  actionLoading.value = true
  try {
    await store.executeAction(actionTarget.value.id, {
      actionKey: actionKey.value,
      comment: actionComment.value.trim() || undefined,
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

onMounted(() => {
  void loadList(1)
})
</script>

<template>
  <section class="space-y-5">
    <div>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
            登记机关审批
          </h2>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <USelectMenu
            v-model="filters.status"
            :options="statusOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="状态"
            class="w-40"
          />
          <UInput
            v-model="filters.search"
            placeholder="搜索申请 / 公司 / 申请人"
            class="w-60"
            @keydown.enter="applyFilters"
          />
          <UButton color="primary" variant="soft" @click="applyFilters">
            查询
          </UButton>
        </div>
      </div>
    </div>

    <div
      class="rounded-xl border border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/70"
    >
      <UTable
        :data="store.items"
        :columns="tableColumns"
        :loading="store.loading"
      >
        <template #empty>
          <div
            class="py-10 text-center text-sm text-slate-500 dark:text-slate-400"
          >
            暂无可审批的申请
          </div>
        </template>

        <template #main-header>
          <div
            class="grid grid-cols-1 gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 md:grid-cols-5 md:items-center"
          >
            <div class="md:col-span-2">公司 / 流程</div>
            <div>申请人</div>
            <div>状态</div>
            <div class="md:text-right">操作</div>
          </div>
        </template>

        <template #main-cell="{ row }">
          <div class="grid grid-cols-1 gap-2 md:grid-cols-5 md:items-center">
            <div class="md:col-span-2">
              <div class="font-semibold text-slate-900 dark:text-white">
                {{ getCompanyName(entryOf(row)) }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                {{ getWorkflowLabel(entryOf(row)) }}
              </div>
            </div>
            <div class="text-sm text-slate-700 dark:text-slate-300">
              {{ formatApplicant(entryOf(row)) }}
            </div>
            <div class="text-sm text-slate-700 dark:text-slate-300">
              {{ statusLabel(entryOf(row).status) }}
            </div>
            <div class="flex flex-wrap justify-start gap-2 md:justify-end">
              <UButton
                v-for="action in actionsForEntry(entryOf(row))"
                :key="action.key"
                size="xs"
                :color="action.color as any"
                variant="soft"
                @click="openActionDialog(entryOf(row), action.key)"
              >
                {{ action.label }}
              </UButton>
            </div>
          </div>
        </template>
      </UTable>

      <div class="p-3 mt-4 flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          共 {{ store.pagination.total }} 条 · 第 {{ store.pagination.page }} /
          {{ store.pagination.pageCount }} 页
        </div>
        <div class="flex items-center gap-2">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="store.pagination.page <= 1"
            @click="goToPage(store.pagination.page - 1)"
          >
            上一页
          </UButton>
          <UInput
            v-model.number="pageInput"
            type="number"
            size="xs"
            class="w-20"
            :min="1"
            :max="safePageCount"
            @keydown.enter="handlePageInput"
          />
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="store.pagination.page >= safePageCount"
            @click="goToPage(store.pagination.page + 1)"
          >
            下一页
          </UButton>
        </div>
      </div>
    </div>

    <UModal
      :open="actionDialogOpen"
      @update:open="(value) => (actionDialogOpen = value)"
      :ui="{ content: 'w-full max-w-xl w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div class="flex h-full flex-col">
          <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800"
          >
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                公司申请审批
              </p>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ actionTarget ? getCompanyName(actionTarget) : '审批操作' }}
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="actionDialogOpen = false"
            />
          </div>

          <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >审批动作</label
              >
              <USelectMenu
                v-model="actionKey"
                :items="actionOptions"
                value-key="key"
                label-key="label"
                placeholder="选择动作"
              />
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">备注</label>
              <UTextarea
                v-model="actionComment"
                :rows="3"
                placeholder="审批备注（驳回/打回修改必填）"
              />
            </div>
            <div
              class="rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/60 dark:text-slate-400"
            >
              当前流程：{{
                actionTarget?.workflowInstance?.definition?.name || '未配置流程'
              }}
              ·
              {{
                actionTarget?.status ? statusLabel(actionTarget.status) : '—'
              }}
            </div>
          </div>

          <div
            class="border-t border-slate-200 px-6 py-4 flex justify-end gap-2 dark:border-slate-800"
          >
            <UButton
              variant="ghost"
              color="neutral"
              @click="actionDialogOpen = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              :loading="actionLoading"
              @click="handleActionConfirm"
            >
              确认操作
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
