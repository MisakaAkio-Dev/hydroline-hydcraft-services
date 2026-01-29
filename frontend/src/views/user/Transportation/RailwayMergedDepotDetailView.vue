<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'
import { setDocumentTitle } from '@/utils/route/document-title'
import type { RailwayManualMergedEntityDetail } from '@/types/transportation'

const route = useRoute()
const router = useRouter()
const railwayStore = useTransportationRailwayStore()
const toast = useToast()

const mergedId = computed(() => route.params.depotId as string)
const detail = ref<RailwayManualMergedEntityDetail | null>(null)
const loading = ref(true)

watch(
  () => detail.value?.name,
  (name) => {
    if (name) setDocumentTitle(name)
  },
  { immediate: true },
)

function memberLink(
  member: RailwayManualMergedEntityDetail['members'][number],
) {
  return {
    name: 'transportation.railway.depot',
    params: {
      railwayType: String(member.railwayType).toLowerCase(),
      depotId: member.entityId,
    },
    query: {
      serverId: member.serverId,
      dimension: member.dimension ?? undefined,
    },
  }
}

async function fetchDetail() {
  loading.value = true
  try {
    detail.value = await railwayStore.fetchLocalMergedDepotDetail(
      mergedId.value,
      true,
    )
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
          本地合并车厂
        </p>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          {{ detail?.name || mergedId }}
        </h1>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        @click="router.push({ name: 'transportation.railway.depots' })"
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
          <div class="text-sm font-medium text-slate-700 dark:text-slate-200">
            成员车厂
          </div>
          <div class="mt-3 space-y-2">
            <div
              v-for="member in detail?.members ?? []"
              :key="member.entityId"
              class="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800/60 dark:bg-slate-900/30"
            >
              <div class="min-w-0">
                <div class="truncate text-slate-900 dark:text-white">
                  {{ member.entityId }}
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {{ member.serverId }} · {{ member.railwayType }} ·
                  {{ member.dimension ?? '主世界' }}
                </div>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                @click="router.push(memberLink(member))"
              >
                查看
              </UButton>
            </div>
          </div>
        </div>
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
              <span class="font-mono text-slate-900 dark:text-white">{{
                mergedId
              }}</span>
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
                {{ detail?.members?.[0]?.dimension || '—' }}
              </span>
            </div>
          </div>
        </div>

        <div
          class="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-800/40"
        >
          <div class="text-sm font-medium text-slate-700 dark:text-slate-200">
            运营/建设单位
          </div>
          <div class="mt-3">
            <RailwayCompanyBindingSection
              v-if="detail?.serverId"
              entity-type="DEPOT"
              :entity-id="mergedId"
              :server-id="detail.serverId"
              :railway-type="detail.members[0]?.railwayType ?? 'MTR'"
              :dimension="detail?.members?.[0]?.dimension ?? null"
              :operator-company-ids="detail?.bindings?.operatorCompanyIds ?? []"
              :builder-company-ids="detail?.bindings?.builderCompanyIds ?? []"
              :editable="false"
            />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
