<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  open: boolean
  serverId: string
  reason: string
  serverOptions: Array<{ id: string; displayName: string }>
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:serverId', value: string): void
  (e: 'update:reason', value: string): void
  (e: 'submit'): void
}>()

const serverMenuOptions = computed(() =>
  props.serverOptions.map((server) => ({
    label: server.displayName,
    value: server.id,
  })),
)
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
          炸服重启申请
        </p>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300"
            >服务器</label
          >
          <USelectMenu
            :model-value="props.serverId"
            :options="serverMenuOptions"
            placeholder="选择服务器"
            @update:model-value="emit('update:serverId', $event)"
          />
        </div>
        <div class="space-y-2">
          <label class="text-sm text-slate-600 dark:text-slate-300">说明</label>
          <UTextarea
            :model-value="props.reason"
            placeholder="请输入崩服情况说明"
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
