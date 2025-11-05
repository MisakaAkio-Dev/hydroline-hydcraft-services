<script setup lang="ts">
const props = defineProps<{
  hasChanges: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'save'): void
}>()
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/70 bg-primary-50/80 px-4 py-3 text-sm text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200"
  >
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-pencil" class="h-4 w-4" />
      <span>已进入编辑模式，完成后请保存或取消。</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="hasChanges"
        class="text-xs text-primary-600/80 dark:text-primary-200/80"
      >
        检测到未保存的修改
      </span>
      <UButton type="button" variant="ghost" @click="emit('cancel')">
        取消
      </UButton>
      <UButton
        type="button"
        color="primary"
        :loading="props.saving"
        :disabled="props.saving"
        @click="emit('save')"
      >
        保存更改
      </UButton>
    </div>
  </div>
</template>
