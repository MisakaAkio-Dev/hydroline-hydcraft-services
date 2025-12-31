<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/user/auth'
import { useFeatureStore } from '@/stores/shared/feature'
import { useOAuthStore } from '@/stores/shared/oauth'
import { ApiError } from '@/utils/http/api'
import { resolveProviderAccent, resolveProviderIcon } from '@/utils/oauth/brand'
import qqLogo from '@/assets/resources/brands/qq_logo.png'

type AccountProfile = {
  displayName?: string | null
  email?: string | null
  userPrincipalName?: string | null
  avatarDataUri?: string | null
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

const oauthProviders = computed(() => featureStore.flags.oauthProviders ?? [])

function parseProfile(value: unknown): AccountProfile | undefined {
  if (!value || typeof value !== 'object') return undefined
  const profile = value as Record<string, unknown>
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
        error instanceof ApiError ? error.message : '无法启动授权流程',
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
      description: error instanceof ApiError ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    loadingProvider.value = null
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
                    {{ accountPrimaryLabel(account) }}
                  </div>
                  <p
                    v-if="accountSecondaryLabel(account)"
                    class="text-xs text-slate-500 dark:text-slate-400"
                  >
                    {{ accountSecondaryLabel(account) }}
                  </p>
                </div>
              </div>
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
</template>
