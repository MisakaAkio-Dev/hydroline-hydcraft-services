<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTransportationRailwayBindingsStore } from '@/stores/transportation/railwayBindings'
import { resolveCompaniesByIds } from '@/utils/company/company-lib'
import type { CompanyModel } from '@/types/company'
import type { RailwayCompanyBindingStatItem } from '@/types/transportation'

const router = useRouter()
const bindingStore = useTransportationRailwayBindingsStore()

const bindingType = ref<'OPERATOR' | 'BUILDER'>('OPERATOR')
const loading = ref(false)
const stats = ref<RailwayCompanyBindingStatItem[]>([])
const companyMap = ref<Record<string, CompanyModel>>({})

const tabs = [
  { label: '运营单位', value: 'OPERATOR' },
  { label: '建设单位', value: 'BUILDER' },
]

const emptyText = computed(() =>
  bindingType.value === 'OPERATOR'
    ? '暂无运营单位绑定记录'
    : '暂无建设单位绑定记录',
)

async function fetchStats() {
  loading.value = true
  try {
    const result = await bindingStore.fetchCompanyStats(bindingType.value)
    stats.value = result
    const ids = result.map((item) => item.companyId)
    companyMap.value = await resolveCompaniesByIds(ids)
  } finally {
    loading.value = false
  }
}

function openCompany(companyId: string) {
  router.push({
    name: 'transportation.railway.company',
    params: { companyId },
    query: { bindingType: bindingType.value },
  })
}

function companyName(companyId: string) {
  return companyMap.value[companyId]?.name ?? '未知公司'
}

onMounted(() => {
  void fetchStats()
})

watch(
  () => bindingType.value,
  () => {
    void fetchStats()
  },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          铁路运营 / 建设单位统计
        </h1>
      </div>
      <UButton
        size="sm"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <div class="flex items-center gap-2">
      <UButton
        v-for="tab in tabs"
        :key="tab.value"
        size="sm"
        :variant="bindingType === tab.value ? 'solid' : 'ghost'"
        :color="bindingType === tab.value ? 'primary' : 'neutral'"
        @click="bindingType = tab.value as typeof bindingType"
      >
        {{ tab.label }}
      </UButton>
    </div>

    <div
      class="rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-[720px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
        >
          <thead
            class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <tr>
              <th class="px-4 py-3">单位</th>
              <th class="px-4 py-3">线路</th>
              <th class="px-4 py-3">车站</th>
              <th class="px-4 py-3">车厂</th>
              <th class="px-4 py-3">线路系统</th>
              <th class="px-4 py-3">总计</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td
                class="px-4 py-6 text-center text-sm text-slate-500"
                colspan="6"
              >
                正在加载…
              </td>
            </tr>
            <tr v-else-if="stats.length === 0">
              <td
                class="px-4 py-6 text-center text-sm text-slate-500"
                colspan="6"
              >
                {{ emptyText }}
              </td>
            </tr>
            <tr
              v-for="item in stats"
              :key="item.companyId"
              class="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 cursor-pointer"
              @click="openCompany(item.companyId)"
            >
              <td class="px-4 py-3 text-slate-900 dark:text-white">
                {{ companyName(item.companyId) }}
              </td>
              <td class="px-4 py-3">{{ item.routes }}</td>
              <td class="px-4 py-3">{{ item.stations }}</td>
              <td class="px-4 py-3">{{ item.depots }}</td>
              <td class="px-4 py-3">{{ item.systems }}</td>
              <td
                class="px-4 py-3 font-semibold text-slate-900 dark:text-white"
              >
                {{ item.total }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
