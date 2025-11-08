<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ApiError, apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import type { AdminBindingHistoryEntry, AdminUserDetail } from '@/types/admin'

type PasswordMode = 'temporary' | 'custom'

const props = defineProps<{ userId: string | null }>()
const emit = defineEmits<{ (event: 'deleted'): void }>()
const auth = useAuthStore()
const usersStore = useAdminUsersStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const userId = computed(() => props.userId ?? null)
const loading = ref(false)
const detail = ref<AdminUserDetail | null>(null)
const errorMsg = ref<string | null>(null)
const bindingHistory = ref<AdminBindingHistoryEntry[]>([])
const historyLoading = ref(false)
const resetResult = ref<{
  temporaryPassword: string | null
  message: string
} | null>(null)

const passwordDialogOpen = ref(false)
const passwordMode = ref<PasswordMode>('temporary')
const customPassword = ref('')
const showCustomPassword = ref(false)
const passwordSubmitting = ref(false)
const deleteDialogOpen = ref(false)
const deleteSubmitting = ref(false)

const profileForm = reactive({
  displayName: '' as string | null,
  birthday: '' as string | null,
  gender: '' as string | null,
  motto: '' as string | null,
  timezone: '' as string | null,
  locale: '' as string | null,
})

const profileSaving = ref(false)
const joinDateEditing = ref<string | null>(null)
const joinDateSaving = ref(false)

const roleSelection = ref<string[]>([])
const labelSelection = ref<string[]>([])
const roleSaving = ref(false)
const labelSaving = ref(false)

const piicDialogOpen = ref(false)
const piicReason = ref('')
const piicSubmitting = ref(false)

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

const sessions = computed(() => detail.value?.sessions ?? [])

interface UIMinecraftProfile {
  id: string
  isPrimary?: boolean
  nickname: string | null
}

const primaryMinecraft = computed<UIMinecraftProfile | null>(() => {
  const d = detail.value
  if (!d) return null
  const primaryBindId = d.profile?.primaryAuthmeBindingId
  if (!primaryBindId) return null
  const b = (d.authmeBindings ?? []).find((x) => x.id === primaryBindId)
  if (!b || !b.id) return null
  return { id: b.id, isPrimary: true, nickname: b.authmeRealname ?? b.authmeUsername ?? null }
})

// 后端已不再返回 minecraftIds；昵称单独通过接口加载，此处保持空数组占位
const minecraftProfiles = computed<UIMinecraftProfile[]>(() => [])

// 仅用于内部判断时再加回；当前模板不需要这两个布尔值

// === 联系方式管理（声明与加载渠道） ===
const contactDialogOpen = ref(false)
const contactEditingId = ref<string | null>(null)
const contactChannelId = ref<string | null>(null)
const contactValue = ref('')
const contactIsPrimary = ref(false)
const contactSubmitting = ref(false)
const contactChannels = ref<Array<{ id: string; key: string; displayName: string }>>([])

async function ensureContactChannels() {
  if (!auth.token) return
  if (contactChannels.value.length > 0) return
  try {
    const data = await apiFetch<Array<{ id: string; key: string; displayName: string }>>('/auth/contact-channels', { token: auth.token })
    contactChannels.value = data
  } catch (error) {
    console.warn('[admin] fetch contact channels failed', error)
  }
}

function openCreateContactDialog() {
  contactEditingId.value = null
  contactChannelId.value = contactChannels.value[0]?.id ?? null
  contactValue.value = ''
  contactIsPrimary.value = false
  contactDialogOpen.value = true
  void ensureContactChannels()
}

function openEditContactDialog(entry: { id: string; channelId: string; value: string | null; isPrimary?: boolean }) {
  contactEditingId.value = entry.id
  contactChannelId.value = entry.channelId
  contactValue.value = entry.value ?? ''
  contactIsPrimary.value = entry.isPrimary ?? false
  contactDialogOpen.value = true
  void ensureContactChannels()
}

function closeContactDialog() {
  contactDialogOpen.value = false
  contactSubmitting.value = false
}

async function submitContact() {
  if (!auth.token || !detail.value) return
  if (!contactChannelId.value || !contactValue.value.trim()) {
    toast.add({ title: '请填写必要信息', color: 'warning' })
    return
  }
  contactSubmitting.value = true
  try {
    if (!contactEditingId.value) {
      await apiFetch(`/auth/users/${detail.value.id}/contacts`, {
        method: 'POST',
        token: auth.token,
        body: {
          channelId: contactChannelId.value,
          value: contactValue.value.trim(),
          isPrimary: contactIsPrimary.value,
        },
      })
    } else {
      await apiFetch(`/auth/users/${detail.value.id}/contacts/${contactEditingId.value}`, {
        method: 'PATCH',
        token: auth.token,
        body: {
          channelId: contactChannelId.value,
          value: contactValue.value.trim(),
          isPrimary: contactIsPrimary.value,
        },
      })
    }
    toast.add({ title: '联系方式已保存', color: 'primary' })
    await fetchDetail()
    closeContactDialog()
  } catch (error) {
    console.warn('[admin] submit contact failed', error)
    toast.add({ title: '保存失败', color: 'error' })
  } finally {
    contactSubmitting.value = false
  }
}

async function deleteContact(contactId: string) {
  if (!auth.token || !detail.value) return
  if (!window.confirm('确定要删除该联系方式吗？')) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/contacts/${contactId}`, {
      method: 'DELETE',
      token: auth.token,
    })
    toast.add({ title: '已删除', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] delete contact failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  }
}

// === 新增绑定 UI 状态 ===
const createBindingDialogOpen = ref(false)
const createBindingIdentifier = ref('')
const createBindingSetPrimary = ref(true)
const createBindingSubmitting = ref(false)

function openCreateBindingDialog() {
  createBindingIdentifier.value = ''
  createBindingSetPrimary.value = true
  createBindingDialogOpen.value = true
}

function closeCreateBindingDialog() {
  createBindingDialogOpen.value = false
  createBindingSubmitting.value = false
}

async function submitCreateBinding() {
  if (!auth.token || !detail.value) return
  const identifier = createBindingIdentifier.value.trim()
  if (!identifier) {
    toast.add({ title: '请输入要绑定的 AuthMe 标识', color: 'warning' })
    return
  }
  createBindingSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/bindings`, {
      method: 'POST',
      token: auth.token,
      body: { identifier, setPrimary: createBindingSetPrimary.value },
    })
    toast.add({ title: '绑定成功', color: 'primary' })
    closeCreateBindingDialog()
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] create binding failed', error)
    toast.add({ title: '绑定失败', color: 'error' })
  } finally {
    createBindingSubmitting.value = false
  }
}

// === Minecraft 昵称管理 ===
const minecraftProfileDialogOpen = ref(false)
const minecraftNicknameInput = ref('')
const minecraftPrimaryCheckbox = ref(false)
const minecraftSubmitting = ref(false)

function openMinecraftProfileDialog() {
  minecraftNicknameInput.value = ''
  minecraftPrimaryCheckbox.value = false
  minecraftProfileDialogOpen.value = true
}

function closeMinecraftProfileDialog() {
  minecraftProfileDialogOpen.value = false
  minecraftSubmitting.value = false
}

async function submitMinecraftProfile() {
  if (!auth.token || !detail.value) return
  const nickname = minecraftNicknameInput.value.trim()
  if (!nickname) {
    toast.add({ title: '请输入昵称', color: 'warning' })
    return
  }
  minecraftSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/minecraft-profiles`, {
      method: 'POST',
      token: auth.token,
      body: { nickname, isPrimary: minecraftPrimaryCheckbox.value },
    })
    toast.add({ title: '已添加昵称', color: 'primary' })
    closeMinecraftProfileDialog()
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] add minecraft profile failed', error)
    toast.add({ title: '添加失败', color: 'error' })
  } finally {
    minecraftSubmitting.value = false
  }
}

async function markPrimaryMinecraft(profileId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/minecraft-profiles/${profileId}`, {
      method: 'PATCH',
      token: auth.token,
      body: { isPrimary: true },
    })
    toast.add({ title: '已设为主昵称', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] mark primary minecraft failed', error)
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function deleteMinecraftProfile(profileId: string) {
  if (!auth.token || !detail.value) return
  if (!window.confirm('确定要删除该昵称记录吗？')) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/minecraft-profiles/${profileId}`, {
      method: 'DELETE',
      token: auth.token,
    })
    toast.add({ title: '已删除昵称', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] delete minecraft profile failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  }
}

function fmtDateTime(ts?: string | null, format = 'YYYY-MM-DD HH:mm') {
  if (!ts) return '—'
  return dayjs(ts).format(format)
}

function hydratedRoleKeys(data: AdminUserDetail | null) {
  return data?.roles.map((link) => link.role.key).sort() ?? []
}

function hydratedLabelKeys(data: AdminUserDetail | null) {
  return data?.permissionLabels?.map((link) => link.label.key).sort() ?? []
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
  if (!input) {
    return []
  }
  if (typeof input === 'string') {
    return [input]
  }
  if (
    typeof input === 'object' &&
    'value' in (input as Record<string, unknown>)
  ) {
    const value = (input as Record<string, unknown>).value
    return typeof value === 'string' && value.length > 0 ? [value] : []
  }
  return []
}

async function fetchDetail() {
  if (!auth.token) return
  loading.value = true
  errorMsg.value = null
  try {
    const data = await apiFetch<AdminUserDetail>(
      `/auth/users/${userId.value}`,
      { token: auth.token },
    )
    detail.value = data
    profileForm.displayName = data.profile?.displayName ?? ''
    profileForm.birthday = data.profile?.birthday ?? ''
    profileForm.gender = data.profile?.gender ?? ''
    profileForm.motto = data.profile?.motto ?? ''
    profileForm.timezone = data.profile?.timezone ?? ''
    profileForm.locale = data.profile?.locale ?? ''
    joinDateEditing.value = data.joinDate ?? ''
    roleSelection.value = hydratedRoleKeys(data)
    labelSelection.value = hydratedLabelKeys(data)
    await fetchBindingHistory(data.id)
  } catch (error) {
    errorMsg.value =
      error instanceof ApiError ? error.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function fetchBindingHistory(targetId?: string) {
  if (!auth.token) return
  const id = targetId ?? detail.value?.id
  if (!id) return
  historyLoading.value = true
  try {
    const data = await apiFetch<{ items: AdminBindingHistoryEntry[] }>(
      `/auth/users/${id}/bindings/history?page=1&pageSize=50`,
      { token: auth.token },
    )
    bindingHistory.value = data.items
  } finally {
    historyLoading.value = false
  }
}

async function saveProfile() {
  if (!auth.token || !detail.value) return
  profileSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/profile`, {
      method: 'PATCH',
      token: auth.token,
      body: {
        displayName: profileForm.displayName || null,
        birthday: profileForm.birthday || null,
        gender: profileForm.gender || null,
        motto: profileForm.motto || null,
        timezone: profileForm.timezone || null,
        locale: profileForm.locale || null,
      },
    })
    toast.add({ title: '资料已更新', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] update profile failed', error)
    toast.add({ title: '资料更新失败', color: 'error' })
  } finally {
    profileSaving.value = false
  }
}

async function saveJoinDate() {
  if (!auth.token || !detail.value) return
  if (!joinDateEditing.value) {
    toast.add({ title: '请填写有效的日期', color: 'warning' })
    return
  }
  joinDateSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/join-date`, {
      method: 'PATCH',
      token: auth.token,
      body: { joinDate: joinDateEditing.value },
    })
    toast.add({ title: '入服日期已更新', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] update join date failed', error)
    toast.add({ title: '入服日期更新失败', color: 'error' })
  } finally {
    joinDateSaving.value = false
  }
}

async function handleRolesUpdate(nextValue: unknown) {
  if (!auth.token || !detail.value) return
  const sorted = normalizeSelection(nextValue).sort()
  const previous = [...roleSelection.value]
  if (sorted.length === 0) {
    toast.add({ title: '至少需要一个角色', color: 'warning' })
    roleSelection.value = hydratedRoleKeys(detail.value)
    return
  }
  if (JSON.stringify(sorted) === JSON.stringify([...previous].sort())) {
    return
  }
  roleSelection.value = sorted
  roleSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/roles`, {
      method: 'POST',
      token: auth.token,
      body: { roleKeys: sorted },
    })
    toast.add({ title: '角色已更新', color: 'primary' })
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] assign roles failed', error)
    toast.add({ title: '角色更新失败', color: 'error' })
    roleSelection.value = previous
  } finally {
    roleSaving.value = false
  }
}

async function handleLabelsUpdate(nextValue: unknown) {
  if (!auth.token || !detail.value) return
  const sorted = normalizeSelection(nextValue).sort()
  const previous = [...labelSelection.value]
  if (JSON.stringify(sorted) === JSON.stringify([...previous].sort())) {
    return
  }
  labelSelection.value = sorted
  labelSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/permission-labels`, {
      method: 'POST',
      token: auth.token,
      body: { labelKeys: sorted },
    })
    toast.add({ title: '标签已更新', color: 'primary' })
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] assign labels failed', error)
    toast.add({ title: '标签更新失败', color: 'error' })
    labelSelection.value = previous
  } finally {
    labelSaving.value = false
  }
}

function openPiicDialog() {
  if (!detail.value) return
  piicReason.value = ''
  piicDialogOpen.value = true
}

function closePiicDialog() {
  piicDialogOpen.value = false
  piicReason.value = ''
}

watch(piicDialogOpen, (value) => {
  if (!value) {
    piicReason.value = ''
  }
})

watch(passwordDialogOpen, (value) => {
  if (!value) {
    passwordMode.value = 'temporary'
    customPassword.value = ''
    showCustomPassword.value = false
  }
})

watch(deleteDialogOpen, (value) => {
  if (!value) {
    deleteSubmitting.value = false
  }
})

async function confirmPiicRegeneration() {
  if (!auth.token || !detail.value) return
  piicSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/piic/regenerate`, {
      method: 'POST',
      token: auth.token,
      body: piicReason.value.trim() ? { reason: piicReason.value.trim() } : {},
    })
    toast.add({ title: 'PIIC 已重新生成', color: 'primary' })
    closePiicDialog()
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] regenerate piic failed', error)
    toast.add({ title: 'PIIC 生成失败', color: 'error' })
  } finally {
    piicSubmitting.value = false
  }
}

function openResetPasswordDialog() {
  if (!detail.value) return
  passwordDialogOpen.value = true
}

function closeResetPasswordDialog() {
  passwordDialogOpen.value = false
}

async function confirmResetPassword() {
  if (!auth.token || !detail.value) return
  if (passwordMode.value === 'custom' && !customPassword.value.trim()) {
    toast.add({ title: '请填写要设置的密码', color: 'warning' })
    return
  }
  passwordSubmitting.value = true
  try {
    const result = await usersStore.resetPassword(
      detail.value.id,
      passwordMode.value === 'custom' ? customPassword.value : undefined,
    )
    resetResult.value = {
      temporaryPassword: result.temporaryPassword,
      message: result.temporaryPassword
        ? '已生成临时密码，请尽快通知用户并提示修改。'
        : '密码已重置，请尽快通知用户修改。',
    }
    toast.add({ title: '密码已重置', color: 'primary' })
    closeResetPasswordDialog()
  } catch (error) {
    console.warn('[admin] reset password failed', error)
    toast.add({ title: '密码重置失败', color: 'error' })
  } finally {
    passwordSubmitting.value = false
  }
}

function openDeleteDialog() {
  if (!detail.value) return
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  deleteDialogOpen.value = false
  deleteSubmitting.value = false
}

async function confirmDeleteUser() {
  if (!auth.token || !detail.value) return
  deleteSubmitting.value = true
  try {
    await usersStore.delete(detail.value.id)
    toast.add({ title: '用户已删除', color: 'primary' })
    closeDeleteDialog()
    emit('deleted')
  } catch (error) {
    console.warn('[admin] delete user failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

async function markPrimaryBinding(bindingId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/bindings/${bindingId}/primary`,
      { method: 'PATCH', token: auth.token },
    )
    toast.add({ title: '已标记为主绑定', color: 'primary' })
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] mark primary binding failed', error)
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function unbind(bindingId: string) {
  if (!auth.token || !detail.value) return
  if (!window.confirm('确定要解绑该 AuthMe 账号吗？')) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/bindings/${bindingId}`, {
      method: 'DELETE',
      token: auth.token,
    })
    toast.add({ title: '已解绑', color: 'primary' })
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] unbind authme failed', error)
    toast.add({ title: '解绑失败', color: 'error' })
  }
}

onMounted(async () => {
  if (rbacStore.roles.length === 0) {
    await rbacStore.fetchRoles()
  }
  if (rbacStore.labels.length === 0) {
    await rbacStore.fetchLabels()
  }
})

watch(
  () => props.userId,
  async (next) => {
    if (!next) {
      detail.value = null
      bindingHistory.value = []
      joinDateEditing.value = null
      resetResult.value = null
      closeResetPasswordDialog()
  closePiicDialog()
  closeDeleteDialog()
      return
    }
    await fetchDetail()
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 text-sm">
    <section
      class="rounded-2xl border border-red-200/70 bg-red-50/80 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/30"
    >
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h3 class="text-sm font-semibold text-red-700 dark:text-red-300">
            危险操作
          </h3>
          <p class="mt-1 text-xs text-red-600/90 dark:text-red-300/80">
            删除用户会同时清除其会话、绑定与档案，且无法恢复。
          </p>
        </div>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          :disabled="!detail"
          @click="openDeleteDialog"
        >
          删除该用户
        </UButton>
      </div>
    </section>

    <section
      class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50"
    >
      <div
        class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
      >
        <div class="space-y-2">
          <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
            {{ detail?.profile?.displayName ?? detail?.email ?? '用户详情' }}
          </h2>
          <div
            class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300"
          >
            <span v-if="detail?.email">邮箱：{{ detail.email }}</span>
            <span v-if="detail?.name">用户名：{{ detail.name }}</span>
            <span>ID：{{ detail?.id ?? '—' }}</span>
            <span v-if="detail?.statusSnapshot?.status" class="font-medium">
              状态：{{ detail.statusSnapshot.status }}
            </span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="fetchDetail"
          >
            重新载入
          </UButton>
          <UButton
            color="primary"
            variant="soft"
            size="sm"
            :disabled="loading || !detail"
            @click="openResetPasswordDialog"
          >
            重置密码
          </UButton>
        </div>
      </div>

      <div class="mt-6 grid gap-6 sm:grid-cols-2">
        <div class="space-y-2">
          <span
            class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            PIIC
          </span>
          <div class="flex items-center gap-2">
            <span class="font-medium text-slate-900 dark:text-white">
              {{ detail?.profile?.piic ?? '—' }}
            </span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-7 w-7 rounded-full p-0"
              icon="i-lucide-refresh-cw"
              :disabled="!detail || loading"
              @click="openPiicDialog"
            >
              <span class="sr-only">刷新 PIIC</span>
            </UButton>
          </div>
        </div>

        <div class="space-y-2">
          <span
            class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            加入时间
          </span>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <UInput
              id="profile-join-date"
              v-model="joinDateEditing"
              size="xs"
              class="max-w-40"
              placeholder="YYYY-MM-DD"
            />
            <UButton
              color="primary"
              size="xs"
              :loading="joinDateSaving"
              :disabled="!joinDateEditing"
              @click="saveJoinDate"
            >
              更新
            </UButton>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            注册于 {{ fmtDateTime(detail?.createdAt) }}
          </p>
        </div>

        <div class="space-y-2">
          <span
            class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            最近登录
          </span>
          <p class="font-medium text-slate-900 dark:text-white">
            {{ fmtDateTime(detail?.lastLoginAt) }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            IP：{{ detail?.lastLoginIp ?? '—' }}
          </p>
        </div>

        <div class="space-y-2">
          <span
            class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >主绑定</span>
          <template v-if="primaryMinecraft">
            <p class="font-medium text-slate-900 dark:text-white">
              {{ primaryMinecraft.nickname || '—' }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">ID：{{ primaryMinecraft.id }}</p>
          </template>
          <p v-else class="text-xs text-slate-500 dark:text-slate-400">未绑定。</p>
        </div>
      </div>

      <div
        v-if="resetResult"
        class="mt-6 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200"
      >
        <p class="font-medium">{{ resetResult.message }}</p>
        <p
          v-if="resetResult.temporaryPassword"
          class="mt-2 rounded-lg bg-white/80 px-3 py-2 font-mono text-sm tracking-wide text-emerald-700 shadow-sm dark:bg-slate-900/70 dark:text-emerald-200"
        >
          {{ resetResult.temporaryPassword }}
        </p>
      </div>

      <p
        v-if="errorMsg"
        class="mt-6 rounded-xl border border-red-300/80 bg-red-50/80 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      >
        {{ errorMsg }}
      </p>
    </section>

    <section
      class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50"
    >
      <header class="flex items-center justify-between gap-4">
        <div>
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            权限配置
          </h3>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            管理角色与权限标签。
          </p>
        </div>
        <UBadge variant="soft" color="neutral" class="text-[11px]">RBAC</UBadge>
      </header>
      <div class="mt-6 grid gap-6 md:grid-cols-2">
        <div class="space-y-2">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            角色
          </label>
          <USelectMenu
            :model-value="roleSelection"
            :items="roleOptions"
            multiple
            searchable
            size="sm"
            value-key="value"
            label-key="label"
            :disabled="roleSaving || loading"
            :loading="roleSaving || loading"
            placeholder="选择角色"
            @update:model-value="handleRolesUpdate"
          />
          <div
            class="flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400"
          >
            <UBadge
              v-for="link in detail?.roles ?? []"
              :key="link.id"
              color="primary"
              variant="soft"
              class="text-[11px]"
            >
              {{ link.role.name ?? link.role.key }}
            </UBadge>
            <span v-if="(detail?.roles.length ?? 0) === 0"> 未分配 </span>
          </div>
        </div>
        <div class="space-y-2">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            标签
          </label>
          <USelectMenu
            :model-value="labelSelection"
            :items="labelOptions"
            multiple
            searchable
            size="sm"
            value-key="value"
            label-key="label"
            :disabled="labelSaving || loading"
            :loading="labelSaving || loading"
            placeholder="选择标签"
            @update:model-value="handleLabelsUpdate"
          />
          <div
            class="flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400"
          >
            <UBadge
              v-for="link in detail?.permissionLabels ?? []"
              :key="link.id"
              :color="link.label.color ? 'primary' : 'neutral'"
              variant="soft"
              class="text-[11px]"
            >
              {{ link.label.name }}
            </UBadge>
            <span v-if="(detail?.permissionLabels?.length ?? 0) === 0">
              未分配
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-5">
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50 lg:col-span-3"
      >
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            基础资料
          </h3>
          <UButton
            :loading="profileSaving"
            color="primary"
            size="sm"
            :disabled="!detail"
            @click="saveProfile"
          >
            保存资料
          </UButton>
        </div>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div class="space-y-1">
            <label
              for="profile-display-name"
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              显示名称
            </label>
            <UInput
              id="profile-display-name"
              v-model="profileForm.displayName"
              placeholder="显示名称"
            />
          </div>
          <div class="space-y-1">
            <label
              for="profile-locale"
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              语言
            </label>
            <USelect
              id="profile-locale"
              v-model="profileForm.locale"
              :options="[{ label: '中文（简体）', value: 'zh-CN' }]"
              placeholder="选择语言"
            />
          </div>
          <div class="space-y-1">
            <label
              for="profile-timezone"
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              时区
            </label>
            <UInput
              id="profile-timezone"
              v-model="profileForm.timezone"
              placeholder="例如 Asia/Shanghai"
            />
          </div>
          <div class="space-y-1">
            <label
              for="profile-gender"
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              性别
            </label>
            <USelect
              id="profile-gender"
              v-model="profileForm.gender"
              :options="[
                { label: '未指定', value: '' },
                { label: '男', value: 'MALE' },
                { label: '女', value: 'FEMALE' },
              ]"
              placeholder="选择性别"
            />
          </div>
          <div class="space-y-1">
            <label
              for="profile-birthday"
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              生日
            </label>
            <UInput
              id="profile-birthday"
              v-model="profileForm.birthday"
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div class="space-y-1 md:col-span-2">
            <label
              for="profile-motto"
              class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              签名
            </label>
            <UTextarea
              id="profile-motto"
              v-model="profileForm.motto"
              :rows="3"
              placeholder="一句话介绍"
            />
          </div>
        </div>
      </div>
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50 lg:col-span-2"
      >
        <h3
          class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          登录轨迹
        </h3>
        <ul class="mt-4 space-y-3">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="rounded-lg bg-slate-100/60 px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-slate-900 dark:text-white">
                {{ fmtDateTime(session.createdAt) }}
              </span>
              <span>IP：{{ session.ipAddress ?? '—' }}</span>
            </div>
            <p class="mt-1">过期：{{ fmtDateTime(session.expiresAt) }}</p>
            <p class="mt-1 break-all">UA：{{ session.userAgent ?? '—' }}</p>
          </li>
          <li
            v-if="sessions.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无登录记录。
          </li>
        </ul>
      </div>
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50 lg:col-span-5"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            联系方式
          </h3>
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            :disabled="!detail"
            @click="openCreateContactDialog"
          >新增联系方式</UButton>
        </div>
        <ul class="mt-4 space-y-2 text-xs">
          <li
            v-for="c in detail?.contacts ?? []"
            :key="c.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-slate-100/60 px-4 py-2 dark:bg-slate-900/40"
          >
            <div class="flex flex-col">
              <span class="font-medium text-slate-900 dark:text-white">
                {{ c.channel?.displayName ?? c.channel?.key ?? '未知渠道' }}
                <span
                  v-if="c.isPrimary"
                  class="ml-2 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                >主</span>
              </span>
              <span class="text-[11px] text-slate-600 dark:text-slate-300 break-all">{{ c.value }}</span>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="openEditContactDialog(c)"
              >编辑</UButton>
              <UButton
                size="xs"
                color="error"
                variant="soft"
                @click="deleteContact(c.id)"
              >删除</UButton>
            </div>
          </li>
          <li
            v-if="(detail?.contacts?.length ?? 0) === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >暂无联系方式。</li>
        </ul>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-5">
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50 lg:col-span-3"
      >
        <h3
          class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          服务器账户
        </h3>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            :disabled="!detail"
            @click="openCreateBindingDialog"
          >
            新增绑定
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="!detail"
            @click="openMinecraftProfileDialog"
          >
            添加昵称
          </UButton>
        </div>
        <div
          class="mt-4 flex flex-wrap gap-1 text-xs text-slate-500 dark:text-slate-400"
        >
          <UBadge
            v-for="profile in minecraftProfiles"
            :key="profile.id"
            :color="profile.isPrimary ? 'primary' : 'neutral'"
            variant="soft"
            class="text-[11px]"
          >
            {{ profile.nickname || '未命名' }}
          </UBadge>
        </div>
        <div class="mt-6 space-y-6">
          <!-- AuthMe 绑定列表 -->
          <div class="space-y-3">
            <h4 class="text-xs font-semibold text-slate-600 dark:text-slate-300">AuthMe 绑定</h4>
            <ul class="space-y-2">
              <li
                v-for="binding in detail?.authmeBindings ?? []"
                :key="binding.id"
                class="rounded-lg bg-slate-50/80 px-4 py-3 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span class="font-medium text-slate-900 dark:text-white">{{ binding.authmeRealname ?? binding.authmeUsername ?? '未知' }}</span>
                    <span
                      v-if="binding.id && binding.id === detail?.profile?.primaryAuthmeBindingId"
                      class="ml-2 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                    >主绑定</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-if="binding.id && binding.id !== detail?.profile?.primaryAuthmeBindingId"
                      size="xs"
                      color="primary"
                      variant="ghost"
                      @click="markPrimaryBinding(binding.id)"
                    >设为主绑定</UButton>
                    <UButton
                      v-if="binding.id"
                      size="xs"
                      color="error"
                      variant="soft"
                      @click="unbind(binding.id)"
                    >解绑</UButton>
                  </div>
                </div>
                <div class="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <span v-if="binding.authmeUsername">用户名：{{ binding.authmeUsername }}</span>
                  <span v-if="binding.authmeUuid">UUID：{{ binding.authmeUuid }}</span>
                </div>
              </li>
              <li v-if="(detail?.authmeBindings?.length ?? 0) === 0" class="text-xs text-slate-500 dark:text-slate-400">暂无绑定。</li>
            </ul>
          </div>
          <!-- Minecraft 昵称列表 -->
          <div class="space-y-3">
            <h4 class="text-xs font-semibold text-slate-600 dark:text-slate-300">Minecraft 昵称 / 别名</h4>
            <ul class="space-y-2">
              <li
                v-for="p in minecraftProfiles"
                :key="p.id"
                class="rounded-lg bg-slate-100/60 px-4 py-2 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span class="font-medium text-slate-900 dark:text-white">{{ p.nickname || '未命名' }}</span>
                    <span v-if="p.isPrimary" class="ml-2 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">主</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-if="!p.isPrimary"
                      size="xs"
                      color="primary"
                      variant="ghost"
                      @click="markPrimaryMinecraft(p.id)"
                    >设为主</UButton>
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      @click="deleteMinecraftProfile(p.id)"
                    >删除</UButton>
                  </div>
                </div>
              </li>
              <li v-if="minecraftProfiles.length === 0" class="text-xs text-slate-500 dark:text-slate-400">暂无昵称记录。</li>
            </ul>
          </div>
        </div>
      </div>
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50 lg:col-span-2"
      >
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            绑定流转记录
          </h3>
          <USkeleton v-if="historyLoading" class="h-4 w-20" />
        </div>
        <ul class="mt-4 space-y-3">
          <li
            v-for="entry in bindingHistory"
            :key="entry.id"
            class="rounded-lg bg-slate-100/60 px-4 py-3 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-900 dark:text-white">
                {{ entry.action }}
              </span>
              <span>{{ fmtDateTime(entry.createdAt) }}</span>
            </div>
            <p class="mt-1">{{ entry.reason ?? '无备注' }}</p>
            <p class="mt-1">
              操作人：{{
                entry.operator?.profile?.displayName ??
                entry.operator?.email ??
                '系统'
              }}
            </p>
          </li>
          <li
            v-if="!historyLoading && bindingHistory.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无流转记录。
          </li>
        </ul>
      </div>
    </section>
  </div>

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

  <!-- 新增绑定对话框 -->
  <UModal
    :open="createBindingDialogOpen"
    @update:open="createBindingDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">新增 AuthMe 绑定</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeCreateBindingDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          输入 AuthMe 用户名或 Realname 进行绑定，若已存在将更新信息；可选择设为当前用户主绑定。
        </p>
        <div class="space-y-1">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-300">标识</label>
          <UInput
            v-model="createBindingIdentifier"
            placeholder="AuthMe 用户名或 Realname"
            :disabled="createBindingSubmitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="createBindingSetPrimary"
            :disabled="createBindingSubmitting"
            class="h-4 w-4"
          />
          <span>设为主绑定</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="createBindingSubmitting"
            @click="closeCreateBindingDialog"
          >取消</UButton>
          <UButton
            color="primary"
            :loading="createBindingSubmitting"
            @click="submitCreateBinding"
          >绑定</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- 新增 Minecraft 昵称对话框 -->
  <UModal
    :open="minecraftProfileDialogOpen"
    @update:open="minecraftProfileDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">添加 Minecraft 昵称</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeMinecraftProfileDialog"
          />
        </div>
        <div class="space-y-1">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-300">昵称</label>
          <UInput
            v-model="minecraftNicknameInput"
            placeholder="输入昵称"
            :disabled="minecraftSubmitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="minecraftPrimaryCheckbox"
            :disabled="minecraftSubmitting"
            class="h-4 w-4"
          />
          <span>设为主昵称</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="minecraftSubmitting"
            @click="closeMinecraftProfileDialog"
          >取消</UButton>
          <UButton
            color="primary"
            :loading="minecraftSubmitting"
            @click="submitMinecraftProfile"
          >保存</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- 联系方式编辑/新增对话框 -->
  <UModal
    :open="contactDialogOpen"
    @update:open="contactDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">{{ contactEditingId ? '编辑联系方式' : '新增联系方式' }}</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeContactDialog"
          />
        </div>
        <div class="space-y-3">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-600 dark:text-slate-300">渠道</span>
            <USelect
              v-model="contactChannelId"
              :options="contactChannels.map(c => ({ label: c.displayName || c.key, value: c.id }))"
              placeholder="选择渠道"
              :disabled="contactSubmitting"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-600 dark:text-slate-300">内容</span>
            <UInput
              v-model="contactValue"
              :disabled="contactSubmitting"
              placeholder="例如: example@qq.com / Discord Tag / 电话"
            />
          </label>
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
          >
            <input
              type="checkbox"
              v-model="contactIsPrimary"
              :disabled="contactSubmitting"
              class="h-4 w-4"
            />
            <span>设为该渠道主联系方式</span>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="contactSubmitting"
            @click="closeContactDialog"
          >取消</UButton>
          <UButton
            color="primary"
            :loading="contactSubmitting"
            @click="submitContact"
          >保存</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="passwordDialogOpen"
    @update:open="passwordDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">重置密码</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeResetPasswordDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          请选择重置方式，可以生成临时密码或直接指定新密码。
        </p>
        <div class="space-y-3">
          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="temporary"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                生成临时密码
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                系统将自动生成随机密码并显示给你，用户首次登录需修改。
              </p>
            </div>
          </label>

          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="custom"
            />
            <div class="flex-1 space-y-2">
              <div>
                <p class="text-sm font-medium text-slate-900 dark:text-white">
                  指定新密码
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  管理员自定义密码，系统不会额外生成临时密码。
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="customPassword"
                  :disabled="passwordMode !== 'custom'"
                  :type="showCustomPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="输入要设置的新密码"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="passwordMode !== 'custom'"
                  @click="showCustomPassword = !showCustomPassword"
                >
                  <span v-if="showCustomPassword">隐藏</span>
                  <span v-else>显示</span>
                </UButton>
              </div>
            </div>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="closeResetPasswordDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="passwordSubmitting"
            @click="confirmResetPassword"
          >
            确认重置
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deleteDialogOpen"
    @update:open="deleteDialogOpen = $event"
    :ui="{ content: 'w-full max-w-md z-[1101]', overlay: 'z-[1100]' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            确认删除用户
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            删除后将无法恢复该用户的账号、会话与绑定记录，请谨慎操作。
          </p>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{ detail?.profile?.displayName ?? detail?.email ?? detail?.id }}
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDeleteDialog">
            取消
          </UButton>
          <UButton color="error" :loading="deleteSubmitting" @click="confirmDeleteUser">
            确认删除
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
