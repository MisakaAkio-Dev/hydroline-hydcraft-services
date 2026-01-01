<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/user/auth'
import { useFeatureStore } from '@/stores/shared/feature'
import MinecraftCreeperLogo from '@/assets/resources/brands/minecraft_creeper_logo.svg'
import XboxLogo from '@/assets/resources/brands/xbox_logo.svg'

type MinecraftSnapshot = {
  updatedAt?: string | null
  java?: { name?: string | null; uuid?: string | null } | null
  bedrock?: { gamertag?: string | null; xuid?: string | null } | null
}

type AccountProfile = {
  displayName?: string | null
  email?: string | null
  userPrincipalName?: string | null
  avatarDataUri?: string | null
  minecraft?: MinecraftSnapshot | null
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

const microsoftProviderEnabled = computed(() =>
  (featureStore.flags.oauthProviders ?? []).some(
    (p) => p.key?.toLowerCase() === 'microsoft',
  ),
)

function parseProfile(value: unknown): AccountProfile | null {
  if (!value || typeof value !== 'object') return null
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
      typeof profile.displayName === 'string' ? profile.displayName : null,
    email: typeof profile.email === 'string' ? profile.email : null,
    userPrincipalName:
      typeof profile.userPrincipalName === 'string'
        ? profile.userPrincipalName
        : null,
    avatarDataUri:
      typeof profile.avatarDataUri === 'string' ? profile.avatarDataUri : null,
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

const microsoftAccounts = computed<BoundAccount[]>(() => {
  const raw = (auth.user as { accounts?: unknown } | null)?.accounts
  if (!Array.isArray(raw)) return []
  const result: BoundAccount[] = []
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
    if (provider.toLowerCase() !== 'microsoft') continue
    result.push({
      id,
      provider,
      providerAccountId,
      createdAt:
        typeof record.createdAt === 'string' ? record.createdAt : undefined,
      profile: parseProfile(record.profile),
    })
  }
  return result
})

function accountLabel(account: BoundAccount) {
  const p = account.profile
  return (
    p?.displayName ??
    p?.userPrincipalName ??
    p?.email ??
    account.providerAccountId ??
    'Microsoft 账号'
  )
}

function minecraftAvatarUrl(identifier: string) {
  const safe = identifier.trim() || 'Steve'
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(safe)}`
}
</script>

<template>
  <section v-if="microsoftProviderEnabled" class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">
        关联游戏帐户
      </h3>
    </div>

    <div
      v-if="microsoftAccounts.length == 0"
      class="rounded-xl border border-dashed border-slate-200/70 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400 text-center"
    >
      尚未同步 Minecraft 账号下的游戏资料<br />
      请在 <b>隐私与安全 / 社交账号</b> 中同步游戏数据
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="account in microsoftAccounts"
        :key="account.id"
        class="relative overflow-hidden rounded-xl border border-emerald-700/30 bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-sm"
      >
        <div class="flex items-center gap-3">
          <UAvatar
            v-if="account.profile?.avatarDataUri"
            :src="account.profile.avatarDataUri"
            size="lg"
            class="ring-2 ring-white/20"
          />
          <div
            v-else
            class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
          >
            <UIcon name="i-lucide-user-round" class="h-8 w-8 text-white/70" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-base font-semibold">
              {{ accountLabel(account) }}
            </div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div
            class="relative overflow-hidden rounded-xl bg-white/10 p-3 ring-1 ring-white/10"
          >
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold">Java 版</div>
              <div
                class="text-[10px] text-white/60"
                v-if="account.profile?.minecraft?.updatedAt"
              >
                {{
                  new Date(
                    account.profile.minecraft.updatedAt!,
                  ).toLocaleString()
                }}
              </div>
            </div>

            <div
              v-if="account.profile?.minecraft?.java?.name"
              class="mt-2 flex items-center gap-3"
            >
              <img
                :src="minecraftAvatarUrl(account.profile.minecraft.java.name!)"
                class="h-10 w-10 rounded-lg border border-white/15 bg-white/5 object-cover"
              />
              <div class="min-w-0">
                <div class="truncate text-base font-semibold">
                  {{ account.profile.minecraft.java.name }}
                </div>
                <div
                  class="line-clamp-1 truncate flex items-center gap-1 text-xs text-white/70"
                >
                  <UBadge variant="solid" size="xs" color="success"
                    >UUID</UBadge
                  >
                  {{ account.profile.minecraft.java.uuid || '—' }}
                </div>
              </div>
            </div>
            <div v-else class="mt-2 text-sm text-white/70">
              未检测到 Java 资料
            </div>

            <div
              class="pointer-events-none absolute -bottom-6 -right-6 opacity-15"
            >
              <MinecraftCreeperLogo class="h-20 w-20 opacity-80" />
            </div>
          </div>

          <div
            class="relative overflow-hidden rounded-xl bg-white/10 p-3 ring-1 ring-white/10"
          >
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold">基岩版</div>
              <div
                class="text-[10px] text-white/60"
                v-if="account.profile?.minecraft?.updatedAt"
              >
                {{
                  new Date(
                    account.profile.minecraft.updatedAt!,
                  ).toLocaleString()
                }}
              </div>
            </div>

            <div
              v-if="account.profile?.minecraft?.bedrock?.gamertag"
              class="mt-2"
            >
              <div class="text-base font-semibold">
                {{ account.profile.minecraft.bedrock.gamertag }}
              </div>
              <div class="flex items-center gap-1 text-xs text-white/70">
                <UBadge variant="solid" size="xs" color="success">XUID</UBadge>
                {{ account.profile.minecraft.bedrock.xuid || '—' }}
              </div>
            </div>
            <div v-else class="mt-2 text-sm text-white/70">
              未检测到基岩资料
            </div>

            <div
              class="pointer-events-none absolute -bottom-6 -right-6 opacity-15"
            >
              <XboxLogo class="h-20 w-20 opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
