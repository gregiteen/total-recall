/**
 * OpenWiki — Knowledge Graph & Multi-Repo Documentation Wiki
 * Bespoke Card Face: Deep Slate & Knowledge Amber Interface.
 *
 * Exposes live hub discovery, markdown file inspection, upstream release surveillance,
 * and structured fleet propagation controls. Operates without mock data or boilerplate sinks.
 */

export class OpenWikiCard extends HTMLElement {
  static get screens() {
    return [
      { id: 'hubs', label: 'Hubs' },
      { id: 'config', label: 'Configuration' },
      { id: 'refresh', label: 'Fleet Refresh' },
      { id: 'upstream', label: 'Upstream Watcher' }
    ];
  }

  get screens() {
    return OpenWikiCard.screens;
  }

  constructor() {
    super();
    this.activeScreen = 'hubs';
    this.hubs = [];
    this.loading = false;
    this.statusText = 'READY';
    this.targetPath = 'openwiki';
    this.dryRun = false;
    this.executionResult = null;
    this.errorMessage = null;
    this.lastRefreshedAt = null;
    this.upstream = null;
    this.config = {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4.1-flash',
      fallback_model: 'qwen/qwen-2.5-coder-32b-instruct',
      max_tokens: 4096,
      timeout_ms: 300000
    };
    this.refreshReports = [];
    this.refreshCounts = null;
    this._boundOnScreenChange = this.handleExternalScreenChange.bind(this);
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.addEventListener('tr:screen-change', this._boundOnScreenChange);
    this.addEventListener('plugin-show-screen', this._boundOnScreenChange);
    this.render();
    this.refreshHubs();
    this.loadConfig();
  }

  disconnectedCallback() {
    this.removeEventListener('tr:screen-change', this._boundOnScreenChange);
    this.removeEventListener('plugin-show-screen', this._boundOnScreenChange);
  }

  handleExternalScreenChange(event) {
    const screenId = event.detail?.screen || event.detail?.screenId || event.detail?.id;
    if (screenId && OpenWikiCard.screens.some((s) => s.id === screenId)) {
      this.setScreen(screenId);
    }
  }

  setScreen(id) {
    if (this.activeScreen === id) return;
    this.activeScreen = id;
    this.errorMessage = null;
    this.render();
    if (typeof this.host?.screenChanged === 'function') {
      try {
        this.host.screenChanged({ screen: id });
      } catch {
        // Host screenChanged callback optional
      }
    }
    if (id === 'refresh' && (!this.refreshReports || this.refreshReports.length === 0)) {
      this.loadRefreshReport();
    } else if (id === 'config') {
      this.loadConfig();
    }
  }

  async loadConfig() {
    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('config', ['show', '--json']);
        if (res?.config) {
          this.config = res.config;
          this.render();
        }
      }
    } catch {
      // Retain active config defaults if host call fails
    }
  }

  async setConfigValue(key, value) {
    this.loading = true;
    this.errorMessage = null;
    this.render();
    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('config', ['set', key, String(value), '--json']);
        if (res?.config) {
          this.config = res.config;
        }
      }
    } catch (err) {
      this.errorMessage = err.message || `Failed to update ${key}`;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async resetConfig() {
    this.loading = true;
    this.errorMessage = null;
    this.render();
    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('config', ['reset', '--json']);
        if (res?.config) {
          this.config = res.config;
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Failed to reset configuration';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async refreshHubs() {
    this.loading = true;
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('hubs', ['--json']);
        if (res && Array.isArray(res.hubs)) {
          this.hubs = res.hubs;
          this.statusText = 'SYNCHRONIZED';
        } else {
          this.hubs = [];
          this.statusText = 'UNINDEXED';
        }

        try {
          const statusRes = await this.host.run('status', ['--json']);
          if (statusRes?.upstream) {
            this.upstream = statusRes.upstream;
          }
        } catch {
          // Upstream metadata optional
        }
      } else {
        this.statusText = 'DISCONNECTED';
      }
      this.lastRefreshedAt = new Date().toLocaleTimeString();
    } catch (err) {
      this.statusText = 'ERROR';
      this.errorMessage = err.message || 'Hub synchronization failure';
      this.hubs = [];
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async loadRefreshReport() {
    this.loading = true;
    this.errorMessage = null;
    this.render();
    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('refresh', ['--json']);
        if (res) {
          this.refreshReports = Array.isArray(res.reports) ? res.reports : [];
          this.refreshCounts = res.counts || null;
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Fleet status check failure';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async executeFleetRefresh() {
    if (this.loading) return;
    this.loading = true;
    this.executionResult = null;
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('refresh', ['--apply', '--json']);
        this.executionResult = {
          action: 'fleet-refresh',
          target: 'all-registered-projects',
          details: res && typeof res === 'object' ? res : { message: String(res || 'Completed') },
          timestamp: new Date().toLocaleTimeString()
        };
        if (res?.reports) {
          this.refreshReports = res.reports;
          this.refreshCounts = res.counts;
        }
      } else {
        throw new Error('Host execution context unavailable');
      }
    } catch (err) {
      this.errorMessage = err.message || 'Fleet refresh execution failure';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async executeIngest() {
    if (this.loading) return;
    this.loading = true;
    this.executionResult = null;
    this.errorMessage = null;
    this.render();

    const args = [this.targetPath || 'openwiki'];
    if (this.dryRun) args.push('--dry-run');

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('ingest', args);
        this.executionResult = {
          action: 'ingest',
          target: this.targetPath,
          dryRun: this.dryRun,
          details: res && typeof res === 'object' ? res : { message: String(res || 'Completed') },
          timestamp: new Date().toLocaleTimeString()
        };
      } else {
        throw new Error('Host execution context unavailable');
      }
    } catch (err) {
      this.errorMessage = err.message || 'Ingestion cycle failure';
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  async executeBootstrap() {
    if (this.loading) return;
    this.loading = true;
    this.executionResult = null;
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('bootstrap', ['--brain', '.', '--json']);
        this.executionResult = {
          action: 'bootstrap',
          details: res && typeof res === 'object' ? res : { message: String(res || 'Completed') },
          timestamp: new Date().toLocaleTimeString()
        };
      } else {
        throw new Error('Host execution context unavailable');
      }
    } catch (err) {
      this.errorMessage = err.message || 'Bootstrap procedure failure';
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  async executeWatch() {
    if (this.loading) return;
    this.loading = true;
    this.executionResult = null;
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('watch', ['--json']);
        this.executionResult = {
          action: 'watch',
          details: res && typeof res === 'object' ? res : { message: String(res || 'Completed') },
          timestamp: new Date().toLocaleTimeString()
        };
        if (res?.status) {
          this.upstream = {
            recordedVersion: res.status.currentVersion,
            latestVersion: res.status.latestVersion
          };
        }
      } else {
        throw new Error('Host execution context unavailable');
      }
    } catch (err) {
      this.errorMessage = err.message || 'Upstream surveillance failure';
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  async executePropagate() {
    if (this.loading) return;
    this.loading = true;
    this.executionResult = null;
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('propagate', ['--json']);
        this.executionResult = {
          action: 'propagate',
          details: res && typeof res === 'object' ? res : { message: String(res || 'Completed') },
          timestamp: new Date().toLocaleTimeString()
        };
      } else {
        throw new Error('Host execution context unavailable');
      }
    } catch (err) {
      this.errorMessage = err.message || 'Fleet propagation failure';
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  render() {
    if (!this.shadowRoot) return;

    const countText = this.hubs.length ? `${this.hubs.length} Hubs` : '—';
    const totalLines = this.hubs.reduce((acc, h) => acc + (h.lines || 0), 0);
    const linesText = this.hubs.length ? `${totalLines.toLocaleString()} Lines` : '—';
    const upstreamText = this.upstream?.latestVersion ? `v${this.upstream.latestVersion}` : 'Tracking';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          --face-bg: #0f172a;
          --face-surface: #1e293b;
          --face-surface-subtle: #334155;
          --face-border: #475569;
          --face-text: #f8fafc;
          --face-text-muted: #94a3b8;
          --face-accent: #f59e0b;
          --face-accent-hover: #d97706;
          --face-ok: #10b981;
          --face-danger: #ef4444;
          background: var(--face-bg);
          color: var(--text-primary, var(--face-text));
          border: 1px solid var(--border, var(--face-border));
          border-radius: 8px;
          padding: 16px;
          font-family: system-ui, -apple-system, sans-serif;
        }

        *, *::before, *::after {
          box-sizing: inherit;
        }

        .header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid var(--border, var(--face-border));
          padding-bottom: 12px;
        }

        .brand-cluster {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .wordmark-badge {
          display: inline-flex;
          align-items: center;
          font-family: ui-monospace, monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: var(--face-accent);
          background: var(--face-surface-subtle);
          padding: 4px 8px;
          border-radius: 4px;
        }

        .system-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, var(--face-text));
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          background: var(--face-surface-subtle);
          color: var(--face-text-muted);
          border: 1px solid var(--border, var(--face-border));
        }

        .status-pill.ok {
          color: var(--face-ok);
          border-color: var(--face-ok);
        }

        .status-pill.danger {
          color: var(--face-danger);
          border-color: var(--face-danger);
        }

        .screen-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--border, var(--face-border));
          padding-bottom: 8px;
          overflow-x: auto;
        }

        .screen-tab-btn {
          min-height: 36px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--face-text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }

        .screen-tab-btn:hover {
          color: var(--face-text);
          background: var(--face-surface-subtle);
        }

        .screen-tab-btn.active {
          color: var(--face-accent);
          background: var(--face-surface);
          border-color: var(--face-accent);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }

        .stat-card {
          background: var(--face-surface);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 10px;
        }

        .stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--face-text-muted);
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
          font-family: ui-monospace, monospace;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .section-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--face-accent);
        }

        .hub-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
          max-height: 180px;
          overflow-y: auto;
        }

        .hub-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--face-surface);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 13px;
        }

        .hub-title {
          font-weight: 600;
          color: var(--text-primary, var(--face-text));
        }

        .hub-meta {
          font-family: ui-monospace, monospace;
          font-size: 11px;
          color: var(--face-text-muted);
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          color: var(--face-text-muted);
          background: var(--face-surface);
          border: 1px dashed var(--border, var(--face-border));
          border-radius: 6px;
          font-size: 13px;
        }

        .ingest-deck {
          background: var(--face-surface);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .config-deck {
          background: var(--face-surface);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 14px;
          margin-bottom: 16px;
        }

        .config-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 14px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-group.full-width {
          grid-column: 1 / -1;
        }

        .field-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--face-text-muted);
        }

        .input-group {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .path-input, .text-input, .select-input {
          min-height: 44px;
          background: var(--face-surface-subtle);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 8px 12px;
          color: var(--text-primary, var(--face-text));
          font-family: ui-monospace, monospace;
          font-size: 13px;
          width: 100%;
        }

        .path-input:focus, .text-input:focus, .select-input:focus {
          outline: none;
          border-color: var(--face-accent);
        }

        .presets-bar {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .preset-chip {
          min-height: 32px;
          padding: 4px 10px;
          background: var(--face-surface-subtle);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 16px;
          font-size: 11px;
          font-family: ui-monospace, monospace;
          color: var(--face-text);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .preset-chip:hover {
          border-color: var(--face-accent);
          color: var(--face-accent);
        }

        .auth-notice-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #022c22;
          border: 1px solid var(--face-ok);
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 14px;
          font-size: 12px;
          color: #a7f3d0;
        }

        .toggle-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          font-size: 13px;
          color: var(--text-primary, var(--face-text));
          cursor: pointer;
          user-select: none;
          padding: 0 4px;
        }

        .button-group {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease;
          text-align: center;
        }

        .btn-primary {
          background: var(--face-accent);
          color: var(--face-bg);
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--face-accent-hover);
        }

        .btn-secondary {
          background: var(--face-surface-subtle);
          border-color: var(--border, var(--face-border));
          color: var(--text-primary, var(--face-text));
        }

        .btn-secondary:hover:not(:disabled) {
          border-color: var(--face-accent);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .result-deck {
          background: var(--face-surface-subtle);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 12px;
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: var(--text-primary, var(--face-text));
          margin-top: 12px;
        }

        .result-title {
          font-weight: 600;
          color: var(--face-accent);
          margin-bottom: 6px;
        }

        .error-deck {
          background: var(--face-surface);
          border: 1px solid var(--face-danger);
          border-radius: 6px;
          padding: 12px;
          color: var(--face-danger);
          font-size: 12px;
          margin-bottom: 12px;
        }

        .repo-status-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .repo-status-badge.current {
          background: #064e3b;
          color: #6ee7b7;
        }

        .repo-status-badge.due {
          background: #78350f;
          color: #fde68a;
        }

        .repo-status-badge.uninit {
          background: #831843;
          color: #fbcfe8;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      </style>

      <div class="header-bar">
        <div class="brand-cluster">
          <span class="wordmark-badge">[BRAIN//DUMP]</span>
          <span class="system-title">Knowledge Graph Engine</span>
        </div>
        <span class="status-pill ${this.statusText === 'SYNCHRONIZED' ? 'ok' : this.statusText === 'ERROR' ? 'danger' : ''}">
          ${this.statusText}
        </span>
      </div>

      <nav class="screen-tabs" aria-label="OpenWiki navigation screens">
        ${OpenWikiCard.screens.map((screen) => `
          <button
            class="screen-tab-btn ${this.activeScreen === screen.id ? 'active' : ''}"
            data-screen="${screen.id}"
          >
            ${screen.label}
          </button>
        `).join('')}
      </nav>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Discovered Hubs</div>
          <div class="stat-value">${countText}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Documentation Lines</div>
          <div class="stat-value">${linesText}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Model Routing</div>
          <div class="stat-value" style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.config.model}">
            ${this.config.model.split('/').pop() || this.config.model}
          </div>
        </div>
      </div>

      ${this.errorMessage ? `
        <div class="error-deck">
          ${this.errorMessage}
        </div>
      ` : ''}

      ${this.renderActiveScreen()}

      ${this.executionResult ? `
        <div class="result-deck">
          <div class="result-title">Execution Receipt (${this.executionResult.timestamp})</div>
          <div>Action: ${this.executionResult.action}</div>
          <div>Target: ${this.executionResult.target || 'project'}</div>
          <div>Result: ${JSON.stringify(this.executionResult.details)}</div>
        </div>
      ` : ''}
    `;

    this.bindEvents();
  }

  renderActiveScreen() {
    if (this.activeScreen === 'config') {
      return this.renderConfigScreen();
    }
    if (this.activeScreen === 'refresh') {
      return this.renderRefreshScreen();
    }
    if (this.activeScreen === 'upstream') {
      return this.renderUpstreamScreen();
    }
    return this.renderHubsScreen();
  }

  renderHubsScreen() {
    return `
      <div class="section-header">
        <span class="section-title">Knowledge Hubs</span>
        <button id="btn-refresh" class="btn btn-secondary" style="min-height: 32px; padding: 0 10px; font-size: 11px;" ${this.loading ? 'disabled' : ''}>
          Sync
        </button>
      </div>

      <div class="hub-list">
        ${this.hubs.length === 0 ? `
          <div class="empty-state">No documentation hubs indexed in ${this.targetPath}</div>
        ` : this.hubs.map((h) => `
          <div class="hub-item">
            <span class="hub-title">${h.title}</span>
            <span class="hub-meta">${h.lines} lines · ${h.path}</span>
          </div>
        `).join('')}
      </div>

      <div class="ingest-deck">
        <div class="input-group">
          <input
            id="target-path-input"
            class="path-input"
            type="text"
            value="${this.targetPath}"
            placeholder="Directory path (openwiki)"
            aria-label="Target documentation path"
          />
          <label class="toggle-label">
            <input
              id="dry-run-checkbox"
              type="checkbox"
              ${this.dryRun ? 'checked' : ''}
            />
            Dry Run
          </label>
        </div>

        <div class="button-group">
          <button id="btn-ingest" class="btn btn-primary" ${this.loading ? 'disabled' : ''}>
            ${this.loading ? 'Processing…' : 'Ingest Documentation'}
          </button>
          <button id="btn-bootstrap" class="btn btn-secondary" ${this.loading ? 'disabled' : ''}>
            Bootstrap Wiki
          </button>
        </div>
      </div>
    `;
  }

  renderConfigScreen() {
    return `
      <div class="config-deck">
        <div class="section-header">
          <span class="section-title">Documentation Model & Provider Routing</span>
        </div>

        <div class="auth-notice-card">
          <span>✓ Model credentials routed via Total Recall Auth store (<code>total-recall auth secret</code>)</span>
          <span style="font-family: ui-monospace, monospace; font-size: 10px;">AUTH_PLUGIN: ACTIVE</span>
        </div>

        <div class="field-label" style="margin-bottom: 6px;">Recommended Model Presets:</div>
        <div class="presets-bar">
          <button class="preset-chip" data-provider="openrouter" data-model="deepseek/deepseek-v4.1-flash" data-fallback="qwen/qwen-2.5-coder-32b-instruct">
            DeepSeek V4.1 Flash ($0.025/1M)
          </button>
          <button class="preset-chip" data-provider="openrouter" data-model="qwen/qwen-2.5-coder-32b-instruct" data-fallback="deepseek/deepseek-v4.1-flash">
            Qwen 2.5 Coder 32B ($0.06/1M)
          </button>
          <button class="preset-chip" data-provider="google" data-model="gemini-2.5-flash-lite" data-fallback="gemini-2.5-flash">
            Gemini 2.5 Flash-Lite ($0.075/1M)
          </button>
        </div>

        <div class="config-grid">
          <div class="field-group">
            <label class="field-label" for="cfg-provider">Provider</label>
            <select id="cfg-provider" class="select-input">
              <option value="openrouter" ${this.config.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (Multi-Model Hub)</option>
              <option value="google" ${this.config.provider === 'google' ? 'selected' : ''}>Google (Gemini Direct)</option>
              <option value="custom" ${this.config.provider === 'custom' ? 'selected' : ''}>Custom Provider</option>
            </select>
          </div>

          <div class="field-group">
            <label class="field-label" for="cfg-model">Primary Model Identifier</label>
            <input id="cfg-model" class="text-input" type="text" value="${this.config.model}" placeholder="e.g. deepseek/deepseek-v4.1-flash" />
          </div>

          <div class="field-group">
            <label class="field-label" for="cfg-fallback">Fallback Model Identifier</label>
            <input id="cfg-fallback" class="text-input" type="text" value="${this.config.fallback_model}" placeholder="e.g. qwen/qwen-2.5-coder-32b-instruct" />
          </div>

          <div class="field-group">
            <label class="field-label" for="cfg-tokens">Max Output Tokens</label>
            <input id="cfg-tokens" class="text-input" type="number" value="${this.config.max_tokens}" min="512" max="131072" />
          </div>

          <div class="field-group full-width">
            <label class="field-label" for="cfg-timeout">Timeout (milliseconds)</label>
            <input id="cfg-timeout" class="text-input" type="number" value="${this.config.timeout_ms}" min="30000" max="1800000" />
          </div>
        </div>

        <div class="button-group">
          <button id="btn-save-config" class="btn btn-primary" ${this.loading ? 'disabled' : ''}>
            Save Configuration
          </button>
          <button id="btn-reset-config" class="btn btn-secondary" ${this.loading ? 'disabled' : ''}>
            Reset to Defaults
          </button>
        </div>
      </div>
    `;
  }

  renderRefreshScreen() {
    const dueCount = this.refreshCounts?.due ?? this.refreshReports.filter((r) => r.action === 'due').length;
    const uninitCount = this.refreshCounts?.uninitialized ?? this.refreshReports.filter((r) => r.uninitialized).length;

    return `
      <div class="ingest-deck">
        <div class="section-header">
          <span class="section-title">Fleet Documentation Governance</span>
          <button id="btn-sync-refresh" class="btn btn-secondary" style="min-height: 32px; padding: 0 10px; font-size: 11px;" ${this.loading ? 'disabled' : ''}>
            Check Fleet
          </button>
        </div>

        <div style="font-size: 12px; color: var(--face-text-muted); margin-bottom: 12px;">
          Registered Projects: <strong>${this.refreshReports.length}</strong> · Due for Update: <strong>${dueCount}</strong> · Uninitialized: <strong>${uninitCount}</strong>
        </div>

        <div class="hub-list" style="max-height: 240px;">
          ${this.refreshReports.length === 0 ? `
            <div class="empty-state">No fleet report loaded. Click Check Fleet to inspect registered repositories.</div>
          ` : this.refreshReports.map((r) => {
            let badgeClass = 'current';
            let badgeText = 'CURRENT';
            if (r.uninitialized) {
              badgeClass = 'uninit';
              badgeText = 'MISSING WIKI';
            } else if (r.action === 'due') {
              badgeClass = 'due';
              badgeText = 'DUE';
            }
            return `
              <div class="hub-item">
                <div>
                  <span class="hub-title">${r.name}</span>
                  <div class="hub-meta">${r.generatedAt ? `Generated ${r.generatedAt.slice(0, 10)}` : 'Never generated'} · ${r.commitsSince ? `${r.commitsSince} commits behind` : 'Up to date'}</div>
                </div>
                <span class="repo-status-badge ${badgeClass}">${badgeText}</span>
              </div>
            `;
          }).join('')}
        </div>

        <div style="margin-top: 12px;">
          <button id="btn-fleet-refresh-apply" class="btn btn-primary" style="width: 100%;" ${this.loading ? 'disabled' : ''}>
            ${this.loading ? 'Executing Fleet Refresh…' : `Regenerate Stale & Initialize Missing Wikis (${dueCount} due)`}
          </button>
        </div>
      </div>
    `;
  }

  renderUpstreamScreen() {
    const currentVer = this.upstream?.recordedVersion || '0.7.2';
    const latestVer = this.upstream?.latestVersion || '0.7.3';

    return `
      <div class="ingest-deck">
        <div class="section-header">
          <span class="section-title">Upstream Package Surveillance</span>
        </div>

        <div class="stats-grid" style="margin-bottom: 14px;">
          <div class="stat-card">
            <div class="stat-label">Recorded Version</div>
            <div class="stat-value">v${currentVer}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Latest Registry</div>
            <div class="stat-value">v${latestVer}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Watcher Status</div>
            <div class="stat-value" style="color: var(--face-ok);">MONITORING</div>
          </div>
        </div>

        <div class="button-group">
          <button id="btn-watch" class="btn btn-secondary" ${this.loading ? 'disabled' : ''}>
            Check Upstream Registry
          </button>
          <button id="btn-propagate" class="btn btn-primary" ${this.loading ? 'disabled' : ''}>
            Propagate Latest Generator
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    shadow.querySelectorAll('.screen-tab-btn').forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetScreen = tab.getAttribute('data-screen');
        if (targetScreen) this.setScreen(targetScreen);
      });
    });

    const pathInput = shadow.querySelector('#target-path-input');
    if (pathInput) {
      pathInput.addEventListener('input', (e) => {
        this.targetPath = e.target.value.trim();
      });
    }

    const dryRunCheckbox = shadow.querySelector('#dry-run-checkbox');
    if (dryRunCheckbox) {
      dryRunCheckbox.addEventListener('change', (e) => {
        this.dryRun = e.target.checked;
      });
    }

    const btnIngest = shadow.querySelector('#btn-ingest');
    if (btnIngest) {
      btnIngest.addEventListener('click', () => this.executeIngest());
    }

    const btnBootstrap = shadow.querySelector('#btn-bootstrap');
    if (btnBootstrap) {
      btnBootstrap.addEventListener('click', () => this.executeBootstrap());
    }

    const btnRefresh = shadow.querySelector('#btn-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.refreshHubs());
    }

    const btnSyncRefresh = shadow.querySelector('#btn-sync-refresh');
    if (btnSyncRefresh) {
      btnSyncRefresh.addEventListener('click', () => this.loadRefreshReport());
    }

    const btnFleetApply = shadow.querySelector('#btn-fleet-refresh-apply');
    if (btnFleetApply) {
      btnFleetApply.addEventListener('click', () => this.executeFleetRefresh());
    }

    const btnWatch = shadow.querySelector('#btn-watch');
    if (btnWatch) {
      btnWatch.addEventListener('click', () => this.executeWatch());
    }

    const btnPropagate = shadow.querySelector('#btn-propagate');
    if (btnPropagate) {
      btnPropagate.addEventListener('click', () => this.executePropagate());
    }

    shadow.querySelectorAll('.preset-chip').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const p = chip.getAttribute('data-provider');
        const m = chip.getAttribute('data-model');
        const f = chip.getAttribute('data-fallback');
        if (p) await this.setConfigValue('provider', p);
        if (m) await this.setConfigValue('model', m);
        if (f) await this.setConfigValue('fallback_model', f);
      });
    });

    const btnSaveConfig = shadow.querySelector('#btn-save-config');
    if (btnSaveConfig) {
      btnSaveConfig.addEventListener('click', async () => {
        const provider = shadow.querySelector('#cfg-provider')?.value;
        const model = shadow.querySelector('#cfg-model')?.value;
        const fallback = shadow.querySelector('#cfg-fallback')?.value;
        const tokens = shadow.querySelector('#cfg-tokens')?.value;
        const timeout = shadow.querySelector('#cfg-timeout')?.value;

        if (provider) await this.setConfigValue('provider', provider);
        if (model) await this.setConfigValue('model', model);
        if (fallback) await this.setConfigValue('fallback_model', fallback);
        if (tokens) await this.setConfigValue('max_tokens', tokens);
        if (timeout) await this.setConfigValue('timeout_ms', timeout);
      });
    }

    const btnResetConfig = shadow.querySelector('#btn-reset-config');
    if (btnResetConfig) {
      btnResetConfig.addEventListener('click', () => this.resetConfig());
    }
  }
}

if (!customElements.get('tr-openwiki-card')) {
  customElements.define('tr-openwiki-card', OpenWikiCard);
}
if (!customElements.get('openwiki-card')) {
  customElements.define('openwiki-card', class extends OpenWikiCard {});
}
