<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RailwayStationMapPanel from '@/views/user/Transportation/railway/components/RailwayStationMapPanel.vue'
import type { RailwayStationDetail } from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    stationLabel?: string | null
    transferCount?: number | null
    platformCount?: number | null
    bounds: RailwayStationDetail['station']['bounds'] | null
    platforms?: RailwayStationDetail['platforms'] | null
    color?: number | null
    loading?: boolean
  }>(),
  {
    stationLabel: null,
    transferCount: null,
    platformCount: null,
    platforms: () => [] as RailwayStationDetail['platforms'],
    color: null,
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

const transferCountLabel = computed(() => {
  if (props.transferCount == null) return '—'
  return `${props.transferCount}`
})

const platformCountLabel = computed(() => {
  if (props.platformCount == null) return '—'
  return `${props.platformCount}`
})

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

let previousBodyOverflow = ''

const lockBodyScroll = () => {
  const body = document.body
  previousBodyOverflow = body.style.overflow
  body.style.overflow = 'hidden'
}

const unlockBodyScroll = () => {
  const body = document.body
  body.style.overflow = previousBodyOverflow
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
      return
    }

    stopObservers()
    unlockBodyScroll()
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
  if (open.value) {
    unlockBodyScroll()
  }
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
        <div
          class="absolute inset-0 bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl"
        ></div>

        <div class="relative h-full w-full">
          <RailwayStationMapPanel
            :bounds="props.bounds"
            :platforms="props.platforms ?? []"
            :color="props.color"
            :loading="props.loading"
            :height="mapHeight"
          />

          <div class="pointer-events-none absolute bottom-4 left-4 z-999">
            <div
              class="pointer-events-auto inline-flex items-center gap-5 rounded-lg backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 shadow px-3 py-2"
              style="text-shadow: 0 0 5px rgba(0, 0, 0, 0.7)"
            >
              <div class="space-y-0.5">
                <div class="text-lg font-semibold">
                  {{ props.stationLabel || '—' }}
                </div>
                <div class="text-xs">
                  <span class="mr-3">换乘 {{ transferCountLabel }}</span>
                  <span>站台 {{ platformCountLabel }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            class="pointer-events-none absolute inset-x-4 top-4 flex justify-end z-999"
          >
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              class="flex items-center gap-1 pointer-events-auto backdrop-blur-2xl text-white bg-black/20 dark:bg-slate-900/10 hover:bg-white/10 dark:hover:bg-slate-900/20 shadow"
              @click="close"
            >
              <UIcon name="i-lucide-minimize-2" class="h-3.5 w-3.5" />
              退出全屏
            </UButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
