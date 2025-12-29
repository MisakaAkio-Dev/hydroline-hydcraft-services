<script setup lang="ts">
import { computed } from 'vue'
import PlayerRecommendations from './PlayerRecommendations.vue'

const props = defineProps<{
  canViewProfile: boolean
}>()

const recommendationsVisible = computed(() => !props.canViewProfile)
</script>

<template>
  <div
    v-if="recommendationsVisible"
    class="text-center text-slate-700 dark:text-slate-300 my-20"
  >
    <div class="flex flex-col gap-4 justify-center items-center">
      <UIcon name="i-lucide-info" class="w-8 h-8" />
      <span>请先登录以查看玩家资料</span>
    </div>

    <div class="mt-24">
      <div class="text-slate-400 text-xs">
        这么想看就实践一下下面这几个人吧 ↓
      </div>
      <PlayerRecommendations />
    </div>
  </div>
</template>
