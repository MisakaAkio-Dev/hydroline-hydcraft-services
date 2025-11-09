<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { AdminUserDetail } from '@/types/admin'
import RegionInlineSelector, {
  type RegionValue,
} from './RegionInlineSelector.vue'
import {
  phoneRegions,
  languageOptions,
  getTimezoneOptionsZh,
} from '@/constants/profile'

const timezoneOptions = computed(() => getTimezoneOptionsZh())

const { detail, profileForm, profileSaving } = defineProps<{
  detail: AdminUserDetail | null
  profileForm: {
    displayName?: string
    birthday?: string
    gender?: string
    motto?: string
    timezone?: string
    locale?: string
    // 新增：电话配置与行政区划
    phoneCountry?: (typeof phoneRegions)[number]['code']
    phone?: string
    region?: RegionValue
  }
  profileSaving: boolean
}>()

const emit = defineEmits<{ (e: 'save'): void }>()

// 打开后默认选择上海（若当前为空）
onMounted(() => {
  if (!profileForm.timezone) {
    profileForm.timezone = 'Asia/Shanghai'
  }
})
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

    <div class="mt-4 grid gap-4 md:grid-cols-2">
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
          :items="languageOptions"
          value-key="value"
          label-key="label"
          placeholder="选择语言"
          class="w-full"
        />
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">时区</div>
        <USelectMenu
          :model-value="profileForm.timezone || 'Asia/Shanghai'"
          :items="timezoneOptions"
          value-key="value"
          label-key="label"
          :filter-fields="['label', 'value']"
          placeholder="选择时区"
          class="w-full"
          @update:model-value="(v: any) => (profileForm.timezone = v)"
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

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">电话</div>
        <div class="flex gap-2">
          <USelect
            v-model="profileForm.phoneCountry"
            :items="phoneRegions"
            class="w-36"
            value-key="code"
            label-key="name"
            placeholder="选择区号"
          />
          <UInput
            v-model="profileForm.phone"
            type="tel"
            class="w-full flex-1"
          />
        </div>
      </div>

      <div class="md:col-span-2">
        <div class="text-xs text-slate-500 dark:text-slate-500">常驻地区</div>
        <RegionInlineSelector
          :model-value="
            profileForm.region ?? {
              country: 'CN',
              province: null,
              city: null,
              district: null,
            }
          "
          @update:model-value="(v: any) => (profileForm.region = v)"
        />
      </div>

      <div class="md:col-span-2">
        <div class="text-xs text-slate-500 dark:text-slate-500">签名</div>
        <UTextarea
          v-model="profileForm.motto"
          :rows="3"
          placeholder="个人签名或座右铭"
          class="w-full"
        />
      </div>
    </div>

    <div class="mt-6 grid gap-4 md:grid-cols-[220px,1fr]"></div>
  </section>
</template>
