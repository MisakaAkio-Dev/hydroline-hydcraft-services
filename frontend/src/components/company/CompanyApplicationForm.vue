<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useCompanyStore } from '@/stores/user/companies'
import { useAuthStore } from '@/stores/user/auth'
import type {
  CompanyIndustry,
  CompanyType,
  CompanyMemberUserRef,
  CompanyRef,
  CreateCompanyApplicationPayload,
  LimitedLiabilityCompanyApplicationPayload,
  WorldDivisionNode,
  WorldDivisionPath,
} from '@/types/company'

const props = defineProps<{
  industries: CompanyIndustry[]
  types: CompanyType[]
  submitting?: boolean
  initial?: CreateCompanyApplicationPayload | null
  submitLabel?: string
}>()

const emit = defineEmits<{
  (event: 'submit', payload: CreateCompanyApplicationPayload): void
}>()

const companyStore = useCompanyStore()
const authStore = useAuthStore()
const toast = useToast()

const LIMITED_LIABILITY_CODE = 'limited_liability_company'

// ---------- 选择框显示：缓存已见过的 name，避免 items 变化后回退显示 id ----------
const userLabelCache = reactive<Record<string, string>>({})
const companyLabelCache = reactive<Record<string, string>>({})
function getUserLabel(u: CompanyMemberUserRef) {
  return u.displayName || u.name || u.email || '未知用户'
}
function upsertUserLabel(u: CompanyMemberUserRef) {
  userLabelCache[u.id] = getUserLabel(u)
}
function upsertCompanyLabel(c: CompanyRef) {
  companyLabelCache[c.id] = c.name
}
function buildUserItems(candidates: CompanyMemberUserRef[], selectedId?: string) {
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
  industryId: undefined,
  legalRepresentativeId: undefined,
  llc: undefined,
})
let searchTimer: number | undefined
let companySearchTimer: number | undefined
let divisionSearchTimer: number | undefined

// ---------- 有限责任公司：行政区（三级搜索） ----------
const level1Search = ref('')
const level2Search = ref('')
const level3Search = ref('')
const level1Options = ref<WorldDivisionNode[]>([])
const level2Options = ref<WorldDivisionNode[]>([])
const level3Options = ref<WorldDivisionNode[]>([])
const domicileLevel1Id = ref<string | undefined>(undefined)
const domicileLevel2Id = ref<string | undefined>(undefined)
const domicileLevel3Id = ref<string | undefined>(undefined)
const domicilePath = ref<WorldDivisionPath | null>(null)
const applyingInitial = ref(false)
const labelPrefillDone = ref(false)

async function prefillSelectedLabels(
  llc: LimitedLiabilityCompanyApplicationPayload,
): Promise<{ usersDone: boolean; companiesDone: boolean }> {
  const userIds = new Set<string>()
  const companyIds = new Set<string>()
  for (const s of llc.shareholders ?? []) {
    if (s.kind === 'USER' && s.userId) userIds.add(s.userId)
    if (s.kind === 'COMPANY' && s.companyId) companyIds.add(s.companyId)
  }
  for (const id of llc.directors?.directorIds ?? []) userIds.add(id)
  if (llc.directors?.chairpersonId) userIds.add(llc.directors.chairpersonId)
  if (llc.directors?.viceChairpersonId) userIds.add(llc.directors.viceChairpersonId)
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
      const users = await apiFetch<CompanyMemberUserRef[]>(
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
  level: 1 | 2 | 3
  parentId?: string | null
}) {
  const qp = new URLSearchParams()
  if (params.q?.trim()) qp.set('q', params.q.trim())
  qp.set('level', String(params.level))
  if (params.parentId) qp.set('parentId', params.parentId)
  return apiFetch<WorldDivisionNode[]>(
    `/companies/geo/divisions/search?${qp.toString()}`,
  )
}

async function refreshDomicilePath() {
  if (!domicileLevel3Id.value) {
    domicilePath.value = null
    return
  }
  domicilePath.value = await apiFetch<WorldDivisionPath>(
    `/companies/geo/divisions/${domicileLevel3Id.value}/path`,
  )
}

watch(domicileLevel1Id, () => {
  if (applyingInitial.value) return
  domicileLevel2Id.value = undefined
  domicileLevel3Id.value = undefined
  domicilePath.value = null
  level2Options.value = []
  level3Options.value = []
})
watch(domicileLevel2Id, () => {
  if (applyingInitial.value) return
  domicileLevel3Id.value = undefined
  domicilePath.value = null
  level3Options.value = []
})
watch(domicileLevel3Id, () => {
  void refreshDomicilePath()
})

watch(level1Search, (value) => {
  if (divisionSearchTimer) window.clearTimeout(divisionSearchTimer)
  divisionSearchTimer = window.setTimeout(async () => {
    try {
      level1Options.value = await searchDivisions({ level: 1, q: value })
    } catch {
      level1Options.value = []
    }
  }, 240)
})
watch(level2Search, (value) => {
  if (!domicileLevel1Id.value) return
  if (divisionSearchTimer) window.clearTimeout(divisionSearchTimer)
  divisionSearchTimer = window.setTimeout(async () => {
    try {
      level2Options.value = await searchDivisions({
        level: 2,
        q: value,
        parentId: domicileLevel1Id.value,
      })
    } catch {
      level2Options.value = []
    }
  }, 240)
})
watch(level3Search, (value) => {
  if (!domicileLevel2Id.value) return
  if (divisionSearchTimer) window.clearTimeout(divisionSearchTimer)
  divisionSearchTimer = window.setTimeout(async () => {
    try {
      level3Options.value = await searchDivisions({
        level: 3,
        q: value,
        parentId: domicileLevel2Id.value,
      })
    } catch {
      level3Options.value = []
    }
  }, 240)
})

// ---------- 有限责任公司：股东（用户/公司搜索） ----------
type ShareholderDraft = {
  kind: 'USER' | 'COMPANY'
  userSearch: string
  companySearch: string
  userCandidates: CompanyMemberUserRef[]
  companyCandidates: CompanyRef[]
  holderId: string | undefined
  ratio: number | undefined
}

const llcDraft = reactive<{
  registeredCapital: number | null
  administrativeDivisionLevel: 1 | 2 | 3
  brandName: string
  industryFeature: string
  registrationAuthorityName: string
  domicileAddress: string
  operatingTermLong: boolean
  operatingTermYears: number | null
  businessScope: string
  shareholders: ShareholderDraft[]
  directors: {
    items: Array<{
      userId: string | undefined
      search: string
      candidates: CompanyMemberUserRef[]
    }>
    chairpersonId: string | undefined
    viceChairpersonId: string | undefined
  }
  managers: {
    managerId: string | undefined
    deputyManagerId: string | undefined
    managerSearch: string
    deputySearch: string
    managerCandidates: CompanyMemberUserRef[]
    deputyCandidates: CompanyMemberUserRef[]
  }
  legalRepresentativeId: string | undefined
  supervisors: {
    enabled: boolean
    items: Array<{
      userId: string | undefined
      search: string
      candidates: CompanyMemberUserRef[]
    }>
    chairpersonId: string | undefined
  }
  financialOfficer: {
    userId: string | undefined
    search: string
    candidates: CompanyMemberUserRef[]
  }
}>({
  registeredCapital: null,
  administrativeDivisionLevel: 3,
  brandName: '',
  industryFeature: '',
  registrationAuthorityName: '',
  domicileAddress: '',
  operatingTermLong: true,
  operatingTermYears: null,
  businessScope: '',
  shareholders: [
    {
      kind: 'USER',
      userSearch: '',
      companySearch: '',
      userCandidates: [],
      companyCandidates: [],
      holderId: undefined,
      ratio: undefined,
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
          const { usersDone, companiesDone } = await prefillSelectedLabels(value.llc)
          // 只有真正解析完（或无需解析）才标记完成；否则后续 token 到位时还能补一次
          labelPrefillDone.value = usersDone && companiesDone
        } catch {
          // ignore：只影响展示
        }

        const path = value.llc.domicileDivisionPath
        if (path?.level1) level1Options.value = [path.level1]
        if (path?.level2) level2Options.value = [path.level2]
        if (path?.level3) level3Options.value = [path.level3]
        domicilePath.value = path ?? null
        domicileLevel1Id.value = path?.level1?.id
        domicileLevel2Id.value = path?.level2?.id
        domicileLevel3Id.value = value.llc.domicileDivisionId

        llcDraft.registeredCapital = value.llc.registeredCapital ?? null
        llcDraft.administrativeDivisionLevel =
          (value.llc.administrativeDivisionLevel as 1 | 2 | 3) ?? 3
        llcDraft.brandName = value.llc.brandName ?? ''
        llcDraft.industryFeature = value.llc.industryFeature ?? ''
        llcDraft.registrationAuthorityName = value.llc.registrationAuthorityName ?? ''
        llcDraft.domicileAddress = value.llc.domicileAddress ?? ''
        llcDraft.operatingTermLong = value.llc.operatingTerm?.type === 'LONG_TERM'
        llcDraft.operatingTermYears =
          value.llc.operatingTerm?.type === 'YEARS'
            ? value.llc.operatingTerm.years ?? null
            : null
        llcDraft.businessScope = value.llc.businessScope ?? ''

        // 股东
        llcDraft.shareholders =
          value.llc.shareholders?.length
            ? value.llc.shareholders.map((s) => ({
                kind: s.kind,
                userSearch: '',
                companySearch: '',
                userCandidates: [],
                companyCandidates: [],
                holderId: s.kind === 'USER' ? s.userId : s.companyId,
                ratio: s.ratio,
              }))
            : llcDraft.shareholders

        // 董事
        const directorIds = value.llc.directors?.directorIds ?? []
        llcDraft.directors.items =
          directorIds.length > 0
            ? directorIds.map((id) => ({ userId: id, search: '', candidates: [] }))
            : llcDraft.directors.items
        llcDraft.directors.chairpersonId = value.llc.directors?.chairpersonId
        llcDraft.directors.viceChairpersonId = value.llc.directors?.viceChairpersonId

        // 经理
        llcDraft.managers.managerId = value.llc.managers?.managerId
        llcDraft.managers.deputyManagerId = value.llc.managers?.deputyManagerId

        // 法人/监事/财务
        llcDraft.legalRepresentativeId = value.llc.legalRepresentativeId

        llcDraft.supervisors.enabled = Boolean(value.llc.supervisors)
        llcDraft.supervisors.items = llcDraft.supervisors.enabled
          ? (value.llc.supervisors?.supervisorIds?.length
              ? value.llc.supervisors.supervisorIds.map((id) => ({
                  userId: id,
                  search: '',
                  candidates: [],
                }))
              : llcDraft.supervisors.items)
          : llcDraft.supervisors.items
        llcDraft.supervisors.chairpersonId = value.llc.supervisors?.chairpersonId

        llcDraft.financialOfficer.userId = value.llc.financialOfficerId

        // 当后端未返回 domicileDivisionPath 时兜底刷新
        if (!domicilePath.value && domicileLevel3Id.value) {
          await refreshDomicilePath()
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

const divisionNameOptions = computed(() => {
  const p = domicilePath.value
  const items = [
    p?.level1?.name ? { value: 1, label: p.level1.name } : null,
    p?.level2?.name ? { value: 2, label: p.level2.name } : null,
    p?.level3?.name ? { value: 3, label: p.level3.name } : null,
  ].filter(Boolean) as Array<{ value: 1 | 2 | 3; label: string }>
  return items
})

const authorityOptions = computed(() => {
  const p = domicilePath.value
  const items: Array<{ value: string; label: string }> = []
  if (p?.level3?.name) {
    const label = `${p.level3.name}市场监督管理局`
    items.push({ value: label, label })
  }
  if (p?.level2?.name) {
    const label = `${p.level2.name}市场监督管理局`
    items.push({ value: label, label })
  }
  items.push({ value: '氢气市场监督管理总局', label: '氢气市场监督管理总局' })
  return items
})

const fullCompanyName = computed(() => {
  const p = domicilePath.value
  const division =
    llcDraft.administrativeDivisionLevel === 1
      ? p?.level1?.name
      : llcDraft.administrativeDivisionLevel === 2
        ? p?.level2?.name
        : p?.level3?.name
  const brand = llcDraft.brandName.trim()
  const feature = llcDraft.industryFeature.trim()
  const pieces = [division, brand, feature].filter(Boolean)
  return `${pieces.join('') || ''}有限公司`
})

const shareholderRatioSum = computed(() =>
  llcDraft.shareholders.reduce((sum, s) => sum + (s.ratio ?? 0), 0),
)

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
  if (llcDraft.managers.deputyManagerId) ids.add(llcDraft.managers.deputyManagerId)
  if (llcDraft.financialOfficer.userId) ids.add(llcDraft.financialOfficer.userId)
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
  })
}
function removeShareholder(index: number) {
  if (llcDraft.shareholders.length <= 1) return
  llcDraft.shareholders.splice(index, 1)
}

async function searchUsersInto(
  target: { search: string; candidates: CompanyMemberUserRef[] },
  query: string,
) {
  const q = query.trim()
  if (!q) {
    target.candidates = []
    return
  }
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    try {
      target.candidates = await companyStore.searchUsers(q, 8)
    } catch {
      target.candidates = []
    }
  }, 240)
}

function handleUserSearchList(candidates: CompanyMemberUserRef[], query: string) {
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

function handleCompanySearchList(
  candidates: CompanyRef[],
  query: string,
) {
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
  llcDraft.directors.items.push({ userId: undefined, search: '', candidates: [] })
}
function removeDirector(index: number) {
  if (llcDraft.directors.items.length <= 1) return
  llcDraft.directors.items.splice(index, 1)
}

function addSupervisor() {
  llcDraft.supervisors.items.push({ userId: undefined, search: '', candidates: [] })
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
  if (divisionSearchTimer) {
    window.clearTimeout(divisionSearchTimer)
  }
})

onMounted(() => {
  void companyStore.fetchMeta()
  // 预拉一级/二级/三级默认（空搜索会返回前若干项）
  void searchDivisions({ level: 1 }).then((v) => (level1Options.value = v)).catch(() => {})
})

const resolvedTypes = computed(() => {
  if (props.types.length > 0) {
    return props.types
  }
  return companyStore.meta?.types ?? []
})

const resolvedIndustries = computed(() => {
  if (props.industries.length > 0) {
    return props.industries
  }
  return companyStore.meta?.industries ?? []
})

const typeOptions = computed(() =>
  resolvedTypes.value.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  resolvedIndustries.value.map((industry) => ({
    value: industry.id,
    label: industry.name,
  })),
)

const showCompanyTypeField = computed(() => true)
const isLlcSelected = computed(() => {
  const id = formState.typeId
  const code = formState.typeCode
  if (code) return code === LIMITED_LIABILITY_CODE
  const t = resolvedTypes.value.find((x) => x.id === id)
  return t?.code === LIMITED_LIABILITY_CODE
})

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
          item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)
            ? cleanUndefined(item as Record<string, unknown>)
            : item,
        ) as T[keyof T]
      } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        cleaned[key as keyof T] = cleanUndefined(value as Record<string, unknown>) as T[keyof T]
      } else {
        cleaned[key as keyof T] = value as T[keyof T]
      }
    }
  }
  return cleaned
}

const handleSubmit = () => {
  if (!formState.typeId && !formState.typeCode) {
    toast.add({ title: '请先选择公司类型', color: 'error' })
    return
  }

  if (isLlcSelected.value) {
    if (!domicileLevel3Id.value) {
      toast.add({ title: '请先选择住所地所在地区（区级）', color: 'error' })
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
    if (!llcDraft.legalRepresentativeId || !llcDraft.legalRepresentativeId.trim()) {
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
      domicileDivisionId: domicileLevel3Id.value,
      domicileDivisionPath: domicilePath.value ?? undefined,
      registeredCapital: llcDraft.registeredCapital ?? 0,
      administrativeDivisionLevel: llcDraft.administrativeDivisionLevel,
      brandName: llcDraft.brandName.trim(),
      industryFeature: llcDraft.industryFeature.trim(),
      registrationAuthorityName: llcDraft.registrationAuthorityName,
      domicileAddress: llcDraft.domicileAddress.trim(),
      operatingTerm: llcDraft.operatingTermLong
        ? { type: 'LONG_TERM' }
        : { type: 'YEARS', years: llcDraft.operatingTermYears ?? undefined },
      businessScope: llcDraft.businessScope.trim(),
      shareholders: llcDraft.shareholders.map((s) => {
        const holderId = s.holderId?.trim()
        const isValidId = holderId && holderId.length > 0
        return {
          kind: s.kind,
          userId: s.kind === 'USER' && isValidId ? holderId : undefined,
          companyId: s.kind === 'COMPANY' && isValidId ? holderId : undefined,
          ratio: s.ratio ?? 0,
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
    <div class="space-y-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div v-if="showCompanyTypeField" class="space-y-2">
        <label class="text-xs text-slate-500 dark:text-slate-500">类型</label>
        <USelectMenu
          class="w-full"
          v-model="formState.typeId"
          :items="typeOptions"
          value-key="value"
          searchable
          placeholder="选择公司类型"
        >
          <template #trailing="{ modelValue }">
            <div class="flex items-center gap-1">
              <button
                v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
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
        <label class="text-xs text-slate-500 dark:text-slate-500">行业</label>
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
                v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
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

    <div
      v-if="isLlcSelected"
      class="space-y-6 rounded-2xl border border-slate-200/70 bg-white/90 p-4"
    >
      <div class="space-y-2">
        <p class="text-sm font-semibold text-slate-900">有限责任公司登记信息</p>
        <p class="text-xs text-slate-500">
          先选择住所地所在地区（三级），再填写公司名称各组成部分与人员信息。
        </p>
      </div>

      <!-- 1 住所地所在地区 -->
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          1. 住所地所在地区
        </p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <USelectMenu
            class="w-full"
            v-model="domicileLevel1Id"
            v-model:search-term="level1Search"
            :items="level1Options.map((n) => ({ value: n.id, label: n.name }))"
            value-key="value"
            searchable
            placeholder="一级：氢气"
          >
            <template #trailing="{ modelValue }">
              <div class="flex items-center gap-1">
                <button
                  v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
                  type="button"
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="清空"
                  @click.stop.prevent="domicileLevel1Id = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
          <USelectMenu
            class="w-full"
            v-model="domicileLevel2Id"
            v-model:search-term="level2Search"
            :items="level2Options.map((n) => ({ value: n.id, label: n.name }))"
            value-key="value"
            searchable
            :disabled="!domicileLevel1Id"
            placeholder="二级：xx都/xx县"
          >
            <template #trailing="{ modelValue }">
              <div class="flex items-center gap-1">
                <button
                  v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
                  type="button"
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="清空"
                  @click.stop.prevent="domicileLevel2Id = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
          <USelectMenu
            class="w-full"
            v-model="domicileLevel3Id"
            v-model:search-term="level3Search"
            :items="level3Options.map((n) => ({ value: n.id, label: n.name }))"
            value-key="value"
            searchable
            :disabled="!domicileLevel2Id"
            placeholder="三级：xx区"
          >
            <template #trailing="{ modelValue }">
              <div class="flex items-center gap-1">
                <button
                  v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
                  type="button"
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="清空"
                  @click.stop.prevent="domicileLevel3Id = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- 2 注册资本 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          2. 注册资本
        </p>
        <UInput
          class="w-full"
          v-model.number="llcDraft.registeredCapital"
          type="number"
          placeholder="填写数值"
        />
      </div>

      <!-- 3 公司名称 -->
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          3. 公司名称
        </p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs text-slate-500">（1）行政区划</label>
            <USelectMenu
              class="w-full"
              v-model="llcDraft.administrativeDivisionLevel"
              :items="divisionNameOptions"
              value-key="value"
              :disabled="!domicilePath"
              placeholder="根据住所地选择"
            >
              <template #trailing="{ modelValue }">
                <div class="flex items-center gap-1">
                  <button
                    v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
                    type="button"
                    class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label="清空"
                    @click.stop.prevent="llcDraft.administrativeDivisionLevel = 3"
                  >
                    ×
                  </button>
                  <span class="select-none text-slate-400">▾</span>
                </div>
              </template>
            </USelectMenu>
          </div>
          <div class="space-y-2">
            <label class="text-xs text-slate-500">（2）字号</label>
            <UInput class="w-full" v-model="llcDraft.brandName" />
          </div>
          <div class="space-y-2">
            <label class="text-xs text-slate-500">（3）行业或经营特点</label>
            <UInput class="w-full" v-model="llcDraft.industryFeature" />
          </div>
          <div class="space-y-2">
            <label class="text-xs text-slate-500">（4）组织形式</label>
            <UInput class="w-full" model-value="有限公司" disabled />
          </div>
        </div>
        <div class="text-xs text-slate-500">
          预览：<span class="font-semibold text-slate-900">{{ fullCompanyName }}</span>
        </div>
      </div>

      <!-- 4 登记机关 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          4. 选择登记机关
        </p>
        <USelectMenu
          class="w-full"
          v-model="llcDraft.registrationAuthorityName"
          :items="authorityOptions"
          value-key="value"
          searchable
          placeholder="选择市场监督管理局"
        >
          <template #trailing="{ modelValue }">
            <div class="flex items-center gap-1">
              <button
                v-if="modelValue !== undefined && modelValue !== null && String(modelValue) !== ''"
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="清空"
                @click.stop.prevent="llcDraft.registrationAuthorityName = ''"
              >
                ×
              </button>
              <span class="select-none text-slate-400">▾</span>
            </div>
          </template>
        </USelectMenu>
      </div>

      <!-- 5 住所地 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          5. 住所地（详细地址）
        </p>
        <UInput class="w-full" v-model="llcDraft.domicileAddress" />
      </div>

      <!-- 6 经营期限 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          6. 经营期限
        </p>
        <div class="flex items-center gap-3">
          <USwitch v-model="llcDraft.operatingTermLong" />
          <span class="text-xs text-slate-600">{{
            llcDraft.operatingTermLong ? '长期' : '按年限'
          }}</span>
          <UInput
            v-if="!llcDraft.operatingTermLong"
            class="w-36"
            v-model.number="llcDraft.operatingTermYears"
            type="number"
            placeholder="xx年"
          />
        </div>
      </div>

      <!-- 7 经营范围 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          7. 经营范围
        </p>
        <UTextarea class="w-full" v-model="llcDraft.businessScope" :rows="3" />
      </div>

      <!-- 8 股东 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            8. 添加股东（出资比例合计 100%）
          </p>
          <UButton size="xs" color="neutral" variant="ghost" @click="addShareholder">
            添加股东
          </UButton>
        </div>

        <div
          v-for="(s, idx) in llcDraft.shareholders"
          :key="idx"
          class="rounded-xl border border-slate-200/70 p-3 space-y-3"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-slate-700">股东 #{{ idx + 1 }}</p>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="llcDraft.shareholders.length <= 1"
              @click="removeShareholder(idx)"
            >
              删除
            </UButton>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <USelectMenu
              class="w-full"
              v-model="s.kind"
              :items="[
                { value: 'USER', label: '用户' },
                { value: 'COMPANY', label: '公司' },
              ]"
              value-key="value"
            />

            <USelectMenu
              v-if="s.kind === 'USER'"
              class="w-full md:col-span-2"
              v-model="s.holderId"
              v-model:search-term="s.userSearch"
              :items="buildUserItems(s.userCandidates, s.holderId)"
              value-key="value"
              label-key="label"
              searchable
              placeholder="搜索用户"
              @update:search-term="(v: string) => handleUserSearchList(s.userCandidates, v)"
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
                    @click.stop.prevent="s.holderId = undefined"
                  >
                    ×
                  </button>
                  <span class="select-none text-slate-400">▾</span>
                </div>
              </template>
            </USelectMenu>

            <USelectMenu
              v-else
              class="w-full md:col-span-2"
              v-model="s.holderId"
              v-model:search-term="s.companySearch"
              :items="buildCompanyItems(s.companyCandidates, s.holderId)"
              value-key="value"
              label-key="label"
              searchable
              placeholder="搜索公司"
              @update:search-term="(v: string) => handleCompanySearchList(s.companyCandidates, v)"
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
                    @click.stop.prevent="s.holderId = undefined"
                  >
                    ×
                  </button>
                  <span class="select-none text-slate-400">▾</span>
                </div>
              </template>
            </USelectMenu>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="space-y-1">
              <label class="text-xs text-slate-500">出资比例（%）</label>
              <UInput class="w-full" v-model.number="s.ratio" type="number" />
            </div>
          </div>
        </div>

        <div class="text-xs text-slate-500">
          当前合计：<span
            class="font-semibold"
            :class="shareholderRatioSum === 100 ? 'text-emerald-600' : 'text-rose-600'"
            >{{ shareholderRatioSum }}%</span
          >
        </div>
      </div>

      <!-- 9 董事 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            9. 添加董事信息（1 人或 3 人及以上）
          </p>
          <UButton size="xs" color="neutral" variant="ghost" @click="addDirector">
            添加董事
          </UButton>
        </div>

        <div
          v-for="(d, idx) in llcDraft.directors.items"
          :key="idx"
          class="rounded-xl border border-slate-200/70 p-3 space-y-2"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-slate-700">董事 #{{ idx + 1 }}</p>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="llcDraft.directors.items.length <= 1"
              @click="removeDirector(idx)"
            >
              删除
            </UButton>
          </div>
          <USelectMenu
            class="w-full"
            v-model="d.userId"
            v-model:search-term="d.search"
            :items="buildUserItems(d.candidates, d.userId)"
            value-key="value"
            label-key="label"
            searchable
            placeholder="搜索用户"
              @update:search-term="(v: string) => handleUserSearchList(d.candidates, v)"
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
                  @click.stop.prevent="d.userId = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </div>

        <div v-if="directorIds.length > 1" class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <USelectMenu
            class="w-full"
            v-model="llcDraft.directors.chairpersonId"
            :items="directorIds.map((id) => ({ value: id, label: userLabelCache[id] ?? id }))"
            value-key="value"
            label-key="label"
            placeholder="选择董事长（必选）"
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
                  @click.stop.prevent="llcDraft.directors.chairpersonId = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
          <USelectMenu
            class="w-full"
            v-model="llcDraft.directors.viceChairpersonId"
            :items="directorIds.map((id) => ({ value: id, label: userLabelCache[id] ?? id }))"
            value-key="value"
            label-key="label"
            placeholder="选择副董事长（可选）"
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
                  @click.stop.prevent="llcDraft.directors.viceChairpersonId = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- 10 经理/副经理 -->
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          10. 添加经理信息（可选，最多各 1 人）
        </p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <USelectMenu
            class="w-full"
            v-model="llcDraft.managers.managerId"
            v-model:search-term="llcDraft.managers.managerSearch"
            :items="buildUserItems(llcDraft.managers.managerCandidates, llcDraft.managers.managerId)"
            value-key="value"
            label-key="label"
            searchable
            placeholder="选择经理（可选）"
            @update:search-term="
              (v: string) =>
                handleUserSearchList(llcDraft.managers.managerCandidates, v)
            "
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
                  @click.stop.prevent="llcDraft.managers.managerId = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
          <USelectMenu
            class="w-full"
            v-model="llcDraft.managers.deputyManagerId"
            v-model:search-term="llcDraft.managers.deputySearch"
            :items="buildUserItems(llcDraft.managers.deputyCandidates, llcDraft.managers.deputyManagerId)"
            value-key="value"
            label-key="label"
            searchable
            placeholder="选择副经理（可选）"
            @update:search-term="
              (v: string) =>
                handleUserSearchList(llcDraft.managers.deputyCandidates, v)
            "
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
                  @click.stop.prevent="llcDraft.managers.deputyManagerId = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- 11 法定代表人 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          11. 添加法定代表人信息（必须从董事或经理中选择）
        </p>
        <USelectMenu
          class="w-full"
          v-model="llcDraft.legalRepresentativeId"
          :items="legalRepresentativeOptions.map((id) => ({ value: id, label: userLabelCache[id] ?? id }))"
          value-key="value"
          label-key="label"
          placeholder="选择法定代表人"
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
                @click.stop.prevent="llcDraft.legalRepresentativeId = undefined"
              >
                ×
              </button>
              <span class="select-none text-slate-400">▾</span>
            </div>
          </template>
        </USelectMenu>
      </div>

      <!-- 12 监事 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            12. 添加监事信息（可不填；不得由董事/经理/副经理/财务负责人兼任）
          </p>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">{{
              llcDraft.supervisors.enabled ? '已启用' : '未填写'
            }}</span>
            <USwitch v-model="llcDraft.supervisors.enabled" />
          </div>
        </div>

        <div v-if="llcDraft.supervisors.enabled" class="space-y-3">
          <div class="flex justify-end">
            <UButton size="xs" color="neutral" variant="ghost" @click="addSupervisor">
              添加监事
            </UButton>
          </div>

          <div
            v-for="(s, idx) in llcDraft.supervisors.items"
            :key="idx"
            class="rounded-xl border border-slate-200/70 p-3 space-y-2"
          >
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold text-slate-700">监事 #{{ idx + 1 }}</p>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="llcDraft.supervisors.items.length <= 1"
                @click="removeSupervisor(idx)"
              >
                删除
              </UButton>
            </div>
            <USelectMenu
              class="w-full"
              v-model="s.userId"
              v-model:search-term="s.search"
              :items="buildUserItems(s.candidates, s.userId)"
              value-key="value"
              label-key="label"
              searchable
              placeholder="搜索用户"
              @update:search-term="(v: string) => handleUserSearchList(s.candidates, v)"
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
                    @click.stop.prevent="s.userId = undefined"
                  >
                    ×
                  </button>
                  <span class="select-none text-slate-400">▾</span>
                </div>
              </template>
            </USelectMenu>
            <p v-if="s.userId && forbiddenSupervisorIds.has(s.userId)" class="text-xs text-rose-600">
              该用户当前已担任董事/经理/副经理/财务负责人，不能兼任监事
            </p>
          </div>

          <USelectMenu
            v-if="llcDraft.supervisors.items.filter((x) => x.userId).length > 1"
            class="w-full"
            v-model="llcDraft.supervisors.chairpersonId"
            :items="
              llcDraft.supervisors.items
                .map((x) => x.userId)
                .filter(Boolean)
                .map((id) => ({ value: id as string, label: userLabelCache[id as string] ?? (id as string) }))
            "
            value-key="value"
            label-key="label"
            placeholder="选择监事会主席（可选）"
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
                  @click.stop.prevent="llcDraft.supervisors.chairpersonId = undefined"
                >
                  ×
                </button>
                <span class="select-none text-slate-400">▾</span>
              </div>
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- 13 财务负责人 -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          13. 添加财务负责人信息（可选，最多 1 人）
        </p>
        <USelectMenu
          class="w-full"
          v-model="llcDraft.financialOfficer.userId"
          v-model:search-term="llcDraft.financialOfficer.search"
          :items="buildUserItems(llcDraft.financialOfficer.candidates, llcDraft.financialOfficer.userId)"
          value-key="value"
          label-key="label"
          searchable
          placeholder="选择财务负责人（可选）"
          @update:search-term="
            (v: string) => handleUserSearchList(llcDraft.financialOfficer.candidates, v)
          "
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
                @click.stop.prevent="llcDraft.financialOfficer.userId = undefined"
              >
                ×
              </button>
              <span class="select-none text-slate-400">▾</span>
            </div>
          </template>
        </USelectMenu>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        :loading="submitting"
      >
        {{ props.submitLabel || '提交注册申请' }}
      </UButton>
    </div>
  </form>
</template>
