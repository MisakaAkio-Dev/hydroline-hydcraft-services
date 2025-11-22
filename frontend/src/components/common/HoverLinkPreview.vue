<template>
  <div :class="cn('relative inline-block', props.class)">
    <a
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
      :class="cn('text-black dark:text-white', props.linkClass)"
      @mousemove="handleMouseMove"
      @mouseenter="showPreview"
      @mouseleave="hidePreview"
    >
      <slot />
    </a>

    <div
      v-if="isVisible"
      ref="preview"
      class="pointer-events-none absolute z-50"
      :style="previewStyle"
    >
      <div
        class="overflow-hidden rounded-xl shadow-xl"
        :class="[popClass, { 'transform-gpu': !props.isStatic }]"
      >
        <div
          class="block rounded-xl border-2 border-transparent bg-white p-1 shadow-lg dark:bg-slate-900"
        >
          <img
            :src="previewSrc"
            :width="width"
            :height="height"
            class="size-full rounded-lg object-cover"
            :style="imageStyle"
            alt="preview"
            @load="handleImageLoad"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Forked from Inspira UI Link Preview. (https://inspira-ui.com/docs/components/miscellaneous/link-preview)

import {
  ref,
  computed,
  reactive,
  withDefaults,
  defineProps,
  type CSSProperties,
} from 'vue'

interface BaseProps {
  class?: string
  linkClass?: string
  width?: number
  height?: number
}
interface StaticImageProps extends BaseProps {
  isStatic?: true
  imageSrc?: string
  url?: string
}
interface URLPreviewProps extends BaseProps {
  isStatic?: false
  imageSrc?: string
  url?: string
}

type Props = StaticImageProps | URLPreviewProps
const props = withDefaults(defineProps<Props>(), {
  isStatic: false,
  imageSrc: '',
  url: '',
  width: 200,
  height: 125,
})

const url = computed(() => props.url || '')
const width = props.width
const height = props.height

const isVisible = ref(false)
const isLoading = ref(true)
const preview = ref<HTMLElement | null>(null)
const hasPopped = ref(false)

const previewSrc = computed(() => {
  if (props.isStatic) return props.imageSrc
  const params = new URLSearchParams({
    url: url.value,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    colorScheme: 'light',
    'viewport.isMobile': 'true',
    'viewport.deviceScaleFactor': '1',
    'viewport.width': String(props.width * 3),
    'viewport.height': String(props.height * 3),
  })
  return `https://api.microlink.io/?${params.toString()}`
})

const mousePosition = reactive({ x: 0, y: 0 })

const previewStyle = computed<CSSProperties>(() => {
  if (!preview.value) return {}
  const offset = 20
  const previewWidth = props.width
  const previewHeight = props.height
  const viewportWidth = window.innerWidth

  let x = mousePosition.x - previewWidth / 2
  x = Math.min(Math.max(0, x), viewportWidth - previewWidth)

  const linkRect = preview.value.parentElement?.getBoundingClientRect()
  const y = linkRect ? linkRect.top - previewHeight - offset : 0

  return {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
  }
})

const imageStyle = computed<CSSProperties>(() => ({
  width: `${props.width}px`,
  height: `${props.height}px`,
}))

const popClass = computed(() => (hasPopped.value ? 'animate-pop' : ''))

function handleMouseMove(e: MouseEvent) {
  mousePosition.x = e.clientX
  mousePosition.y = e.clientY
}

function showPreview() {
  if (!url.value) return
  isVisible.value = true
  setTimeout(() => {
    hasPopped.value = true
  }, 50)
}

function hidePreview() {
  isVisible.value = false
  hasPopped.value = false
}

function handleImageLoad() {
  isLoading.value = false
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}
</script>

<style scoped>
.transform-gpu {
  transform: scale3d(0, 0, 1);
  transform-origin: center bottom;
  will-change: transform;
  backface-visibility: hidden;
}
.animate-pop {
  animation: pop 1000ms ease forwards;
  will-change: transform;
}
@keyframes pop {
  0% {
    transform: scale3d(0.26, 0.26, 1);
  }
  25% {
    transform: scale3d(1.1, 1.1, 1);
  }
  65% {
    transform: scale3d(0.98, 0.98, 1);
  }
  100% {
    transform: scale3d(1, 1, 1);
  }
}
</style>
