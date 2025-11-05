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
  <div>
    <div class="rounded-[calc(1.5rem-1px)] p-6 md:p-8">
      <div class="flex gap-5 justify-center items-center flex-col text-center">
        <p
          class="text-sm font-semibold uppercase tracking-wide text-primary-500"
        >
          Hydroline 账户
        </p>
        <div class="flex flex-col justify-center items-center gap-1">
          <UserAvatar
            :src="avatarUrl ?? undefined"
            :name="displayName ?? email"
            class="w-20 h-20"
          />
          <div>
            <h2
              class="mt-1 text-3xl font-semibold text-slate-900 dark:text-white"
            >
              {{ displayName || '用户' }}
            </h2>
            <p class="text-sm text-slate-600 dark:text-slate-300">
              {{ email }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
