/**
 * Brain Dump — Multi-Repo Knowledge Graph & Documentation Console
 *
 * Bespoke operator interface for cross-repository documentation and knowledge graphs.
 * Displays real-time hub trees, file metrics, structured ingestion controllers,
 * and bootstrap verification without template wrappers or terminal dumps.
 */

const DASH = '\u2014';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

export class OpenWikiCard extends HTMLElement {
  constructor() {
    super();
    this.hubs = [];
    this.totalLines = 0;
    this.executing = false;
    this.targetPath = 'openwiki';
    this.dryRun = true;
    this.lastResult = null;
    this.screens = [{ id: 'knowledge', label: 'Knowledge Hubs' }];
    this.screen = 'knowledge';
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshHubs();
  }

  async refreshHubs() {
    if (!this.host) return;
    try {
      const res = await this.host.run('status', ['--json']);
      let parsed = [];
      if (res && typeof res === 'object') {
        if (Array.isArray(res.hubs)) {
          parsed = res.hubs;
          this.totalLines = res.total_lines || 0;
        } else if (Array.isArray(res)) {
          parsed = res;
        }
      } else if (typeof res === 'string' && res.trim().startsWith('{')) {
        const json = JSON.parse(res);
        parsed = Array.isArray(json.hubs) ? json.hubs : [];
        this.totalLines = json.total_lines || 0;
      }

      this.hubs = parsed;
      this.render();
    } catch {
      this.hubs = [];
      this.render();
    }
  }

  async runIngest() {
    if (!this.host || this.executing) return;
    this.executing = true;
    this.lastResult = null;
    this.render();

    try {
      const args = [this.targetPath || 'openwiki'];
      if (this.dryRun) args.push('--dry-run');
      args.push('--json');

      const res = await this.host.run('ingest', args);
      this.lastResult = {
        ok: true,
        message: this.dryRun ? 'Dry-run preview completed' : 'Ingestion completed successfully',
        data: res
      };
      await this.refreshHubs();
    } catch (err) {
      this.lastResult = {
        ok: false,
        message: err instanceof Error ? err.message : 'Ingestion failed'
      };
    } finally {
      this.executing = false;
      this.render();
    }
  }

  async runBootstrap() {
    if (!this.host || this.executing) return;
    this.executing = true;
    this.lastResult = null;
    this.render();

    try {
      const res = await this.host.run('bootstrap', ['--json']);
      this.lastResult = {
        ok: true,
        message: 'OpenWiki skeleton bootstrapped',
        data: res
      };
      await this.refreshHubs();
    } catch (err) {
      this.lastResult = {
        ok: false,
        message: err instanceof Error ? err.message : 'Bootstrap failed'
      };
    } finally {
      this.executing = false;
      this.render();
    }
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    root.innerHTML = `
      <style>
        :host {
          --face-bg: #0f172a;
          --face-surface: #1e293b;
          --face-line: #334155;
          --face-text: #f8fafc;
          --face-muted: #94a3b8;
          --face-brand: #3b82f6;
          --face-brand-hover: #60a5fa;
          --face-accent: #facc15;
          --face-ok: #10b981;
          --face-warn: #f59e0b;
          --face-danger: #ef4444;
          --face-dark: #0f172a;

          display: block;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          color: var(--text-primary, var(--face-text));
          background: var(--bg-secondary, var(--face-bg));
          border: 1px solid var(--border, var(--face-line));
          border-radius: 8px;
          padding: 16px;
          box-sizing: border-box;
          overflow: hidden;
        }

        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        /* Header Bar */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border, var(--face-line));
          margin-bottom: 16px;
        }

        .brand-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .wordmark-badge {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--card-accent, var(--face-accent));
          background: rgba(250, 204, 21, 0.12);
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid rgba(250, 204, 21, 0.3);
        }

        .title-meta {
          display: flex;
          flex-direction: column;
        }

        .plugin-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
          margin: 0;
        }

        .plugin-subtitle {
          font-size: 11px;
          color: var(--text-secondary, var(--face-muted));
          margin: 0;
        }

        .hub-count-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          color: var(--face-accent);
          background: rgba(250, 204, 21, 0.12);
          border: 1px solid rgba(250, 204, 21, 0.3);
          padding: 5px 12px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        /* Split Layout */
        .workspace-split {
          display: grid;
          grid-template-columns: minmax(260px, 1.4fr) minmax(240px, 1fr);
          gap: 14px;
          margin-bottom: 16px;
        }

        @media (max-width: 700px) {
          .workspace-split {
            grid-template-columns: 1fr;
          }
        }

        /* Hub Tree Matrix */
        .hub-panel {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(30, 41, 59, 0.4);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .panel-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary, var(--face-muted));
          margin: 0;
        }

        .hub-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 280px;
          overflow-y: auto;
        }

        .hub-item {
          padding: 10px 12px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .hub-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .hub-title {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
        }

        .hub-path {
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }

        .hub-metrics {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 10px;
          color: var(--face-accent);
        }

        /* Ingest Deck Column */
        .ingest-deck {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .form-card {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(30, 41, 59, 0.4);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .input-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .input-label {
          font-size: 10px;
          text-transform: uppercase;
          color: var(--text-secondary, var(--face-muted));
          letter-spacing: 0.05em;
        }

        .text-input {
          min-height: 44px;
          padding: 8px 12px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          color: var(--text-primary, var(--face-text));
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          box-sizing: border-box;
          width: 100%;
        }

        .text-input:focus {
          outline: none;
          border-color: var(--card-accent, var(--face-brand));
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-secondary, var(--face-muted));
          cursor: pointer;
        }

        .toggle-check {
          min-height: 20px;
          min-width: 20px;
          cursor: pointer;
        }

        .btn-action-primary {
          min-height: 44px;
          padding: 8px 16px;
          font-family: var(--font-sans, sans-serif);
          font-size: 12px;
          font-weight: 700;
          color: var(--face-dark);
          background: var(--face-accent);
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-action-primary:hover {
          background: #fde047;
        }

        .btn-action-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-action-secondary {
          min-height: 44px;
          padding: 8px 16px;
          font-family: var(--font-sans, sans-serif);
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
          background: transparent;
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-action-secondary:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .feedback-banner {
          padding: 8px 12px;
          border-radius: 5px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
        }

        .feedback-ok {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          color: var(--face-ok);
        }

        .feedback-fail {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: var(--face-danger);
        }

        .empty-hubs {
          padding: 32px 16px;
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary, var(--face-muted));
        }

        /* Footer Telemetry */
        .footer-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          margin-top: 14px;
          border-top: 1px solid var(--border, var(--face-line));
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }
      </style>

      <div class="header">
        <div class="brand-group">
          <div class="wordmark-badge">[BRAIN//DUMP]</div>
          <div class="title-meta">
            <h3 class="plugin-title">OpenWiki Knowledge Graph</h3>
            <p class="plugin-subtitle">Multi-repository documentation and knowledge ingestion engine</p>
          </div>
        </div>
        <div class="hub-count-chip">
          ${this.hubs.length > 0 ? `${this.hubs.length} Hubs Indexed` : 'No Hubs'}
        </div>
      </div>

      <div class="workspace-split">
        <div class="hub-panel">
          <h4 class="panel-title">Verified Documentation Hubs</h4>
          <div class="hub-list">
            ${this.hubs.length > 0 ? this.hubs.map(h => `
              <div class="hub-item">
                <div class="hub-main">
                  <span class="hub-title">${escapeHtml(h.title || h.path)}</span>
                  <span class="hub-path">${escapeHtml(h.path)}</span>
                </div>
                <div class="hub-metrics">
                  <span>${h.lines !== undefined ? `${h.lines} lines` : DASH}</span>
                </div>
              </div>
            `).join('') : `
              <div class="empty-hubs">No markdown documentation hubs indexed yet. Click Bootstrap below to initialize.</div>
            `}
          </div>
        </div>

        <div class="ingest-deck">
          <div class="form-card">
            <h4 class="panel-title">Knowledge Ingest</h4>
            <div class="input-row">
              <span class="input-label">Target Hub Path</span>
              <input class="text-input" type="text" id="input-path" placeholder="openwiki" />
            </div>
            <label class="toggle-row">
              <input class="toggle-check" type="checkbox" id="check-dryrun" ${this.dryRun ? 'checked' : ''} />
              <span>Dry Run (Preview changes without writing)</span>
            </label>
            <button class="btn-action-primary" type="button" id="btn-ingest" ${this.executing ? 'disabled' : ''}>
              ${this.executing ? 'Processing...' : 'Run Ingestion'}
            </button>
            <button class="btn-action-secondary" type="button" id="btn-bootstrap" ${this.executing ? 'disabled' : ''}>
              Bootstrap OpenWiki Skeleton
            </button>
          </div>

          ${this.lastResult ? `
            <div class="feedback-banner ${this.lastResult.ok ? 'feedback-ok' : 'feedback-fail'}">
              ${escapeHtml(this.lastResult.message)}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="footer-bar">
        <span>Engine: OpenWiki v0.1.2</span>
        <span>Storage: Markdown + SSSS Projections</span>
      </div>
    `;

    // Event listeners
    const pathInput = root.querySelector('#input-path');
    if (pathInput) {
      pathInput.value = this.targetPath;
      pathInput.addEventListener('input', e => {
        this.targetPath = e.target.value;
      });
    }

    const dryRunCheck = root.querySelector('#check-dryrun');
    if (dryRunCheck) {
      dryRunCheck.addEventListener('change', e => {
        this.dryRun = e.target.checked;
      });
    }

    root.querySelector('#btn-ingest')?.addEventListener('click', () => this.runIngest());
    root.querySelector('#btn-bootstrap')?.addEventListener('click', () => this.runBootstrap());
  }
}

if (!customElements.get('tr-openwiki-card')) {
  customElements.define('tr-openwiki-card', OpenWikiCard);
}
if (!customElements.get('openwiki-card')) {
  customElements.define('openwiki-card', class extends OpenWikiCard {});
}
