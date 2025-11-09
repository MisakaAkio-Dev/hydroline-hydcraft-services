<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { CountryCode } from '@/views/user/Profile/components/region-data'
import {
  countries,
  provinces,
  municipalities,
  singleLevelRegions,
  citiesMap,
  districtsMap,
} from '@/views/user/Profile/components/region-data'
import { loadChinaDivision } from '@/views/user/Profile/components/region-loader'

export type RegionValue = {
  country: CountryCode
  province?: string | null
  city?: string | null
  district?: string | null
}

const props = defineProps<{
  modelValue: RegionValue
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: RegionValue): void }>()

function update(partial: Partial<RegionValue>) {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

const isChina = computed(() => props.modelValue.country === 'CN')

// 动态数据（按需）
const dynamicProvinces = ref<string[] | null>(null)
const dynamicCitiesMap = ref<Record<string, string[]> | null>(null)
const dynamicDistrictsMap = ref<Record<string, string[]> | null>(null)
const dynamicMunicipalities = ref<string[] | null>(null)

async function ensureChinaDataLoaded() {
  if (!isChina.value) return
  if (dynamicProvinces.value) return
  const data = await loadChinaDivision()
  dynamicProvinces.value = data.provinces
  dynamicCitiesMap.value = data.citiesMap
  dynamicDistrictsMap.value = data.districtsMap
  dynamicMunicipalities.value = data.municipalities
}

onMounted(() => {
  if (isChina.value) void ensureChinaDataLoaded()
})
watch(
  () => props.modelValue.country,
  (c) => {
    if (c === 'CN') void ensureChinaDataLoaded()
    // 切换国家时，重置后续级别
    if (c !== 'CN') update({ province: null, city: null, district: null })
  },
)

const provinceOptions = computed(() => dynamicProvinces.value ?? provinces)
const isMunicipality = computed(() => {
  const list = dynamicMunicipalities.value ?? municipalities
  return list.includes(props.modelValue.province || '')
})
const isSingleLevel = computed(() =>
  singleLevelRegions.includes(props.modelValue.province || ''),
)
const cityOptions = computed(() => {
  const p = props.modelValue.province || ''
  const map = dynamicCitiesMap.value ?? citiesMap
  return map[p] || []
})
const districtOptions = computed(() => {
  if (isSingleLevel.value) return []
  const map = dynamicDistrictsMap.value ?? districtsMap
  if (isMunicipality.value) {
    const city = props.modelValue.province || ''
    return map[city] || []
  }
  const city = props.modelValue.city || ''
  return map[city] || []
})

watch(
  () => [props.modelValue.province, isSingleLevel.value],
  ([, single]) => {
    if (single) update({ city: null, district: null })
  },
)
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
    <USelectMenu
      class="w-full"
      :model-value="props.modelValue.country"
      :items="countries"
      value-key="code"
      label-key="name"
      :disabled="props.disabled"
      @update:model-value="(v: any) => update({ country: v })"
    />

    <USelectMenu
      v-if="isChina"
      class="w-full"
      :model-value="
        (props.modelValue.province ?? undefined) as string | undefined
      "
      :items="provinceOptions"
      :disabled="props.disabled"
      @update:model-value="
        (v: any) => update({ province: v, city: null, district: null })
      "
    />

    <USelectMenu
      v-if="isChina && !isMunicipality && !isSingleLevel"
      class="w-full"
      :model-value="(props.modelValue.city ?? undefined) as string | undefined"
      :items="cityOptions"
      :disabled="props.disabled || !props.modelValue.province"
      @update:model-value="(v: any) => update({ city: v, district: null })"
    />

    <USelectMenu
      v-if="isChina && !isSingleLevel"
      class="w-full"
      :model-value="
        (props.modelValue.district ?? undefined) as string | undefined
      "
      :items="districtOptions"
      :disabled="props.disabled || (!isMunicipality && !props.modelValue.city)"
      @update:model-value="(v: any) => update({ district: v })"
    />
  </div>
</template>
