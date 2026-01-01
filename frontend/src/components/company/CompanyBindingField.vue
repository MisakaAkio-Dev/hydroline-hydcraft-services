<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CompanyModel } from '@/types/company'
import {
  resolveCompaniesByIds,
  searchActiveCompanies,
} from '@/utils/company/company-lib'

const props = defineProps<{
  label: string
  companyIds: string[]
  allowEdit?: boolean
}>()

const emit = defineEmits<{
  (event: 'update', payload: string[]): void
}>()

const modalOpen = ref(false)
const searchTerm = ref('')
const searchLoading = ref(false)
const searchOptions = ref<CompanyModel[]>([])
const selectedCompanyIds = ref<string[]>([])
const companyMap = ref<Record<string, CompanyModel>>({})
let searchTimer: ReturnType<typeof setTimeout> | null = null

const allowEdit = computed(() => props.allowEdit !== false)
const orderedCompanyIds = computed(() =>
  [...props.companyIds].filter((id, index, list) => list.indexOf(id) === index),
)

watch(
  () => props.companyIds,
  async (ids) => {
    companyMap.value = await resolveCompaniesByIds(ids)
  },
  { immediate: true },
)

watch(
  () => modalOpen.value,
  (open) => {
    if (!open) return
    searchTerm.value = ''
    selectedCompanyIds.value = []
    void fetchOptions('')
  },
)

watch(
  () => searchTerm.value,
  (value) => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void fetchOptions(value)
    }, 300)
  },
)

async function fetchOptions(keyword: string) {
  searchLoading.value = true
  try {
    searchOptions.value = await searchActiveCompanies(keyword, 12)
  } finally {
    searchLoading.value = false
  }
}

function removeCompany(companyId: string) {
  if (!allowEdit.value) return
  const next = orderedCompanyIds.value.filter((id) => id !== companyId)
  emit('update', next)
}

function addSelectedCompany() {
  if (selectedCompanyIds.value.length === 0) return
  const next = [...orderedCompanyIds.value]
  for (const id of selectedCompanyIds.value) {
    if (!next.includes(id)) {
      next.push(id)
    }
  }
  emit('update', next)
  modalOpen.value = false
}

function resolveCompanyName(companyId: string) {
  return companyMap.value[companyId]?.name ?? '未知公司'
}

function resolveCompanyLogo(companyId: string) {
  return companyMap.value[companyId]?.logoUrl ?? null
}

const bindingTypeQuery = computed(() => {
  if (props.label.includes('运营')) return 'OPERATOR'
  if (props.label.includes('建筑') || props.label.includes('建设'))
    return 'BUILDER'
  return undefined
})
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between gap-2">
      <span class="whitespace-nowrap inline-flex items-center gap-1">
        {{ label }}

        <UButton
          class="rounded-full p-0.5"
          v-if="allowEdit"
          variant="soft"
          size="xs"
          @click="modalOpen = true"
        >
          <UIcon name="i-lucide-plus" class="h-3 w-3" />
        </UButton>
      </span>
      <span class="text-slate-900 dark:text-white">
        <span
          v-if="orderedCompanyIds.length === 0"
          class="text-slate-400 dark:text-slate-500"
        >
          暂无绑定</span
        >

        <div v-else class="flex justify-end flex-wrap gap-x-2 text-xs">
          <div
            v-for="companyId in orderedCompanyIds"
            :key="companyId"
            class="flex items-center gap-0.5 text-sm"
          >
            <RouterLink
              :to="{
                name: 'transportation.railway.company',
                params: { companyId },
                query: { bindingType: bindingTypeQuery },
              }"
              class="flex items-center gap-0.5 hover:opacity-80 transition-opacity hover:underline decoration-slate-400/50 underline-offset-2"
            >
              <img
                v-if="resolveCompanyLogo(companyId)"
                :src="resolveCompanyLogo(companyId) ?? undefined"
                :alt="resolveCompanyName(companyId)"
                class="h-fit w-4 rounded-full object-cover"
              />
              <span>{{ resolveCompanyName(companyId) }}</span>
            </RouterLink>
            <UButton
              v-if="allowEdit"
              variant="link"
              color="neutral"
              class="p-0.5"
              @click="removeCompany(companyId)"
            >
              <UIcon name="i-lucide-x" class="h-3 w-3" />
            </UButton>
          </div>
        </div>
      </span>
    </div>

    <UModal v-model:open="modalOpen">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-800">
              选择{{ label }}
            </h3>
            <UButton size="xs" variant="ghost" @click="modalOpen = false">
              关闭
            </UButton>
          </div>

          <USelectMenu
            v-model="selectedCompanyIds"
            v-model:search-term="searchTerm"
            :items="searchOptions"
            :loading="searchLoading"
            searchable
            multiple
            value-key="id"
            label-key="name"
            placeholder="搜索公司"
            class="w-full"
          >
            <template #option="{ item }">
              <div class="flex flex-col">
                <span class="text-sm text-slate-900">{{ item.name }}</span>
                <span class="text-xs text-slate-500">
                  {{ item.summary || '暂无简介' }}
                </span>
              </div>
            </template>
          </USelectMenu>

          <div class="flex justify-end">
            <UButton
              color="primary"
              :disabled="selectedCompanyIds.length === 0"
              @click="addSelectedCompany"
            >
              添加
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
