<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import dayjs from 'dayjs'
import type { SkinViewer } from 'skinview3d'
import type { PlayerSummary } from '@/types/portal'
import { resolveBindingIdentifier } from './player-profile-helpers'

const props = defineProps<{
  summary: PlayerSummary | null
  formatDateTime: (value: string | null | undefined) => string
  formatIpLocation: (value: string | null | undefined) => string
  isPlayerLogged: boolean
}>()

const emit = defineEmits<{
  (
    event: 'bindingSelected',
    binding: PlayerSummary['authmeBindings'][number],
  ): void
}>()

const skinCanvasRefs = ref<Record<string, HTMLCanvasElement | null>>({})
const skinViewers = ref<Record<string, SkinViewer | null>>({})
let skinviewModule: typeof import('skinview3d') | null = null

async function ensureSkinview() {
  if (!skinviewModule) {
    skinviewModule = await import('skinview3d')
  }
  return skinviewModule
}

async function updateSkinViewer(bindingId: string, playerIdentifier: string) {
  if (typeof window === 'undefined') return
  if (!playerIdentifier) return
  const canvas = skinCanvasRefs.value[bindingId]
  if (!canvas) return

  try {
    const skinview = await ensureSkinview()
    const width = canvas.clientWidth > 0 ? canvas.clientWidth : 160
    const height =
      canvas.clientHeight > 0 ? canvas.clientHeight : Math.round(width * 1.2)
    canvas.width = width
    canvas.height = height

    if (!skinViewers.value[bindingId]) {
      const instance = new skinview.SkinViewer({
        canvas,
        width,
        height,
        skin: `https://mc-heads.hydcraft.cn/skin/${encodeURIComponent(
          playerIdentifier,
        )}`,
      })
      instance.autoRotate = true
      instance.zoom = 0.95
      if (instance.controls) {
        instance.controls.enableZoom = false
        instance.controls.enablePan = false
      }
      const idleAnimation = new skinview.IdleAnimation()
      instance.animation = idleAnimation
      skinViewers.value[bindingId] = instance
    } else {
      const viewer = skinViewers.value[bindingId]
      if (viewer) {
        viewer.width = width
        viewer.height = height
        viewer.loadSkin(
          `https://mc-heads.hydcraft.cn/skin/${encodeURIComponent(
            playerIdentifier,
          )}`,
        )
      }
    }
  } catch (error) {
    console.error('Failed to initialize skinview3d:', error)
  }
}

function cleanupAllSkinViewers() {
  Object.values(skinViewers.value).forEach((viewer) => {
    if (viewer) {
      try {
        viewer.dispose()
      } catch (error) {
        console.error('Error disposing viewer:', error)
      }
    }
  })
  skinViewers.value = {}
  skinCanvasRefs.value = {}
}

watch(
  () => props.summary?.authmeBindings,
  async (bindings) => {
    if (!bindings || bindings.length === 0) {
      cleanupAllSkinViewers()
      return
    }
    await nextTick()
    bindings.forEach((binding) => {
      const identifier = resolveBindingIdentifier(binding)
      if (identifier) {
        void updateSkinViewer(binding.id, identifier)
      }
    })
  },
  { immediate: true, deep: false },
)

onBeforeUnmount(() => {
  cleanupAllSkinViewers()
})

const normalizedBindings = computed(() => props.summary?.authmeBindings ?? [])
</script>

<template>
  <div class="grid gap-2 md:grid-cols-4">
    <template v-if="props.summary">
      <div
        v-for="binding in normalizedBindings"
        :key="binding.id"
        class="w-42 rounded-xl p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 relative hover:shadow-inner hover:outline-primary-400 outline-2 outline-transparent transition duration-200 cursor-pointer"
        role="button"
        @click="emit('bindingSelected', binding)"
      >
        <div class="flex justify-center items-center gap-3">
          <canvas
            :ref="
              (el) => {
                if (el) skinCanvasRefs[binding.id] = el as HTMLCanvasElement
              }
            "
            width="140"
            height="200"
            class="h-50 w-auto rounded-lg pointer-events-none"
          />
        </div>

        <div>
          <UPopover mode="hover">
            <template #content>
              <div class="p-3">
                <div
                  v-if="binding.lastlogin"
                  class="text-xs text-slate-500 dark:text-slate-500"
                >
                  最近登录于
                  <span class="font-semibold">
                    {{ dayjs(binding.lastlogin).format('YYYY/MM/DD HH:mm:ss') }}
                  </span>
                  <span
                    v-if="
                      props.formatIpLocation(binding.lastLoginLocation) !== ''
                    "
                  >
                    （{{ props.formatIpLocation(binding.lastLoginLocation) }}）
                  </span>
                  。
                </div>
                <div
                  v-if="binding.regdate"
                  class="text-xs text-slate-500 dark:text-slate-500"
                >
                  该账号注册于
                  <span class="font-semibold">
                    {{ dayjs(binding.regdate).format('YYYY/MM/DD HH:mm:ss') }}
                  </span>
                  <span
                    v-if="props.formatIpLocation(binding.regIpLocation) !== ''"
                  >
                    （{{ props.formatIpLocation(binding.regIpLocation) }}）
                  </span>
                  。
                </div>
                <div
                  v-if="binding.boundAt"
                  class="text-xs text-slate-500 dark:text-slate-500"
                >
                  该账户于
                  <span class="font-semibold">
                    {{ props.formatDateTime(binding.boundAt) }}
                  </span>
                  绑定到本系统。
                </div>
              </div>
            </template>
            <template #default>
              <div>
                <div
                  class="line-clamp-1 truncate text-xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ binding.realname }}
                </div>

                <div
                  v-if="binding.lastlogin"
                  class="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1"
                >
                  <span
                    v-if="props.isPlayerLogged"
                    class="inline-flex h-2 w-2 rounded-full bg-emerald-500"
                  />
                  <span>
                    {{ dayjs().diff(dayjs(binding.lastlogin), 'day') }}
                    天前登录过
                  </span>
                </div>
              </div>
            </template>
          </UPopover>
        </div>
      </div>
      <div
        v-if="normalizedBindings.length === 0"
        class="text-xs text-slate-500 dark:text-slate-500"
      >
        暂无 AuthMe 绑定
      </div>
    </template>
    <USkeleton v-else class="h-20 w-full" />
  </div>
</template>
