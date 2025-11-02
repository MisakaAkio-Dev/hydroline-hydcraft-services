<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePortalStore } from '@/stores/portal'
import { useUiStore } from '@/stores/ui'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { getApiBaseUrl } from '@/utils/api'

const portalStore = usePortalStore()
const uiStore = useUiStore()

const { home } = storeToRefs(portalStore)

const heroRef = ref<HTMLElement | null>(null)
const scrolled = ref(false)

const backgroundStyles = computed(() => {
  const url = home.value?.hero.background?.imageUrl
  return url
    ? {
        backgroundImage: `url(${url.startsWith('http') ? url : `${getApiBaseUrl()}${url}`})`,
      }
    : {}
})

const navigationLinks = computed(() => home.value?.navigation ?? [])

const cards = computed(() => home.value?.cards ?? [])

const observer = ref<IntersectionObserver | null>(null)

function updateScrollState() {
  scrolled.value = window.scrollY > 80
  uiStore.setHeroInView(!scrolled.value)
}

onMounted(async () => {
  if (!home.value) {
    uiStore.startLoading()
    try {
      await portalStore.fetchHome()
    } finally {
      uiStore.stopLoading()
    }
  }

  updateScrollState()
  window.addEventListener('scroll', updateScrollState, { passive: true })

  if (heroRef.value) {
    observer.value = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          uiStore.setHeroInView(entry.isIntersecting && entry.intersectionRatio > 0.5)
        }
      },
      { threshold: [0.3, 0.6, 1] },
    )
    observer.value.observe(heroRef.value)
  }
})

const profileCard = computed(() => {
  const card = cards.value.find((item) => item.kind === 'profile')
  if (!card || card.kind !== 'profile') return null
  return card
})

const placeholderCards = computed(() => cards.value.filter((card) => card.kind === 'placeholder'))

const heroText = computed(() => ({
  title: home.value?.hero.title ?? 'Hydroline',
  subtitle: home.value?.hero.subtitle ?? 'ALPHA 测试阶段',
  description: home.value?.hero.background?.description ?? '',
}))

const navigationState = reactive({
  activeIndex: 0,
})

watch(
  () => navigationState.activeIndex,
  () => {
    // 预留未来轮播切换逻辑
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScrollState)
  if (observer.value && heroRef.value) {
    observer.value.unobserve(heroRef.value)
    observer.value.disconnect()
  }
  uiStore.setHeroInView(true)
})
</script>

<template>
  <div class="relative overflow-hidden">
    <section
      ref="heroRef"
      class="relative flex min-h-[70vh] flex-col items-center justify-center px-4 py-24 text-center"
    >
      <div class="absolute inset-0 -z-10 overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-b from-white/0 via-white/40 to-white dark:from-slate-950/0 dark:via-slate-950/70 dark:to-slate-950" />
        <div
          class="h-full w-full bg-cover bg-center transition duration-700"
          :class="{ 'blur-md scale-105': scrolled }"
          :style="backgroundStyles"
        />
      </div>

      <Transition name="fade-slide" mode="out-in">
        <div :key="heroText.title" class="flex flex-col items-center gap-6">
          <img src="@/assets/resources/hydroline_logo.svg" alt="Hydroline Logo" class="h-20 w-auto" />
          <div class="space-y-2">
            <h1 class="text-4xl font-semibold tracking-tight text-slate-900 drop-shadow-sm dark:text-white md:text-5xl">
              {{ heroText.title }}
            </h1>
            <p class="text-sm uppercase tracking-[0.6em] text-slate-500 dark:text-slate-300">
              {{ heroText.subtitle }}
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-4">
            <UTooltip v-for="(link, index) in navigationLinks" :key="link.id" :text="link.tooltip">
              <UButton
                :color="link.available ? 'primary' : 'neutral'"
                variant="soft"
                class="rounded-full px-6 py-2 text-sm"
                :disabled="!link.available"
                :href="link.url ?? undefined"
                target="_blank"
                rel="noreferrer"
                @mouseenter="navigationState.activeIndex = index"
              >
                {{ link.label }}
              </UButton>
            </UTooltip>
          </div>

          <div class="flex items-center gap-2">
            <span
              v-for="index in navigationLinks.length"
              :key="index"
              class="h-2 w-2 rounded-full"
              :class="{
                'bg-primary-500': navigationState.activeIndex + 1 === index,
                'bg-slate-300 dark:bg-slate-600': navigationState.activeIndex + 1 !== index,
              }"
            />
          </div>
        </div>
      </Transition>
    </section>

    <section class="relative z-10 -mt-12 px-4">
      <div class="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-5">
        <div class="md:col-span-3">
          <Transition name="fade-slide" mode="out-in">
            <UCard
              v-if="profileCard && profileCard.status === 'active' && profileCard.payload"
              :key="'profile-active'"
              class="rounded-3xl border border-slate-200/70 bg-white/85 p-6 shadow-lg backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
            >
              <div class="flex flex-col gap-4 text-left sm:flex-row sm:items-center">
                <UserAvatar :name="profileCard.payload.displayName" :src="profileCard.payload.avatarUrl" size="lg" />
                <div class="flex-1 space-y-2">
                  <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
                    {{ profileCard.payload.displayName ?? profileCard.payload.email }}
                  </h2>
                  <p class="text-sm text-slate-600 dark:text-slate-300">
                    邮箱：{{ profileCard.payload.email }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <UBadge v-if="profileCard.payload.piic" color="primary" variant="soft">
                      PIIC: {{ profileCard.payload.piic }}
                    </UBadge>
                    <UBadge
                      v-for="role in profileCard.payload.roles"
                      :key="role.id"
                      color="primary"
                      variant="subtle"
                    >
                      {{ role.name }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard
              v-else
              :key="'profile-placeholder'"
              class="rounded-3xl border border-dashed border-slate-300/70 bg-white/70 p-6 text-center backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60"
            >
              <h2 class="text-xl font-semibold text-slate-900 dark:text-white">个人资料</h2>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-300">
                立即登录以解锁个性化信息和 Minecraft 关联数据。
              </p>
              <UButton class="mt-4" color="primary" @click="uiStore.openLoginDialog()">
                登录账户
              </UButton>
            </UCard>
          </Transition>
        </div>

        <div class="grid gap-4 md:col-span-2">
          <UCard
            v-for="card in placeholderCards"
            :key="card.id"
            class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-medium text-slate-900 dark:text-white">{{ card.title }}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  功能设计中，敬请期待
                </p>
              </div>
              <UBadge color="neutral" variant="soft">开发中</UBadge>
            </div>
          </UCard>
        </div>
      </div>
    </section>

    <section class="mx-auto mt-16 w-full max-w-6xl px-4 pb-24">
      <UCard class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
        <header class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">最新动态</h2>
          <UBadge color="primary" variant="soft">Beta</UBadge>
        </header>
        <p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
          后端将提供动态卡片内容、服务器状态与公告。当前阶段展示布局效果，等待后续数据接入。
        </p>
      </UCard>
    </section>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.35s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
