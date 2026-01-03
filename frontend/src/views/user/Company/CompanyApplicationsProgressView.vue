<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import { useCompanyStore } from '@/stores/user/companies'
import CompanyApplicationForm from '@/components/company/CompanyApplicationForm.vue'
import type { CreateCompanyApplicationPayload } from '@/types/company'

type ApplicationConsentEntry = {
  id: string
  role?: string | null
  status?: string | null
  comment?: string | null
  decidedAt?: string | null
  requiredUser?: {
    id: string
    name?: string | null
    email?: string | null
    profile?: { displayName?: string | null } | null
  } | null
  shareholderCompany?: {
    id: string
    name: string
    slug: string
  } | null
}

type ApplicationConsentsDetail = {
  consents?: ApplicationConsentEntry[]
}

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const toast = useToast()

const refreshing = ref(false)

const loading = computed(
  () =>
    companyStore.myApplicationsLoading ||
    companyStore.pendingConsentsLoading ||
    refreshing.value,
)

const selectedApplicationId = ref<string | null>(null)
const selectedWorkflowCode = ref<string | null>(null)
const consentDialogOpen = ref(false)
const consentLoading = ref(false)
const consentDetail = ref<ApplicationConsentsDetail | null>(null)

const actionComment = ref('')
const actionLoading = ref(false)

const myApplications = computed(() => companyStore.myApplications)
const pendingConsents = computed(() => companyStore.pendingConsents)

const editDialogOpen = ref(false)
const editLoading = ref(false)
const editSubmitting = ref(false)
const editApplicationId = ref<string | null>(null)
const editInitial = ref<CreateCompanyApplicationPayload | null>(null)
const editReviewComment = ref<string | null>(null)

const withdrawDialogOpen = ref(false)
const withdrawTarget = ref<{ id: string; name?: string | null } | null>(null)
const withdrawComment = ref('')
const withdrawLoading = ref(false)

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    SUBMITTED: '已提交',
    UNDER_REVIEW: '审核中',
    NEEDS_CHANGES: '需补件',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    ARCHIVED: '已撤回',
  }
  return map[status] ?? status
}

function workflowLabel(code?: string | null) {
  if (code === 'company.deregistration') return '注销申请'
  if (code === 'company.rename') return '更名申请'
  if (code === 'company.change_domicile') return '住所变更申请'
  if (code === 'company.change_business_scope') return '经营范围变更申请'
  if (code === 'company.change_management') return '管理层变更申请'
  if (code === 'company.capital_change') return '注册资本变更申请'
  if (code === 'company.equity_transfer') return '股权转让'
  return '注册申请'
}

function workflowColor(code?: string | null) {
  if (code === 'company.deregistration') return 'error'
  if (code === 'company.rename') return 'primary'
  if (code === 'company.change_domicile') return 'primary'
  if (code === 'company.change_business_scope') return 'primary'
  if (code === 'company.change_management') return 'primary'
  if (code === 'company.capital_change') return 'primary'
  if (code === 'company.equity_transfer') return 'primary'
  return 'neutral'
}

function canWithdraw(status: string) {
  return ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CHANGES'].includes(String(status))
}

function fmtTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function refreshAll() {
  if (!authStore.isAuthenticated) return
  refreshing.value = true
  try {
    await Promise.all([
      companyStore.fetchMyApplications(),
      companyStore.fetchPendingConsents(),
    ])
  } catch (error) {
    toast.add({
      title: (error as Error).message || '刷新失败',
      color: 'error',
    })
  } finally {
    refreshing.value = false
  }
}

async function openConsentDetail(
  applicationId: string,
  workflowCode?: string | null,
) {
  selectedApplicationId.value = applicationId
  selectedWorkflowCode.value = workflowCode ?? null
  consentDialogOpen.value = true
  consentLoading.value = true
  consentDetail.value = null
  try {
    consentDetail.value =
      (await companyStore.getApplicationConsents(
        applicationId,
      )) as ApplicationConsentsDetail
  } catch (error) {
    toast.add({
      title: (error as Error).message || '无法加载同意明细',
      color: 'error',
    })
  } finally {
    consentLoading.value = false
  }
}

async function openEdit(applicationId: string) {
  if (!authStore.isAuthenticated) return
  editDialogOpen.value = true
  editApplicationId.value = applicationId
  editLoading.value = true
  editInitial.value = null
  editReviewComment.value = null
  try {
    const detail = await apiFetch<{
      id: string
      status: string
      payload: CreateCompanyApplicationPayload
      reviewComment?: string | null
    }>(`/companies/applications/${applicationId}`, { token: authStore.token })

    if (String(detail.status) !== 'NEEDS_CHANGES') {
      toast.add({ title: '当前申请状态不可修改', color: 'error' })
      editDialogOpen.value = false
      return
    }

    editInitial.value = detail.payload
    editReviewComment.value = detail.reviewComment ?? null
  } catch (error) {
    toast.add({
      title: (error as Error).message || '加载申请失败',
      color: 'error',
    })
    editDialogOpen.value = false
  } finally {
    editLoading.value = false
  }
}

function openWithdraw(app: { id: string; name?: string | null }) {
  withdrawTarget.value = app
  withdrawComment.value = ''
  withdrawDialogOpen.value = true
}

async function confirmWithdraw() {
  if (!withdrawTarget.value) return
  withdrawLoading.value = true
  try {
    await companyStore.withdrawMyApplication(
      withdrawTarget.value.id,
      withdrawComment.value.trim() || undefined,
    )
    toast.add({ title: '已撤回申请', color: 'primary' })
    withdrawDialogOpen.value = false
    await refreshAll()
  } catch (error) {
    toast.add({
      title: (error as Error).message || '撤回失败',
      color: 'error',
    })
  } finally {
    withdrawLoading.value = false
  }
}

async function submitEdit(payload: CreateCompanyApplicationPayload) {
  if (!editApplicationId.value) return
  editSubmitting.value = true
  try {
    await apiFetch(`/companies/applications/${editApplicationId.value}`, {
      method: 'PATCH',
      body: payload as unknown as Record<string, unknown>,
      token: authStore.token,
    })
    await apiFetch(
      `/companies/applications/${editApplicationId.value}/resubmit`,
      {
        method: 'POST',
        body: {},
        token: authStore.token,
      },
    )
    toast.add({ title: '已重新提交，等待相关人员重新同意', color: 'primary' })
    editDialogOpen.value = false
    await refreshAll()
  } catch (error) {
    toast.add({
      title: (error as Error).message || '重新提交失败',
      color: 'error',
    })
  } finally {
    editSubmitting.value = false
  }
}

async function decide(approve: boolean, applicationId: string) {
  actionLoading.value = true
  try {
    if (approve) {
      await companyStore.approveMyApplicationConsents(
        applicationId,
        actionComment.value || undefined,
      )
      toast.add({ title: '已同意', color: 'primary' })
    } else {
      await companyStore.rejectMyApplicationConsents(
        applicationId,
        actionComment.value || undefined,
      )
      toast.add({ title: '已拒绝', color: 'primary' })
    }
    actionComment.value = ''
    await refreshAll()
    if (consentDialogOpen.value) {
      await openConsentDetail(applicationId, selectedWorkflowCode.value)
    }
  } catch (error) {
    toast.add({
      title: (error as Error).message || '操作失败',
      color: 'error',
    })
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    void refreshAll()
  }
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          我的申请 / 待同意
        </h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          查看申请进度、查看谁还没同意，并对需要你同意的申请进行操作。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :disabled="!authStore.isAuthenticated || loading"
          @click="refreshAll"
        />
      </div>
    </div>

    <div
      v-if="!authStore.isAuthenticated"
      class="rounded-xl border border-slate-200 bg-white/90 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/70"
    >
      <p class="text-sm text-slate-600 dark:text-slate-300">请先登录后查看。</p>
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-2">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">
            待我同意
          </h3>
          <UBadge variant="soft" color="neutral" size="sm">
            {{ pendingConsents.length }}
          </UBadge>
        </div>

        <div v-if="pendingConsents.length === 0" class="text-sm text-slate-500">
          暂无待同意项。
        </div>

        <div
          v-for="entry in pendingConsents"
          :key="entry.applicationId"
          class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-900/60"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-medium text-slate-900 dark:text-white">
                {{ entry.name || '（未命名申请）' }}
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <UBadge
                  variant="soft"
                  :color="workflowColor(entry.workflowCode)"
                  size="sm"
                >
                  {{ workflowLabel(entry.workflowCode) }}
                </UBadge>
                <UBadge variant="soft" color="primary" size="sm">
                  {{ statusLabel(entry.status) }}
                </UBadge>
                <UBadge variant="soft" color="neutral" size="sm">
                  待你同意：{{ entry.items.length }}
                </UBadge>
                <span class="text-slate-500 dark:text-slate-400">
                  提交：{{ fmtTime(entry.submittedAt) }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 gap-2">
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                @click="openConsentDetail(entry.applicationId)"
              >
                明细
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="primary"
                :loading="actionLoading"
                @click="decide(true, entry.applicationId)"
              >
                同意
              </UButton>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                :loading="actionLoading"
                @click="decide(false, entry.applicationId)"
              >
                拒绝
              </UButton>
            </div>
          </div>

          <div class="mt-3">
            <UInput
              v-model="actionComment"
              placeholder="可选：填写备注（同意/拒绝时会写入记录）"
              size="sm"
            />
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">
            我发起的申请
          </h3>
          <UBadge variant="soft" color="neutral" size="sm">
            {{ myApplications.length }}
          </UBadge>
        </div>

        <div v-if="myApplications.length === 0" class="text-sm text-slate-500">
          你还没有提交过申请。
        </div>

        <div
          v-for="app in myApplications"
          :key="app.id"
          class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-900/60"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-medium text-slate-900 dark:text-white">
                {{ app.name || '（未命名申请）' }}
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <UBadge
                  variant="soft"
                  :color="workflowColor(app.workflowCode)"
                  size="sm"
                >
                  {{ workflowLabel(app.workflowCode) }}
                </UBadge>
                <UBadge variant="soft" color="primary" size="sm">
                  {{ statusLabel(String(app.status)) }}
                </UBadge>
                <UBadge variant="soft" color="neutral" size="sm">
                  未同意：{{ app.consentCounts.pending }}
                </UBadge>
                <UBadge variant="soft" color="neutral" size="sm">
                  已同意：{{ app.consentCounts.approved }}
                </UBadge>
                <UBadge variant="soft" color="neutral" size="sm">
                  已拒绝：{{ app.consentCounts.rejected }}
                </UBadge>
                <span class="text-slate-500 dark:text-slate-400">
                  提交：{{ fmtTime(app.submittedAt) }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 gap-2">
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                @click="openConsentDetail(app.id, app.workflowCode)"
              >
                查看同意
              </UButton>
              <UButton
                v-if="canWithdraw(String(app.status))"
                size="xs"
                variant="soft"
                color="error"
                :loading="withdrawLoading"
                :disabled="withdrawLoading"
                @click="openWithdraw({ id: app.id, name: app.name })"
              >
                撤回
              </UButton>
              <UButton
                v-if="String(app.status) === 'NEEDS_CHANGES'"
                size="xs"
                variant="soft"
                color="primary"
                @click="openEdit(app.id)"
              >
                修改并重新提交
              </UButton>
            </div>
          </div>

          <div v-if="app.companyId && app.company" class="mt-3 text-xs">
            <span class="text-slate-500 dark:text-slate-400">已生成主体：</span>
            <span class="font-medium text-slate-900 dark:text-white">
              {{ app.company.name }}
            </span>
            <span class="text-slate-500 dark:text-slate-400">
              （{{ app.company.slug }}）
            </span>
          </div>

          <div
            v-if="
              (String(app.status) === 'REJECTED' ||
                String(app.status) === 'NEEDS_CHANGES') &&
              app.reviewComment
            "
            class="mt-3 rounded-lg border border-amber-200/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <div class="font-medium">
              {{
                String(app.status) === 'REJECTED' ? '驳回理由' : '补件/修改要求'
              }}
            </div>
            <div class="mt-1 whitespace-pre-wrap leading-relaxed">
              {{ app.reviewComment }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="consentDialogOpen">
      <template #content>
        <UCard :ui="{ root: 'divide-y divide-gray-100 dark:divide-gray-800' }">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3
                  class="text-base font-semibold text-gray-900 dark:text-white"
                >
                  同意明细
                </h3>
                <p class="mt-1 text-xs text-gray-500">
                  申请ID：{{ selectedApplicationId }}
                </p>
                <p
                  v-if="selectedWorkflowCode === 'company.deregistration'"
                  class="mt-1 text-xs text-gray-500"
                >
                  注销申请需经享有表决权三分之二以上的股东同意后才会进入审批。
                </p>
                <p
                  v-else-if="selectedWorkflowCode === 'company.rename'"
                  class="mt-1 text-xs text-gray-500"
                >
                  更名申请需经享有表决权三分之二以上的股东同意后才会进入审批。
                </p>
                <p
                  v-else-if="selectedWorkflowCode === 'company.equity_transfer'"
                  class="mt-1 text-xs text-gray-500"
                >
                  股权转让申请需先由受让人同意，随后才会进入管理员审批。
                </p>
                <p
                  v-else-if="selectedWorkflowCode === 'company.capital_change'"
                  class="mt-1 text-xs text-gray-500"
                >
                  注册资本变更申请如涉及新增股东，需新增股东同意 + 享有表决权三分之二以上的原股东同意后才会进入审批。
                </p>
                <p
                  v-else-if="selectedWorkflowCode === 'company.change_management'"
                  class="mt-1 text-xs text-gray-500"
                >
                  管理层变更申请需经半数董事（按人数）同意且新任人员同意后，才会进入管理员审批。
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                @click="consentDialogOpen = false"
              />
            </div>
          </template>

          <div class="p-4">
            <div v-if="consentLoading" class="text-sm text-gray-500">
              加载中…
            </div>
            <div v-else-if="!consentDetail" class="text-sm text-gray-500">
              暂无数据。
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="c in consentDetail.consents || []"
                :key="c.id"
                class="rounded-lg border border-gray-200/60 bg-white/50 p-3 dark:border-gray-800/60 dark:bg-slate-800/60"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div
                    class="text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {{
                      c.requiredUser?.profile?.displayName ||
                      c.requiredUser?.name ||
                      c.requiredUser?.email ||
                      '未知用户'
                    }}
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <UBadge
                      size="sm"
                      variant="soft"
                      :color="
                        c.status === 'APPROVED'
                          ? 'primary'
                          : c.status === 'REJECTED'
                            ? 'neutral'
                            : 'neutral'
                      "
                    >
                      {{
                        c.status === 'APPROVED'
                          ? '已同意'
                          : c.status === 'REJECTED'
                            ? '已拒绝'
                            : '待同意'
                      }}
                    </UBadge>
                    <UBadge size="sm" variant="soft" color="neutral">
                      {{ c.role }}
                    </UBadge>
                  </div>
                </div>
                <div
                  v-if="c.shareholderCompany"
                  class="mt-1 text-xs text-gray-500"
                >
                  股东公司：{{ c.shareholderCompany.name }}（{{
                    c.shareholderCompany.slug
                  }}）
                </div>
                <div v-if="c.decidedAt" class="mt-1 text-xs text-gray-500">
                  时间：{{ fmtTime(c.decidedAt) }}
                </div>
                <div v-if="c.comment" class="mt-1 text-xs text-gray-500">
                  备注：{{ c.comment }}
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="withdrawDialogOpen"
      :ui="{ content: 'w-full max-w-lg w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3
                  class="text-base font-semibold text-gray-900 dark:text-white"
                >
                  撤回申请
                </h3>
                <p class="mt-1 text-xs text-gray-500">
                  {{ withdrawTarget?.name || '（未命名申请）' }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                :disabled="withdrawLoading"
                @click="withdrawDialogOpen = false"
              />
            </div>
          </template>

          <div class="p-4 space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-300">
              撤回后申请将不会继续流转，且无法被管理员审批。
            </p>
            <UInput
              v-model="withdrawComment"
              placeholder="可选：撤回原因/备注"
              size="sm"
              :disabled="withdrawLoading"
            />
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="withdrawLoading"
                @click="withdrawDialogOpen = false"
              >
                取消
              </UButton>
              <UButton
                color="error"
                :loading="withdrawLoading"
                :disabled="withdrawLoading"
                @click="confirmWithdraw"
              >
                确认撤回
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="editDialogOpen"
      :ui="{ content: 'w-full max-w-4xl w-[calc(100vw-2rem)]' }"
    >
      <template #content>
        <div
          class="max-h-[80vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-900"
        >
          <div
            class="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3
                  class="text-base font-semibold text-gray-900 dark:text-white"
                >
                  修改申请并重新提交
                </h3>
                <p class="mt-1 text-xs text-gray-500">
                  申请ID：{{ editApplicationId }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                @click="editDialogOpen = false"
              />
            </div>
          </div>

          <div class="p-4 space-y-4">
            <div v-if="editLoading" class="text-sm text-gray-500">加载中…</div>
            <template v-else>
              <div
                v-if="editReviewComment"
                class="rounded-lg border border-amber-200/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <div class="font-medium">补件/修改要求</div>
                <div class="mt-1 whitespace-pre-wrap leading-relaxed">
                  {{ editReviewComment }}
                </div>
              </div>

              <div v-if="editInitial">
                <CompanyApplicationForm
                  :industries="companyStore.meta?.industries ?? []"
                  :types="companyStore.meta?.types ?? []"
                  :submitting="editSubmitting"
                  :initial="editInitial"
                  submit-label="保存并重新提交"
                  @submit="submitEdit"
                />
              </div>
              <div v-else class="text-sm text-gray-500">暂无可编辑数据。</div>
            </template>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>