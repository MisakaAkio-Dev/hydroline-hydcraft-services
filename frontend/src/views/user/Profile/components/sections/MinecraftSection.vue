<script setup lang="ts">
const props = defineProps<{
  bindings: Array<{
    username: string
    realname?: string | null
    boundAt?: string | Date | null
    ip?: string | null
    ipLocation?: string | null
    regip?: string | null
    regipLocation?: string | null
    lastlogin?: number | null
    regdate?: number | null
  }>
  isEditing: boolean
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: 'add'): void
  (e: 'unbind', username: string): void
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
        玩家绑定信息
      </h3>
      <div>
        <UButton
          size="sm"
          color="primary"
          :loading="props.loading"
          @click="emit('add')"
          >添加绑定</UButton
        >
      </div>
    </div>

    <div
      v-if="props.bindings.length === 0"
      class="rounded-xl border border-dashed border-slate-200/70 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      尚未绑定 AuthMe 账号，点击右上方“添加绑定”以绑定账号。
    </div>

    <div
      v-for="b in props.bindings"
      :key="b.username"
      class="rounded-xl p-4 bg-white dark:bg-slate-700/60 border border-slate-200/60 dark:border-slate-800/60"
    >
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-2xl font-medium text-slate-700 dark:text-slate-200">
            <div>
              <span>
                <img
                  :src="'https://mc-heads.net/avatar/' + b.realname + '/64'"
                  class="inline-blockrounded"
                />
              </span>
              <span>
                {{ b.realname }}
              </span>
            </div>
            <div v-if="b.boundAt" class="text-xs">
              绑定时间：{{
                typeof b.boundAt === 'string'
                  ? new Date(b.boundAt).toLocaleString()
                  : b.boundAt?.toLocaleString?.()
              }}
            </div>
          </div>
          <div
            class="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-2 md:grid-cols-3"
          >
            <div v-if="b.lastlogin">
              上次登录：{{ new Date(b.lastlogin).toLocaleString() }}
            </div>
            <div v-if="b.regdate">
              注册时间：{{ new Date(b.regdate).toLocaleString() }}
            </div>
            <div v-if="b.ip">
              上次登录 IP：{{ b.ip }}
              <span
                v-if="b.ipLocation && b.ipLocation.includes('|')"
                class="text-slate-500 dark:text-slate-400"
                >（{{
                  b.ipLocation.split('|').slice(0, 4).filter(Boolean).join(' ')
                }}）</span
              >
            </div>
            <div v-if="b.regip">
              注册 IP：{{ b.regip }}
              <span
                v-if="b.regipLocation && b.regipLocation.includes('|')"
                class="text-slate-500 dark:text-slate-400"
                >（{{
                  b.regipLocation
                    .split('|')
                    .slice(0, 4)
                    .filter(Boolean)
                    .join(' ')
                }}）</span
              >
            </div>
          </div>
        </div>
        <div class="flex-1 flex items-center gap-2">
          <UButton
            class="w-full whitespace-nowrap"
            type="button"
            color="primary"
            variant="outline"
            :loading="props.loading"
            @click="emit('unbind', b.username)"
            >解除绑定</UButton
          >
        </div>
      </div>
    </div>
  </div>
</template>
