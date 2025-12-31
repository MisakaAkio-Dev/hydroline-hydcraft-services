<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  loading?: boolean
  error?: string
  suggestedIds?: string[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { authmeId: string; password: string }): void
  (e: 'submit-passwordless', payload: { authmeId: string }): void
}>()

const form = ref({ authmeId: '', password: '' })

function handleSubmit() {
  emit('submit', { ...form.value })
}

function handleSubmitPasswordless(authmeId: string) {
  emit('submit-passwordless', { authmeId })
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      form.value.authmeId = ''
      form.value.password = ''
    }
  },
)
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="
      (v: boolean) => {
        if (!v) emit('close')
      }
    "
    :ui="{ content: 'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]' }"
  >
    <template #content>
      <div class="p-4 sm:p-6">
        <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">
          绑定 AuthMe 账号
        </h3>
        <div class="mt-4 grid gap-4">
          <UInput
            v-model="form.authmeId"
            placeholder="请输入服务器内登录过的游戏 ID"
          />
          <UInput
            v-model="form.password"
            type="password"
            placeholder="请输入服务器内的登录密码"
          />
        </div>
        <div v-if="props.suggestedIds?.length" class="mt-3 space-y-2">
          <p class="text-xs text-slate-500 dark:text-slate-400">
            已检测到你关联的 Microsoft→Minecraft
            ID，点击即可免输密码绑定（若已被他人绑定，将提示冲突）：
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="id in props.suggestedIds"
              :key="id"
              size="xs"
              color="primary"
              variant="soft"
              :disabled="props.loading"
              @click="handleSubmitPasswordless(id)"
            >
              {{ id }}
            </UButton>
          </div>
        </div>
        <p v-if="props.error" class="mt-3 text-sm text-rose-500">
          {{ props.error }}
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <UButton variant="ghost" @click="emit('close')">取消</UButton>
          <UButton
            color="primary"
            :loading="props.loading"
            @click="handleSubmit"
            >绑定</UButton
          >
        </div>
      </div>
    </template>
  </UModal>
</template>
