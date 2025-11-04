<script setup lang="ts">
import { computed } from 'vue'
import type { CountryCode } from './region-data'
import { countries, provinces, municipalities, citiesMap, districtsMap, hkDistricts, moParishes, twCounties } from './region-data'

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
const isHK = computed(() => props.modelValue.country === 'HK')
const isMO = computed(() => props.modelValue.country === 'MO')
const isTW = computed(() => props.modelValue.country === 'TW')

const cityOptions = computed(() => {
  const p = props.modelValue.province || ''
  return citiesMap[p] || []
})
const isMunicipality = computed(() => municipalities.includes(props.modelValue.province || ''))
const districtOptions = computed(() => {
  if (isHK.value) return hkDistricts
  if (isMO.value) return moParishes
  if (isMunicipality.value) {
    const city = props.modelValue.province || ''
    return districtsMap[city] || []
  }
  const city = props.modelValue.city || ''
  return districtsMap[city] || []
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-3">
      <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">国家 / 地区</div>
      <div class="flex-1">
        <USelectMenu
          :model-value="props.modelValue.country"
          :options="countries"
          value-attribute="code"
          option-attribute="name"
          :disabled="props.disabled"
          @update:model-value="(v:any)=>update({ country: v, province: null, city: null, district: null })"
        />
      </div>
    </div>

    <template v-if="isChina">
      <div class="flex items-center gap-3">
        <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">省 / 直辖市</div>
        <div class="flex-1">
          <USelectMenu
            :model-value="props.modelValue.province"
            :options="provinces"
            :disabled="props.disabled"
            @update:model-value="(v:any)=>update({ province: v, city: null, district: null })"
          />
        </div>
      </div>
      <div v-if="!isMunicipality" class="flex items-center gap-3">
        <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">城市</div>
        <div class="flex-1">
          <USelectMenu
            :model-value="props.modelValue.city"
            :options="cityOptions"
            :disabled="props.disabled || !props.modelValue.province"
            @update:model-value="(v:any)=>update({ city: v, district: null })"
          />
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">区 / 县</div>
        <div class="flex-1">
          <USelectMenu
            :model-value="props.modelValue.district"
            :options="districtOptions"
            :disabled="props.disabled || (!isMunicipality && !props.modelValue.city)"
            @update:model-value="(v:any)=>update({ district: v })"
          />
        </div>
      </div>
    </template>

    <template v-else-if="isHK">
      <div class="flex items-center gap-3">
        <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">行政区</div>
        <div class="flex-1">
          <USelectMenu
            :model-value="props.modelValue.district"
            :options="districtOptions"
            :disabled="props.disabled"
            @update:model-value="(v:any)=>update({ district: v })"
          />
        </div>
      </div>
    </template>

    <template v-else-if="isMO">
      <div class="flex items-center gap-3">
        <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">堂区</div>
        <div class="flex-1">
          <USelectMenu
            :model-value="props.modelValue.district"
            :options="districtOptions"
            :disabled="props.disabled"
            @update:model-value="(v:any)=>update({ district: v })"
          />
        </div>
      </div>
    </template>

    <template v-else-if="isTW">
      <div class="flex items-center gap-3">
        <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">县 / 市</div>
        <div class="flex-1">
          <USelectMenu
            :model-value="props.modelValue.district"
            :options="twCounties"
            :disabled="props.disabled"
            @update:model-value="(v:any)=>update({ district: v })"
          />
        </div>
      </div>
    </template>
  </div>
</template>
