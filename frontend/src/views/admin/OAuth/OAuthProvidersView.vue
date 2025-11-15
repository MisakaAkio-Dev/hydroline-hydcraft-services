<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useOAuthStore, type AdminOAuthProvider } from '@/stores/oauth'
import { ApiError } from '@/utils/api'

const oauthStore = useOAuthStore()
const { providers } = storeToRefs(oauthStore)

const loading = computed(() => oauthStore.loadingProviders)
const formModalOpen = ref(false)
const formSaving = ref(false)
const formError = ref('')
const editingProvider = ref<AdminOAuthProvider | null>(null)

const form = reactive({
  key: '',
  name: '',
  type: 'MICROSOFT',
  description: '',
  enabled: true,
  tenantId: '',
  clientId: '',
  clientSecret: '',
  authorizeUrl: '',
  tokenUrl: '',
  redirectUri: '',
  scopes: 'openid profile email offline_access User.Read',
})

onMounted(() => {
  if (!oauthStore.providersLoaded) {
    void oauthStore.fetchProviders().catch((error) => {
      console.warn('[oauth] failed to load providers', error)
    })
  }
})

function openCreate() {
  editingProvider.value = null
  resetForm()
  formModalOpen.value = true
}

function openEdit(provider: AdminOAuthProvider) {
  editingProvider.value = provider
  form.key = provider.key
  form.name = provider.name
  form.type = provider.type
  form.description = provider.description ?? ''
  form.enabled = provider.enabled
  form.tenantId = provider.settings.tenantId ?? ''
  form.clientId = provider.settings.clientId ?? ''
  form.authorizeUrl = provider.settings.authorizeUrl ?? ''
  form.tokenUrl = provider.settings.tokenUrl ?? ''
  form.redirectUri = provider.settings.redirectUri ?? ''
  form.scopes = (provider.settings.scopes ?? []).join(' ')
  form.clientSecret = ''
  formModalOpen.value = true
}

function resetForm() {
  form.key = ''
  form.name = ''
  form.type = 'MICROSOFT'
  form.description = ''
  form.enabled = true
  form.tenantId = ''
  form.clientId = ''
  form.clientSecret = ''
  form.authorizeUrl = ''
  form.tokenUrl = ''
  form.redirectUri = ''
  form.scopes = 'openid profile email offline_access User.Read'
}

async function submitForm() {
  formError.value = ''
  formSaving.value = true
  try {
    const payload = {
      key: form.key.trim(),
      name: form.name.trim(),
      type: form.type.trim() || 'MICROSOFT',
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      settings: {
        tenantId: form.tenantId.trim() || undefined,
        clientId: form.clientId.trim() || undefined,
        clientSecret: form.clientSecret.trim() || undefined,
        authorizeUrl: form.authorizeUrl.trim() || undefined,
        tokenUrl: form.tokenUrl.trim() || undefined,
        redirectUri: form.redirectUri.trim() || undefined,
        scopes: form.scopes
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
    }
    if (editingProvider.value) {
      await oauthStore.updateProvider(editingProvider.value.id, payload)
    } else {
      await oauthStore.createProvider(payload)
    }
    formModalOpen.value = false
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : '保存失败，请稍后再试'
  } finally {
    formSaving.value = false
  }
}

async function refresh() {
  await oauthStore.fetchProviders(true)
}

function closeForm() {
  formModalOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
          OAuth Provider 管理
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          管理第三方登录配置、密钥及启用状态。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refresh"
        >
          刷新
        </UButton>
        <UButton color="primary" icon="i-lucide-plus" @click="openCreate">
          新增 Provider
        </UButton>
      </div>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-slate-900 dark:text-white">
              Provider 列表
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              当前共 {{ providers.length }} 个 Provider
            </p>
          </div>
        </div>
      </template>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="n in 4" :key="n" class="h-14 w-full rounded" />
      </div>
      <div v-else>
        <div
          v-if="providers.length === 0"
          class="rounded-lg border border-dashed border-slate-200/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          暂无 Provider，点击右上角按钮创建。
        </div>
        <div v-else class="-mx-4 overflow-x-auto px-4">
          <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="px-3 py-2">Key</th>
                <th class="px-3 py-2">名称</th>
                <th class="px-3 py-2">类型</th>
                <th class="px-3 py-2">状态</th>
                <th class="px-3 py-2">客户端 ID</th>
                <th class="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr
                v-for="provider in providers"
                :key="provider.id"
                class="text-sm text-slate-700 dark:text-slate-200"
              >
                <td class="px-3 py-3 font-mono text-xs text-slate-500">
                  {{ provider.key }}
                </td>
                <td class="px-3 py-3">
                  <div class="font-semibold text-slate-900 dark:text-white">
                    {{ provider.name }}
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ provider.description || '—' }}
                  </div>
                </td>
                <td class="px-3 py-3 uppercase text-xs">
                  {{ provider.type }}
                </td>
                <td class="px-3 py-3">
                  <UBadge
                    :color="provider.enabled ? 'primary' : 'neutral'"
                    variant="soft"
                    size="xs"
                  >
                    {{ provider.enabled ? '启用' : '禁用' }}
                  </UBadge>
                </td>
                <td class="px-3 py-3 text-xs text-slate-500">
                  {{ provider.settings.clientId || '未配置' }}
                </td>
                <td class="px-3 py-3 text-right">
                  <div class="flex justify-end gap-2">
                    <UButton
                      size="xs"
                      variant="ghost"
                      icon="i-lucide-pen-square"
                      @click="openEdit(provider)"
                    >
                      编辑
                    </UButton>
                    <UBadge
                      v-if="provider.settings.hasClientSecret"
                      size="xs"
                      variant="soft"
                    >
                      已配置密钥
                    </UBadge>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="formModalOpen">
      <template #content>
        <div class="space-y-4 p-6">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ editingProvider ? '编辑 Provider' : '创建 Provider' }}
            </h3>
            <p class="text-sm text-slate-500">
              配置 OAuth Provider 基本信息与凭据。
            </p>
          </div>

          <div class="grid gap-4">
            <div class="space-y-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Key</label>
              <UInput v-model="form.key" :disabled="Boolean(editingProvider)" />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">名称</label>
              <UInput v-model="form.name" />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">类型</label>
              <UInput v-model="form.type" />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">描述</label>
              <UTextarea v-model="form.description" rows="2" />
            </div>
            <div class="flex items-center justify-between rounded-lg border border-slate-200/80 px-3 py-2 dark:border-slate-800">
              <span class="text-sm text-slate-600 dark:text-slate-300">启用状态</span>
              <USwitch v-model="form.enabled" />
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-1">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Tenant ID</label>
                <UInput v-model="form.tenantId" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Client ID</label>
                <UInput v-model="form.clientId" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Client Secret</label>
                <UInput
                  v-model="form.clientSecret"
                  type="password"
                  placeholder="留空则保持不变"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Redirect URL</label>
                <UInput v-model="form.redirectUri" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Authorize URL</label>
                <UInput v-model="form.authorizeUrl" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Token URL</label>
                <UInput v-model="form.tokenUrl" />
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Scopes（空格分隔）</label>
              <UInput v-model="form.scopes" />
            </div>
          </div>

          <p v-if="formError" class="text-sm text-rose-500">{{ formError }}</p>

          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="closeForm">取消</UButton>
            <UButton color="primary" :loading="formSaving" @click="submitForm">
              保存
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
