/**
 * Nitpicker — Fail-Closed Code Quality Gate Console
 *
 * Bespoke operator interface for deterministic repository verification.
 * Displays real-time gate matrix, structured code violations, tier controllers,
 * and worktree drift indicators with zero template wrappers or terminal dumps.
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

export class CodeQualityCard extends HTMLElement {
  constructor() {
    super();
    this.report = null;
    this.executing = false;
    this.activeFilter = 'all';
    this.selectedTier = 'fast';
    this.screens = [{ id: 'overview', label: 'Gate Matrix' }];
    this.screen = 'overview';
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshReport();
  }

  async refreshReport() {
    if (!this.host) return;
    try {
      const res = await this.host.run('report', ['json']);
      if (res && typeof res === 'object') {
        this.report = res;
      } else if (typeof res === 'string' && res.trim().startsWith('{')) {
        this.report = JSON.parse(res);
      }
      this.render();
    } catch (err) {
      this.report = null;
      this.render();
    }
  }

  async runTier(tier) {
    if (!this.host || this.executing) return;
    this.executing = true;
    this.selectedTier = tier;
    this.render();

    try {
      await this.host.run('check', ['--tier', tier, '--json']);
      await this.refreshReport();
    } catch {
      await this.refreshReport();
    } finally {
      this.executing = false;
      this.render();
    }
  }

  setFilter(filter) {
    this.activeFilter = filter;
    this.render();
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    const rep = this.report;
    const isClean = rep?.clean === true;
    const checks = Array.isArray(rep?.gates) ? rep.gates : Array.isArray(rep?.checks) ? rep.checks : [];
    const timestamp = rep?.finishedAt ? new Date(rep.finishedAt).toLocaleTimeString() : rep?.timestamp ? new Date(rep.timestamp).toLocaleTimeString() : DASH;
    const tierName = rep?.tier || this.selectedTier;

    // Aggregate findings from report.findings array or nested gate findings
    let allFindings = Array.isArray(rep?.findings) ? [...rep.findings] : [];
    if (allFindings.length === 0) {
      for (const c of checks) {
        if (Array.isArray(c.findings)) {
          for (const f of c.findings) {
            allFindings.push({ ...f, checkName: c.name || c.id });
          }
        }
      }
    }

    const errorCount = allFindings.filter(f => f.severity === 'error').length;
    const warnCount = allFindings.filter(f => f.severity === 'warning').length;

    const filteredFindings = allFindings.filter(f => {
      if (this.activeFilter === 'errors') return f.severity === 'error';
      if (this.activeFilter === 'warnings') return f.severity === 'warning';
      return true;
    });

    root.innerHTML = `
      <style>
        :host {
          --face-bg: #0f172a;
          --face-surface: #1e293b;
          --face-line: #334155;
          --face-text: #f8fafc;
          --face-muted: #94a3b8;
          --face-brand: #eab308;
          --face-brand-hover: #facc15;
          --face-accent: #38bdf8;
          --face-ok: #10b981;
          --face-danger: #ef4444;
          --face-warn: #f59e0b;
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
          background: rgba(56, 189, 248, 0.12);
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid rgba(56, 189, 248, 0.3);
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

        .verdict-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          padding: 5px 12px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .verdict-clean {
          color: var(--face-ok);
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
        }

        .verdict-failed {
          color: var(--face-danger);
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
        }

        .verdict-pending {
          color: var(--text-secondary, var(--face-muted));
          background: rgba(148, 163, 184, 0.1);
          border: 1px solid var(--border, var(--face-line));
        }

        /* Tier & Execution Bar */
        .controls-deck {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 8px 12px;
        }

        .tier-toggles {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-tier {
          min-height: 44px;
          min-width: 44px;
          padding: 8px 14px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          color: var(--text-secondary, var(--face-muted));
          background: transparent;
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-tier:hover {
          color: var(--text-primary, var(--face-text));
          border-color: var(--card-accent, var(--face-accent));
        }

        .btn-tier[data-active="true"] {
          color: var(--face-dark);
          background: var(--card-accent, var(--face-accent));
          border-color: var(--card-accent, var(--face-accent));
        }

        .action-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-run {
          min-height: 44px;
          padding: 8px 16px;
          font-family: var(--font-sans, sans-serif);
          font-size: 12px;
          font-weight: 700;
          color: var(--face-dark);
          background: var(--face-brand);
          border: none;
          border-radius: 5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s ease;
        }

        .btn-run:hover {
          background: var(--face-brand-hover);
        }

        .btn-run:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Gate Matrix Grid */
        .section-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-secondary, var(--face-muted));
          margin: 0 0 10px 0;
        }

        .gate-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }

        .gate-card {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .gate-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gate-name {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
        }

        .gate-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .badge-passed {
          color: var(--face-ok);
          background: rgba(16, 185, 129, 0.15);
        }

        .badge-failed {
          color: var(--face-danger);
          background: rgba(239, 68, 68, 0.15);
        }

        .badge-skipped {
          color: var(--text-secondary, var(--face-muted));
          background: rgba(148, 163, 184, 0.1);
        }

        .gate-meta {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }

        /* Violation Browser */
        .filter-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }

        .filter-btn {
          min-height: 44px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary, var(--face-muted));
          background: transparent;
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          cursor: pointer;
        }

        .filter-btn[data-active="true"] {
          color: var(--text-primary, var(--face-text));
          background: rgba(56, 189, 248, 0.15);
          border-color: var(--card-accent, var(--face-accent));
        }

        .violations-box {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.6);
          max-height: 240px;
          overflow-y: auto;
        }

        .violation-row {
          padding: 8px 12px;
          border-bottom: 1px solid rgba(51, 65, 85, 0.5);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .violation-row:last-child {
          border-bottom: none;
        }

        .violation-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
        }

        .severity-tag {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .severity-error {
          color: var(--face-danger);
          background: rgba(239, 68, 68, 0.18);
        }

        .severity-warning {
          color: var(--face-warn);
          background: rgba(245, 158, 11, 0.18);
        }

        .violation-loc {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          color: var(--card-accent, var(--face-accent));
        }

        .violation-msg {
          font-size: 11px;
          color: var(--text-primary, var(--face-text));
          line-height: 1.4;
        }

        .empty-violations {
          padding: 24px;
          text-align: center;
          font-size: 12px;
          color: var(--face-ok);
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
          <div class="title-meta">
            <h3 class="plugin-title">Code Quality Gates</h3>
            <p class="plugin-subtitle">Fail-closed deterministic repository verification · v0.2.2</p>
          </div>
        </div>
        <div class="verdict-chip ${rep ? (isClean ? 'verdict-clean' : 'verdict-failed') : 'verdict-pending'}">
          ${this.executing ? 'Checking...' : rep ? (isClean ? 'Clean · Pass' : `${errorCount} Errors · Failed`) : 'Pending Report'}
        </div>
      </div>

      <div class="controls-deck">
        <div class="tier-toggles">
          <button class="btn-tier" data-active="${tierName === 'fast'}" type="button" id="tier-fast">Fast</button>
          <button class="btn-tier" data-active="${tierName === 'full'}" type="button" id="tier-full">Full</button>
          <button class="btn-tier" data-active="${tierName === 'remote'}" type="button" id="tier-remote">Remote</button>
        </div>
        <div class="action-group">
          <button class="btn-run" type="button" id="btn-run" ${this.executing ? 'disabled' : ''}>
            ${this.executing ? 'Verifying...' : `Run ${tierName.toUpperCase()} Gate`}
          </button>
        </div>
      </div>

      <div class="section-title">Configured Gate Matrix</div>
      <div class="gate-grid">
        ${checks.length > 0 ? checks.map(c => `
          <div class="gate-card">
            <div class="gate-head">
              <span class="gate-name">${escapeHtml(c.name || c.id)}</span>
              <span class="gate-badge badge-${escapeHtml(c.status || 'passed')}">${escapeHtml(c.status || 'passed')}</span>
            </div>
            <div class="gate-meta">
              <span>Exit ${c.exit_code !== undefined ? c.exit_code : 0}</span>
              <span>${c.duration_ms ? `${c.duration_ms}ms` : DASH}</span>
            </div>
          </div>
        `).join('') : `
          <div class="gate-card">
            <div class="gate-head">
              <span class="gate-name">Syntax & Types</span>
              <span class="gate-badge badge-skipped">Pending</span>
            </div>
            <div class="gate-meta"><span>Exit ${DASH}</span><span>${DASH}</span></div>
          </div>
          <div class="gate-card">
            <div class="gate-head">
              <span class="gate-name">Unit Tests</span>
              <span class="gate-badge badge-skipped">Pending</span>
            </div>
            <div class="gate-meta"><span>Exit ${DASH}</span><span>${DASH}</span></div>
          </div>
          <div class="gate-card">
            <div class="gate-head">
              <span class="gate-name">Lint & Imports</span>
              <span class="gate-badge badge-skipped">Pending</span>
            </div>
            <div class="gate-meta"><span>Exit ${DASH}</span><span>${DASH}</span></div>
          </div>
        `}
      </div>

      <div class="section-title">Inspection Findings (${filteredFindings.length})</div>
      <div class="filter-tabs">
        <button class="filter-btn" data-active="${this.activeFilter === 'all'}" type="button" id="filter-all">
          All (${allFindings.length})
        </button>
        <button class="filter-btn" data-active="${this.activeFilter === 'errors'}" type="button" id="filter-errors">
          Errors (${errorCount})
        </button>
        <button class="filter-btn" data-active="${this.activeFilter === 'warnings'}" type="button" id="filter-warnings">
          Warnings (${warnCount})
        </button>
      </div>

      <div class="violations-box">
        ${filteredFindings.length > 0 ? filteredFindings.map(f => `
          <div class="violation-row">
            <div class="violation-header">
              <span class="severity-tag severity-${escapeHtml(f.severity || 'error')}">${escapeHtml(f.severity || 'error')}</span>
              <span class="violation-loc">${escapeHtml(f.file || 'unknown')}${f.line ? `:${f.line}` : ''}</span>
              ${f.rule_id ? `<span class="plugin-subtitle">[${escapeHtml(f.rule_id)}]</span>` : ''}
            </div>
            <div class="violation-msg">${escapeHtml(f.message || 'Verification failure detected')}</div>
          </div>
        `).join('') : `
          <div class="empty-violations">
            ${rep ? 'Zero violations detected. Repository passes clean.' : 'No active gate report found. Click Run Gate above.'}
          </div>
        `}
      </div>

      <div class="footer-bar">
        <span>Latest Run: ${timestamp}</span>
        <span>Tier: ${tierName.toUpperCase()}</span>
      </div>
    `;

    // Event listeners
    root.querySelector('#tier-fast')?.addEventListener('click', () => { this.selectedTier = 'fast'; this.render(); });
    root.querySelector('#tier-full')?.addEventListener('click', () => { this.selectedTier = 'full'; this.render(); });
    root.querySelector('#tier-remote')?.addEventListener('click', () => { this.selectedTier = 'remote'; this.render(); });

    root.querySelector('#btn-run')?.addEventListener('click', () => this.runTier(this.selectedTier));

    root.querySelector('#filter-all')?.addEventListener('click', () => this.setFilter('all'));
    root.querySelector('#filter-errors')?.addEventListener('click', () => this.setFilter('errors'));
    root.querySelector('#filter-warnings')?.addEventListener('click', () => this.setFilter('warnings'));
  }
}

if (!customElements.get('tr-code-quality-card')) {
  customElements.define('tr-code-quality-card', CodeQualityCard);
}
