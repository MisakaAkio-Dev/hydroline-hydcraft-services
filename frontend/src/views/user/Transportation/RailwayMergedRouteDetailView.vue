<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RailwaySystemMapPanel from '@/views/user/Transportation/railway/components/RailwaySystemMapPanel.vue'
import RailwaySystemMapFullscreenOverlay from '@/views/user/Transportation/railway/components/RailwaySystemMapFullscreenOverlay.vue'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { setDocumentTitle } from '@/utils/route/document-title'
import type { RailwayManualMergedRouteDetail } from '@/types/transportation'

const route = useRoute()
const router = useRouter()
const railwayStore = useTransportationRailwayStore()
const toast = useToast()

const mergedRouteId = computed(() => route.params.routeId as string)
const detail = ref<RailwayManualMergedRouteDetail | null>(null)
const loading = ref(true)
const fullscreenOpen = ref(false)

const routeDetails = computed(() => detail.value?.routeDetails ?? [])

const combinedSvgEntries = computed(() => {
  return routeDetails.value
    .map((d) => d.route.previewSvg)
    .filter((svg): svg is string => Boolean(svg))
})

watch(
  () => detail.value?.name,
  (name) => {
    if (name) setDocumentTitle(name)
  },
  { immediate: true },
)

function resolveMemberLink(
  entityId: string,
  railwayType: string,
  serverId: string,
  dimension: string | null,
) {
  return {
    name: 'transportation.railway.route',
    params: {
      railwayType: String(railwayType).toLowerCase(),
      routeId: entityId,
    },
    query: { serverId, dimension: dimension ?? undefined },
  }
}

async function fetchDetail() {
  loading.value = true
  try {
    const data = await railwayStore.fetchLocalMergedRouteDetail(
      mergedRouteId.value,
      true,
    )
    detail.value = data
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '加载失败',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

onMounted(fetchDetail)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div class="space-y-1">
        <p
          class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          本地合并线路
        </p>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          {{ detail?.name || mergedRouteId }}
        </h1>
        <p
          v-if="detail?.englishName"
          class="text-sm text-slate-500 dark:text-slate-400"
        >
          {{ detail.englishName }}
        </p>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        @click="router.push({ name: 'transportation.railway.routes' })"
      >
        返回列表
      </UButton>
    </div>

    <div
      class="grid gap-6 lg:grid-cols-[1fr,360px]"
      :class="loading ? 'opacity-80' : ''"
    >
      <section class="space-y-4">
        <div
          class="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-800/40"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm text-slate-600 dark:text-slate-300">
              已合并 {{ detail?.routes?.length ?? 0 }} 条线路
            </div>
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              @click="fullscreenOpen = true"
            >
              全屏地图
            </UButton>
          </div>

          <div class="mt-4">
            <RailwaySystemMapPanel
              :routes="routeDetails"
              :loading="loading"
              :auto-focus="true"
            />
          </div>
        </div>

        <div
          v-if="combinedSvgEntries.length"
          class="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-800/40"
        >
          <div class="text-sm font-medium text-slate-700 dark:text-slate-200">
            线路预览
          </div>
          <div class="mt-3 grid gap-3">
            <div
              v-for="(svg, idx) in combinedSvgEntries"
              :key="idx"
              class="rounded-xl border border-slate-200/60 bg-slate-50 p-3 dark:border-slate-800/60 dark:bg-slate-900/30"
              v-html="svg"
            />
          </div>
        </div>

        <RailwaySystemMapFullscreenOverlay
          v-model="fullscreenOpen"
          :routes="routeDetails"
          :loading="loading || routeDetails.length === 0"
        />
      </section>

      <aside class="space-y-4">
        <div
          class="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-800/40"
        >
          <div class="text-sm font-medium text-slate-700 dark:text-slate-200">
            基本信息
          </div>
          <div
            class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300"
          >
            <div class="flex justify-between">
              <span>合并 ID</span>
              <span class="font-mono text-slate-900 dark:text-white">
                {{ mergedRouteId }}
              </span>
            </div>
            <div class="flex justify-between">
              <span>服务端</span>
              <span class="text-slate-900 dark:text-white">
                {{ detail?.server?.name || detail?.serverId || '—' }}
              </span>
            </div>
            <div class="flex justify-between">
              <span>维度</span>
              <span class="text-slate-900 dark:text-white">
                {{ detail?.routes?.[0]?.dimension || '—' }}
              </span>
            </div>
            <div class="pt-2">
              <RailwayCompanyBindingSection
                v-if="detail?.serverId"
                entity-type="ROUTE"
                :entity-id="mergedRouteId"
                :server-id="detail.serverId"
                :railway-type="detail?.routes?.[0]?.railwayType ?? 'MTR'"
                :dimension="detail?.routes?.[0]?.dimension ?? null"
                :operator-company-ids="
                  detail?.bindings?.operatorCompanyIds ?? []
                "
                :builder-company-ids="detail?.bindings?.builderCompanyIds ?? []"
                :editable="false"
              />
            </div>
          </div>
        </div>

        <div
          class="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-800/40"
        >
          <div class="text-sm font-medium text-slate-700 dark:text-slate-200">
            成员线路
          </div>
          <div class="mt-3 space-y-2">
            <div
              v-for="member in detail?.routes ?? []"
              :key="member.entityId"
              class="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800/60 dark:bg-slate-900/30"
            >
              <div class="min-w-0">
                <div class="truncate text-slate-900 dark:text-white">
                  {{
                    member.name?.split('||')[0].split('|')[0] || member.entityId
                  }}
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {{ member.server.name }} · {{ member.railwayType }} ·
                  {{ member.dimension ?? '主世界' }}
                </div>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                @click="
                  router.push(
                    resolveMemberLink(
                      member.entityId,
                      member.railwayType,
                      member.server.id,
                      member.dimension,
                    ),
                  )
                "
              >
                查看
              </UButton>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
