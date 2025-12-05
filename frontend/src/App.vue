<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { AnimatePresence, Motion } from 'motion-v'
import { useAuthStore } from '@/stores/auth'
import { zh_cn } from '@nuxt/ui/locale'
import { useRoute } from 'vue-router'

const appTooltipConfig = {
  delayDuration: 150,
}

const appToasterConfig = {
  ui: {
    viewport: 'z-[260]',
  },
}

const authStore = useAuthStore()
const { loading, initialized, refreshing } = storeToRefs(authStore)
const route = useRoute()

const showSessionLoader = computed(
  () => (!initialized.value && loading.value) || refreshing.value,
)
const layoutKey = computed(
  () => (route.meta.layout as string) ?? 'default-layout',
)
</script>

<template>
  <UApp :locale="zh_cn" :tooltip="appTooltipConfig" :toaster="appToasterConfig">
    <RouterView v-slot="{ Component }">
      <AnimatePresence mode="wait">
        <Motion
          v-if="Component"
          :key="layoutKey"
          as="div"
          :initial="{ opacity: 0, filter: 'blur(12px)' }"
          :animate="{ opacity: 1, filter: 'blur(0px)' }"
          :exit="{ opacity: 0, filter: 'blur(12px)' }"
          :transition="{ duration: 0.35, ease: 'easeInOut' }"
        >
          <component :is="Component" />
        </Motion>
      </AnimatePresence>
    </RouterView>
    <Transition
      appear
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showSessionLoader"
        class="fixed inset-0 z-2000 grid place-items-center backdrop-blur-xl"
        role="status"
        aria-live="polite"
      >
        <div
          class="flex w-full h-full flex-col justify-center items-center gap-4 0 bg-white/75 px-8 py-6 dark:bg-slate-900/70"
        >
          <div class="flex h-14 w-14 items-center justify-center rounded-full">
            <UIcon
              name="i-lucide-loader-2"
              class="h-7 w-7 animate-spin text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </Transition>
  </UApp>
</template>

<style scoped></style>
