<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Motion } from 'motion-v'
import type {
  PlayerLoginRecommendation,
  PlayerLoginRecommendationsResponse,
} from '@/types/portal'
import { apiFetch } from '@/utils/http/api'

const PAGE_SIZE = 10

const props = withDefaults(
  defineProps<{
    avatarSize?: string
    wrapClass?: string
    itemGapClass?: string
    showTypeLabel?: boolean
  }>(),
  {
    avatarSize: 'h-8 w-8',
    wrapClass: 'gap-1',
    itemGapClass: 'gap-1',
    showTypeLabel: false,
  },
)

const recommendations = ref<PlayerLoginRecommendation[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / PAGE_SIZE)),
)
const hasMultiplePages = computed(() => total.value > PAGE_SIZE)

function avatarUrl(item: PlayerLoginRecommendation) {
  if (item.avatarUrl) {
    return item.avatarUrl
  }
  if (item.type === 'authme') {
    return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
      item.targetId,
    )}/64`
  }
  return null
}

function recommendationInitials(item: PlayerLoginRecommendation) {
  const name = item.displayName?.trim() || item.targetId?.trim()
  if (!name) return 'HC'
  const segments = name.split(/\s+/)
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase()
  }
  return (segments[0][0] + segments[segments.length - 1][0]).toUpperCase()
}

function recommendationTooltip(item: PlayerLoginRecommendation) {
  return item.displayName?.trim() || item.targetId
}

async function loadRecommendations(nextPage = 1) {
  loading.value = true
  try {
    const response = await apiFetch<PlayerLoginRecommendationsResponse>(
      `/player/authme/recommendations?page=${nextPage}&pageSize=${PAGE_SIZE}`,
    )
    recommendations.value = response.items
    total.value = response.total
    page.value = Math.max(1, response.page)
  } catch (error) {
    console.warn('Failed to load recommendations', error)
  } finally {
    loading.value = false
  }
}

function handleSwap() {
  const nextPage = page.value >= totalPages.value ? 1 : page.value + 1
  void loadRecommendations(nextPage)
}

onMounted(() => {
  void loadRecommendations()
})
</script>

<template>
  <div class="w-fit mx-auto flex items-center gap-1 flex-col md:flex-row">
    <div
      class="flex justify-center items-center text-xs text-slate-600 dark:text-slate-300"
    >
      <span>推荐用户</span>
      <UButton
        size="xs"
        class="block md:hidden"
        variant="link"
        color="primary"
        :disabled="!hasMultiplePages || loading"
        @click="handleSwap"
      >
        换一批
      </UButton>
    </div>

    <div class="flex flex-wrap" :class="props.wrapClass">
      <Motion
        v-for="item in recommendations"
        :key="item.id"
        as="div"
        :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
        :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
        :transition="{ duration: 0.35, ease: 'easeInOut' }"
      >
        <UTooltip
          v-if="!props.showTypeLabel"
          :text="recommendationTooltip(item)"
        >
          <RouterLink
            :to="
              item.type === 'authme'
                ? { name: 'player.name', params: { playerName: item.targetId } }
                : { name: 'player', params: { playerId: item.targetId } }
            "
            class="flex flex-col items-center rounded-xl p-2 text-sm transition hover:border-primary-500 hover:bg-white hover:dark:bg-slate-600/50"
            :class="props.itemGapClass"
          >
            <div
              class="flex items-center justify-center overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
              :class="props.avatarSize"
            >
              <img
                v-if="avatarUrl(item)"
                :src="avatarUrl(item) || ''"
                :alt="item.displayName"
                class="h-full w-full object-cover"
              />
              <span
                v-else
                class="text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-200"
              >
                {{ recommendationInitials(item) }}
              </span>
            </div>
          </RouterLink>
        </UTooltip>
        <RouterLink
          v-else
          :to="
            item.type === 'authme'
              ? { name: 'player.name', params: { playerName: item.targetId } }
              : { name: 'player', params: { playerId: item.targetId } }
          "
          class="flex flex-col items-center rounded-xl p-2 text-sm transition hover:border-primary-500 hover:bg-white hover:dark:bg-slate-600/50"
          :class="props.itemGapClass"
        >
          <div
            class="flex items-center justify-center overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
            :class="props.avatarSize"
          >
            <img
              v-if="avatarUrl(item)"
              :src="avatarUrl(item) || ''"
              :alt="item.displayName"
              class="h-full w-full object-cover"
            />
            <span
              v-else
              class="text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-200"
            >
              {{ recommendationInitials(item) }}
            </span>
          </div>
          <p
            class="text-center text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2"
          >
            {{ item.displayName }}
          </p>
          <span class="text-[10px] uppercase tracking-wider text-slate-400">
            {{ item.type === 'user' ? '用户' : '玩家' }}
          </span>
        </RouterLink>
      </Motion>
    </div>

    <UButton
      size="xs"
      class="hidden md:block"
      variant="link"
      color="primary"
      :disabled="!hasMultiplePages || loading"
      @click="handleSwap"
    >
      换一批
    </UButton>
  </div>
</template>
