<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useCompanyStore } from '@/stores/user/companies'
import { useAuthStore } from '@/stores/user/auth'
import CompanyLlcRegistrationForm from '@/components/company/CompanyLlcRegistrationForm.vue'
import type {
  CompanyIndustry,
  CompanyType,
  CompanyUserRef,
  CompanyRef,
  CreateCompanyApplicationPayload,
  LimitedLiabilityCompanyApplicationPayload,
  WorldDivisionPath,
  WorldDivisionNode,
} from '@/types/company'

const props = withDefaults(
  defineProps<{
    industries: CompanyIndustry[]
    types: CompanyType[]
    submitting?: boolean
    initial?: CreateCompanyApplicationPayload | null
    submitLabel?: string
    showEntrySelectors?: boolean
  }>(),
  {
    showEntrySelectors: true,
  },
)

const emit = defineEmits<{
  (event: 'submit', payload: CreateCompanyApplicationPayload): void
}>()

const companyStore = useCompanyStore()
const authStore = useAuthStore()
const toast = useToast()

const LIMITED_LIABILITY_CODE = 'limited_liability_company'
// 临时开关：目前仅开放“有限责任公司”注册申请
const LIMITED_LIABILITY_ONLY = true

// ---------- 选择框显示：缓存已见过的 name，避免 items 变化后回退显示 id ----------
const userLabelCache = reactive<Record<string, string>>({})
const companyLabelCache = reactive<Record<string, string>>({})
function getUserLabel(u: CompanyUserRef) {
  return u.displayName || u.name || u.email || '未知用户'
}
function upsertUserLabel(u: CompanyUserRef) {
  userLabelCache[u.id] = getUserLabel(u)
}
function upsertCompanyLabel(c: CompanyRef) {
  companyLabelCache[c.id] = c.name
}
function buildUserItems(candidates: CompanyUserRef[], selectedId?: string) {
  const items = candidates.map((u) => {
    upsertUserLabel(u)
    return { value: u.id, label: getUserLabel(u) }
  })
  if (selectedId && !items.some((x) => x.value === selectedId)) {
    items.unshift({
      value: selectedId,
      label: userLabelCache[selectedId] ?? selectedId,
    })
  }
  return items
}
function buildCompanyItems(candidates: CompanyRef[], selectedId?: string) {
  const items = candidates.map((c) => {
    upsertCompanyLabel(c)
    return { value: c.id, label: c.name }
  })
  if (selectedId && !items.some((x) => x.value === selectedId)) {
    items.unshift({
      value: selectedId,
      label: companyLabelCache[selectedId] ?? selectedId,
    })
  }
  return items
}

const formState = reactive<CreateCompanyApplicationPayload>({
  name: '',
  summary: '',
  description: '',
  typeId: undefined,
  typeCode: LIMITED_LIABILITY_CODE,
  industryId: undefined,
  legalRepresentativeId: undefined,
  llc: undefined,
})
let searchTimer: number | undefined
let companySearchTimer: number | undefined

// ---------- 有限责任公司：行政区（服务端 + 行政区搜索） ----------
const serverSearch = ref('')
const selectedServerId = ref<string | undefined>(undefined)
const level1Search = ref('')
const divisionLevelOptions = ref<WorldDivisionNode[][]>([])
const divisionLevelSelectedIds = ref<Array<string | undefined>>([])
const divisionLevelNodes = ref<Array<WorldDivisionNode | null>>([])
const domicileDivisionId = computed(() => divisionLevelSelectedIds.value[0])
const domicileDivision = computed(() => {
  for (let i = divisionLevelNodes.value.length - 1; i >= 0; i -= 1) {
    const node = divisionLevelNodes.value[i]
    if (node) return node
  }
  return null
})
const authorityCompanies = ref<Array<{ id: string; name: string }>>([])
const authorityLoading = ref(false)
const applyingInitial = ref(false)
const labelPrefillDone = ref(false)
let level1SearchTimer: number | undefined

async function refreshAuthorityCompanies() {
  const serverId = selectedServerId.value
  const divisionId = divisionLevelSelectedIds.value[0] ?? 'all'
  const query = new URLSearchParams()
  if (serverId) query.set('serverId', serverId)
  authorityLoading.value = true
  try {
    authorityCompanies.value = await apiFetch<
      Array<{ id: string; name: string }>
    >(
      `/companies/geo/divisions/${divisionId}/authorities${
        query.toString() ? `?${query.toString()}` : ''
      }`,
    )
  } catch {
    authorityCompanies.value = []
  } finally {
    authorityLoading.value = false
  }
}

function handleAuthorityOpen() {
  if (authorityCompanies.value.length > 0 || authorityLoading.value) return
  void refreshAuthorityCompanies()
}

async function prefillSelectedLabels(
  llc: LimitedLiabilityCompanyApplicationPayload,
): Promise<{ usersDone: boolean; companiesDone: boolean }> {
  const userIds = new Set<string>()
  const companyIds = new Set<string>()
  for (const s of llc.shareholders ?? []) {
    if (s.kind === 'USER' && s.userId) userIds.add(s.userId)
    if (s.kind === 'COMPANY' && s.companyId) companyIds.add(s.companyId)
  }
  if (llc.registrationAuthorityCompanyId)
    companyIds.add(llc.registrationAuthorityCompanyId)
  for (const id of llc.directors?.directorIds ?? []) userIds.add(id)
  if (llc.directors?.chairpersonId) userIds.add(llc.directors.chairpersonId)
  if (llc.directors?.viceChairpersonId)
    userIds.add(llc.directors.viceChairpersonId)
  if (llc.managers?.managerId) userIds.add(llc.managers.managerId)
  if (llc.managers?.deputyManagerId) userIds.add(llc.managers.deputyManagerId)
  if (llc.legalRepresentativeId) userIds.add(llc.legalRepresentativeId)
  for (const id of llc.supervisors?.supervisorIds ?? []) userIds.add(id)
  if (llc.supervisors?.chairpersonId) userIds.add(llc.supervisors.chairpersonId)
  if (llc.financialOfficerId) userIds.add(llc.financialOfficerId)

  let usersDone = userIds.size === 0
  let companiesDone = companyIds.size === 0

  // 公司解析不需要 token，可先做，避免“公司名显示为 id”
  if (companyIds.size) {
    const companies = await apiFetch<Array<{ id: string; name: string }>>(
      '/companies/resolve',
      {
        method: 'POST',
        body: { ids: Array.from(companyIds) },
      },
    )
    for (const c of companies) upsertCompanyLabel(c as CompanyRef)
    companiesDone = true
  }

  // 用户解析需要 token；如果 token 尚未就绪，先跳过，交给后续 watch(token) 再补一次
  if (userIds.size) {
    if (!authStore.token) {
      usersDone = false
    } else {
      const users = await apiFetch<CompanyUserRef[]>(
        '/companies/users/resolve',
        {
          method: 'POST',
          body: { ids: Array.from(userIds) },
          token: authStore.token,
        },
      )
      for (const u of users) upsertUserLabel(u)
      usersDone = true
    }
  }

  return { usersDone, companiesDone }
}

async function searchDivisions(params: {
  q?: string
  serverId: string
  level?: number
  parentId?: string
}) {
  const qp = new URLSearchParams()
  if (params.q?.trim()) qp.set('q', params.q.trim())
  if (params.level) qp.set('level', String(params.level))
  if (params.parentId) qp.set('parentId', params.parentId)
  return apiFetch<WorldDivisionNode[]>(
    `/administration/servers/${params.serverId}/divisions/search?${qp.toString()}`,
  )
}

async function loadDivisionPath(serverId: string, divisionId: string) {
  return apiFetch<WorldDivisionNode[]>(
    `/administration/servers/${serverId}/divisions/${divisionId}/path`,
  )
}

function normalizeDivisionPath(
  path?: Record<string, { id: string; name: string } | null>,
): WorldDivisionNode[] {
  if (!path) return []
  const nodes: WorldDivisionNode[] = []
  for (const [key, value] of Object.entries(path)) {
    if (!value) continue
    const match = key.match(/^level(\d+)$/)
    if (!match) continue
    const level = Number(match[1])
    if (!Number.isFinite(level) || level < 1) continue
    nodes.push({ id: value.id, name: value.name, level, parentId: null })
  }
  return nodes.sort((a, b) => a.level - b.level)
}

function initDivisionLevels(levelCount: number) {
  const cappedCount = Math.min(levelCount, 2)
  divisionLevelOptions.value = Array.from({ length: cappedCount }, () => [])
  divisionLevelSelectedIds.value = Array.from(
    { length: cappedCount },
    () => undefined,
  )
  divisionLevelNodes.value = Array.from({ length: cappedCount }, () => null)
}

function clearDivisionLevels(fromLevelIndex: number) {
  for (
    let i = fromLevelIndex;
    i < divisionLevelSelectedIds.value.length;
    i += 1
  ) {
    divisionLevelSelectedIds.value[i] = undefined
    divisionLevelNodes.value[i] = null
    divisionLevelOptions.value[i] = []
  }
}

function ensureDivisionOption(
  levelIndex: number,
  node: WorldDivisionNode | null,
) {
  if (!node) return
  const options = divisionLevelOptions.value[levelIndex] ?? []
  if (!options.some((item) => item.id === node.id)) {
    divisionLevelOptions.value[levelIndex] = [node, ...options]
  }
}

async function resolveDivisionNode(
  serverId: string,
  divisionId: string,
): Promise<WorldDivisionNode | null> {
  try {
    const data = await apiFetch<{
      id: string
      fullName: string
      levelIndex: number
      parentId?: string | null
    }>(`/administration/servers/${serverId}/divisions/${divisionId}`)
    return {
      id: data.id,
      name: data.fullName,
      level: data.levelIndex,
      parentId: data.parentId ?? null,
    }
  } catch {
    return null
  }
}

async function loadDivisionOptions(params: {
  serverId: string
  levelIndex: number
  parentId?: string
  q?: string
}) {
  const options = await searchDivisions({
    serverId: params.serverId,
    q: params.q,
    level: params.levelIndex,
    parentId: params.parentId,
  })
  divisionLevelOptions.value[params.levelIndex - 1] = options
}

async function applyDivisionPath(serverId: string, nodes: WorldDivisionNode[]) {
  const regimeEntry = administrationByServer.value.get(serverId)
  const nodeLevels = nodes.map((n) => n.level)
  const inferredCount =
    Math.max(regimeEntry?.levelCount ?? 0, ...nodeLevels, 0) || 0
  const cappedCount = Math.min(inferredCount, 2)
  initDivisionLevels(cappedCount)

  const nodeMap = new Map(nodes.map((node) => [node.level, node]))
  for (let level = 1; level <= cappedCount; level += 1) {
    const node = nodeMap.get(level) ?? null
    divisionLevelNodes.value[level - 1] = node
    divisionLevelSelectedIds.value[level - 1] = node?.id
  }

  try {
    await loadDivisionOptions({ serverId, levelIndex: 1 })
  } catch {
    divisionLevelOptions.value[0] = []
  }
  ensureDivisionOption(0, divisionLevelNodes.value[0])

  for (let level = 2; level <= cappedCount; level += 1) {
    const parent = divisionLevelNodes.value[level - 2]
    if (!parent) break
    try {
      await loadDivisionOptions({
        serverId,
        levelIndex: level,
        parentId: parent.id,
      })
    } catch {
      divisionLevelOptions.value[level - 1] = []
    }
    ensureDivisionOption(level - 1, divisionLevelNodes.value[level - 1])
    if (!divisionLevelNodes.value[level - 1]) break
  }

  llcDraft.administrativeDivisionLevel = 1
  void refreshAuthorityCompanies()
}

watch(selectedServerId, (value) => {
  if (applyingInitial.value) return
  level1Search.value = ''
  llcDraft.administrativeDivisionLevel = 1
  llcDraft.registrationAuthorityCompanyId = undefined
  llcDraft.registrationAuthorityName = ''
  authorityCompanies.value = []
  if (!value) {
    initDivisionLevels(0)
    authorityCompanies.value = []
    return
  }
  const regime = administrationByServer.value.get(value)
  if (!regime?.hasActiveRegime || !regime.levelCount) {
    initDivisionLevels(0)
    authorityCompanies.value = []
    return
  }
  initDivisionLevels(regime.levelCount)
  void loadDivisionOptions({ serverId: value, levelIndex: 1 }).catch(() => {
    divisionLevelOptions.value[0] = []
  })
  void refreshAuthorityCompanies()
})

watch(
  () => divisionLevelSelectedIds.value.slice(),
  async (next, prev) => {
    if (applyingInitial.value) return
    const serverId = selectedServerId.value
    if (!serverId) return
    const changedIndex = next.findIndex((id, index) => id !== prev?.[index])
    if (changedIndex < 0) return
    const selectedId = next[changedIndex]
    clearDivisionLevels(changedIndex + 1)

    if (!selectedId) {
      if (changedIndex === 0) {
        llcDraft.registrationAuthorityCompanyId = undefined
        llcDraft.registrationAuthorityName = ''
        void refreshAuthorityCompanies()
      }
      return
    }

    const cached = divisionLevelOptions.value[changedIndex]?.find(
      (n) => n.id === selectedId,
    )
    if (cached) {
      divisionLevelNodes.value[changedIndex] = cached
    } else {
      divisionLevelNodes.value[changedIndex] = await resolveDivisionNode(
        serverId,
        selectedId,
      )
      ensureDivisionOption(changedIndex, divisionLevelNodes.value[changedIndex])
    }

    if (changedIndex === 0) {
      void refreshAuthorityCompanies()
      llcDraft.registrationAuthorityCompanyId = undefined
      llcDraft.registrationAuthorityName = ''
    }

    const nextLevelIndex = changedIndex + 2
    if (divisionLevelOptions.value.length >= nextLevelIndex) {
      try {
        await loadDivisionOptions({
          serverId,
          levelIndex: nextLevelIndex,
          parentId: selectedId,
        })
      } catch {
        divisionLevelOptions.value[nextLevelIndex - 1] = []
      }
    }
  },
)

watch(level1Search, (value) => {
  const serverId = selectedServerId.value
  if (!serverId || !hasActiveRegime.value) return
  if (level1SearchTimer) window.clearTimeout(level1SearchTimer)
  level1SearchTimer = window.setTimeout(async () => {
    try {
      await loadDivisionOptions({
        serverId,
        levelIndex: 1,
        q: value,
      })
    } catch {
      divisionLevelOptions.value[0] = []
    }
    ensureDivisionOption(0, divisionLevelNodes.value[0])
  }, 240)
})

// ---------- 有限责任公司：股东（用户/公司搜索） ----------
type ShareholderDraft = {
  kind: 'USER' | 'COMPANY'
  userSearch: string
  companySearch: string
  userCandidates: CompanyUserRef[]
  companyCandidates: CompanyRef[]
  holderId: string | undefined
  ratio: number | undefined
  votingRatio: number | undefined
}

const llcDraft = reactive<{
  registeredCapital: number | null
  administrativeDivisionLevel: 1 | 2 | 3
  brandName: string
  industryFeature: string
  companyNameDivisionLevels: number[]
  registrationAuthorityCompanyId: string | undefined
  registrationAuthorityName: string
  domicileAddress: string
  operatingTermLong: boolean
  operatingTermYears: number | null
  businessScope: string
  votingRightsMode: 'BY_CAPITAL_RATIO' | 'CUSTOM'
  shareholders: ShareholderDraft[]
  directors: {
    items: Array<{
      userId: string | undefined
      search: string
      candidates: CompanyUserRef[]
    }>
    chairpersonId: string | undefined
    viceChairpersonId: string | undefined
  }
  managers: {
    managerId: string | undefined
    deputyManagerId: string | undefined
    managerSearch: string
    deputySearch: string
    managerCandidates: CompanyUserRef[]
    deputyCandidates: CompanyUserRef[]
  }
  legalRepresentativeId: string | undefined
  supervisors: {
    enabled: boolean
    items: Array<{
      userId: string | undefined
      search: string
      candidates: CompanyUserRef[]
    }>
    chairpersonId: string | undefined
  }
  financialOfficer: {
    userId: string | undefined
    search: string
    candidates: CompanyUserRef[]
  }
}>({
  registeredCapital: null,
  administrativeDivisionLevel: 1,
  brandName: '',
  industryFeature: '',
  companyNameDivisionLevels: [],
  registrationAuthorityCompanyId: undefined,
  registrationAuthorityName: '',
  domicileAddress: '',
  operatingTermLong: true,
  operatingTermYears: null,
  businessScope: '',
  votingRightsMode: 'BY_CAPITAL_RATIO',
  shareholders: [
    {
      kind: 'USER',
      userSearch: '',
      companySearch: '',
      userCandidates: [],
      companyCandidates: [],
      holderId: undefined,
      ratio: undefined,
      votingRatio: undefined,
    },
  ],
  directors: {
    items: [{ userId: undefined, search: '', candidates: [] }],
    chairpersonId: undefined,
    viceChairpersonId: undefined,
  },
  managers: {
    managerId: undefined,
    deputyManagerId: undefined,
    managerSearch: '',
    deputySearch: '',
    managerCandidates: [],
    deputyCandidates: [],
  },
  legalRepresentativeId: undefined,
  supervisors: {
    enabled: false,
    items: [{ userId: undefined, search: '', candidates: [] }],
    chairpersonId: undefined,
  },
  financialOfficer: {
    userId: undefined,
    search: '',
    candidates: [],
  },
})

const initialApplied = ref(false)
watch(
  () => props.initial,
  async (value) => {
    if (!value || initialApplied.value) return
    initialApplied.value = true
    applyingInitial.value = true
    try {
      // 基础字段
      formState.name = value.name ?? ''
      formState.summary = value.summary ?? ''
      formState.description = value.description ?? ''
      formState.typeId = value.typeId
      formState.industryId = value.industryId
      formState.legalRepresentativeId = value.legalRepresentativeId
      formState.llc = value.llc

      // LLC 回填（该表单 submit 时会依赖 llcDraft 构建 payload）
      if (value.llc) {
        // 预填充“已选择人员/公司”的显示名缓存（用于展示，避免选择框显示 id）
        try {
          const { usersDone, companiesDone } = await prefillSelectedLabels(
            value.llc,
          )
          // 只有真正解析完（或无需解析）才标记完成；否则后续 token 到位时还能补一次
          labelPrefillDone.value = usersDone && companiesDone
        } catch {
          // ignore：只影响展示
        }

        selectedServerId.value = value.llc.serverId

        llcDraft.registeredCapital = value.llc.registeredCapital ?? null
        llcDraft.administrativeDivisionLevel = 1
        llcDraft.brandName = value.llc.brandName ?? ''
        llcDraft.industryFeature = value.llc.industryFeature ?? ''
        llcDraft.registrationAuthorityCompanyId =
          value.llc.registrationAuthorityCompanyId
        llcDraft.registrationAuthorityName =
          value.llc.registrationAuthorityName ?? ''
        llcDraft.domicileAddress = value.llc.domicileAddress ?? ''
        llcDraft.operatingTermLong =
          value.llc.operatingTerm?.type === 'LONG_TERM'
        llcDraft.operatingTermYears =
          value.llc.operatingTerm?.type === 'YEARS'
            ? (value.llc.operatingTerm.years ?? null)
            : null
        llcDraft.businessScope = value.llc.businessScope ?? ''
        llcDraft.votingRightsMode =
          (value.llc.votingRightsMode as
            | 'BY_CAPITAL_RATIO'
            | 'CUSTOM'
            | undefined) ?? 'BY_CAPITAL_RATIO'

        // 股东
        llcDraft.shareholders = value.llc.shareholders?.length
          ? value.llc.shareholders.map((s) => ({
              kind: s.kind,
              userSearch: '',
              companySearch: '',
              userCandidates: [],
              companyCandidates: [],
              holderId: s.kind === 'USER' ? s.userId : s.companyId,
              ratio: s.ratio,
              votingRatio: s.votingRatio,
            }))
          : llcDraft.shareholders

        // 董事
        const directorIds = value.llc.directors?.directorIds ?? []
        llcDraft.directors.items =
          directorIds.length > 0
            ? directorIds.map((id) => ({
                userId: id,
                search: '',
                candidates: [],
              }))
            : llcDraft.directors.items
        llcDraft.directors.chairpersonId = value.llc.directors?.chairpersonId
        llcDraft.directors.viceChairpersonId =
          value.llc.directors?.viceChairpersonId

        // 经理
        llcDraft.managers.managerId = value.llc.managers?.managerId
        llcDraft.managers.deputyManagerId = value.llc.managers?.deputyManagerId

        // 法人/监事/财务
        llcDraft.legalRepresentativeId = value.llc.legalRepresentativeId

        llcDraft.supervisors.enabled = Boolean(value.llc.supervisors)
        llcDraft.supervisors.items = llcDraft.supervisors.enabled
          ? value.llc.supervisors?.supervisorIds?.length
            ? value.llc.supervisors.supervisorIds.map((id) => ({
                userId: id,
                search: '',
                candidates: [],
              }))
            : llcDraft.supervisors.items
          : llcDraft.supervisors.items
        llcDraft.supervisors.chairpersonId =
          value.llc.supervisors?.chairpersonId

        llcDraft.financialOfficer.userId = value.llc.financialOfficerId

        if (selectedServerId.value) {
          if (!companyStore.registrationMeta) {
            await companyStore.fetchRegistrationMeta()
          }
          const regime = administrationByServer.value.get(
            selectedServerId.value,
          )
          const pathFromPayload = normalizeDivisionPath(
            value.llc.domicileDivisionPath as
              | Record<string, { id: string; name: string } | null>
              | undefined,
          )
          let nodes = pathFromPayload
          if (!nodes.length && value.llc.domicileDivisionId) {
            try {
              nodes = await loadDivisionPath(
                selectedServerId.value,
                value.llc.domicileDivisionId,
              )
            } catch {
              nodes = []
            }
          }
          if (nodes.length > 0) {
            await applyDivisionPath(selectedServerId.value, nodes)
          } else if (regime?.hasActiveRegime && regime.levelCount) {
            initDivisionLevels(regime.levelCount)
            try {
              await loadDivisionOptions({
                serverId: selectedServerId.value,
                levelIndex: 1,
              })
            } catch {
              divisionLevelOptions.value[0] = []
            }
          } else {
            initDivisionLevels(0)
          }
        }
      }

      await nextTick()
    } finally {
      applyingInitial.value = false
    }
  },
  { immediate: true },
)

// token 可能比 initial 更晚就绪；如果第一次回填时没能 resolve 名称，这里补一次
watch(
  () => authStore.token,
  async (token) => {
    if (!token) return
    if (labelPrefillDone.value) return
    const llc = props.initial?.llc
    if (!llc) return
    try {
      const { usersDone, companiesDone } = await prefillSelectedLabels(llc)
      labelPrefillDone.value = usersDone && companiesDone
    } catch {
      // ignore
    }
  },
  { immediate: true },
)

const authorityCandidatesFiltered = computed(() => {
  const items = authorityCompanies.value
    .map((c) => ({ id: c.id, name: String(c.name ?? '').trim() }))
    .filter((c) => Boolean(c.id) && Boolean(c.name))

  // 去重（按 id）
  const seen = new Set<string>()
  const uniq: Array<{ id: string; name: string }> = []
  for (const c of items) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    uniq.push(c)
  }
  return uniq
})

const llcActiveSection = ref('basic')

const authorityOptions = computed(() =>
  buildCompanyItems(
    authorityCandidatesFiltered.value as unknown as CompanyRef[],
    llcDraft.registrationAuthorityCompanyId,
  ),
)

const availableNameDivisionLevels = computed(() =>
  divisionLevelNodes.value
    .map((node, index) => (node?.id ? index + 1 : null))
    .filter((level): level is number => typeof level === 'number'),
)

watch(
  availableNameDivisionLevels,
  (levels) => {
    if (levels.length === 0) {
      llcDraft.companyNameDivisionLevels = []
      return
    }
    const next = llcDraft.companyNameDivisionLevels.filter((level) =>
      levels.includes(level),
    )
    if (next.length === 0) {
      llcDraft.companyNameDivisionLevels = [levels[0]]
      return
    }
    if (next.length !== llcDraft.companyNameDivisionLevels.length) {
      llcDraft.companyNameDivisionLevels = next
    }
  },
  { immediate: true },
)

const fullCompanyName = computed(() => {
  const divisions = llcDraft.companyNameDivisionLevels
    .slice()
    .sort((a, b) => a - b)
    .map((level) => divisionLevelNodes.value[level - 1]?.name)
    .filter((name): name is string => Boolean(name))
  const brand = llcDraft.brandName.trim()
  const feature = llcDraft.industryFeature.trim()
  const pieces = [...divisions, brand, feature].filter(Boolean)
  return `${pieces.join('') || ''}有限公司`
})

function buildDivisionPathPayload(): WorldDivisionPath | undefined {
  const path: WorldDivisionPath = {
    level1: null,
    level2: null,
    level3: null,
  }
  if (!divisionLevelNodes.value.some(Boolean)) return undefined
  const baseCount = Math.max(divisionLevelNodes.value.length, 3)
  for (let index = 0; index < baseCount; index += 1) {
    const node = divisionLevelNodes.value[index] ?? null
    if (!node && index >= 3) continue
    path[`level${index + 1}`] = node
      ? {
          id: node.id,
          name: node.name,
          level: node.level,
          parentId: node.parentId ?? null,
        }
      : null
  }
  return path
}

const shareholderRatioSum = computed(() =>
  llcDraft.shareholders.reduce((sum, s) => sum + (s.ratio ?? 0), 0),
)

const shareholderVotingSum = computed(() => {
  if (llcDraft.votingRightsMode === 'CUSTOM') {
    return llcDraft.shareholders.reduce(
      (sum, s) => sum + (s.votingRatio ?? 0),
      0,
    )
  }
  // 按出资比例：表决权等同于出资比例
  return shareholderRatioSum.value
})

const directorIds = computed(() =>
  llcDraft.directors.items
    .map((d) => (typeof d.userId === 'string' ? d.userId.trim() : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0),
)

const legalRepresentativeOptions = computed(() => {
  const ids = new Set<string>()
  for (const id of directorIds.value) ids.add(id)
  if (llcDraft.managers.managerId) ids.add(llcDraft.managers.managerId.trim())
  // 副经理不进入候选（按需求）
  return Array.from(ids)
})

const forbiddenSupervisorIds = computed(() => {
  const ids = new Set<string>()
  for (const id of directorIds.value) ids.add(id)
  if (llcDraft.managers.managerId) ids.add(llcDraft.managers.managerId)
  if (llcDraft.managers.deputyManagerId)
    ids.add(llcDraft.managers.deputyManagerId)
  if (llcDraft.financialOfficer.userId)
    ids.add(llcDraft.financialOfficer.userId)
  return ids
})

function addShareholder() {
  llcDraft.shareholders.push({
    kind: 'USER',
    userSearch: '',
    companySearch: '',
    userCandidates: [],
    companyCandidates: [],
    holderId: undefined,
    ratio: undefined,
    votingRatio: undefined,
  })
}
function removeShareholder(index: number) {
  if (llcDraft.shareholders.length <= 1) return
  llcDraft.shareholders.splice(index, 1)
}

function handleUserSearchList(candidates: CompanyUserRef[], query: string) {
  const q = query.trim()
  if (!q) {
    candidates.splice(0, candidates.length)
    return
  }
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    try {
      const next = await companyStore.searchUsers(q, 8)
      candidates.splice(0, candidates.length, ...next)
    } catch {
      candidates.splice(0, candidates.length)
    }
  }, 240)
}

function handleCompanySearchList(candidates: CompanyRef[], query: string) {
  const q = query.trim()
  if (!q) {
    candidates.splice(0, candidates.length)
    return
  }
  if (companySearchTimer) window.clearTimeout(companySearchTimer)
  companySearchTimer = window.setTimeout(async () => {
    try {
      const next = await companyStore.searchCompanies(q, 8)
      candidates.splice(0, candidates.length, ...next)
    } catch {
      candidates.splice(0, candidates.length)
    }
  }, 240)
}

function addDirector() {
  llcDraft.directors.items.push({
    userId: undefined,
    search: '',
    candidates: [],
  })
}
function removeDirector(index: number) {
  if (llcDraft.directors.items.length <= 1) return
  llcDraft.directors.items.splice(index, 1)
}

function addSupervisor() {
  llcDraft.supervisors.items.push({
    userId: undefined,
    search: '',
    candidates: [],
  })
}
function removeSupervisor(index: number) {
  if (llcDraft.supervisors.items.length <= 1) return
  llcDraft.supervisors.items.splice(index, 1)
}

onBeforeUnmount(() => {
  if (searchTimer) {
    window.clearTimeout(searchTimer)
  }
  if (companySearchTimer) {
    window.clearTimeout(companySearchTimer)
  }
  if (level1SearchTimer) {
    window.clearTimeout(level1SearchTimer)
  }
})

onMounted(() => {
  void companyStore.fetchMeta()
  void companyStore.fetchRegistrationMeta()
})

const resolvedTypes = computed(() => {
  if (props.types.length > 0) {
    return props.types
  }
  return companyStore.meta?.types ?? []
})

const limitedLiabilityType = computed(() =>
  resolvedTypes.value.find((t) => t.code === LIMITED_LIABILITY_CODE),
)

const resolvedIndustries = computed(() => {
  if (props.industries.length > 0) {
    return props.industries
  }
  return companyStore.meta?.industries ?? []
})

const registrationServers = computed(
  () => companyStore.registrationMeta?.servers ?? [],
)

const serverOptions = computed(() => {
  const regimeMap = new Map(
    companyStore.registrationMeta?.administration?.map((entry) => [
      entry.serverId,
      entry,
    ]) ?? [],
  )
  return registrationServers.value.map((server) => {
    const regime = regimeMap.get(server.id)
    const levelSuffix =
      regime?.hasActiveRegime && regime.levelCount
        ? ` / ${regime.levelCount}级`
        : ''
    return {
      value: server.id,
      label: `${server.name}${levelSuffix}`,
    }
  })
})

const administrationByServer = computed(() => {
  const map = new Map<
    string,
    { hasActiveRegime: boolean; levelCount?: number | null }
  >()
  for (const entry of companyStore.registrationMeta?.administration ?? []) {
    map.set(entry.serverId, entry)
  }
  return map
})

const selectedRegime = computed(() => {
  const serverId = selectedServerId.value
  if (!serverId) return null
  return administrationByServer.value.get(serverId) ?? null
})

const hasActiveRegime = computed(() =>
  Boolean(selectedRegime.value?.hasActiveRegime),
)

const regimeLevelCount = computed(() => selectedRegime.value?.levelCount ?? 0)

const visibleDivisionLevels = computed(() => {
  if (!selectedServerId.value || !hasActiveRegime.value) return []
  const count = regimeLevelCount.value
  if (!count) return []
  const levels: number[] = []
  levels.push(1)
  if (count >= 2) {
    const options = divisionLevelOptions.value[1] ?? []
    const selectedId = divisionLevelSelectedIds.value[1]
    if (options.length > 0 || selectedId) levels.push(2)
  }
  return levels
})

watch(selectedRegime, (regime) => {
  if (applyingInitial.value) return
  const serverId = selectedServerId.value
  if (!serverId) return
  if (!regime?.hasActiveRegime || !regime.levelCount) return
  if (divisionLevelOptions.value.length > 0) return
  initDivisionLevels(regime.levelCount)
  void loadDivisionOptions({ serverId, levelIndex: 1 }).catch(() => {
    divisionLevelOptions.value[0] = []
  })
})

const typeOptions = computed(() => {
  if (LIMITED_LIABILITY_ONLY) {
    const items: Array<{ value: string; label: string }> = []
    const llc = limitedLiabilityType.value
    const selectedId = formState.typeId
    const selected = selectedId
      ? resolvedTypes.value.find((t) => t.id === selectedId)
      : null

    // 兼容：打开历史申请/回填时，如果当前选中类型不是 LLC，也保证 UI 能展示其名称
    if (selected && selected.code !== LIMITED_LIABILITY_CODE) {
      items.push({
        value: selected.id,
        label: `${selected.name}（暂不支持新申请）`,
      })
    }
    if (llc) items.push({ value: llc.id, label: llc.name })
    return items
  }
  return resolvedTypes.value.map((type) => ({
    value: type.id,
    label: type.name,
  }))
})

const industryOptions = computed(() =>
  resolvedIndustries.value.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)
const selectedIndustryLabel = computed(() => {
  if (!formState.industryId) return '未选择'
  const matched = resolvedIndustries.value.find(
    (industry) => industry.id === formState.industryId,
  )
  return matched?.name || '未选择'
})

const showCompanyTypeField = computed(() => true)
const isCompanyTypeLocked = computed(
  () => LIMITED_LIABILITY_ONLY && Boolean(limitedLiabilityType.value),
)
const isLlcSelected = computed(() => {
  const id = formState.typeId
  // 优先以 typeId 对应的 code 判断，避免出现 typeCode 与 typeId 不一致导致的误判
  if (id) {
    const t = resolvedTypes.value.find((x) => x.id === id)
    return t?.code === LIMITED_LIABILITY_CODE
  }
  const code = formState.typeCode
  return code === LIMITED_LIABILITY_CODE
})

// LLC-only：当 types 元数据就绪时，自动预选 LLC（不覆盖 initial 回填）
watch(
  () => limitedLiabilityType.value?.id,
  (llcTypeId) => {
    if (!LIMITED_LIABILITY_ONLY) return
    if (!llcTypeId) return
    if (props.initial) return
    if (applyingInitial.value) return
    formState.typeId = llcTypeId
    formState.typeCode = LIMITED_LIABILITY_CODE
  },
  { immediate: true },
)

// 当切换到非 LLC（或清空类型）时，避免隐藏的 llc 仍保留在 payload 中
watch(
  () => isLlcSelected.value,
  (enabled) => {
    if (!enabled) {
      formState.llc = undefined
    }
  },
  { immediate: true },
)

// 清理对象中的 undefined 值，确保 JSON.stringify 能正确序列化
// 注意：对于可选字段，undefined 会被移除；对于必需字段，应该确保有值
function cleanUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        // 对于数组，递归清理每个元素（如果是对象）
        cleaned[key as keyof T] = value.map((item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          !(item instanceof Date)
            ? cleanUndefined(item as Record<string, unknown>)
            : item,
        ) as T[keyof T]
      } else if (
        value &&
        typeof value === 'object' &&
        !(value instanceof Date)
      ) {
        cleaned[key as keyof T] = cleanUndefined(
          value as Record<string, unknown>,
        ) as T[keyof T]
      } else {
        cleaned[key as keyof T] = value as T[keyof T]
      }
    }
  }
  return cleaned
}

const handleSubmit = () => {
  if (LIMITED_LIABILITY_ONLY && !isLlcSelected.value) {
    toast.add({ title: '当前暂时仅支持申请注册有限责任公司', color: 'error' })
    return
  }

  // LLC-only：尽量保证 payload 内 typeId/typeCode 与 LLC 一致
  if (LIMITED_LIABILITY_ONLY) {
    formState.typeCode = LIMITED_LIABILITY_CODE
    if (limitedLiabilityType.value?.id) {
      formState.typeId = limitedLiabilityType.value.id
    }
  }

  if (!formState.typeId && !formState.typeCode) {
    toast.add({ title: '请先选择公司类型', color: 'error' })
    return
  }

  if (isLlcSelected.value) {
    if (!selectedServerId.value) {
      toast.add({ title: '请先选择所属服务端', color: 'error' })
      return
    }
    if (!domicileDivisionId.value) {
      toast.add({ title: '请先选择住所地所在行政区', color: 'error' })
      return
    }
    if (!llcDraft.registrationAuthorityCompanyId) {
      toast.add({ title: '请选择登记机关（机关法人）', color: 'error' })
      return
    }
    const authorityName =
      authorityCandidatesFiltered.value.find(
        (c) => c.id === llcDraft.registrationAuthorityCompanyId,
      )?.name ??
      companyLabelCache[llcDraft.registrationAuthorityCompanyId] ??
      llcDraft.registrationAuthorityName.trim()
    if (!authorityName) {
      toast.add({ title: '登记机关信息无效，请重新选择', color: 'error' })
      return
    }
    const directors = directorIds.value
    if (!(directors.length === 1 || directors.length >= 3)) {
      toast.add({ title: '董事人数必须为 1 人或 3 人及以上', color: 'error' })
      return
    }
    // 注意：站内用户 id 可能不是 UUID（历史数据/导入数据），因此这里只校验非空；
    // 真实合法性由后端按 userId 查库判断。
    if (directors.length > 1 && !llcDraft.directors.chairpersonId) {
      toast.add({ title: '董事人数大于 1 人时必须指定董事长', color: 'error' })
      return
    }
    if (
      !llcDraft.legalRepresentativeId ||
      !llcDraft.legalRepresentativeId.trim()
    ) {
      toast.add({ title: '请从董事或经理中选择法定代表人', color: 'error' })
      return
    }
    if (shareholderRatioSum.value !== 100) {
      toast.add({ title: '所有股东的出资比例之和必须为 100%', color: 'error' })
      return
    }
    // 验证股东信息完整性
    for (const s of llcDraft.shareholders) {
      if (s.kind === 'USER' && (!s.holderId || !s.holderId.trim())) {
        toast.add({ title: '请为所有股东选择用户或公司', color: 'error' })
        return
      }
      if (s.kind === 'COMPANY' && (!s.holderId || !s.holderId.trim())) {
        toast.add({ title: '请为所有股东选择用户或公司', color: 'error' })
        return
      }
    }

    // 股东表决权：自定义时，合计必须为 100%
    if (llcDraft.votingRightsMode === 'CUSTOM') {
      if (shareholderVotingSum.value !== 100) {
        toast.add({ title: '所有股东的表决权之和必须为 100%', color: 'error' })
        return
      }
      for (const s of llcDraft.shareholders) {
        const v = s.votingRatio
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          toast.add({ title: '请为所有股东填写表决权（%）', color: 'error' })
          return
        }
        if (v < 0 || v > 100) {
          toast.add({ title: '股东表决权必须在 0%～100% 之间', color: 'error' })
          return
        }
      }
    }

    const supervisorIds = llcDraft.supervisors.enabled
      ? llcDraft.supervisors.items
          .map((s) => s.userId?.trim())
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    if (supervisorIds.some((id) => forbiddenSupervisorIds.value.has(id))) {
      toast.add({
        title: '监事不得由董事、经理、副经理或财务负责人兼任',
        color: 'error',
      })
      return
    }

    const llcPayload: LimitedLiabilityCompanyApplicationPayload = {
      serverId: selectedServerId.value as string,
      domicileDivisionId: domicileDivisionId.value as string,
      domicileDivisionPath: buildDivisionPathPayload(),
      registeredCapital: llcDraft.registeredCapital ?? 0,
      administrativeDivisionLevel: 1,
      brandName: llcDraft.brandName.trim(),
      industryFeature: llcDraft.industryFeature.trim(),
      registrationAuthorityCompanyId: llcDraft.registrationAuthorityCompanyId,
      registrationAuthorityName: authorityName,
      domicileAddress: llcDraft.domicileAddress.trim(),
      operatingTerm: llcDraft.operatingTermLong
        ? { type: 'LONG_TERM' }
        : { type: 'YEARS', years: llcDraft.operatingTermYears ?? undefined },
      businessScope: llcDraft.businessScope.trim(),
      votingRightsMode: llcDraft.votingRightsMode,
      shareholders: llcDraft.shareholders.map((s) => {
        const holderId = s.holderId?.trim()
        const isValidId = holderId && holderId.length > 0
        return {
          kind: s.kind,
          userId: s.kind === 'USER' && isValidId ? holderId : undefined,
          companyId: s.kind === 'COMPANY' && isValidId ? holderId : undefined,
          ratio: s.ratio ?? 0,
          votingRatio:
            llcDraft.votingRightsMode === 'CUSTOM'
              ? (s.votingRatio ?? 0)
              : (s.ratio ?? 0),
        }
      }),
      directors: {
        directorIds: directors,
        chairpersonId: (() => {
          const id = llcDraft.directors.chairpersonId?.trim()
          return id && id.length > 0 ? id : undefined
        })(),
        viceChairpersonId: (() => {
          const id = llcDraft.directors.viceChairpersonId?.trim()
          return id && id.length > 0 ? id : undefined
        })(),
      },
      managers: {
        managerId: (() => {
          const id = llcDraft.managers.managerId?.trim()
          return id && id.length > 0 ? id : undefined
        })(),
        deputyManagerId: (() => {
          const id = llcDraft.managers.deputyManagerId?.trim()
          return id && id.length > 0 ? id : undefined
        })(),
      },
      legalRepresentativeId: llcDraft.legalRepresentativeId.trim(),
      supervisors: llcDraft.supervisors.enabled
        ? {
            supervisorIds,
            chairpersonId: (() => {
              const id = llcDraft.supervisors.chairpersonId?.trim()
              return id && id.length > 0 ? id : undefined
            })(),
          }
        : undefined,
      financialOfficerId: (() => {
        const id = llcDraft.financialOfficer.userId?.trim()
        return id && id.length > 0 ? id : undefined
      })(),
    }

    formState.name = fullCompanyName.value
    formState.legalRepresentativeId = llcDraft.legalRepresentativeId
    formState.llc = llcPayload
  }

  // 清理 undefined 值并发送 payload
  const cleanedPayload = cleanUndefined({ ...formState })
  emit('submit', cleanedPayload as CreateCompanyApplicationPayload)
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <div
      v-if="props.showEntrySelectors"
      class="space-y-4 grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      <div v-if="showCompanyTypeField" class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">类型</label>
        <p v-if="isCompanyTypeLocked" class="text-xs text-slate-500">
          当前暂时仅支持申请注册有限责任公司，类型已锁定。
        </p>
        <USelectMenu
          class="w-full"
          v-model="formState.typeId"
          :items="typeOptions"
          value-key="value"
          :searchable="!isCompanyTypeLocked"
          :disabled="isCompanyTypeLocked"
          :placeholder="
            isCompanyTypeLocked ? '有限责任公司（当前仅支持）' : '选择公司类型'
          "
        >
          <template #trailing="{ modelValue }">
            <div class="flex items-center gap-1">
              <button
                v-if="
                  !isCompanyTypeLocked &&
                  modelValue !== undefined &&
                  modelValue !== null &&
                  String(modelValue) !== ''
                "
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="清空"
                @click.stop.prevent="formState.typeId = undefined"
              >
                ×
              </button>
              <span class="select-none text-slate-400">▾</span>
            </div>
          </template>
        </USelectMenu>
      </div>

      <div class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">
          <span>行业</span>
          <UBadge v-if="isCompanyTypeLocked" variant="soft" size="xs"
            >未锁定</UBadge
          >
        </label>
        <USelectMenu
          class="w-full"
          v-model="formState.industryId"
          :items="industryOptions"
          value-key="value"
          searchable
          placeholder="选择所属行业"
        >
          <template #trailing="{ modelValue }">
            <div class="flex items-center gap-1">
              <button
                v-if="
                  modelValue !== undefined &&
                  modelValue !== null &&
                  String(modelValue) !== ''
                "
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="清空"
                @click.stop.prevent="formState.industryId = undefined"
              >
                ×
              </button>
              <span class="select-none text-slate-400">▾</span>
            </div>
          </template>
        </USelectMenu>
      </div>
    </div>

    <CompanyLlcRegistrationForm
      v-if="isLlcSelected"
      :selected-server-id="selectedServerId"
      :server-search="serverSearch"
      :server-options="serverOptions"
      :visible-division-levels="visibleDivisionLevels"
      :division-level-selected-ids="divisionLevelSelectedIds"
      :division-level-options="divisionLevelOptions"
      :level1-search="level1Search"
      :has-active-regime="hasActiveRegime"
      :industry-label="selectedIndustryLabel"
      :domicile-division="domicileDivision"
      :full-company-name="fullCompanyName"
      :authority-options="authorityOptions"
      :authority-loading="authorityLoading"
      :llc-draft="llcDraft"
      :shareholder-ratio-sum="shareholderRatioSum"
      :shareholder-voting-sum="shareholderVotingSum"
      :director-ids="directorIds"
      :legal-representative-options="legalRepresentativeOptions"
      :user-label-cache="userLabelCache"
      :forbidden-supervisor-ids="forbiddenSupervisorIds"
      :build-user-items="buildUserItems"
      :build-company-items="buildCompanyItems"
      :handle-user-search-list="handleUserSearchList"
      :handle-company-search-list="handleCompanySearchList"
      :add-shareholder="addShareholder"
      :remove-shareholder="removeShareholder"
      :add-director="addDirector"
      :remove-director="removeDirector"
      :add-supervisor="addSupervisor"
      :remove-supervisor="removeSupervisor"
      :active-section="llcActiveSection"
      @request-authorities="handleAuthorityOpen"
      @update:selected-server-id="selectedServerId = $event"
      @update:server-search="serverSearch = $event"
      @update:level1-search="level1Search = $event"
      @update:division-level-selected-ids="divisionLevelSelectedIds = $event"
      @update:active-section="llcActiveSection = $event"
    />

    <div v-if="!isLlcSelected" class="flex justify-end">
      <UButton type="submit" color="primary" :loading="submitting">
        {{ props.submitLabel || '提交注册申请' }}
      </UButton>
    </div>
  </form>
</template>
