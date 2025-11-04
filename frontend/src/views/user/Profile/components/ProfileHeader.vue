<script setup lang="ts">
defineProps<{
  avatarUrl: string | null
  displayName: string | null
  email: string
  lastSyncedText: string
  joinedText: string
  registeredText?: string
  lastLoginText?: string
  lastLoginIp?: string | null
  loading: boolean
}>()
const emit = defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <div
    class="rounded-3xl border border-slate-200/70 bg-linear-to-r from-white/90 via-white/85 to-white/90 p-px shadow-sm backdrop-blur dark:border-slate-800/70 dark:from-slate-900/80 dark:via-slate-900/85 dark:to-slate-900/80"
  >
    <div class="rounded-[calc(1.5rem-1px)] bg-white/95 p-6 dark:bg-slate-950/80 md:p-8">
      <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-4">
          <UserAvatar :src="avatarUrl ?? undefined" :name="displayName ?? email" size="lg" />
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-primary-500">
              Hydroline 账户
            </p>
            <h2 class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              {{ displayName || '用户' }}
            </h2>
            <p class="text-sm text-slate-600 dark:text-slate-300">
              {{ email }}
            </p>
          </div>
        </div>
        <div class="flex flex-col items-start gap-3 text-sm text-slate-500 md:items-end">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-history" class="h-4 w-4" />
            <span>最后同步：{{ lastSyncedText }}</span>
          </div>
          <div v-if="registeredText" class="flex items-center gap-2">
            <UIcon name="i-lucide-badge-check" class="h-4 w-4" />
            <span>注册于 {{ registeredText }}</span>
          </div>
          <div v-if="joinedText" class="flex items-center gap-2">
            <UIcon name="i-lucide-calendar" class="h-4 w-4" />
            <span>加入于 {{ joinedText }}</span>
          </div>
          <div v-if="lastLoginText" class="flex items-center gap-2">
            <UIcon name="i-lucide-log-in" class="h-4 w-4" />
            <span>上次登录：{{ lastLoginText }}</span>
          </div>
          <div v-if="lastLoginIp" class="flex items-center gap-2">
            <UIcon name="i-lucide-map-pin" class="h-4 w-4" />
            <span>上次登录 IP：{{ lastLoginIp }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              size="xs"
              :disabled="loading"
              icon="i-lucide-refresh-cw"
              @click="emit('refresh')"
            >
              重新同步
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
