<script setup lang="ts">
const props = defineProps<{
  canViewProfile: boolean
}>()
</script>

<template>
  <div
    v-if="!props.canViewProfile"
    class="mt-8 bg-white/80 text-sm text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/70 dark:text-slate-300"
  >
    <p>
      请登录账户或通过
      <code class="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800"
        >/player/&lt;玩家ID&gt;</code
      >
      指定要查看的玩家档案。
    </p>
  </div>
</template>
