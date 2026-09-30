/**
 * `dsh-status` — DSH runtime status panel.
 * Self-contained custom element showing PID, port, memory, uptime,
 * plugin count, and a live health indicator. Auto-refreshes every 30s.
 *
 * @element dsh-status
 * @prop {number} pid - Current DSH process PID
 * @prop {number} port - API port
 * @prop {string} memory - Memory usage string
 * @prop {string} uptime - Uptime string
 * @prop {number} plugins - Plugin count
 * @prop {boolean} loading - Show loading state
 * @fires status-refresh - Dispatched when data refreshes
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--typography-body-size, 14px);
      color: var(--color-text, #1a1a1a);
      background: var(--color-surface, #ffffff);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-md, 8px);
      padding: var(--spacing-lg, 16px);
      max-width: 400px;
    }
    :host(.dark) {
      color: var(--color-text, #e0e0e0);
      background: var(--color-surface, #1e1e1e);
      border-color: var(--color-border, #333);
    }
    .header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm, 8px);
      margin-bottom: var(--spacing-md, 12px);
    }
    .indicator {
      width: 12px;
      height: 12px;
      border-radius: var(--radius-full, 50%);
      flex-shrink: 0;
    }
    .indicator.online {
      background: var(--color-success, #22c55e);
      box-shadow: 0 0 6px var(--color-success, #22c55e);
    }
    .indicator.offline {
      background: var(--color-error, #ef4444);
      box-shadow: 0 0 6px var(--color-error, #ef4444);
    }
    .indicator.loading {
      background: var(--color-warning, #f59e0b);
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .title {
      font-size: var(--typography-h4-size, 16px);
      font-weight: 600;
      margin: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-sm, 8px);
    }
    .field {
      padding: var(--spacing-xs, 4px) 0;
    }
    .label {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .value {
      font-size: var(--typography-body-size, 14px);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .footer {
      margin-top: var(--spacing-md, 12px);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .refresh-btn {
      background: var(--color-surface-secondary, #f5f5f5);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-sm, 4px);
      padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
      cursor: pointer;
      font-family: inherit;
    }
    .refresh-btn:hover {
      background: var(--color-surface-hover, #eee);
    }
    .timestamp {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-tertiary, #999);
    }
    .error {
      color: var(--color-error, #ef4444);
      font-size: var(--typography-body-size, 14px);
      padding: var(--spacing-md, 12px);
      text-align: center;
    }
    .loading-text {
      color: var(--color-text-secondary, #666);
      font-size: var(--typography-body-size, 14px);
      padding: var(--spacing-md, 12px);
      text-align: center;
    }
  </style>
  <div class="header">
    <span class="indicator loading" id="indicator"></span>
    <h3 class="title">DeepSeek Harness</h3>
  </div>
  <div id="body">
    <div class="loading-text">Loading DSH status...</div>
  </div>
  <div class="footer">
    <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
    <span class="timestamp" id="timestamp"></span>
  </div>
`;

export class DshStatus extends HTMLElement {
  static observedAttributes = ['pid', 'port', 'memory', 'uptime', 'plugins', 'loading'];

  constructor() {
    super();
    this._data = { pid: null, port: null, memory: null, uptime: null, plugins: null, online: false };
    this._loading = true;
    this._error = null;
    this._interval = null;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._buildGrid();
  }

  connectedCallback() {
    this.shadowRoot.getElementById('refreshBtn').addEventListener('click', () => this._fetchStatus());
    this._fetchStatus();
    this._interval = setInterval(() => this._fetchStatus(), 30000);
  }

  disconnectedCallback() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'loading') {
      this._loading = newVal !== null && newVal !== 'false';
    } else if (name === 'pid' || name === 'port' || name === 'memory' || name === 'uptime' || name === 'plugins') {
      this._data[name] = newVal;
      if (name === 'pid' && newVal) this._data.online = true;
    }
    this._render();
  }

  async _fetchStatus() {
    this._loading = true;
    this._error = null;
    this._render();
    try {
      const res = await fetch('http://127.0.0.1:54866/', { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      this._data.online = res.ok || res.status === 200 || res.status === 302;
      this._data.port = 54866;
    } catch {
      this._data.online = false;
      try {
        const res = await fetch('http://127.0.0.1:53626/', { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        this._data.online = true;
        this._data.port = 53626;
      } catch {
        this._data.online = false;
      }
    }
    if (this._data.online) {
      try {
        const res = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const health = await res.json();
          this._data.trVersion = health.version || 'unknown';
          this._data.trDaemon = health.daemon || 'unknown';
        }
      } catch {}
    }
    this._loading = false;
    if (!this._data.online) {
      this._error = 'DSH is not running';
    }
    this._render();
    this.dispatchEvent(new CustomEvent('status-refresh', { detail: { ...this._data } }));
  }

  _buildGrid() {
    const body = this.shadowRoot.getElementById('body');
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.id = 'grid';
    const fields = [
      { key: 'pid', label: 'PID' },
      { key: 'port', label: 'Port' },
      { key: 'memory', label: 'Memory' },
      { key: 'uptime', label: 'Uptime' },
      { key: 'plugins', label: 'Plugins' },
      { key: 'trDaemon', label: 'TR Daemon' },
    ];
    for (const f of fields) {
      const div = document.createElement('div');
      div.className = 'field';
      div.innerHTML = `<div class="label">${f.label}</div><div class="value" id="val-${f.key}">--</div>`;
      grid.appendChild(div);
    }
    body.innerHTML = '';
    body.appendChild(grid);
  }

  _render() {
    const indicator = this.shadowRoot.getElementById('indicator');
    const body = this.shadowRoot.getElementById('body');
    const ts = this.shadowRoot.getElementById('timestamp');

    if (this._error) {
      indicator.className = 'indicator offline';
      body.innerHTML = `<div class="error">⚠ ${this._error}</div>`;
      ts.textContent = new Date().toLocaleTimeString();
      return;
    }

    if (this._loading) {
      indicator.className = 'indicator loading';
    } else {
      indicator.className = this._data.online ? 'indicator online' : 'indicator offline';
    }

    const fields = ['pid', 'port', 'memory', 'uptime', 'plugins', 'trDaemon'];
    for (const key of fields) {
      const el = this.shadowRoot.getElementById(`val-${key}`);
      if (!el) continue;
      const val = this._data[key];
      el.textContent = val !== null && val !== undefined ? String(val) : '--';
    }

    ts.textContent = new Date().toLocaleTimeString();
  }
}

customElements.define('dsh-status', DshStatus);

export default DshStatus;