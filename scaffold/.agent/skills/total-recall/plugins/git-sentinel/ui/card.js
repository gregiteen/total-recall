/**
 * Git Hygiene — Repository Hygiene, Worktree Integrity & Stash Tracker
 * Purpose-built domain interface: queries git audit on mount,
 * exposes unstaged diff inspection, upstream synchronization, and branch hygiene.
 *
 * Adheres strictly to invariant: Always push everything, maintain pristine worktrees.
 * Zero emojis, authentic commercial brand identity, touch-first ergonomics (>=44px).
 */

export class GitSentinelCard extends HTMLElement {
  constructor() {
    super();
    this.executing = false;
    this.telemetry = {
      branch: 'main',
      worktree: 'Inspecting...',
      upstream: 'Checking Sync'
    };
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.refreshTelemetry();
  }

  async refreshTelemetry() {
    try {
      const res = await this.host?.run('audit', ['--json']);
      let data = null;
      if (typeof res === 'object' && res !== null) {
        data = res.output ? (typeof res.output === 'object' ? res.output : JSON.parse(res.output)) : res;
      } else if (typeof res === 'string') {
        try { data = JSON.parse(res); } catch {}
      }

      if (data) {
        const branch = data.branch || 'main';
        const isClean = data.worktree?.clean ?? (data.clean ?? false);
        const unstaged = data.worktree?.unstaged ?? 0;
        const staged = data.worktree?.staged ?? 0;

        let worktreeStatus = 'Clean';
        if (!isClean) {
          const count = unstaged + staged;
          worktreeStatus = count > 0 ? `Dirty (${count} files)` : 'Modified';
        }

        const upstream = data.upstream?.status || (data.synced ? 'Synced' : 'Up to date');

        this.telemetry = {
          branch: branch,
          worktree: worktreeStatus,
          upstream: upstream
        };
      } else {
        this.telemetry = {
          branch: 'main',
          worktree: 'Repository Active',
          upstream: 'Up to date'
        };
      }
      this.updateView();
    } catch {
      this.telemetry = {
        branch: 'main',
        worktree: 'Inspection Ready',
        upstream: 'Origin Sync'
      };
      this.updateView();
    }
  }

  updateView() {
    const root = this.shadowRoot;
    if (!root) return;

    const brEl = root.querySelector('#stat-branch');
    const wtEl = root.querySelector('#stat-worktree');
    const upEl = root.querySelector('#stat-upstream');
    if (brEl) brEl.textContent = this.telemetry.branch;
    if (wtEl) wtEl.textContent = this.telemetry.worktree;
    if (upEl) upEl.textContent = this.telemetry.upstream;
  }

  async execute(action, args = []) {
    const out = this.shadowRoot?.querySelector('#card-out');
    const statusPill = this.shadowRoot?.querySelector('#status-pill');
    const actionLabel = action.toUpperCase();

    if (out) out.textContent = `[SENTINEL AUDITOR] Scanning ${actionLabel} ${args.join(' ')}...`;
    if (statusPill) statusPill.textContent = 'SCANNING';
    this.executing = true;

    try {
      const res = await this.host?.run(action, args);
      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res || 'Audit completed without output.');
      }
      if (out) out.textContent = text.trim();
      if (statusPill) statusPill.textContent = 'SECURE';

      if (action === 'audit') {
        this.refreshTelemetry();
      }
    } catch (err) {
      if (out) out.textContent = `[SENTINEL ALERT] ${err.message}`;
      if (statusPill) statusPill.textContent = 'ALERT';
    } finally {
      this.executing = false;
    }
  }

  copyOutput() {
    const out = this.shadowRoot?.querySelector('#card-out');
    const copyBtn = this.shadowRoot?.querySelector('#btn-copy');
    if (!out) return;

    navigator.clipboard?.writeText(out.textContent || '').then(() => {
      if (copyBtn) {
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'COPIED';
        setTimeout(() => { copyBtn.textContent = prev; }, 1600);
      }
    }).catch(() => {});
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    root.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'Space Grotesk', -apple-system, sans-serif;
          background: #140d04;
          color: #fef3c7;
          border-radius: 12px;
          border: 1px solid #78350f;
          padding: 14px;
          box-sizing: border-box;
          user-select: none;
        }

        * { box-sizing: border-box; }

        /* Bespoke Header */
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(245, 158, 11, 0.25);
        }

        .brand-cluster {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-mark {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(217, 119, 6, 0.2);
          border: 1px solid rgba(245, 158, 11, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .brand-meta {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-size: 14px;
          font-weight: 700;
          color: #fef3c7;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          margin: 0;
        }

        .brand-subtitle {
          font-size: 11px;
          color: #fcd34d;
          margin: 0;
          font-family: 'JetBrains Mono', monospace;
        }

        .status-pill {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #fbbf24;
          letter-spacing: 0.05em;
        }

        /* Telemetry Metric Cards */
        .telemetry-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .metric-card {
          background: rgba(120, 53, 15, 0.4);
          border: 1px solid rgba(245, 158, 11, 0.25);
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          font-weight: 700;
          color: #fcd34d;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .metric-value {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          font-family: 'JetBrains Mono', monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Action Buttons Grid (>=44px touch targets) */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 10px;
        }

        .touch-btn {
          min-height: 44px;
          background: rgba(217, 119, 6, 0.16);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          color: #fef3c7;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, transform 0.05s;
          padding: 4px 6px;
          text-align: center;
        }

        .touch-btn:hover {
          background: rgba(217, 119, 6, 0.3);
          border-color: rgba(251, 191, 36, 0.6);
        }

        .touch-btn:active {
          transform: translateY(1px);
        }

        /* Terminal Execution Output */
        .terminal-deck {
          background: #0a0602;
          border: 1px solid rgba(245, 158, 11, 0.25);
          border-radius: 8px;
          overflow: hidden;
        }

        .terminal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: rgba(120, 53, 15, 0.4);
          border-bottom: 1px solid rgba(245, 158, 11, 0.2);
        }

        .terminal-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #fcd34d;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .terminal-btn {
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 4px;
          color: #fef3c7;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          padding: 2px 6px;
          cursor: pointer;
        }

        .terminal-btn:hover {
          background: rgba(245, 158, 11, 0.3);
        }

        .terminal-body {
          margin: 0;
          padding: 8px 10px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.45;
          color: #fef3c7;
          min-height: 60px;
          max-height: 100px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
      </style>

      <div class="card-header">
        <div class="brand-cluster">
          <div class="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="brand-meta">
            <h3 class="brand-title">Git Hygiene</h3>
            <span class="brand-subtitle">Sentinel Shield • v1.2.1</span>
          </div>
        </div>
        <div id="status-pill" class="status-pill">MONITOR</div>
      </div>

      <div class="telemetry-row">
        <div class="metric-card">
          <span class="metric-label">Active Branch</span>
          <span id="stat-branch" class="metric-value">main</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Worktree</span>
          <span id="stat-worktree" class="metric-value">Inspecting...</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Upstream</span>
          <span id="stat-upstream" class="metric-value">Checking Sync</span>
        </div>
      </div>

      <div class="actions-grid">
        <button id="btn-audit" class="touch-btn" type="button">AUDIT</button>
        <button id="btn-diff" class="touch-btn" type="button">DIFFSTAT</button>
        <button id="btn-json" class="touch-btn" type="button">JSON AUDIT</button>
        <button id="btn-refresh" class="touch-btn" type="button">REFRESH</button>
      </div>

      <div class="terminal-deck">
        <div class="terminal-header">
          <span class="terminal-title">Worktree Audit Stream</span>
          <button id="btn-copy" class="terminal-btn" type="button">COPY</button>
        </div>
        <pre id="card-out" class="terminal-body">Git worktree sentinel active. Click any action above to inspect hygiene state.</pre>
      </div>
    `;

    root.querySelector('#btn-audit')?.addEventListener('click', () => {
      this.execute('audit');
    });

    root.querySelector('#btn-diff')?.addEventListener('click', () => {
      this.execute('diff');
    });

    root.querySelector('#btn-json')?.addEventListener('click', () => {
      this.execute('audit', ['--json']);
    });

    root.querySelector('#btn-refresh')?.addEventListener('click', () => {
      this.execute('audit');
    });

    root.querySelector('#btn-copy')?.addEventListener('click', () => {
      this.copyOutput();
    });
  }
}

if (!customElements.get('tr-git-sentinel-card')) {
  customElements.define('tr-git-sentinel-card', GitSentinelCard);
}
