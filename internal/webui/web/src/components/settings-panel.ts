import { store } from '../store.ts'
import type { Theme } from '../types.ts'
import { copyText, debounce, escHtml } from '../utils.ts'

// ── Icons ──────────────────────────────────────────────────────────────────

const iconClose = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`

const iconCopy = `<svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true">
  <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
  <path d="M2 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>`

// ── Render ─────────────────────────────────────────────────────────────────

function renderPanel(): string {
  const { clientId, authToken, serverUrl, theme } = store.get()

  const themeBtn = (value: Theme, label: string) => `
    <button
      class="theme-btn ${theme === value ? 'theme-btn--active' : ''}"
      data-theme-value="${value}"
      type="button"
    >${label}</button>`

  return `
    <div class="settings-overlay" id="settings-overlay" role="dialog" aria-modal="true" aria-label="设置">
      <div class="settings-panel" id="settings-panel">

        <div class="settings-header">
          <h2 class="settings-title">设置</h2>
          <button class="btn btn-icon" id="settings-close-btn" aria-label="关闭设置">
            ${iconClose}
          </button>
        </div>

        <div class="settings-body">

          <section class="settings-section">
            <h3 class="settings-section-title">身份</h3>
            <label class="settings-label">Client ID</label>
            <p class="settings-description">
              自动分配。当前浏览器中的所有 Agent 和轮次都以此 ID 为作用域。
            </p>
            <div class="settings-id-row">
              <code class="settings-client-id" id="client-id-display">${escHtml(clientId)}</code>
              <button class="btn btn-icon settings-copy-btn" id="copy-client-id-btn" title="复制 Client ID">
                ${iconCopy}
              </button>
            </div>
            <button class="btn btn-ghost btn-sm settings-reset-btn" id="reset-client-id-btn">
              重置 Client ID
            </button>
          </section>

          <section class="settings-section">
            <h3 class="settings-section-title">安全</h3>
            <label class="settings-label" for="auth-token-input">Bearer Token</label>
            <p class="settings-description">
              可选。如果服务端启动时使用了 <code>--auth-token</code>，请在这里填写。
            </p>
            <input
              id="auth-token-input"
              class="settings-input"
              type="password"
              placeholder="如果不需要可留空"
              value="${escHtml(authToken)}"
              autocomplete="off"
              spellcheck="false"
            />
          </section>

          <section class="settings-section">
            <h3 class="settings-section-title">外观</h3>
            <label class="settings-label">主题</label>
            <div class="theme-btn-group">
              ${themeBtn('light', '浅色')}
              ${themeBtn('system', '跟随系统')}
              ${themeBtn('dark', '深色')}
            </div>
          </section>

          <section class="settings-section">
            <h3 class="settings-section-title">连接</h3>
            <label class="settings-label" for="server-url-input">服务器 URL</label>
            <p class="settings-description">
              Ngent Server API 的基础地址。如果使用了反向代理，请在这里修改。
            </p>
            <input
              id="server-url-input"
              class="settings-input"
              type="url"
              placeholder="http://127.0.0.1:8686"
              value="${escHtml(serverUrl)}"
              autocomplete="off"
              spellcheck="false"
            />
          </section>

        </div>
      </div>
    </div>`
}

// ── Mount / Unmount ────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null

function unmount(): void {
  if (container) {
    container.remove()
    container = null
  }
  store.set({ settingsOpen: false })
}

function mount(): void {
  if (container) return

  container = document.createElement('div')
  container.innerHTML = renderPanel()
  document.body.appendChild(container)

  bindEvents()

  // Focus the panel for keyboard navigation
  ;(container.querySelector('#settings-panel') as HTMLElement | null)?.focus()
}

// ── Event binding ──────────────────────────────────────────────────────────

function bindEvents(): void {
  if (!container) return

  // Close on backdrop click
  container.querySelector<HTMLElement>('#settings-overlay')?.addEventListener('click', e => {
    if ((e.target as HTMLElement).id === 'settings-overlay') unmount()
  })

  // Close button
  container.querySelector('#settings-close-btn')?.addEventListener('click', unmount)

  // Escape key
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { unmount(); document.removeEventListener('keydown', onKey) }
  }
  document.addEventListener('keydown', onKey)

  // Copy client ID
  container.querySelector('#copy-client-id-btn')?.addEventListener('click', () => {
    const id = store.get().clientId
    void copyText(id).then(copied => {
      if (!copied) return
      const btn = container?.querySelector('#copy-client-id-btn')
      if (btn) {
        btn.textContent = '✓'
        setTimeout(() => { if (btn) btn.innerHTML = iconCopy }, 1500)
      }
    })
  })

  // Reset client ID (with confirmation)
  container.querySelector('#reset-client-id-btn')?.addEventListener('click', () => {
    if (!confirm('确定要重置 Client ID 吗？重置后你将无法在当前浏览器中访问已有 Agent。')) return
    store.resetClientId()
    const display = container?.querySelector<HTMLElement>('#client-id-display')
    if (display) display.textContent = store.get().clientId
  })

  // Auth token — save on change (debounced)
  const saveToken = debounce((v: string) => store.set({ authToken: v }), 400)
  container.querySelector<HTMLInputElement>('#auth-token-input')?.addEventListener('input', e => {
    saveToken((e.target as HTMLInputElement).value)
  })

  // Theme buttons
  container.querySelector('.theme-btn-group')?.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-value]')
    if (!btn) return
    const value = btn.dataset.themeValue as Theme
    store.set({ theme: value })
    applyTheme(value)
    // Update active state
    container?.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('theme-btn--active'))
    btn.classList.add('theme-btn--active')
  })

  // Server URL — save on change (debounced)
  const saveUrl = debounce((v: string) => store.set({ serverUrl: v }), 400)
  container.querySelector<HTMLInputElement>('#server-url-input')?.addEventListener('input', e => {
    saveUrl((e.target as HTMLInputElement).value)
  })
}

// ── Theme application ──────────────────────────────────────────────────────

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme === 'system' ? getSystemTheme() : theme
}

// ── Public API ─────────────────────────────────────────────────────────────

export const settingsPanel = {
  open(): void {
    store.set({ settingsOpen: true })
    mount()
  },
  close(): void {
    unmount()
  },
}
