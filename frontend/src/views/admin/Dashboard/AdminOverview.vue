<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePortalStore } from '@/stores/portal'
import { useUiStore } from '@/stores/ui'
import { getApiBaseUrl } from '@/utils/api'

const portalStore = usePortalStore()
const uiStore = useUiStore()

const { admin } = storeToRefs(portalStore)

const users = computed(() => admin.value?.users ?? [])
const backendBase = getApiBaseUrl()

const attachments = computed(() =>
  (admin.value?.attachments.recent ?? []).map((item) => ({
    ...item,
    fullUrl: item.publicUrl
      ? item.publicUrl.startsWith('http')
        ? item.publicUrl
        : `${backendBase}${item.publicUrl}`
      : null,
  })),
)
const unlinked = computed(() => admin.value?.unlinkedPlayers ?? [])

onMounted(async () => {
  if (!admin.value) {
    uiStore.startLoading()
    try {
      await portalStore.fetchAdminOverview()
    } finally {
      uiStore.stopLoading()
    }
  }
})

function formatDate(value: string | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div class="space-y-10">
    <section id="overview" class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">权限与用户概览</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            管理用户账户、绑定的 Minecraft 玩家信息以及角色授权情况。
          </p>
        </div>
        <UBadge color="primary" variant="soft">实时数据</UBadge>
      </header>

      <div class="mt-6 overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
        <table class="w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50/70 dark:bg-slate-900/60">
            <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th class="px-4 py-3">用户</th>
              <th class="px-4 py-3">角色</th>
              <th class="px-4 py-3">主 Minecraft</th>
              <th class="px-4 py-3">其他玩家</th>
              <th class="px-4 py-3">注册时间</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80">
            <tr v-for="user in users" :key="user.id" class="hover:bg-slate-50/70 dark:hover:bg-slate-900/60">
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-900 dark:text-white">{{ user.profile?.displayName ?? user.email }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ user.email }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-2">
                  <UBadge v-for="role in user.roles" :key="role.id" color="primary" variant="soft">
                    {{ role.name }}
                  </UBadge>
                </div>
              </td>
              <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                <div v-if="user.profile?.primaryMinecraft" class="space-y-1">
                  <p>{{ user.profile.primaryMinecraft.minecraftId }}</p>
                  <p class="text-xs text-slate-500">
                    {{ user.profile.primaryMinecraft.nickname ?? '未设置昵称' }}
                  </p>
                </div>
                <span v-else class="text-xs text-slate-500">未绑定</span>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <span v-if="user.minecraftProfiles.length === 0">-</span>
                <span v-else>
                  {{ user.minecraftProfiles.map((profile) => profile.minecraftId).join('、') }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{{ formatDate(user.createdAt) }}</td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                暂无用户数据。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="attachments" class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 dark:text-white">附件系统</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            查看近期上传的附件，确认标签、可见性与所属文件夹。
          </p>
        </div>
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>总数：{{ admin?.attachments.total ?? 0 }}</span>
        </div>
      </header>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="attachment in attachments"
          :key="attachment.id"
          class="rounded-2xl border border-slate-200/70 p-4 shadow-sm transition hover:border-primary-200 dark:border-slate-800/70 dark:hover:border-primary-500/60"
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">{{ attachment.name }}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ attachment.folder?.path ?? '根目录' }}</p>
            </div>
            <UBadge :color="attachment.isPublic ? 'success' : 'neutral'" variant="soft">
              {{ attachment.isPublic ? '公开' : '私有' }}
            </UBadge>
          </div>

          <div class="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <p>上传者：{{ attachment.owner.name ?? attachment.owner.email }}</p>
            <p>上传时间：{{ formatDate(attachment.createdAt) }}</p>
            <p>大小：{{ (attachment.size / 1024).toFixed(1) }} KB</p>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <UBadge
              v-for="tag in attachment.tags"
              :key="tag.id"
              color="primary"
              variant="outline"
            >
              {{ tag.name }}
            </UBadge>
          </div>

          <div class="mt-4 flex gap-2">
            <UButton
              v-if="attachment.fullUrl"
              :href="attachment.fullUrl"
              target="_blank"
              rel="noreferrer"
              size="xs"
              color="primary"
              variant="soft"
            >
              预览
            </UButton>
            <UButton size="xs" color="neutral" variant="outline">
              管理
            </UButton>
          </div>
        </div>
      </div>

      <div v-if="attachments.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        暂无附件记录。
      </div>
    </section>

    <section id="users" class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">未绑定玩家</h2>
      <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
        这些玩家尚未匹配到账号，请在后端提供的接口中补充绑定逻辑。
      </p>
      <div v-if="unlinked.length" class="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div
          v-for="player in unlinked"
          :key="player.id"
          class="rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <p class="font-medium text-slate-900 dark:text-white">{{ player.minecraftId }}</p>
          <p class="text-xs text-slate-500">{{ player.nickname ?? '待同步昵称' }}</p>
        </div>
      </div>
      <div v-else class="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        没有未绑定的玩家。
      </div>
    </section>
  </div>
</template>
