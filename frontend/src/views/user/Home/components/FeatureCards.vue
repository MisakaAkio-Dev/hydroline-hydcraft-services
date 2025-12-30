<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import FeatureCard from './FeatureCard.vue'
import hydCraftImage from '@/assets/images/homepage_230809_owen.webp?base64'
import jianghuImage from '@/assets/images/homepage_240126_jianghu.webp?base64'
import qinjingImage from '@/assets/images/homepage_240126_qinjing.webp?base64'

const props = withDefaults(
  defineProps<{
    railwayStatsText?: string
    pointerX?: number
    pointerY?: number
    pointerActive?: boolean
    magnetMaxOffset?: number
  }>(),
  {
    railwayStatsText: '',
    pointerX: 0,
    pointerY: 0,
    pointerActive: false,
    magnetMaxOffset: 36,
  },
)

const cardOffsets = reactive([
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
])
const cardRefs = ref<HTMLElement[]>([])
const updateFrame = ref<number | null>(null)

function setCardRef(index: number) {
  return (el: HTMLElement | null) => {
    if (el) {
      cardRefs.value[index] = el
    }
  }
}

function resetOffsets() {
  for (const offset of cardOffsets) {
    offset.x = 0
    offset.y = 0
  }
}

function updateOffsets() {
  if (!cardRefs.value.length) return
  if (!props.pointerActive) {
    resetOffsets()
    return
  }
  cardRefs.value.forEach((el, index) => {
    const rect = el.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = centerX - props.pointerX
    const dy = centerY - props.pointerY
    const distance = Math.hypot(dx, dy)
    const maxDistance = Math.max(rect.width, rect.height) * 1.1
    if (distance >= maxDistance) {
      cardOffsets[index].x = 0
      cardOffsets[index].y = 0
      return
    }
    const strength = 1 - distance / maxDistance
    const directionX = distance === 0 ? 0 : dx / distance
    const directionY = distance === 0 ? 0 : dy / distance
    cardOffsets[index].x = directionX * props.magnetMaxOffset * strength
    cardOffsets[index].y = directionY * props.magnetMaxOffset * strength
  })
}

function scheduleOffsetsUpdate() {
  if (updateFrame.value !== null) return
  updateFrame.value = window.requestAnimationFrame(() => {
    updateFrame.value = null
    updateOffsets()
  })
}

watch(
  () => [props.pointerX, props.pointerY, props.pointerActive],
  () => {
    scheduleOffsetsUpdate()
  },
)

onMounted(() => {
  scheduleOffsetsUpdate()
  window.addEventListener('resize', scheduleOffsetsUpdate, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleOffsetsUpdate)
  if (updateFrame.value !== null) {
    window.cancelAnimationFrame(updateFrame.value)
    updateFrame.value = null
  }
})

const cardStyle = (index: number) => ({
  transform: `translate3d(${cardOffsets[index].x}px, ${cardOffsets[index].y}px, 0)`,
  transition: 'transform 400ms ease-out',
  willChange: 'transform',
})
</script>

<template>
  <div
    class="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-4 gap-y-2.5 md:grid-cols-3"
  >
    <div :ref="setCardRef(0)" :style="cardStyle(0)">
      <FeatureCard
        title="绝赞内测中"
        description="这三个卡片凑数的，后面再抠细节。"
        icon="i-lucide-flask-conical"
        :image="jianghuImage"
        theme="#dbeafe"
      />
    </div>

    <div :ref="setCardRef(1)" :style="cardStyle(1)">
      <FeatureCard
        title="铁路系统"
        description="原来两个周目加起来有 500+ 线路。"
        icon="i-lucide-train-front"
        :image="qinjingImage"
        theme="#dcfce7"
        to="/transportation/railway"
      />
    </div>

    <div :ref="setCardRef(2)" :style="cardStyle(2)">
      <FeatureCard
        title="玩家排行榜"
        description="哈哈，原来有人能 1000+ 小时啊。"
        icon="i-lucide-trophy"
        :image="hydCraftImage"
        theme="#fef3c7"
        to="/rank"
      />
    </div>
  </div>
</template>
