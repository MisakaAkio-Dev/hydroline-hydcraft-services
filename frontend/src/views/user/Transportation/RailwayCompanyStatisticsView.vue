<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AnimatePresence, Motion } from 'motion-v'
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

const page = ref(1)
const pageSize = ref(20)
const pageInput = ref('1')
const renderToken = ref(0)

const tabs = [
  { label: '运营单位', value: 'OPERATOR' },
  { label: '建设单位', value: 'BUILDER' },
]

const emptyText = computed(() =>
  bindingType.value === 'OPERATOR'
    ? '暂无运营单位绑定记录'
    : '暂无建设单位绑定记录',
)

const pagination = computed(() => {
  const total = stats.value.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize.value))
  return {
    total,
    page: page.value,
    pageSize: pageSize.value,
    pageCount,
  }
})

const pagedStats = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return stats.value.slice(start, start + pageSize.value)
})

async function fetchStats() {
  loading.value = true
  try {
    const result = await bindingStore.fetchCompanyStats(bindingType.value)
    stats.value = result
    const ids = result.map((item) => item.companyId)
    companyMap.value = await resolveCompaniesByIds(ids)
    page.value = 1
    pageInput.value = '1'
    renderToken.value += 1
  } finally {
    loading.value = false
  }
}

function goEditFacilities() {
  router.push({ name: 'transportation.railway.facilities' })
}

function goToPage(nextPage: number) {
  const safe = Math.max(1, Math.min(nextPage, pagination.value.pageCount))
  if (safe === page.value) return
  page.value = safe
  pageInput.value = String(safe)
  renderToken.value += 1
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
  <div class="space-y-6 relative">
    <div class="absolute right-4 top-6 md:top-10 flex items-center gap-2">
      <UTooltip text="编辑铁路设施">
        <UButton
          color="primary"
          variant="soft"
          size="xs"
          class="p-1"
          icon="i-lucide-edit"
          @click="goEditFacilities"
        />
      </UTooltip>
    </div>
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          铁路运营 / 建设单位统计
        </h1>
      </div>
      <UButton
        size="sm"
        class="absolute left-4 top-6 md:top-10"
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
      class="relative rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
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
          <tbody v-if="stats.length === 0">
            <Motion
              as="tr"
              :initial="{ opacity: 0, filter: 'blur(10px)' }"
              :animate="{ opacity: 1, filter: 'blur(0px)' }"
              :transition="{ duration: 0.3 }"
            >
              <td
                class="px-4 py-6 text-center text-sm text-slate-500"
                colspan="6"
              >
                {{ loading ? '正在加载…' : emptyText }}
              </td>
            </Motion>
          </tbody>

          <Motion
            v-else
            as="tbody"
            :animate="{ opacity: 1, filter: 'blur(0px)' }"
            :transition="{ duration: 0.3 }"
          >
            <AnimatePresence>
              <Motion
                v-for="item in pagedStats"
                :key="`${renderToken}::${bindingType}::${item.companyId}`"
                as="tr"
                :initial="{ opacity: 0, filter: 'blur(10px)', y: 4 }"
                :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
                :exit="{ opacity: 0, filter: 'blur(10px)', y: -4 }"
                :transition="{ duration: 0.3 }"
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
              </Motion>
            </AnimatePresence>
          </Motion>
        </table>
      </div>

      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="loading"
          class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px] dark:bg-slate-900/30"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="h-5 w-5 animate-spin text-slate-400"
          />
        </div>
      </Transition>
    </div>

    <div class="flex items-center justify-between text-sm text-slate-500">
      <span>
        共 {{ pagination.total }} 条，{{ pagination.page }}/{{
          pagination.pageCount
        }}
        页
      </span>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          :disabled="page <= 1 || loading"
          @click="goToPage(page - 1)"
        >
          上一页
        </UButton>

        <div class="flex items-center gap-2">
          <span class="text-xs">跳转</span>
          <UInput
            v-model="pageInput"
            class="w-20"
            type="number"
            :min="1"
            :max="pagination.pageCount"
            @keydown.enter.prevent="goToPage(Number(pageInput))"
          />
          <UButton
            size="xs"
            variant="soft"
            :disabled="loading"
            @click="goToPage(Number(pageInput))"
          >
            前往
          </UButton>
        </div>

        <UButton
          size="xs"
          :disabled="page >= pagination.pageCount || loading"
          @click="goToPage(page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
