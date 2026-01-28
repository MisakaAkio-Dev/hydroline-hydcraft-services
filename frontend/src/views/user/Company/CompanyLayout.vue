<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  {
    label: '仪表盘',
    name: 'company.dashboard',
    disabled: false,
    description: '个人工商数据与公司管理工作台',
    icon: 'i-lucide-gauge',
  },
  {
    label: '工商数据库',
    name: 'company.database',
    disabled: false,
    description: '全服工商主体数据库与筛选',
    icon: 'i-lucide-database',
  },
  {
    label: '我的待办',
    name: 'company.dashboard.applications',
    disabled: false,
    description: '查看注册申请进度与待同意事项',
    icon: 'i-lucide-file-text',
  },
  {
    label: '我的法人',
    name: 'company.dashboard.myLegalEntities',
    disabled: false,
    description: '由您担任法定代表人的主体列表',
    icon: 'i-lucide-building-2',
  },
]

const activeTab = computed(() => {
  const name = String(route.name ?? '')
  if (name === 'company.database' || name === 'company.database.detail') {
    return 'company.database'
  }
  if (name === 'company.dashboard.applications') {
    return 'company.dashboard.applications'
  }
  if (name === 'company.dashboard.myLegalEntities') {
    return 'company.dashboard.myLegalEntities'
  }
  // 默认把其余 company.dashboard.* 子路由归类到“仪表盘”标签
  if (name === 'company.dashboard' || name.startsWith('company.dashboard.')) {
    return 'company.dashboard'
  }
  return 'company.dashboard'
})

function handleTabClick(name: string, disabled: boolean) {
  if (disabled) return
  if (route.name === name) return
  router.push({ name })
}
</script>

<template>
  <div
    class="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6 md:py-10"
  >
    <header>
      <div class="flex justify-center gap-4">
        <div class="flex flex-wrap gap-2">
          <UTooltip
            v-for="tab in tabs"
            :key="tab.name"
            :text="tab.disabled ? undefined : tab.description"
          >
            <UButton
              class="flex items-center gap-1 text-xs"
              color="primary"
              :variant="activeTab === tab.name ? 'soft' : 'ghost'"
              :disabled="tab.disabled"
              @click="handleTabClick(tab.name, tab.disabled)"
            >
              <UIcon :name="tab.icon" class="size-4" />
              {{ tab.label }}
            </UButton>
          </UTooltip>
        </div>
      </div>
    </header>

    <section class="min-h-[40vh]">
      <RouterView />
    </section>
  </div>
</template>
