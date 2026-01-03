<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { apiFetch } from '@/utils/http/api'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyAuditRecord, CompanyModel } from '@/types/company'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const company = ref<CompanyModel | null>(null)
const loading = ref(false)

const companyId = computed(() => route.params.companyId as string)
const llc = computed(() => company.value?.llcRegistration ?? null)
const ownerUser = computed(() => company.value?.legalRepresentative || null)

function fmtZhDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}年${m}月${d}日`
}

function fmtZhDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function fmtPercent(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2)}%`
}

function shareholderKindLabel(kind?: string | null) {
  if (kind === 'COMPANY') return '企业法人'
  if (kind === 'USER') return '自然人股东'
  return kind || '—'
}

function shareholderIdTypeLabel(kind?: string | null) {
  if (kind === 'COMPANY') return '企业法人营业执照(公司)'
  if (kind === 'USER') return '身份证件'
  return '—'
}

function getShareholderIdNumber(sh: {
  kind: string
  holderUnifiedSocialCreditCode?: string | null
  holderRegistrationNumber?: string | null
}) {
  if (sh.kind === 'COMPANY') {
    return (
      sh.holderUnifiedSocialCreditCode || sh.holderRegistrationNumber || '—'
    )
  }
  return '—'
}

function officerRoleLabel(role?: string | null) {
  const map: Record<string, string> = {
    LEGAL_REPRESENTATIVE: '法定代表人',
    CHAIRPERSON: '董事长',
    VICE_CHAIRPERSON: '副董事长',
    DIRECTOR: '董事',
    MANAGER: '经理',
    DEPUTY_MANAGER: '副经理',
    SUPERVISOR: '监事',
    SUPERVISOR_CHAIRPERSON: '监事会主席',
    FINANCIAL_OFFICER: '财务负责人',
  }
  return (role && map[role]) || role || '—'
}

function computeOperatingTermEnd() {
  const start = company.value?.establishedAt
  const type = llc.value?.operatingTermType
  const years = llc.value?.operatingTermYears

  if (!type) return '—'
  if (type === 'LONG_TERM') return '长期'
  if (type === 'YEARS') {
    if (!start || !years) return '—'
    const d = new Date(start)
    if (Number.isNaN(d.getTime())) return '—'
    d.setFullYear(d.getFullYear() + Number(years))
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}年${m}月${day}日`
  }
  return '—'
}

function stringifyCompact(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function extractBeforeAfter(record: CompanyAuditRecord) {
  const payload = record.payload ?? {}
  const p = payload as Record<string, unknown>

  const before =
    stringifyCompact(p.before ?? p.old ?? p.previous ?? p.prev ?? p.from) || '—'
  const after =
    stringifyCompact(p.after ?? p.new ?? p.next ?? p.to) ||
    record.comment ||
    '—'
  return { before, after }
}

function isChangeRecord(record: CompanyAuditRecord) {
  const key = String(record.actionKey || '').toLowerCase()
  const label = String(record.actionLabel || '').toLowerCase()
  return (
    key.includes('change') ||
    key.includes('rename') ||
    key.includes('deregistration') ||
    label.includes('变更') ||
    label.includes('更名') ||
    label.includes('注销')
  )
}

const changeRecords = computed(() => {
  const all = company.value?.auditTrail ?? []
  const filtered = all.filter(isChangeRecord)
  return filtered.length ? filtered : all
})

async function fetchDetail() {
  if (!companyId.value) return
  loading.value = true
  try {
    company.value = await apiFetch<CompanyModel>(
      `/companies/${companyId.value}`,
      {
        token: authStore.token ?? undefined,
      },
    )
  } catch (error) {
    toast.add({
      title: (error as Error).message || '无法加载公司详情',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchDetail()
})
</script>

<template>
  <section class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      color="primary"
      @click="router.push({ name: 'company.database' })"
    >
      <UIcon name="i-lucide-arrow-left" />
      返回工商数据库
    </UButton>

    <div
      class="rounded-2xl border border-slate-200/70 bg-white/90 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div
        v-if="loading"
        class="flex items-center gap-2 text-sm text-slate-500"
      >
        <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
        <span>加载中...</span>
      </div>

      <div v-else-if="!company" class="text-sm text-slate-500">
        未找到公司信息。
      </div>

      <div v-else class="space-y-6">
        <!-- 顶部标题 -->
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              工商数据库详情
            </p>
            <h2
              class="mt-1 truncate text-2xl font-semibold text-slate-900 dark:text-white"
            >
              {{ company.name }}
            </h2>
            <p class="mt-2 text-sm text-slate-500">
              {{ company.summary || '—' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <CompanyStatusBadge :status="company.status" />
          </div>
        </div>

        <!-- 1 基本信息 -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">
                基本信息
              </div>
              <UBadge variant="soft" color="neutral" size="sm">公示</UBadge>
            </div>
          </template>

          <dl class="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">统一社会信用代码</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.unifiedSocialCreditCode || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">工商登记号</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.registrationNumber || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">企业类型</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.type?.name || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">行业</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.industry?.name || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">法定代表人</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{
                  ownerUser?.displayName ||
                  ownerUser?.name ||
                  ownerUser?.email ||
                  '—'
                }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">成立日期</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ fmtZhDate(company.establishedAt) }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">登记机关</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ llc?.registrationAuthorityName || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">核准日期</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ fmtZhDate(company.approvedAt) }}
              </dd>
            </div>
          </dl>
        </UCard>

        <!-- 2 营业执照信息 -->
        <UCard>
          <template #header>
            <div class="text-sm font-semibold text-slate-900 dark:text-white">
              营业执照信息
            </div>
          </template>

          <dl class="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">统一社会信用代码</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.unifiedSocialCreditCode || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">企业名称</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.name }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">注册号</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.registrationNumber || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">法定代表人</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{
                  ownerUser?.displayName ||
                  ownerUser?.name ||
                  ownerUser?.email ||
                  '—'
                }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">类型</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ company.type?.name || '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">成立日期</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ fmtZhDate(company.establishedAt) }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">注册资本</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ llc?.registeredCapital ?? '—' }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">核准日期</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ fmtZhDate(company.approvedAt) }}
              </dd>
            </div>
            <div
              class="grid grid-cols-[120px_minmax(0,1fr)] gap-3 md:col-span-2"
            >
              <dt class="text-sm text-slate-500">住所</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ llc?.domicileAddress || company.contactAddress || '—' }}
              </dd>
            </div>
            <div
              class="grid grid-cols-[120px_minmax(0,1fr)] gap-3 md:col-span-2"
            >
              <dt class="text-sm text-slate-500">经营范围</dt>
              <dd
                class="whitespace-pre-wrap text-sm leading-relaxed text-slate-900 dark:text-white"
              >
                {{ llc?.businessScope || '—' }}
              </dd>
            </div>
          </dl>
        </UCard>

        <!-- 3 营业期限信息 -->
        <UCard>
          <template #header>
            <div class="text-sm font-semibold text-slate-900 dark:text-white">
              营业期限信息
            </div>
          </template>

          <dl class="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">营业期限自</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ fmtZhDate(company.establishedAt) }}
              </dd>
            </div>
            <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <dt class="text-sm text-slate-500">营业期限至</dt>
              <dd class="text-sm font-medium text-slate-900 dark:text-white">
                {{ computeOperatingTermEnd() }}
              </dd>
            </div>
          </dl>
        </UCard>

        <!-- 4 股东及出资信息 -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">
                股东及出资信息
              </div>
              <UBadge variant="soft" color="neutral" size="sm">
                {{ llc?.shareholders?.length ?? 0 }}
              </UBadge>
            </div>
          </template>

          <div
            v-if="(llc?.shareholders?.length ?? 0) === 0"
            class="text-sm text-slate-500"
          >
            暂无股东及出资信息。
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-[900px] w-full text-sm">
              <thead>
                <tr
                  class="border-b border-slate-200/70 text-left text-slate-500"
                >
                  <th class="py-2 pr-3 w-14">序号</th>
                  <th class="py-2 pr-3">股东名称</th>
                  <th class="py-2 pr-3 w-28">股东类型</th>
                  <th class="py-2 pr-3 w-44">证照/证件类型</th>
                  <th class="py-2 pr-3">证照/证件号码</th>
                  <th class="py-2 pr-3 w-28">出资比例</th>
                  <th class="py-2 pr-3 w-28">表决权比例</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60">
                <tr
                  v-for="(sh, idx) in llc?.shareholders ?? []"
                  :key="`${idx}-${sh.kind}-${sh.userId ?? ''}-${sh.companyId ?? ''}`"
                  class="text-slate-900 dark:text-white"
                >
                  <td class="py-3 pr-3 text-slate-500">{{ idx + 1 }}</td>
                  <td class="py-3 pr-3">
                    {{ sh.holderName || sh.companyId || sh.userId || '—' }}
                  </td>
                  <td class="py-3 pr-3">{{ shareholderKindLabel(sh.kind) }}</td>
                  <td class="py-3 pr-3">
                    {{ shareholderIdTypeLabel(sh.kind) }}
                  </td>
                  <td class="py-3 pr-3">
                    {{ getShareholderIdNumber(sh) }}
                  </td>
                  <td class="py-3 pr-3">{{ fmtPercent(sh.ratio) }}</td>
                  <td class="py-3 pr-3">{{ fmtPercent(sh.votingRatio) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <!-- 5 主要人员信息 -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">
                主要人员信息
              </div>
              <UBadge variant="soft" color="neutral" size="sm">
                {{ llc?.officers?.length ?? 0 }}
              </UBadge>
            </div>
          </template>

          <div
            v-if="(llc?.officers?.length ?? 0) === 0"
            class="text-sm text-slate-500"
          >
            暂无主要人员信息。
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="(of, idx) in llc?.officers ?? []"
              :key="`${idx}-${of.role}-${of.user?.id ?? ''}`"
              class="rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div class="flex items-center gap-3">
                <UAvatar
                  v-if="of.user?.avatarUrl"
                  :src="of.user.avatarUrl"
                  size="md"
                />
                <div
                  v-else
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"
                >
                  <UIcon name="i-lucide-user-round" class="h-5 w-5" />
                </div>

                <div class="min-w-0">
                  <div
                    class="truncate text-sm font-medium text-slate-900 dark:text-white"
                  >
                    {{
                      of.user?.displayName ||
                      of.user?.name ||
                      of.user?.email ||
                      '—'
                    }}
                  </div>
                  <div class="mt-1 text-xs text-slate-500">
                    {{ officerRoleLabel(of.role) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 6 变更信息 -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-semibold text-slate-900 dark:text-white">
                变更信息
              </div>
              <UBadge variant="soft" color="neutral" size="sm">
                {{ changeRecords.length }}
              </UBadge>
            </div>
          </template>

          <div v-if="changeRecords.length === 0" class="text-sm text-slate-500">
            暂无变更信息。
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-[980px] w-full text-sm">
              <thead>
                <tr
                  class="border-b border-slate-200/70 text-left text-slate-500"
                >
                  <th class="py-2 pr-3 w-14">序号</th>
                  <th class="py-2 pr-3 w-56">变更事项</th>
                  <th class="py-2 pr-3">变更前内容</th>
                  <th class="py-2 pr-3">变更后内容</th>
                  <th class="py-2 pr-3 w-40">变更日期</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/60">
                <tr
                  v-for="(record, idx) in changeRecords"
                  :key="record.id"
                  class="align-top text-slate-900 dark:text-white"
                >
                  <td class="py-3 pr-3 text-slate-500">{{ idx + 1 }}</td>
                  <td class="py-3 pr-3">
                    {{ record.actionLabel || record.actionKey || '—' }}
                  </td>
                  <td class="py-3 pr-3">
                    <div class="max-h-16 overflow-hidden whitespace-pre-wrap">
                      {{ extractBeforeAfter(record).before }}
                    </div>
                  </td>
                  <td class="py-3 pr-3">
                    <div class="max-h-16 overflow-hidden whitespace-pre-wrap">
                      {{ extractBeforeAfter(record).after }}
                    </div>
                  </td>
                  <td class="py-3 pr-3 text-slate-500">
                    {{ fmtZhDateTime(record.createdAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </div>
  </section>
</template>
