import './style.css'
import { store } from './store.ts'
import { api } from './api.ts'
import { applyTheme, settingsPanel } from './components/settings-panel.ts'
import { newThreadModal } from './components/new-thread-modal.ts'
import { mountPermissionCard, PERMISSION_TIMEOUT_MS } from './components/permission-card.ts'
import { renderMarkdown, bindMarkdownControls } from './markdown.ts'
import type {
  Thread,
  Message,
  ConfigOption,
  ConfigOptionValue,
  SlashCommand,
  Turn,
  StreamState,
  TurnEvent,
  PlanEntry,
  SessionInfo,
  SessionTranscriptMessage,
  ToolCall,
  UploadedAsset,
  StorageUsageInfo,
} from './types.ts'
import type {
  TurnStream,
  PermissionRequiredPayload,
  PlanUpdatePayload,
  ReasoningDeltaPayload,
  SessionBoundPayload,
  ToolCallPayload,
} from './sse.ts'
import { copyText, escHtml, formatRelativeTime, formatTimestamp, generateUUID } from './utils.ts'

// ── Theme ─────────────────────────────────────────────────────────────────

applyTheme(store.get().theme)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.get().theme === 'system') applyTheme('system')
})

// ── Icons ─────────────────────────────────────────────────────────────────

const iconPlus = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
  <path d="M7.5 2v11M2 7.5h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`

const iconSend = `<svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
  <path d="M1.5 7.5h12M8.5 2l5 5.5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const iconSettings = `<svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
  <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" stroke-width="1.5"/>
  <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.05 3.05l1.06 1.06M10.9 10.9l1.05 1.05M3.05 11.95l1.06-1.06M10.9 4.1l1.05-1.05"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`

const iconMenu = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`

const iconCheck = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const iconCopy = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <rect x="6" y="3" width="7" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
  <path d="M4.5 11H4A1.5 1.5 0 0 1 2.5 9.5V4A1.5 1.5 0 0 1 4 2.5h5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>`

const iconInfo = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5"/>
  <path d="M8 7v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="8" cy="4.5" r="0.8" fill="currentColor"/>
</svg>`

const iconSlashCommand = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="m7 11 2-2-2-2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M11 13h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke="currentColor" stroke-width="1.7"/>
</svg>`

const iconRefresh = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
  <path d="M12.5 7.5a5 5 0 1 1-1.47-3.53" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12.5 2.5v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const iconSparkles = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 2v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M22 4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="4" cy="20" r="1.6" fill="currentColor"/>
</svg>`

const iconChevronRight = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const iconDownload = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 4v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`

const iconClose = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`

const codexIconURL = '/codex-icon.png'
const geminiIconURL = '/gemini-icon.png'
const claudeIconURL = '/claude-icon.png'
const kimiIconURL = '/kimi-icon.png'
const opencodeIconURL = '/opencode-icon.png'
const qwenIconURL = '/qwen-icon.png'

const defaultConfigCatalogCacheKey = '__default__'
const threadConfigCache = new Map<string, ConfigOption[]>()
const agentConfigCatalogCache = new Map<string, ConfigOption[]>()
const agentConfigCatalogInFlight = new Map<string, Promise<ConfigOption[]>>()
const agentSlashCommandsCache = new Map<string, SlashCommand[]>()
const agentSlashCommandsInFlight = new Map<string, Promise<SlashCommand[]>>()
const threadConfigSwitching = new Set<string>()
const sessionSwitchingThreads = new Set<string>()
const freshSessionNonceByThread = new Map<string, string>()
let slashCommandSelectedIndex = 0

interface SessionPanelState {
  supported: boolean | null
  sessions: SessionInfo[]
  nextCursor: string
  loading: boolean
  loadingMore: boolean
  error: string
}

const sessionPanelStateByThread = new Map<string, SessionPanelState>()
const sessionPanelRequestSeqByThread = new Map<string, number>()
const sessionPanelScrollTopByThread = new Map<string, number>()
let sessionPanelRequestSeq = 0
const pendingUploadsByThread = new Map<string, UploadedAsset[]>()
const composerDraftByThread = new Map<string, string>()
const uploadInFlightThreads = new Set<string>()
const attachmentObjectURLCache = new Map<string, string>()
const attachmentObjectURLInFlight = new Map<string, Promise<string>>()

function cloneConfigOptions(options: ConfigOption[]): ConfigOption[] {
  return options.map(option => ({
    ...option,
    options: [...(option.options ?? [])],
  }))
}

function normalizeConfigOptions(options: ConfigOption[], includeCurrentValue = true): ConfigOption[] {
  const byId = new Set<string>()
  const normalized: ConfigOption[] = []

  for (const rawOption of options) {
    const id = rawOption.id?.trim() ?? ''
    if (!id || byId.has(id)) continue
    byId.add(id)

    const seenValue = new Set<string>()
    const values: ConfigOptionValue[] = []
    for (const rawValue of rawOption.options ?? []) {
      const value = rawValue.value?.trim() ?? ''
      if (!value || seenValue.has(value)) continue
      seenValue.add(value)
      values.push({
        value,
        name: (rawValue.name || value).trim() || value,
        description: rawValue.description?.trim() || undefined,
      })
    }

    const currentValue = rawOption.currentValue?.trim() ?? ''
    if (includeCurrentValue && currentValue && !seenValue.has(currentValue)) {
      values.unshift({ value: currentValue, name: currentValue })
      seenValue.add(currentValue)
    }

    normalized.push({
      id,
      category: rawOption.category?.trim() || undefined,
      name: rawOption.name?.trim() || id,
      description: rawOption.description?.trim() || undefined,
      type: rawOption.type?.trim() || undefined,
      currentValue,
      options: values,
    })
  }
  return normalized
}

function normalizeConfigCatalogOptions(options: ConfigOption[]): ConfigOption[] {
  return normalizeConfigOptions(options, false).map(option => ({
    ...option,
    currentValue: '',
    options: [...(option.options ?? [])],
  }))
}

function normalizeAgentConfigCatalogKey(agentId: string, modelId = ''): string {
  const normalizedAgentID = agentId.trim().toLowerCase()
  if (!normalizedAgentID) return ''
  const normalizedModelID = modelId.trim() || defaultConfigCatalogCacheKey
  return `${normalizedAgentID}::${normalizedModelID}`
}

function clonePlanEntries(entries: PlanEntry[] | null | undefined): PlanEntry[] | undefined {
  if (!entries?.length) return undefined

  const cloned: PlanEntry[] = []
  for (const entry of entries) {
    const content = entry.content?.trim() ?? ''
    if (!content) continue
    cloned.push({
      content,
      status: entry.status?.trim() || undefined,
      priority: entry.priority?.trim() || undefined,
    })
  }
  return cloned.length ? cloned : undefined
}

function cloneJSONValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

let toolCallPreId = 0

function nextToolCallPreID(): string {
  toolCallPreId += 1
  return `tool-call-pre-${toolCallPreId}`
}

function cloneToolCalls(toolCalls: ToolCall[] | null | undefined): ToolCall[] | undefined {
  if (!toolCalls?.length) return undefined

  const cloned: ToolCall[] = []
  const seen = new Set<string>()
  for (const rawToolCall of toolCalls) {
    const toolCallId = rawToolCall.toolCallId?.trim() ?? ''
    if (!toolCallId || seen.has(toolCallId)) continue
    seen.add(toolCallId)
    cloned.push({
      toolCallId,
      title: rawToolCall.title?.trim() || undefined,
      kind: rawToolCall.kind?.trim() || undefined,
      status: rawToolCall.status?.trim() || undefined,
      content: Array.isArray(rawToolCall.content) ? cloneJSONValue(rawToolCall.content) : undefined,
      locations: Array.isArray(rawToolCall.locations) ? cloneJSONValue(rawToolCall.locations) : undefined,
      rawInput: rawToolCall.rawInput === undefined ? undefined : cloneJSONValue(rawToolCall.rawInput),
      rawOutput: rawToolCall.rawOutput === undefined ? undefined : cloneJSONValue(rawToolCall.rawOutput),
    })
  }
  return cloned.length ? cloned : undefined
}

function applyToolCallEvent(toolCalls: ToolCall[], payload: Record<string, unknown>): ToolCall[] {
  const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId.trim() : ''
  if (!toolCallId) return cloneToolCalls(toolCalls) ?? []

  const next = cloneToolCalls(toolCalls) ?? []
  const existingIndex = next.findIndex(toolCall => toolCall.toolCallId === toolCallId)
  const current: ToolCall = existingIndex >= 0 ? next[existingIndex] : { toolCallId }
  const merged: ToolCall = { ...current, toolCallId }

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    merged.title = typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : undefined
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'kind')) {
    merged.kind = typeof payload.kind === 'string' && payload.kind.trim()
      ? payload.kind.trim()
      : undefined
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    merged.status = typeof payload.status === 'string' && payload.status.trim()
      ? payload.status.trim()
      : undefined
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'content')) {
    merged.content = Array.isArray(payload.content) ? cloneJSONValue(payload.content) : undefined
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'locations')) {
    merged.locations = Array.isArray(payload.locations) ? cloneJSONValue(payload.locations) : undefined
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'rawInput')) {
    merged.rawInput = payload.rawInput === undefined || payload.rawInput === null
      ? undefined
      : cloneJSONValue(payload.rawInput)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'rawOutput')) {
    merged.rawOutput = payload.rawOutput === undefined || payload.rawOutput === null
      ? undefined
      : cloneJSONValue(payload.rawOutput)
  }

  if (existingIndex >= 0) {
    next[existingIndex] = merged
  } else {
    next.push(merged)
  }
  return next
}

function hasReasoningText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeAgentKey(agentId: string): string {
  return agentId.trim().toLowerCase()
}

function cloneSlashCommands(commands: SlashCommand[] | null | undefined): SlashCommand[] {
  if (!commands?.length) return []

  const cloned: SlashCommand[] = []
  const seen = new Set<string>()
  for (const command of commands) {
    const name = command.name?.trim() ?? ''
    if (!name || seen.has(name)) continue
    seen.add(name)
    cloned.push({
      name,
      description: command.description?.trim() || undefined,
      inputHint: command.inputHint?.trim() || undefined,
    })
  }
  return cloned
}

function cacheAgentSlashCommands(agentId: string, commands: SlashCommand[]): SlashCommand[] {
  const key = normalizeAgentKey(agentId)
  const normalized = cloneSlashCommands(commands)
  if (key) {
    agentSlashCommandsCache.set(key, normalized)
  }
  return normalized
}

function hasAgentSlashCommandsCache(agentId: string): boolean {
  const key = normalizeAgentKey(agentId)
  return !!key && agentSlashCommandsCache.has(key)
}

function getAgentSlashCommands(agentId: string): SlashCommand[] {
  const key = normalizeAgentKey(agentId)
  if (!key) return []
  return cloneSlashCommands(agentSlashCommandsCache.get(key))
}

function parsePlanEntries(value: unknown): PlanEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed: PlanEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const content = typeof entry.content === 'string' ? entry.content : ''
    if (!content.trim()) continue
    parsed.push({
      content,
      status: typeof entry.status === 'string' ? entry.status : undefined,
      priority: typeof entry.priority === 'string' ? entry.priority : undefined,
    })
  }
  return clonePlanEntries(parsed)
}

function extractTurnPlanEntries(events: TurnEvent[] | undefined): PlanEntry[] | undefined {
  let latest: PlanEntry[] | undefined
  for (const event of events ?? []) {
    if (event.type !== 'plan_update') continue
    latest = parsePlanEntries(event.data.entries)
  }
  return clonePlanEntries(latest)
}

function extractTurnToolCalls(events: TurnEvent[] | undefined): ToolCall[] | undefined {
  let toolCalls: ToolCall[] = []
  for (const event of events ?? []) {
    if (event.type !== 'tool_call' && event.type !== 'tool_call_update') continue
    toolCalls = applyToolCallEvent(toolCalls, event.data)
  }
  return cloneToolCalls(toolCalls)
}

function extractTurnReasoning(events: TurnEvent[] | undefined): string {
  let reasoning = ''
  for (const event of events ?? []) {
    if (event.type !== 'reasoning_delta' && event.type !== 'thought_delta') continue
    if (typeof event.data.delta !== 'string') continue
    reasoning += event.data.delta
  }
  return reasoning
}

function hasAgentConfigCatalog(agentId: string, modelId = ''): boolean {
  const key = normalizeAgentConfigCatalogKey(agentId, modelId)
  return !!key && agentConfigCatalogCache.has(key)
}

function getAgentConfigCatalog(agentId: string, modelId = ''): ConfigOption[] {
  const key = normalizeAgentConfigCatalogKey(agentId, modelId)
  if (!key) return []
  return agentConfigCatalogCache.get(key) ?? []
}

function cacheAgentConfigCatalog(agentId: string, modelId: string, options: ConfigOption[]): ConfigOption[] {
  const cacheKey = normalizeAgentConfigCatalogKey(agentId, modelId)
  const normalized = normalizeConfigCatalogOptions(options)
  if (cacheKey) {
    agentConfigCatalogCache.set(cacheKey, normalized)
  }
  return normalized
}

function cacheThreadConfigOptions(thread: Thread, options: ConfigOption[], selectedModelID?: string): ConfigOption[] {
  const normalized = normalizeConfigOptions(options)
  threadConfigCache.set(thread.threadId, normalized)
  cacheAgentConfigCatalog(thread.agent ?? '', selectedModelID ?? fallbackThreadModelID(thread), normalized)
  return normalized
}

function findModelOption(options: ConfigOption[]): ConfigOption | null {
  for (const option of options) {
    const category = option.category?.trim().toLowerCase() ?? ''
    const id = option.id.trim().toLowerCase()
    if (category === 'model' || id === 'model') {
      return option
    }
  }
  return null
}

function fallbackThreadModelID(thread: Thread): string {
  const model = thread.agentOptions?.modelId
  return typeof model === 'string' ? model.trim() : ''
}

function threadSessionID(thread: Thread | null | undefined): string {
  const value = thread?.agentOptions?.sessionId
  return typeof value === 'string' ? value.trim() : ''
}

function threadSessionScopeKey(threadId: string, sessionID = ''): string {
  return `${threadId}::${sessionID.trim()}`
}

function threadFreshSessionScopeKey(threadId: string): string {
  const nonce = freshSessionNonceByThread.get(threadId)?.trim() ?? ''
  if (!nonce) return ''
  return threadSessionScopeKey(threadId, `@fresh:${nonce}`)
}

function isFreshSessionScopeKey(scopeKey: string): boolean {
  const parts = scopeKey.split('::', 2)
  return parts.length === 2 && parts[1].startsWith('@fresh:')
}

function threadChatScopeKey(thread: Thread | null | undefined): string {
  if (!thread) return ''
  const sessionID = threadSessionID(thread)
  if (sessionID) {
    return threadSessionScopeKey(thread.threadId, sessionID)
  }
  return threadFreshSessionScopeKey(thread.threadId) || threadSessionScopeKey(thread.threadId)
}

function buildThreadAgentOptionsWithSession(
  base: Record<string, unknown>,
  sessionID: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base }
  sessionID = sessionID.trim()
  if (sessionID) {
    next.sessionId = sessionID
  } else {
    delete next.sessionId
  }
  return next
}

function activateFreshSessionScope(
  threadId: string,
  messages: Record<string, Message[]>,
): Record<string, Message[]> {
  freshSessionNonceByThread.set(threadId, generateUUID())
  const scopeKey = threadFreshSessionScopeKey(threadId)
  loadedHistoryScopeKeys.add(scopeKey)
  if (Object.prototype.hasOwnProperty.call(messages, scopeKey)) {
    return messages
  }
  return {
    ...messages,
    [scopeKey]: [],
  }
}

async function loadThreadConfigOptions(threadId: string): Promise<ConfigOption[]> {
  const thread = store.get().threads.find(item => item.threadId === threadId)
  if (!thread) return []
  const selectedModelID = fallbackThreadModelID(thread)
  const catalogKey = normalizeAgentConfigCatalogKey(thread.agent ?? '', selectedModelID)

  if (threadConfigCache.has(thread.threadId) || hasAgentConfigCatalog(thread.agent ?? '', selectedModelID)) {
    return cloneConfigOptions(getThreadConfigOptionsForRender(thread))
  }

  const inFlight = catalogKey ? agentConfigCatalogInFlight.get(catalogKey) : undefined
  if (inFlight) {
    return inFlight.then(() => cloneConfigOptions(getThreadConfigOptionsForRender(thread)))
  }

  const task = api.getThreadConfigOptions(thread.threadId)
    .then(options => {
      cacheThreadConfigOptions(thread, options, selectedModelID)
      return cloneConfigOptions(getThreadConfigOptionsForRender(thread))
    })
    .finally(() => {
      if (catalogKey) agentConfigCatalogInFlight.delete(catalogKey)
    })

  if (catalogKey) agentConfigCatalogInFlight.set(catalogKey, task)
  return task
}

async function loadThreadSlashCommands(threadId: string, force = false): Promise<SlashCommand[]> {
  const thread = store.get().threads.find(item => item.threadId === threadId)
  if (!thread) return []

  const agentKey = normalizeAgentKey(thread.agent ?? '')
  if (!agentKey) return []
  if (!force && agentSlashCommandsCache.has(agentKey)) {
    return getAgentSlashCommands(thread.agent ?? '')
  }

  const inFlight = agentSlashCommandsInFlight.get(agentKey)
  if (inFlight) {
    return inFlight.then(commands => cloneSlashCommands(commands))
  }

  const task = api.getThreadSlashCommands(thread.threadId)
    .then(commands => cacheAgentSlashCommands(thread.agent ?? '', commands))
    .finally(() => {
      agentSlashCommandsInFlight.delete(agentKey)
    })

  agentSlashCommandsInFlight.set(agentKey, task)
  return task.then(commands => cloneSlashCommands(commands))
}

// ── Active stream state (DOM-managed, per chat scope) ──────────────────────

/**
 * Non-null while a streaming bubble is live in the DOM.
 * We use this to prevent updateMessageList() from wiping the in-progress bubble.
 */
let activeStreamMsgId: string | null = null
let activeStreamScopeKey = ''
const streamsByScope = new Map<string, TurnStream>()
const streamBufferByScope = new Map<string, string>()
const streamPlanByScope = new Map<string, PlanEntry[]>()
const streamToolCallsByScope = new Map<string, ToolCall[]>()
const streamReasoningByScope = new Map<string, string>()
const streamStartedAtByScope = new Map<string, string>()
type PendingPermission = PermissionRequiredPayload & { deadlineMs: number }
const pendingPermissionsByScope = new Map<string, Map<string, PendingPermission>>()
let slashCommandLookupThreadId: string | null = null

/** Last threadId that triggered a full chat-area re-render. */
let lastRenderThreadId: string | null = null
/** Last (threadId, sessionId) scope rendered into the chat pane. */
let lastRenderChatScopeKey = ''
/** Chat scope keys whose filtered history was loaded. */
const loadedHistoryScopeKeys = new Set<string>()
/** Message ids whose final Thinking panel is currently expanded in the UI. */
const expandedReasoningMessageIds = new Set<string>()
let openThreadActionMenuId: string | null = null
let renamingThreadId: string | null = null
let renamingThreadDraft = ''

// ── Scroll helpers ────────────────────────────────────────────────────────

/** True when the list is within 100px of its bottom — safe to auto-scroll. */
function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 100
}

function syncScrollBottomButton(listEl: HTMLElement): void {
  const scrollBtn = document.getElementById('scroll-bottom-btn')
  if (scrollBtn) scrollBtn.style.display = isNearBottom(listEl) ? 'none' : ''
}

function restoreMessageListScroll(listEl: HTMLElement, stickToBottom: boolean, previousScrollTop: number): void {
  if (stickToBottom) {
    listEl.scrollTop = listEl.scrollHeight
  } else {
    const maxScrollTop = Math.max(listEl.scrollHeight - listEl.clientHeight, 0)
    listEl.scrollTop = Math.min(previousScrollTop, maxScrollTop)
  }
  syncScrollBottomButton(listEl)
}

// ── Message store helpers ─────────────────────────────────────────────────

function addMessageToStore(scopeKey: string, msg: Message): void {
  const { messages } = store.get()
  store.set({ messages: { ...messages, [scopeKey]: [...(messages[scopeKey] ?? []), msg] } })
}

function omitThreadCompletionBadge(
  badges: Record<string, boolean>,
  threadId: string,
): Record<string, boolean> {
  if (!threadId || !badges[threadId]) return badges
  const next = { ...badges }
  delete next[threadId]
  return next
}

function markThreadCompletionBadge(threadId: string): void {
  if (!threadId) return
  const state = store.get()
  if (state.activeThreadId === threadId || state.threadCompletionBadges[threadId]) return
  store.set({
    threadCompletionBadges: {
      ...state.threadCompletionBadges,
      [threadId]: true,
    },
  })
}

function activateThread(threadId: string): void {
  if (!threadId) return
  const state = store.get()
  const clearedThreadActions = resetThreadActionMenuState()
  const nextThreadCompletionBadges = omitThreadCompletionBadge(state.threadCompletionBadges, threadId)
  if (threadId === state.activeThreadId) {
    if (nextThreadCompletionBadges !== state.threadCompletionBadges) {
      store.set({ threadCompletionBadges: nextThreadCompletionBadges })
    } else if (clearedThreadActions) {
      updateThreadList()
    }
    return
  }

  store.set({
    activeThreadId: threadId,
    threadCompletionBadges: nextThreadCompletionBadges,
  })
}

function resolveActiveThreadId(threads: Thread[], currentActiveThreadId: string | null): string | null {
  if (!threads.length) return null
  if (currentActiveThreadId && threads.some(thread => thread.threadId === currentActiveThreadId)) {
    return currentActiveThreadId
  }
  return threads[0]?.threadId ?? null
}

function resetThreadActionMenuState(): boolean {
  const changed = openThreadActionMenuId !== null || renamingThreadId !== null || renamingThreadDraft !== ''
  if (!changed) return false
  openThreadActionMenuId = null
  renamingThreadId = null
  renamingThreadDraft = ''
  return true
}

function cancelThreadRename(threadId: string): void {
  if (renamingThreadId !== threadId) return
  renamingThreadId = null
  renamingThreadDraft = ''
  updateThreadList()
}

function toggleThreadActionMenu(threadId: string): void {
  if (!threadId) return
  if (openThreadActionMenuId === threadId) {
    resetThreadActionMenuState()
    updateThreadList()
    return
  }

  openThreadActionMenuId = threadId
  renamingThreadId = null
  renamingThreadDraft = ''
  updateThreadList()
}

function beginRenameThread(threadId: string): void {
  const thread = store.get().threads.find(item => item.threadId === threadId)
  if (!thread) return

  openThreadActionMenuId = threadId
  renamingThreadId = threadId
  renamingThreadDraft = thread.title || threadTitle(thread)
  updateThreadList()
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>('.thread-rename-input')
    input?.focus()
    input?.select()
  })
}

function getThreadMenuTrigger(threadId: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.thread-item-menu-trigger'))
    .find(btn => btn.dataset.threadId === threadId) ?? null
}

function renderThreadActionPopover(t: Thread): string {
  const isOpen = openThreadActionMenuId === t.threadId
  if (!isOpen) return ''

  if (renamingThreadId === t.threadId) {
    return `
      <div class="thread-action-popover thread-action-popover--rename" data-thread-id="${escHtml(t.threadId)}">
        <form class="thread-rename-form" data-thread-id="${escHtml(t.threadId)}">
          <input
            class="thread-rename-input"
            data-thread-id="${escHtml(t.threadId)}"
            type="text"
            value="${escHtml(renamingThreadDraft)}"
            placeholder="Agent 名称"
            maxlength="120"
            aria-label="重命名 Agent"
          />
          <div class="thread-rename-actions">
            <button class="btn btn-primary btn-sm" type="submit">保存</button>
            <button class="btn btn-ghost btn-sm thread-rename-cancel-btn" type="button" data-thread-id="${escHtml(t.threadId)}">
              取消
            </button>
          </div>
        </form>
      </div>`
  }

  return `
    <div class="thread-action-popover thread-action-menu" data-thread-id="${escHtml(t.threadId)}" role="menu" aria-label="Agent 操作">
      <button class="thread-action-menu-item" type="button" data-thread-id="${escHtml(t.threadId)}" data-action="rename" role="menuitem">
        重命名
      </button>
      <button
        class="thread-action-menu-item thread-action-menu-item--danger"
        type="button"
        data-thread-id="${escHtml(t.threadId)}"
        data-action="delete"
        role="menuitem"
      >
        删除
      </button>
    </div>`
}

function renderThreadActionLayer(): void {
  const layer = document.getElementById('thread-action-layer')
  if (!layer) return
  if (!openThreadActionMenuId) {
    layer.innerHTML = ''
    layer.hidden = true
    return
  }

  const thread = store.get().threads.find(item => item.threadId === openThreadActionMenuId)
  const trigger = getThreadMenuTrigger(openThreadActionMenuId)
  const sidebar = document.getElementById('sidebar')
  if (!thread || !trigger || !sidebar) {
    resetThreadActionMenuState()
    layer.innerHTML = ''
    layer.hidden = true
    return
  }

  layer.hidden = false
  layer.innerHTML = renderThreadActionPopover(thread)

  const popover = layer.querySelector<HTMLElement>('.thread-action-popover')
  if (!popover) return

  const margin = 8
  const offset = 8
  const triggerRect = trigger.getBoundingClientRect()
  const sidebarRect = sidebar.getBoundingClientRect()
  const popoverWidth = popover.offsetWidth
  const popoverHeight = popover.offsetHeight
  const maxLeft = Math.max(margin, sidebar.clientWidth - popoverWidth - margin)
  const maxTop = Math.max(margin, sidebar.clientHeight - popoverHeight - margin)

  let left = triggerRect.right - sidebarRect.left - popoverWidth
  left = Math.min(Math.max(left, margin), maxLeft)

  let top = triggerRect.bottom - sidebarRect.top + offset
  if (top > maxTop) {
    top = triggerRect.top - sidebarRect.top - popoverHeight - offset
  }
  top = Math.min(Math.max(top, margin), maxTop)

  popover.style.left = `${left}px`
  popover.style.top = `${top}px`

  popover.addEventListener('click', e => e.stopPropagation())
  popover.addEventListener('keydown', e => e.stopPropagation())

  layer.querySelectorAll<HTMLButtonElement>('.thread-action-menu-item').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      const id = btn.dataset.threadId ?? ''
      if (!id) return
      if (btn.dataset.action === 'rename') {
        beginRenameThread(id)
        return
      }
      if (btn.dataset.action === 'delete') {
        void handleDeleteThread(id)
      }
    })
  })

  layer.querySelectorAll<HTMLFormElement>('.thread-rename-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault()
      e.stopPropagation()
      const threadId = form.dataset.threadId ?? ''
      const input = form.querySelector<HTMLInputElement>('.thread-rename-input')
      if (!threadId || !input) return

      const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'))
      controls.forEach(control => { control.disabled = true })
      void handleRenameThread(threadId, input.value).finally(() => {
        controls.forEach(control => {
          if (control.isConnected) control.disabled = false
        })
      })
    })
  })

  layer.querySelectorAll<HTMLInputElement>('.thread-rename-input').forEach(input => {
    input.addEventListener('input', () => {
      const threadId = input.dataset.threadId ?? ''
      if (!threadId || renamingThreadId !== threadId) return
      renamingThreadDraft = input.value
    })
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        const threadId = input.dataset.threadId ?? ''
        if (threadId) cancelThreadRename(threadId)
      }
    })
  })

  layer.querySelectorAll<HTMLButtonElement>('.thread-rename-cancel-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      const id = btn.dataset.threadId ?? ''
      if (!id) return
      cancelThreadRename(id)
    })
  })
}

function activeChatScopeKey(): string {
  const { activeThreadId, threads } = store.get()
  if (!activeThreadId) return ''
  const thread = threads.find(item => item.threadId === activeThreadId)
  return threadChatScopeKey(thread)
}

function getScopeStreamState(scopeKey: string): StreamState | null {
  if (!scopeKey) return null
  return store.get().streamStates[scopeKey] ?? null
}

function getActiveChatStreamState(): StreamState | null {
  return getScopeStreamState(activeChatScopeKey())
}

function hasMountedActiveStream(scopeKey: string): boolean {
  return !!scopeKey && activeStreamMsgId !== null && activeStreamScopeKey === scopeKey
}

function hasThreadStream(threadId: string | null): boolean {
  if (!threadId) return false
  return Object.values(store.get().streamStates).some(streamState => streamState.threadId === threadId)
}

function setScopeStreamState(scopeKey: string, next: StreamState | null): void {
  const { streamStates } = store.get()
  const updated = { ...streamStates }
  if (next) {
    updated[scopeKey] = next
  } else {
    delete updated[scopeKey]
  }
  store.set({ streamStates: updated })
}

function appendOrRestoreStreamingBubble(thread: Thread): void {
  const scopeKey = threadChatScopeKey(thread)
  const streamState = getScopeStreamState(scopeKey)
  if (!streamState) return

  const listEl = document.getElementById('message-list')
  if (!listEl) return

  const bubbleID = `bubble-${streamState.messageId}`
  if (document.getElementById(bubbleID)) {
    activeStreamMsgId = streamState.messageId
    activeStreamScopeKey = scopeKey
    return
  }

  listEl.querySelector('.empty-state')?.remove()
  listEl.querySelector('.message-list-loading')?.remove()
  const startedAt = streamStartedAtByScope.get(scopeKey) ?? new Date().toISOString()
  const avatar = renderAgentAvatar(thread.agent ?? '', 'message')
  const div = document.createElement('div')
  div.className = 'message message--agent'
  div.dataset.msgId = streamState.messageId
  const livePlanEntries = streamPlanByScope.get(scopeKey)
  const liveToolCalls = streamToolCallsByScope.get(scopeKey)
  const liveReasoning = streamReasoningByScope.get(scopeKey) ?? ''
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-group">
      ${renderStreamingBubbleHTML(streamState.messageId, '', livePlanEntries, liveToolCalls, liveReasoning)}
      <div class="message-meta">
        <span class="message-time">${formatTimestamp(startedAt)}</span>
      </div>
    </div>`
  bindMarkdownControls(div)

  listEl.appendChild(div)
  activeStreamMsgId = streamState.messageId
  activeStreamScopeKey = scopeKey

  const buffered = streamBufferByScope.get(scopeKey) ?? ''
  if (buffered) {
    updateStreamingBubbleContent(streamState.messageId, buffered)
  }
  updateStreamingBubbleToolCalls(streamState.messageId, liveToolCalls)
  updateStreamingBubbleReasoning(streamState.messageId, liveReasoning)
  updateStreamingBubblePlan(streamState.messageId, livePlanEntries)
  listEl.scrollTop = listEl.scrollHeight
}

function clearScopeStreamRuntime(scopeKey: string): void {
  streamsByScope.delete(scopeKey)
  streamBufferByScope.delete(scopeKey)
  streamPlanByScope.delete(scopeKey)
  streamToolCallsByScope.delete(scopeKey)
  streamReasoningByScope.delete(scopeKey)
  streamStartedAtByScope.delete(scopeKey)
  setScopeStreamState(scopeKey, null)
  if (activeChatScopeKey() === scopeKey) {
    activeStreamMsgId = null
    activeStreamScopeKey = ''
  }
}

function rebindScopeRuntime(oldScopeKey: string, nextScopeKey: string, nextSessionID: string): void {
  oldScopeKey = oldScopeKey.trim()
  nextScopeKey = nextScopeKey.trim()
  nextSessionID = nextSessionID.trim()
  if (!oldScopeKey || !nextScopeKey || oldScopeKey === nextScopeKey) return

  if (streamsByScope.has(oldScopeKey)) {
    const stream = streamsByScope.get(oldScopeKey)
    streamsByScope.delete(oldScopeKey)
    if (stream) streamsByScope.set(nextScopeKey, stream)
  }
  if (streamBufferByScope.has(oldScopeKey)) {
    const buffered = streamBufferByScope.get(oldScopeKey) ?? ''
    streamBufferByScope.delete(oldScopeKey)
    streamBufferByScope.set(nextScopeKey, buffered)
  }
  if (streamPlanByScope.has(oldScopeKey)) {
    const plans = streamPlanByScope.get(oldScopeKey) ?? []
    streamPlanByScope.delete(oldScopeKey)
    streamPlanByScope.set(nextScopeKey, plans)
  }
  if (streamToolCallsByScope.has(oldScopeKey)) {
    const toolCalls = streamToolCallsByScope.get(oldScopeKey) ?? []
    streamToolCallsByScope.delete(oldScopeKey)
    streamToolCallsByScope.set(nextScopeKey, toolCalls)
  }
  if (streamReasoningByScope.has(oldScopeKey)) {
    const reasoning = streamReasoningByScope.get(oldScopeKey) ?? ''
    streamReasoningByScope.delete(oldScopeKey)
    streamReasoningByScope.set(nextScopeKey, reasoning)
  }
  if (streamStartedAtByScope.has(oldScopeKey)) {
    const startedAt = streamStartedAtByScope.get(oldScopeKey) ?? ''
    streamStartedAtByScope.delete(oldScopeKey)
    streamStartedAtByScope.set(nextScopeKey, startedAt)
  }
  if (pendingPermissionsByScope.has(oldScopeKey)) {
    const pending = pendingPermissionsByScope.get(oldScopeKey)
    pendingPermissionsByScope.delete(oldScopeKey)
    if (pending) pendingPermissionsByScope.set(nextScopeKey, pending)
  }
  if (loadedHistoryScopeKeys.has(oldScopeKey)) {
    loadedHistoryScopeKeys.delete(oldScopeKey)
    loadedHistoryScopeKeys.add(nextScopeKey)
  }
  if (activeStreamScopeKey === oldScopeKey) {
    activeStreamScopeKey = nextScopeKey
  }

  const state = store.get()
  const nextMessages = { ...state.messages }
  const oldMessages = nextMessages[oldScopeKey] ?? []
  if (oldMessages.length) {
    nextMessages[nextScopeKey] = nextMessages[nextScopeKey]?.length
      ? [...nextMessages[nextScopeKey], ...oldMessages]
      : oldMessages
  }
  delete nextMessages[oldScopeKey]

  const nextStreamStates = { ...state.streamStates }
  const streamState = nextStreamStates[oldScopeKey]
  if (streamState) {
    nextStreamStates[nextScopeKey] = { ...streamState, sessionId: nextSessionID }
    delete nextStreamStates[oldScopeKey]
  }

  store.set({
    messages: nextMessages,
    streamStates: nextStreamStates,
  })
}

function upsertPendingPermission(scopeKey: string, event: PermissionRequiredPayload): PendingPermission {
  let byID = pendingPermissionsByScope.get(scopeKey)
  if (!byID) {
    byID = new Map<string, PendingPermission>()
    pendingPermissionsByScope.set(scopeKey, byID)
  }
  const existing = byID.get(event.permissionId)
  if (existing) return existing

  const pending: PendingPermission = {
    ...event,
    deadlineMs: Date.now() + PERMISSION_TIMEOUT_MS,
  }
  byID.set(event.permissionId, pending)
  return pending
}

function removePendingPermission(scopeKey: string, permissionId: string): void {
  const byID = pendingPermissionsByScope.get(scopeKey)
  if (!byID) return
  byID.delete(permissionId)
  if (byID.size === 0) {
    pendingPermissionsByScope.delete(scopeKey)
  }
}

function clearPendingPermissions(scopeKey: string): void {
  pendingPermissionsByScope.delete(scopeKey)
}

function mountPendingPermissionCard(scopeKey: string, pending: PendingPermission): void {
  if (activeChatScopeKey() !== scopeKey) return
  if (document.getElementById(`perm-card-${pending.permissionId}`)) return

  const listEl = document.getElementById('message-list')
  if (!listEl) return

  mountPermissionCard(listEl, pending, {
    deadlineMs: pending.deadlineMs,
    onResolved: () => removePendingPermission(scopeKey, pending.permissionId),
  })
}

function renderPendingPermissionCards(scopeKey: string): void {
  const byID = pendingPermissionsByScope.get(scopeKey)
  if (!byID) return
  byID.forEach(pending => mountPendingPermissionCard(scopeKey, pending))
}

function emptySessionPanelState(): SessionPanelState {
  return {
    supported: null,
    sessions: [],
    nextCursor: '',
    loading: false,
    loadingMore: false,
    error: '',
  }
}

function sessionPanelState(threadId: string): SessionPanelState {
  return sessionPanelStateByThread.get(threadId) ?? emptySessionPanelState()
}

function setSessionPanelState(threadId: string, next: SessionPanelState): void {
  sessionPanelStateByThread.set(threadId, {
    ...next,
    sessions: dedupeSessionItems(next.sessions),
    nextCursor: next.nextCursor.trim(),
    error: next.error.trim(),
  })
}

function dedupeSessionItems(items: SessionInfo[]): SessionInfo[] {
  const deduped: SessionInfo[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const sessionId = item.sessionId?.trim() ?? ''
    if (!sessionId || seen.has(sessionId)) continue
    seen.add(sessionId)
    deduped.push({
      ...item,
      sessionId,
      cwd: item.cwd?.trim() || undefined,
      title: item.title?.trim() || undefined,
      updatedAt: item.updatedAt?.trim() || undefined,
    })
  }
  return deduped
}

function updateThreadSessionID(threadId: string, sessionID: string): void {
  sessionID = sessionID.trim()
  const state = store.get()
  const nextThreads = state.threads.map(thread => {
    if (thread.threadId !== threadId) return thread
    return {
      ...thread,
      agentOptions: buildThreadAgentOptionsWithSession(thread.agentOptions, sessionID),
    }
  })
  store.set({ threads: nextThreads })
}

async function loadThreadSessions(threadId: string, append = false): Promise<void> {
  const thread = store.get().threads.find(item => item.threadId === threadId)
  if (!thread) return

  const current = sessionPanelState(threadId)
  if (append) {
    if (!current.nextCursor || current.loadingMore || current.loading) return
    setSessionPanelState(threadId, {
      ...current,
      loadingMore: true,
      error: '',
    })
  } else {
    setSessionPanelState(threadId, {
      ...current,
      loading: true,
      loadingMore: false,
      error: '',
      nextCursor: '',
    })
  }
  updateSessionPanel()

  const requestSeq = ++sessionPanelRequestSeq
  sessionPanelRequestSeqByThread.set(threadId, requestSeq)
  try {
    const response = await api.getThreadSessions(threadId, append ? current.nextCursor : '')
    if (sessionPanelRequestSeqByThread.get(threadId) !== requestSeq) return

    const base = append ? sessionPanelState(threadId).sessions : []
    setSessionPanelState(threadId, {
      supported: response.supported,
      sessions: [...base, ...response.sessions],
      nextCursor: response.nextCursor,
      loading: false,
      loadingMore: false,
      error: '',
    })
  } catch (err) {
    if (sessionPanelRequestSeqByThread.get(threadId) !== requestSeq) return
    const message = err instanceof Error ? err.message : '加载会话失败。'
    setSessionPanelState(threadId, {
      ...sessionPanelState(threadId),
      loading: false,
      loadingMore: false,
      error: message,
    })
  }

  if (store.get().activeThreadId === threadId) {
    updateSessionPanel()
  }
}

async function switchThreadSession(thread: Thread, nextSessionID: string): Promise<void> {
  const targetSessionID = nextSessionID.trim()
  const currentSessionID = threadSessionID(thread)
  if (targetSessionID && currentSessionID === targetSessionID) return
  if (!targetSessionID && !currentSessionID) {
    const state = store.get()
    store.set({
      messages: activateFreshSessionScope(thread.threadId, state.messages),
    })
    return
  }
  if (sessionSwitchingThreads.has(thread.threadId)) return

  sessionSwitchingThreads.add(thread.threadId)
  updateSessionPanel()
  if (store.get().activeThreadId === thread.threadId) {
    updateInputState()
  }
  try {
    const updatedThread = await api.updateThread(thread.threadId, {
      agentOptions: buildThreadAgentOptionsWithSession(thread.agentOptions, targetSessionID),
    })
    const state = store.get()
    const nextMessages = !targetSessionID
      ? activateFreshSessionScope(thread.threadId, state.messages)
      : state.messages
    store.set({
      threads: state.threads.map(item => (item.threadId === thread.threadId ? updatedThread : item)),
      messages: nextMessages,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新会话失败。'
    window.alert(message)
  } finally {
    sessionSwitchingThreads.delete(thread.threadId)
    if (store.get().activeThreadId === thread.threadId) {
      updateInputState()
      updateSessionPanel()
    }
  }
}

function renderSessionItem(item: SessionInfo, active: boolean, loading: boolean): string {
  const title = item.title?.trim() || item.sessionId
  return `
    <button
      class="session-item ${active ? 'session-item--active' : ''}"
      type="button"
      data-session-id="${escHtml(item.sessionId)}"
      aria-pressed="${active ? 'true' : 'false'}"
    >
      <div class="session-item-title-row">
        ${renderSessionStatusIndicator(loading)}
        <div class="session-item-title">${escHtml(title)}</div>
      </div>
    </button>`
}

function renderSessionPanel(mode: 'desktop' | 'mobile' = 'desktop'): string {
  const { activeThreadId, threads, streamStates } = store.get()
  const thread = activeThreadId ? threads.find(item => item.threadId === activeThreadId) : null
  const mobileCloseButton = mode === 'mobile'
    ? `<button
        class="btn btn-icon mobile-session-close-btn"
        type="button"
        title="关闭会话列表"
        aria-label="关闭会话列表">
        ${iconClose}
      </button>`
    : ''
  if (!thread) {
    return `
      <div class="session-panel-header">
        <h3 class="session-panel-title">会话</h3>
        ${mobileCloseButton}
      </div>
      <div class="session-panel-empty">请选择一个 Agent 以浏览 ACP 会话。</div>`
  }

  const state = sessionPanelState(thread.threadId)
  const selectedSessionID = threadSessionID(thread)
  const switching = sessionSwitchingThreads.has(thread.threadId)
  const disabled = switching
  const refreshDisabled = disabled || state.loading || state.loadingMore

  const knownIDs = new Set(state.sessions.map(item => item.sessionId))
  const sessions = [...state.sessions]
  if (selectedSessionID && !knownIDs.has(selectedSessionID)) {
    sessions.unshift({ sessionId: selectedSessionID, title: selectedSessionID })
  }
  const loadingSessionIDs = new Set(
    Object.values(streamStates)
      .filter(streamState => streamState.threadId === thread.threadId && !!streamState.sessionId)
      .map(streamState => streamState.sessionId),
  )

  let bodyHTML = ''
  if (state.loading && !sessions.length) {
    bodyHTML = `<div class="session-panel-empty">正在加载会话…</div>`
  } else if (state.error && !sessions.length) {
    bodyHTML = `<div class="session-panel-empty session-panel-empty--error">${escHtml(state.error)}</div>`
  } else if (state.supported === false) {
    bodyHTML = `<div class="session-panel-empty">该 Agent 不支持 ACP 会话历史。</div>`
  } else {
    const itemsHTML = sessions.length
      ? sessions.map(item => renderSessionItem(
          item,
          item.sessionId === selectedSessionID,
          loadingSessionIDs.has(item.sessionId),
        )).join('')
      : `<div class="session-panel-empty">当前工作目录下没有历史会话。</div>`
    const showMoreHTML = state.nextCursor
      ? `<button class="btn btn-ghost session-show-more-btn" type="button" ${state.loadingMore || disabled ? 'disabled' : ''}>
          ${state.loadingMore ? '正在加载…' : '显示更多'}
        </button>`
      : ''
    bodyHTML = `
      <div class="session-list">${itemsHTML}</div>
      ${showMoreHTML}
      ${state.error && sessions.length
        ? `<div class="session-panel-inline-error">${escHtml(state.error)}</div>`
        : ''}`
  }

  return `
    <div class="session-panel-header">
      <div>
        <h3 class="session-panel-title">会话</h3>
      </div>
      <div class="session-panel-actions">
        <button
          class="btn btn-icon session-refresh-btn ${state.loading ? 'session-refresh-btn--loading' : ''}"
          type="button"
          title="${state.loading ? '正在刷新会话' : '刷新会话'}"
          aria-label="${state.loading ? '正在刷新会话' : '刷新会话'}"
          ${refreshDisabled ? 'disabled' : ''}>
          ${iconRefresh}
        </button>
        <button
          class="btn btn-icon session-new-btn"
          type="button"
          title="新建会话"
          aria-label="新建会话"
          ${disabled ? 'disabled' : ''}>
          ${iconPlus}
        </button>
        ${mobileCloseButton}
      </div>
    </div>
    <div class="session-panel-body">
      ${bodyHTML}
    </div>`
}

function syncSessionPanel(el: HTMLElement, mode: 'desktop' | 'mobile'): void {
  const renderedThreadID = el.dataset.threadId?.trim() ?? ''
  const previousBody = el.querySelector<HTMLElement>('.session-panel-body')
  if (renderedThreadID && previousBody) {
    sessionPanelScrollTopByThread.set(renderedThreadID, previousBody.scrollTop)
  }

  el.innerHTML = renderSessionPanel(mode)
  const { activeThreadId, threads } = store.get()
  const thread = activeThreadId ? threads.find(item => item.threadId === activeThreadId) : null
  if (!thread) {
    delete el.dataset.threadId
    el.querySelector<HTMLButtonElement>('.mobile-session-close-btn')?.addEventListener('click', closeMobileSessionOverlay)
    return
  }

  el.dataset.threadId = thread.threadId
  const nextBody = el.querySelector<HTMLElement>('.session-panel-body')
  if (nextBody) {
    nextBody.scrollTop = sessionPanelScrollTopByThread.get(thread.threadId) ?? 0
  }

  const state = sessionPanelState(thread.threadId)
  if (state.supported === null && !state.loading && !state.loadingMore && !state.error) {
    void loadThreadSessions(thread.threadId)
  }

  el.querySelector<HTMLButtonElement>('.session-refresh-btn')?.addEventListener('click', () => {
    void loadThreadSessions(thread.threadId)
  })

  el.querySelector<HTMLButtonElement>('.session-new-btn')?.addEventListener('click', () => {
    if (mode === 'mobile') closeMobileSessionOverlay()
    void switchThreadSession(thread, '')
  })

  el.querySelectorAll<HTMLButtonElement>('.session-item[data-session-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionID = btn.dataset.sessionId?.trim() ?? ''
      if (!sessionID || sessionID === threadSessionID(thread)) return
      if (mode === 'mobile') closeMobileSessionOverlay()
      void switchThreadSession(thread, sessionID)
    })
  })

  el.querySelector<HTMLButtonElement>('.session-show-more-btn')?.addEventListener('click', () => {
    void loadThreadSessions(thread.threadId, true)
  })

  el.querySelector<HTMLButtonElement>('.mobile-session-close-btn')?.addEventListener('click', closeMobileSessionOverlay)
}

function updateSessionPanel(): void {
  const desktopEl = document.getElementById('session-sidebar')
  if (desktopEl) syncSessionPanel(desktopEl, 'desktop')

  const mobileEl = document.getElementById('mobile-session-panel')
  if (mobileEl) syncSessionPanel(mobileEl, 'mobile')
}

// ── Thread list rendering ─────────────────────────────────────────────────

function skeletonItems(): string {
  return Array.from({ length: 3 }, () => `
    <div class="thread-skeleton">
      <div class="skeleton thread-skeleton-avatar"></div>
      <div class="thread-skeleton-lines">
        <div class="skeleton thread-skeleton-line" style="width:70%"></div>
        <div class="skeleton thread-skeleton-line" style="width:50%"></div>
      </div>
    </div>`).join('')
}

function threadTitle(t: Thread): string {
  if (t.title) return t.title
  return t.cwd.split('/').filter(Boolean).pop() ?? t.cwd
}

type ConfigPickerState = 'loading' | 'empty' | 'ready'

interface ConfigPickerOption {
  value: string
  name: string
  description: string
}

interface ConfigPickerLabels {
  loadingLabel: string
  emptyLabel: string
}

interface ConfigPickerData {
  state: ConfigPickerState
  configId: string
  selectedValue: string
  selectedLabel: string
  options: ConfigPickerOption[]
}

function findReasoningOption(options: ConfigOption[]): ConfigOption | null {
  for (const option of options) {
    const category = option.category?.trim().toLowerCase() ?? ''
    const id = option.id.trim().toLowerCase()
    if (category === 'reasoning' || id === 'reasoning') {
      return option
    }
  }
  return null
}

function countConfigOptionChoices(configOption: ConfigOption | null): number {
  if (!configOption) return 0

  const values = new Set<string>()
  for (const option of configOption.options ?? []) {
    const value = option.value?.trim() ?? ''
    if (!value) continue
    values.add(value)
  }
  return values.size
}

function shouldShowReasoningSwitch(configOption: ConfigOption | null): boolean {
  return countConfigOptionChoices(configOption) > 1
}

function fallbackThreadConfigValue(thread: Thread, configId: string): string {
  const trimmedConfigID = configId.trim()
  if (!trimmedConfigID) return ''
  if (trimmedConfigID.toLowerCase() === 'model') {
    return fallbackThreadModelID(thread)
  }

  const rawOverrides = thread.agentOptions?.configOverrides
  if (!rawOverrides || typeof rawOverrides !== 'object') return ''
  const value = (rawOverrides as Record<string, unknown>)[trimmedConfigID]
  return typeof value === 'string' ? value.trim() : ''
}

function currentValueForConfig(options: ConfigOption[], configId: string): string {
  const trimmedConfigID = configId.trim()
  if (!trimmedConfigID) return ''
  const option = options.find(item => item.id === trimmedConfigID)
  return option?.currentValue?.trim() ?? ''
}

function getThreadConfigOptionsForRender(thread: Thread): ConfigOption[] {
  const threadOptions = threadConfigCache.get(thread.threadId) ?? []
  const agentCatalog = getAgentConfigCatalog(thread.agent ?? '', fallbackThreadModelID(thread))

  if (!agentCatalog.length) {
    return cloneConfigOptions(threadOptions)
  }

  const merged: ConfigOption[] = []
  const seen = new Set<string>()

  for (const catalogOption of agentCatalog) {
    const configId = catalogOption.id.trim()
    if (!configId) continue
    seen.add(configId)

    const currentValue = currentValueForConfig(threadOptions, configId) || fallbackThreadConfigValue(thread, configId)
    merged.push({
      ...catalogOption,
      currentValue,
      options: [...(catalogOption.options ?? [])],
    })
  }

  for (const threadOption of threadOptions) {
    const configId = threadOption.id.trim()
    if (!configId || seen.has(configId)) continue
    merged.push({
      ...threadOption,
      options: [...(threadOption.options ?? [])],
    })
  }

  return merged
}

function resolveConfigPickerData(
  configOption: ConfigOption | null,
  fallbackValue: string,
  loading: boolean,
  labels: ConfigPickerLabels,
): ConfigPickerData {
  if (loading) {
    return {
      state: 'loading',
      configId: configOption?.id?.trim() ?? '',
      selectedValue: '',
      selectedLabel: labels.loadingLabel,
      options: [],
    }
  }

  const rawOptions = configOption?.options ?? []
  const options: ConfigPickerOption[] = rawOptions
    .map(option => ({
      value: option.value.trim(),
      name: (option.name || option.value).trim() || option.value.trim(),
      description: option.description?.trim() || '',
    }))
    .filter(option => !!option.value)

  if (!options.length) {
    if (fallbackValue) {
      return {
        state: 'ready',
        configId: configOption?.id?.trim() ?? '',
        selectedValue: fallbackValue,
        selectedLabel: fallbackValue,
        options: [{ value: fallbackValue, name: fallbackValue, description: '' }],
      }
    }
    return {
      state: 'empty',
      configId: configOption?.id?.trim() ?? '',
      selectedValue: '',
      selectedLabel: labels.emptyLabel,
      options: [],
    }
  }

  const selectedValue = configOption?.currentValue?.trim() || fallbackValue || options[0].value
  const selectedOption = options.find(option => option.value === selectedValue) ?? options[0]
  return {
    state: 'ready',
    configId: configOption?.id?.trim() ?? '',
    selectedValue: selectedOption.value,
    selectedLabel: selectedOption.name,
    options,
  }
}

function renderConfigMenuOptions(
  options: ConfigPickerOption[],
  selectedValue: string,
  state: ConfigPickerState,
  labels: ConfigPickerLabels,
): string {
  if (state === 'loading') {
    return `<div class="thread-model-option-item thread-model-option-item--disabled">
      <div class="thread-model-option-name">${escHtml(labels.loadingLabel)}</div>
    </div>`
  }
  if (state === 'empty' || !options.length) {
    return `<div class="thread-model-option-item thread-model-option-item--disabled">
      <div class="thread-model-option-name">${escHtml(labels.emptyLabel)}</div>
    </div>`
  }

  return options.map(option => {
    const activeClass = option.value === selectedValue ? ' thread-model-option-item--active' : ''
    const descHTML = option.description
      ? `<div class="thread-model-option-desc">${escHtml(option.description)}</div>`
      : ''
    return `<button
      class="thread-model-option-item${activeClass}"
      type="button"
      data-value="${escHtml(option.value)}"
      role="option"
      aria-selected="${option.value === selectedValue ? 'true' : 'false'}"
    >
      <div class="thread-model-option-name">${escHtml(option.name)}</div>
      ${descHTML}
    </button>`
  }).join('')
}

function buildThreadAgentOptions(
  base: Record<string, unknown>,
  options: ConfigOption[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base }
  const modelValue = findModelOption(options)?.currentValue?.trim() ?? ''
  if (modelValue) {
    next.modelId = modelValue
  } else {
    delete next.modelId
  }

  const configOverrides: Record<string, string> = {}
  for (const option of options) {
    const configId = option.id.trim()
    if (!configId || configId.toLowerCase() === 'model') continue
    const value = option.currentValue?.trim() ?? ''
    if (!value) continue
    configOverrides[configId] = value
  }
  if (Object.keys(configOverrides).length) {
    next.configOverrides = configOverrides
  } else {
    delete next.configOverrides
  }
  return next
}

function renderComposerConfigSwitch(
  key: 'model' | 'reasoning',
  label: string,
  pickerData: ConfigPickerData,
  labels: ConfigPickerLabels,
  disabled: boolean,
): string {
  return `
    <div class="thread-model-switch thread-model-switch--composer" data-picker-key="${escHtml(key)}">
      <button
        id="thread-${escHtml(key)}-trigger"
        class="thread-model-trigger"
        type="button"
        data-state="${escHtml(pickerData.state)}"
        data-selected-value="${escHtml(pickerData.selectedValue)}"
        data-config-id="${escHtml(pickerData.configId)}"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-label="${escHtml(label)}"
        ${disabled || pickerData.state !== 'ready' ? 'disabled' : ''}
      >
        <span class="thread-model-trigger-copy">
          <span class="thread-model-trigger-value">${escHtml(pickerData.selectedLabel)}</span>
        </span>
        <span class="thread-model-trigger-arrow">▾</span>
      </button>
      <div class="thread-model-menu" id="thread-${escHtml(key)}-menu" role="listbox" hidden>
        ${renderConfigMenuOptions(pickerData.options, pickerData.selectedValue, pickerData.state, labels)}
      </div>
    </div>`
}

const modelPickerLabels: ConfigPickerLabels = {
  loadingLabel: '正在加载模型…',
  emptyLabel: '暂无可用模型',
}

const reasoningPickerLabels: ConfigPickerLabels = {
  loadingLabel: '正在加载思考模式…',
  emptyLabel: '无思考选项',
}

function renderAgentAvatar(agentId: string, variant: 'thread' | 'message'): string {
  const normalized = (agentId || '').trim().toLowerCase()
  const cls = variant === 'thread' ? 'thread-item-avatar-icon' : 'message-avatar-icon'
  if (normalized === 'codex') {
    return `<img src="${codexIconURL}" alt="Codex" class="${cls}" loading="lazy" decoding="async">`
  }
  if (normalized === 'gemini') {
    return `<img src="${geminiIconURL}" alt="Gemini CLI" class="${cls}" loading="lazy" decoding="async">`
  }
  if (normalized === 'claude') {
    return `<img src="${claudeIconURL}" alt="Claude Code" class="${cls}" loading="lazy" decoding="async">`
  }
  if (normalized === 'kimi') {
    return `<img src="${kimiIconURL}" alt="Kimi CLI" class="${cls} ${cls}--contain" loading="lazy" decoding="async">`
  }
  if (normalized === 'opencode') {
    return `<img src="${opencodeIconURL}" alt="OpenCode" class="${cls} ${cls}--contain" loading="lazy" decoding="async">`
  }
  if (normalized === 'qwen') {
    return `<img src="${qwenIconURL}" alt="Qwen Code" class="${cls}" loading="lazy" decoding="async">`
  }
  return escHtml((agentId || 'A').slice(0, 1).toUpperCase())
}

type ThreadActivityIndicator = 'loading' | 'done' | null

function renderThreadStatusIndicator(status: ThreadActivityIndicator): string {
  if (status === 'loading') {
    return `
      <span
        class="thread-status-indicator thread-status-indicator--loading"
        role="status"
        aria-label="Agent 正在运行"
        title="Agent 正在运行"
      >
        <span class="thread-status-spinner" aria-hidden="true"></span>
      </span>`
  }
  if (status === 'done') {
    return `
      <span
        class="thread-status-indicator thread-status-indicator--done"
        role="img"
        aria-label="最近一轮已完成"
        title="最近一轮已完成"
      >
        ${iconCheck}
      </span>`
  }
  return ''
}

function renderSessionStatusIndicator(loading: boolean): string {
  if (!loading) return ''
  return `
      <span
        class="thread-status-indicator session-status-indicator thread-status-indicator--loading"
        role="status"
        aria-label="会话正在运行"
        title="会话正在运行"
      >
        <span class="thread-status-spinner" aria-hidden="true"></span>
      </span>`
}

function renderThreadItem(
  t: Thread,
  activeId: string | null,
  query: string,
  activityIndicator: ThreadActivityIndicator,
): string {
  const isActive = t.threadId === activeId
  const isMenuOpen = openThreadActionMenuId === t.threadId
  const avatar = renderAgentAvatar(t.agent ?? '', 'thread')
  const displayTitle = threadTitle(t)
  const relTime = t.updatedAt ? formatRelativeTime(t.updatedAt) : ''

  const titleHtml = query
    ? escHtml(displayTitle).replace(
        new RegExp(`(${escHtml(query)})`, 'gi'),
        '<mark>$1</mark>',
      )
    : escHtml(displayTitle)

  return `
    <div class="thread-item ${isActive ? 'thread-item--active' : ''} ${isMenuOpen ? 'thread-item--menu-open' : ''}"
         data-thread-id="${escHtml(t.threadId)}"
         role="button"
         tabindex="0"
         aria-label="${escHtml(displayTitle)}">
      <div class="thread-item-avatar ${isActive ? '' : 'thread-item-avatar--inactive'}">${avatar}</div>
      <div class="thread-item-body">
        <div class="thread-item-title">${titleHtml}</div>
        <div class="thread-item-preview">${escHtml(t.cwd)}</div>
        <div class="thread-item-foot">
          <span class="badge badge--agent">${escHtml(t.agent ?? '')}</span>
          <span class="thread-item-time">${relTime}</span>
        </div>
      </div>
      <div class="thread-item-actions">
        ${renderThreadStatusIndicator(activityIndicator)}
        <button class="btn btn-ghost btn-sm thread-item-menu-trigger" type="button"
                data-thread-id="${escHtml(t.threadId)}"
                aria-expanded="${isMenuOpen ? 'true' : 'false'}"
                aria-label="Agent 操作">
          ...
        </button>
      </div>
    </div>`
}

function updateThreadList(): void {
  const el = document.getElementById('thread-list')
  if (!el) return

  const { threads, activeThreadId, searchQuery, streamStates, threadCompletionBadges } = store.get()
  const q        = searchQuery.trim().toLowerCase()
  const filtered = q
    ? threads.filter(t =>
        (t.title || t.cwd).toLowerCase().includes(q) || threadTitle(t).toLowerCase().includes(q) || t.cwd.toLowerCase().includes(q),
      )
    : threads

  if (!filtered.length) {
    el.innerHTML = `
      <div class="thread-list-empty">
        ${q ? `没有匹配 "<strong>${escHtml(q)}</strong>" 的 Agent` : '还没有 Agent。<br>点击 <strong>+</strong> 创建。'}
      </div>`
    renderThreadActionLayer()
    return
  }

  el.innerHTML = filtered
    .map(t => {
      const isActive = t.threadId === activeThreadId
      const activityIndicator: ThreadActivityIndicator = Object.values(streamStates).some(streamState => streamState.threadId === t.threadId)
        ? 'loading'
        : (!isActive && threadCompletionBadges[t.threadId] ? 'done' : null)
      return renderThreadItem(t, activeThreadId, q, activityIndicator)
    })
    .join('')

  el.querySelectorAll<HTMLButtonElement>('.thread-item-menu-trigger').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      const id = btn.dataset.threadId ?? ''
      if (!id) return
      toggleThreadActionMenu(id)
    })
    btn.addEventListener('keydown', e => e.stopPropagation())
  })

  el.querySelectorAll<HTMLElement>('.thread-item').forEach(item => {
    const handler = (event?: Event) => {
      const target = event?.target as HTMLElement | null
      if (target?.closest('.thread-item-menu-trigger') || target?.closest('.thread-action-popover')) return
      const id = item.dataset.threadId ?? ''
      activateThread(id)
      // Close mobile sidebar on thread select
      closeMobileSidebar()
    }
    item.addEventListener('click', handler)
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') handler(e)
    })
  })

  renderThreadActionLayer()
}

async function handleRenameThread(threadId: string, nextTitle: string): Promise<void> {
  const snapshot = store.get()
  const thread = snapshot.threads.find(t => t.threadId === threadId)
  if (!thread) return

  const title = nextTitle.trim()
  if (title === thread.title) {
    cancelThreadRename(threadId)
    return
  }

  let updatedThread: Thread
  try {
    updatedThread = await api.updateThread(threadId, { title })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    window.alert(`重命名 Agent 失败：${message}`)
    return
  }

  resetThreadActionMenuState()
  const state = store.get()
  store.set({
    threads: state.threads.map(item => (item.threadId === threadId ? updatedThread : item)),
  })
  if (state.activeThreadId === threadId) {
    updateChatArea()
  }
}

async function handleDeleteThread(threadId: string): Promise<void> {
  const snapshot = store.get()
  const thread = snapshot.threads.find(t => t.threadId === threadId)
  if (!thread) return

  const label = threadTitle(thread)
  if (!window.confirm(`删除 Agent “${label}”？这将永久移除其历史记录。`)) return

  try {
    await api.deleteThread(threadId)
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    window.alert(`删除 Agent 失败：${message}`)
    return
  }

  resetThreadActionMenuState()
  const state = store.get()
  const nextThreads = state.threads.filter(t => t.threadId !== threadId)
  const nextMessages = { ...state.messages }
  const threadScopePrefix = `${threadId}::`
  Object.keys(nextMessages).forEach(scopeKey => {
    if (scopeKey.startsWith(threadScopePrefix)) {
      delete nextMessages[scopeKey]
    }
  })

  const deletingActive = state.activeThreadId === threadId
  const nextActiveThreadId = deletingActive ? (nextThreads[0]?.threadId ?? null) : state.activeThreadId
  Array.from(streamsByScope.entries()).forEach(([scopeKey, stream]) => {
    if (!scopeKey.startsWith(threadScopePrefix)) return
    stream.abort()
    clearScopeStreamRuntime(scopeKey)
  })
  Array.from(pendingPermissionsByScope.keys()).forEach(scopeKey => {
    if (scopeKey.startsWith(threadScopePrefix)) {
      clearPendingPermissions(scopeKey)
    }
  })
  threadConfigCache.delete(threadId)
  threadConfigSwitching.delete(threadId)
  Array.from(loadedHistoryScopeKeys).forEach(scopeKey => {
    if (scopeKey.startsWith(threadScopePrefix)) {
      loadedHistoryScopeKeys.delete(scopeKey)
    }
  })
  sessionPanelStateByThread.delete(threadId)
  sessionPanelRequestSeqByThread.delete(threadId)
  sessionPanelScrollTopByThread.delete(threadId)
  sessionSwitchingThreads.delete(threadId)
  freshSessionNonceByThread.delete(threadId)
  let nextThreadCompletionBadges = omitThreadCompletionBadge(state.threadCompletionBadges, threadId)
  if (nextActiveThreadId) {
    nextThreadCompletionBadges = omitThreadCompletionBadge(nextThreadCompletionBadges, nextActiveThreadId)
  }

  store.set({
    threads: nextThreads,
    messages: nextMessages,
    activeThreadId: nextActiveThreadId,
    threadCompletionBadges: nextThreadCompletionBadges,
  })
}

// ── History helpers ───────────────────────────────────────────────────────

/** Convert server Turn[] to the client Message[] model. */
function turnsToMessages(turns: Turn[]): Message[] {
  const msgs: Message[] = []
  for (const t of turns) {
    if (t.isInternal) continue

    if (t.requestText) {
      msgs.push({
        id:        `${t.turnId}-u`,
        role:      'user',
        content:   t.requestText,
        attachments: t.attachments,
        timestamp: t.createdAt,
        status:    'done',
        turnId:    t.turnId,
      })
    }

    if (t.status !== 'running') {
      const planEntries = extractTurnPlanEntries(t.events)
      const reasoning = extractTurnReasoning(t.events)
      const toolCalls = extractTurnToolCalls(t.events)
      const agentStatus: Message['status'] =
        t.status === 'cancelled' ? 'cancelled' :
        t.status === 'error'     ? 'error'     :
        'done'

      msgs.push({
        id:           `${t.turnId}-a`,
        role:         'agent',
        content:      t.responseText,
        timestamp:    t.completedAt || t.createdAt,
        status:       agentStatus,
        turnId:       t.turnId,
        stopReason:   t.stopReason   || undefined,
        errorMessage: t.errorMessage || undefined,
        planEntries,
        toolCalls,
        reasoning: hasReasoningText(reasoning) ? reasoning : undefined,
      })
    }
  }
  return msgs
}

function extractTurnSessionID(events: TurnEvent[] | undefined): string {
  let sessionID = ''
  for (const event of events ?? []) {
    if (event.type !== 'session_bound') continue
    const value = event.data?.sessionId
    if (typeof value !== 'string') continue
    const nextSessionID = value.trim()
    if (nextSessionID) sessionID = nextSessionID
  }
  return sessionID
}

function filterTurnsBySession(turns: Turn[], sessionID: string): Turn[] {
  sessionID = sessionID.trim()
  const assignments = turns.map(turn => ({
    turn,
    sessionID: extractTurnSessionID(turn.events),
  }))
  const annotatedSessions = new Set(assignments.map(item => item.sessionID).filter(Boolean))
  const isEphemeralCancelledTurn = (turn: Turn): boolean => turn.status === 'cancelled' && !turn.responseText.trim()

  // Legacy turns created before session-bound persistence have no per-turn session marker.
  // If the thread has no annotated turns at all, keep showing the history instead of hiding everything.
  if (annotatedSessions.size === 0) {
    return turns.filter(turn => !isEphemeralCancelledTurn(turn))
  }

  if (!sessionID) {
    return assignments
      .filter(item => item.sessionID === '' && !isEphemeralCancelledTurn(item.turn))
      .map(item => item.turn)
  }

  const hasMatchedAnnotatedTurns = assignments.some(item => item.sessionID === sessionID)
  if (!hasMatchedAnnotatedTurns) {
    return []
  }

  const includeUnannotatedLegacyTurns = annotatedSessions.size === 1 && annotatedSessions.has(sessionID)
  return assignments
    .filter(item => item.sessionID === sessionID || (includeUnannotatedLegacyTurns && item.sessionID === ''))
    .map(item => item.turn)
}

function sessionTranscriptToMessages(messages: SessionTranscriptMessage[], sessionID: string): Message[] {
  return messages
    .filter(message => !!message.content)
    .map((message, index) => ({
      id: `session-${sessionID}-${index}`,
      role: message.role === 'assistant' ? 'agent' : 'user',
      content: message.content,
      timestamp: message.timestamp || '',
      status: 'done',
    }))
}

function messageReplayKey(message: Message): string {
  return `${message.role}\n${message.content}`
}

function mergeSessionReplayMessages(replayMessages: Message[], localMessages: Message[]): Message[] {
  if (!replayMessages.length) return localMessages
  if (!localMessages.length) return replayMessages

  let overlap = 0
  const maxOverlap = Math.min(replayMessages.length, localMessages.length)
  for (let size = maxOverlap; size > 0; size -= 1) {
    let matches = true
    for (let index = 0; index < size; index += 1) {
      const replayMessage = replayMessages[replayMessages.length - size + index]
      const localMessage = localMessages[index]
      if (messageReplayKey(replayMessage) !== messageReplayKey(localMessage)) {
        matches = false
        break
      }
    }
    if (matches) {
      overlap = size
      break
    }
  }

  return [...replayMessages, ...localMessages.slice(overlap)]
}

async function loadHistory(threadId: string): Promise<void> {
  const requestedThread = store.get().threads.find(item => item.threadId === threadId)
  const requestedSessionID = threadSessionID(requestedThread)
  const requestedScopeKey = threadChatScopeKey(requestedThread)
  if (!requestedScopeKey) return
  if (!requestedSessionID && isFreshSessionScopeKey(requestedScopeKey)) return
  try {
    const turns = await api.getHistory(threadId)
    const state = store.get()
    if (state.activeThreadId !== threadId) return
    const activeThread = state.threads.find(item => item.threadId === threadId)
    if (!activeThread || threadSessionID(activeThread) !== requestedSessionID) return
    if (getScopeStreamState(requestedScopeKey)) return

    const localMessages = turnsToMessages(filterTurnsBySession(turns, requestedSessionID))
    const cachedMessages = state.messages[requestedScopeKey] ?? []
    let nextMessages = localMessages
    if (requestedSessionID) {
      // When a fresh ACP session is created from "Current: new", Codex transcripts
      // include the injected context prompt. Reuse the in-memory turn messages in
      // that transition instead of replaying transcript noise back into the chat.
      if (!loadedHistoryScopeKeys.has(requestedScopeKey) && loadedHistoryScopeKeys.has(threadSessionScopeKey(threadId, '')) && localMessages.length && cachedMessages.length) {
        nextMessages = mergeSessionReplayMessages(cachedMessages, localMessages)
      } else {
        try {
          const replay = await api.getThreadSessionHistory(threadId, requestedSessionID)
          const transcriptState = store.get()
          if (transcriptState.activeThreadId !== threadId) return
          const transcriptThread = transcriptState.threads.find(item => item.threadId === threadId)
          if (!transcriptThread || threadSessionID(transcriptThread) !== requestedSessionID) return
          if (getScopeStreamState(requestedScopeKey)) return

          if (replay.supported && replay.messages.length) {
            const replayMessages = sessionTranscriptToMessages(replay.messages, requestedSessionID)
            nextMessages = mergeSessionReplayMessages(replayMessages, localMessages)
          }
        } catch {
          nextMessages = localMessages
        }
      }
    }

    const finalState = store.get()
    if (finalState.activeThreadId !== threadId) return
    const finalThread = finalState.threads.find(item => item.threadId === threadId)
    if (!finalThread || threadSessionID(finalThread) !== requestedSessionID) return
    if (getScopeStreamState(requestedScopeKey)) return

    loadedHistoryScopeKeys.add(requestedScopeKey)
    store.set({
      messages: {
        ...finalState.messages,
        [requestedScopeKey]: nextMessages,
      },
    })
  } catch {
    if (store.get().activeThreadId !== threadId) return
    if (threadSessionID(store.get().threads.find(item => item.threadId === threadId)) !== requestedSessionID) return
    // Show error only if no matching local history was already rendered.
    if (!loadedHistoryScopeKeys.has(requestedScopeKey)) {
      const listEl = document.getElementById('message-list')
      if (listEl) {
        listEl.innerHTML = `<div class="thread-list-empty" style="color:var(--error)">加载历史记录失败。</div>`
      }
    }
  }
}

// ── Message rendering ─────────────────────────────────────────────────────

function formatPlanLabel(value: string | undefined): string {
  return (value ?? '').replace(/_/g, ' ').trim()
}

function planStatusClassName(status: string | undefined): string {
  const normalized = (status ?? '').trim().toLowerCase()
  if (!normalized || !/^[a-z_]+$/.test(normalized)) return ''
  return ` message-plan__item--${normalized}`
}

function renderPlanInnerHTML(entries: PlanEntry[]): string {
  return `
    <div class="message-plan__header">计划</div>
    <ol class="message-plan__list">
      ${entries.map(entry => {
        const status = formatPlanLabel(entry.status)
        const priority = formatPlanLabel(entry.priority)
        const meta = [status, priority]
          .filter(Boolean)
          .map(text => `<span class="message-plan__tag">${escHtml(text)}</span>`)
          .join('')
        const statusClass = planStatusClassName(entry.status)
        return `
          <li class="message-plan__item${statusClass}">
            <span class="message-plan__content">${escHtml(entry.content)}</span>
            ${meta ? `<span class="message-plan__meta">${meta}</span>` : ''}
          </li>`
      }).join('')}
    </ol>`
}

function renderPlanSectionHTML(entries: PlanEntry[] | undefined, extraClass = ''): string {
  const normalized = clonePlanEntries(entries)
  if (!normalized?.length) return ''
  return `<div class="message-plan${extraClass}">${renderPlanInnerHTML(normalized)}</div>`
}

function formatToolCallLabel(value: string | undefined): string {
  return (value ?? '').replace(/_/g, ' ').trim()
}

function toolCallStatusClassName(status: string | undefined): string {
  const normalized = (status ?? '').trim().toLowerCase()
  if (!normalized || !/^[a-z_]+$/.test(normalized)) return ''
  return ` message-tool-call__card--${normalized}`
}

function renderToolCallPreHTML(text: string, collapsible = false): string {
  const preID = nextToolCallPreID()
  const collapsedClass = collapsible ? ' message-tool-call__pre--collapsed' : ''
  const expandBtn = collapsible
    ? `<button class="message-tool-call__expand-btn" data-target="${preID}" type="button" hidden>展开全部</button>`
    : ''
  return `
    <div class="message-tool-call__pre-wrap">
      <pre class="message-tool-call__pre${collapsedClass}" id="${preID}">${escHtml(text)}</pre>
      ${expandBtn}
    </div>`
}

function renderToolCallJSON(value: unknown, collapsible = false): string {
  if (value === undefined) return ''
  const formatted = JSON.stringify(value, null, 2)
  return renderToolCallPreHTML(formatted ?? String(value), collapsible)
}

function renderToolCallLocationHTML(location: unknown): string {
  if (location && typeof location === 'object') {
    const record = location as Record<string, unknown>
    const path = typeof record.path === 'string' ? record.path.trim() : ''
    if (path) {
      const meta = Object.entries(record)
        .filter(([key]) => key !== 'path')
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(' · ')
      return `
        <li class="message-tool-call__location-item">
          <span class="message-tool-call__path">${escHtml(path)}</span>
          ${meta ? `<span class="message-tool-call__location-meta">${escHtml(meta)}</span>` : ''}
        </li>`
    }
  }
  return `<li class="message-tool-call__location-item">${renderToolCallJSON(location)}</li>`
}

function renderToolCallContentHTML(item: unknown): string {
  if (!item || typeof item !== 'object') {
    return renderToolCallJSON(item, true)
  }

  const record = item as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type.trim() : ''
  const path = typeof record.path === 'string' ? record.path.trim() : ''
  const command = typeof record.command === 'string' ? record.command.trim() : ''
  const heading = [formatToolCallLabel(type), path].filter(Boolean).join(' · ')

  if (type === 'content' && record.content && typeof record.content === 'object') {
    const nested = record.content as Record<string, unknown>
    const nestedType = typeof nested.type === 'string' ? nested.type.trim() : ''
    const text = typeof nested.text === 'string' ? nested.text : ''
    if (nestedType === 'text' && text) {
      return `
        <div class="message-tool-call__content-item">
          ${heading ? `<div class="message-tool-call__content-label">${escHtml(heading)}</div>` : ''}
          ${renderToolCallPreHTML(text, true)}
        </div>`
    }
  }

  if (type === 'command' && command) {
    return `
      <div class="message-tool-call__content-item">
        ${heading ? `<div class="message-tool-call__content-label">${escHtml(heading)}</div>` : ''}
        ${renderToolCallPreHTML(command, true)}
      </div>`
  }

  if (type === 'diff') {
    const oldText = typeof record.oldText === 'string' ? record.oldText : ''
    const newText = typeof record.newText === 'string' ? record.newText : ''
    return `
      <div class="message-tool-call__content-item">
        ${heading ? `<div class="message-tool-call__content-label">${escHtml(heading)}</div>` : ''}
        ${oldText ? `<div class="message-tool-call__diff-block"><div class="message-tool-call__diff-label">变更前</div>${renderToolCallPreHTML(oldText, true)}</div>` : ''}
        ${newText ? `<div class="message-tool-call__diff-block"><div class="message-tool-call__diff-label">变更后</div>${renderToolCallPreHTML(newText, true)}</div>` : ''}
      </div>`
  }

  return `
    <div class="message-tool-call__content-item">
      ${heading ? `<div class="message-tool-call__content-label">${escHtml(heading)}</div>` : ''}
      ${renderToolCallJSON(item, true)}
    </div>`
}

function renderToolCallCardHTML(toolCall: ToolCall): string {
  const title = toolCall.title?.trim() || toolCall.kind?.trim() || toolCall.toolCallId
  const kind = formatToolCallLabel(toolCall.kind)
  const status = formatToolCallLabel(toolCall.status)
  const toolCallID = toolCall.toolCallId.trim()
  const meta = [
    kind ? `<span class="message-tool-call__tag">${escHtml(kind)}</span>` : '',
    status ? `<span class="message-tool-call__tag message-tool-call__tag--status">${escHtml(status)}</span>` : '',
    title !== toolCallID ? `<span class="message-tool-call__tag">${escHtml(toolCallID)}</span>` : '',
  ].filter(Boolean).join('')
  const contentHTML = (toolCall.content ?? []).map(renderToolCallContentHTML).join('')
  const locationsHTML = toolCall.locations?.length
    ? `
      <div class="message-tool-call__section">
        <div class="message-tool-call__section-title">位置</div>
        <ul class="message-tool-call__location-list">
          ${toolCall.locations.map(renderToolCallLocationHTML).join('')}
        </ul>
      </div>`
    : ''
  const rawInputHTML = toolCall.rawInput === undefined
    ? ''
    : `
      <div class="message-tool-call__section">
        <div class="message-tool-call__section-title">输入</div>
        ${renderToolCallJSON(toolCall.rawInput, true)}
      </div>`
  const rawOutputHTML = toolCall.rawOutput === undefined
    ? ''
    : `
      <div class="message-tool-call__section">
        <div class="message-tool-call__section-title">输出</div>
        ${renderToolCallJSON(toolCall.rawOutput, true)}
      </div>`

  return `
    <article class="message-tool-call__card${toolCallStatusClassName(toolCall.status)}">
      <div class="message-tool-call__header-row">
        <div class="message-tool-call__title">${escHtml(title)}</div>
        ${meta ? `<div class="message-tool-call__meta">${meta}</div>` : ''}
      </div>
      ${contentHTML ? `<div class="message-tool-call__section"><div class="message-tool-call__section-title">内容</div>${contentHTML}</div>` : ''}
      ${locationsHTML}
      ${rawInputHTML}
      ${rawOutputHTML}
    </article>`
}

function renderToolCallSectionHTML(toolCalls: ToolCall[] | undefined, extraClass = ''): string {
  const normalized = cloneToolCalls(toolCalls)
  if (!normalized?.length) return ''
  return `
    <div class="message-tool-calls${extraClass}">
      <div class="message-tool-calls__header">工具调用</div>
      <div class="message-tool-calls__list">
        ${normalized.map(renderToolCallCardHTML).join('')}
      </div>
    </div>`
}

function reasoningPanelState(expanded: boolean): 'open' | 'closed' {
  return expanded ? 'open' : 'closed'
}

function reasoningContentID(messageID: string): string {
  return `reasoning-content-${messageID}`
}

function renderReasoningSectionHTML(
  messageID: string,
  reasoning: string | undefined,
  extraClass = '',
  expanded = false,
  renderMarkdownContent = false,
  label = '思考中',
): string {
  if (!hasReasoningText(reasoning)) return ''
  const state = reasoningPanelState(expanded)
  const contentID = reasoningContentID(messageID)
  const contentClass = renderMarkdownContent
    ? 'message-reasoning__content message-reasoning__content--md'
    : 'message-reasoning__content'
  const contentHTML = renderMarkdownContent ? renderMarkdown(reasoning) : escHtml(reasoning)
  return `
    <div
      class="message-reasoning${extraClass}"
      data-message-id="${escHtml(messageID)}"
      data-state="${state}"
    >
      <button
        class="message-reasoning__toggle"
        type="button"
        data-message-id="${escHtml(messageID)}"
        data-state="${state}"
        aria-expanded="${expanded ? 'true' : 'false'}"
        aria-controls="${escHtml(contentID)}"
      >
        <span class="message-reasoning__icon" aria-hidden="true">${iconSparkles}</span>
        <span class="message-reasoning__header">${escHtml(label)}</span>
        <span class="message-reasoning__chevron" aria-hidden="true">${iconChevronRight}</span>
      </button>
      <div
        class="${contentClass}"
        id="${escHtml(contentID)}"
        data-state="${state}"
        ${expanded ? '' : 'hidden'}
      >${contentHTML}</div>
    </div>`
}

function renderAttachmentCardsHTML(attachments: UploadedAsset[] | undefined, role: Message['role']): string {
  if (!attachments?.length) return ''
  return `
    <div class="message-attachments">
      ${attachments.map(item => {
        const deletedClass = item.deleted ? ' message-attachment-card--deleted' : ''
        const kindClass = item.kind === 'image' ? ' message-attachment-card--image' : ' message-attachment-card--file'
        const deletedBadge = item.deleted ? '<span class="message-attachment-card__badge">不可用</span>' : ''
        const mimeLine = item.mimeType ? `<span class="message-attachment-card__meta">${escHtml(item.mimeType)}</span>` : ''
        const actionHTML = item.deleted
          ? ''
          : item.kind === 'image'
            ? `<button class="message-attachment-card__action" type="button" data-preview-upload="${escHtml(item.uploadId)}" data-preview-name="${escHtml(item.name)}" aria-label="预览图片">查看大图</button>`
            : `<button class="message-attachment-card__action" type="button" data-download-upload="${escHtml(item.uploadId)}" data-download-name="${escHtml(item.name)}" aria-label="下载附件">${iconDownload}<span>下载</span></button>`
        const previewHTML = item.kind === 'image' && !item.deleted
          ? `<button class="message-attachment-card__preview" type="button" data-preview-upload="${escHtml(item.uploadId)}" data-preview-name="${escHtml(item.name)}" aria-label="预览图片">
              <img class="message-attachment-card__thumb" alt="${escHtml(item.name)}" data-attachment-thumb="${escHtml(item.uploadId)}" />
            </button>`
          : `<div class="message-attachment-card__icon" aria-hidden="true">${item.kind === 'image' ? '🖼' : '📎'}</div>`
        return `
          <div class="message-attachment-card${kindClass}${deletedClass}" data-role="${escHtml(role)}">
            ${previewHTML}
            <div class="message-attachment-card__copy">
              <div class="message-attachment-card__title-row">
                <span class="message-attachment-card__name">${escHtml(item.name)}</span>
                ${deletedBadge}
              </div>
              <div class="message-attachment-card__meta-row">
                ${mimeLine}
                <span class="message-attachment-card__meta">${escHtml(formatBytes(item.sizeBytes))}</span>
              </div>
              ${actionHTML ? `<div class="message-attachment-card__actions">${actionHTML}</div>` : ''}
            </div>
          </div>`
      }).join('')}
    </div>`
}

function attachmentCacheKey(uploadId: string, thumbnail: boolean): string {
  return `${uploadId}::${thumbnail ? 'thumb' : 'full'}`
}

async function resolveAttachmentObjectURL(uploadId: string, thumbnail: boolean): Promise<string> {
  const cacheKey = attachmentCacheKey(uploadId, thumbnail)
  const cached = attachmentObjectURLCache.get(cacheKey)
  if (cached) return cached

  const inFlight = attachmentObjectURLInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const request = api.fetchAttachmentBlob(uploadId, thumbnail).then(result => {
    const objectURL = URL.createObjectURL(result.blob)
    attachmentObjectURLCache.set(cacheKey, objectURL)
    attachmentObjectURLInFlight.delete(cacheKey)
    return objectURL
  }).catch(err => {
    attachmentObjectURLInFlight.delete(cacheKey)
    throw err
  })
  attachmentObjectURLInFlight.set(cacheKey, request)
  return request
}

async function triggerAttachmentDownload(uploadId: string, fallbackName: string): Promise<void> {
  const result = await api.fetchAttachmentBlob(uploadId, false)
  const objectURL = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  anchor.href = objectURL
  anchor.download = result.fileName || fallbackName || uploadId
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectURL), 1000)
}

async function openAttachmentPreview(uploadId: string, fallbackName: string): Promise<void> {
  const modalEl = document.getElementById('attachment-preview-modal') as HTMLDivElement | null
  const imageEl = document.getElementById('attachment-preview-image') as HTMLImageElement | null
  const titleEl = document.getElementById('attachment-preview-title') as HTMLDivElement | null
  const statusEl = document.getElementById('attachment-preview-status') as HTMLDivElement | null
  if (!modalEl || !imageEl || !titleEl || !statusEl) return

  titleEl.textContent = fallbackName
  statusEl.textContent = '正在加载图片…'
  imageEl.removeAttribute('src')
  modalEl.hidden = false
  document.body.classList.add('attachment-preview-open')

  try {
    imageEl.src = await resolveAttachmentObjectURL(uploadId, false)
    statusEl.textContent = ''
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : '图片加载失败'
  }
}

function closeAttachmentPreview(): void {
  const modalEl = document.getElementById('attachment-preview-modal') as HTMLDivElement | null
  const imageEl = document.getElementById('attachment-preview-image') as HTMLImageElement | null
  const statusEl = document.getElementById('attachment-preview-status') as HTMLDivElement | null
  if (modalEl) modalEl.hidden = true
  if (imageEl) imageEl.removeAttribute('src')
  if (statusEl) statusEl.textContent = ''
  document.body.classList.remove('attachment-preview-open')
}

function bindAttachmentCards(listEl: HTMLElement): void {
  listEl.querySelectorAll<HTMLImageElement>('[data-attachment-thumb]').forEach(imgEl => {
    const uploadId = imgEl.dataset.attachmentThumb?.trim() ?? ''
    if (!uploadId || imgEl.dataset.bound === 'true') return
    imgEl.dataset.bound = 'true'
    void resolveAttachmentObjectURL(uploadId, true).then(objectURL => {
      imgEl.src = objectURL
    }).catch(() => {
      imgEl.closest('.message-attachment-card__preview')?.classList.add('message-attachment-card__preview--empty')
    })
  })

  listEl.querySelectorAll<HTMLButtonElement>('[data-preview-upload]').forEach(buttonEl => {
    if (buttonEl.dataset.bound === 'true') return
    buttonEl.dataset.bound = 'true'
    buttonEl.addEventListener('click', () => {
      const uploadId = buttonEl.dataset.previewUpload?.trim() ?? ''
      if (!uploadId) return
      void openAttachmentPreview(uploadId, buttonEl.dataset.previewName?.trim() ?? uploadId)
    })
  })

  listEl.querySelectorAll<HTMLButtonElement>('[data-download-upload]').forEach(buttonEl => {
    if (buttonEl.dataset.bound === 'true') return
    buttonEl.dataset.bound = 'true'
    buttonEl.addEventListener('click', () => {
      const uploadId = buttonEl.dataset.downloadUpload?.trim() ?? ''
      if (!uploadId) return
      void triggerAttachmentDownload(uploadId, buttonEl.dataset.downloadName?.trim() ?? uploadId)
    })
  })
}

function renderMessage(msg: Message, agentAvatar: string): string {
  const renderMessageCopyBtn = (text: string): string => `
    <button
      class="msg-copy-btn"
      data-copy-text="${escHtml(encodeURIComponent(text))}"
      title="复制消息"
      aria-label="复制消息"
      type="button"
    >⎘</button>`

  if (msg.role === 'user') {
    const copyBtn = renderMessageCopyBtn(msg.content)
    const attachmentsHTML = renderAttachmentCardsHTML(msg.attachments, msg.role)
    const bubbleHTML = msg.content ? `<div class="message-bubble">${escHtml(msg.content)}</div>` : ''
    return `
      <div class="message message--user" data-msg-id="${escHtml(msg.id)}">
        <div class="message-group">
          ${attachmentsHTML}
          ${bubbleHTML}
          <div class="message-meta">
            <span class="message-time">${formatTimestamp(msg.timestamp)}</span>
            ${msg.content ? copyBtn : ''}
          </div>
        </div>
      </div>`
  }

  const isCancelled = msg.status === 'cancelled'
  const isError     = msg.status === 'error'
  const isDone      = msg.status === 'done'

  const bodyText = isError
    ? (msg.errorCode ? `[${msg.errorCode}] ` : '') + (msg.errorMessage ?? '未知错误')
    : (msg.content || '…')
  const planHTML = renderPlanSectionHTML(msg.planEntries)
  const toolCallsHTML = renderToolCallSectionHTML(msg.toolCalls)
  const reasoningHTML = renderReasoningSectionHTML(
    msg.id,
    msg.reasoning,
    '',
    expandedReasoningMessageIds.has(msg.id),
    true,
    '思考过程',
  )
  const hasSupplementarySections = !!msg.planEntries?.length || !!msg.toolCalls?.length || hasReasoningText(msg.reasoning)
  const shouldRenderBubble = !(isDone && !msg.content && hasSupplementarySections)
  const attachmentsHTML = renderAttachmentCardsHTML(msg.attachments, msg.role)

  // Render markdown only for finalised done messages
  let bubbleExtra = ''
  let bubbleContent: string
  if (isDone) {
    bubbleExtra   = ' message-bubble--md'
    bubbleContent = renderMarkdown(bodyText)
  } else if (isError) {
    bubbleExtra   = ' message-bubble--error'
    bubbleContent = escHtml(bodyText)
  } else {
    bubbleExtra   = ' message-bubble--cancelled'
    bubbleContent = escHtml(bodyText)
  }

  const stopTag  = isCancelled ? `<span class="message-stop-reason">已取消</span>` : ''
  const copyBtn  = isDone && msg.content ? renderMessageCopyBtn(bodyText) : ''
  const bubbleHTML = shouldRenderBubble
    ? `<div class="message-bubble${bubbleExtra}">${bubbleContent}</div>`
    : ''

  return `
    <div class="message message--agent" data-msg-id="${escHtml(msg.id)}">
      <div class="message-avatar">${agentAvatar}</div>
      <div class="message-group">
        ${planHTML}
        ${toolCallsHTML}
        ${reasoningHTML}
        ${attachmentsHTML}
        ${bubbleHTML}
        <div class="message-meta">
          <span class="message-time">${formatTimestamp(msg.timestamp)}</span>
          ${stopTag}
          ${copyBtn}
        </div>
      </div>
    </div>`
}

function renderStreamingBubbleHTML(
  messageID: string,
  content = '',
  planEntries?: PlanEntry[],
  toolCalls?: ToolCall[],
  reasoning?: string,
): string {
  const normalizedPlanEntries = clonePlanEntries(planEntries)
  const normalizedToolCalls = cloneToolCalls(toolCalls)
  const planHiddenAttr = normalizedPlanEntries?.length ? '' : ' hidden'
  const toolCallsHiddenAttr = normalizedToolCalls?.length ? '' : ' hidden'
  const reasoningHTML = renderReasoningSectionHTML(messageID, reasoning, ' message-reasoning--streaming', true)
  const reasoningHiddenAttr = hasReasoningText(reasoning) ? '' : ' hidden'
  return `
    <div class="message-plan message-plan--streaming" id="plan-${escHtml(messageID)}"${planHiddenAttr}>${normalizedPlanEntries ? renderPlanInnerHTML(normalizedPlanEntries) : ''}</div>
    <div id="tool-calls-${escHtml(messageID)}"${toolCallsHiddenAttr}>${normalizedToolCalls ? renderToolCallSectionHTML(normalizedToolCalls, ' message-tool-calls--streaming') : ''}</div>
    <div id="reasoning-${escHtml(messageID)}"${reasoningHiddenAttr}>${reasoningHTML}</div>
    <div class="message-bubble message-bubble--streaming" id="bubble-${escHtml(messageID)}">
      <div class="message-bubble__text">${escHtml(content)}</div>
      <div class="typing-indicator" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>`
}

function updateStreamingBubbleContent(messageID: string, content: string): void {
  const bubbleEl = document.getElementById(`bubble-${messageID}`)
  if (!bubbleEl) return
  const contentEl = bubbleEl.querySelector('.message-bubble__text')
  if (!contentEl) return
  contentEl.textContent = content
}

function updateStreamingBubbleReasoning(messageID: string, reasoning: string): void {
  const reasoningEl = document.getElementById(`reasoning-${messageID}`)
  if (!reasoningEl) return
  if (!hasReasoningText(reasoning)) {
    reasoningEl.hidden = true
    reasoningEl.innerHTML = ''
    return
  }
  reasoningEl.hidden = false
  reasoningEl.innerHTML = renderReasoningSectionHTML(messageID, reasoning, ' message-reasoning--streaming', true)
}

function updateStreamingBubbleToolCalls(messageID: string, toolCalls: ToolCall[] | undefined): void {
  const toolCallsEl = document.getElementById(`tool-calls-${messageID}`)
  if (!toolCallsEl) return
  const normalized = cloneToolCalls(toolCalls)
  toolCallsEl.hidden = !normalized?.length
  if (!normalized?.length) {
    toolCallsEl.innerHTML = ''
    return
  }
  toolCallsEl.innerHTML = renderToolCallSectionHTML(normalized, ' message-tool-calls--streaming')
  bindMarkdownControls(toolCallsEl)
}

function setReasoningPanelExpanded(panelEl: HTMLElement, expanded: boolean): void {
  const state = reasoningPanelState(expanded)
  panelEl.dataset.state = state

  const toggleEl = panelEl.querySelector<HTMLButtonElement>('.message-reasoning__toggle')
  if (toggleEl) {
    toggleEl.dataset.state = state
    toggleEl.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  const contentEl = panelEl.querySelector<HTMLElement>('.message-reasoning__content')
  if (contentEl) {
    contentEl.dataset.state = state
    contentEl.hidden = !expanded
  }
}

function bindReasoningPanels(listEl: HTMLElement): void {
  listEl.querySelectorAll<HTMLButtonElement>('.message-reasoning__toggle[data-message-id]').forEach(toggleEl => {
    toggleEl.addEventListener('click', () => {
      const messageID = toggleEl.dataset.messageId?.trim() ?? ''
      const panelEl = toggleEl.closest<HTMLElement>('.message-reasoning')
      if (!messageID || !panelEl || panelEl.classList.contains('message-reasoning--streaming')) return

      const nextExpanded = toggleEl.getAttribute('aria-expanded') !== 'true'
      if (nextExpanded) {
        expandedReasoningMessageIds.add(messageID)
      } else {
        expandedReasoningMessageIds.delete(messageID)
      }
      setReasoningPanelExpanded(panelEl, nextExpanded)
    })
  })
}

function updateStreamingBubblePlan(messageID: string, entries: PlanEntry[] | undefined): void {
  const planEl = document.getElementById(`plan-${messageID}`)
  if (!planEl) return
  const normalized = clonePlanEntries(entries)
  planEl.hidden = !normalized?.length
  if (!normalized?.length) {
    planEl.innerHTML = ''
    return
  }
  planEl.innerHTML = renderPlanInnerHTML(normalized)
}

function updateMessageList(): void {
  const listEl = document.getElementById('message-list')
  if (!listEl) return

  const { activeThreadId, threads, messages } = store.get()
  if (!activeThreadId) return

  const previousScrollTop = listEl.scrollTop
  const stickToBottom = !listEl.childElementCount || isNearBottom(listEl)

  const thread   = threads.find(t => t.threadId === activeThreadId)
  const scopeKey = threadChatScopeKey(thread)
  const msgs     = messages[scopeKey] ?? []
  const agentAvatar = renderAgentAvatar(thread?.agent ?? '', 'message')

  if (!msgs.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" style="font-size:28px">💬</div>
        <h3 class="empty-state-title" style="font-size:var(--font-size-lg)">开始对话</h3>
        <p class="empty-state-desc">发送第一条消息，开始与 ${escHtml(thread?.agent ?? '该 Agent')} 协作。</p>
      </div>`
    syncScrollBottomButton(listEl)
    return
  }

  listEl.innerHTML = msgs.map(m => renderMessage(m, agentAvatar)).join('')
  bindMarkdownControls(listEl)
  bindReasoningPanels(listEl)
  bindAttachmentCards(listEl)
  restoreMessageListScroll(listEl, stickToBottom, previousScrollTop)
}

// ── Input state ───────────────────────────────────────────────────────────

function updateInputState(): void {
  const { activeThreadId } = store.get()
  const streamState = getActiveChatStreamState()
  const isStreaming   = !!streamState
  const isCancelling  = streamState?.status === 'cancelling'

  const sendBtn  = document.getElementById('send-btn')   as HTMLButtonElement   | null
  const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement   | null
  const inputEl  = document.getElementById('message-input') as HTMLTextAreaElement | null
  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement | null
  const isSwitchingConfig = !!activeThreadId && threadConfigSwitching.has(activeThreadId)
  const isSwitchingSession = !!activeThreadId && sessionSwitchingThreads.has(activeThreadId)
  const hasThreadStreaming = hasThreadStream(activeThreadId)
  const uploadBusy = !!activeThreadId && uploadInFlightThreads.has(activeThreadId)

  if (sendBtn)  sendBtn.disabled  = isStreaming || isSwitchingConfig || isSwitchingSession
  if (inputEl)  inputEl.disabled  = isStreaming || isSwitchingConfig || isSwitchingSession
  if (uploadBtn) uploadBtn.disabled = isStreaming || isSwitchingConfig || isSwitchingSession || uploadBusy
  document.querySelectorAll<HTMLButtonElement>('.thread-model-trigger').forEach(triggerEl => {
    const pickerState = triggerEl.dataset.state ?? 'empty'
    const configID = triggerEl.dataset.configId?.trim() ?? ''
    const noSelectableValue = pickerState !== 'ready' || !configID
    const disabled = hasThreadStreaming || isSwitchingConfig || isSwitchingSession || noSelectableValue
    triggerEl.disabled = disabled
    if (disabled) {
      triggerEl.setAttribute('aria-expanded', 'false')
      const menu = triggerEl.parentElement?.querySelector<HTMLElement>('.thread-model-menu')
      menu?.setAttribute('hidden', 'true')
    }
  })
  if (cancelBtn) {
    cancelBtn.style.display = isStreaming ? '' : 'none'
    cancelBtn.disabled      = isCancelling
    cancelBtn.textContent   = isCancelling ? '正在取消…' : '取消'
  }
  updateSlashCommandMenu()
}

function closeSlashCommandMenu(): void {
  const menuEl = document.getElementById('slash-command-menu') as HTMLDivElement | null
  if (!menuEl) return
  slashCommandSelectedIndex = 0
  menuEl.hidden = true
  menuEl.innerHTML = ''
}

function resetSlashCommandLookup(): void {
  slashCommandLookupThreadId = null
}

function getFilteredSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return cloneSlashCommands(commands)

  return cloneSlashCommands(commands).filter(command => {
    const name = command.name.toLowerCase()
    const description = command.description?.toLowerCase() ?? ''
    return name.includes(normalizedQuery) || description.includes(normalizedQuery)
  })
}

function updateSlashCommandMenu(): void {
  const menuEl = document.getElementById('slash-command-menu') as HTMLDivElement | null
  const inputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
  if (!menuEl || !inputEl) return

  const { activeThreadId, threads } = store.get()
  if (!activeThreadId || inputEl.disabled) {
    resetSlashCommandLookup()
    closeSlashCommandMenu()
    return
  }

  const thread = threads.find(item => item.threadId === activeThreadId)
  if (!thread) {
    resetSlashCommandLookup()
    closeSlashCommandMenu()
    return
  }

  const rawValue = inputEl.value
  if (!rawValue.startsWith('/')) {
    resetSlashCommandLookup()
    closeSlashCommandMenu()
    return
  }

  const agentKey = normalizeAgentKey(thread.agent ?? '')
  const query = rawValue.slice(1)
  const hasCachedCommands = hasAgentSlashCommandsCache(thread.agent ?? '')
  const loading = !!agentKey && agentSlashCommandsInFlight.has(agentKey)
  const shouldRefreshForSlashEntry = rawValue === '/' && slashCommandLookupThreadId !== thread.threadId

  if (shouldRefreshForSlashEntry && !loading) {
    slashCommandLookupThreadId = thread.threadId
    void loadThreadSlashCommands(thread.threadId, true).then(() => {
      const activeInputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
      if (store.get().activeThreadId === thread.threadId && activeInputEl?.value.startsWith('/')) {
        updateSlashCommandMenu()
      }
    })
    closeSlashCommandMenu()
    return
  }

  if (!hasCachedCommands && !loading) {
    slashCommandLookupThreadId = thread.threadId
    void loadThreadSlashCommands(thread.threadId).then(() => {
      const activeInputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
      if (store.get().activeThreadId === thread.threadId && activeInputEl?.value.startsWith('/')) {
        updateSlashCommandMenu()
      }
    })
    closeSlashCommandMenu()
    return
  }

  if (!hasCachedCommands || loading) {
    closeSlashCommandMenu()
    return
  }

  const cachedCommands = getAgentSlashCommands(thread.agent ?? '')
  if (!cachedCommands.length) {
    closeSlashCommandMenu()
    return
  }

  const commands = getFilteredSlashCommands(cachedCommands, query)
  if (!loading && !commands.length) {
    slashCommandSelectedIndex = 0
    menuEl.hidden = false
    menuEl.innerHTML = `<div class="slash-command-empty">没有匹配的斜杠命令。</div>`
    return
  }

  slashCommandSelectedIndex = Math.max(0, Math.min(slashCommandSelectedIndex, commands.length - 1))
  menuEl.hidden = false
  menuEl.innerHTML = `
    <div class="slash-command-header">斜杠命令</div>
    <div class="slash-command-list">
      ${commands.map((command, index) => renderSlashCommandMenuItem(command, index === slashCommandSelectedIndex)).join('')}
    </div>`
}

function selectSlashCommand(commandName: string): void {
  const inputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
  const { activeThreadId, threads } = store.get()
  if (!inputEl || !activeThreadId) return

  const thread = threads.find(item => item.threadId === activeThreadId)
  if (!thread) return

  const commands = getFilteredSlashCommands(getAgentSlashCommands(thread.agent ?? ''), inputEl.value.slice(1))
  const command = commands.find(item => item.name === commandName)
  if (!command) return

  inputEl.value = `/${command.name}${command.inputHint ? ' ' : ''}`
  composerDraftByThread.set(activeThreadId, inputEl.value)
  inputEl.focus()
  inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length)
  resizeComposerInput(inputEl)
  resetSlashCommandLookup()
  closeSlashCommandMenu()
}

// ── Chat area rendering ───────────────────────────────────────────────────

function renderChatEmpty(): string {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">◈</div>
      <h3 class="empty-state-title">未选择 Agent</h3>
      <p class="empty-state-desc">
        从侧边栏选择一个 Agent，或新建一个开始对话。
      </p>
      <button class="btn btn-primary" id="new-thread-empty-btn">
        ${iconPlus} 新建 Agent
      </button>
    </div>`
}

function renderSessionInfoField(label: string, value: string, copyLabel: string): string {
  return `
    <div class="session-info-field">
      <div class="session-info-label">${label}</div>
      <div class="session-info-row">
        <div class="session-info-value" title="${escHtml(value)}">${escHtml(value)}</div>
        <button
          class="btn btn-icon session-info-copy-btn"
          type="button"
          data-copy-value="${escHtml(encodeURIComponent(value))}"
          aria-label="${copyLabel}"
          title="${copyLabel}"
        >
          ${iconCopy}
        </button>
      </div>
    </div>`
}

function renderSessionInfoPopover(thread: Thread): string {
  const sessionID = threadSessionID(thread)
  if (!sessionID) return ''

  return `
    <div class="session-info" id="session-info">
      <button
        class="btn btn-icon session-info-trigger"
        id="session-info-trigger"
        type="button"
        aria-label="会话信息"
        aria-expanded="false"
        aria-controls="session-info-panel"
        title="会话信息"
      >
        ${iconInfo}
      </button>
      <div class="session-info-popover" id="session-info-panel" role="dialog" aria-label="会话信息" hidden>
        <div class="session-info-heading">会话信息</div>
        ${renderSessionInfoField('会话 ID', sessionID, '复制会话 ID')}
        ${renderSessionInfoField('工作目录', thread.cwd, '复制工作目录')}
      </div>
    </div>`
}

function renderStorageUsageIndicator(usage: StorageUsageInfo | null): string {
  if (!usage) return ''
  const percent = Math.max(0, Math.min(100, Math.round(usage.usagePercent)))
  const state = percent >= 95 ? 'danger' : percent >= 80 ? 'warning' : 'normal'
  const label = percent >= 95
    ? '存储空间接近上限'
    : percent >= 80
      ? '存储空间偏高'
      : '存储空间'
  return `
    <div class="storage-usage storage-usage--${state}" title="${escHtml(`${formatBytes(usage.usedBytes)} / ${formatBytes(usage.maxBytes)}`)}">
      <div class="storage-usage__copy">
        <span class="storage-usage__label">${escHtml(label)}</span>
        <span class="storage-usage__value">${escHtml(formatBytes(usage.usedBytes))} / ${escHtml(formatBytes(usage.maxBytes))}</span>
      </div>
      <span class="storage-usage__percent">${escHtml(`${percent}%`)}</span>
    </div>`
}

function renderSlashCommandMenuItem(command: SlashCommand, active: boolean): string {
  const inputHint = command.inputHint?.trim() ?? ''
  return `
    <button
      class="slash-command-item ${active ? 'slash-command-item--active' : ''}"
      type="button"
      data-command-name="${escHtml(command.name)}"
      aria-pressed="${active ? 'true' : 'false'}"
    >
      <span class="slash-command-item-icon" aria-hidden="true">${iconSlashCommand}</span>
      <div class="slash-command-item-copy">
        <div class="slash-command-item-main">
          <span class="slash-command-item-name">/${escHtml(command.name)}</span>
          ${inputHint ? `<span class="slash-command-item-hint">(${escHtml(inputHint)})</span>` : ''}
          ${command.description?.trim()
            ? `<span class="slash-command-item-desc">${escHtml(command.description)}</span>`
            : ''}
        </div>
      </div>
    </button>`
}

function renderChatThread(t: Thread): string {
  const titleLabel   = threadTitle(t)
  const createdLabel = t.createdAt ? `创建于 ${formatTimestamp(t.createdAt)}` : ''
  const selectedModelID = fallbackThreadModelID(t)
  const catalogKey = normalizeAgentConfigCatalogKey(t.agent ?? '', selectedModelID)
  const hasConfigCache = threadConfigCache.has(t.threadId) || hasAgentConfigCatalog(t.agent ?? '', selectedModelID)
  const loadingConfig = !hasConfigCache || (!!catalogKey && agentConfigCatalogInFlight.has(catalogKey))
  const configOptions = getThreadConfigOptionsForRender(t)
  const modelOption = findModelOption(configOptions)
  const reasoningOption = findReasoningOption(configOptions)
  const modelPickerData = resolveConfigPickerData(
    modelOption,
    fallbackThreadConfigValue(t, 'model'),
    loadingConfig,
    modelPickerLabels,
  )
  const reasoningPickerData = resolveConfigPickerData(
    reasoningOption,
    reasoningOption ? fallbackThreadConfigValue(t, reasoningOption.id) : '',
    loadingConfig,
    reasoningPickerLabels,
  )
  const showReasoningSwitch = shouldShowReasoningSwitch(reasoningOption)
  const isSwitching = threadConfigSwitching.has(t.threadId)
  const isSwitchingSession = sessionSwitchingThreads.has(t.threadId)
  const pendingUploads = pendingUploadsByThread.get(t.threadId) ?? []
  const uploadBusy = uploadInFlightThreads.has(t.threadId)
  const storageUsage = store.get().storageUsage

  return `
    <div class="chat-header">
      <div class="chat-header-left">
        <button class="btn btn-icon mobile-menu-btn" aria-label="打开菜单">${iconMenu}</button>
        <div class="chat-header-main">
          <div class="chat-header-title-row">
            <h2 class="chat-title" title="${escHtml(titleLabel)}">${escHtml(titleLabel)}</h2>
            <span class="badge badge--agent">${escHtml(t.agent ?? '')}</span>
          </div>
          ${renderStorageUsageIndicator(storageUsage)}
          <div class="mobile-session-actions">
            <button
              class="btn btn-ghost btn-sm mobile-session-list-btn"
              id="mobile-session-list-btn"
              type="button"
              aria-label="查看会话列表">
              <span>会话</span>
            </button>
            <button
              class="btn btn-ghost btn-sm mobile-session-new-btn"
              id="mobile-new-session-btn"
              type="button"
              aria-label="新建会话"
              ${isSwitchingSession ? 'disabled' : ''}>
              ${iconPlus}
              <span>新会话</span>
            </button>
          </div>
        </div>
      </div>
      <div class="chat-header-right">
        <button class="btn btn-sm btn-danger" id="cancel-btn" style="display:none" aria-label="取消当前轮次">取消</button>
        <span class="chat-header-meta">${escHtml(createdLabel)}</span>
        ${renderSessionInfoPopover(t)}
      </div>
    </div>

    <div class="message-list-wrap">
      <div class="message-list" id="message-list"></div>
      <button class="scroll-bottom-btn" id="scroll-bottom-btn"
              aria-label="滚动到底部" style="display:none">↓</button>
    </div>

    <div class="input-area">
      <div class="slash-command-menu" id="slash-command-menu" hidden></div>
      <div class="input-wrapper">
        <input id="upload-input" type="file" multiple hidden />
        <div class="pending-uploads ${pendingUploads.length ? '' : 'pending-uploads--empty'}" id="pending-uploads">
          ${pendingUploads.length
            ? pendingUploads.map(item => `
              <div class="upload-chip upload-chip--${escHtml(item.kind)}" data-upload-id="${escHtml(item.uploadId)}">
                <div class="upload-chip-copy">
                  <span class="upload-chip-name">${escHtml(item.name)}</span>
                  <span class="upload-chip-meta">${escHtml(formatBytes(item.sizeBytes))}</span>
                </div>
                <button class="upload-chip-remove" type="button" data-remove-upload="${escHtml(item.uploadId)}" aria-label="移除附件">×</button>
              </div>
            `).join('')
            : `<div class="pending-uploads-placeholder">支持上传文件、拖拽文件或直接粘贴图片。</div>`}
        </div>
        <textarea
          id="message-input"
          class="message-input"
          placeholder="输入消息…"
          rows="1"
          aria-label="消息输入"
        ></textarea>
        <div class="input-compose-bar">
          <div class="thread-config-switches">
            ${renderComposerConfigSwitch('model', '模型', modelPickerData, modelPickerLabels, isSwitching)}
            ${showReasoningSwitch
              ? renderComposerConfigSwitch('reasoning', '思考', reasoningPickerData, reasoningPickerLabels, isSwitching)
              : ''}
          </div>
          <div class="composer-actions">
            <button class="btn btn-ghost btn-upload" id="upload-btn" type="button" aria-label="上传附件" ${uploadBusy ? 'disabled' : ''}>上传</button>
            <button class="btn btn-primary btn-send" id="send-btn" aria-label="发送消息">
              ${iconSend}
            </button>
          </div>
        </div>
      </div>
      <div class="input-hint">按 <kbd>⌘ Enter</kbd> 发送 · <kbd>Esc</kbd> 取消 · 输入 <kbd>/</kbd> 查看斜杠命令 · 支持拖拽与粘贴图片</div>
    </div>`
}

function updateChatArea(): void {
  const chat = document.getElementById('chat')
  if (!chat) return

  const { threads, activeThreadId } = store.get()
  const thread = activeThreadId ? threads.find(t => t.threadId === activeThreadId) : null

  // The streaming bubble is tied to the current chat DOM; reset sentinel on chat-scope switch.
  activeStreamMsgId = null
  activeStreamScopeKey = ''

  if (!thread) {
    chat.innerHTML = renderChatEmpty()
    document.getElementById('new-thread-empty-btn')?.addEventListener('click', openNewThread)
    document.querySelector('.mobile-menu-btn')?.addEventListener('click', () => {
      toggleMobileSidebar()
    })
    return
  }

  chat.innerHTML = renderChatThread(thread)
  document.querySelector('.mobile-menu-btn')?.addEventListener('click', () => {
    toggleMobileSidebar()
  })

  // Show locally loaded messages immediately (including empty threads).
  // Show the loading state when the cache belongs to a different selected session.
  const scopeKey = threadChatScopeKey(thread)
  const hasLocalHistory = Object.prototype.hasOwnProperty.call(store.get().messages, scopeKey)
  const hasMatchingLocalHistory = hasLocalHistory && loadedHistoryScopeKeys.has(scopeKey)
  if (hasMatchingLocalHistory) {
    updateMessageList()
  } else {
    const listEl = document.getElementById('message-list')
    if (listEl) {
      listEl.innerHTML = `<div class="message-list-loading"><div class="loading-spinner"></div></div>`
    }
  }

  appendOrRestoreStreamingBubble(thread)
  renderPendingPermissionCards(scopeKey)

  updateInputState()
  bindPendingUploads(thread)
  bindSessionInfoPopover()
  bindInputResize()
  bindSendHandler()
  bindCancelHandler()
  bindThreadConfigSwitches(thread)
  bindScrollBottom()
  bindMobileSessionActions(thread)
  restoreComposerDraft(thread.threadId)

  // Always reload history from server (keeps view fresh; guards against overwrites during streaming)
  void loadHistory(thread.threadId)
}

function bindMobileSessionActions(thread: Thread): void {
  document.getElementById('mobile-session-list-btn')?.addEventListener('click', () => {
    openMobileSessionOverlay()
    updateSessionPanel()
  })
  document.getElementById('mobile-new-session-btn')?.addEventListener('click', () => {
    void switchThreadSession(thread, '')
  })
}

function resizeComposerInput(input: HTMLTextAreaElement): void {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 220) + 'px'
}

function restoreComposerDraft(threadId: string, focus = false): void {
  const inputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
  if (!inputEl) return

  inputEl.value = composerDraftByThread.get(threadId) ?? ''
  resizeComposerInput(inputEl)
  if (!focus || inputEl.disabled) return

  inputEl.focus()
  const caret = inputEl.value.length
  inputEl.setSelectionRange(caret, caret)
}

function bindThreadConfigSwitches(thread: Thread): void {
  const switchEls = Array.from(document.querySelectorAll<HTMLElement>('.thread-model-switch[data-picker-key]'))
  if (!switchEls.length) return

  const closeMenu = (switchEl: HTMLElement): void => {
    const triggerEl = switchEl.querySelector<HTMLButtonElement>('.thread-model-trigger')
    const menuEl = switchEl.querySelector<HTMLElement>('.thread-model-menu')
    triggerEl?.setAttribute('aria-expanded', 'false')
    menuEl?.setAttribute('hidden', 'true')
  }

  const closeAllMenus = (): void => {
    switchEls.forEach(closeMenu)
  }

  const renderConfigUI = (): void => {
    const latest = store.get().threads.find(item => item.threadId === thread.threadId)
    if (!latest) return

    const selectedModelID = fallbackThreadModelID(latest)
    const catalogKey = normalizeAgentConfigCatalogKey(latest.agent ?? '', selectedModelID)
    const loading = (!threadConfigCache.has(thread.threadId) && !hasAgentConfigCatalog(latest.agent ?? '', selectedModelID))
      || (!!catalogKey && agentConfigCatalogInFlight.has(catalogKey))
    const options = getThreadConfigOptionsForRender(latest)
    const modelOption = findModelOption(options)
    const reasoningOption = findReasoningOption(options)
    const pickerDataByKey = {
      model: resolveConfigPickerData(modelOption, fallbackThreadConfigValue(latest, 'model'), loading, modelPickerLabels),
      reasoning: resolveConfigPickerData(
        reasoningOption,
        reasoningOption ? fallbackThreadConfigValue(latest, reasoningOption.id) : '',
        loading,
        reasoningPickerLabels,
      ),
    } as const
    const labelsByKey = {
      model: modelPickerLabels,
      reasoning: reasoningPickerLabels,
    } as const
    const visibleByKey = {
      model: true,
      reasoning: shouldShowReasoningSwitch(reasoningOption),
    } as const

    switchEls.forEach(switchEl => {
      const key = (switchEl.dataset.pickerKey === 'reasoning' ? 'reasoning' : 'model')
      const triggerEl = switchEl.querySelector<HTMLButtonElement>('.thread-model-trigger')
      const menuEl = switchEl.querySelector<HTMLDivElement>('.thread-model-menu')
      if (!triggerEl || !menuEl) return

      switchEl.hidden = !visibleByKey[key]
      if (switchEl.hidden) {
        closeMenu(switchEl)
        return
      }

      const pickerData = pickerDataByKey[key]
      const labels = labelsByKey[key]
      const isReady = pickerData.state === 'ready'
      const disabled = loading || threadConfigSwitching.has(thread.threadId) || !isReady || !pickerData.configId

      triggerEl.dataset.state = pickerData.state
      triggerEl.dataset.selectedValue = pickerData.selectedValue
      triggerEl.dataset.configId = pickerData.configId
      triggerEl.disabled = disabled
      const valueEl = triggerEl.querySelector<HTMLElement>('.thread-model-trigger-value')
      if (valueEl) valueEl.textContent = pickerData.selectedLabel
      menuEl.innerHTML = renderConfigMenuOptions(pickerData.options, pickerData.selectedValue, pickerData.state, labels)
      if (!isReady || disabled) {
        closeMenu(switchEl)
      }
    })
  }

  const setSwitching = (switching: boolean): void => {
    if (switching) {
      threadConfigSwitching.add(thread.threadId)
      closeAllMenus()
    } else {
      threadConfigSwitching.delete(thread.threadId)
    }
    if (store.get().activeThreadId === thread.threadId) {
      updateInputState()
    }
  }

  const switchConfig = async (configId: string, nextValue: string): Promise<void> => {
    const activeThreadID = store.get().activeThreadId
    if (!activeThreadID || activeThreadID !== thread.threadId) return
    if (hasThreadStream(activeThreadID)) return

    const latest = store.get().threads.find(item => item.threadId === activeThreadID)
    if (!latest) return

    configId = configId.trim()
    nextValue = nextValue.trim()
    if (!configId || !nextValue) return

    const currentOption = getThreadConfigOptionsForRender(latest).find(option => option.id === configId)
    const currentValue = currentOption?.currentValue?.trim()
      || fallbackThreadConfigValue(latest, configId)
    if (nextValue === currentValue) return

    setSwitching(true)
    try {
      const updatedOptions = await api.setThreadConfigOption(activeThreadID, {
        configId,
        value: nextValue,
      })
      const nextModelID = findModelOption(updatedOptions)?.currentValue?.trim() ?? fallbackThreadModelID(latest)
      const normalized = cacheThreadConfigOptions(latest, updatedOptions, nextModelID)
      const { threads } = store.get()
      store.set({
        threads: threads.map(item => (
          item.threadId === activeThreadID
            ? { ...item, agentOptions: buildThreadAgentOptions(item.agentOptions, normalized) }
            : item
        )),
      })
      renderConfigUI()
    } catch (err) {
      renderConfigUI()
      const message = err instanceof Error ? err.message : String(err)
      const targetLabel = configId.toLowerCase() === 'model' ? '模型' : '配置项'
      window.alert(`更新${targetLabel}失败：${message}`)
    } finally {
      setSwitching(false)
      renderConfigUI()
    }
  }

  renderConfigUI()
  if (!threadConfigCache.has(thread.threadId) && !hasAgentConfigCatalog(thread.agent ?? '', fallbackThreadModelID(thread))) {
    void loadThreadConfigOptions(thread.threadId)
      .then(() => {
        if (store.get().activeThreadId !== thread.threadId) return
        renderConfigUI()
        updateInputState()
      })
      .catch(err => {
        if (store.get().activeThreadId !== thread.threadId) return
        renderConfigUI()
        const message = err instanceof Error ? err.message : String(err)
        window.alert(`加载 Agent 配置项失败：${message}`)
      })
  }

  switchEls.forEach(switchEl => {
    const triggerEl = switchEl.querySelector<HTMLButtonElement>('.thread-model-trigger')
    const menuEl = switchEl.querySelector<HTMLDivElement>('.thread-model-menu')
    if (!triggerEl || !menuEl) return

    const toggleMenu = (): void => {
      const expanded = triggerEl.getAttribute('aria-expanded') === 'true'
      if (expanded) {
        closeMenu(switchEl)
        return
      }
      if (triggerEl.disabled) return
      closeAllMenus()
      triggerEl.setAttribute('aria-expanded', 'true')
      menuEl.removeAttribute('hidden')
    }

    triggerEl.addEventListener('click', e => {
      e.preventDefault()
      toggleMenu()
    })

    menuEl.addEventListener('click', e => {
      const target = e.target as HTMLElement | null
      const optionBtn = target?.closest('.thread-model-option-item[data-value]') as HTMLButtonElement | null
      if (!optionBtn || optionBtn.disabled) return
      const configId = triggerEl.dataset.configId?.trim() ?? ''
      const nextValue = optionBtn.dataset.value?.trim() ?? ''
      closeMenu(switchEl)
      void switchConfig(configId, nextValue)
    })

    switchEl.addEventListener('focusout', e => {
      const related = e.relatedTarget as Node | null
      if (!related || !switchEl.contains(related)) {
        closeMenu(switchEl)
      }
    })

    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu(switchEl)
        triggerEl.focus()
      }
    }
    triggerEl.addEventListener('keydown', onEsc)
    menuEl.addEventListener('keydown', onEsc)
  })
}

function closeSessionInfoPopover(): void {
  const root = document.getElementById('session-info')
  const trigger = document.getElementById('session-info-trigger') as HTMLButtonElement | null
  const panel = document.getElementById('session-info-panel') as HTMLDivElement | null
  if (!root || !trigger || !panel) return

  root.classList.remove('session-info--open')
  trigger.setAttribute('aria-expanded', 'false')
  panel.hidden = true
}

function bindSessionInfoPopover(): void {
  const root = document.getElementById('session-info')
  const trigger = document.getElementById('session-info-trigger') as HTMLButtonElement | null
  const panel = document.getElementById('session-info-panel') as HTMLDivElement | null
  if (!root || !trigger || !panel) return

  const setOpen = (open: boolean): void => {
    root.classList.toggle('session-info--open', open)
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
    panel.hidden = !open
  }

  trigger.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(panel.hidden)
  })

  panel.addEventListener('click', e => e.stopPropagation())

  root.querySelectorAll<HTMLButtonElement>('.session-info-copy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()

      const encoded = btn.dataset.copyValue ?? ''
      const value = encoded ? decodeURIComponent(encoded) : ''
      if (!value) return

      void copyText(value).then(copied => {
        if (!copied) return
        btn.innerHTML = iconCheck
        btn.classList.add('session-info-copy-btn--copied')
        setTimeout(() => {
          btn.innerHTML = iconCopy
          btn.classList.remove('session-info-copy-btn--copied')
        }, 1_500)
      })
    })
  })
}

// ── Scroll-to-bottom button ───────────────────────────────────────────────

function bindScrollBottom(): void {
  const listEl = document.getElementById('message-list')
  const btnEl  = document.getElementById('scroll-bottom-btn') as HTMLButtonElement | null
  if (!listEl || !btnEl) return

  const syncBtn = () => syncScrollBottomButton(listEl)

  listEl.addEventListener('scroll', syncBtn, { passive: true })
  btnEl.addEventListener('click', () => {
    listEl.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' })
  })
  syncBtn()
}

// ── Input resize ──────────────────────────────────────────────────────────

function bindInputResize(): void {
  const input = document.getElementById('message-input') as HTMLTextAreaElement | null
  const menuEl = document.getElementById('slash-command-menu') as HTMLDivElement | null
  if (!input) return
  input.addEventListener('input', () => {
    const activeThreadId = store.get().activeThreadId
    if (activeThreadId) {
      composerDraftByThread.set(activeThreadId, input.value)
    }
    resizeComposerInput(input)
    updateSlashCommandMenu()
  })
  input.addEventListener('keydown', e => {
    const menuVisible = !!menuEl && !menuEl.hidden
    if (menuVisible) {
      const { activeThreadId, threads } = store.get()
      const thread = activeThreadId ? threads.find(item => item.threadId === activeThreadId) : null
      const commands = thread ? getFilteredSlashCommands(getAgentSlashCommands(thread.agent ?? ''), input.value.slice(1)) : []
      if (e.key === 'ArrowDown' && commands.length) {
        e.preventDefault()
        slashCommandSelectedIndex = (slashCommandSelectedIndex + 1) % commands.length
        updateSlashCommandMenu()
        return
      }
      if (e.key === 'ArrowUp' && commands.length) {
        e.preventDefault()
        slashCommandSelectedIndex = (slashCommandSelectedIndex - 1 + commands.length) % commands.length
        updateSlashCommandMenu()
        return
      }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && commands.length) {
        e.preventDefault()
        selectSlashCommand(commands[slashCommandSelectedIndex]?.name ?? '')
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        resetSlashCommandLookup()
        closeSlashCommandMenu()
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      document.getElementById('send-btn')?.click()
    }
  })

  menuEl?.addEventListener('mousedown', e => e.preventDefault())
  menuEl?.addEventListener('click', e => {
    const target = e.target as HTMLElement | null
    const item = target?.closest('.slash-command-item[data-command-name]') as HTMLButtonElement | null
    const commandName = item?.dataset.commandName?.trim() ?? ''
    if (!commandName) return
    selectSlashCommand(commandName)
  })
  menuEl?.addEventListener('mousemove', e => {
    const target = e.target as HTMLElement | null
    const item = target?.closest('.slash-command-item[data-command-name]') as HTMLButtonElement | null
    if (!item) return
    const all = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('.slash-command-item[data-command-name]'))
    const index = all.indexOf(item)
    if (index < 0 || index === slashCommandSelectedIndex) return
    slashCommandSelectedIndex = index
    updateSlashCommandMenu()
  })
}

// ── Send ──────────────────────────────────────────────────────────────────

function bindSendHandler(): void {
  document.getElementById('send-btn')?.addEventListener('click', handleSend)
}

function bindPendingUploads(thread: Thread): void {
  const uploadInput = document.getElementById('upload-input') as HTMLInputElement | null
  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement | null
  const wrapper = document.querySelector('.input-wrapper') as HTMLDivElement | null
  const pendingEl = document.getElementById('pending-uploads') as HTMLDivElement | null
  const inputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
  if (!uploadInput || !uploadBtn || !wrapper || !pendingEl || !inputEl) return

  const startUpload = async (files: File[]): Promise<void> => {
    const selected = files.filter(file => file.size > 0)
    if (!selected.length) return

    composerDraftByThread.set(thread.threadId, inputEl.value)
    uploadInFlightThreads.add(thread.threadId)
    updateInputState()
    try {
      const uploaded = await api.uploadFiles(selected)
      const current = pendingUploadsByThread.get(thread.threadId) ?? []
      pendingUploadsByThread.set(thread.threadId, [...current, ...uploaded])
      const usage = await api.getStorageUsage()
      store.set({ storageUsage: usage })
      if (store.get().activeThreadId === thread.threadId) {
        updateChatArea()
        restoreComposerDraft(thread.threadId, true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`上传失败：${message}`)
    } finally {
      uploadInFlightThreads.delete(thread.threadId)
      uploadInput.value = ''
      updateInputState()
    }
  }

  uploadBtn.addEventListener('click', () => uploadInput.click())
  uploadInput.addEventListener('change', () => {
    const files = Array.from(uploadInput.files ?? [])
    void startUpload(files)
  })

  pendingEl.addEventListener('click', e => {
    const target = e.target as HTMLElement | null
    const uploadId = target?.getAttribute('data-remove-upload')?.trim() ?? ''
    if (!uploadId) return
    composerDraftByThread.set(thread.threadId, inputEl.value)
    const current = pendingUploadsByThread.get(thread.threadId) ?? []
    pendingUploadsByThread.set(thread.threadId, current.filter(item => item.uploadId !== uploadId))
    updateChatArea()
    restoreComposerDraft(thread.threadId, true)
  })

  wrapper.addEventListener('dragover', e => {
    e.preventDefault()
    wrapper.classList.add('input-wrapper--dragover')
  })
  wrapper.addEventListener('dragleave', e => {
    e.preventDefault()
    if (e.target === wrapper) {
      wrapper.classList.remove('input-wrapper--dragover')
    }
  })
  wrapper.addEventListener('drop', e => {
    e.preventDefault()
    wrapper.classList.remove('input-wrapper--dragover')
    const files = Array.from(e.dataTransfer?.files ?? [])
    void startUpload(files)
  })

  inputEl.addEventListener('paste', e => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const files = items
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => !!file)
    if (!files.length) return
    e.preventDefault()
    void startUpload(files)
  })
}

function handleSend(): void {
  const inputEl = document.getElementById('message-input') as HTMLTextAreaElement | null
  if (!inputEl) return

  const text = inputEl.value.trim()

  const { activeThreadId, threads } = store.get()
  if (!activeThreadId) return

  const thread = threads.find(t => t.threadId === activeThreadId)
  if (!thread || sessionSwitchingThreads.has(thread.threadId)) return
  const pendingUploads = pendingUploadsByThread.get(thread.threadId) ?? []
  if (!text && !pendingUploads.length) return
  const capturedThreadID = activeThreadId
  let capturedSessionID = threadSessionID(thread)
  let capturedScopeKey = threadChatScopeKey(thread)
  if (getScopeStreamState(capturedScopeKey)) return

  const agentAvatar  = renderAgentAvatar(thread?.agent ?? '', 'message')

  // Clear input immediately
  composerDraftByThread.set(thread.threadId, '')
  inputEl.value = ''
  resizeComposerInput(inputEl)
  resetSlashCommandLookup()
  closeSlashCommandMenu()

  const now = new Date().toISOString()

  // ── 1. Add user message (fires subscribe → updateMessageList renders it) ──
  const userMsg: Message = {
    id:        generateUUID(),
    role:      'user',
    content:   text,
    attachments: pendingUploads,
    timestamp: now,
    status:    'done',
  }
  addMessageToStore(capturedScopeKey, userMsg)
  pendingUploadsByThread.set(thread.threadId, [])
  updateChatArea()

  // ── 2. Reserve streaming message ID before touching stream state ───────────
  //    This prevents subscribe → updateMessageList from wiping the bubble.
  const agentMsgID = generateUUID()
  activeStreamMsgId = agentMsgID
  activeStreamScopeKey = capturedScopeKey
  streamBufferByScope.set(capturedScopeKey, '')
  streamPlanByScope.delete(capturedScopeKey)
  streamToolCallsByScope.delete(capturedScopeKey)
  streamReasoningByScope.delete(capturedScopeKey)
  streamStartedAtByScope.set(capturedScopeKey, now)
  setScopeStreamState(capturedScopeKey, {
    turnId: '',
    threadId: capturedThreadID,
    sessionId: capturedSessionID,
    messageId: agentMsgID,
    status: 'streaming',
  })

  // ── 4. Append streaming bubble directly to DOM ─────────────────────────────
  const listEl = document.getElementById('message-list')
  if (listEl) {
    listEl.querySelector('.empty-state')?.remove()
    const div = document.createElement('div')
    div.className        = 'message message--agent'
    div.dataset.msgId    = agentMsgID
    div.innerHTML = `
      <div class="message-avatar">${agentAvatar}</div>
      <div class="message-group">
        ${renderStreamingBubbleHTML(agentMsgID, '', undefined, undefined, '')}
        <div class="message-meta">
          <span class="message-time">${formatTimestamp(now)}</span>
        </div>
      </div>`
    listEl.appendChild(div)
    listEl.scrollTop = listEl.scrollHeight
  }

  // ── 5. Start SSE stream ────────────────────────────────────────────────────
  const stream = api.startTurn(capturedThreadID, text, pendingUploads.map(item => item.uploadId), {

    onTurnStarted({ turnId }) {
      const state = getScopeStreamState(capturedScopeKey)
      if (!state) return
      setScopeStreamState(capturedScopeKey, { ...state, turnId })
    },

    onDelta({ delta }) {
      const previous = streamBufferByScope.get(capturedScopeKey) ?? ''
      const next = previous + delta
      streamBufferByScope.set(capturedScopeKey, next)

      if (activeChatScopeKey() !== capturedScopeKey) return
      const list      = document.getElementById('message-list')
      const atBottom  = !list || isNearBottom(list)
      updateStreamingBubbleContent(agentMsgID, next)
      if (atBottom && list) list.scrollTop = list.scrollHeight
    },

    onReasoningDelta({ delta }: ReasoningDeltaPayload) {
      const previous = streamReasoningByScope.get(capturedScopeKey) ?? ''
      const next = previous + delta
      streamReasoningByScope.set(capturedScopeKey, next)

      if (activeChatScopeKey() !== capturedScopeKey) return
      const list = document.getElementById('message-list')
      const atBottom = !list || isNearBottom(list)
      updateStreamingBubbleReasoning(agentMsgID, next)
      if (atBottom && list) list.scrollTop = list.scrollHeight
    },

    onPlanUpdate({ entries }: PlanUpdatePayload) {
      const nextPlanEntries = clonePlanEntries(entries) ?? []
      streamPlanByScope.set(capturedScopeKey, nextPlanEntries)

      if (activeChatScopeKey() !== capturedScopeKey) return
      const list = document.getElementById('message-list')
      const atBottom = !list || isNearBottom(list)
      updateStreamingBubblePlan(agentMsgID, nextPlanEntries)
      if (atBottom && list) list.scrollTop = list.scrollHeight
    },

    onToolCall(event: ToolCallPayload) {
      const current = streamToolCallsByScope.get(capturedScopeKey) ?? []
      const nextToolCalls = applyToolCallEvent(current, event as unknown as Record<string, unknown>)
      streamToolCallsByScope.set(capturedScopeKey, nextToolCalls)

      if (activeChatScopeKey() !== capturedScopeKey) return
      const list = document.getElementById('message-list')
      const atBottom = !list || isNearBottom(list)
      updateStreamingBubbleToolCalls(agentMsgID, nextToolCalls)
      if (atBottom && list) list.scrollTop = list.scrollHeight
    },

    onToolCallUpdate(event: ToolCallPayload) {
      const current = streamToolCallsByScope.get(capturedScopeKey) ?? []
      const nextToolCalls = applyToolCallEvent(current, event as unknown as Record<string, unknown>)
      streamToolCallsByScope.set(capturedScopeKey, nextToolCalls)

      if (activeChatScopeKey() !== capturedScopeKey) return
      const list = document.getElementById('message-list')
      const atBottom = !list || isNearBottom(list)
      updateStreamingBubbleToolCalls(agentMsgID, nextToolCalls)
      if (atBottom && list) list.scrollTop = list.scrollHeight
    },

    onSessionBound({ sessionId }: SessionBoundPayload) {
      const nextSessionID = sessionId.trim()
      if (!nextSessionID || nextSessionID === capturedSessionID) return
      const previousScopeKey = capturedScopeKey
      capturedSessionID = nextSessionID
      capturedScopeKey = threadSessionScopeKey(capturedThreadID, capturedSessionID)
      rebindScopeRuntime(previousScopeKey, capturedScopeKey, capturedSessionID)
      updateThreadSessionID(capturedThreadID, sessionId)
    },

    onPermissionRequired(event) {
      const pending = upsertPendingPermission(capturedScopeKey, event)
      mountPendingPermissionCard(capturedScopeKey, pending)
    },

    onCompleted({ stopReason }) {
      // Clear stream tracking BEFORE addMessageToStore (so subscribe calls updateMessageList)
      const finalContent = streamBufferByScope.get(capturedScopeKey) ?? ''
      const finalPlanEntries = clonePlanEntries(streamPlanByScope.get(capturedScopeKey))
      const finalToolCalls = cloneToolCalls(streamToolCallsByScope.get(capturedScopeKey))
      const finalReasoning = streamReasoningByScope.get(capturedScopeKey) ?? ''
      clearScopeStreamRuntime(capturedScopeKey)
      clearPendingPermissions(capturedScopeKey)
      markThreadCompletionBadge(capturedThreadID)
      void loadThreadSessions(capturedThreadID)
      void loadThreadSlashCommands(capturedThreadID, true)

      addMessageToStore(capturedScopeKey, {
        id:         agentMsgID,
        role:       'agent',
        content:    finalContent,
        timestamp:  now,
        status:     stopReason === 'cancelled' ? 'cancelled' : 'done',
        stopReason,
        planEntries: finalPlanEntries,
        toolCalls: finalToolCalls,
        reasoning: hasReasoningText(finalReasoning) ? finalReasoning : undefined,
      })
    },

    onError({ code, message: msg }) {
      const partialContent = streamBufferByScope.get(capturedScopeKey) ?? ''
      const finalPlanEntries = clonePlanEntries(streamPlanByScope.get(capturedScopeKey))
      const finalToolCalls = cloneToolCalls(streamToolCallsByScope.get(capturedScopeKey))
      const finalReasoning = streamReasoningByScope.get(capturedScopeKey) ?? ''
      clearScopeStreamRuntime(capturedScopeKey)
      clearPendingPermissions(capturedScopeKey)
      void loadThreadSessions(capturedThreadID)
      void loadThreadSlashCommands(capturedThreadID, true)

      addMessageToStore(capturedScopeKey, {
        id:           agentMsgID,
        role:         'agent',
        content:      partialContent,
        timestamp:    now,
        status:       'error',
        errorCode:    code,
        errorMessage: msg,
        planEntries:  finalPlanEntries,
        toolCalls:    finalToolCalls,
        reasoning:    hasReasoningText(finalReasoning) ? finalReasoning : undefined,
      })
    },

    onDisconnect() {
      const partialContent = streamBufferByScope.get(capturedScopeKey) ?? ''
      const finalPlanEntries = clonePlanEntries(streamPlanByScope.get(capturedScopeKey))
      const finalToolCalls = cloneToolCalls(streamToolCallsByScope.get(capturedScopeKey))
      const finalReasoning = streamReasoningByScope.get(capturedScopeKey) ?? ''
      clearScopeStreamRuntime(capturedScopeKey)
      clearPendingPermissions(capturedScopeKey)
      void loadThreadSessions(capturedThreadID)
      void loadThreadSlashCommands(capturedThreadID, true)

      addMessageToStore(capturedScopeKey, {
        id:           agentMsgID,
        role:         'agent',
        content:      partialContent,
        timestamp:    now,
        status:       'error',
        errorMessage: '连接已断开',
        planEntries:  finalPlanEntries,
        toolCalls:    finalToolCalls,
        reasoning:    hasReasoningText(finalReasoning) ? finalReasoning : undefined,
      })
    },
  })

  streamsByScope.set(capturedScopeKey, stream)
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = sizeBytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

// ── Cancel ────────────────────────────────────────────────────────────────

function bindCancelHandler(): void {
  document.getElementById('cancel-btn')?.addEventListener('click', () => void handleCancel())
}

async function handleCancel(): Promise<void> {
  const scopeKey = activeChatScopeKey()
  const streamState = getActiveChatStreamState()
  if (!scopeKey || !streamState?.turnId) return

  setScopeStreamState(scopeKey, { ...streamState, status: 'cancelling' })
  try {
    await api.cancelTurn(streamState.turnId)
  } catch {
    // Ignore — stream will eventually deliver turn_completed with stopReason=cancelled
  }
}

// ── New thread ────────────────────────────────────────────────────────────

function openNewThread(): void {
  newThreadModal.open()
}

function openMobileSidebar(): void {
  document.getElementById('sidebar')?.classList.add('sidebar--open')
  document.getElementById('mobile-sidebar-backdrop')?.removeAttribute('hidden')
}

function closeMobileSidebar(): void {
  document.getElementById('sidebar')?.classList.remove('sidebar--open')
  document.getElementById('mobile-sidebar-backdrop')?.setAttribute('hidden', 'true')
}

function toggleMobileSidebar(): void {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return
  if (sidebar.classList.contains('sidebar--open')) {
    closeMobileSidebar()
  } else {
    openMobileSidebar()
  }
}

function openMobileSessionOverlay(): void {
  document.getElementById('mobile-session-overlay')?.removeAttribute('hidden')
}

function closeMobileSessionOverlay(): void {
  document.getElementById('mobile-session-overlay')?.setAttribute('hidden', 'true')
}

// ── Static layout shell ───────────────────────────────────────────────────

function renderShell(): void {
  const root = document.getElementById('app')
  if (!root) return

  root.innerHTML = `
    <div class="layout">
      <button class="mobile-sidebar-backdrop" id="mobile-sidebar-backdrop" type="button" aria-label="关闭侧边栏" hidden></button>
      <div class="mobile-session-overlay" id="mobile-session-overlay" hidden>
        <button class="mobile-session-overlay-backdrop" id="mobile-session-overlay-backdrop" type="button" aria-label="关闭会话列表"></button>
        <div class="mobile-session-sheet">
          <div class="mobile-session-panel" id="mobile-session-panel"></div>
        </div>
      </div>

      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <div class="sidebar-brand-icon">N</div>
            <span>Ngent</span>
          </div>
          <button class="btn btn-icon" id="new-thread-btn" title="新建 Agent" aria-label="新建 Agent">
            ${iconPlus}
          </button>
        </div>

        <div class="sidebar-search">
          <input
            id="search-input"
            class="search-input"
            type="search"
            placeholder="搜索 Agent…"
            aria-label="搜索 Agent"
          />
        </div>

        <div class="thread-list" id="thread-list">
          ${skeletonItems()}
        </div>

        <div class="sidebar-footer">
          <button class="btn btn-ghost sidebar-settings-btn" id="settings-btn">
            ${iconSettings} 设置
          </button>
        </div>

        <div class="thread-action-layer" id="thread-action-layer" hidden></div>
      </aside>

      <main class="chat" id="chat">
        ${renderChatEmpty()}
      </main>

      <aside class="session-sidebar" id="session-sidebar">
        <div class="session-panel-header">
          <h3 class="session-panel-title">会话</h3>
        </div>
        <div class="session-panel-empty">请选择一个 Agent 以浏览 ACP 会话。</div>
      </aside>

      <div class="attachment-preview-modal" id="attachment-preview-modal" hidden>
        <div class="attachment-preview-backdrop" data-close-attachment-preview="true"></div>
        <div class="attachment-preview-dialog" role="dialog" aria-modal="true" aria-label="图片预览">
          <div class="attachment-preview-header">
            <div class="attachment-preview-title" id="attachment-preview-title">图片预览</div>
            <button class="btn btn-icon attachment-preview-close" id="attachment-preview-close" type="button" aria-label="关闭预览">
              ${iconClose}
            </button>
          </div>
          <div class="attachment-preview-status" id="attachment-preview-status"></div>
          <div class="attachment-preview-body">
            <img class="attachment-preview-image" id="attachment-preview-image" alt="图片预览" />
          </div>
        </div>
      </div>
    </div>`

  document.getElementById('settings-btn')?.addEventListener('click', () => settingsPanel.open())
  document.getElementById('new-thread-btn')?.addEventListener('click', openNewThread)
  document.getElementById('new-thread-empty-btn')?.addEventListener('click', openNewThread)

  const searchEl = document.getElementById('search-input') as HTMLInputElement | null
  searchEl?.addEventListener('input', () => {
    store.set({ searchQuery: searchEl.value })
    updateThreadList()
  })
}

function bindAttachmentPreviewModal(): void {
  document.getElementById('attachment-preview-close')?.addEventListener('click', closeAttachmentPreview)
  document.querySelectorAll<HTMLElement>('[data-close-attachment-preview="true"]').forEach(el => {
    el.addEventListener('click', closeAttachmentPreview)
  })
}

// ── Global keyboard shortcuts ─────────────────────────────────────────────

function bindGlobalShortcuts(): void {
  document.addEventListener('keydown', e => {
    const active = document.activeElement as HTMLElement | null
    const inInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'

    // '/' — focus search input
    if (e.key === '/' && !inInput && !e.metaKey && !e.ctrlKey) {
      const searchEl = document.getElementById('search-input')
      if (searchEl) {
        e.preventDefault()
        searchEl.focus()
      }
      return
    }

    // Cmd+N / Ctrl+N — open new thread modal
    if (e.key === 'n' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault()
      openNewThread()
      return
    }

    // Escape — contextual (most-specific first)
    if (e.key === 'Escape') {
      // (1) close attachment preview if open
      const attachmentPreview = document.getElementById('attachment-preview-modal')
      if (attachmentPreview && !attachmentPreview.hidden) {
        e.preventDefault()
        closeAttachmentPreview()
        return
      }
      // (2) close mobile session overlay if open
      const mobileSessionOverlay = document.getElementById('mobile-session-overlay')
      if (mobileSessionOverlay && !mobileSessionOverlay.hidden) {
        e.preventDefault()
        closeMobileSessionOverlay()
        return
      }
      // (3) close mobile sidebar if open
      const sidebar = document.getElementById('sidebar')
      if (sidebar?.classList.contains('sidebar--open')) {
        closeMobileSidebar()
        return
      }
      // (4) close thread action menu if open
      if (openThreadActionMenuId) {
        e.preventDefault()
        resetThreadActionMenuState()
        updateThreadList()
        return
      }
      // (5) close slash command menu if open
      const slashCommandMenu = document.getElementById('slash-command-menu') as HTMLDivElement | null
      if (slashCommandMenu && !slashCommandMenu.hidden) {
        e.preventDefault()
        closeSlashCommandMenu()
        return
      }
      // (6) close session info popover if open
      const sessionInfoPanel = document.getElementById('session-info-panel')
      if (sessionInfoPanel && !sessionInfoPanel.hidden) {
        e.preventDefault()
        closeSessionInfoPopover()
        return
      }
      // (7) clear search if focused
      const searchEl = document.getElementById('search-input') as HTMLInputElement | null
      if (searchEl && document.activeElement === searchEl) {
        searchEl.value = ''
        store.set({ searchQuery: '' })
        searchEl.blur()
        return
      }
      // (8) cancel active stream
      const streamState = getActiveChatStreamState()
      if (streamState?.turnId) {
        void handleCancel()
      }
    }
  })
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  renderShell()
  bindAttachmentPreviewModal()
  bindGlobalShortcuts()
  const repositionThreadActionLayer = (): void => {
    if (!openThreadActionMenuId) return
    renderThreadActionLayer()
  }
  document.getElementById('thread-list')?.addEventListener('scroll', repositionThreadActionLayer, { passive: true })
  window.addEventListener('resize', repositionThreadActionLayer)
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement | null
    if (!target?.closest('.input-area')) {
      resetSlashCommandLookup()
      closeSlashCommandMenu()
    }
    if (!target?.closest('.session-info')) {
      closeSessionInfoPopover()
    }

    if (!openThreadActionMenuId) return
    if (target?.closest('.thread-item-menu-trigger') || target?.closest('.thread-action-popover')) return
    resetThreadActionMenuState()
    updateThreadList()
  })

  document.getElementById('mobile-sidebar-backdrop')?.addEventListener('click', () => {
    closeMobileSidebar()
  })
  document.getElementById('mobile-session-overlay-backdrop')?.addEventListener('click', () => {
    closeMobileSessionOverlay()
  })

  store.subscribe(() => {
    const { activeThreadId, threads } = store.get()
    const activeThread = activeThreadId ? threads.find(thread => thread.threadId === activeThreadId) ?? null : null
    const threadChanged = activeThreadId !== lastRenderThreadId
    const chatScopeKey = threadChatScopeKey(activeThread)
    const chatScopeChanged = chatScopeKey !== lastRenderChatScopeKey
    const chatScopeStreamState = getScopeStreamState(chatScopeKey)
    const shouldRefreshForScopeChange = chatScopeChanged && (!chatScopeStreamState || !hasMountedActiveStream(chatScopeKey))

    updateThreadList()
    updateSessionPanel()

    if (threadChanged || shouldRefreshForScopeChange) {
      lastRenderThreadId = activeThreadId
      lastRenderChatScopeKey = chatScopeKey
      updateChatArea()
    } else {
      if (chatScopeChanged && hasMountedActiveStream(chatScopeKey)) {
        // A fresh session can become bound to its stable session id right before
        // the turn completes. Keep tracking the new scope even though we reuse
        // the existing streaming DOM, otherwise completion will look like a
        // later scope switch and trigger an unnecessary history reload that can
        // overwrite the finalized reasoning.
        lastRenderChatScopeKey = chatScopeKey
      }
      // activeStreamMsgId is non-null while the streaming bubble is in the DOM.
      // Re-rendering the message list would destroy that bubble, so we skip it.
      if (!activeStreamMsgId) updateMessageList()
      updateInputState()
    }
  })

  try {
    const [agents, threads, storageUsage] = await Promise.all([
      api.getAgents(),
      api.getThreads(),
      api.getStorageUsage(),
    ])
    store.set({
      agents,
      threads,
      storageUsage,
      activeThreadId: resolveActiveThreadId(threads, store.get().activeThreadId),
    })
  } catch {
    const el = document.getElementById('thread-list')
    if (el) {
      el.innerHTML = `<div class="thread-list-empty" style="color:var(--error)">
        加载 Agent 列表失败。<br>请在“设置”中检查服务器连接。
      </div>`
    }
  }
}

void init()
