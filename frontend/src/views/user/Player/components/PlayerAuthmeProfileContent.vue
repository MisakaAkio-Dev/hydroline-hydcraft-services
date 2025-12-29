<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import PlayerGameStatsPanel from './PlayerGameStatsPanel.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import PlayerRecommendationsInline from './PlayerRecommendationsInline.vue'
import type {
  PlayerAuthmeProfileResponse,
  PlayerStatsResponse,
} from '@/types/portal'

const props = defineProps<{
  profile: PlayerAuthmeProfileResponse | null
  stats: PlayerStatsResponse | null
  loading?: boolean
}>()

const profile = computed(() => props.profile)
const panelStats = computed(() => props.stats)
const isLoading = computed(() => Boolean(props.loading))
const displayName = computed(() => {
  if (!profile.value) return '玩家'
  return profile.value.realname || profile.value.username
})

const headAvatarUrl = computed(() => {
  if (!profile.value) return null
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
    profile.value.username,
  )}/128`
})

const lastLoginLabel = computed(() => {
  if (!profile.value?.lastlogin) return '—'
  return dayjs(profile.value.lastlogin).format('YYYY/MM/DD HH:mm:ss')
})

const regDateLabel = computed(() => {
  if (!profile.value?.regdate) return '—'
  return dayjs(profile.value.regdate).format('YYYY/MM/DD HH:mm:ss')
})

const locationLabel = computed(() => {
  if (profile.value?.lastKnownLocationDisplay) {
    return profile.value.lastKnownLocationDisplay
  }
  return profile.value?.ipLocationDisplay ?? '—'
})

const regLocationLabel = computed(() => {
  return profile.value?.regIpLocationDisplay ?? '—'
})

const groupDisplayList = computed(() => {
  if (!profile.value?.luckperms?.length) return []
  const names: string[] = []
  for (const entry of profile.value.luckperms) {
    for (const group of entry.groups ?? []) {
      if (!group) continue
      const label = group.displayName ?? group.group ?? null
      if (label && !names.includes(label)) {
        names.push(label)
      }
    }
  }
  return names
})

const linkedUser = computed(() => profile.value?.linkedUser)

const primaryLuckperms = computed(() => groupDisplayList.value[0] ?? null)

const noop = () => {
  /* no-op */
}
</script>

<template>
  <div v-if="profile" class="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
    <div class="space-y-6 md:pt-6">
      <div class="flex flex-col gap-3">
        <div
          class="h-16 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
        >
          <img
            v-if="headAvatarUrl"
            :src="headAvatarUrl"
            :alt="displayName"
            class="h-full w-full object-cover"
          />
        </div>
        <div>
          <p class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ displayName }}
          </p>
        </div>
      </div>

      <div class="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">最后登录</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ lastLoginLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">登录位置</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ locationLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">注册时间</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ regDateLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">注册地点</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ regLocationLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">权限组</span>
          <span
            class="flex flex-wrap gap-2 text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="groupDisplayList.length">
              <span
                v-for="groupName in groupDisplayList"
                :key="groupName"
                class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                {{ groupName }}
              </span>
            </template>
            <template v-else class="text-sm text-slate-500 dark:text-slate-400">
              位置
            </template>
          </span>
        </div>
        <div v-if="linkedUser" class="flex justify-between items-center">
          <span class="text-slate-500 dark:text-slate-500">关联用户</span>
          <RouterLink
            :to="`/player/${linkedUser.id}`"
            class="flex items-center gap-2 text-base font-semibold text-slate-600 hover:text-primary dark:text-slate-300 dark:hover:text-primary-400"
          >
            <UserAvatar
              :src="linkedUser.avatarUrl"
              :name="linkedUser.displayName"
              size="sm"
              class="h-6 w-6 text-xs"
            />
            <span>{{ linkedUser.displayName }}</span>
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <PlayerGameStatsPanel
        :stats="panelStats"
        :bindings="[]"
        :is-viewing-self="false"
        :refreshing="false"
        @refresh="noop"
      />

      <section class="mt-10">
        <PlayerRecommendationsInline avatar-size="h-6 w-6" />
      </section>
    </div>
  </div>

  <div v-else-if="isLoading" class="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
    <div class="space-y-6 md:pt-6">
      <div class="flex flex-col gap-3">
        <USkeleton
          class="h-16 w-16 rounded-full border border-slate-200 bg-slate-200/70 dark:border-slate-700 dark:bg-slate-700"
        />
        <USkeleton
          class="h-6 w-32 rounded-lg bg-slate-200/70 dark:bg-slate-700"
        />
      </div>

      <div class="mt-4 space-y-3">
        <div class="flex justify-between">
          <USkeleton class="h-4 w-16 bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-5 w-24 bg-slate-200/70 dark:bg-slate-700" />
        </div>
        <div class="flex justify-between">
          <USkeleton class="h-4 w-16 bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-5 w-28 bg-slate-200/70 dark:bg-slate-700" />
        </div>
        <div class="flex justify-between">
          <USkeleton class="h-4 w-16 bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-5 w-24 bg-slate-200/70 dark:bg-slate-700" />
        </div>
        <div class="flex justify-between">
          <USkeleton class="h-4 w-16 bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-5 w-24 bg-slate-200/70 dark:bg-slate-700" />
        </div>
        <div class="flex justify-between">
          <USkeleton class="h-4 w-16 bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-5 w-32 bg-slate-200/70 dark:bg-slate-700" />
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <div
        class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
      >
        <USkeleton
          class="h-5 w-24 rounded-lg bg-slate-200/70 dark:bg-slate-700"
        />
        <div class="mt-4 space-y-3">
          <USkeleton class="h-4 w-full bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-4 w-5/6 bg-slate-200/70 dark:bg-slate-700" />
          <USkeleton class="h-4 w-2/3 bg-slate-200/70 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  </div>

  <div v-else class="mt-8">
    <UAlert
      title="未找到玩家"
      description="请确认玩家名是否正确，或稍后重试。"
      color="warning"
      variant="soft"
    />
  </div>
</template>
