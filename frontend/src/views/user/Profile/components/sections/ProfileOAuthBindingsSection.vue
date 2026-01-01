<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { useFeatureStore } from '@/stores/shared/feature'
import { useOAuthStore } from '@/stores/shared/oauth'
import { ApiError, apiFetch } from '@/utils/http/api'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import { resolveProviderAccent, resolveProviderIcon } from '@/utils/oauth/brand'
import qqLogo from '@/assets/resources/brands/qq_logo.png'
import MinecraftCreeperLogo from '@/assets/resources/brands/minecraft_creeper_logo.svg'
import XboxLogo from '@/assets/resources/brands/xbox_logo.svg'

type AccountProfile = {
  displayName?: string | null
  email?: string | null
  userPrincipalName?: string | null
  avatarDataUri?: string | null
  minecraft?: {
    updatedAt?: string | null
    java?: { name?: string | null; uuid?: string | null } | null
    bedrock?: { gamertag?: string | null; xuid?: string | null } | null
  } | null
}

type BoundAccount = {
  id: string
  provider: string
  providerAccountId: string
  createdAt?: string
  profile?: AccountProfile | null
}

const auth = useAuthStore()
const featureStore = useFeatureStore()
const oauthStore = useOAuthStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const oauthProviders = computed(() => featureStore.flags.oauthProviders ?? [])
const deviceFlowOpen = ref(false)
const deviceFlowState = ref<string | null>(null)
const deviceFlowAccountId = ref<string | null>(null)
const deviceFlowUserCode = ref<string | null>(null)
const deviceFlowVerifyUri = ref<string | null>(null)
const deviceFlowInterval = ref(5)
const deviceFlowPolling = ref(false)
const deviceFlowCopyStatus = ref<'idle' | 'success' | 'failed'>('idle')
let deviceFlowTimer: number | null = null
let deviceFlowPopup: Window | null = null

onMounted(() => {
  const candidate = route.query.syncMicrosoftAccount
  if (typeof candidate !== 'string' || candidate.length === 0) return
  const nextQuery = { ...route.query }
  delete nextQuery.syncMicrosoftAccount
  router.replace({ query: nextQuery })
  void syncMicrosoftMinecraft(candidate)
})

onUnmounted(() => {
  if (deviceFlowTimer) {
    window.clearTimeout(deviceFlowTimer)
    deviceFlowTimer = null
  }
  closeDeviceFlowPopup()
})

function parseProfile(value: unknown): AccountProfile | undefined {
  if (!value || typeof value !== 'object') return undefined
  const profile = value as Record<string, unknown>
  const minecraftRaw = profile.minecraft
  const minecraft =
    minecraftRaw && typeof minecraftRaw === 'object'
      ? (minecraftRaw as Record<string, unknown>)
      : null
  const javaRaw = minecraft?.java
  const bedrockRaw = minecraft?.bedrock
  const java =
    javaRaw && typeof javaRaw === 'object'
      ? (javaRaw as Record<string, unknown>)
      : null
  const bedrock =
    bedrockRaw && typeof bedrockRaw === 'object'
      ? (bedrockRaw as Record<string, unknown>)
      : null
  return {
    displayName:
      typeof profile.displayName === 'string' ? profile.displayName : undefined,
    email: typeof profile.email === 'string' ? profile.email : undefined,
    userPrincipalName:
      typeof profile.userPrincipalName === 'string'
        ? profile.userPrincipalName
        : undefined,
    avatarDataUri:
      typeof profile.avatarDataUri === 'string'
        ? profile.avatarDataUri
        : undefined,
    minecraft: minecraft
      ? {
          updatedAt:
            typeof minecraft.updatedAt === 'string'
              ? minecraft.updatedAt
              : null,
          java: java
            ? {
                name: typeof java.name === 'string' ? java.name : null,
                uuid: typeof java.uuid === 'string' ? java.uuid : null,
              }
            : null,
          bedrock: bedrock
            ? {
                gamertag:
                  typeof bedrock.gamertag === 'string'
                    ? bedrock.gamertag
                    : null,
                xuid: typeof bedrock.xuid === 'string' ? bedrock.xuid : null,
              }
            : null,
        }
      : null,
  }
}

const boundAccounts = computed<BoundAccount[]>(() => {
  const raw = (auth.user as { accounts?: unknown } | null)?.accounts
  if (!Array.isArray(raw)) return []
  const normalized: BoundAccount[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const provider = record.provider
    const providerAccountId = record.providerAccountId
    const id = record.id
    if (
      typeof provider !== 'string' ||
      typeof providerAccountId !== 'string' ||
      typeof id !== 'string'
    ) {
      continue
    }
    normalized.push({
      id,
      provider,
      providerAccountId,
      createdAt:
        typeof record.createdAt === 'string' ? record.createdAt : undefined,
      profile: parseProfile(record.profile),
    })
  }
  return normalized
})

const boundAccountsByProvider = computed(() => {
  const map = new Map<string, BoundAccount[]>()
  for (const account of boundAccounts.value) {
    const list = map.get(account.provider)
    if (list) {
      list.push(account)
    } else {
      map.set(account.provider, [account])
    }
  }
  return map
})

function accountsForProvider(providerKey: string) {
  return boundAccountsByProvider.value.get(providerKey) ?? []
}

function hasBoundAccount(providerKey: string) {
  return accountsForProvider(providerKey).length > 0
}

function accountPrimaryLabel(account: BoundAccount) {
  const profile = account.profile
  return (
    profile?.displayName ??
    profile?.userPrincipalName ??
    profile?.email ??
    account.providerAccountId
  )
}

function accountSecondaryLabel(account: BoundAccount) {
  const profile = account.profile
  if (!profile) return null
  const primary = accountPrimaryLabel(account)
  const candidate =
    profile.userPrincipalName && profile.userPrincipalName !== primary
      ? profile.userPrincipalName
      : profile.email && profile.email !== primary
        ? profile.email
        : null
  return candidate
}

function accountAvatar(account: BoundAccount) {
  return account.profile?.avatarDataUri ?? null
}

const loadingProvider = ref<string | null>(null)
const syncLoadingAccountId = ref<string | null>(null)
const isConfirmModalOpen = ref(false)
const pendingUnbind = ref<{
  providerKey: string
  account: BoundAccount
} | null>(null)

function getPendingAccountLabel() {
  const account = pendingUnbind.value?.account
  if (!account) return '该账号'
  return (
    account.profile?.displayName ??
    account.profile?.email ??
    account.providerAccountId ??
    '该账号'
  )
}

async function bindProvider(providerKey: string) {
  if (!auth.token) {
    toast.add({ title: '请先登录', color: 'error' })
    return
  }
  loadingProvider.value = providerKey
  try {
    const callbackUrl = `${window.location.origin}/oauth/callback?redirect=${encodeURIComponent(window.location.href)}`
    const result = await oauthStore.startFlow(
      providerKey,
      {
        mode: 'BIND',
        redirectUri: callbackUrl,
        rememberMe: true,
      },
      { token: auth.token },
    )
    window.location.href = result.authorizeUrl
  } catch (error) {
    loadingProvider.value = null
    toast.add({
      title: '绑定失败',
      description:
        translateAuthErrorMessage(
          error instanceof ApiError
            ? (error.rawMessage ?? error.message)
            : error,
        ) || '无法启动授权流程',
      color: 'error',
    })
  }
}

async function startXboxDeviceFlow(accountId: string) {
  if (!auth.token) {
    toast.add({ title: '请先登录', color: 'error' })
    return
  }
  syncLoadingAccountId.value = accountId
  try {
    const result = await apiFetch<{
      state: string
      userCode: string
      verificationUri: string
      interval: number
      expiresIn: number
    }>(
      `/oauth/providers/microsoft/bindings/${encodeURIComponent(accountId)}/xbox-device`,
      { method: 'POST', token: auth.token },
    )
    deviceFlowState.value = result.state
    deviceFlowAccountId.value = accountId
    deviceFlowUserCode.value = result.userCode
    deviceFlowVerifyUri.value = result.verificationUri
    deviceFlowInterval.value = Math.max(result.interval || 5, 3)
    deviceFlowOpen.value = true
    deviceFlowCopyStatus.value = 'idle'
    startDeviceFlowPolling()
  } catch (error) {
    closeDeviceFlowPopup()
    toast.add({
      title: '同步失败',
      description: translateAuthErrorMessage(
        error instanceof ApiError ? (error.rawMessage ?? error.message) : error,
      ),
      color: 'error',
    })
  } finally {
    syncLoadingAccountId.value = null
  }
}

function openDeviceFlowPopup(url?: string | null) {
  if (!url) return
  try {
    if (deviceFlowPopup && !deviceFlowPopup.closed) {
      deviceFlowPopup.location.href = url
      return
    }
    deviceFlowPopup = window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    deviceFlowPopup = null
  }
}

function closeDeviceFlowPopup() {
  if (deviceFlowPopup && !deviceFlowPopup.closed) {
    deviceFlowPopup.close()
  }
  deviceFlowPopup = null
}

async function copyDeviceFlowCode(userCode: string) {
  if (!userCode) return
  try {
    const primaryCopy = async () => {
      if (!navigator.clipboard?.writeText) return false
      await navigator.clipboard.writeText(userCode)
      return true
    }
    const fallbackCopy = () => {
      const textArea = document.createElement('textarea')
      textArea.value = userCode
      textArea.setAttribute('readonly', 'true')
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      textArea.setSelectionRange(0, userCode.length)
      const copied = document.execCommand('copy')
      document.body.removeChild(textArea)
      return copied
    }
    const copied = (await primaryCopy()) || fallbackCopy()
    if (!copied) {
      throw new Error('Copy failed')
    }
    deviceFlowCopyStatus.value = 'success'
  } catch {
    deviceFlowCopyStatus.value = 'failed'
  }
}

function openDeviceFlowAndCopy() {
  if (deviceFlowUserCode.value) {
    void copyDeviceFlowCode(deviceFlowUserCode.value)
  }
  if (deviceFlowVerifyUri.value) {
    openDeviceFlowPopup(deviceFlowVerifyUri.value)
  }
}

function startDeviceFlowPolling() {
  if (deviceFlowPolling.value) return
  deviceFlowPolling.value = true
  scheduleDeviceFlowPoll(deviceFlowInterval.value)
}

function stopDeviceFlowPolling() {
  deviceFlowPolling.value = false
  if (deviceFlowTimer) {
    window.clearTimeout(deviceFlowTimer)
    deviceFlowTimer = null
  }
}

function scheduleDeviceFlowPoll(delaySeconds: number) {
  if (!deviceFlowPolling.value) return
  if (deviceFlowTimer) {
    window.clearTimeout(deviceFlowTimer)
  }
  deviceFlowTimer = window.setTimeout(() => {
    void pollDeviceFlow()
  }, delaySeconds * 1000)
}

async function pollDeviceFlow() {
  if (!auth.token || !deviceFlowState.value || !deviceFlowAccountId.value) {
    stopDeviceFlowPolling()
    return
  }
  try {
    const result = await apiFetch<{
      status: 'PENDING' | 'AUTHORIZED' | 'DECLINED' | 'EXPIRED' | 'SLOW_DOWN'
      interval?: number
      message?: string
    }>(
      `/oauth/providers/microsoft/bindings/${encodeURIComponent(deviceFlowAccountId.value)}/xbox-device/poll`,
      {
        method: 'POST',
        token: auth.token,
        body: { state: deviceFlowState.value },
      },
    )
    if (result.status === 'PENDING') {
      scheduleDeviceFlowPoll(deviceFlowInterval.value)
      return
    }
    if (result.status === 'SLOW_DOWN') {
      const nextInterval = Math.max(result.interval ?? 5, 3)
      deviceFlowInterval.value = nextInterval
      scheduleDeviceFlowPoll(nextInterval)
      return
    }
    if (result.status === 'AUTHORIZED') {
      stopDeviceFlowPolling()
      deviceFlowOpen.value = false
      closeDeviceFlowPopup()
      await syncMicrosoftMinecraft(deviceFlowAccountId.value)
      return
    }
    stopDeviceFlowPolling()
    deviceFlowOpen.value = false
    closeDeviceFlowPopup()
    toast.add({
      title: '同步失败',
      description: translateAuthErrorMessage(result.message ?? '请求失败'),
      color: 'error',
    })
  } catch (error) {
    stopDeviceFlowPolling()
    deviceFlowOpen.value = false
    closeDeviceFlowPopup()
    toast.add({
      title: '同步失败',
      description: translateAuthErrorMessage(
        error instanceof ApiError ? (error.rawMessage ?? error.message) : error,
      ),
      color: 'error',
    })
  }
}

function openUnbindConfirm(providerKey: string, account: BoundAccount) {
  pendingUnbind.value = { providerKey, account }
  isConfirmModalOpen.value = true
}

function closeUnbindConfirm() {
  isConfirmModalOpen.value = false
  pendingUnbind.value = null
}

async function confirmUnbind() {
  if (!auth.token || !pendingUnbind.value) return
  const { providerKey, account } = pendingUnbind.value
  loadingProvider.value = providerKey
  try {
    await oauthStore.unbind(providerKey, account.id)
    await auth.fetchCurrentUser()
    toast.add({ title: '已解除绑定', color: 'success' })
    closeUnbindConfirm()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: translateAuthErrorMessage(
        error instanceof ApiError ? (error.rawMessage ?? error.message) : error,
      ),
      color: 'error',
    })
  } finally {
    loadingProvider.value = null
  }
}

async function syncMicrosoftMinecraft(accountId: string) {
  if (!auth.token) {
    toast.add({ title: '请先登录', color: 'error' })
    return
  }
  syncLoadingAccountId.value = accountId
  try {
    await apiFetch(
      `/oauth/providers/microsoft/bindings/${encodeURIComponent(accountId)}/sync-minecraft`,
      { method: 'POST', token: auth.token },
    )
    await auth.fetchCurrentUser()
    toast.add({ title: '已同步', color: 'success' })
  } catch (error) {
    if (error instanceof ApiError) {
      const rawMessage = error.rawMessage ?? error.message
      if (
        rawMessage ===
          'Missing Microsoft refresh token, please re-bind this account' ||
        rawMessage ===
          'Xbox Live authentication failed, please re-bind this Microsoft account'
      ) {
        await startXboxDeviceFlow(accountId)
        return
      }
    }
    toast.add({
      title: '同步失败',
      description: translateAuthErrorMessage(
        error instanceof ApiError ? (error.rawMessage ?? error.message) : error,
      ),
      color: 'error',
    })
  } finally {
    syncLoadingAccountId.value = null
  }
}
</script>

<template>
  <section v-if="oauthProviders.length" class="space-y-3">
    <div class="flex items-center justify-between px-1">
      <div>
        <h3
          class="flex items-center gap-2 px-1 text-lg text-slate-600 dark:text-slate-300"
        >
          社交账号
        </h3>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <div
        v-for="provider in oauthProviders"
        :key="provider.key"
        class="rounded-xl border border-slate-200/60 bg-white dark:border-slate-800/60 dark:bg-slate-700/60 overflow-hidden"
      >
        <div class="px-5 py-3 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center">
              <img
                v-if="provider.key?.toLowerCase() === 'qq'"
                :src="qqLogo"
                alt="QQ"
                class="h-5 w-5 object-contain"
              />
              <UIcon
                v-else
                :name="resolveProviderIcon(provider.type)"
                class="h-5 w-5"
                :class="resolveProviderAccent(provider.type)"
              />
            </div>
            <div>
              <div
                class="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100"
              >
                {{ provider.name }}
                <UBadge
                  v-if="hasBoundAccount(provider.key)"
                  color="primary"
                  size="sm"
                  variant="soft"
                  >已绑定</UBadge
                >
                <UBadge v-else color="neutral" size="sm" variant="soft"
                  >无绑定</UBadge
                >
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton
              color="primary"
              size="sm"
              variant="ghost"
              :loading="loadingProvider === provider.key"
              @click="bindProvider(provider.key)"
            >
              新增绑定
            </UButton>
          </div>
        </div>

        <div class="space-y-3 px-3 pb-3" v-if="hasBoundAccount(provider.key)">
          <div
            v-for="account in accountsForProvider(provider.key)"
            :key="account.id"
            class="rounded-xl border border-slate-200/60 bg-white/50 p-4 shadow-slate-900/5 dark:border-slate-800/60 dark:bg-slate-800/70"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <UAvatar
                  v-if="accountAvatar(account)"
                  :src="accountAvatar(account)!"
                  size="lg"
                  class="ring-2 ring-slate-200/50 dark:ring-slate-800/50"
                />
                <div
                  v-else
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-900"
                >
                  <UIcon name="i-lucide-user-round" class="h-9 w-9" />
                </div>
                <div>
                  <div
                    class="text-base font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <span class="inline-flex items-center gap-1.5">
                      <span>{{ accountPrimaryLabel(account) }}</span>
                      <span
                        v-if="provider.key?.toLowerCase() === 'microsoft'"
                        class="inline-flex items-center"
                      >
                        <UTooltip
                          v-if="account.profile?.minecraft?.java?.name"
                          :text="`Java ID：${account.profile.minecraft.java.name}`"
                        >
                          <span
                            class="inline-flex h-5 w-5 items-center justify-center rounded-md"
                          >
                            <MinecraftCreeperLogo
                              class="h-3.5 w-3.5 rounded-xs"
                            />
                          </span>
                        </UTooltip>
                        <UTooltip
                          v-if="account.profile?.minecraft?.bedrock?.gamertag"
                          :text="`基岩 ID：${account.profile.minecraft.bedrock.gamertag}`"
                        >
                          <span
                            class="inline-flex h-5 w-5 items-center justify-center rounded-md"
                          >
                            <XboxLogo
                              class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                            />
                          </span>
                        </UTooltip>
                      </span>
                    </span>
                  </div>
                  <p
                    v-if="accountSecondaryLabel(account)"
                    class="text-xs text-slate-500 dark:text-slate-400"
                  >
                    {{ accountSecondaryLabel(account) }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="provider.key?.toLowerCase() === 'microsoft'"
                  color="primary"
                  size="sm"
                  variant="ghost"
                  :loading="syncLoadingAccountId === account.id"
                  @click="startXboxDeviceFlow(account.id)"
                >
                  同步游戏数据
                </UButton>
                <UButton
                  color="error"
                  size="sm"
                  variant="ghost"
                  :loading="loadingProvider === provider.key"
                  @click="openUnbindConfirm(provider.key, account)"
                >
                  解除绑定
                </UButton>
              </div>
            </div>

            <div
              class="grid gap-4 pt-4 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2"
            >
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  外部账号 ID
                </div>
                <div
                  class="break-all text-base font-semibold text-slate-800 dark:text-slate-100"
                >
                  {{ account.providerAccountId }}
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-500">
                  绑定时间
                </div>
                <div
                  class="text-base font-semibold text-slate-800 dark:text-slate-100"
                >
                  {{
                    account.createdAt
                      ? new Date(account.createdAt).toLocaleString()
                      : '—'
                  }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <UModal
    :open="isConfirmModalOpen"
    @update:open="closeUnbindConfirm"
    :ui="{
      content:
        'w-full max-w-md z-[1101] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      overlay: 'z-[1100]',
    }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            确认解除绑定
          </h3>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{ getPendingAccountLabel() }}
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeUnbindConfirm">
            取消
          </UButton>
          <UButton
            color="error"
            :loading="loadingProvider === pendingUnbind?.providerKey"
            @click="confirmUnbind"
          >
            确认解除绑定
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deviceFlowOpen"
    @update:open="
      (value: boolean) => {
        if (!value) {
          deviceFlowOpen = false
          stopDeviceFlowPolling()
          closeDeviceFlowPopup()
        }
      }
    "
    :ui="{ content: 'w-full max-w-md w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            Xbox 账号授权
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            请在微软页面输入下方代码完成授权，本页会自动检测。
          </p>
        </div>
        <div
          class="rounded-lg border border-emerald-200/60 bg-emerald-50/60 px-4 py-3 text-center text-2xl font-semibold tracking-widest text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-200"
        >
          {{ deviceFlowUserCode || '----' }}
        </div>
        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="text-slate-500 dark:text-slate-400">
            {{
              deviceFlowCopyStatus === 'success'
                ? '验证码已复制到剪贴板'
                : deviceFlowCopyStatus === 'failed'
                  ? '自动复制失败，请手动复制'
                  : '点击按钮复制验证码并打开微软验证页'
            }}
          </span>
          <UButton
            size="xs"
            variant="soft"
            color="primary"
            :disabled="!deviceFlowUserCode || !deviceFlowVerifyUri"
            @click="openDeviceFlowAndCopy"
          >
            复制验证码并打开
          </UButton>
        </div>
        <div
          class="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"
        >
          <span class="truncate">{{ deviceFlowVerifyUri || '—' }}</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
