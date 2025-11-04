<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  open: boolean
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { authmeId: string; password: string }): void
}>()

const form = ref({ authmeId: '', password: '' })

function handleSubmit() {
  emit('submit', { ...form.value })
}
</script>

<template>
  <UModal :open="props.open" @update:open="(v:boolean)=>{ if(!v) emit('close') }">
    <div class="p-4 sm:p-6">
      <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">绑定 AuthMe 账号</h3>
      <div class="mt-4 grid gap-4">
        <UInput v-model="form.authmeId" placeholder="用户名或 RealName" />
        <UInput v-model="form.password" type="password" placeholder="请输入 AuthMe 密码" />
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('close')">取消</UButton>
        <UButton color="primary" :loading="props.loading" @click="handleSubmit">绑定</UButton>
      </div>
    </div>
  </UModal>
  
</template>
