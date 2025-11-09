<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import { useUiStore } from '@/stores/ui'
import type { AdminUserListItem } from '@/types/admin'
import UserDetail from './UserDetail.vue'

type SortOrder = 'asc' | 'desc'
type RefreshOptions = {
  page?: number
  sortField?: string
  sortOrder?: SortOrder
}

const uiStore = useUiStore()
const usersStore = useAdminUsersStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const keyword = ref(usersStore.keyword)
const rows = computed(() => usersStore.items)
const pagination = computed(() => usersStore.pagination)
const sortField = computed(() => usersStore.sortField)
const sortOrder = computed(() => usersStore.sortOrder)

const roleOptions = computed(() =>
  rbacStore.roles.map((role) => ({ label: role.name, value: role.key })),
)
const labelOptions = computed(() =>
  rbacStore.labels.map((label) => ({
    label: label.name,
    value: label.key,
    color: label.color ?? undefined,
  })),
)

const roleUpdatingId = ref<string | null>(null)
const labelUpdatingId = ref<string | null>(null)

const piicDialogOpen = ref(false)
const piicDialogUser = ref<AdminUserListItem | null>(null)
const piicReason = ref('')
const piicSubmitting = ref(false)

const detailDialogOpen = ref(false)
const detailSelectedUser = ref<AdminUserListItem | null>(null)

const maxMinecraftAvatars = 3

function fmtDateTime(
  input?: string | null,
  formatOptions?: Intl.DateTimeFormatOptions,
) {
  if (!input) return '—'
  try {
    return new Date(input).toLocaleString(undefined, formatOptions)
  } catch (error) {
    console.warn('[admin] datetime format error', error)
    return input
  }
}

function roleKeysOf(user: AdminUserListItem) {
  return [...(user.roles?.map((link) => link.role.key) ?? [])].sort()
}

function labelKeysOf(user: AdminUserListItem) {
  return [
    ...(user.permissionLabels?.map((link) => link.label.key) ?? []),
  ].sort()
}

function normalizeSelection(input: unknown): string[] {
  if (Array.isArray(input)) {
    if (input.every((item) => typeof item === 'string')) {
      return [...(input as string[])]
    }
    return (input as Array<{ value?: string | null }>)
      .map((item) => item?.value ?? null)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
  }
  if (!input) return []
  if (typeof input === 'string') return [input]
  if (typeof input === 'object' && input !== null) {
    const candidate = input as { value?: unknown }
    if (typeof candidate.value === 'string' && candidate.value.length > 0) {
      return [candidate.value]
    }
  }
  return []
}

async function refresh(options: RefreshOptions = {}) {
  uiStore.startLoading()
  try {
    await usersStore.fetch({
      keyword: keyword.value,
      page: options.page ?? usersStore.pagination.page,
      sortField: options.sortField ?? usersStore.sortField,
      sortOrder: options.sortOrder ?? usersStore.sortOrder,
    })
  } finally {
    uiStore.stopLoading()
  }
}

async function handleSubmit() {
  await refresh({ page: 1 })
}

async function goToPage(page: number) {
  if (
    page === pagination.value.page ||
    page < 1 ||
    page > pagination.value.pageCount
  ) {
    return
  }
  await refresh({ page })
}

function toggleSort(field: string) {
  const nextOrder: SortOrder =
    sortField.value === field
      ? sortOrder.value === 'asc'
        ? 'desc'
        : 'asc'
      : 'desc'
  usersStore.setSort(field, nextOrder)
  void refresh({ page: 1, sortField: field, sortOrder: nextOrder })
}

function sortIcon(field: string) {
  if (sortField.value !== field) return 'i-lucide-arrow-up-down'
  return sortOrder.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

function openPiicDialog(user: AdminUserListItem) {
  piicDialogUser.value = user
  piicReason.value = ''
  piicDialogOpen.value = true
}

function closePiicDialog() {
  piicDialogOpen.value = false
  piicDialogUser.value = null
  piicReason.value = ''
}

watch(piicDialogOpen, (value) => {
  if (!value) {
    piicDialogUser.value = null
    piicReason.value = ''
  }
})

function openDetailDialog(user: AdminUserListItem) {
  detailSelectedUser.value = user
  detailDialogOpen.value = true
}

function closeDetailDialog() {
  detailDialogOpen.value = false
}

watch(detailDialogOpen, (value) => {
  if (!value) {
    detailSelectedUser.value = null
  }
})

async function handleUserDeleted() {
  detailDialogOpen.value = false
  detailSelectedUser.value = null
  await refresh({ page: pagination.value.page })
}

async function confirmPiicRegeneration() {
  if (!piicDialogUser.value) return
  piicSubmitting.value = true
  uiStore.startLoading()
  try {
    await usersStore.regeneratePiic(
      piicDialogUser.value.id,
      piicReason.value.trim() || undefined,
    )
    toast.add({ title: '已重新生成 PIIC', color: 'primary' })
    closePiicDialog()
  } catch (error) {
    console.warn('[admin] regenerate piic failed', error)
    toast.add({ title: 'PIIC 生成失败', color: 'error' })
  } finally {
    piicSubmitting.value = false
    uiStore.stopLoading()
  }
}

async function handleRolesChange(user: AdminUserListItem, value: unknown) {
  const nextKeys = normalizeSelection(value).sort()
  const currentKeys = roleKeysOf(user)
  if (JSON.stringify(nextKeys) === JSON.stringify(currentKeys)) return
  if (nextKeys.length === 0) {
    toast.add({ title: '至少选择一个角色', color: 'warning' })
    await refresh()
    return
  }
  roleUpdatingId.value = user.id
  uiStore.startLoading()
  try {
    await usersStore.assignRoles(user.id, nextKeys)
    toast.add({ title: '角色已更新', color: 'primary' })
  } catch (error) {
    console.warn('[admin] assign roles failed', error)
    toast.add({ title: '更新角色失败', color: 'error' })
  } finally {
    roleUpdatingId.value = null
    uiStore.stopLoading()
  }
}

async function handleLabelsChange(user: AdminUserListItem, value: unknown) {
  const nextKeys = normalizeSelection(value).sort()
  const currentKeys = labelKeysOf(user)
  if (JSON.stringify(nextKeys) === JSON.stringify(currentKeys)) return
  labelUpdatingId.value = user.id
  uiStore.startLoading()
  try {
    await usersStore.assignPermissionLabels(user.id, nextKeys)
    toast.add({ title: '标签已更新', color: 'primary' })
  } catch (error) {
    console.warn('[admin] assign labels failed', error)
    toast.add({ title: '更新标签失败', color: 'error' })
  } finally {
    labelUpdatingId.value = null
    uiStore.stopLoading()
  }
}

type AdminUserAuthmeBinding = {
  id?: string | null
  authmeUsername?: string | null
  authmeRealname?: string | null
  isPrimary?: boolean | null
}

function minecraftBindings(user: AdminUserListItem) {
  // 优先使用后端提供的 authmeBindings（若列表接口已扩展）
  const anyUser = user as unknown as {
    authmeBindings?: AdminUserAuthmeBinding[]
  }
  const raw: AdminUserAuthmeBinding[] = Array.isArray(anyUser.authmeBindings)
    ? anyUser.authmeBindings.filter((x): x is AdminUserAuthmeBinding =>
        Boolean(x),
      )
    : []

  if (raw.length > 0) {
    return raw.map((b) => ({
      id: b.id ?? null,
      username:
        typeof b.authmeUsername === 'string' ? b.authmeUsername.trim() : null,
      realname:
        typeof b.authmeRealname === 'string' ? b.authmeRealname.trim() : null,
      isPrimary: Boolean(b.isPrimary),
    }))
  }

  // 兜底：从 nicknames 推导（仅用于占位显示，无 realname）
  const fallback = (
    user as unknown as {
      nicknames?: Array<{
        id: string
        nickname?: string | null
        isPrimary?: boolean
      }>
    }
  ).nicknames
  return (fallback ?? []).map((n) => ({
    id: n.id,
    username: n.nickname ?? null,
    realname: null as string | null,
    isPrimary: Boolean(n.isPrimary),
  }))
}

const avatarPreviewOpen = ref(false)
const avatarPreviewUser = ref<AdminUserListItem | null>(null)

function openAvatarPreview(user: AdminUserListItem) {
  avatarPreviewUser.value = user
  avatarPreviewOpen.value = true
}

function closeAvatarPreview() {
  avatarPreviewOpen.value = false
  avatarPreviewUser.value = null
}

function mcAvatarUrl(username: string | null | undefined) {
  const u =
    typeof username === 'string' && username.trim().length > 0
      ? username.trim()
      : 'Steve'
  return `https://mc-heads.net/avatar/${encodeURIComponent(u)}`
}

function onAvatarError(ev: Event) {
  const img = ev.target as HTMLImageElement | null
  if (!img) return
  // 避免循环触发
  const ds: DOMStringMap | undefined = (img as HTMLImageElement).dataset
  if (ds && ds.fallback === '1') return
  if (ds) ds.fallback = '1'
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#0f172a"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" fill="#ffffff">MC</text>
  </svg>`
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  img.src = url
}

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh({ page: 1 })
  }
  if (rbacStore.roles.length === 0) {
    await rbacStore.fetchRoles()
  }
  if (rbacStore.labels.length === 0) {
    await rbacStore.fetchLabels()
  }
})
</script>

<template>
  <div class="space-y-6">
    <header
      class="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
          站内用户
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          快速浏览账号资料、权限角色、PIIC 与 AuthMe/Minecraft
          绑定，支持就地调整。
        </p>
      </div>
      <form
        class="flex w-full gap-2 sm:max-w-xl"
        @submit.prevent="handleSubmit"
      >
        <UInput
          v-model="keyword"
          type="search"
          placeholder="搜索邮箱、显示名、用户名或 PIIC"
          class="flex-1"
        />
        <UButton type="submit" color="primary">搜索</UButton>
      </form>
    </header>

    <div
      class="overflow-x-auto rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <table
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/70 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('displayName')"
              >
                <span>用户</span>
                <UIcon :name="sortIcon('displayName')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('piic')"
              >
                <span>PIIC</span>
                <UIcon :name="sortIcon('piic')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('roles')"
              >
                <span>角色</span>
                <UIcon :name="sortIcon('roles')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('labels')"
              >
                <span>标签</span>
                <UIcon :name="sortIcon('labels')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('minecraft')"
              >
                <span>服务器档案</span>
                <UIcon :name="sortIcon('minecraft')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('createdAt')"
              >
                <span>注册时间</span>
                <UIcon :name="sortIcon('createdAt')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3">
              <button
                type="button"
                class="flex items-center gap-1 text-xs font-semibold"
                @click="toggleSort('lastLoginAt')"
              >
                <span>上次登录</span>
                <UIcon :name="sortIcon('lastLoginAt')" class="h-4 w-4" />
              </button>
            </th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="item in rows"
            :key="item.id"
            class="align-top transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-4">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-slate-900 dark:text-white">
                    {{ item.profile?.displayName ?? item.email }}
                  </span>
                  <UBadge
                    v-if="item.statusSnapshot?.status"
                    color="primary"
                    variant="soft"
                    class="text-[11px]"
                  >
                    {{ item.statusSnapshot.status }}
                  </UBadge>
                </div>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  {{ item.email }}
                </span>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-slate-700 dark:text-slate-200">
                  {{ item.profile?.piic ?? '—' }}
                </span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="h-6 w-6 rounded-full p-0 flex justify-center items-center"
                  icon="i-lucide-refresh-cw"
                  :disabled="usersStore.loading"
                  @click="openPiicDialog(item)"
                >
                  <span class="sr-only">重新生成 PIIC</span>
                </UButton>
              </div>
            </td>
            <td class="px-4 py-4 text-sm">
              <USelect
                :model-value="roleKeysOf(item)"
                :items="roleOptions"
                multiple
                searchable
                size="sm"
                class="w-full"
                value-key="value"
                label-key="label"
                placeholder="选择角色"
                :disabled="roleUpdatingId === item.id || usersStore.loading"
                :loading="roleUpdatingId === item.id"
                @update:model-value="(value) => handleRolesChange(item, value)"
              />
            </td>
            <td class="px-4 py-4 text-sm">
              <USelect
                :model-value="labelKeysOf(item)"
                :items="labelOptions"
                multiple
                searchable
                size="sm"
                class="w-full"
                value-key="value"
                label-key="label"
                placeholder="选择标签"
                :disabled="labelUpdatingId === item.id || usersStore.loading"
                :loading="labelUpdatingId === item.id"
                @update:model-value="(value) => handleLabelsChange(item, value)"
              />
            </td>
            <td class="px-4 py-4 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <template v-if="minecraftBindings(item).length">
                  <UTooltip
                    v-for="bind in minecraftBindings(item).slice(
                      0,
                      maxMinecraftAvatars,
                    )"
                    :key="bind.id || bind.username || 'unknown'"
                    :text="bind.realname || bind.username || '—'"
                  >
                    <div class="relative">
                      <img
                        :src="mcAvatarUrl(bind.username)"
                        :alt="bind.username || 'minecraft avatar'"
                        class="h-6 w-6 rounded border border-slate-200 dark:border-slate-700"
                        loading="lazy"
                        @error="onAvatarError"
                      />
                      <span
                        v-if="bind.isPrimary"
                        class="absolute -bottom-1 -right-1 rounded bg-primary-500 px-[3px] text-[9px] leading-3 text-white"
                        >主</span
                      >
                    </div>
                  </UTooltip>
                  <UButton
                    v-if="minecraftBindings(item).length > maxMinecraftAvatars"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    class="h-7 w-7 p-0 rounded-full flex items-center justify-center"
                    icon="i-lucide-ellipsis"
                    @click="openAvatarPreview(item)"
                  >
                    <span class="sr-only">查看更多绑定</span>
                  </UButton>
                </template>
                <span v-else class="text-xs text-slate-400">无绑定</span>
              </div>
            </td>
            <td class="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
              {{ fmtDateTime(item.createdAt) }}
            </td>
            <td class="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="item.lastLoginAt">{{
                fmtDateTime(item.lastLoginAt)
              }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-4 text-right">
              <UButton
                color="primary"
                size="xs"
                variant="soft"
                @click="openDetailDialog(item)"
              >
                查看
              </UButton>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td
              colspan="8"
              class="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              未查询到符合条件的用户。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      class="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300"
    >
      <span
        >第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共
        {{ pagination.total }} 人</span
      >
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page <= 1 || usersStore.loading"
          @click="goToPage(pagination.page - 1)"
        >
          上一页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="
            pagination.page >= pagination.pageCount || usersStore.loading
          "
          @click="goToPage(pagination.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>

    <UModal
      v-model:open="detailDialogOpen"
      :ui="{ content: 'w-full max-w-3xl' }"
    >
      <template #content>
        <div class="flex h-full max-h-[85vh] flex-col">
          <div
            class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800"
          >
            <div>
              <p
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                用户详情
              </p>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ detailSelectedUser?.email ?? '无用户信息' }}
              </h3>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closeDetailDialog"
            />
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <UserDetail
              v-if="detailDialogOpen && detailSelectedUser"
              :user-id="detailSelectedUser.id"
              @deleted="handleUserDeleted"
            />
            <div
              v-else
              class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
            >
              未选择用户。
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="piicDialogOpen"
      @update:open="piicDialogOpen = $event"
      :ui="{ content: 'w-full max-w-lg' }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">重新生成 PIIC</h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closePiicDialog"
            />
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            将为用户重新生成 PIIC 编号，历史编号会作废。请填写备注以便审计记录。
          </p>
          <div class="space-y-1">
            <label
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              备注（可选）
            </label>
            <UTextarea
              v-model="piicReason"
              class="w-full"
              :rows="4"
              placeholder="说明原因或操作背景"
            />
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closePiicDialog"
              >取消</UButton
            >
            <UButton
              color="primary"
              :loading="piicSubmitting"
              @click="confirmPiicRegeneration"
              >确认重新生成</UButton
            >
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="avatarPreviewOpen"
      @update:open="avatarPreviewOpen = $event"
      :ui="{ content: 'w-full max-w-md' }"
    >
      <template #content>
        <div class="p-6 space-y-4 text-sm">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">全部 Minecraft 绑定</h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="closeAvatarPreview"
            />
          </div>
          <div v-if="avatarPreviewUser" class="space-y-3">
            <div class="flex flex-wrap gap-3">
              <template
                v-for="bind in minecraftBindings(avatarPreviewUser)"
                :key="bind.id || bind.username || 'row'"
              >
                <div class="flex flex-col items-center gap-1 w-16">
                  <img
                    :src="mcAvatarUrl(bind.username)"
                    :alt="bind.username || 'minecraft avatar'"
                    class="h-12 w-12 rounded border border-slate-200 dark:border-slate-700 shadow"
                    loading="lazy"
                    @error="onAvatarError"
                  />
                  <span
                    class="text-[11px] font-medium line-clamp-1 w-full text-center"
                    :title="bind.username || '—'"
                  >
                    {{ bind.username || '—' }}
                  </span>
                  <span
                    class="text-[10px] text-slate-500 line-clamp-1 w-full text-center"
                    :title="bind.realname || bind.username || '—'"
                  >
                    {{ bind.realname || bind.username || '—' }}
                    <span
                      v-if="bind.isPrimary"
                      class="ml-1 text-primary-600 font-semibold"
                      >主</span
                    >
                  </span>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="text-xs text-slate-500 dark:text-slate-400">
            未选择用户。
          </div>
          <div class="flex justify-end">
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              @click="closeAvatarPreview"
              >关闭</UButton
            >
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
