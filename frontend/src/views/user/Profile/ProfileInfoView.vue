<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import UserAvatar from '@/components/common/UserAvatar.vue'
import {
  useAuthStore,
  type GenderType,
  type UpdateCurrentUserPayload,
} from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/utils/api'

type FormState = {
  name: string
  displayName: string
  email: string
  gender: GenderType
  birthday: string
  motto: string
  timezone: string
  locale: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
}

type SectionKey = 'basic' | 'address' | 'minecraft'

type FieldDefinition = {
  key: keyof FormState
  label: string
  inputType?: 'text' | 'email' | 'date' | 'tel'
  component?: 'textarea' | 'select'
  placeholder?: string
  readonly?: boolean
}

const auth = useAuthStore()
const ui = useUiStore()
const featureStore = useFeatureStore()
const toast = useToast()

const isAuthenticated = computed(() => auth.isAuthenticated)
const loading = ref(false)
const saving = ref(false)
const lastSyncedAt = ref<string | null>(null)
const initialSnapshot = ref('')
const bindingLoading = ref(false)
const bindingError = ref('')
const activeSection = ref<SectionKey>('basic')
const isEditing = ref(false)

const genderOptions: Array<{ label: string; value: GenderType }> = [
  { label: '未指定', value: 'UNSPECIFIED' },
  { label: '男性', value: 'MALE' },
  { label: '女性', value: 'FEMALE' },
  { label: '非二元', value: 'NON_BINARY' },
  { label: '其他', value: 'OTHER' },
]

const addressFields = [
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
] as const satisfies readonly (keyof FormState)[]

const sections: Array<{
  id: SectionKey
  label: string
}> = [
  {
    id: 'basic',
    label: '基础资料',
  },
  {
    id: 'address',
    label: '地址信息',
  },
  {
    id: 'minecraft',
    label: 'Minecraft 账户',
  },
]

const basicFields: FieldDefinition[] = [
  {
    key: 'displayName',
    label: '显示名称',
    placeholder: '用于站内展示的名字',
  },
  {
    key: 'name',
    label: '真实姓名',
    placeholder: '例如：陈嘉禾',
  },
  {
    key: 'email',
    label: '邮箱',
    inputType: 'email',
    readonly: true,
  },
  {
    key: 'gender',
    label: '性别',
    component: 'select',
  },
  {
    key: 'birthday',
    label: '生日',
    inputType: 'date',
  },
  {
    key: 'timezone',
    label: '时区',
    placeholder: '例如：Asia/Shanghai',
  },
  {
    key: 'locale',
    label: '语言',
    placeholder: '例如：zh-CN',
  },
  {
    key: 'motto',
    label: '个性签名',
    component: 'textarea',
    placeholder: '向社区介绍你自己，保持简洁有力。',
  },
]

const addressFieldDefinitions: FieldDefinition[] = [
  {
    key: 'addressLine1',
    label: '地址（行 1）',
    placeholder: '街道、门牌号等',
  },
  {
    key: 'addressLine2',
    label: '地址（行 2）',
    placeholder: '单元、楼层等补充信息',
  },
  {
    key: 'city',
    label: '城市',
    placeholder: '所在城市',
  },
  {
    key: 'state',
    label: '省 / 州',
    placeholder: '所在省份或州',
  },
  {
    key: 'postalCode',
    label: '邮政编码',
    placeholder: '邮编',
  },
  {
    key: 'country',
    label: '国家 / 地区',
    placeholder: '例如：中国',
  },
  {
    key: 'phone',
    label: '联系电话',
    inputType: 'tel',
    placeholder: '用于紧急联系',
  },
]

const form = reactive<FormState>({
  name: '',
  displayName: '',
  email: '',
  gender: 'UNSPECIFIED',
  birthday: '',
  motto: '',
  timezone: '',
  locale: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
})

const authmeBindingForm = reactive({
  authmeId: '',
  password: '',
})

const hasChanges = computed(() => serializeForm() !== initialSnapshot.value)
const canSubmit = computed(
  () =>
    isAuthenticated.value &&
    hasChanges.value &&
    !saving.value &&
    !loading.value,
)

const currentSection = computed(
  () =>
    sections.find((section) => section.id === activeSection.value) ??
    sections[0],
)

const bindingEnabled = computed(() => featureStore.flags.authmeBindingEnabled)
const authmeBinding = computed(
  () => (auth.user as Record<string, any> | null)?.authmeBinding ?? null,
)

const avatarUrl = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user) return null
  if (user.profile?.avatarUrl) return user.profile.avatarUrl as string
  if (user.image) return user.image as string
  return null
})

const lastSyncedText = computed(() => {
  if (!lastSyncedAt.value) return '尚未同步'
  return dayjs(lastSyncedAt.value).format('YYYY年MM月DD日 HH:mm')
})

const joinedText = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user?.createdAt) return ''
  return dayjs(user.createdAt).format('YYYY年M月D日')
})

const genderLabelMap = computed(() =>
  genderOptions.reduce<Record<GenderType, string>>(
    (acc, option) => {
      acc[option.value] = option.label
      return acc
    },
    {
      UNSPECIFIED: '未指定',
      MALE: '男性',
      FEMALE: '女性',
      NON_BINARY: '非二元',
      OTHER: '其他',
    },
  ),
)

watch(
  () => auth.user,
  (user) => {
    if (!user) {
      resetForm()
      return
    }
    populateForm(user)
  },
  { immediate: true },
)

watch(
  () => auth.isAuthenticated,
  (value) => {
    if (value) {
      void loadUser()
    } else {
      resetForm()
    }
  },
)

watch(isEditing, (value) => {
  if (!value) {
    bindingError.value = ''
    authmeBindingForm.authmeId = ''
    authmeBindingForm.password = ''
  }
})

onMounted(() => {
  if (auth.isAuthenticated) {
    void loadUser()
  }
})

function resetForm() {
  form.name = ''
  form.displayName = ''
  form.email = ''
  form.gender = 'UNSPECIFIED'
  form.birthday = ''
  form.motto = ''
  form.timezone = ''
  form.locale = ''
  for (const key of addressFields) {
    form[key] = ''
  }
  lastSyncedAt.value = null
  initialSnapshot.value = serializeForm()
  isEditing.value = false
}

function populateForm(user: Record<string, any>) {
  form.name = user.name ?? ''
  form.displayName = user.profile?.displayName ?? ''
  form.email = user.email ?? ''
  form.gender =
    (user.profile?.gender as GenderType | undefined) ?? 'UNSPECIFIED'
  form.birthday = user.profile?.birthday
    ? String(user.profile.birthday).slice(0, 10)
    : ''
  form.motto = user.profile?.motto ?? ''
  form.timezone = user.profile?.timezone ?? ''
  form.locale = user.profile?.locale ?? ''
  const extra =
    user.profile?.extra && typeof user.profile.extra === 'object'
      ? (user.profile.extra as Record<string, unknown>)
      : {}
  for (const key of addressFields) {
    const value =
      extra && typeof extra[key] === 'string' ? (extra[key] as string) : ''
    form[key] = value
  }
  lastSyncedAt.value = user.updatedAt ?? null
  initialSnapshot.value = serializeForm()
}

function startEditing() {
  if (!isAuthenticated.value) {
    openLoginDialog()
    return
  }
  isEditing.value = true
}

function cancelEditing() {
  handleReset(false)
  isEditing.value = false
  authmeBindingForm.authmeId = ''
  authmeBindingForm.password = ''
}

function isFieldEditable(field: FieldDefinition) {
  return isEditing.value && !field.readonly
}

function formatFieldValue(field: FieldDefinition) {
  const value = form[field.key]
  if (field.key === 'gender') {
    return genderLabelMap.value[value as GenderType] ?? '未指定'
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  return '未填写'
}

async function submitAuthmeBinding() {
  if (!isEditing.value) {
    return
  }
  if (!bindingEnabled.value) {
    bindingError.value = '当前未开放绑定功能'
    return
  }
  bindingError.value = ''
  bindingLoading.value = true
  try {
    await auth.bindAuthme({
      authmeId: authmeBindingForm.authmeId,
      password: authmeBindingForm.password,
    })
    authmeBindingForm.authmeId = ''
    authmeBindingForm.password = ''
    toast.add({ title: '绑定成功', color: 'success' })
  } catch (error) {
    if (error instanceof ApiError) {
      bindingError.value = error.message
    } else {
      bindingError.value = '绑定失败，请稍后再试'
    }
  } finally {
    bindingLoading.value = false
  }
}

async function handleUnbindAuthme() {
  if (!isEditing.value) {
    return
  }
  bindingError.value = ''
  bindingLoading.value = true
  try {
    await auth.unbindAuthme()
    toast.add({ title: '已解除绑定', color: 'warning' })
  } catch (error) {
    if (error instanceof ApiError) {
      bindingError.value = error.message
    } else {
      bindingError.value = '解绑失败，请稍后再试'
    }
  } finally {
    bindingLoading.value = false
  }
}

function serializeForm() {
  return JSON.stringify({
    name: form.name.trim(),
    displayName: form.displayName.trim(),
    gender: form.gender,
    birthday: form.birthday,
    motto: form.motto.trim(),
    timezone: form.timezone.trim(),
    locale: form.locale.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim(),
    phone: form.phone.trim(),
  })
}

function buildPayload(): UpdateCurrentUserPayload {
  const payload: UpdateCurrentUserPayload = {}
  const user = auth.user as Record<string, any> | null
  if (!user) return payload

  const trimmedName = form.name.trim()
  if ((user.name ?? '') !== trimmedName) {
    payload.name = trimmedName
  }

  const trimmedDisplayName = form.displayName.trim()
  if ((user.profile?.displayName ?? '') !== trimmedDisplayName) {
    payload.displayName = trimmedDisplayName
  }

  const newGender = form.gender ?? 'UNSPECIFIED'
  if ((user.profile?.gender ?? 'UNSPECIFIED') !== newGender) {
    payload.gender = newGender
  }

  const newBirthday = form.birthday.trim()
  const currentBirthday = user.profile?.birthday
    ? String(user.profile.birthday).slice(0, 10)
    : ''
  if (newBirthday !== currentBirthday) {
    if (newBirthday) {
      payload.birthday = newBirthday
    }
  }

  const trimmedMotto = form.motto.trim()
  if ((user.profile?.motto ?? '') !== trimmedMotto) {
    payload.motto = trimmedMotto
  }

  const trimmedTimezone = form.timezone.trim()
  if ((user.profile?.timezone ?? '') !== trimmedTimezone) {
    payload.timezone = trimmedTimezone
  }

  const trimmedLocale = form.locale.trim()
  if ((user.profile?.locale ?? '') !== trimmedLocale) {
    payload.locale = trimmedLocale
  }

  const existingExtra =
    user.profile?.extra && typeof user.profile.extra === 'object'
      ? (user.profile.extra as Record<string, unknown>)
      : {}

  const extraPayload: Record<string, string> = {}
  let extraChanged = false
  for (const key of addressFields) {
    const newValue = form[key].trim()
    const currentValue =
      typeof existingExtra[key] === 'string'
        ? (existingExtra[key] as string).trim()
        : ''
    if (newValue !== currentValue) {
      extraChanged = true
    }
    if (newValue) {
      extraPayload[key] = newValue
    }
  }
  if (extraChanged) {
    payload.extra = extraPayload
  }

  return payload
}

async function loadUser() {
  if (!auth.token || loading.value) {
    return
  }
  loading.value = true
  ui.startLoading()
  try {
    await auth.fetchCurrentUser()
  } catch (error) {
    handleError(error, '无法加载用户信息')
  } finally {
    loading.value = false
    ui.stopLoading()
  }
}

async function handleSave() {
  if (!isAuthenticated.value) {
    ui.openLoginDialog()
    return
  }
  if (!hasChanges.value) {
    toast.add({
      title: '没有检测到改动',
      description: '您尚未修改任何字段。',
      color: 'neutral',
    })
    return
  }
  const payload = buildPayload()
  if (Object.keys(payload).length === 0) {
    toast.add({
      title: '无法保存',
      description: '请检查填写的内容是否有效。',
      color: 'warning',
    })
    return
  }
  saving.value = true
  ui.startLoading()
  try {
    const updated = await auth.updateCurrentUser(payload)
    lastSyncedAt.value = updated.updatedAt ?? lastSyncedAt.value
    initialSnapshot.value = serializeForm()
    isEditing.value = false
    toast.add({
      title: '资料已更新',
      description: '您的账户信息已成功保存。',
      color: 'success',
    })
  } catch (error) {
    handleError(error, '保存失败')
  } finally {
    saving.value = false
    ui.stopLoading()
  }
}

function handleReset(showToast = true) {
  if (!auth.user) {
    resetForm()
    return
  }
  populateForm(auth.user)
  if (showToast) {
    toast.add({
      title: '已还原修改',
      description: '表单内容已恢复为最新的服务器数据。',
      color: 'info',
    })
  }
}

function openLoginDialog() {
  ui.openLoginDialog()
}

function handleError(error: unknown, fallback: string) {
  const description =
    error instanceof ApiError
      ? error.message
      : '请稍后重试，若问题持续请联系管理员。'
  toast.add({
    title: fallback,
    description,
    color: 'error',
  })
  console.error('[profile-info]', error)
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8">
    <div v-if="isAuthenticated" class="space-y-6">
      <div
        class="rounded-3xl border border-slate-200/70 bg-linear-to-r from-white/90 via-white/85 to-white/90 p-px shadow-sm backdrop-blur dark:border-slate-800/70 dark:from-slate-900/80 dark:via-slate-900/85 dark:to-slate-900/80"
      >
        <div
          class="rounded-[calc(1.5rem-1px)] bg-white/95 p-6 dark:bg-slate-950/80 md:p-8"
        >
          <div
            class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between"
          >
            <div class="flex items-center gap-4">
              <UserAvatar
                :src="avatarUrl"
                :name="auth.displayName ?? auth.user?.email"
                size="lg"
              />
              <div>
                <p
                  class="text-xs font-semibold uppercase tracking-wide text-primary-500"
                >
                  Hydroline 账户
                </p>
                <h2
                  class="mt-1 text-xl font-semibold text-slate-900 dark:text-white"
                >
                  {{ (auth.displayName ?? form.email) || '用户' }}
                </h2>
                <p class="text-sm text-slate-600 dark:text-slate-300">
                  {{ form.email }}
                </p>
              </div>
            </div>
            <div
              class="flex flex-col items-start gap-3 text-sm text-slate-500 md:items-end"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-history" class="h-4 w-4" />
                <span>最后同步：{{ lastSyncedText }}</span>
              </div>
              <div v-if="joinedText" class="flex items-center gap-2">
                <UIcon name="i-lucide-calendar" class="h-4 w-4" />
                <span>加入于 {{ joinedText }}</span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  variant="ghost"
                  size="xs"
                  :disabled="loading"
                  icon="i-lucide-refresh-cw"
                  @click="loadUser"
                >
                  重新同步
                </UButton>
                <UBadge
                  v-if="saving"
                  color="primary"
                  variant="soft"
                  class="animate-pulse"
                >
                  正在保存…
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form
        id="profile-form"
        class="flex flex-col gap-6 transition-opacity"
        :class="{ 'pointer-events-none opacity-60': loading && !saving }"
        @submit.prevent="handleSave"
      >
        <Transition name="fade">
          <div
            v-if="isEditing"
            class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/70 bg-primary-50/80 px-4 py-3 text-sm text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-pencil" class="h-4 w-4" />
              <span>已进入编辑模式</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="hasChanges"
                class="text-xs text-primary-600/80 dark:text-primary-200/80"
              >
                检测到未保存的修改
              </span>
              <UButton type="button" variant="ghost" @click="cancelEditing">
                取消
              </UButton>
              <UButton
                type="submit"
                color="primary"
                :loading="saving"
                :disabled="!canSubmit"
              >
                保存更改
              </UButton>
            </div>
          </div>
        </Transition>

        <div class="flex flex-col gap-6 lg:flex-row">
          <aside
            class="w-full shrink-0 rounded-2xl py-4 backdrop-blur-sm lg:w-50"
          >
            <nav class="flex flex-row gap-2 overflow-x-auto lg:flex-col">
              <button
                v-for="section in sections"
                :key="section.id"
                type="button"
                class="group flex-1 rounded-2xl px-4 py-3 text-left text-sm transition lg:flex-auto"
                :class="[
                  activeSection === section.id
                    ? 'bg-primary-100/80 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
                    : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60',
                ]"
                @click="activeSection = section.id"
              >
                <div class="font-semibold">
                  {{ section.label }}
                </div>
              </button>
            </nav>
          </aside>

          <div
            class="flex-1 rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/60"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-6 py-5 dark:border-slate-800/70"
            >
              <div>
                <h2
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{ currentSection.label }}
                </h2>
              </div>
              <UButton
                v-if="!isEditing"
                type="button"
                color="primary"
                variant="soft"
                :disabled="loading"
                @click="startEditing"
              >
                编辑
              </UButton>
            </div>

            <div class="px-6 py-6">
              <div v-if="activeSection === 'basic'" class="space-y-4">
                <div
                  v-for="field in basicFields"
                  :key="field.key"
                  class="flex flex-col gap-2 rounded-xl border border-transparent px-4 py-3 transition hover:bg-slate-50/50 dark:hover:bg-slate-800/40 md:flex-row md:items-center md:gap-6"
                  :class="
                    isFieldEditable(field)
                      ? 'bg-slate-50/70 dark:bg-slate-800/40'
                      : ''
                  "
                >
                  <div
                    class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
                  >
                    {{ field.label }}
                  </div>
                  <div class="flex-1">
                    <template v-if="isFieldEditable(field)">
                      <USelectMenu
                        v-if="field.key === 'gender'"
                        v-model="form.gender"
                        :options="genderOptions"
                        value-attribute="value"
                        option-attribute="label"
                        class="w-full"
                        :popper="{ placement: 'bottom-start' }"
                      />
                      <UTextarea
                        v-else-if="field.component === 'textarea'"
                        v-model="form[field.key]"
                        :rows="3"
                        :placeholder="field.placeholder"
                      />
                      <UInput
                        v-else
                        v-model="form[field.key]"
                        :type="field.inputType ?? 'text'"
                        :placeholder="field.placeholder"
                      />
                    </template>
                    <template v-else>
                      <p
                        class="text-sm"
                        :class="[
                          field.component === 'textarea'
                            ? 'whitespace-pre-line'
                            : 'whitespace-normal',
                          formatFieldValue(field) === '未填写'
                            ? 'text-slate-400 italic'
                            : 'text-slate-900 dark:text-slate-100',
                        ]"
                      >
                        {{ formatFieldValue(field) }}
                      </p>
                    </template>
                  </div>
                </div>
              </div>

              <div v-else-if="activeSection === 'address'" class="space-y-4">
                <div
                  v-for="field in addressFieldDefinitions"
                  :key="field.key"
                  class="flex flex-col gap-2 rounded-xl border border-transparent px-4 py-3 transition hover:bg-slate-50/50 dark:hover:bg-slate-800/40 md:flex-row md:items-center md:gap-6"
                  :class="
                    isFieldEditable(field)
                      ? 'bg-slate-50/70 dark:bg-slate-800/40'
                      : ''
                  "
                >
                  <div
                    class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
                  >
                    {{ field.label }}
                  </div>
                  <div class="flex-1">
                    <template v-if="isFieldEditable(field)">
                      <UTextarea
                        v-if="field.component === 'textarea'"
                        v-model="form[field.key]"
                        :rows="3"
                        :placeholder="field.placeholder"
                      />
                      <UInput
                        v-else
                        v-model="form[field.key]"
                        :type="field.inputType ?? 'text'"
                        :placeholder="field.placeholder"
                      />
                    </template>
                    <template v-else>
                      <p
                        class="text-sm"
                        :class="[
                          formatFieldValue(field) === '未填写'
                            ? 'text-slate-400 italic'
                            : 'text-slate-900 dark:text-slate-100',
                        ]"
                      >
                        {{ formatFieldValue(field) }}
                      </p>
                    </template>
                  </div>
                </div>
              </div>

              <div v-else class="space-y-4">
                <div
                  class="flex flex-col gap-2 rounded-xl border border-transparent px-4 py-3 md:flex-row md:items-center md:gap-6"
                >
                  <div
                    class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
                  >
                    绑定状态
                  </div>
                  <div
                    class="flex-1 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {{
                      authmeBinding
                        ? '已绑定一个 AuthMe 账号'
                        : '尚未绑定 AuthMe 账号'
                    }}
                  </div>
                </div>

                <template v-if="authmeBinding">
                  <div
                    class="flex flex-col gap-2 rounded-xl border border-transparent px-4 py-3 md:flex-row md:items-center md:gap-6"
                  >
                    <div
                      class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
                    >
                      绑定账号
                    </div>
                    <div
                      class="flex-1 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {{ authmeBinding.authmeRealname }}
                    </div>
                  </div>
                  <div
                    class="flex flex-col gap-2 rounded-xl border border-transparent px-4 py-3 md:flex-row md:items-center md:gap-6"
                  >
                    <div
                      class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
                    >
                      绑定时间
                    </div>
                    <div
                      class="flex-1 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {{
                        authmeBinding.boundAt
                          ? new Date(authmeBinding.boundAt).toLocaleString()
                          : '—'
                      }}
                    </div>
                  </div>
                  <div
                    v-if="isEditing"
                    class="flex flex-col gap-2 rounded-xl border border-transparent px-4 py-3 md:flex-row md:items-center md:gap-6"
                  >
                    <div
                      class="w-full text-sm font-medium text-slate-600 dark:text-slate-300 md:w-40 md:flex-none"
                    >
                      操作
                    </div>
                    <div class="flex flex-1 items-center gap-3 text-sm">
                      <UButton
                        type="button"
                        color="primary"
                        variant="outline"
                        :loading="bindingLoading"
                        @click="handleUnbindAuthme"
                      >
                        解除绑定
                      </UButton>
                      <span class="text-xs text-slate-500 dark:text-slate-400">
                        解绑后可再次绑定其他账号。
                      </span>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div
                    v-if="isEditing"
                    class="space-y-4 rounded-xl border border-dashed border-slate-200/70 px-4 py-4 dark:border-slate-700"
                  >
                    <div class="flex flex-col gap-2">
                      <label
                        class="text-sm font-medium text-slate-600 dark:text-slate-300"
                      >
                        AuthMe 账号
                        <UInput
                          v-model="authmeBindingForm.authmeId"
                          class="mt-2"
                          placeholder="用户名或 RealName"
                        />
                      </label>
                      <label
                        class="text-sm font-medium text-slate-600 dark:text-slate-300"
                      >
                        AuthMe 密码
                        <UInput
                          v-model="authmeBindingForm.password"
                          class="mt-2"
                          type="password"
                          placeholder="请输入 AuthMe 密码"
                        />
                      </label>
                    </div>
                    <div
                      v-if="bindingError"
                      class="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                    >
                      {{ bindingError }}
                    </div>
                    <UButton
                      type="button"
                      color="primary"
                      :loading="bindingLoading"
                      :disabled="!bindingEnabled"
                      @click="submitAuthmeBinding"
                    >
                      绑定 AuthMe 账号
                    </UButton>
                    <div
                      v-if="!bindingEnabled"
                      class="rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                    >
                      当前暂未开放绑定能力，如需绑定请联系管理员。
                    </div>
                  </div>
                  <div
                    v-else
                    class="rounded-xl border border-dashed border-slate-200/70 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  >
                    尚未绑定 AuthMe 账号。点击右上角的“编辑”后可发起绑定。
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>

    <UCard
      v-else
      class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65"
    >
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
        需要登录
      </h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">
        登录后即可完善个人资料与联系地址，确保服务体验与通知准确触达。
      </p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>
