<script setup lang="ts">
import type { PlayerMessageBoardEntry } from '@/types/portal'

const props = defineProps<{
  messages: PlayerMessageBoardEntry[]
}>()

const emit = defineEmits<{
  (event: 'badgeClick', message: PlayerMessageBoardEntry): void
}>()

function getContentPreview(content: string) {
  return content.length > 50 ? content.slice(0, 50) + '...' : content
}
</script>

<template>
  <div v-if="props.messages.length > 0" class="relative">
    <div
      class="flex gap-2 overflow-x-auto scrollbar-hide"
      :class="{
        'animate-scroll': props.messages.length > 3,
      }"
    >
      <div
        v-for="message in props.messages"
        :key="message.id"
        class="shrink-0 cursor-pointer rounded-lg border border-primary-500 bg-primary-200/30 px-3 py-2 hover:shadow-md transition-shadow"
        @click="emit('badgeClick', message)"
      >
        <div class="flex items-center gap-3 text-xs">
          <span
            class="text-slate-700 dark:text-slate-300 max-w-[200px] truncate"
          >
            {{ getContentPreview(message.content) }}
          </span>
          <div class="flex items-center gap-2">
            <span
              class="flex items-center gap-0.5 text-green-600 dark:text-green-400"
            >
              <UIcon name="i-lucide-thumbs-up" class="h-3 w-3" />
              <span>{{ message.positiveCount }}</span>
            </span>
            <span
              class="flex items-center gap-0.5 text-red-600 dark:text-red-400"
            >
              <UIcon name="i-lucide-thumbs-down" class="h-3 w-3" />
              <span>{{ message.negativeCount }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    v-else
    class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400"
  >
    暂无留言
  </div>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

@keyframes scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(-50%));
  }
}

.animate-scroll > div:first-child {
  animation: scroll 20s linear infinite;
}
</style>
