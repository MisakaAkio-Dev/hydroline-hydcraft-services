<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import RailwayMapPanel from '@/views/user/Transportation/railway/components/RailwayMapPanel.vue'
import { formatFolderPathDisplay } from '@/views/admin/Attachments/folderDisplay'
import { apiFetch } from '@/utils/http/api'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'
import type {
  RailwayBanner,
  RailwayEntity,
  RailwayRoute,
  RailwayRouteDetail,
} from '@/types/transportation'

type PortalAttachmentSearchResult = {
  id: string
  name: string | null
  originalName: string
  size: number
  isPublic: boolean
  publicUrl: string | null
  folder: {
    id: string
    name: string
    path: string
  } | null
}

type AttachmentSelectOption = {
  id: string
  label: string
  description: string
}

dayjs.extend(relativeTime)

const transportationStore = useTransportationRailwayStore()
const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

const overview = computed(() => transportationStore.overview)
const banners = computed(() => overview.value?.banners ?? [])
const stats = computed(
  () =>
    overview.value?.stats ?? {
      serverCount: 0,
      routes: 0,
      stations: 0,
      depots: 0,
    },
)
const latest = computed(
  () =>
    overview.value?.latest ?? {
      depots: [],
      stations: [],
      routes: [],
    },
)
const recommendations = computed(() => overview.value?.recommendations ?? [])
const warnings = computed(() => overview.value?.warnings ?? [])

const activeBannerIndex = ref(0)
const bannerCycleTimer = ref<number | null>(null)
const activeBanner = computed<RailwayBanner | null>(
  () => banners.value[activeBannerIndex.value] ?? null,
)
const activeBannerHasCta = computed(() =>
  Boolean(
    activeBanner.value?.ctaLink &&
      activeBanner.value?.ctaLabel &&
      activeBanner.value.ctaLabel.trim(),
  ),
)

const canManageBanners = computed(() =>
  authStore.permissionKeys.includes('transportation.railway.manage-banners'),
)

const settingsModalOpen = ref(false)
const bannerFormDialogOpen = ref(false)
const editingBannerId = ref<string | null>(null)
const bannerForm = reactive({
  attachmentId: '',
  title: '',
  subtitle: '',
  description: '',
  ctaLabel: '',
  ctaLink: '',
  isPublished: true,
  displayOrder: 0,
  ctaIsInternal: false,
})

const bannerAttachmentOptions = ref<AttachmentSelectOption[]>([])
const bannerAttachmentSearchTerm = ref('')
const bannerAttachmentLoading = ref(false)
const bannerAttachmentSelectUi = {
  content: 'z-[250]',
} as const
const bannerAttachmentCreateConfig = computed(() => {
  const term = bannerAttachmentSearchTerm.value.trim()
  if (!term) {
    return undefined
  }
  return { when: 'always' } as const
})
let bannerAttachmentAbort: AbortController | null = null
let bannerAttachmentSearchTimer: ReturnType<typeof setTimeout> | null = null

const adminBanners = computed(() => transportationStore.adminBanners)
const adminBannersLoading = computed(
  () => transportationStore.adminBannersLoading,
)
const bannerSubmitting = computed(() => transportationStore.bannerSubmitting)

const selectedRecommendationIndex = ref(0)
const activeRecommendation = computed<RailwayRoute | null>(
  () => recommendations.value[selectedRecommendationIndex.value] ?? null,
)
const recommendationDetail = ref<RailwayRouteDetail | null>(null)

function resetBannerForm(banner?: RailwayBanner | null) {
  bannerForm.attachmentId = banner?.attachmentId ?? ''
  bannerForm.title = banner?.title ?? ''
  bannerForm.subtitle = banner?.subtitle ?? ''
  bannerForm.description = banner?.description ?? ''
  bannerForm.ctaLabel = banner?.ctaLabel ?? ''
  bannerForm.ctaLink = banner?.ctaLink ?? ''
  bannerForm.isPublished = banner?.isPublished ?? true
  bannerForm.displayOrder = banner?.displayOrder ?? 0
  bannerForm.ctaIsInternal = banner?.ctaIsInternal ?? false
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function buildAttachmentOption(
  item: PortalAttachmentSearchResult,
): AttachmentSelectOption {
  const label = item.name?.trim() || item.originalName || item.id
  const segments = [`ID: ${item.id}`, formatFileSize(item.size)]
  if (item.folder?.path) {
    segments.push(formatFolderPathDisplay(item.folder.path) ?? item.folder.path)
  }
  segments.push(item.isPublic ? '公开' : '需设为公开')
  return {
    id: item.id,
    label,
    description: segments.join(' · '),
  }
}

function ensureToken() {
  if (!authStore.token) {
    uiStore.openLoginDialog()
    throw new Error('需要登录后才能执行该操作')
  }
  return authStore.token
}

async function fetchBannerAttachmentOptions(keyword: string) {
  const token = ensureToken()
  bannerAttachmentLoading.value = true
  bannerAttachmentAbort?.abort()
  const controller = new AbortController()
  bannerAttachmentAbort = controller
  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''
  try {
    const results = await apiFetch<PortalAttachmentSearchResult[]>(
      `/portal/attachments/search${query ? `${query}&` : '?'}publicOnly=false`,
      {
        token,
        signal: controller.signal,
        noDedupe: true,
      },
    )
    if (bannerAttachmentAbort !== controller) {
      return
    }
    bannerAttachmentOptions.value = results.map((item) =>
      buildAttachmentOption(item),
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    console.error(error)
    toast.add({
      title: '搜索附件失败',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    if (bannerAttachmentAbort === controller) {
      bannerAttachmentAbort = null
    }
    bannerAttachmentLoading.value = false
  }
}

function openCreateBanner() {
  editingBannerId.value = null
  resetBannerForm(null)
  bannerFormDialogOpen.value = true
}

function openEditBanner(banner: RailwayBanner) {
  editingBannerId.value = banner.id
  resetBannerForm(banner)
  bannerFormDialogOpen.value = true
}

function closeBannerFormDialog() {
  bannerFormDialogOpen.value = false
  editingBannerId.value = null
  resetBannerForm(null)
}

function resetBannerFormFields() {
  editingBannerId.value = null
  resetBannerForm(null)
}

function handleBannerFormDialogToggle(value: boolean) {
  bannerFormDialogOpen.value = value
  if (!value) {
    resetBannerFormFields()
  }
}

function formatLastUpdated(timestamp: number | null) {
  if (!timestamp) return '未知'
  const date = dayjs(timestamp)
  if (!date.isValid()) return '未知'
  return `${date.format('YYYY-MM-DD HH:mm')} · ${date.fromNow()}`
}

function stopBannerCycle() {
  if (bannerCycleTimer.value) {
    window.clearInterval(bannerCycleTimer.value)
    bannerCycleTimer.value = null
  }
}

function startBannerCycle() {
  stopBannerCycle()
  if (banners.value.length <= 1) return
  bannerCycleTimer.value = window.setInterval(() => {
    activeBannerIndex.value =
      (activeBannerIndex.value + 1) % banners.value.length
  }, 8000)
}

function selectBanner(index: number) {
  activeBannerIndex.value = index
  stopBannerCycle()
  startBannerCycle()
}

function selectRecommendation(index: number) {
  selectedRecommendationIndex.value = index
}

function buildRouteDetailLink(item: RailwayRoute) {
  return {
    name: 'transportation.railway.route',
    params: {
      routeId: item.id,
      railwayType: item.railwayType.toLowerCase(),
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

function buildStationDetailLink(item: RailwayEntity) {
  return {
    name: 'transportation.railway.station',
    params: {
      stationId: item.id,
      railwayType: item.railwayType.toLowerCase(),
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

function buildDepotDetailLink(item: RailwayEntity) {
  return {
    name: 'transportation.railway.depot',
    params: {
      depotId: item.id,
      railwayType: item.railwayType.toLowerCase(),
    },
    query: {
      serverId: item.server.id,
      dimension: item.dimension ?? undefined,
    },
  }
}

async function refreshRecommendationDetail(routeItem: RailwayRoute | null) {
  if (!routeItem) {
    recommendationDetail.value = null
    return
  }
  try {
    const detail = await transportationStore.fetchRouteDetail({
      routeId: routeItem.id,
      serverId: routeItem.server.id,
      dimension: routeItem.dimension ?? undefined,
      railwayType: routeItem.railwayType,
    })
    recommendationDetail.value = detail
  } catch (error) {
    console.error(error)
    toast.add({
      title: '加载线路详情失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
  }
}

async function handleSubmitBanner() {
  if (!bannerForm.attachmentId.trim()) {
    toast.add({ title: '请填写附件 ID', color: 'warning' })
    return
  }
  try {
    if (editingBannerId.value) {
      await transportationStore.updateBanner(editingBannerId.value, {
        ...bannerForm,
      })
      toast.add({ title: 'Banner 已更新', color: 'success' })
    } else {
      await transportationStore.createBanner({
        ...bannerForm,
      })
      toast.add({ title: 'Banner 已创建', color: 'success' })
    }
    closeBannerFormDialog()
    await transportationStore.fetchAdminBanners()
  } catch (error) {
    console.error(error)
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    })
  }
}

async function handleDeleteBanner(bannerId: string) {
  if (!window.confirm('确定要删除该 Banner 吗？')) return
  try {
    await transportationStore.deleteBanner(bannerId)
    toast.add({ title: 'Banner 已删除', color: 'warning' })
    await transportationStore.fetchAdminBanners()
  } catch (error) {
    console.error(error)
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    })
  }
}

watch(
  () => banners.value.length,
  () => {
    activeBannerIndex.value = 0
    startBannerCycle()
  },
)

watch(
  () => selectedRecommendationIndex.value,
  () => {
    void refreshRecommendationDetail(activeRecommendation.value)
  },
)

watch(
  () => recommendations.value,
  (items) => {
    selectedRecommendationIndex.value = 0
    if (items.length) {
      void refreshRecommendationDetail(items[0])
    } else {
      recommendationDetail.value = null
    }
  },
)

watch(
  () => settingsModalOpen.value,
  (open) => {
    if (open) {
      void transportationStore.fetchAdminBanners()
      resetBannerFormFields()
    } else {
      transportationStore.clearBannerCache()
      closeBannerFormDialog()
    }
  },
)

watch(
  () => bannerAttachmentSearchTerm.value,
  (keyword) => {
    if (!bannerFormDialogOpen.value) {
      return
    }
    if (bannerAttachmentSearchTimer) {
      clearTimeout(bannerAttachmentSearchTimer)
    }
    bannerAttachmentSearchTimer = setTimeout(() => {
      bannerAttachmentSearchTimer = null
      void fetchBannerAttachmentOptions(keyword.trim())
    }, 300)
  },
)

watch(
  () => bannerFormDialogOpen.value,
  (open) => {
    if (open) {
      bannerAttachmentOptions.value = []
      bannerAttachmentSearchTerm.value = ''
      bannerAttachmentAbort?.abort()
      bannerAttachmentAbort = null
      bannerAttachmentLoading.value = false
      void fetchBannerAttachmentOptions('')
    } else {
      bannerAttachmentAbort?.abort()
      bannerAttachmentAbort = null
      bannerAttachmentLoading.value = false
      bannerAttachmentOptions.value = []
      bannerAttachmentSearchTerm.value = ''
    }
  },
)

onMounted(async () => {
  await transportationStore.fetchOverview()
  startBannerCycle()
  if (activeRecommendation.value) {
    void refreshRecommendationDetail(activeRecommendation.value)
  }
})

onBeforeUnmount(() => {
  stopBannerCycle()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <UButton
      v-if="canManageBanners"
      color="neutral"
      class="m-1.5 absolute right-4 top-6 md:top-10 hover:opacity-70 transition duration-200 cursor-pointer"
      variant="ghost"
      size="sm"
      @click="settingsModalOpen = true"
    >
      <UIcon name="i-lucide-settings" class="w-4.5 h-4.5" />
    </UButton>
    <section
      class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-slate-950/90 shadow-lg dark:border-slate-800/60"
    >
      <div class="relative h-80 w-full">
        <Transition name="fade" mode="out-in">
          <div
            v-if="activeBanner"
            :key="activeBanner.id"
            class="absolute inset-0"
          >
            ·
            <img
              v-if="activeBanner.imageUrl"
              :src="activeBanner.imageUrl"
              alt="banner"
              class="h-full w-full object-cover opacity-70"
            />
            <div
              class="absolute inset-0 bg-linear-to-r from-slate-950/90 via-slate-900/70 to-transparent"
            ></div>
          </div>
          <div v-else class="absolute inset-0 bg-slate-900"></div>
        </Transition>
        <div
          class="relative z-10 flex h-full flex-col justify-between px-6 py-6 md:px-10"
        >
          <div>
            <p class="text-xs uppercase text-slate-200">
              {{ activeBanner?.subtitle || 'Beacon Railway Snapshot' }}
            </p>
            <h2 class="mt-2 text-3xl font-semibold text-white">
              {{ activeBanner?.title || '铁路网络总览' }}
            </h2>
            <p class="mt-3 max-w-2xl text-sm text-slate-200">
              {{
                activeBanner?.description ||
                '实时拉取各服务端的 Beacon MTR 数据，展示最新上线的线路、车站与车厂。'
              }}
            </p>
            <div v-if="activeBannerHasCta" class="mt-4 flex flex-wrap gap-2">
              <UButton
                color="primary"
                size="sm"
                :to="
                  activeBanner.ctaIsInternal ? activeBanner.ctaLink : undefined
                "
                :href="
                  activeBanner.ctaIsInternal ? undefined : activeBanner.ctaLink
                "
                :target="activeBanner.ctaIsInternal ? undefined : '_blank'"
              >
                {{ activeBanner.ctaLabel }}
              </UButton>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="banners.length > 1">
              <button
                v-for="(banner, index) in banners"
                :key="banner.id"
                class="h-2 w-2 rounded-full transition"
                :class="
                  index === activeBannerIndex ? 'bg-white' : 'bg-white/30'
                "
                @click="selectBanner(index)"
              ></button>
            </template>
            <span
              v-else-if="banners.length === 0"
              class="text-xs text-slate-200"
              >暂无轮播配置</span
            >
          </div>
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-3">
        <RouterLink
          :to="{ name: 'transportation.railway.routes' }"
          class="rounded-2xl border border-slate-200/70 bg-white p-5 text-center text-primary shadow-sm transition hover:border-primary hover:bg-primary/5 active:bg-primary/10 dark:border-slate-800/70 dark:bg-slate-900"
        >
          <p
            class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            全服线路
          </p>
          <p class="mt-2 text-xl font-semibold">查看</p>
        </RouterLink>
        <RouterLink
          :to="{ name: 'transportation.railway.stations' }"
          class="rounded-2xl border border-slate-200/70 bg-white p-5 text-center text-primary shadow-sm transition hover:border-primary hover:bg-primary/5 active:bg-primary/10 dark:border-slate-800/70 dark:bg-slate-900"
        >
          <p
            class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            全服车站
          </p>
          <p class="mt-2 text-xl font-semibold">查看</p>
        </RouterLink>
        <RouterLink
          :to="{ name: 'transportation.railway.depots' }"
          class="rounded-2xl border border-slate-200/70 bg-white p-5 text-center text-primary shadow-sm transition hover:border-primary hover:bg-primary/5 active:bg-primary/10 dark:border-slate-800/70 dark:bg-slate-900"
        >
          <p
            class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            全服车厂
          </p>
          <p class="mt-2 text-xl font-semibold">查看</p>
        </RouterLink>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <div
          class="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900"
        >
          <p class="text-xs uppercase tracking-wide text-slate-500">登记线路</p>
          <p class="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
            {{ stats.routes }}
          </p>
        </div>
        <div
          class="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900"
        >
          <p class="text-xs uppercase tracking-wide text-slate-500">有效车站</p>
          <p class="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
            {{ stats.stations }}
          </p>
        </div>
        <div
          class="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900"
        >
          <p class="text-xs uppercase tracking-wide text-slate-500">车厂/段</p>
          <p class="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
            {{ stats.depots }}
          </p>
        </div>
      </div>
    </section>

    <UAlert
      v-if="warnings.length"
      color="warning"
      variant="soft"
      title="部分服务端数据拉取失败"
      :description="
        warnings.map((warn) => `#${warn.serverId}: ${warn.message}`).join('\n')
      "
    />

    <section class="grid gap-6 lg:grid-cols-2">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            推荐线路
          </h3>
          <p class="text-xs text-slate-500">
            基于 Beacon last_updated 与活跃度随机推荐
          </p>
        </div>
        <div class="space-y-3">
          <p v-if="recommendations.length === 0" class="text-sm text-slate-500">
            暂无推荐线路，稍后再试。
          </p>
          <label
            v-for="(item, index) in recommendations"
            :key="item.id + item.server.id"
            class="flex cursor-pointer flex-col gap-2 rounded-2xl border border-slate-200/70 p-4 transition hover:border-primary-200 dark:border-slate-800/70 dark:hover:border-primary-400/50"
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <p
                  class="text-base font-semibold text-slate-900 dark:text-white"
                >
                  {{ item.name || '未命名线路' }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ item.server.name }} · {{ item.dimension || '未知维度' }}
                </p>
              </div>
              <label
                class="inline-flex items-center gap-2 text-xs text-slate-500"
              >
                <input
                  type="radio"
                  name="recommendation"
                  class="h-4 w-4"
                  :checked="index === selectedRecommendationIndex"
                  @change="selectRecommendation(index)"
                />
                查看
              </label>
            </div>
            <div class="flex flex-wrap gap-2 text-xs text-slate-500">
              <span>模式：{{ item.transportMode || '—' }}</span>
              <span>站点数：{{ item.platformCount ?? '—' }}</span>
              <span>更新时间：{{ formatLastUpdated(item.lastUpdated) }}</span>
            </div>
            <RouterLink
              class="text-xs text-primary hover:underline"
              :to="buildRouteDetailLink(item)"
            >
              打开线路详情 →
            </RouterLink>
          </label>
        </div>
      </div>
      <div
        class="rounded-2xl border border-slate-200/70 bg-white/90 p-0 shadow-sm dark:border-slate-800/70 dark:bg-slate-900"
      >
        <div class="flex items-center justify-between px-5 py-3">
          <div>
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
              Dynmap 路径预览
            </p>
            <p class="text-xs text-slate-500">
              仅展示推荐线路的路线骨架，点击上方可切换
            </p>
          </div>
        </div>
        <div class="p-3 pt-0">
          <RailwayMapPanel
            :geometry="recommendationDetail?.geometry ?? null"
            :color="recommendationDetail?.route.color ?? null"
            :loading="!recommendationDetail"
            height="360px"
          />
        </div>
      </div>
    </section>

    <UModal
      :open="settingsModalOpen"
      @update:open="(value: boolean) => (settingsModalOpen = value)"
      :ui="{ width: 'w-full max-w-4xl' }"
    >
      <template #title>铁路轮播配置</template>
      <template #body>
        <div class="space-y-4">
          <div
            class="rounded-2xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
                Banner 列表
              </h4>
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                @click="openCreateBanner()"
              >
                新增
              </UButton>
            </div>
            <div class="mt-3 space-y-3">
              <p v-if="adminBannersLoading" class="text-sm text-slate-500">
                <UIcon
                  name="i-lucide-loader-2"
                  class="inline-block h-5 w-5 animate-spin text-slate-400"
                />
              </p>
              <p
                v-else-if="adminBanners.length === 0"
                class="text-sm text-slate-500"
              >
                暂无数据，请先创建。
              </p>
              <div
                v-for="banner in adminBanners"
                :key="banner.id"
                class="rounded-xl border border-slate-100/80 p-3 text-sm dark:border-slate-800"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-slate-900 dark:text-white">
                      {{ banner.title || '未命名 Banner' }}
                    </p>
                    <p class="text-xs text-slate-500">
                      附件：{{ banner.attachmentId || '未配置' }}
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <UButton
                      size="xs"
                      variant="soft"
                      @click="openEditBanner(banner)"
                    >
                      编辑
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :loading="bannerSubmitting"
                      @click="handleDeleteBanner(banner.id)"
                    >
                      删除
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="bannerFormDialogOpen"
      @update:open="handleBannerFormDialogToggle"
      :ui="{ width: 'w-full max-w-lg' }"
    >
      <template #title>{{ editingBannerId ? '编辑' : '创建' }} Banner</template>
      <template #body>
        <div class="mt-3 space-y-3">
          <UFormField label="背景图" required class="w-full">
            <USelectMenu
              class="w-full"
              :model-value="bannerForm.attachmentId || undefined"
              :items="bannerAttachmentOptions"
              :ui="bannerAttachmentSelectUi"
              value-key="id"
              label-key="label"
              description-key="description"
              v-model:search-term="bannerAttachmentSearchTerm"
              :ignore-filter="true"
              :loading="bannerAttachmentLoading"
              :search-input="{ placeholder: '输入名称或 ID 搜索附件' }"
              :create-item="bannerAttachmentCreateConfig"
              placeholder="选择或搜索附件"
              @update:model-value="
                (value: string | undefined) => {
                  bannerForm.attachmentId = value ?? ''
                }
              "
              @create="
                (value: string) => {
                  bannerForm.attachmentId = value?.trim() ?? ''
                }
              "
            >
              <template #item="{ item }">
                <div class="space-y-0.5">
                  <p
                    class="text-sm font-medium text-slate-800 dark:text-slate-200"
                  >
                    {{ item.label }}
                  </p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">
                    {{ item.description }}
                  </p>
                </div>
              </template>
              <template #empty="{ searchTerm }">
                <div
                  class="py-6 text-center text-xs text-slate-500 dark:text-slate-400"
                >
                  <span v-if="bannerAttachmentLoading">搜索中…</span>
                  <span v-else>
                    {{ searchTerm ? '没有匹配的附件' : '输入关键字开始搜索' }}
                  </span>
                </div>
              </template>
            </USelectMenu>
          </UFormField>
          <UFormField label="标题" class="w-full">
            <UInput class="w-full" v-model="bannerForm.title" />
          </UFormField>
          <UFormField label="副标题" class="w-full">
            <UInput class="w-full" v-model="bannerForm.subtitle" />
          </UFormField>
          <UFormField label="描述" class="w-full">
            <UTextarea
              class="w-full"
              v-model="bannerForm.description"
              :rows="3"
            />
          </UFormField>
          <div class="grid gap-3 md:grid-cols-2 w-full">
            <UFormField label="按钮文本" class="w-full">
              <UInput class="w-full" v-model="bannerForm.ctaLabel" />
            </UFormField>
            <UFormField label="跳转链接" class="w-full">
              <UInput
                class="w-full"
                v-model="bannerForm.ctaLink"
                placeholder="https://"
              />
            </UFormField>
          </div>
          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
              跳转类型
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                color="primary"
                :variant="bannerForm.ctaIsInternal ? 'solid' : 'soft'"
                @click="bannerForm.ctaIsInternal = true"
              >
                站内跳转
              </UButton>
              <UButton
                size="xs"
                color="primary"
                :variant="bannerForm.ctaIsInternal ? 'soft' : 'solid'"
                @click="bannerForm.ctaIsInternal = false"
              >
                外部链接
              </UButton>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              站内跳转会通过 RouterLink 进入站内页面，外部则会新窗口打开。
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              :disabled="bannerSubmitting"
              @click="resetBannerFormFields()"
            >
              重置
            </UButton>
            <UButton
              color="primary"
              :loading="bannerSubmitting"
              @click="handleSubmitBanner"
            >
              {{ editingBannerId ? '保存修改' : '创建 Banner' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
