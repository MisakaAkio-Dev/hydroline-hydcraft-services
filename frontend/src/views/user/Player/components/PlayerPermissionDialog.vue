<script setup lang="ts">
const props = defineProps<{
  open: boolean
  targetGroup: string
  reason: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:targetGroup', value: string): void
  (e: 'update:reason', value: string): void
  (e: 'submit'): void
}>()
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="emit('update:open', $event)"
    :ui="{ content: 'w-full max-w-md' }"
  >
    <template #content>
      <div class="space-y-4">
        <p class="text-lg font-semibold text-slate-900 dark:text-white">
          权限组调整申请
        </p>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300"
            >目标权限组</label
          >
          <UInput
            :model-value="props.targetGroup"
            placeholder="例如：builder"
            @update:model-value="emit('update:targetGroup', $event)"
          />
        </div>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300">说明</label>
          <UTextarea
            :model-value="props.reason"
            placeholder="补充说明"
            @update:model-value="emit('update:reason', $event)"
          />
        </div>
        <div class="flex justify-end gap-3">
          <UButton
            variant="ghost"
            color="neutral"
            @click="emit('update:open', false)"
          >
            取消
          </UButton>
          <UButton color="primary" @click="emit('submit')"> 提交 </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
