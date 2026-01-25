<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  AdminAdministrationOrganizationDetail,
  AdminAdministrationOrganizationEntry,
  AdministrationOrganizationKind,
  AdministrationOrganizationLevel,
} from '@/types/admin'
import type { CompanyRef, CompanyUserRef } from '@/types/company'

type ServerSummary = {
  id: string
  name: string
}

type DivisionOption = {
  value: string
  label: string
  levelIndex: number
}

type AdministrationDivisionEntry = {
  id: string
  fullName: string
  levelIndex: number
}

const authStore = useAuthStore()
const toast = useToast()

const servers = ref<ServerSummary[]>([])
const selectedServerId = ref<string>('all')
const selectedKind = ref<'all' | AdministrationOrganizationKind>('all')
const searchKeyword = ref('')

const organizationRows = ref<AdminAdministrationOrganizationEntry[]>([])

const serverOptions = computed(() => [
  { value: 'all', label: '全部服务端' },
  ...servers.value.map((server) => ({ value: server.id, label: server.name })),
])

const kindOptions = [
  { value: 'all', label: '全部类型' },
  { value: 'AGENCY', label: '行政机关' },
  { value: 'PUBLIC_INSTITUTION', label: '事业单位' },
] as const

const serverNameMap = computed(() => {
  const map = new Map<string, string>()
  servers.value.forEach((server) => map.set(server.id, server.name))
  return map
})

const token = computed(() => authStore.token)

async function fetchServers() {
  servers.value = await apiFetch<ServerSummary[]>(
    '/admin/administration/servers',
    {
      token: token.value,
    },
  )
}

async function refreshOrganizations() {
  const params = new URLSearchParams()
  if (selectedServerId.value && selectedServerId.value !== 'all') {
    params.set('serverId', selectedServerId.value)
  }
  if (selectedKind.value && selectedKind.value !== 'all') {
    params.set('kind', selectedKind.value)
  }
  if (searchKeyword.value.trim()) {
    params.set('q', searchKeyword.value.trim())
  }
  const query = params.toString() ? `?${params.toString()}` : ''
  organizationRows.value = await apiFetch<
    AdminAdministrationOrganizationEntry[]
  >(`/admin/administration/organizations${query}`, { token: token.value })
}

watch([selectedServerId, selectedKind], () => {
  void refreshOrganizations()
})

let keywordTimer: number | undefined
watch(
  () => searchKeyword.value,
  (value) => {
    if (keywordTimer) window.clearTimeout(keywordTimer)
    keywordTimer = window.setTimeout(() => {
      const q = value.trim()
      if (!q) {
        void refreshOrganizations()
        return
      }
      void refreshOrganizations()
    }, 320)
  },
)

const dialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingOrganization = ref<AdminAdministrationOrganizationEntry | null>(
  null,
)

const orgForm = reactive<{
  id?: string
  name: string
  kind: AdministrationOrganizationKind
  serverId: string
  level: AdministrationOrganizationLevel
  divisionId?: string
  companyId?: string
}>({
  name: '',
  kind: 'AGENCY',
  serverId: '',
  level: 'SERVER',
  divisionId: undefined,
  companyId: undefined,
})

const levelOptions = [
  { value: 'SERVER', label: '服务器级' },
  { value: 'LEVEL1', label: '一级行政区' },
  { value: 'LEVEL2', label: '二级行政区' },
] as const

const kindOptionsForm = [
  { value: 'AGENCY', label: '行政机关' },
  { value: 'PUBLIC_INSTITUTION', label: '事业单位' },
] as const

const divisionSearchKeyword = ref('')
const divisionCandidates = ref<DivisionOption[]>([])
let divisionSearchTimer: number | undefined
const divisionOptions = computed(() => divisionCandidates.value)

const companySearchKeyword = ref('')
const companyCandidates = ref<CompanyRef[]>([])
let companySearchTimer: number | undefined

const requiredCompanyTypeCode = computed(() =>
  orgForm.kind === 'AGENCY' ? 'state_organ_legal_person' : 'public_institution',
)

const companyOptions = computed(() =>
  companyCandidates.value
    .filter((item) => item.type?.code === requiredCompanyTypeCode.value)
    .map((item) => ({
      value: item.id,
      label: `${item.name}${item.type?.name ? ` · ${item.type.name}` : ''}`,
    })),
)

function resetForm() {
  orgForm.id = undefined
  orgForm.name = ''
  orgForm.kind = 'AGENCY'
  orgForm.serverId = ''
  orgForm.level = 'SERVER'
  orgForm.divisionId = undefined
  orgForm.companyId = undefined
  divisionSearchKeyword.value = ''
  divisionCandidates.value = []
  companySearchKeyword.value = ''
  companyCandidates.value = []
}

function openCreateDialog() {
  resetForm()
  dialogOpen.value = true
}

function openEditDialog(item: AdminAdministrationOrganizationEntry) {
  resetForm()
  editingOrganization.value = item
  orgForm.id = item.id
  orgForm.name = item.name
  orgForm.kind = item.kind
  orgForm.serverId = item.serverId
  orgForm.level = item.level
  orgForm.divisionId = item.division?.id ?? undefined
  orgForm.companyId = item.company?.id ?? undefined
  dialogOpen.value = false
  editDialogOpen.value = true
}

watch(
  () => orgForm.level,
  (level) => {
    if (level === 'SERVER') {
      orgForm.divisionId = undefined
      divisionSearchKeyword.value = ''
      divisionCandidates.value = []
    }
  },
)

watch(
  () => orgForm.serverId,
  () => {
    divisionSearchKeyword.value = ''
    divisionCandidates.value = []
    orgForm.divisionId = undefined
  },
)

watch(
  () => divisionSearchKeyword.value,
  (value) => {
    if (!orgForm.serverId || orgForm.level === 'SERVER') return
    const q = value.trim()
    if (!q) {
      divisionCandidates.value = []
      return
    }
    if (divisionSearchTimer) window.clearTimeout(divisionSearchTimer)
    divisionSearchTimer = window.setTimeout(async () => {
      try {
        const items = await apiFetch<AdministrationDivisionEntry[]>(
          `/admin/administration/divisions?serverId=${encodeURIComponent(
            orgForm.serverId,
          )}&q=${encodeURIComponent(q)}`,
          { token: token.value },
        )
        divisionCandidates.value = items
          .filter((node) =>
            orgForm.level === 'LEVEL1'
              ? node.levelIndex === 1
              : node.levelIndex === 2,
          )
          .map((node) => ({
            value: node.id,
            label: node.fullName,
            levelIndex: node.levelIndex,
          }))
      } catch {
        divisionCandidates.value = []
      }
    }, 360)
  },
)

watch(
  () => companySearchKeyword.value,
  (value) => {
    const q = value.trim()
    if (!q) {
      companyCandidates.value = []
      return
    }
    if (companySearchTimer) window.clearTimeout(companySearchTimer)
    companySearchTimer = window.setTimeout(async () => {
      try {
        companyCandidates.value = await apiFetch<CompanyRef[]>(
          `/companies/search?query=${encodeURIComponent(q)}&limit=12`,
          { token: token.value },
        )
      } catch {
        companyCandidates.value = []
      }
    }, 360)
  },
)

async function handleSubmit() {
  if (!orgForm.serverId) {
    toast.add({ title: '请选择所属服务端', color: 'warning' })
    return
  }
  if (!orgForm.name.trim()) {
    toast.add({ title: '请输入机构名称', color: 'warning' })
    return
  }
  if (orgForm.level !== 'SERVER' && !orgForm.divisionId) {
    toast.add({ title: '请选择关联行政区', color: 'warning' })
    return
  }

  const payload = {
    name: orgForm.name.trim(),
    kind: orgForm.kind,
    level: orgForm.level,
    divisionId: orgForm.level === 'SERVER' ? undefined : orgForm.divisionId,
    companyId: orgForm.companyId || undefined,
  }

  try {
    if (orgForm.id) {
      await apiFetch(`/admin/administration/organizations/${orgForm.id}`, {
        method: 'PATCH',
        token: token.value,
        body: payload,
      })
      toast.add({ title: '行政机构已更新', color: 'primary' })
      editDialogOpen.value = false
    } else {
      await apiFetch(
        `/admin/administration/servers/${orgForm.serverId}/organizations`,
        {
          method: 'POST',
          token: token.value,
          body: payload,
        },
      )
      toast.add({ title: '行政机构已创建', color: 'primary' })
      dialogOpen.value = false
    }
    await refreshOrganizations()
  } catch (error) {
    toast.add({ title: (error as Error).message || '保存失败', color: 'error' })
  }
}

const membersDialogOpen = ref(false)
const membersLoading = ref(false)
const membersSaving = ref(false)
const membersTarget = ref<AdminAdministrationOrganizationDetail | null>(null)

const userLabelCache = reactive<Record<string, string>>({})
function getUserLabel(u: CompanyUserRef) {
  return u.displayName || u.name || u.email || '未知用户'
}
function upsertUserLabel(u: CompanyUserRef) {
  userLabelCache[u.id] = getUserLabel(u)
}
function buildUserItems(candidates: CompanyUserRef[], selectedId?: string) {
  const items = candidates.map((u) => {
    upsertUserLabel(u)
    return { value: u.id, label: getUserLabel(u) }
  })
  if (selectedId && !items.some((x) => x.value === selectedId)) {
    items.unshift({
      value: selectedId,
      label: userLabelCache[selectedId] ?? selectedId,
    })
  }
  return items
}

let searchTimer: number | undefined
function handleUserSearchList(candidates: CompanyUserRef[], query: string) {
  const q = query.trim()
  if (!q) {
    candidates.splice(0, candidates.length)
    return
  }
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    try {
      const next = await apiFetch<CompanyUserRef[]>(
        `/companies/users/search?query=${encodeURIComponent(q)}&limit=8`,
        { token: token.value },
      )
      candidates.splice(0, candidates.length, ...next)
    } catch {
      candidates.splice(0, candidates.length)
    }
  }, 240)
}

type MemberDraft = {
  userId: string | undefined
  search: string
  candidates: CompanyUserRef[]
}

const managerDrafts = ref<MemberDraft[]>([])
const memberDrafts = ref<MemberDraft[]>([])

function addManager() {
  managerDrafts.value.push({ userId: undefined, search: '', candidates: [] })
}
function removeManager(index: number) {
  managerDrafts.value.splice(index, 1)
}
function addMember() {
  memberDrafts.value.push({ userId: undefined, search: '', candidates: [] })
}
function removeMember(index: number) {
  memberDrafts.value.splice(index, 1)
}

async function openMembersDialog(item: AdminAdministrationOrganizationEntry) {
  membersDialogOpen.value = true
  membersLoading.value = true
  managerDrafts.value = []
  memberDrafts.value = []
  try {
    const detail = await apiFetch<AdminAdministrationOrganizationDetail>(
      `/admin/administration/organizations/${item.id}`,
      { token: token.value },
    )
    membersTarget.value = detail
    const managers = detail.members?.filter((m) => m.role === 'MANAGER') ?? []
    const members = detail.members?.filter((m) => m.role === 'MEMBER') ?? []

    managerDrafts.value = managers.length
      ? managers.map((m) => ({
          userId: m.userId,
          search: '',
          candidates: [],
        }))
      : [{ userId: undefined, search: '', candidates: [] }]

    memberDrafts.value = members.length
      ? members.map((m) => ({
          userId: m.userId,
          search: '',
          candidates: [],
        }))
      : []

    for (const m of managers.concat(members)) {
      if (m.user) {
        upsertUserLabel({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          displayName: m.user.profile?.displayName,
        })
      }
    }
  } finally {
    membersLoading.value = false
  }
}

async function saveMembers() {
  if (!membersTarget.value) return
  const managerIds = managerDrafts.value
    .map((d) => d.userId?.trim())
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const memberIds = memberDrafts.value
    .map((d) => d.userId?.trim())
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const managerSet = new Set(managerIds)
  const memberSet = new Set(memberIds)
  for (const id of managerSet) {
    if (memberSet.has(id)) {
      toast.add({ title: '管理人与成员不能重复', color: 'warning' })
      return
    }
  }
  membersSaving.value = true
  try {
    await apiFetch(
      `/admin/administration/organizations/${membersTarget.value.id}/members`,
      {
        method: 'PATCH',
        token: token.value,
        body: { managerIds, memberIds },
      },
    )
    toast.add({ title: '成员已更新', color: 'primary' })
    membersDialogOpen.value = false
    await refreshOrganizations()
  } catch (error) {
    toast.add({ title: (error as Error).message || '保存失败', color: 'error' })
  } finally {
    membersSaving.value = false
  }
}

const organizationRowsView = computed(() =>
  organizationRows.value.map((row) => {
    const members = row.members ?? []
    const managerCount = members.filter((m) => m.role === 'MANAGER').length
    const memberCount = members.filter((m) => m.role === 'MEMBER').length
    return {
      ...row,
      serverName: serverNameMap.value.get(row.serverId) ?? '—',
      managerCount,
      memberCount,
    }
  }),
)

onMounted(async () => {
  await fetchServers()
  await refreshOrganizations()
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          行政机构
        </h1>
        <p class="text-sm text-slate-500">
          维护行政机关与事业单位在行政系统中的主体与对应关系。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UButton color="primary" @click="openCreateDialog">新增机构</UButton>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-3">
      <USelectMenu
        v-model="selectedServerId"
        :items="serverOptions"
        value-key="value"
        placeholder="筛选服务端"
      />
      <USelectMenu
        v-model="selectedKind"
        :items="kindOptions"
        value-key="value"
        placeholder="筛选类型"
      />
      <UInput v-model="searchKeyword" placeholder="搜索机构名称/法人单位" />
    </div>

    <div class="overflow-hidden rounded-xl border border-slate-200/70 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3">机构名称</th>
            <th class="px-4 py-3">类型</th>
            <th class="px-4 py-3">服务端</th>
            <th class="px-4 py-3">关联行政区</th>
            <th class="px-4 py-3">法人单位</th>
            <th class="px-4 py-3">成员</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr
            v-for="row in organizationRowsView"
            :key="row.id"
            class="text-slate-700"
          >
            <td class="px-4 py-3 font-semibold text-slate-900">
              {{ row.name }}
            </td>
            <td class="px-4 py-3">
              {{ row.kind === 'AGENCY' ? '行政机关' : '事业单位' }}
            </td>
            <td class="px-4 py-3">{{ row.serverName }}</td>
            <td class="px-4 py-3">
              {{
                row.level === 'SERVER'
                  ? '服务器级'
                  : row.division?.fullName || '—'
              }}
            </td>
            <td class="px-4 py-3">
              {{ row.company?.name || '未绑定' }}
            </td>
            <td class="px-4 py-3">
              管理人 {{ row.managerCount }} / 成员 {{ row.memberCount }}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="openEditDialog(row)"
                >
                  编辑
                </UButton>
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  @click="openMembersDialog(row)"
                >
                  成员
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="organizationRowsView.length === 0">
            <td
              class="px-4 py-6 text-center text-sm text-slate-500"
              colspan="7"
            >
              暂无行政机构
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="dialogOpen" :ui="{ content: 'w-full max-w-3xl' }">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                新增行政机构
              </p>
              <h3 class="text-lg font-semibold text-slate-900">机构信息</h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="dialogOpen = false"
            />
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">名称</label>
              <UInput v-model="orgForm.name" placeholder="填写机构名称" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">类型</label>
              <USelectMenu
                v-model="orgForm.kind"
                :items="kindOptionsForm"
                value-key="value"
                placeholder="选择类型"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500"
                >所属服务端</label
              >
              <USelectMenu
                v-model="orgForm.serverId"
                :items="serverOptions.filter((s) => s.value !== 'all')"
                value-key="value"
                placeholder="选择服务端"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500"
                >行政层级</label
              >
              <USelectMenu
                v-model="orgForm.level"
                :items="levelOptions"
                value-key="value"
                placeholder="选择层级"
              />
            </div>
          </div>

          <div v-if="orgForm.level !== 'SERVER'" class="space-y-2">
            <label class="text-xs font-semibold text-slate-500"
              >关联行政区</label
            >
            <UInput
              v-model="divisionSearchKeyword"
              placeholder="搜索行政区"
              :disabled="!orgForm.serverId"
            />
            <USelectMenu
              v-model="orgForm.divisionId"
              :items="divisionOptions"
              value-key="value"
              placeholder="选择行政区"
              :disabled="!orgForm.serverId || divisionOptions.length === 0"
            />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-500"
              >关联法人单位</label
            >
            <UInput v-model="companySearchKeyword" placeholder="搜索法人单位" />
            <USelectMenu
              v-model="orgForm.companyId"
              :items="companyOptions"
              value-key="value"
              placeholder="选择法人单位（可选）"
              :disabled="companyOptions.length === 0"
            />
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="dialogOpen = false"
            >
              取消
            </UButton>
            <UButton color="primary" @click="handleSubmit">保存</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="editDialogOpen" :ui="{ content: 'w-full max-w-3xl' }">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                编辑行政机构
              </p>
              <h3 class="text-lg font-semibold text-slate-900">机构信息</h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="editDialogOpen = false"
            />
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">名称</label>
              <UInput v-model="orgForm.name" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500">类型</label>
              <USelectMenu
                v-model="orgForm.kind"
                :items="kindOptionsForm"
                value-key="value"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500"
                >所属服务端</label
              >
              <USelectMenu
                v-model="orgForm.serverId"
                :items="serverOptions.filter((s) => s.value !== 'all')"
                value-key="value"
                placeholder="选择服务端"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold text-slate-500"
                >行政层级</label
              >
              <USelectMenu
                v-model="orgForm.level"
                :items="levelOptions"
                value-key="value"
              />
            </div>
          </div>

          <div v-if="orgForm.level !== 'SERVER'" class="space-y-2">
            <label class="text-xs font-semibold text-slate-500"
              >关联行政区</label
            >
            <UInput
              v-model="divisionSearchKeyword"
              placeholder="搜索行政区"
              :disabled="!orgForm.serverId"
            />
            <USelectMenu
              v-model="orgForm.divisionId"
              :items="divisionOptions"
              value-key="value"
              placeholder="选择行政区"
              :disabled="!orgForm.serverId || divisionOptions.length === 0"
            />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-500"
              >关联法人单位</label
            >
            <UInput v-model="companySearchKeyword" placeholder="搜索法人单位" />
            <USelectMenu
              v-model="orgForm.companyId"
              :items="companyOptions"
              value-key="value"
              placeholder="选择法人单位（可选）"
              :disabled="companyOptions.length === 0"
            />
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="editDialogOpen = false"
            >
              取消
            </UButton>
            <UButton color="primary" @click="handleSubmit">保存</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="membersDialogOpen"
      :ui="{ content: 'w-full max-w-4xl' }"
    >
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">
                成员管理
              </p>
              <h3 class="text-lg font-semibold text-slate-900">
                {{ membersTarget?.name || '行政机构' }}
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="membersDialogOpen = false"
            />
          </div>

          <div v-if="membersLoading" class="text-sm text-slate-500">
            加载中…
          </div>
          <div v-else class="space-y-4">
            <div class="rounded-xl border border-slate-200/70 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-slate-900">管理人</h4>
                <UButton size="xs" variant="soft" @click="addManager">
                  添加
                </UButton>
              </div>
              <div
                v-for="(m, index) in managerDrafts"
                :key="`manager-${index}`"
                class="rounded-xl border border-slate-200/70 p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">
                    管理人 #{{ index + 1 }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="managerDrafts.length <= 1"
                    @click="removeManager(index)"
                  >
                    删除
                  </UButton>
                </div>
                <USelectMenu
                  class="w-full"
                  v-model="m.userId"
                  v-model:search-term="m.search"
                  :items="buildUserItems(m.candidates, m.userId)"
                  value-key="value"
                  label-key="label"
                  searchable
                  placeholder="搜索用户"
                  @update:search-term="
                    (v: string) => handleUserSearchList(m.candidates, v)
                  "
                >
                  <template #trailing="{ modelValue }">
                    <div class="flex items-center gap-1">
                      <UButton
                        v-if="
                          modelValue !== undefined &&
                          modelValue !== null &&
                          String(modelValue) !== ''
                        "
                        type="button"
                        color="neutral"
                        variant="ghost"
                        class="h-6 w-6 p-0 flex justify-center items-center"
                        aria-label="清空"
                        @click.stop.prevent="m.userId = undefined"
                      >
                        <UIcon name="i-lucide-x" class="h-4 w-4" />
                      </UButton>
                      <span class="select-none text-slate-400">▾</span>
                    </div>
                  </template>
                </USelectMenu>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200/70 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-slate-900">下属人员</h4>
                <UButton size="xs" variant="soft" @click="addMember">
                  添加
                </UButton>
              </div>
              <div
                v-if="memberDrafts.length === 0"
                class="text-xs text-slate-500"
              >
                暂无下属人员
              </div>
              <div
                v-for="(m, index) in memberDrafts"
                :key="`member-${index}`"
                class="rounded-xl border border-slate-200/70 p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">
                    成员 #{{ index + 1 }}
                  </p>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="removeMember(index)"
                  >
                    删除
                  </UButton>
                </div>
                <USelectMenu
                  class="w-full"
                  v-model="m.userId"
                  v-model:search-term="m.search"
                  :items="buildUserItems(m.candidates, m.userId)"
                  value-key="value"
                  label-key="label"
                  searchable
                  placeholder="搜索用户"
                  @update:search-term="
                    (v: string) => handleUserSearchList(m.candidates, v)
                  "
                >
                  <template #trailing="{ modelValue }">
                    <div class="flex items-center gap-1">
                      <UButton
                        v-if="
                          modelValue !== undefined &&
                          modelValue !== null &&
                          String(modelValue) !== ''
                        "
                        type="button"
                        color="neutral"
                        variant="ghost"
                        class="h-6 w-6 p-0 flex justify-center items-center"
                        aria-label="清空"
                        @click.stop.prevent="m.userId = undefined"
                      >
                        <UIcon name="i-lucide-x" class="h-4 w-4" />
                      </UButton>
                      <span class="select-none text-slate-400">▾</span>
                    </div>
                  </template>
                </USelectMenu>
              </div>
            </div>

            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                @click="membersDialogOpen = false"
              >
                取消
              </UButton>
              <UButton
                color="primary"
                :loading="membersSaving"
                @click="saveMembers"
              >
                保存
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
