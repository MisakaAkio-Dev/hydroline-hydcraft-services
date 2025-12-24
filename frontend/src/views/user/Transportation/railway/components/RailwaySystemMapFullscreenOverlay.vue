<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RailwaySystemMapPanel from '@/views/user/Transportation/railway/components/RailwaySystemMapPanel.vue'
import type { RailwayRouteDetail } from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    routes: RailwayRouteDetail[]
    loading?: boolean
  }>(),
  {
    loading: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const open = computed(() => props.modelValue)

const close = () => {
  emit('update:modelValue', false)
}

const insetTop = ref(0)
const insetLeft = ref(0)
let resizeObserver: ResizeObserver | null = null

const mapHeight = computed(() => {
  return `calc(100vh - ${insetTop.value}px)`
})

const updateInset = () => {
  const header = document.querySelector<HTMLElement>('[data-user-shell-header]')
  const content = document.querySelector<HTMLElement>(
    '[data-user-shell-content]',
  )

  const headerRect = header?.getBoundingClientRect()
  insetTop.value = headerRect ? Math.max(0, headerRect.bottom) : 0

  if (!content) {
    insetLeft.value = 0
    return
  }
  const paddingLeft = window.getComputedStyle(content).paddingLeft
  const parsed = Number.parseFloat(paddingLeft)
  insetLeft.value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

let isLocked = false
let previousBodyOverflow = ''

const lockBodyScroll = () => {
  if (isLocked) return
  const body = document.body
  const existing = body.style.overflow
  if (existing !== 'hidden') {
    previousBodyOverflow = existing
  }
  body.style.overflow = 'hidden'
  isLocked = true
}

const unlockBodyScroll = () => {
  if (!isLocked) return
  const body = document.body
  body.style.overflow = previousBodyOverflow
  isLocked = false
}

const startObservers = () => {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    updateInset()
  })

  const header = document.querySelector<HTMLElement>('[data-user-shell-header]')
  const content = document.querySelector<HTMLElement>(
    '[data-user-shell-content]',
  )
  if (header) resizeObserver.observe(header)
  if (content) resizeObserver.observe(content)

  window.addEventListener('resize', updateInset, { passive: true })
}

const stopObservers = () => {
  window.removeEventListener('resize', updateInset)
  resizeObserver?.disconnect()
  resizeObserver = null
}

watch(
  () => open.value,
  (value) => {
    if (value) {
      updateInset()
      startObservers()
      lockBodyScroll()
    } else {
      stopObservers()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (open.value) {
    updateInset()
    startObservers()
  }
})

onBeforeUnmount(() => {
  stopObservers()
  unlockBodyScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
      @after-leave="unlockBodyScroll"
    >
      <div
        v-if="open"
        class="fixed"
        :style="{
          top: `${insetTop}px`,
          left: `${insetLeft}px`,
          right: '0px',
          bottom: '0px',
        }"
      >
        <div class="absolute inset-0 bg-slate-950/70" @click="close"></div>
        <div class="relative h-full w-full">
          <RailwaySystemMapPanel
            :routes="routes"
            :loading="loading"
            :height="mapHeight"
            :rounded="false"
          />
          <div class="absolute top-3 right-3">
            <UButton color="neutral" variant="soft" size="sm" @click="close">
              关闭
            </UButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
