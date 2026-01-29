<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RailwayCreateWizardDialog from '@/views/user/Transportation/railway/components/RailwayCreateWizardDialog.vue'

const router = useRouter()
const open = ref(true)

watch(
  () => open.value,
  (value) => {
    if (value) return
    router.push({ name: 'transportation.railway' })
  },
)
</script>

<template>
  <RailwayCreateWizardDialog v-model:open="open" :initial-action="'system'" />
</template>
