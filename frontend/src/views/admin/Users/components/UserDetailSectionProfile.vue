<script setup lang="ts">
import type { AdminUserDetail } from '@/types/admin'

const { detail, profileForm, profileSaving } = defineProps<{
  detail: AdminUserDetail | null
  profileForm: {
    displayName?: string
    birthday?: string
    gender?: string
    motto?: string
    timezone?: string
    locale?: string
  }
  profileSaving: boolean
}>()

const emit = defineEmits<{ (e: 'save'): void }>()
</script>

<template>
  <section
    class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
  >
    <div class="flex items-center justify-between">
      <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
        基础资料
      </div>
      <UButton
        :loading="profileSaving"
        variant="ghost"
        color="neutral"
        size="sm"
        :disabled="!detail"
        @click="emit('save')"
      >
        保存资料
      </UButton>
    </div>

    <div class="mt-4 grid gap-4 md:grid-cols-3">
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">显示名称</div>
        <UInput
          v-model="profileForm.displayName"
          placeholder="显示名称"
          class="w-full"
        />
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">语言</div>
        <USelect
          v-model="profileForm.locale"
          :items="[{ label: '中文（简体）', value: 'zh-CN' }]"
          placeholder="选择语言"
          class="w-full"
        />
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">时区</div>
        <UInput
          v-model="profileForm.timezone"
          placeholder="例如 Asia/Shanghai"
          class="w-full"
        />
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">性别</div>
        <USelect
          v-model="profileForm.gender"
          :items="[
            { label: '未指定', value: 'UNSPECIFIED' },
            { label: '男', value: 'MALE' },
            { label: '女', value: 'FEMALE' },
          ]"
          placeholder="选择性别"
          class="w-full"
        />
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">生日</div>
        <UInput v-model="profileForm.birthday" type="date" class="w-full" />
      </div>

      <div class="md:col-span-3">
        <div class="text-xs text-slate-500 dark:text-slate-500">签名</div>
        <UTextarea
          v-model="profileForm.motto"
          :rows="3"
          placeholder="个人签名或座右铭"
          class="w-full"
        />
      </div>
    </div>
  </section>
</template>
