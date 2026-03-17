import { store } from '../store.ts'
import { api, ApiError } from '../api.ts'
import type { AgentInfo } from '../types.ts'
import { isAbsolutePath, escHtml } from '../utils.ts'

// ── Icons ──────────────────────────────────────────────────────────────────

const iconClose = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`

const iconChevron = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
  <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// ── Agent Icons ─────────────────────────────────────────────────────────────

const agentIcons: Record<string, string> = {
  codex: `<img src="/codex-icon.png" width="32" height="32" alt="Codex" style="border-radius:8px;display:block;">`,
  gemini: `<img src="/gemini-icon.png" width="32" height="32" alt="Gemini CLI" style="border-radius:8px;display:block;">`,
  claude: `<img src="/claude-icon.png" width="32" height="32" alt="Claude Code" style="border-radius:8px;display:block;">`,
  kimi: `<img src="/kimi-icon.png" width="32" height="32" alt="Kimi CLI" style="border-radius:8px;display:block;object-fit:contain;">`,
  opencode: `<img src="/opencode-icon.png" width="32" height="32" alt="OpenCode" style="border-radius:8px;display:block;object-fit:contain;">`,
  qwen: `<img src="/qwen-icon.png" width="32" height="32" alt="Qwen Code" style="border-radius:8px;display:block;">`,
}

const iconAgentDefault = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#6B7280"/>
  <g transform="translate(4,4)" stroke="white" stroke-width="1.5" stroke-linecap="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v4l3 3"/>
  </g>
</svg>`

function agentIcon(agentId: string): string {
  return agentIcons[agentId] ?? iconAgentDefault
}

// ── State ──────────────────────────────────────────────────────────────────

interface ModalState {
  selectedAgent: string
  cwd: string
  title: string
  modelId: string
  agentOptionsRaw: string
  advancedOpen: boolean
  submitting: boolean
  error: string
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderAgentCard(agent: AgentInfo, selected: boolean): string {
  const disabled = agent.status === 'unavailable'
  return `
    <label class="agent-card ${selected ? 'agent-card--selected' : ''} ${disabled ? 'agent-card--disabled' : ''}">
      <input
        type="radio"
        name="agent"
        value="${escHtml(agent.id)}"
        ${selected ? 'checked' : ''}
        ${disabled ? 'disabled' : ''}
        class="agent-card-radio"
      />
      <div class="agent-card-icon">${agentIcon(agent.id)}</div>
      <span class="agent-card-name">${escHtml(agent.name)}</span>
    </label>`
}

function renderModal(s: ModalState, agents: AgentInfo[]): string {
  const cwdInvalid = s.cwd.length > 0 && !isAbsolutePath(s.cwd)
  const canSubmit = !!s.selectedAgent && isAbsolutePath(s.cwd) && !s.submitting

  return `
    <div class="modal-overlay" id="new-thread-overlay" role="dialog" aria-modal="true" aria-label="新建 Agent">
      <div class="modal" id="new-thread-modal">

        <div class="modal-header">
          <h2 class="modal-title">新建 Agent</h2>
          <button class="btn btn-icon" id="new-thread-close" aria-label="关闭">${iconClose}</button>
        </div>

        <div class="modal-body">

          ${s.error ? `<div class="form-error-banner" id="modal-error">${escHtml(s.error)}</div>` : ''}

          <div class="form-group">
            <label class="form-label">Agent</label>
            <div class="agent-grid" id="agent-grid">
              ${agents.length
                ? agents.map(a => renderAgentCard(a, a.id === s.selectedAgent)).join('')
                : '<p class="form-hint">正在加载 Agent…</p>'}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="cwd-input">
              工作目录 <span class="form-required">*</span>
            </label>
            <input
              id="cwd-input"
              class="settings-input ${cwdInvalid ? 'settings-input--error' : ''}"
              type="text"
              placeholder="/home/user/my-project"
              value="${escHtml(s.cwd)}"
              autocomplete="off"
              spellcheck="false"
            />
            ${cwdInvalid
              ? `<p class="form-hint form-hint--error" id="cwd-hint">路径必须是绝对路径（以 / 开头）</p>`
              : `<p class="form-hint" id="cwd-hint">项目目录的绝对路径。</p>`}
          </div>

          <div class="form-group">
            <label class="form-label" for="title-input">标题 <span class="form-optional">（可选）</span></label>
            <input
              id="title-input"
              class="settings-input"
              type="text"
              placeholder="例如：重构支付模块"
              value="${escHtml(s.title)}"
              maxlength="120"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="model-id-input">模型 ID <span class="form-optional">（可选）</span></label>
            <input
              id="model-id-input"
              class="settings-input settings-input--mono"
              type="text"
              placeholder="例如：gpt-5.4"
              value="${escHtml(s.modelId)}"
              autocomplete="off"
              spellcheck="false"
            />
            <p class="form-hint">会写入 <code>agentOptions.modelId</code>。适合手动指定未出现在下拉里的模型。</p>
          </div>

          <div class="collapsible ${s.advancedOpen ? 'collapsible--open' : ''}">
            <button class="collapsible-toggle" id="advanced-toggle" type="button">
              <span class="collapsible-chevron">${iconChevron}</span>
              高级选项
            </button>
            <div class="collapsible-body">
              <div class="form-group">
                <label class="form-label" for="agent-options-input">
                  Agent 选项 <span class="form-optional">(JSON)</span>
                </label>
                <textarea
                  id="agent-options-input"
                  class="settings-input settings-input--mono"
                  placeholder='{"mode":"safe"}'
                  rows="3"
                  spellcheck="false"
                >${escHtml(s.agentOptionsRaw)}</textarea>
              </div>
            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" id="new-thread-cancel" type="button">取消</button>
          <button
            class="btn btn-primary"
            id="new-thread-submit"
            type="button"
            ${canSubmit ? '' : 'disabled'}
          >
            ${s.submitting ? '<span class="btn-spinner"></span> 创建中…' : '创建 Agent'}
          </button>
        </div>

      </div>
    </div>`
}

// ── Mount / unmount ────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let onCreated: ((threadId: string) => void) | null = null

let modalState: ModalState = {
  selectedAgent: '',
  cwd: '',
  title: '',
  modelId: '',
  agentOptionsRaw: '',
  advancedOpen: false,
  submitting: false,
  error: '',
}

function rerender(): void {
  if (!container) return
  const agents = store.get().agents
  container.innerHTML = renderModal(modalState, agents)
  bindEvents()
}

function unmount(): void {
  if (container) { container.remove(); container = null }
  store.set({ newThreadOpen: false })
  onCreated = null
}

function mount(cb: (threadId: string) => void): void {
  if (container) return
  onCreated = cb

  const agents = store.get().agents
  const firstAvailable = agents.find(a => a.status === 'available')

  modalState = {
    selectedAgent: firstAvailable?.id ?? (agents[0]?.id ?? ''),
    cwd: '',
    title: '',
    modelId: '',
    agentOptionsRaw: '',
    advancedOpen: false,
    submitting: false,
    error: '',
  }

  container = document.createElement('div')
  container.innerHTML = renderModal(modalState, agents)
  document.body.appendChild(container)
  store.set({ newThreadOpen: true })

  bindEvents()
  ;(container.querySelector('#cwd-input') as HTMLInputElement | null)?.focus()
}

// ── Event binding ──────────────────────────────────────────────────────────

function bindEvents(): void {
  if (!container) return

  container.querySelector('#new-thread-overlay')?.addEventListener('click', e => {
    if ((e.target as HTMLElement).id === 'new-thread-overlay') unmount()
  })

  container.querySelector('#new-thread-close')?.addEventListener('click', unmount)
  container.querySelector('#new-thread-cancel')?.addEventListener('click', unmount)

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { unmount(); document.removeEventListener('keydown', onEsc) }
  }
  document.addEventListener('keydown', onEsc)

  container.querySelector('#agent-grid')?.addEventListener('change', e => {
    const radio = e.target as HTMLInputElement
    if (radio.name === 'agent') {
      modalState = {
        ...modalState,
        selectedAgent: radio.value,
        error: '',
      }
      refreshAgentSelection()
      clearModalErrorBanner()
      refreshSubmitButton()
    }
  })

  container.querySelector<HTMLInputElement>('#cwd-input')?.addEventListener('input', e => {
    modalState = { ...modalState, cwd: (e.target as HTMLInputElement).value.trim(), error: '' }
    refreshCwdHint()
    refreshSubmitButton()
  })

  container.querySelector<HTMLInputElement>('#title-input')?.addEventListener('input', e => {
    modalState = { ...modalState, title: (e.target as HTMLInputElement).value }
  })

  container.querySelector<HTMLInputElement>('#model-id-input')?.addEventListener('input', e => {
    modalState = { ...modalState, modelId: (e.target as HTMLInputElement).value.trim(), error: '' }
  })

  container.querySelector<HTMLTextAreaElement>('#agent-options-input')?.addEventListener('input', e => {
    modalState = { ...modalState, agentOptionsRaw: (e.target as HTMLTextAreaElement).value }
  })

  container.querySelector('#advanced-toggle')?.addEventListener('click', () => {
    modalState = { ...modalState, advancedOpen: !modalState.advancedOpen }
    container?.querySelector('.collapsible')?.classList.toggle('collapsible--open', modalState.advancedOpen)
  })

  container.querySelector('#new-thread-submit')?.addEventListener('click', () => void submit())
}

// ── Targeted DOM refreshes (avoid full rerender during user input) ─────────

function refreshCwdHint(): void {
  const input = container?.querySelector<HTMLInputElement>('#cwd-input')
  const hint = container?.querySelector<HTMLElement>('#cwd-hint')
  if (!input || !hint) return
  const invalid = input.value.length > 0 && !isAbsolutePath(input.value.trim())
  input.classList.toggle('settings-input--error', invalid)
  hint.className = `form-hint${invalid ? ' form-hint--error' : ''}`
  hint.textContent = invalid
    ? '路径必须是绝对路径（以 / 开头）'
    : '项目目录的绝对路径。'
}

function refreshSubmitButton(): void {
  const btn = container?.querySelector<HTMLButtonElement>('#new-thread-submit')
  if (!btn) return
  const ok = !!modalState.selectedAgent && isAbsolutePath(modalState.cwd) && !modalState.submitting
  btn.disabled = !ok
}

function refreshAgentSelection(): void {
  const grid = container?.querySelector('#agent-grid')
  if (!grid) return
  const radios = grid.querySelectorAll<HTMLInputElement>('input[name="agent"]')
  radios.forEach(radio => {
    const selected = radio.value === modalState.selectedAgent
    radio.checked = selected
    const card = radio.closest('.agent-card')
    if (card) {
      card.classList.toggle('agent-card--selected', selected)
    }
  })
}

function clearModalErrorBanner(): void {
  const banner = container?.querySelector('#modal-error')
  if (banner) {
    banner.remove()
  }
}

// ── Submit ─────────────────────────────────────────────────────────────────

async function submit(): Promise<void> {
  if (!container) return

  let agentOptions: Record<string, unknown> | undefined
  if (modalState.agentOptionsRaw.trim()) {
    try {
      agentOptions = JSON.parse(modalState.agentOptionsRaw) as Record<string, unknown>
    } catch {
      modalState = { ...modalState, error: 'Agent 选项必须是有效的 JSON。' }
      rerender()
      return
    }
  }
  if (modalState.modelId) {
    agentOptions = { ...(agentOptions ?? {}), modelId: modalState.modelId }
  }

  modalState = { ...modalState, submitting: true, error: '' }
  rerender()

  try {
    const threadId = await api.createThread({
      agent: modalState.selectedAgent,
      cwd: modalState.cwd,
      title: modalState.title || undefined,
      agentOptions,
    })

    const threads = await api.getThreads()
    const state = store.get()
    const initialScopeKey = `${threadId}::`
    const nextMessages = Object.prototype.hasOwnProperty.call(state.messages, initialScopeKey)
      ? state.messages
      : { ...state.messages, [initialScopeKey]: [] }
    store.set({ threads, activeThreadId: threadId, messages: nextMessages })

    unmount()
    onCreated?.(threadId)
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : String(err)
    modalState = { ...modalState, submitting: false, error: msg }
    rerender()
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export const newThreadModal = {
  open(onDone?: (threadId: string) => void): void {
    mount(onDone ?? (() => { /* noop */ }))
  },
  close: unmount,
}
