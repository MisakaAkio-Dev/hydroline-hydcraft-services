<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import JsBarcode from 'jsbarcode'
import {
  countries,
  municipalities,
} from '@/views/user/Profile/components/region-data'
import { playerStatusOptions } from '@/constants/status'
import type {
  PlayerBiography,
  PlayerMinecraftResponse,
  PlayerRegionResponse,
  PlayerStatusSnapshot,
  PlayerSummary,
} from '@/types/portal'

const props = defineProps<{
  summary: PlayerSummary | null
  region: PlayerRegionResponse | null
  statusSnapshot: PlayerStatusSnapshot | null
  minecraft: PlayerMinecraftResponse | null
  formatDateTime: (value: string | null | undefined) => string
  formatIpLocation: (value: string | null | undefined) => string
  isViewingSelf: boolean
  biography: PlayerBiography | null
}>()

const emit = defineEmits<{
  (event: 'edit-biography'): void
}>()

const rawBirthday = computed(
  () =>
    props.summary?.birthday ?? props.summary?.profileExtra?.birthday ?? null,
)

const formattedBirthday = computed(() => {
  const raw = rawBirthday.value
  if (!raw) {
    return null
  }
  const parsed = dayjs(raw)
  return parsed.isValid() ? parsed.format('YYYY/MM/DD') : null
})

const fallbackRegion = computed(() => props.summary?.profileExtra ?? {})
const regionCountryCode = computed(
  () =>
    props.region?.region?.country ??
    fallbackRegion.value.regionCountry ??
    'OTHER',
)
const regionCountryLabel = computed(() => {
  if (!regionCountryCode.value) {
    return ''
  }
  const mapped = countries.find(
    (entry) => entry.code === regionCountryCode.value,
  )?.name
  if (mapped) return mapped
  if (regionCountryCode.value === 'HK') return '香港特别行政区'
  if (regionCountryCode.value === 'MO') return '澳门特别行政区'
  if (regionCountryCode.value === 'TW') return '台湾地区'
  return regionCountryCode.value
})

const regionProvince = computed(
  () =>
    props.region?.region?.province ?? fallbackRegion.value.regionProvince ?? '',
)
const regionCity = computed(
  () => props.region?.region?.city ?? fallbackRegion.value.regionCity ?? '',
)
const regionDistrict = computed(
  () =>
    props.region?.region?.district ?? fallbackRegion.value.regionDistrict ?? '',
)

const isChina = computed(() => regionCountryCode.value === 'CN')
const isHkMoTw = computed(() => {
  const province = regionProvince.value
  return (
    province === '香港特别行政区' ||
    province === '澳门特别行政区' ||
    province === '台湾地区'
  )
})

const isMunicipality = computed(() => {
  if (!regionProvince.value) return false
  return municipalities.includes(regionProvince.value)
})

const hasRegionData = computed(() => {
  return Boolean(
    regionCountryCode.value ||
      regionProvince.value ||
      regionCity.value ||
      regionDistrict.value,
  )
})

const hasSummary = computed(() => Boolean(props.summary))

const showCityLevel = computed(() => {
  if (!isChina.value) return false
  if (!regionCity.value) return false
  if (isMunicipality.value) return false
  return true
})

const showCountryLabel = computed(() => {
  if (!regionCountryCode.value) return false
  if (isChina.value && !isHkMoTw.value) {
    return false
  }
  return true
})

const displayCountryLabel = computed(() => {
  if (!showCountryLabel.value) return ''
  if (isChina.value) {
    return '中国'
  }
  return regionCountryLabel.value
})

const showProvince = computed(
  () => isChina.value && Boolean(regionProvince.value),
)
const showDistrict = computed(
  () => isChina.value && Boolean(regionDistrict.value),
)

const summaryLastLoginLocationDisplay = computed(() => {
  if (!props.summary?.lastLoginLocation) return ''
  return props.formatIpLocation(props.summary.lastLoginLocation)
})

const statusLabel = computed(() => {
  const code = props.statusSnapshot?.status
  if (!code) return ''
  const option = playerStatusOptions.find((item) => item.value === code)
  return option?.label ?? code
})

const barcodeCanvas = ref<HTMLCanvasElement | null>(null)
const piicValue = computed(() => props.summary?.piic ?? '')

async function generateBarcode() {
  await nextTick()
  const canvas = barcodeCanvas.value
  if (!canvas || !piicValue.value) return
  try {
    JsBarcode(canvas, piicValue.value, {
      format: 'CODE128',
      height: 40,
      displayValue: false,
      background: 'transparent',
      margin: 2,
    })
  } catch (error) {
    console.error('Failed to render PIIC barcode', error)
  }
}

watch(
  () => piicValue.value,
  () => {
    void generateBarcode()
  },
  { immediate: true },
)

onMounted(() => {
  void generateBarcode()
})

function handleEditBiography() {
  emit('edit-biography')
}
</script>

<template>
  <div>
    <div class="flex flex-col mb-2">
      <div class="flex justify-center">
        <canvas
          ref="barcodeCanvas"
          class="h-11 w-full dark:filter-[invert(1)]"
        />
      </div>
      <UTooltip text="玩家身份标识码（PIIC）">
        <div
          class="text-center text-xs text-slate-700 dark:text-slate-200 leading-normal tracking-[0.2em]"
        >
          <template v-if="props.summary">
            <template v-if="props.summary.piic">
              {{ props.summary.piic }}
            </template>
            <template v-else>
              <span class="text-slate-400">—</span>
            </template>
          </template>
          <template v-else>
            <USkeleton class="mx-auto h-4 w-32" />
          </template>
        </div>
      </UTooltip>
    </div>

    <div
      class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-200"
    >
      <div class="md:col-span-2">
        <div class="text-xs text-slate-500 dark:text-slate-500">用户信息</div>
        <div
          class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-800 dark:text-slate-300"
        >
          <template v-if="props.summary">
            <span class="inline-flex items-center gap-2">
              {{ props.summary.displayName }}
              <UButton
                variant="link"
                icon="i-lucide-qr-code"
                class="flex justify-center items-center rounded-full h-3 w-3"
                size="xs"
              />
            </span>
            <div
              class="text-base font-semibold text-slate-800 dark:text-slate-300"
            >
              <div
                v-if="props.minecraft?.permissionRoles?.length"
                class="flex flex-wrap gap-2"
              >
                <UBadge
                  v-for="role in props.minecraft?.permissionRoles"
                  :key="role.id"
                  variant="soft"
                  size="sm"
                >
                  {{ role.name || role.key }}
                </UBadge>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="flex flex-col gap-1 w-full">
              <USkeleton class="h-4 w-32" />
              <USkeleton class="h-4 w-28" />
            </div>
          </template>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">地区</div>
        <div
          class="text-base font-semibold text-slate-800 dark:text-slate-300 space-y-0"
        >
          <template v-if="hasSummary && hasRegionData">
            <div class="flex flex-wrap gap-0.5">
              <span v-if="displayCountryLabel">{{ displayCountryLabel }}</span>
              <span v-if="showProvince">{{ regionProvince }}</span>
              <span v-if="showCityLevel">{{ regionCity }}</span>
              <span v-if="showDistrict">
                {{ regionDistrict }}
              </span>
            </div>
          </template>
          <template v-else-if="hasSummary">
            <span class="text-slate-400">—</span>
          </template>
          <template v-else>
            <USkeleton class="h-4 w-32" />
          </template>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">入服时间</div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="props.summary?.joinDate">
            {{ dayjs(props.summary.joinDate).format('YYYY/MM/DD') }}
          </template>
          <template v-else-if="hasSummary">
            <span class="text-slate-400">—</span>
          </template>
          <template v-else>
            <USkeleton class="h-5 w-24" />
          </template>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">用户状态</div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="props.statusSnapshot">
            {{ statusLabel }}
          </template>
          <template v-else-if="hasSummary">
            <span class="text-slate-400">—</span>
          </template>
          <template v-else>
            <USkeleton class="h-5 w-24" />
          </template>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">生日</div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="formattedBirthday">
            {{ formattedBirthday }}
          </template>
          <template v-else-if="hasSummary">
            <span class="text-slate-400">—</span>
          </template>
          <template v-else>
            <USkeleton class="h-5 w-24" />
          </template>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">注册时间</div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="props.summary?.createdAt">
            {{ props.formatDateTime(props.summary.createdAt) }}
          </template>
          <template v-else-if="hasSummary">
            <span class="text-slate-400">—</span>
          </template>
          <template v-else>
            <USkeleton class="h-5 w-24" />
          </template>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">最近登录</div>
        <div
          class="text-base font-semibold text-slate-800 dark:text-slate-300 flex flex-col"
        >
          <template v-if="props.summary?.lastLoginAt">
            <span>{{ props.formatDateTime(props.summary.lastLoginAt) }}</span>
          </template>
          <template v-else-if="hasSummary">
            <span class="text-slate-400">—</span>
          </template>
          <template v-else>
            <USkeleton class="h-5 w-36" />
          </template>
          <template v-if="summaryLastLoginLocationDisplay">
            <span
              class="text-xs font-normal text-slate-500 dark:text-slate-500"
            >
              {{ summaryLastLoginLocationDisplay }}
            </span>
          </template>
          <template v-else-if="hasSummary">
            <span
              class="text-xs font-normal text-slate-500 dark:text-slate-500"
            >
              —
            </span>
          </template>
          <template v-else>
            <USkeleton class="h-3 w-32 mt-1" />
          </template>
        </div>
      </div>
    </div>

    <div class="flex flex-col items-center gap-2 mt-6">
      <RouterLink
        v-if="props.isViewingSelf"
        class="block w-full"
        :to="{ name: 'profile.basic' }"
      >
        <UButton
          color="primary"
          class="flex justify-center items-center gap-2 w-full"
        >
          <UIcon name="i-lucide-wrench" class="h-4 w-4" />
          修改用户信息
        </UButton>
      </RouterLink>

      <UButton
        v-else
        variant="soft"
        color="primary"
        class="flex justify-center items-center gap-2 w-full"
      >
        <UIcon name="i-lucide-mail" class="h-4 w-4" />
        私信
      </UButton>

      <UButton
        v-if="props.isViewingSelf"
        variant="soft"
        color="primary"
        class="flex justify-center items-center gap-2 w-full"
        @click="handleEditBiography"
      >
        <UIcon name="i-lucide-edit-3" class="h-4 w-4" />
        编辑自述
      </UButton>
    </div>
  </div>
</template>
