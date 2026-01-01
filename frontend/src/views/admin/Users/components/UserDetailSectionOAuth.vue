<script setup lang="ts">
import { computed } from 'vue'
import type { AdminOauthAccount } from '@/types/admin'
import { resolveProviderAccent, resolveProviderIcon } from '@/utils/oauth/brand'
import MinecraftCreeperLogo from '@/assets/resources/brands/minecraft_creeper_logo.svg'
import XboxLogo from '@/assets/resources/brands/xbox_logo.svg'

type ProviderSummary = {
  key: string
  name: string
  type: string
}

type MinecraftSnapshot = {
  updatedAt?: string | null
  java?: { name?: string | null; uuid?: string | null } | null
  bedrock?: { gamertag?: string | null; xuid?: string | null } | null
}

type AccountProfile = {
  displayName?: string | null
  email?: string | null
  userPrincipalName?: string | null
  minecraft?: MinecraftSnapshot | null
}

const props = withDefaults(
  defineProps<{
    providers: ProviderSummary[]
    accounts: AdminOauthAccount[]
    loading?: boolean
    unbindingId?: string | null
    resettingId?: string | null
  }>(),
  {
    providers: () => [],
    accounts: () => [],
    loading: false,
    unbindingId: null,
    resettingId: null,
  },
)

const emit = defineEmits<{
  (e: 'unbind', accountId: string): void
  (e: 'clear-minecraft', accountId: string): void
}>()

const providersByKey = computed(
  () => new Map(props.providers.map((provider) => [provider.key, provider])),
)

const accountsByProvider = computed(() => {
  const map = new Map<string, AdminOauthAccount[]>()
  for (const account of props.accounts) {
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
  return accountsByProvider.value.get(providerKey) ?? []
}

function parseProfile(value: unknown): AccountProfile | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const minecraftRaw = record.minecraft
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
      typeof record.displayName === 'string' ? record.displayName : undefined,
    email: typeof record.email === 'string' ? record.email : undefined,
    userPrincipalName:
      typeof record.userPrincipalName === 'string'
        ? record.userPrincipalName
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

function accountPrimaryLabel(account: AdminOauthAccount | null) {
  if (!account) return '未绑定'
  const profile = parseProfile(account.profile)
  return (
    profile?.displayName ||
    profile?.userPrincipalName ||
    profile?.email ||
    account.providerAccountId
  )
}

function accountSecondaryLabel(account: AdminOauthAccount | null) {
  if (!account) return null
  const profile = parseProfile(account.profile)
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

function hasMinecraftInfo(account: AdminOauthAccount) {
  const profile = parseProfile(account.profile)
  const minecraft = profile?.minecraft
  return Boolean(
    minecraft?.java?.name ||
      minecraft?.java?.uuid ||
      minecraft?.bedrock?.gamertag ||
      minecraft?.bedrock?.xuid,
  )
}

function minecraftSnapshot(account: AdminOauthAccount) {
  return parseProfile(account.profile)?.minecraft ?? null
}

function minecraftAvatarUrl(identifier: string) {
  const safe = identifier.trim() || 'Steve'
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(safe)}`
}

function isMicrosoftAccount(account: AdminOauthAccount) {
  return account.provider?.toLowerCase() === 'microsoft'
}

const extraProviders = computed(() => {
  const result: ProviderSummary[] = []
  for (const [providerKey, accounts] of accountsByProvider.value.entries()) {
    if (providersByKey.value.has(providerKey)) continue
    const sample = accounts[0]
    result.push({
      key: providerKey,
      name: sample?.providerName ?? providerKey,
      type: sample?.providerType ?? '',
    })
  }
  return result
})
</script>

<template>
  <section
    class="rounded-2xl border border-slate-200/70 p-6 dark:border-slate-800/70"
  >
    <div class="flex items-center justify-between">
      <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
        OAuth 绑定
      </div>
    </div>

    <div v-if="providers.length || accounts.length" class="mt-4 space-y-4">
      <div v-for="provider in providers" :key="provider.key" class="space-y-2">
        <div
          class="flex items-center justify-between gap-4 rounded-xl border border-slate-200/70 bg-slate-100/50 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <div class="flex items-center gap-3">
            <div>
              <UIcon
                :name="resolveProviderIcon(provider.type)"
                class="h-7 w-7"
                :class="resolveProviderAccent(provider.type)"
              />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-slate-900 dark:text-white">
                  {{ provider.name }}
                </p>
                <UBadge size="xs" variant="soft">{{
                  accountsForProvider(provider.key).length
                    ? `已绑定 ${accountsForProvider(provider.key).length}`
                    : '未绑定'
                }}</UBadge>
              </div>
            </div>
          </div>
        </div>

        <div v-if="accountsForProvider(provider.key).length" class="space-y-2">
          <div
            v-for="account in accountsForProvider(provider.key)"
            :key="account.id"
            class="rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/40"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div
                  class="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  {{ accountPrimaryLabel(account) }}
                </div>
                <div
                  v-if="accountSecondaryLabel(account)"
                  class="text-[11px] text-slate-500 dark:text-slate-400"
                >
                  {{ accountSecondaryLabel(account) }}
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  {{ account.providerAccountId }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="isMicrosoftAccount(account)"
                  size="xs"
                  color="warning"
                  variant="ghost"
                  :loading="resettingId === account.id"
                  :disabled="loading"
                  @click="emit('clear-minecraft', account.id)"
                >
                  清除游戏数据
                </UButton>
                <UButton
                  size="sm"
                  color="error"
                  variant="link"
                  :loading="unbindingId === account.id"
                  :disabled="loading"
                  @click="emit('unbind', account.id)"
                >
                  解绑
                </UButton>
              </div>
            </div>

            <div
              v-if="hasMinecraftInfo(account)"
              class="mt-3 grid gap-3 text-xs text-slate-600 dark:text-slate-300 md:grid-cols-2"
            >
              <div
                class="relative overflow-hidden rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-700/40 dark:bg-emerald-900/20"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-emerald-700">
                    Java 版
                  </span>
                  <span
                    v-if="minecraftSnapshot(account)?.updatedAt"
                    class="text-[10px] text-emerald-600/80"
                  >
                    {{
                      new Date(
                        minecraftSnapshot(account)?.updatedAt!,
                      ).toLocaleString()
                    }}
                  </span>
                </div>
                <div
                  v-if="minecraftSnapshot(account)?.java?.name"
                  class="mt-2 flex items-center gap-2"
                >
                  <img
                    :src="
                      minecraftAvatarUrl(
                        minecraftSnapshot(account)?.java?.name!,
                      )
                    "
                    class="h-8 w-8 rounded-md border border-emerald-200/70 bg-white/60 object-cover"
                  />
                  <div class="min-w-0">
                    <div
                      class="truncate text-sm font-semibold text-emerald-800"
                    >
                      {{ minecraftSnapshot(account)?.java?.name }}
                    </div>
                    <div class="truncate text-[10px] text-emerald-700/80">
                      UUID：{{ minecraftSnapshot(account)?.java?.uuid || '—' }}
                    </div>
                  </div>
                </div>
                <div v-else class="mt-2 text-[11px] text-emerald-700/70">
                  未检测到 Java 资料
                </div>
                <div class="pointer-events-none absolute -bottom-6 -right-6">
                  <MinecraftCreeperLogo class="h-16 w-16 opacity-20" />
                </div>
              </div>

              <div
                class="relative overflow-hidden rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-700/40 dark:bg-emerald-900/20"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-emerald-700">
                    基岩版
                  </span>
                  <span
                    v-if="minecraftSnapshot(account)?.updatedAt"
                    class="text-[10px] text-emerald-600/80"
                  >
                    {{
                      new Date(
                        minecraftSnapshot(account)?.updatedAt!,
                      ).toLocaleString()
                    }}
                  </span>
                </div>
                <div
                  v-if="minecraftSnapshot(account)?.bedrock?.gamertag"
                  class="mt-2"
                >
                  <div class="text-sm font-semibold text-emerald-800">
                    {{ minecraftSnapshot(account)?.bedrock?.gamertag }}
                  </div>
                  <div class="text-[10px] text-emerald-700/80">
                    XUID：{{ minecraftSnapshot(account)?.bedrock?.xuid || '—' }}
                  </div>
                </div>
                <div v-else class="mt-2 text-[11px] text-emerald-700/70">
                  未检测到基岩资料
                </div>
                <div class="pointer-events-none absolute -bottom-6 -right-6">
                  <XboxLogo class="h-16 w-16 opacity-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          v-else
          class="rounded-xl border border-dashed border-slate-200/70 bg-white/50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-400"
        >
          未绑定
        </div>
      </div>

      <div
        v-if="extraProviders.length"
        class="rounded-xl border border-dashed border-slate-200/80 bg-white/40 p-4 text-xs text-slate-600 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-300"
      >
        <div
          class="mb-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400"
        >
          其他已绑定账号
        </div>
        <div class="space-y-3">
          <div
            v-for="provider in extraProviders"
            :key="provider.key"
            class="space-y-2 rounded-lg border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800/60 dark:bg-slate-900/40"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="resolveProviderIcon(provider.type)"
                class="h-5 w-5"
                :class="resolveProviderAccent(provider.type)"
              />
              <div
                class="text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {{ provider.name }}
              </div>
            </div>
            <div class="space-y-2">
              <div
                v-for="account in accountsForProvider(provider.key)"
                :key="account.id"
                class="flex items-center justify-between gap-3 rounded-md bg-slate-50/80 px-3 py-2 text-xs dark:bg-slate-900/60"
              >
                <div class="min-w-0">
                  <div
                    class="truncate text-sm font-semibold text-slate-800 dark:text-white"
                  >
                    {{ accountPrimaryLabel(account) }}
                  </div>
                  <div
                    class="truncate text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    {{ account.providerAccountId }}
                  </div>
                </div>
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="unbindingId === account.id"
                  :disabled="loading"
                  @click="emit('unbind', account.id)"
                >
                  解绑
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else
      class="mt-4 rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400"
    >
      暂无可用的 OAuth Provider
    </div>
  </section>
</template>
