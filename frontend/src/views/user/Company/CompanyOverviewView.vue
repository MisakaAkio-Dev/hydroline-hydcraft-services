<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCompanyStore } from '@/stores/companies'
import { useUiStore } from '@/stores/ui'
import CompanySummaryCard from '@/components/company/CompanySummaryCard.vue'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const router = useRouter()
const uiStore = useUiStore()

onMounted(() => {
  companyStore.fetchMeta()
  companyStore.fetchRecommendations('recent')
  companyStore.fetchRecommendations('active')
})

const canManage = computed(() => authStore.isAuthenticated)

const industries = computed(() => companyStore.meta?.industries ?? [])
const types = computed(() => companyStore.meta?.types ?? [])

const handleDashboard = () => {
  if (!authStore.isAuthenticated) {
    uiStore.openLoginDialog()
    return
  }
  router.push('/company/dashboard')
}
</script>

<template>
  <section class="space-y-8 mx-auto w-full max-w-6xl p-6">
    <div
      class="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-slate-50 via-white to-primary-50 p-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 mt-4"
    >
      <div class="space-y-4 relative z-1">
        <p
          class="text-sm font-semibold uppercase tracking-widest text-primary-500"
        >
          Hydroline 工商系统
        </p>
        <h1
          class="text-3xl font-semibold leading-tight text-slate-800 dark:text-white"
        >
          仿真工商系统 · 全服统一信息 · 先批后审
        </h1>
        <p class="text-base text-slate-600 dark:text-slate-300">
          MTR 铁路想要运营主体？信息只登记在玩家名下不够带派？氢气工艺使用
          Hydroline 工商系统为所有玩家提供仿真式的公司注册与管理服务！
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton color="primary" size="lg" @click="handleDashboard">
            {{ canManage ? '工商仪表盘' : '立刻登录' }}
          </UButton>
        </div>
      </div>
      <div
        class="pointer-events-none absolute z-0 inset-y-0 right-0 hidden w-1/2 select-none items-center justify-center lg:flex"
      >
        <div
          class="h-48 w-48 rounded-full bg-primary-100/80 dark:bg-primary-900/80 blur-3xl"
        />
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                最近入库公司
              </h2>
            </div>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              :loading="companyStore.recommendationsLoading"
              @click="companyStore.fetchRecommendations('recent')"
            />
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-2">
          <CompanySummaryCard
            v-for="item in companyStore.recommendations.recent"
            :key="item.id"
            :company="item"
          />
          <div
            v-if="companyStore.recommendations.recent.length === 0"
            class="col-span-full rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          >
            暂无数据，稍后再来看看。
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                最近活跃公司
              </h2>
            </div>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-refresh-cw"
              :loading="companyStore.recommendationsLoading"
              @click="companyStore.fetchRecommendations('active')"
            />
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-2">
          <CompanySummaryCard
            v-for="item in companyStore.recommendations.active"
            :key="item.id"
            :company="item"
          />
          <div
            v-if="companyStore.recommendations.active.length === 0"
            class="col-span-full rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          >
            暂无数据，稍后再来看看。
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              行业体系
            </h3>
          </div>
        </template>
        <div class="grid gap-3 md:grid-cols-2" v-if="industries.length > 0">
          <div
            v-for="industry in industries"
            :key="industry.id"
            class="rounded-2xl border border-slate-200/80 p-4 text-sm dark:border-slate-800"
          >
            <div class="font-semibold text-slate-900 dark:text-white">
              {{ industry.name }}
            </div>
            <p class="mt-1 text-slate-500">
              {{ industry.description || '行业描述待完善。' }}
            </p>
          </div>
        </div>
        <div
          v-else
          class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
        >
          尚未配置行业，请稍后查看。
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              公司类型
            </h3>
          </div>
        </template>
        <div class="space-y-3">
          <div
            v-for="type in types"
            :key="type.id"
            class="rounded-2xl border border-slate-200/80 p-4 text-sm dark:border-slate-800"
          >
            <div class="flex items-center justify-between">
              <p class="font-semibold text-slate-900 dark:text-white">
                {{ type.name }}
              </p>
              <span class="text-xs text-slate-500">{{ type.category }}</span>
            </div>
            <p class="mt-1 text-slate-500">
              {{ type.description || '暂无描述，创建流程时可自定义。' }}
            </p>
          </div>
          <div
            v-if="types.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"
          >
            尚未配置类型。
          </div>
        </div>
      </UCard>
    </div>
  </section>
</template>
