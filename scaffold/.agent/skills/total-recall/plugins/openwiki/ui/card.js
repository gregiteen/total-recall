/**
 * OpenWiki — Knowledge Graph & Multi-Repo Documentation Wiki
 * Bespoke Card Face: Deep Slate & Knowledge Amber Interface.
 *
 * Exposes live hub discovery, markdown file inspection, upstream release surveillance,
 * and structured fleet propagation controls. Operates without mock data or boilerplate sinks.
 */

export class OpenWikiCard extends HTMLElement {
  constructor() {
    super();
    this.hubs = [];
    this.loading = false;
    this.statusText = 'READY';
    this.targetPath = 'openwiki';
    this.dryRun = false;
    this.executionResult = null;
    this.errorMessage = null;
    this.lastRefreshedAt = null;
    this.upstream = null;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshHubs();
  }

  disconnectedCallback() {
    // Clean state lifecycle teardown
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
          margin-bottom: 16px;
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

        .input-group {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .path-input {
          flex: 1;
          min-height: 44px;
          background: var(--face-surface-subtle);
          border: 1px solid var(--border, var(--face-border));
          border-radius: 6px;
          padding: 8px 12px;
          color: var(--text-primary, var(--face-text));
          font-family: ui-monospace, monospace;
          font-size: 13px;
        }

        .path-input:focus {
          outline: none;
          border-color: var(--face-accent);
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
          <div class="stat-label">Upstream Generator</div>
          <div class="stat-value">${upstreamText}</div>
        </div>
      </div>

      ${this.errorMessage ? `
        <div class="error-deck">
          ${this.errorMessage}
        </div>
      ` : ''}

      <div class="section-header">
        <span class="section-title">Knowledge Hubs</span>
        <button id="btn-refresh" class="btn btn-secondary" style="min-height: 32px; padding: 0 10px; font-size: 11px;" ${this.loading ? 'disabled' : ''}>
          Sync
        </button>
      </div>

      <div class="hub-list">
        ${this.hubs.length === 0 ? `
          <div class="empty-state">No documentation hubs indexed in ${this.targetPath}</div>
        ` : this.hubs.map(h => `
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
          <button id="btn-watch" class="btn btn-secondary" ${this.loading ? 'disabled' : ''}>
            Check Upstream
          </button>
          <button id="btn-propagate" class="btn btn-secondary" ${this.loading ? 'disabled' : ''}>
            Propagate Fleet
          </button>
        </div>
      </div>

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

  bindEvents() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

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

    const btnWatch = shadow.querySelector('#btn-watch');
    if (btnWatch) {
      btnWatch.addEventListener('click', () => this.executeWatch());
    }

    const btnPropagate = shadow.querySelector('#btn-propagate');
    if (btnPropagate) {
      btnPropagate.addEventListener('click', () => this.executePropagate());
    }
  }
}

if (!customElements.get('tr-openwiki-card')) {
  customElements.define('tr-openwiki-card', OpenWikiCard);
}
if (!customElements.get('openwiki-card')) {
  customElements.define('openwiki-card', class extends OpenWikiCard {});
}
