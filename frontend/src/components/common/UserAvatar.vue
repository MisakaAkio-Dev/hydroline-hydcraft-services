<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name?: string | null
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

const initials = computed(() => {
  if (!props.name) return 'HC'
  const segments = props.name.trim().split(/\s+/)
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase()
  }
  return (segments[0][0] + segments[segments.length - 1][0]).toUpperCase()
})

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-8 w-8 text-xs'
    case 'lg':
      return 'h-14 w-14 text-lg'
    default:
      return 'h-10 w-10 text-sm'
  }
})
</script>

<template>
  <div
    v-if="!src"
    class="flex items-center justify-center rounded-full bg-primary-500/10 text-primary-600 dark:bg-primary-500/20 dark:text-primary-200"
    :class="sizeClass"
  >
    {{ initials }}
  </div>
  <img
    v-else
    :src="src"
    :alt="name ?? 'avatar'"
    :class="sizeClass"
    class="rounded-full object-cover shadow-sm"
    loading="lazy"
  />
</template>
