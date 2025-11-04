<script setup lang="ts">
type Item = { id: string; label: string; caption?: string }
const props = defineProps<{
  items: Item[]
  activeId: string
}>()
const emit = defineEmits<{ (e: 'update:activeId', id: string): void }>()
</script>

<template>
  <aside
    class="w-full shrink-0 rounded-2xl border border-slate-200/70 bg-white/85 p-4 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/60 lg:w-60"
  >
    <nav class="flex flex-row gap-2 overflow-x-auto lg:flex-col">
      <button
        v-for="item in props.items"
        :key="item.id"
        type="button"
        class="group flex-1 rounded-2xl px-4 py-3 text-left text-sm transition lg:flex-auto"
        :class="[
          props.activeId === item.id
            ? 'bg-primary-100/80 text-primary-700 shadow-sm dark:bg-primary-500/15 dark:text-primary-200'
            : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60',
        ]"
        @click="emit('update:activeId', item.id)"
      >
        <div class="font-semibold">
          {{ item.label }}
        </div>
        <p v-if="item.caption" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {{ item.caption }}
        </p>
      </button>
    </nav>
  </aside>
</template>
