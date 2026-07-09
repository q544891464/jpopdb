<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

type Health = {
  status: 'ok' | 'degraded'
  dependencies: {
    database: { status: 'up' | 'down' }
    redis: { status: 'up' | 'down' }
  }
}

type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'partial_success'
type ScreeningStatus = 'accepted' | 'pending' | 'rejected'
type CandidateFilter =
  | 'all'
  | 'manual_artist'
  | 'needs_artist_review'
  | 'manual_artist_pending'
  | 'high_score_pending'
  | 'lyric_fallback'

type SyncJob = {
  id: string
  jobType: string
  sourceId: string | null
  status: JobStatus
  totalCount: number
  successCount: number
  failedCount: number
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

type EvidenceItem = {
  source?: string
  type?: string
  value?: unknown
  score?: number
}

type LyricFallback = {
  lyric_checked?: boolean
  skipped_reason?: string
  passed?: boolean
  kana_count?: number
  kana_ratio?: number
  language_guess?: string
  source?: string
  cached?: boolean
  raw_lrc?: never
  translated_lrc?: never
}

type ScreeningReason = {
  score?: number
  status?: ScreeningStatus
  summary?: string
  positive?: EvidenceItem[]
  negative?: EvidenceItem[]
  fallback?: LyricFallback
  external?: Record<string, unknown> & { skipped?: string[] }
  artist_identity?: Record<string, unknown> | null
  manual_review?: {
    status?: ScreeningStatus
    reviewer?: string
    reason?: string | null
    reviewedAt?: string
  }
  latest_auto_suggestion?: Record<string, unknown>
}

type CandidateArtistIdentity = {
  artistId: string
  artistName: string
  neteaseArtistId: string | null
  isJapanese: boolean | null
  country: string | null
  confidence: number | null
  status: ArtistIdentityStatus
  reviewedBy: string | null
  reviewedAt: string | null
}

type CandidateSong = {
  songId: string
  neteaseSongId: string
  songName: string
  artistNames: string[]
  artistIdentities: CandidateArtistIdentity[]
  albumName: string | null
  playlistNames: string[]
  score: number
  status: ScreeningStatus
  reason: ScreeningReason
  reviewedBy: string | null
  reviewedAt: string | null
  updatedAt: string
}

type ScreeningStats = {
  totalSongs: number
  acceptedSongs: number
  pendingSongs: number
  rejectedSongs: number
  unscreenedSongs: number
  manuallyReviewedSongs: number
  manualArtistSongs: number
  needsArtistReviewSongs: number
  manualArtistPendingSongs: number
  highScorePendingSongs: number
  lyricFallbackSongs: number
  confirmedArtists: number
  manualConfirmedArtists: number
  lastfmConfigured: boolean
}

type ArtistIdentityStatus =
  | 'confirmed_by_api'
  | 'confirmed_by_manual'
  | 'pending'
  | 'rejected'
  | 'unknown'

type ArtistIdentity = {
  artistId: string
  neteaseArtistId: string | null
  artistName: string
  songCount: number
  isJapanese: boolean | null
  country: string | null
  confidence: number | null
  status: ArtistIdentityStatus
  sourceSummary: unknown
  reviewedBy: string | null
  reviewedAt: string | null
  updatedAt: string | null
}

type ArtistIdentityReviewResult = ArtistIdentity & {
  rescreenJob?: SyncJob | null
  rescreenSongCount?: number
  importJob?: SyncJob | null
}

type ConfirmedArtistImportResult = {
  queuedCount: number
  maxSongsPerArtist: number
  jobs: SyncJob[]
}

type NeteaseSongSearchItem = {
  neteaseSongId: string
  songName: string
  artists: Array<{
    neteaseArtistId: string | null
    artistName: string
  }>
  album: {
    neteaseAlbumId: string | null
    albumName: string | null
    coverUrl: string | null
  }
  durationMs: number | null
}

type NeteaseArtistSearchItem = {
  neteaseArtistId: string
  artistName: string
  aliases: string[]
  coverUrl: string | null
}

type ManualSongImportResult = {
  songId: string
  neteaseSongId: string
  songName: string
  artistNames: string[]
  albumName: string | null
  tags: Array<{ group: string; value: string }>
}

type CatalogArtist = {
  artistId: string
  artistName: string
  neteaseArtistId: string | null
}

type CatalogSongTag = {
  source: string
  group: string
  name: string
}

type CatalogArtistListItem = CatalogArtist & {
  songCount: number
  albumCount: number
  latestPublishTime: string | null
  coverUrl: string | null
  updatedAt: string
}

type CatalogSong = {
  songId: string
  neteaseSongId: string
  songName: string
  aliases: string[]
  artists: CatalogArtist[]
  albumId: string | null
  albumName: string | null
  publishTime: string | null
  durationMs: number | null
  coverUrl: string | null
  neteaseUrl: string | null
  popularity: number | null
  redCount: number | null
  commentCount: number | null
  tags: CatalogSongTag[]
  statsUpdatedAt: string | null
  updatedAt: string
}

type CatalogSongQuality = {
  level: 'low' | 'medium' | 'high' | 'lossless' | 'hires'
  label: string
  bitrate: number | null
  size: number | null
  extension: string | null
}

type CatalogLyricSummary = {
  hasOriginal: boolean
  hasTranslation: boolean
  hasRomanization: boolean
  originalLineCount: number
  translatedLineCount: number
  romanizedLineCount: number
  kanaCount: number
  kanaRatio: number
  languageGuess: 'ja' | 'unknown'
  lyricContributor: string | null
  translationContributor: string | null
  lyricUpdatedAt: string | null
  translationUpdatedAt: string | null
}

type CatalogAlbumDetail = {
  neteaseAlbumId: string | null
  name: string | null
  type: string | null
  subType: string | null
  company: string | null
  publishTime: string | null
  size: number | null
  aliases: string[]
  tags: string[]
  description: string | null
  artistName: string | null
  coverUrl: string | null
}

type CatalogNeteaseDetail = {
  mainTitle: string | null
  additionalTitle: string | null
  disc: string | null
  trackNo: number | null
  mvId: string | null
  fee: number | null
  copyright: number | null
  availability: {
    playable: boolean | null
    message: string | null
  }
  qualities: CatalogSongQuality[]
  album: CatalogAlbumDetail | null
  lyric: CatalogLyricSummary | null
  wikiTags: Array<{ group: string; values: string[] }>
  fetchedAt: string
  availableSources: string[]
}

type CatalogSongDetail = CatalogSong & {
  neteaseDetail: CatalogNeteaseDetail | null
}

type CatalogSongList = {
  items: CatalogSong[]
  page: number
  limit: number
  total: number
  totalPages: number
}

type CatalogArtistDetail = CatalogArtistListItem & {
  songs: CatalogSongList
}

type CatalogAlbumPage = {
  albumId: string
  neteaseAlbumId: string | null
  albumName: string | null
  publishTime: string | null
  coverUrl: string | null
  songCount: number
  updatedAt: string
  artists: CatalogArtist[]
  songs: CatalogSongList
}

type CatalogViewMode = 'cards' | 'list'

const ADMIN_TOKEN_STORAGE_KEY = 'jpopdb.adminToken'

class AdminAuthError extends Error {
  constructor(message = '管理员令牌无效或已过期') {
    super(message)
    this.name = 'AdminAuthError'
  }
}

const health = ref<Health | null>(null)
const healthLoading = ref(true)
const healthError = ref('')
const adminToken = ref(sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '')
const adminTokenInput = ref('')
const adminAuthLoading = ref(false)
const adminAuthError = ref('')
const playlistId = ref('')
const importLoading = ref(false)
const importMessage = ref('')
const importError = ref('')
const screeningLoading = ref(false)
const screeningMessage = ref('')
const screeningError = ref('')
const screeningLimit = ref(50)
const manualSongKeyword = ref('')
const manualSongResults = ref<NeteaseSongSearchItem[]>([])
const manualSongSearchLoading = ref(false)
const manualSongImportingId = ref<string | null>(null)
const manualArtistKeyword = ref('')
const manualArtistResults = ref<NeteaseArtistSearchItem[]>([])
const manualArtistSearchLoading = ref(false)
const manualArtistImportingId = ref<string | null>(null)
const jobs = ref<SyncJob[]>([])
const jobsLoading = ref(true)
const stats = ref<ScreeningStats | null>(null)
const statsLoading = ref(true)
const statsError = ref('')
const candidates = ref<CandidateSong[]>([])
const candidatesLoading = ref(true)
const candidatesError = ref('')
const artistIdentities = ref<ArtistIdentity[]>([])
const artistIdentitiesLoading = ref(true)
const artistIdentitiesError = ref('')
const candidateStatus = ref<ScreeningStatus>('pending')
const candidateFilter = ref<CandidateFilter>('all')
const reviewingSongId = ref<string | null>(null)
const reviewingArtistId = ref<string | null>(null)
const importingArtistId = ref<string | null>(null)
const continuingImportJobId = ref<string | null>(null)
const bulkArtistImportLoading = ref(false)
const bulkTruncatedImportLoading = ref(false)
const rescreeningSongId = ref<string | null>(null)
const selectedCandidate = ref<CandidateSong | null>(null)
const catalogQuery = ref('')
const catalogArtist = ref('')
const catalogAlbum = ref('')
const catalogYearFrom = ref('')
const catalogYearTo = ref('')
const catalogDurationMin = ref('')
const catalogDurationMax = ref('')
const catalogPopularityMin = ref('')
const catalogRedCountMin = ref('')
const catalogCommentCountMin = ref('')
const catalogSort = ref('relevance')
const catalogViewMode = ref<CatalogViewMode>('cards')
const catalogSongs = ref<CatalogSong[]>([])
const catalogPage = ref(1)
const catalogTotal = ref(0)
const catalogTotalPages = ref(1)
const catalogLoading = ref(true)
const catalogError = ref('')
const selectedCatalogSong = ref<CatalogSongDetail | null>(null)
const selectedCatalogArtist = ref<CatalogArtistDetail | null>(null)
const selectedCatalogAlbum = ref<CatalogAlbumPage | null>(null)
const catalogDetailLoading = ref(false)
const currentPage = ref<'catalog' | 'admin'>(
  window.location.pathname.startsWith('/admin') ? 'admin' : 'catalog',
)
let pollingTimer: ReturnType<typeof setInterval> | undefined
let pollingTick = 0

const hasActiveJobs = computed(() =>
  jobs.value.some((job) => job.status === 'pending' || job.status === 'running'),
)
const hasActiveScreeningJob = computed(() =>
  jobs.value.some(
    (job) =>
      job.jobType === 'song_screening' && (job.status === 'pending' || job.status === 'running'),
  ),
)
const adminAuthenticated = computed(() => adminToken.value.length > 0)

const selectedPositive = computed(() => selectedCandidate.value?.reason?.positive ?? [])
const selectedNegative = computed(() => selectedCandidate.value?.reason?.negative ?? [])
const selectedSkipped = computed(() => selectedCandidate.value?.reason?.external?.skipped ?? [])
const selectedArtistIdentities = computed(() => selectedCandidate.value?.artistIdentities ?? [])
const selectedLyricFallback = computed(() => selectedCandidate.value?.reason?.fallback)
const selectedIsUnscreened = computed(() =>
  selectedCandidate.value ? isUnscreenedCandidate(selectedCandidate.value) : false,
)

async function readError(response: Response): Promise<string> {
  if (response.status === 429) {
    return '请求过于频繁，请稍等几秒后重试。'
  }
  try {
    const payload = (await response.json()) as { message?: unknown }
    if (typeof payload.message === 'string') return payload.message
  } catch {
    // Use the HTTP fallback below.
  }
  return `请求失败 HTTP ${response.status}`
}

function clearAdminToken(message?: string): void {
  sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  adminToken.value = ''
  if (message) adminAuthError.value = message
  stopAdminPolling()
}

function isAdminAuthError(error: unknown): error is AdminAuthError {
  return error instanceof AdminAuthError
}

async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = adminToken.value.trim()
  if (!token) {
    throw new AdminAuthError('请输入管理员令牌后再访问审核控制台。')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401) {
    clearAdminToken('管理员令牌无效或已过期，请重新登录。')
    throw new AdminAuthError()
  }
  return response
}

async function loginAdmin(): Promise<void> {
  const value = adminTokenInput.value.trim()
  adminAuthError.value = ''
  if (!value) {
    adminAuthError.value = '请输入管理员令牌。'
    return
  }
  adminAuthLoading.value = true
  adminToken.value = value
  try {
    const response = await adminFetch('/api/admin/auth/check')
    if (!response.ok) throw new Error(await readError(response))
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, value)
    adminTokenInput.value = ''
    await loadAdminData()
  } catch (error) {
    clearAdminToken(error instanceof Error ? error.message : '管理员登录失败')
  } finally {
    adminAuthLoading.value = false
  }
}

function logoutAdmin(): void {
  clearAdminToken()
  adminTokenInput.value = ''
}

async function refreshHealth(): Promise<void> {
  healthLoading.value = true
  healthError.value = ''
  try {
    const response = await fetch('/health')
    const payload = (await response.json()) as Health | { message?: Health }
    const nextHealth = 'status' in payload ? payload : payload.message
    if (!nextHealth) throw new Error('健康检查响应格式无效')
    health.value = nextHealth
    if (!response.ok) throw new Error('基础服务尚未全部就绪')
  } catch (error) {
    healthError.value = error instanceof Error ? error.message : '健康检查失败'
  } finally {
    healthLoading.value = false
  }
}

async function loadJobs(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) jobsLoading.value = true
  try {
    const response = await adminFetch('/api/admin/jobs')
    if (!response.ok) throw new Error(await readError(response))
    jobs.value = (await response.json()) as SyncJob[]
  } finally {
    jobsLoading.value = false
  }
}

async function loadStats(options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) statsLoading.value = true
    statsError.value = ''
  try {
    const response = await adminFetch('/api/admin/screening/stats')
    if (!response.ok) throw new Error(await readError(response))
    stats.value = (await response.json()) as ScreeningStats
  } catch (error) {
    statsError.value = error instanceof Error ? error.message : '筛选统计加载失败'
  } finally {
    statsLoading.value = false
  }
}

async function loadCandidates(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    candidatesLoading.value = true
    candidatesError.value = ''
  }
  try {
    const params = new URLSearchParams({
      status: candidateStatus.value,
      filter: candidateFilter.value,
      limit: '30',
    })
    const response = await adminFetch(`/api/admin/screening/candidates?${params.toString()}`)
    if (!response.ok) throw new Error(await readError(response))
    const payload = (await response.json()) as { items: CandidateSong[] }
    candidates.value = payload.items
    if (selectedCandidate.value) {
      selectedCandidate.value =
        payload.items.find((song) => song.songId === selectedCandidate.value?.songId) ?? selectedCandidate.value
    }
  } catch (error) {
    if (!options.silent) {
      candidatesError.value = error instanceof Error ? error.message : '候选列表加载失败'
    }
  } finally {
    if (!options.silent) candidatesLoading.value = false
  }
}

async function loadArtistIdentities(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    artistIdentitiesLoading.value = true
    artistIdentitiesError.value = ''
  }
  try {
    const response = await adminFetch('/api/admin/artists/identity?limit=24')
    if (!response.ok) throw new Error(await readError(response))
    const payload = (await response.json()) as { items: ArtistIdentity[] }
    artistIdentities.value = payload.items
  } catch (error) {
    if (!options.silent) {
      artistIdentitiesError.value = error instanceof Error ? error.message : '艺人身份列表加载失败'
    }
  } finally {
    if (!options.silent) artistIdentitiesLoading.value = false
  }
}

async function loadCatalogSongs(page = catalogPage.value): Promise<void> {
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: '12',
    })
    const query = catalogQuery.value.trim()
    if (query) params.set('q', query)
    setCatalogParam(params, 'artist', catalogArtist.value)
    setCatalogParam(params, 'album', catalogAlbum.value)
    setCatalogParam(params, 'yearFrom', catalogYearFrom.value)
    setCatalogParam(params, 'yearTo', catalogYearTo.value)
    setCatalogParam(params, 'durationMin', catalogDurationMin.value)
    setCatalogParam(params, 'durationMax', catalogDurationMax.value)
    setCatalogParam(params, 'popularityMin', catalogPopularityMin.value)
    setCatalogParam(params, 'redCountMin', catalogRedCountMin.value)
    setCatalogParam(params, 'commentCountMin', catalogCommentCountMin.value)
    params.set('sort', catalogSort.value)
    const response = await fetch(`/api/catalog/songs?${params.toString()}`)
    if (!response.ok) throw new Error(await readError(response))
    const payload = (await response.json()) as CatalogSongList
    catalogSongs.value = payload.items
    catalogPage.value = payload.page
    catalogTotal.value = payload.total
    catalogTotalPages.value = payload.totalPages
  } catch (error) {
    catalogError.value = error instanceof Error ? error.message : '数据库查询失败'
  } finally {
    catalogLoading.value = false
  }
}

function setCatalogParam(params: URLSearchParams, name: string, value: string): void {
  const normalized = value.trim()
  if (normalized) params.set(name, normalized)
}

function createScrollRestorer(): () => void {
  const left = window.scrollX
  const top = window.scrollY
  return () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          window.scrollTo({ left, top, behavior: 'auto' })
        } catch {
          // Some test/browser environments do not implement scrollTo.
        }
      })
    })
  }
}

async function searchCatalog(): Promise<void> {
  selectedCatalogSong.value = null
  selectedCatalogArtist.value = null
  selectedCatalogAlbum.value = null
  restoreCatalogRootPath()
  await loadCatalogSongs(1)
}

function clearCatalogFilters(): void {
  catalogQuery.value = ''
  catalogArtist.value = ''
  catalogAlbum.value = ''
  catalogYearFrom.value = ''
  catalogYearTo.value = ''
  catalogDurationMin.value = ''
  catalogDurationMax.value = ''
  catalogPopularityMin.value = ''
  catalogRedCountMin.value = ''
  catalogCommentCountMin.value = ''
  catalogSort.value = 'relevance'
  void searchCatalog()
}

async function openCatalogSong(song: CatalogSong): Promise<void> {
  await openCatalogSongById(song.songId, true)
}

async function openCatalogSongById(songId: string, updateUrl = false): Promise<void> {
  if (updateUrl) pushCatalogDetailPath(`/songs/${songId}`)
  selectedCatalogSong.value = null
  selectedCatalogArtist.value = null
  selectedCatalogAlbum.value = null
  catalogDetailLoading.value = true
  catalogError.value = ''
  try {
    const response = await fetch(`/api/catalog/songs/${songId}`)
    if (!response.ok) throw new Error(await readError(response))
    selectedCatalogSong.value = (await response.json()) as CatalogSongDetail
  } catch (error) {
    catalogError.value = error instanceof Error ? error.message : '歌曲详情加载失败'
  } finally {
    catalogDetailLoading.value = false
  }
}

function closeCatalogSong(): void {
  selectedCatalogSong.value = null
  catalogDetailLoading.value = false
  restoreCatalogRootPath()
}

async function openCatalogArtist(artist: CatalogArtist): Promise<void> {
  await openCatalogArtistById(artist.artistId, true)
}

async function openCatalogArtistById(artistId: string, updateUrl = false): Promise<void> {
  if (updateUrl) pushCatalogDetailPath(`/artists/${artistId}`)
  selectedCatalogSong.value = null
  selectedCatalogArtist.value = null
  selectedCatalogAlbum.value = null
  catalogDetailLoading.value = true
  catalogError.value = ''
  try {
    const response = await fetch(`/api/catalog/artists/${artistId}?limit=12`)
    if (!response.ok) throw new Error(await readError(response))
    selectedCatalogArtist.value = (await response.json()) as CatalogArtistDetail
  } catch (error) {
    catalogError.value = error instanceof Error ? error.message : '艺人详情加载失败'
  } finally {
    catalogDetailLoading.value = false
  }
}

function closeCatalogArtist(): void {
  selectedCatalogArtist.value = null
  catalogDetailLoading.value = false
  restoreCatalogRootPath()
}

async function openCatalogAlbumById(albumId: string, updateUrl = false): Promise<void> {
  if (updateUrl) pushCatalogDetailPath(`/albums/${albumId}`)
  selectedCatalogSong.value = null
  selectedCatalogArtist.value = null
  selectedCatalogAlbum.value = null
  catalogDetailLoading.value = true
  catalogError.value = ''
  try {
    const response = await fetch(`/api/catalog/albums/${albumId}?limit=12`)
    if (!response.ok) throw new Error(await readError(response))
    selectedCatalogAlbum.value = (await response.json()) as CatalogAlbumPage
  } catch (error) {
    catalogError.value = error instanceof Error ? error.message : '专辑详情加载失败'
  } finally {
    catalogDetailLoading.value = false
  }
}

function openCatalogAlbum(song: CatalogSong): void {
  if (song.albumId) void openCatalogAlbumById(song.albumId, true)
}

function closeCatalogAlbum(): void {
  selectedCatalogAlbum.value = null
  catalogDetailLoading.value = false
  restoreCatalogRootPath()
}

function closeCatalogDetail(): void {
  selectedCatalogSong.value = null
  selectedCatalogArtist.value = null
  selectedCatalogAlbum.value = null
  catalogDetailLoading.value = false
  restoreCatalogRootPath()
}

function pushCatalogDetailPath(path: string): void {
  if (window.location.pathname !== path) window.history.pushState({}, '', path)
  currentPage.value = 'catalog'
}

function restoreCatalogRootPath(): void {
  if (/^\/(?:songs|artists|albums)\/\d+\/?$/u.test(window.location.pathname)) {
    window.history.pushState({}, '', '/')
  }
}

async function startImport(): Promise<void> {
  const value = playlistId.value.trim()
  importMessage.value = ''
  importError.value = ''
  if (!value) {
    importError.value = '请输入网易云歌单 ID 或分享链接。'
    return
  }
  importLoading.value = true
  try {
    const response = await adminFetch('/api/admin/import/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId: value }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const job = (await response.json()) as SyncJob
    importMessage.value = `导入任务 #${job.id} 已创建。`
    playlistId.value = ''
    await Promise.all([loadJobs({ silent: true }), loadStats({ silent: true })])
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '创建导入任务失败'
  } finally {
    importLoading.value = false
  }
}

async function searchManualSongs(): Promise<void> {
  const keyword = manualSongKeyword.value.trim()
  importMessage.value = ''
  importError.value = ''
  if (!keyword) {
    importError.value = '请输入歌曲名后再搜索。'
    return
  }
  manualSongSearchLoading.value = true
  try {
    const params = new URLSearchParams({ q: keyword, limit: '8' })
    const response = await adminFetch(`/api/admin/import/search/songs?${params.toString()}`)
    if (!response.ok) throw new Error(await readError(response))
    const payload = (await response.json()) as { items: NeteaseSongSearchItem[] }
    manualSongResults.value = payload.items
    if (payload.items.length === 0) importError.value = '没有搜索到匹配歌曲，请换一个关键词。'
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '搜索歌曲失败'
  } finally {
    manualSongSearchLoading.value = false
  }
}

async function importManualSong(song: NeteaseSongSearchItem): Promise<void> {
  manualSongImportingId.value = song.neteaseSongId
  importMessage.value = ''
  importError.value = ''
  try {
    const response = await adminFetch('/api/admin/import/song/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neteaseSongId: song.neteaseSongId }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const result = (await response.json()) as ManualSongImportResult
    importMessage.value = `已添加单曲《${result.songName}》到候选库，保存 ${result.tags.length} 个网易云百科标签。`
    manualSongKeyword.value = ''
    manualSongResults.value = []
    await Promise.all([loadCandidates({ silent: true }), loadStats({ silent: true })])
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '手动添加单曲失败'
  } finally {
    manualSongImportingId.value = null
  }
}

async function startScreening(limit = screeningLimit.value): Promise<void> {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50)
  screeningLimit.value = normalizedLimit
  screeningMessage.value = ''
  screeningError.value = ''
  screeningLoading.value = true
  try {
    const response = await adminFetch('/api/admin/screening/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending', limit: normalizedLimit }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const job = (await response.json()) as SyncJob
    screeningMessage.value = `初筛任务 #${job.id} 已创建，本次最多处理 ${normalizedLimit} 首 pending 歌曲。`
    await Promise.all([loadJobs({ silent: true }), loadStats({ silent: true })])
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '创建初筛任务失败'
  } finally {
    screeningLoading.value = false
  }
}

async function reviewSong(song: CandidateSong, status: ScreeningStatus): Promise<void> {
  const restoreScroll = createScrollRestorer()
  reviewingSongId.value = song.songId
  try {
    const response = await adminFetch(`/api/admin/screening/songs/${song.songId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewer: 'admin', reason: 'manual review from admin UI' }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const reviewed = (await response.json()) as CandidateSong
    selectedCandidate.value = reviewed
    await Promise.all([loadCandidates({ silent: true }), loadStats({ silent: true })])
  } finally {
    reviewingSongId.value = null
    restoreScroll()
  }
}

async function rescreenSong(song: CandidateSong): Promise<void> {
  rescreeningSongId.value = song.songId
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch(`/api/admin/screening/songs/${song.songId}/rescreen`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(await readError(response))
    const job = (await response.json()) as SyncJob
    screeningMessage.value = `单曲重筛任务 #${job.id} 已创建：${song.songName}`
    await Promise.all([loadJobs({ silent: true }), loadStats({ silent: true })])
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '创建单曲重筛任务失败'
  } finally {
    rescreeningSongId.value = null
  }
}

async function reviewArtistIdentity(artist: ArtistIdentity, isJapanese: boolean): Promise<void> {
  const restoreScroll = createScrollRestorer()
  reviewingArtistId.value = artist.artistId
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch(`/api/admin/artists/${artist.artistId}/identity/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isJapanese,
        reviewer: 'admin',
        reason: isJapanese ? 'manual confirm Japanese artist' : 'manual reject non-Japanese artist',
        rescreenSongs: true,
      }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const result = (await response.json()) as ArtistIdentityReviewResult
    screeningMessage.value = artistRescreenMessage(result)
    await Promise.all([
      loadArtistIdentities({ silent: true }),
      loadJobs({ silent: true }),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '确认艺人身份失败'
  } finally {
    reviewingArtistId.value = null
    restoreScroll()
  }
}

async function reviewCandidateArtistIdentity(artist: CandidateArtistIdentity, isJapanese: boolean): Promise<void> {
  const restoreScroll = createScrollRestorer()
  reviewingArtistId.value = artist.artistId
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch(`/api/admin/artists/${artist.artistId}/identity/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isJapanese,
        reviewer: 'admin',
        reason: isJapanese
          ? 'manual confirm Japanese artist from candidate detail'
          : 'manual reject non-Japanese artist from candidate detail',
        rescreenSongs: true,
      }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const result = (await response.json()) as ArtistIdentityReviewResult
    screeningMessage.value = artistRescreenMessage(result)
    await Promise.all([
      loadCandidates({ silent: true }),
      loadArtistIdentities({ silent: true }),
      loadJobs({ silent: true }),
      loadStats({ silent: true }),
    ])
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '确认艺人身份失败'
  } finally {
    reviewingArtistId.value = null
    restoreScroll()
  }
}

async function importArtistSongs(artist: ArtistIdentity): Promise<void> {
  const restoreScroll = createScrollRestorer()
  importingArtistId.value = artist.artistId
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch(`/api/admin/import/artist/${artist.artistId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxSongs: 500 }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const job = (await response.json()) as SyncJob
    screeningMessage.value = `已创建 ${artist.artistName} 的歌曲导入任务 #${job.id}，本次最多导入 500 首；任务完成后歌曲才会出现在数据库。`
    await loadJobs({ silent: true })
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '创建艺人歌曲导入任务失败'
  } finally {
    importingArtistId.value = null
    restoreScroll()
  }
}

async function importConfirmedArtists(): Promise<void> {
  const restoreScroll = createScrollRestorer()
  bulkArtistImportLoading.value = true
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch('/api/admin/import/artists/confirmed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxArtists: 10, maxSongsPerArtist: 500 }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const result = (await response.json()) as ConfirmedArtistImportResult
    screeningMessage.value = result.queuedCount > 0
      ? `已为 ${result.queuedCount} 位确认艺人创建歌曲导入任务，每位最多 ${result.maxSongsPerArtist} 首；请等待后台任务完成后再查询。`
      : '没有可创建导入任务的已确认艺人。'
    await loadJobs({ silent: true })
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '批量创建艺人歌曲导入任务失败'
  } finally {
    bulkArtistImportLoading.value = false
    restoreScroll()
  }
}

async function searchManualArtists(): Promise<void> {
  screeningMessage.value = ''
  screeningError.value = ''
  const keyword = manualArtistKeyword.value.trim()
  if (!keyword) {
    screeningError.value = '请输入艺人名后再搜索。'
    return
  }
  manualArtistSearchLoading.value = true
  try {
    const params = new URLSearchParams({ q: keyword, limit: '8' })
    const response = await adminFetch(`/api/admin/import/search/artists?${params.toString()}`)
    if (!response.ok) throw new Error(await readError(response))
    const payload = (await response.json()) as { items: NeteaseArtistSearchItem[] }
    manualArtistResults.value = payload.items
    if (payload.items.length === 0) screeningError.value = '没有搜索到匹配艺人，请换一个关键词。'
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '搜索艺人失败'
  } finally {
    manualArtistSearchLoading.value = false
  }
}

async function importManualArtistSongs(artist: NeteaseArtistSearchItem): Promise<void> {
  screeningMessage.value = ''
  screeningError.value = ''
  manualArtistImportingId.value = artist.neteaseArtistId
  try {
    const response = await adminFetch('/api/admin/import/artist/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        neteaseArtistId: artist.neteaseArtistId,
        artistName: artist.artistName,
        maxSongs: 500,
      }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const job = (await response.json()) as SyncJob
    screeningMessage.value = `已添加网易云艺人 ${artist.artistName}，并创建歌曲导入任务 #${job.id}。`
    manualArtistKeyword.value = ''
    manualArtistResults.value = []
    await Promise.all([loadJobs({ silent: true }), loadArtistIdentities({ silent: true })])
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '手动添加艺人失败'
  } finally {
    manualArtistImportingId.value = null
  }
}

async function continueTruncatedArtistImports(): Promise<void> {
  const restoreScroll = createScrollRestorer()
  bulkTruncatedImportLoading.value = true
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch('/api/admin/import/artists/truncated/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxArtists: 10, maxSongsPerArtist: 500 }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const result = (await response.json()) as ConfirmedArtistImportResult
    screeningMessage.value = result.queuedCount > 0
      ? `已为 ${result.queuedCount} 个已截断艺人创建后续导入任务，每个任务继续导入后续 ${result.maxSongsPerArtist} 首。`
      : '没有找到可继续导入的截断艺人任务。'
    await loadJobs({ silent: true })
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '批量继续截断导入失败'
  } finally {
    bulkTruncatedImportLoading.value = false
    restoreScroll()
  }
}

async function continueArtistImport(job: SyncJob): Promise<void> {
  const artistId = artistIdFromJob(job)
  if (!artistId) {
    screeningError.value = '无法从任务来源解析艺人 ID，不能继续导入。'
    return
  }
  const restoreScroll = createScrollRestorer()
  continuingImportJobId.value = job.id
  screeningMessage.value = ''
  screeningError.value = ''
  try {
    const response = await adminFetch(`/api/admin/import/artist/${artistId}/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxSongs: jobMetadataNumber(job, 'maxSongs') ?? 500 }),
    })
    if (!response.ok) throw new Error(await readError(response))
    const nextJob = (await response.json()) as SyncJob
    const offset = jobMetadataNumber(nextJob, 'offset')
    screeningMessage.value = `已创建后续艺人歌曲导入任务 #${nextJob.id}${offset === null ? '' : `，从第 ${offset + 1} 首开始`}。`
    await loadJobs({ silent: true })
  } catch (error) {
    screeningError.value = error instanceof Error ? error.message : '继续导入艺人歌曲失败'
  } finally {
    continuingImportJobId.value = null
    restoreScroll()
  }
}

function setCandidateStatus(status: ScreeningStatus): void {
  candidateStatus.value = status
  void loadCandidates()
}

function setCandidateFilter(filter: CandidateFilter): void {
  candidateFilter.value = filter
  void loadCandidates()
}

function openCandidate(song: CandidateSong): void {
  selectedCandidate.value = song
}

function closeCandidate(): void {
  selectedCandidate.value = null
}

function jobProgress(job: SyncJob): number {
  if (job.totalCount === 0) return job.status === 'success' ? 100 : 0
  return Math.round(((job.successCount + job.failedCount) / job.totalCount) * 100)
}

function jobProgressText(job: SyncJob): string {
  if (job.status === 'pending' && job.totalCount === 0) {
    return '排队中，等待后台 worker 接手'
  }
  if (job.status === 'running' && job.totalCount === 0) {
    return '正在读取网易云列表，稍后显示总数'
  }
  return `${job.successCount} 成功 · ${job.failedCount} 失败 · ${job.totalCount} 总数`
}

function jobMetadataNumber(job: SyncJob, field: string): number | null {
  const value = job.metadata?.[field]
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function jobMetadataBoolean(job: SyncJob, field: string): boolean {
  return job.metadata?.[field] === true
}

function artistIdFromJob(job: SyncJob): string | null {
  const match = job.sourceId?.match(/^artist:(\d+):netease:\d+$/u)
  return match?.[1] ?? null
}

function artistImportContinuationText(job: SyncJob): string {
  const offset = jobMetadataNumber(job, 'offset')
  const maxSongs = jobMetadataNumber(job, 'maxSongs')
  const totalAvailable = jobMetadataNumber(job, 'totalAvailable')
  const nextOffset = jobMetadataNumber(job, 'nextOffset')
  const importedSongCount = jobMetadataNumber(job, 'importedSongCount')
  const parts = [
    offset === null ? null : `本段从第 ${offset + 1} 首开始`,
    maxSongs === null ? null : `安全上限 ${maxSongs} 首`,
    importedSongCount === null ? null : `实际写入 ${importedSongCount} 首`,
    totalAvailable === null ? null : `网易云共 ${totalAvailable} 首`,
    nextOffset === null ? null : `下段 offset ${nextOffset}`,
  ].filter((item): item is string => item !== null)
  return parts.join(' · ')
}

function canContinueArtistJob(job: SyncJob): boolean {
  return job.jobType === 'artist_song_import' &&
    job.status !== 'pending' &&
    job.status !== 'running' &&
    jobMetadataBoolean(job, 'truncated') &&
    artistIdFromJob(job) !== null
}

function jobStatusText(status: JobStatus): string {
  return {
    pending: '等待处理',
    running: '处理中',
    success: '成功',
    failed: '失败',
    partial_success: '部分成功',
  }[status]
}

function screeningStatusText(status: ScreeningStatus): string {
  return {
    accepted: '已通过',
    pending: '待审核',
    rejected: '已拒绝',
  }[status]
}

function isUnscreenedCandidate(song: CandidateSong): boolean {
  return (
    song.status === 'pending' &&
    song.score === 0 &&
    song.reviewedAt === null &&
    (
      song.reason?.summary === '已从网易云歌单导入，等待外部 API 初筛。' ||
      song.reason?.summary === '手动添加网易云单曲，等待外部 API 初筛。'
    )
  )
}

function scoreText(song: CandidateSong): string {
  return isUnscreenedCandidate(song) ? '未初筛' : `score ${song.score}`
}

function scoreTagType(song: CandidateSong): 'success' | 'warning' | 'danger' | 'info' {
  if (isUnscreenedCandidate(song)) return 'warning'
  if (song.score >= 80) return 'success'
  if (song.score >= 50) return 'warning'
  if (song.status === 'rejected') return 'danger'
  return 'info'
}

function catalogArtistNames(song: CatalogSong): string {
  return song.artists.map((artist) => artist.artistName).join(' / ') || '未知歌手'
}

function songSearchArtistNames(song: NeteaseSongSearchItem): string {
  return song.artists.map((artist) => artist.artistName).join(' / ') || '未知歌手'
}

function catalogTags(song: CatalogSong): CatalogSongTag[] {
  return Array.isArray(song.tags) ? song.tags : []
}

function catalogCoverStyle(song: CatalogSong): Record<string, string> {
  return song.coverUrl ? { backgroundImage: `url("${song.coverUrl}")` } : {}
}

function formatDuration(value: number | null): string {
  if (!value) return '未知时长'
  const totalSeconds = Math.round(value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function formatCompactNumber(value: number | null): string {
  if (value === null) return '暂无'
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatFileSize(value: number | null): string {
  if (!value) return '未知大小'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function formatBitrate(value: number | null): string {
  if (!value) return '未知码率'
  return `${Math.round(value / 1000)} kbps`
}

function formatCatalogDate(value: string | null): string {
  if (!value) return '发行时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function availabilityText(detail: CatalogNeteaseDetail | null | undefined): string {
  const availability = detail?.availability
  if (!availability || availability.playable === null) return '未知'
  return availability.playable ? '网易云标记可用' : availability.message || '网易云标记不可用'
}

function sourceText(detail: CatalogNeteaseDetail | null | undefined): string {
  if (!detail?.availableSources.length) return '暂无实时来源'
  return detail.availableSources.join(' / ')
}

function lastfmConfigText(): string {
  if (statsLoading.value) return '检查中'
  return stats.value?.lastfmConfigured ? '已配置' : '未配置'
}

function candidateFilterText(filter: CandidateFilter): string {
  return {
    all: '全部',
    manual_artist: '含人工艺人身份',
    needs_artist_review: '需要确认艺人',
    manual_artist_pending: '艺人已确认但歌曲待审',
    high_score_pending: '高分待审',
    lyric_fallback: '歌词兜底命中',
  }[filter]
}

function artistStatusText(status: ArtistIdentityStatus): string {
  return {
    confirmed_by_api: 'API 已确认',
    confirmed_by_manual: '人工已确认',
    pending: '待确认',
    rejected: '非日本艺人',
    unknown: '未知',
  }[status]
}

function artistRescreenMessage(result: ArtistIdentityReviewResult): string {
  const importText = result.importJob
    ? ` 已自动创建歌曲导入任务 #${result.importJob.id}，最多导入 500 首；任务完成后歌曲才会出现在数据库。`
    : ''
  const songCount = result.rescreenSongCount ?? 0
  if (result.rescreenJob && songCount > 0) {
    return `艺人身份已确认，并已创建关联歌曲重筛任务 #${result.rescreenJob.id}，覆盖 ${songCount} 首未人工审核歌曲。${importText}`
  }
  return `艺人身份已确认；没有需要重筛的未人工审核关联歌曲。${importText}`
}

function canImportArtist(artist: ArtistIdentity): boolean {
  return Boolean(
    artist.neteaseArtistId &&
    artist.isJapanese === true &&
    (artist.status === 'confirmed_by_api' || artist.status === 'confirmed_by_manual'),
  )
}

function jobTypeText(jobType: string): string {
  if (jobType === 'artist_song_import') return '艺人歌曲导入'
  if (jobType === 'playlist_import') return '歌单导入'
  if (jobType === 'song_screening') return '歌曲初筛'
  return jobType
}

function artistTagType(status: ArtistIdentityStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'confirmed_by_api' || status === 'confirmed_by_manual') return 'success'
  if (status === 'rejected') return 'danger'
  if (status === 'pending') return 'warning'
  return 'info'
}

function tagType(status: JobStatus | ScreeningStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'success' || status === 'accepted') return 'success'
  if (status === 'failed' || status === 'rejected') return 'danger'
  if (status === 'pending') return 'info'
  return 'warning'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function evidenceLabel(item: EvidenceItem): string {
  return [item.source, item.type].filter(Boolean).join(' / ') || '未知证据'
}

function evidenceValue(value: unknown): string {
  if (value === undefined || value === null) return '无'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function lyricFallbackState(fallback: LyricFallback | undefined): string {
  if (!fallback) return '暂无歌词兜底记录'
  if (fallback.lyric_checked === false) return fallback.skipped_reason ? `未检查：${fallback.skipped_reason}` : '未检查歌词'
  if (fallback.passed === true) return '歌词兜底命中'
  if (fallback.passed === false) return fallback.skipped_reason ? `未命中：${fallback.skipped_reason}` : '已检查，未命中'
  return fallback.lyric_checked ? '已检查歌词' : '暂无歌词兜底记录'
}

function lyricFallbackTagType(fallback: LyricFallback | undefined): 'success' | 'warning' | 'info' {
  if (fallback?.passed === true) return 'success'
  if (fallback?.lyric_checked) return 'warning'
  return 'info'
}

function formatRatio(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  return `${Math.round(value * 1000) / 10}%`
}

function prettyJson(value: unknown): string {
  return JSON.stringify(redactLyrics(value), null, 2)
}

function redactLyrics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactLyrics(item))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      key === 'raw_lrc' || key === 'translated_lrc' ? '[redacted lyric text]' : redactLyrics(entry),
    ]),
  )
}

function stopAdminPolling(): void {
  if (!pollingTimer) return
  clearInterval(pollingTimer)
  pollingTimer = undefined
  pollingTick = 0
}

function startAdminPolling(): void {
  stopAdminPolling()
  if (!adminAuthenticated.value) return
  pollingTimer = setInterval(() => {
    if (!adminAuthenticated.value) {
      stopAdminPolling()
      return
    }
    if (hasActiveJobs.value) {
      pollingTick += 1
      void loadJobs({ silent: true }).catch(ignoreAdminPollingError)
      void loadStats({ silent: true }).catch(ignoreAdminPollingError)
      if (pollingTick % 3 === 0) {
        void loadCandidates({ silent: true }).catch(ignoreAdminPollingError)
      }
    }
  }, 8_000)
}

function ignoreAdminPollingError(error: unknown): void {
  if (isAdminAuthError(error)) return
  if (error instanceof Error && (error.message.includes('429') || error.message.includes('请求过于频繁'))) return
}

async function loadAdminData(): Promise<void> {
  await refreshHealth()
  if (!adminAuthenticated.value) {
    jobsLoading.value = false
    statsLoading.value = false
    candidatesLoading.value = false
    artistIdentitiesLoading.value = false
    stopAdminPolling()
    return
  }

  try {
    await Promise.all([
      loadJobs(),
      loadStats(),
      loadCandidates(),
      loadArtistIdentities(),
    ])
    startAdminPolling()
  } catch (error) {
    stopAdminPolling()
    if (!isAdminAuthError(error)) {
      adminAuthError.value = error instanceof Error ? error.message : '审核控制台加载失败'
    }
  }
}

function loadPage(page: 'catalog' | 'admin'): void {
  if (page === 'catalog') {
    stopAdminPolling()
    void loadCatalogSongs()
    return
  }
  void loadAdminData()
}

function syncPageFromLocation(): void {
  const path = window.location.pathname
  const page = path.startsWith('/admin') ? 'admin' : 'catalog'
  currentPage.value = page
  if (page === 'admin') {
    loadPage(page)
    return
  }
  void loadCatalogSongs()
  const songMatch = path.match(/^\/songs\/(\d+)\/?$/u)
  const artistMatch = path.match(/^\/artists\/(\d+)\/?$/u)
  const albumMatch = path.match(/^\/albums\/(\d+)\/?$/u)
  if (songMatch?.[1]) void openCatalogSongById(songMatch[1])
  else if (artistMatch?.[1]) void openCatalogArtistById(artistMatch[1])
  else if (albumMatch?.[1]) void openCatalogAlbumById(albumMatch[1])
  else {
    selectedCatalogSong.value = null
    selectedCatalogArtist.value = null
    selectedCatalogAlbum.value = null
  }
}

function navigateTo(page: 'catalog' | 'admin'): void {
  const path = page === 'admin' ? '/admin' : '/'
  if (window.location.pathname !== path) window.history.pushState({}, '', path)
  currentPage.value = page
  selectedCandidate.value = null
  selectedCatalogSong.value = null
  selectedCatalogArtist.value = null
  selectedCatalogAlbum.value = null
  loadPage(page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('popstate', syncPageFromLocation)
  syncPageFromLocation()
})

onUnmounted(() => {
  window.removeEventListener('popstate', syncPageFromLocation)
  stopAdminPolling()
})
</script>

<template>
  <main class="shell">
    <header class="site-header">
      <button class="brand-button" type="button" aria-label="前往日音数据库首页" @click="navigateTo('catalog')">
        <span class="brand-mark">J</span>
        <span>
          <strong>JpopDB</strong>
          <small>Japanese Music Database</small>
        </span>
      </button>
      <nav class="site-nav" aria-label="主导航">
        <button
          type="button"
          :class="{ active: currentPage === 'catalog' }"
          :aria-current="currentPage === 'catalog' ? 'page' : undefined"
          @click="navigateTo('catalog')"
        >
          数据库查询
        </button>
        <button
          type="button"
          :class="{ active: currentPage === 'admin' }"
          :aria-current="currentPage === 'admin' ? 'page' : undefined"
          @click="navigateTo('admin')"
        >
          审核控制台
        </button>
      </nav>
    </header>

    <section v-if="currentPage === 'admin'" class="hero admin-hero">
      <div>
        <p class="eyebrow">J-MUSIC SCREENING WORKSPACE</p>
        <h1>日音候选库后台</h1>
        <p class="subtitle">
          从网易云导入候选歌曲，用 MusicBrainz、Wikidata、Last.fm 生成初筛证据，再由人工审核修正低置信度结果。
        </p>
      </div>
      <div class="hero-actions">
        <el-button :loading="healthLoading" round @click="refreshHealth">刷新服务状态</el-button>
        <el-button v-if="adminAuthenticated" round @click="logoutAdmin">退出后台</el-button>
      </div>
    </section>

    <section v-if="currentPage === 'catalog'" class="public-hero">
      <div>
        <p class="eyebrow">CURATED JAPANESE MUSIC</p>
        <h1>发现值得被听见的日音资料</h1>
        <p class="subtitle">
          浏览歌曲、艺人、专辑与网易云热度数据。这里是一座日音资料库，不是播放器。
        </p>
      </div>
      <div class="public-hero-note">
        <span>{{ catalogLoading ? '正在读取' : `${catalogTotal} 首` }}</span>
        <p>当前可查询的可信歌曲记录</p>
      </div>
    </section>

    <section v-if="currentPage === 'catalog'" class="catalog-section" aria-label="公开日音数据库查询">
      <div class="catalog-command-center">
        <div class="catalog-copy">
          <p class="eyebrow">PUBLIC CATALOG</p>
          <h2>搜索数据库</h2>
          <p class="panel-copy">
            按歌曲名、艺人、专辑或网易云 ID 检索，查看发行信息、歌曲时长、热度、红心与评论数量。
          </p>
        </div>
        <form class="catalog-search-panel" @submit.prevent="searchCatalog">
          <label class="catalog-search-label">
            <span>关键词搜索</span>
            <el-input v-model="catalogQuery" clearable placeholder="搜索歌曲、歌手、专辑或网易云 ID" />
          </label>
          <div class="catalog-search-actions">
            <el-button native-type="submit" type="primary" :loading="catalogLoading">查询</el-button>
            <el-button @click="clearCatalogFilters">清空</el-button>
          </div>
        </form>
      </div>

      <div class="catalog-control-bar">
        <div class="catalog-primary-filters" aria-label="常用筛选条件">
          <label>
            <span>排序方式</span>
            <select v-model="catalogSort">
              <option value="relevance">搜索相关性</option>
              <option value="newest">发行时间：最新</option>
              <option value="oldest">发行时间：最早</option>
              <option value="popularity">网易云热度</option>
              <option value="redCount">红心数</option>
              <option value="commentCount">评论数</option>
              <option value="title">歌曲名</option>
            </select>
          </label>
          <label>
            <span>艺人</span>
            <el-input v-model="catalogArtist" clearable placeholder="例如 Aimer / YOASOBI" />
          </label>
          <label>
            <span>发行年份从</span>
            <input v-model="catalogYearFrom" type="number" min="1900" max="2200" placeholder="2010" />
          </label>
          <label>
            <span>发行年份至</span>
            <input v-model="catalogYearTo" type="number" min="1900" max="2200" placeholder="2026" />
          </label>
        </div>
        <div class="catalog-view-switch" aria-label="歌曲展示形式">
          <span>展示形式</span>
          <button
            type="button"
            :class="{ active: catalogViewMode === 'cards' }"
            @click="catalogViewMode = 'cards'"
          >
            卡片
          </button>
          <button
            type="button"
            :class="{ active: catalogViewMode === 'list' }"
            @click="catalogViewMode = 'list'"
          >
            列表
          </button>
        </div>
      </div>

      <details class="catalog-filter-panel">
        <summary>
          <span>高级筛选与排序</span>
          <small>专辑、时长、热度、红心与评论条件</small>
        </summary>
        <div class="catalog-filter-grid">
          <label>
            <span>专辑</span>
            <el-input v-model="catalogAlbum" clearable placeholder="专辑名称" />
          </label>
          <label>
            <span>最短时长（秒）</span>
            <input v-model="catalogDurationMin" type="number" min="0" placeholder="例如 120" />
          </label>
          <label>
            <span>最长时长（秒）</span>
            <input v-model="catalogDurationMax" type="number" min="0" placeholder="例如 360" />
          </label>
          <label>
            <span>最低热度</span>
            <input v-model="catalogPopularityMin" type="number" min="0" max="100" placeholder="0 - 100" />
          </label>
          <label>
            <span>最低红心数</span>
            <input v-model="catalogRedCountMin" type="number" min="0" placeholder="例如 10000" />
          </label>
          <label>
            <span>最低评论数</span>
            <input v-model="catalogCommentCountMin" type="number" min="0" placeholder="例如 100" />
          </label>
        </div>
        <div class="catalog-filter-actions">
          <el-button type="primary" :loading="catalogLoading" @click="searchCatalog">应用筛选</el-button>
          <el-button @click="clearCatalogFilters">清空条件</el-button>
          <span>红心与评论条件基于已缓存的网易云统计。</span>
        </div>
      </details>

      <p v-if="catalogError" class="feedback error-feedback">{{ catalogError }}</p>
      <el-skeleton v-if="catalogLoading" :rows="5" animated />
      <div v-else-if="catalogSongs.length === 0" class="empty-state">
        <strong>没有找到可公开查询的歌曲</strong>
        <p>可以换一个关键词，或先在后台完成初筛和人工审核。</p>
      </div>
      <template v-else>
        <div class="catalog-summary">
          <span>共 {{ catalogTotal }} 首歌曲</span>
          <span>第 {{ catalogPage }} / {{ catalogTotalPages }} 页</span>
        </div>
        <div :class="catalogViewMode === 'cards' ? 'catalog-grid' : 'catalog-list'">
          <article
            v-for="song in catalogSongs"
            :key="song.songId"
            :class="['catalog-card', { 'catalog-card--list': catalogViewMode === 'list' }]"
          >
            <div class="catalog-cover" :style="catalogCoverStyle(song)">
              <span v-if="!song.coverUrl">♪</span>
            </div>
            <div class="catalog-card-body">
              <h3>{{ song.songName }}</h3>
              <p v-if="song.aliases.length" class="catalog-alias">{{ song.aliases.join(' / ') }}</p>
              <p class="catalog-link-row">
                <button
                  v-for="artist in song.artists"
                  :key="artist.artistId"
                  type="button"
                  @click="openCatalogArtist(artist)"
                >
                  {{ artist.artistName }}
                </button>
                <span v-if="song.artists.length === 0" class="muted">未知歌手</span>
                <span class="muted">·</span>
                <button v-if="song.albumId" type="button" @click="openCatalogAlbum(song)">
                  {{ song.albumName || '未知专辑' }}
                </button>
                <span v-else class="muted">{{ song.albumName || '未知专辑' }}</span>
              </p>
              <p class="catalog-meta">
                <span>{{ formatDuration(song.durationMs) }}</span>
                <span>{{ formatCatalogDate(song.publishTime) }}</span>
              </p>
              <div v-if="catalogTags(song).length" class="catalog-tag-list compact-tags">
                <span v-for="tag in catalogTags(song).slice(0, 4)" :key="`${song.songId}-${tag.group}-${tag.name}`">
                  {{ tag.name }}
                </span>
              </div>
              <div class="catalog-stats" aria-label="网易云歌曲统计">
                <span><strong>{{ formatCompactNumber(song.redCount) }}</strong> 红心</span>
                <span><strong>{{ formatCompactNumber(song.commentCount) }}</strong> 评论</span>
                <span><strong>{{ song.popularity ?? '暂无' }}</strong> 热度</span>
              </div>
            </div>
            <div class="catalog-actions">
              <el-button size="small" @click="openCatalogSong(song)">查看详情</el-button>
              <a v-if="song.neteaseUrl" :href="song.neteaseUrl" target="_blank" rel="noreferrer">网易云页面</a>
            </div>
          </article>
        </div>
        <div class="catalog-pagination">
          <el-button :disabled="catalogPage <= 1" @click="loadCatalogSongs(catalogPage - 1)">上一页</el-button>
          <el-button :disabled="catalogPage >= catalogTotalPages" @click="loadCatalogSongs(catalogPage + 1)">下一页</el-button>
        </div>
      </template>

      <div
        v-if="selectedCatalogSong || selectedCatalogArtist || selectedCatalogAlbum || catalogDetailLoading"
        class="catalog-detail-overlay"
        @click.self="closeCatalogDetail"
      >
        <aside class="catalog-detail-drawer" aria-label="公开歌曲详情">
          <el-skeleton v-if="catalogDetailLoading" :rows="9" animated />
          <template v-else-if="selectedCatalogSong">
            <div class="catalog-detail-topbar">
              <p class="eyebrow">CATALOG DETAIL</p>
              <el-button round @click="closeCatalogSong">关闭</el-button>
            </div>
            <div class="catalog-detail-heading">
              <div class="catalog-cover large" :style="catalogCoverStyle(selectedCatalogSong)">
                <span v-if="!selectedCatalogSong.coverUrl">♪</span>
              </div>
              <div>
                <h3>{{ selectedCatalogSong.songName }}</h3>
                <p v-if="selectedCatalogSong.aliases.length" class="catalog-alias">
                  {{ selectedCatalogSong.aliases.join(' / ') }}
                </p>
                <p class="muted">{{ catalogArtistNames(selectedCatalogSong) }} · {{ selectedCatalogSong.albumName || '未知专辑' }}</p>
                <p class="catalog-meta">
                  <span>{{ formatDuration(selectedCatalogSong.durationMs) }}</span>
                  <span>{{ formatCatalogDate(selectedCatalogSong.publishTime) }}</span>
                  <span>网易云 ID {{ selectedCatalogSong.neteaseSongId }}</span>
                </p>
              </div>
            </div>

            <section class="drawer-section">
              <h3>网易云数据</h3>
              <div class="catalog-detail-stats">
                <div><span>红心数</span><strong>{{ formatCompactNumber(selectedCatalogSong.redCount) }}</strong></div>
                <div><span>评论数</span><strong>{{ formatCompactNumber(selectedCatalogSong.commentCount) }}</strong></div>
                <div><span>歌曲热度</span><strong>{{ selectedCatalogSong.popularity ?? '暂无' }}</strong></div>
              </div>
            </section>

            <section class="drawer-section">
              <h3>歌曲信息</h3>
              <div class="catalog-song-facts">
                <div><span>艺人</span><strong>{{ catalogArtistNames(selectedCatalogSong) }}</strong></div>
                <div><span>专辑</span><strong>{{ selectedCatalogSong.albumName || '未知专辑' }}</strong></div>
                <div><span>发行日期</span><strong>{{ formatCatalogDate(selectedCatalogSong.publishTime) }}</strong></div>
                <div><span>时长</span><strong>{{ formatDuration(selectedCatalogSong.durationMs) }}</strong></div>
                <div><span>主标题</span><strong>{{ selectedCatalogSong.neteaseDetail?.mainTitle || selectedCatalogSong.songName }}</strong></div>
                <div><span>副标题</span><strong>{{ selectedCatalogSong.neteaseDetail?.additionalTitle || '暂无' }}</strong></div>
                <div><span>碟片 / 曲序</span><strong>{{ selectedCatalogSong.neteaseDetail?.disc || '未知' }} / {{ selectedCatalogSong.neteaseDetail?.trackNo ?? '未知' }}</strong></div>
                <div><span>MV ID</span><strong>{{ selectedCatalogSong.neteaseDetail?.mvId || '无' }}</strong></div>
                <div><span>版权可用性</span><strong>{{ availabilityText(selectedCatalogSong.neteaseDetail) }}</strong></div>
                <div><span>实时来源</span><strong>{{ sourceText(selectedCatalogSong.neteaseDetail) }}</strong></div>
              </div>
            </section>

            <section v-if="catalogTags(selectedCatalogSong).length" class="drawer-section">
              <h3>已保存歌曲标签</h3>
              <div class="catalog-wiki-groups">
                <div v-for="tag in catalogTags(selectedCatalogSong)" :key="`${tag.group}-${tag.name}`">
                  <strong>{{ tag.group }}</strong>
                  <span>{{ tag.name }}</span>
                </div>
              </div>
            </section>

            <section v-if="selectedCatalogSong.neteaseDetail?.album" class="drawer-section">
              <h3>专辑详情</h3>
              <div class="catalog-song-facts">
                <div><span>专辑类型</span><strong>{{ selectedCatalogSong.neteaseDetail.album.type || '未知' }}</strong></div>
                <div><span>子类型</span><strong>{{ selectedCatalogSong.neteaseDetail.album.subType || '未知' }}</strong></div>
                <div><span>发行公司</span><strong>{{ selectedCatalogSong.neteaseDetail.album.company || '未知' }}</strong></div>
                <div><span>曲目数</span><strong>{{ selectedCatalogSong.neteaseDetail.album.size ?? '未知' }}</strong></div>
                <div><span>专辑艺人</span><strong>{{ selectedCatalogSong.neteaseDetail.album.artistName || '未知' }}</strong></div>
                <div><span>网易云专辑 ID</span><strong>{{ selectedCatalogSong.neteaseDetail.album.neteaseAlbumId || '未知' }}</strong></div>
              </div>
              <p v-if="selectedCatalogSong.neteaseDetail.album.aliases.length" class="catalog-alias">
                别名：{{ selectedCatalogSong.neteaseDetail.album.aliases.join(' / ') }}
              </p>
              <div v-if="selectedCatalogSong.neteaseDetail.album.tags.length" class="catalog-tag-list">
                <span v-for="tag in selectedCatalogSong.neteaseDetail.album.tags" :key="tag">{{ tag }}</span>
              </div>
              <p v-if="selectedCatalogSong.neteaseDetail.album.description" class="catalog-description">
                {{ selectedCatalogSong.neteaseDetail.album.description }}
              </p>
            </section>

            <section v-if="selectedCatalogSong.neteaseDetail?.lyric" class="drawer-section">
              <h3>歌词摘要</h3>
              <div class="catalog-song-facts">
                <div><span>原文歌词</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.hasOriginal ? `${selectedCatalogSong.neteaseDetail.lyric.originalLineCount} 行` : '暂无' }}</strong></div>
                <div><span>翻译歌词</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.hasTranslation ? `${selectedCatalogSong.neteaseDetail.lyric.translatedLineCount} 行` : '暂无' }}</strong></div>
                <div><span>罗马音</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.hasRomanization ? `${selectedCatalogSong.neteaseDetail.lyric.romanizedLineCount} 行` : '暂无' }}</strong></div>
                <div><span>语言判断</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.languageGuess }}</strong></div>
                <div><span>假名数量</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.kanaCount }}</strong></div>
                <div><span>假名比例</span><strong>{{ formatRatio(selectedCatalogSong.neteaseDetail.lyric.kanaRatio) }}</strong></div>
                <div><span>歌词贡献者</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.lyricContributor || '未知' }}</strong></div>
                <div><span>翻译贡献者</span><strong>{{ selectedCatalogSong.neteaseDetail.lyric.translationContributor || '未知' }}</strong></div>
              </div>
              <p class="boundary-note compact-boundary">
                当前公开数据库只展示歌词可用性与语言统计，不展示歌词全文、翻译全文或罗马音全文。
              </p>
            </section>

            <section v-if="selectedCatalogSong.neteaseDetail?.wikiTags.length" class="drawer-section">
              <h3>网易云百科标签</h3>
              <div class="catalog-wiki-groups">
                <div v-for="group in selectedCatalogSong.neteaseDetail.wikiTags" :key="group.group">
                  <strong>{{ group.group }}</strong>
                  <span v-for="value in group.values" :key="`${group.group}-${value}`">{{ value }}</span>
                </div>
              </div>
            </section>

            <section v-if="selectedCatalogSong.neteaseDetail?.qualities.length" class="drawer-section">
              <h3>音质元数据</h3>
              <div class="catalog-quality-list">
                <div v-for="quality in selectedCatalogSong.neteaseDetail.qualities" :key="quality.level">
                  <strong>{{ quality.label }}</strong>
                  <span>{{ formatBitrate(quality.bitrate) }}</span>
                  <span>{{ formatFileSize(quality.size) }}</span>
                </div>
              </div>
              <p class="boundary-note compact-boundary">
                这里仅展示网易云返回的音质级别元数据，不提供在线播放、下载或音频 URL。
              </p>
            </section>

            <div class="drawer-actions">
              <a v-if="selectedCatalogSong.neteaseUrl" :href="selectedCatalogSong.neteaseUrl" target="_blank" rel="noreferrer">打开网易云歌曲页</a>
              <el-button round @click="closeCatalogSong">关闭详情</el-button>
            </div>
          </template>
          <template v-else-if="selectedCatalogArtist">
            <div class="catalog-detail-topbar">
              <p class="eyebrow">ARTIST DETAIL</p>
              <el-button round @click="closeCatalogArtist">关闭</el-button>
            </div>
            <div class="catalog-detail-heading">
              <div class="catalog-cover large" :style="selectedCatalogArtist.coverUrl ? { backgroundImage: `url('${selectedCatalogArtist.coverUrl}')` } : {}">
                <span v-if="!selectedCatalogArtist.coverUrl">A</span>
              </div>
              <div>
                <h3>{{ selectedCatalogArtist.artistName }}</h3>
                <p class="catalog-meta">
                  <span>{{ selectedCatalogArtist.songCount }} 首歌曲</span>
                  <span>{{ selectedCatalogArtist.albumCount }} 张专辑</span>
                  <span>网易云艺人 ID {{ selectedCatalogArtist.neteaseArtistId || '未知' }}</span>
                </p>
              </div>
            </div>
            <section class="drawer-section">
              <h3>公开歌曲</h3>
              <div class="catalog-related-list">
                <article v-for="song in selectedCatalogArtist.songs.items" :key="song.songId">
                  <div>
                    <strong>{{ song.songName }}</strong>
                    <p class="muted">{{ song.albumName || '未知专辑' }} · {{ formatCatalogDate(song.publishTime) }}</p>
                  </div>
                  <el-button size="small" @click="openCatalogSong(song)">查看歌曲</el-button>
                </article>
              </div>
            </section>
          </template>
          <template v-else-if="selectedCatalogAlbum">
            <div class="catalog-detail-topbar">
              <p class="eyebrow">ALBUM DETAIL</p>
              <el-button round @click="closeCatalogAlbum">关闭</el-button>
            </div>
            <div class="catalog-detail-heading">
              <div class="catalog-cover large" :style="selectedCatalogAlbum.coverUrl ? { backgroundImage: `url('${selectedCatalogAlbum.coverUrl}')` } : {}">
                <span v-if="!selectedCatalogAlbum.coverUrl">◎</span>
              </div>
              <div>
                <h3>{{ selectedCatalogAlbum.albumName || '未知专辑' }}</h3>
                <p class="catalog-link-row">
                  <button
                    v-for="artist in selectedCatalogAlbum.artists"
                    :key="artist.artistId"
                    type="button"
                    @click="openCatalogArtist(artist)"
                  >
                    {{ artist.artistName }}
                  </button>
                </p>
                <p class="catalog-meta">
                  <span>{{ selectedCatalogAlbum.songCount }} 首歌曲</span>
                  <span>{{ formatCatalogDate(selectedCatalogAlbum.publishTime) }}</span>
                  <span>网易云专辑 ID {{ selectedCatalogAlbum.neteaseAlbumId || '未知' }}</span>
                </p>
              </div>
            </div>
            <section class="drawer-section">
              <h3>专辑曲目</h3>
              <div class="catalog-related-list">
                <article v-for="song in selectedCatalogAlbum.songs.items" :key="song.songId">
                  <div>
                    <strong>{{ song.songName }}</strong>
                    <p class="muted">{{ catalogArtistNames(song) }} · {{ formatDuration(song.durationMs) }}</p>
                  </div>
                  <el-button size="small" @click="openCatalogSong(song)">查看歌曲</el-button>
                </article>
              </div>
            </section>
          </template>
        </aside>
      </div>
    </section>

    <section v-if="currentPage === 'admin' && !adminAuthenticated" class="admin-auth-section">
      <article class="panel admin-auth-panel">
        <p class="eyebrow">ADMIN ACCESS</p>
        <h2>输入管理员令牌</h2>
        <p class="panel-copy">
          审核、导入和任务操作现在需要服务器端 ADMIN_TOKEN。令牌只保存在当前浏览器会话中，不会写入前端构建产物。
        </p>
        <form class="admin-auth-form" @submit.prevent="loginAdmin">
          <label>
            <span>管理员令牌</span>
            <el-input
              v-model="adminTokenInput"
              type="password"
              show-password
              autocomplete="current-password"
              placeholder="Bearer token"
            />
          </label>
          <el-button native-type="submit" type="primary" :loading="adminAuthLoading">进入审核控制台</el-button>
        </form>
        <p v-if="adminAuthError" class="feedback error-feedback">{{ adminAuthError }}</p>
        <div class="service-card auth-health-card">
          <span>Backend API</span>
          <el-tag :type="health?.status === 'ok' ? 'success' : 'warning'">{{ health?.status ?? 'unknown' }}</el-tag>
          <small v-if="healthError">{{ healthError }}</small>
        </div>
      </article>
    </section>

    <div v-if="currentPage === 'admin' && adminAuthenticated" class="admin-workspace">
    <section class="workspace-grid">
      <article class="panel">
        <p class="eyebrow">PHASE 1</p>
        <h2>导入网易云歌单</h2>
        <form class="input-row" @submit.prevent="startImport">
          <el-input v-model="playlistId" clearable placeholder="歌单 ID 或分享链接，例如 https://music.163.com/#/playlist?id=60198" />
          <el-button native-type="submit" type="primary" :loading="importLoading">开始导入</el-button>
        </form>
        <p class="panel-copy compact-copy">
          可以粘贴网易云歌单分享链接，系统会自动提取歌单 ID。
        </p>
        <div class="manual-song-panel">
          <div>
            <strong>手动添加单曲</strong>
            <p class="muted">输入歌曲名搜索，确认结果后添加到候选库；入库时会保存网易云百科标签。</p>
          </div>
          <form class="manual-search-form" @submit.prevent="searchManualSongs">
            <el-input v-model="manualSongKeyword" clearable placeholder="例如 アイドル / Idol / YOASOBI" />
            <el-button native-type="submit" :loading="manualSongSearchLoading">搜索歌曲</el-button>
          </form>
          <div v-if="manualSongResults.length" class="manual-result-list">
            <article v-for="song in manualSongResults" :key="song.neteaseSongId" class="manual-result-card">
              <div>
                <strong>{{ song.songName }}</strong>
                <p class="muted">
                  {{ songSearchArtistNames(song) }} · {{ song.album.albumName || '未知专辑' }} · {{ formatDuration(song.durationMs) }}
                </p>
                <small>网易云歌曲 ID {{ song.neteaseSongId }}</small>
              </div>
              <el-button
                size="small"
                type="primary"
                :loading="manualSongImportingId === song.neteaseSongId"
                @click="importManualSong(song)"
              >
                添加此歌
              </el-button>
            </article>
          </div>
        </div>
        <p v-if="importMessage" class="feedback success-feedback">{{ importMessage }}</p>
        <p v-if="importError" class="feedback error-feedback">{{ importError }}</p>
      </article>

      <article class="panel accent-panel">
        <p class="eyebrow">PHASE 2</p>
        <h2>外部 API 初筛</h2>
        <p class="panel-copy">
          对 pending 歌曲批量计算分数；自动流程不会覆盖已经人工审核的歌曲。
        </p>
        <div class="screening-console">
          <div class="console-row">
            <span>未初筛</span>
            <strong>{{ statsLoading ? '...' : stats?.unscreenedSongs ?? 0 }}</strong>
          </div>
          <div class="console-row">
            <span>Last.fm</span>
            <strong :class="{ warning: !statsLoading && !stats?.lastfmConfigured }">{{ lastfmConfigText() }}</strong>
          </div>
        </div>
        <div class="batch-actions" aria-label="批量初筛控制">
          <el-button
            v-for="limit in [5, 20, 50]"
            :key="limit"
            :type="limit === screeningLimit ? 'primary' : 'default'"
            :loading="screeningLoading && limit === screeningLimit"
            :disabled="hasActiveScreeningJob"
            @click="startScreening(limit)"
          >
            {{ hasActiveScreeningJob ? '已有任务运行中' : `筛选 ${limit} 首` }}
          </el-button>
        </div>
        <p class="console-hint">
          建议日常用 50 首推进 backlog；外部 API 超时时可退回 5 或 20 首重试。
        </p>
        <p v-if="screeningMessage" class="feedback success-feedback">{{ screeningMessage }}</p>
        <p v-if="screeningError" class="feedback error-feedback">{{ screeningError }}</p>
      </article>

      <aside class="panel service-panel">
        <p class="eyebrow">SYSTEM</p>
        <h2>基础服务</h2>
        <el-skeleton v-if="healthLoading" :rows="3" animated />
        <template v-else>
          <div class="service-row">
            <span>Backend API</span>
            <el-tag :type="health?.status === 'ok' ? 'success' : 'warning'">{{ health?.status ?? 'unknown' }}</el-tag>
          </div>
          <div class="service-row"><span>PostgreSQL</span><strong>{{ health?.dependencies.database.status }}</strong></div>
          <div class="service-row"><span>Redis / BullMQ</span><strong>{{ health?.dependencies.redis.status }}</strong></div>
          <p v-if="healthError" class="feedback error-feedback">{{ healthError }}</p>
        </template>
      </aside>
    </section>

    <section class="stats-grid" aria-label="筛选工作台统计">
      <article class="stat-card">
        <span>候选总数</span>
        <strong>{{ statsLoading ? '...' : stats?.totalSongs ?? 0 }}</strong>
        <p>已导入并建立筛选记录的歌曲。</p>
      </article>
      <article class="stat-card">
        <span>待审核</span>
        <strong>{{ statsLoading ? '...' : stats?.pendingSongs ?? 0 }}</strong>
        <p>优先从这里进入人工复核。</p>
      </article>
      <article class="stat-card highlight-card">
        <span>未初筛</span>
        <strong>{{ statsLoading ? '...' : stats?.unscreenedSongs ?? 0 }}</strong>
        <p>仍是网易云导入初始态，尚未写入外部 API 评分。</p>
      </article>
      <article class="stat-card highlight-card">
        <span>艺人已确认但歌曲待审</span>
        <strong>{{ statsLoading ? '...' : stats?.manualArtistPendingSongs ?? 0 }}</strong>
        <p>最适合立即重筛或人工收尾。</p>
      </article>
      <article class="stat-card">
        <span>需要确认艺人</span>
        <strong>{{ statsLoading ? '...' : stats?.needsArtistReviewSongs ?? 0 }}</strong>
        <p>艺人身份未知或仍 pending 的歌曲。</p>
      </article>
      <article class="stat-card">
        <span>人工确认艺人</span>
        <strong>{{ statsLoading ? '...' : stats?.manualConfirmedArtists ?? 0 }}</strong>
        <p>会优先影响后续重筛结果。</p>
      </article>
      <article class="stat-card">
        <span>歌词兜底命中</span>
        <strong>{{ statsLoading ? '...' : stats?.lyricFallbackSongs ?? 0 }}</strong>
        <p>外部证据不足时，由歌词假名比例补充的候选。</p>
      </article>
      <p v-if="statsError" class="feedback error-feedback stat-error">{{ statsError }}</p>
    </section>

    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">REVIEW QUEUE</p>
          <h2>候选歌曲与人工审核</h2>
        </div>
        <div class="status-tabs">
          <el-button :type="candidateStatus === 'pending' ? 'primary' : undefined" round @click="setCandidateStatus('pending')">待审核</el-button>
          <el-button :type="candidateStatus === 'accepted' ? 'primary' : undefined" round @click="setCandidateStatus('accepted')">已通过</el-button>
          <el-button :type="candidateStatus === 'rejected' ? 'primary' : undefined" round @click="setCandidateStatus('rejected')">已拒绝</el-button>
        </div>
      </div>
      <div class="filter-toolbar">
        <span>审核视图</span>
        <el-button
          v-for="filter in (['all', 'manual_artist_pending', 'needs_artist_review', 'manual_artist', 'high_score_pending', 'lyric_fallback'] as CandidateFilter[])"
          :key="filter"
          size="small"
          round
          :type="candidateFilter === filter ? 'primary' : undefined"
          @click="setCandidateFilter(filter)"
        >
          {{ candidateFilterText(filter) }}
        </el-button>
      </div>

      <el-skeleton v-if="candidatesLoading" :rows="5" animated />
      <div v-else-if="candidatesError" class="empty-state error-state">
        <strong>候选列表加载失败</strong>
        <p>{{ candidatesError }}</p>
      </div>
      <div v-else-if="candidates.length === 0" class="empty-state">
        <strong>没有 {{ screeningStatusText(candidateStatus) }} / {{ candidateFilterText(candidateFilter) }} 歌曲</strong>
        <p>先导入歌单，再创建初筛任务；结果会显示在这里。</p>
      </div>
      <div v-else class="candidate-list">
        <article v-for="song in candidates" :key="song.songId" class="candidate-card">
          <div class="candidate-main">
            <div class="candidate-title-row">
              <h3>{{ song.songName }}</h3>
              <div class="candidate-badges">
                <el-tag :type="tagType(song.status)">{{ screeningStatusText(song.status) }}</el-tag>
                <el-tag :type="scoreTagType(song)" effect="plain">{{ scoreText(song) }}</el-tag>
              </div>
            </div>
            <p class="muted">{{ song.artistNames.join(' / ') || '未知歌手' }} · {{ song.albumName || '未知专辑' }}</p>
            <p v-if="isUnscreenedCandidate(song)" class="unscreened-note">
              这首歌刚从网易云导入，还没有跑 MusicBrainz / Wikidata / Last.fm 初筛；0 不是评分结果。
            </p>
            <p class="evidence">{{ song.reason?.summary || '暂无证据摘要' }}</p>
            <div class="lyric-fallback-chip">
              <el-tag size="small" :type="lyricFallbackTagType(song.reason?.fallback)">歌词兜底</el-tag>
              <span>{{ lyricFallbackState(song.reason?.fallback) }}</span>
              <span v-if="song.reason?.fallback?.lyric_checked">
                kana {{ song.reason.fallback.kana_count ?? 0 }} / {{ formatRatio(song.reason.fallback.kana_ratio) }}
              </span>
            </div>
            <p v-if="song.reviewedAt" class="review-note">
              人工审核：{{ song.reviewedBy || 'admin' }} · {{ formatDate(song.reviewedAt) }}
            </p>
            <div class="evidence-chips">
              <span v-for="item in song.reason?.positive || []" :key="`p-${String(item.source)}-${String(item.type)}`">+ {{ evidenceLabel(item) }}</span>
              <span v-for="item in song.reason?.negative || []" :key="`n-${String(item.source)}-${String(item.type)}`" class="negative">- {{ evidenceLabel(item) }}</span>
              <span v-for="item in song.reason?.external?.skipped || []" :key="item" class="skipped">{{ item }}</span>
            </div>
            <div v-if="song.artistIdentities?.length" class="artist-mini-list">
              <span v-for="artist in song.artistIdentities" :key="artist.artistId">
                {{ artist.artistName }}
                <el-tag size="small" :type="artistTagType(artist.status)">{{ artistStatusText(artist.status) }}</el-tag>
              </span>
            </div>
          </div>
          <div class="candidate-actions">
            <el-button size="small" @click="openCandidate(song)">查看证据</el-button>
            <a :href="`https://music.163.com/#/song?id=${song.neteaseSongId}`" target="_blank" rel="noreferrer">打开网易云</a>
            <el-button size="small" :loading="rescreeningSongId === song.songId" @click="rescreenSong(song)">重新筛选</el-button>
            <el-button size="small" type="success" :loading="reviewingSongId === song.songId" @click="reviewSong(song, 'accepted')">人工通过</el-button>
            <el-button size="small" type="danger" :loading="reviewingSongId === song.songId" @click="reviewSong(song, 'rejected')">人工拒绝</el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="section-card artist-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">ARTIST IDENTITY</p>
          <h2>艺人身份缓存</h2>
        </div>
        <div class="heading-actions">
          <el-button
            type="primary"
            :loading="bulkArtistImportLoading"
            @click="importConfirmedArtists"
          >
            导入下一批 10 位确认艺人
          </el-button>
          <el-button
            :loading="bulkTruncatedImportLoading"
            @click="continueTruncatedArtistImports"
          >
            继续所有截断导入
          </el-button>
          <el-button :loading="artistIdentitiesLoading" text @click="loadArtistIdentities()">刷新艺人</el-button>
        </div>
      </div>
      <p class="section-note">
        新确认的日本艺人会自动创建歌曲导入任务；批量操作优先处理从未导入的艺人，每位最多 500 首，重复执行会按网易云歌曲 ID 去重。
      </p>
      <form class="manual-artist-form" @submit.prevent="searchManualArtists">
        <div>
          <strong>手动添加网易云艺人</strong>
          <p class="muted">输入艺人名搜索，选择正确结果后会标记为人工确认日本艺人，并立即导入该艺人的关联歌曲。</p>
        </div>
        <label>
          <span>艺人名称</span>
          <el-input v-model="manualArtistKeyword" clearable placeholder="例如 YOASOBI / Aimer" />
        </label>
        <el-button native-type="submit" type="primary" :loading="manualArtistSearchLoading">
          搜索艺人
        </el-button>
      </form>
      <div v-if="manualArtistResults.length" class="manual-result-list artist-result-list">
        <article v-for="artist in manualArtistResults" :key="artist.neteaseArtistId" class="manual-result-card">
          <div>
            <strong>{{ artist.artistName }}</strong>
            <p class="muted">{{ artist.aliases.length ? `别名：${artist.aliases.join(' / ')}` : '暂无别名' }}</p>
            <small>网易云艺人 ID {{ artist.neteaseArtistId }}</small>
          </div>
          <el-button
            size="small"
            type="primary"
            :loading="manualArtistImportingId === artist.neteaseArtistId"
            @click="importManualArtistSongs(artist)"
          >
            添加并导入歌曲
          </el-button>
        </article>
      </div>

      <el-skeleton v-if="artistIdentitiesLoading" :rows="4" animated />
      <div v-else-if="artistIdentitiesError" class="empty-state error-state">
        <strong>艺人身份加载失败</strong>
        <p>{{ artistIdentitiesError }}</p>
      </div>
      <div v-else-if="artistIdentities.length === 0" class="empty-state">
        <strong>还没有艺人身份缓存</strong>
        <p>先运行初筛任务，系统会逐步沉淀 MusicBrainz / Wikidata / Last.fm 证据。</p>
      </div>
      <div v-else class="artist-list">
        <article v-for="artist in artistIdentities" :key="artist.artistId" class="artist-card">
          <div>
            <div class="candidate-title-row">
              <h3>{{ artist.artistName }}</h3>
              <el-tag :type="artistTagType(artist.status)">{{ artistStatusText(artist.status) }}</el-tag>
            </div>
            <p class="muted">
              {{ artist.songCount }} 首关联歌曲 · country {{ artist.country || 'unknown' }} · confidence
              {{ artist.confidence ?? 'n/a' }}
            </p>
            <p v-if="artist.reviewedAt" class="review-note">
              人工确认：{{ artist.reviewedBy || 'admin' }} · {{ formatDate(artist.reviewedAt) }}
            </p>
          </div>
          <div class="artist-actions">
            <el-button
              v-if="canImportArtist(artist)"
              size="small"
              type="primary"
              :loading="importingArtistId === artist.artistId"
              @click="importArtistSongs(artist)"
            >
              导入该艺人歌曲
            </el-button>
            <el-button
              size="small"
              type="success"
              :loading="reviewingArtistId === artist.artistId"
              @click="reviewArtistIdentity(artist, true)"
            >
              确认日本艺人并重筛
            </el-button>
            <el-button
              size="small"
              type="danger"
              :loading="reviewingArtistId === artist.artistId"
              @click="reviewArtistIdentity(artist, false)"
            >
              确认非日本艺人并重筛
            </el-button>
            <details class="artist-json">
              <summary>来源摘要</summary>
              <pre>{{ prettyJson(artist.sourceSummary) }}</pre>
            </details>
          </div>
        </article>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">RECENT JOBS</p>
          <h2>后台任务</h2>
        </div>
        <el-button :loading="jobsLoading" text @click="loadJobs()">刷新任务</el-button>
      </div>
      <el-skeleton v-if="jobsLoading" :rows="4" animated />
      <div v-else class="job-list">
        <article v-for="job in jobs" :key="job.id" class="job-card">
          <div>
            <span class="job-id">#{{ job.id }} · {{ jobTypeText(job.jobType) }}</span>
            <strong>{{ job.sourceId }}</strong>
            <span class="muted">创建于 {{ formatDate(job.createdAt) }}</span>
          </div>
          <div>
            <div class="progress-copy">
              <el-tag :type="tagType(job.status)">{{ jobStatusText(job.status) }}</el-tag>
              <span>{{ jobProgressText(job) }}</span>
            </div>
            <el-progress :percentage="jobProgress(job)" :status="job.status === 'failed' ? 'exception' : job.status === 'success' ? 'success' : undefined" />
            <p
              v-if="job.jobType === 'artist_song_import' && artistImportContinuationText(job)"
              class="job-meta"
            >
              {{ artistImportContinuationText(job) }}
            </p>
            <el-button
              v-if="canContinueArtistJob(job)"
              size="small"
              type="primary"
              plain
              :loading="continuingImportJobId === job.id"
              @click="continueArtistImport(job)"
            >
              继续导入后续 500 首
            </el-button>
            <p v-if="job.errorMessage" class="job-error">{{ job.errorMessage }}</p>
          </div>
        </article>
      </div>
    </section>

    <p class="boundary-note">边界：本后台只处理音乐元数据、外部证据和审核状态；不提供在线播放、音频下载、公开音频 URL 或大规模歌词展示。</p>

    <div v-if="selectedCandidate" class="drawer-overlay" @click.self="closeCandidate">
      <aside class="candidate-drawer" aria-label="候选歌曲详情">
        <div class="drawer-heading">
          <div>
            <p class="eyebrow">SONG DETAIL</p>
            <h2>{{ selectedCandidate.songName }}</h2>
            <p class="muted">{{ selectedCandidate.artistNames.join(' / ') || '未知歌手' }}</p>
          </div>
          <el-button round @click="closeCandidate">关闭</el-button>
        </div>

        <section class="detail-grid">
          <div><span>状态</span><strong>{{ screeningStatusText(selectedCandidate.status) }}</strong></div>
          <div>
            <span>分数</span>
            <strong>{{ selectedIsUnscreened ? '未初筛' : selectedCandidate.score }}</strong>
          </div>
          <div><span>专辑</span><strong>{{ selectedCandidate.albumName || '未知专辑' }}</strong></div>
          <div><span>来源歌单</span><strong>{{ selectedCandidate.playlistNames.join(' / ') || '未知来源' }}</strong></div>
          <div><span>更新时间</span><strong>{{ formatDate(selectedCandidate.updatedAt) }}</strong></div>
          <div><span>人工审核</span><strong>{{ selectedCandidate.reviewedAt ? `${selectedCandidate.reviewedBy || 'admin'} · ${formatDate(selectedCandidate.reviewedAt)}` : '未审核' }}</strong></div>
        </section>

        <section class="drawer-section">
          <h3>证据摘要</h3>
          <p v-if="selectedIsUnscreened" class="unscreened-note">
            当前记录仍是导入初始态。点击“重新筛选此歌”或批量初筛后，才会写入真实评分和外部证据。
          </p>
          <p class="evidence">{{ selectedCandidate.reason?.summary || '暂无证据摘要' }}</p>
        </section>

        <section class="drawer-section lyric-fallback-panel">
          <div class="drawer-section-title">
            <h3>歌词兜底</h3>
            <el-tag size="small" :type="lyricFallbackTagType(selectedLyricFallback)">
              {{ selectedLyricFallback?.passed ? '命中' : selectedLyricFallback?.lyric_checked ? '已检查' : '未检查' }}
            </el-tag>
          </div>
          <p class="evidence">{{ lyricFallbackState(selectedLyricFallback) }}</p>
          <div v-if="selectedLyricFallback?.lyric_checked" class="fallback-metrics">
            <span>kana 数量 <strong>{{ selectedLyricFallback.kana_count ?? 0 }}</strong></span>
            <span>kana 比例 <strong>{{ formatRatio(selectedLyricFallback.kana_ratio) }}</strong></span>
            <span>语言判断 <strong>{{ selectedLyricFallback.language_guess || 'unknown' }}</strong></span>
            <span>缓存 <strong>{{ selectedLyricFallback.cached ? '已命中' : '新获取' }}</strong></span>
          </div>
          <p class="boundary-note compact-boundary">只展示语言检测统计，不展示歌词全文。</p>
        </section>

        <section class="drawer-section">
          <h3>关联艺人身份</h3>
          <div v-if="selectedArtistIdentities.length" class="identity-detail-list">
            <article v-for="artist in selectedArtistIdentities" :key="artist.artistId" class="identity-detail-card">
              <div>
                <strong>{{ artist.artistName }}</strong>
                <el-tag size="small" :type="artistTagType(artist.status)">{{ artistStatusText(artist.status) }}</el-tag>
              </div>
              <p class="muted">
                country {{ artist.country || 'unknown' }} · confidence {{ artist.confidence ?? 'n/a' }}
                · {{ artist.reviewedAt ? `人工确认 ${artist.reviewedBy || 'admin'} · ${formatDate(artist.reviewedAt)}` : '未人工确认' }}
              </p>
              <div class="identity-actions">
                <el-button
                  size="small"
                  type="success"
                  :loading="reviewingArtistId === artist.artistId"
                  @click="reviewCandidateArtistIdentity(artist, true)"
                >
                  确认日本艺人并重筛
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  :loading="reviewingArtistId === artist.artistId"
                  @click="reviewCandidateArtistIdentity(artist, false)"
                >
                  确认非日本艺人并重筛
                </el-button>
              </div>
            </article>
          </div>
          <p v-else class="muted">暂无关联艺人身份记录。</p>
          <details v-if="selectedCandidate.reason?.artist_identity" class="raw-json compact-json">
            <summary>查看本次筛选采用的艺人身份</summary>
            <pre>{{ prettyJson(selectedCandidate.reason.artist_identity) }}</pre>
          </details>
        </section>

        <section class="drawer-section">
          <h3>正向证据</h3>
          <div v-if="selectedPositive.length" class="evidence-table">
            <div v-for="item in selectedPositive" :key="`detail-p-${evidenceLabel(item)}-${evidenceValue(item.value)}`">
              <strong>+{{ item.score ?? 0 }}</strong>
              <span>{{ evidenceLabel(item) }}</span>
              <em>{{ evidenceValue(item.value) }}</em>
            </div>
          </div>
          <p v-else class="muted">暂无正向证据。</p>
        </section>

        <section class="drawer-section">
          <h3>负向证据</h3>
          <div v-if="selectedNegative.length" class="evidence-table negative-table">
            <div v-for="item in selectedNegative" :key="`detail-n-${evidenceLabel(item)}-${evidenceValue(item.value)}`">
              <strong>{{ item.score ?? 0 }}</strong>
              <span>{{ evidenceLabel(item) }}</span>
              <em>{{ evidenceValue(item.value) }}</em>
            </div>
          </div>
          <p v-else class="muted">暂无负向证据。</p>
        </section>

        <section class="drawer-section">
          <h3>外部 API 状态</h3>
          <div v-if="selectedSkipped.length" class="skip-list">
            <span v-for="item in selectedSkipped" :key="item">{{ item }}</span>
          </div>
          <p v-else class="muted">没有跳过或失败的外部 API 调用。</p>
        </section>

        <section v-if="selectedCandidate.reason?.manual_review" class="drawer-section manual-box">
          <h3>人工审核记录</h3>
          <p>审核人：{{ selectedCandidate.reason.manual_review.reviewer || selectedCandidate.reviewedBy || 'admin' }}</p>
          <p>结论：{{ screeningStatusText(selectedCandidate.reason.manual_review.status || selectedCandidate.status) }}</p>
          <p>原因：{{ selectedCandidate.reason.manual_review.reason || '未填写' }}</p>
        </section>

        <details class="raw-json">
          <summary>查看 reason JSON</summary>
          <pre>{{ prettyJson(selectedCandidate.reason) }}</pre>
        </details>

        <div class="drawer-actions">
          <el-button :loading="rescreeningSongId === selectedCandidate.songId" @click="rescreenSong(selectedCandidate)">重新筛选此歌</el-button>
          <el-button type="success" :loading="reviewingSongId === selectedCandidate.songId" @click="reviewSong(selectedCandidate, 'accepted')">人工通过</el-button>
          <el-button type="danger" :loading="reviewingSongId === selectedCandidate.songId" @click="reviewSong(selectedCandidate, 'rejected')">人工拒绝</el-button>
          <a :href="`https://music.163.com/#/song?id=${selectedCandidate.neteaseSongId}`" target="_blank" rel="noreferrer">打开网易云歌曲页</a>
        </div>
      </aside>
    </div>
    </div>
  </main>
</template>
