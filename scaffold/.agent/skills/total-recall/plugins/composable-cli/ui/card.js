/**
 * CmdSmith — Dynamic Agent Command Composition Engine
 * Bespoke Purpose-Built Web Component Card Face.
 *
 * Exposes live composed command inventory, dynamic execution inspection,
 * version history, and interactive pipeline actions with zero decorative gimmicks.
 *
 * Zero emojis, authentic commercial brand identity, touch-first ergonomics (>=44px).
 */

export class PipelineComposerCard extends HTMLElement {
  constructor() {
    super();
    this.executing = false;
    this.telemetry = {
      commandsCount: '7 Active',
      scope: 'Global / Project',
      status: 'Engine Ready'
    };
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.refreshTelemetry();
  }

  async refreshTelemetry() {
    try {
      const res = await this.host?.run('list', []);
      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res || '');
      }

      const lines = text.split('\n').filter(l => l.trim().startsWith('-'));
      const count = lines.length;

      this.telemetry = {
        commandsCount: count > 0 ? `${count} Commands` : '0 Commands',
        scope: text.includes('global') ? 'Global & Project' : 'Project Scope',
        status: 'Engine Ready'
      };
      this.updateView();
    } catch {
      this.telemetry = {
        commandsCount: 'Registry Active',
        scope: 'Local Scope',
        status: 'Online'
      };
      this.updateView();
    }
  }

  updateView() {
    const root = this.shadowRoot;
    if (!root) return;

    const countEl = root.querySelector('#stat-count');
    const scopeEl = root.querySelector('#stat-scope');
    const statusEl = root.querySelector('#stat-status');
    if (countEl) countEl.textContent = this.telemetry.commandsCount;
    if (scopeEl) scopeEl.textContent = this.telemetry.scope;
    if (statusEl) statusEl.textContent = this.telemetry.status;
  }

  async execute(action, args = []) {
    const out = this.shadowRoot?.querySelector('#card-out');
    const statusBadge = this.shadowRoot?.querySelector('#status-pill');
    const actionLabel = action.toUpperCase();

    if (out) out.textContent = `[CMDSMITH ROUTER] Invoking ${actionLabel} ${args.join(' ')}...`;
    if (statusBadge) statusBadge.textContent = 'ROUTING';
    this.executing = true;

    try {
      const res = await this.host?.run(action, args);
      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res || 'Execution completed with no return payload.');
      }
      if (out) out.textContent = text.trim();
      if (statusBadge) statusBadge.textContent = 'READY';

      if (['create', 'update', 'remove', 'rollback', 'promote'].includes(action)) {
        this.refreshTelemetry();
      }
    } catch (err) {
      if (out) out.textContent = `[CMDSMITH FAULT] ${err.message}`;
      if (statusBadge) statusBadge.textContent = 'ERROR';
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
          background: #03151e;
          color: #ecfeff;
          border-radius: 12px;
          border: 1px solid #0e4a5e;
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
          border-bottom: 1px solid rgba(6, 182, 212, 0.2);
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
          background: rgba(8, 145, 178, 0.2);
          border: 1px solid rgba(6, 182, 212, 0.4);
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
          color: #cffafe;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          margin: 0;
        }

        .brand-subtitle {
          font-size: 11px;
          color: #67e8f9;
          margin: 0;
          font-family: 'JetBrains Mono', monospace;
        }

        .status-pill {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(6, 182, 212, 0.15);
          border: 1px solid rgba(6, 182, 212, 0.4);
          color: #22d3ee;
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
          background: rgba(8, 47, 61, 0.6);
          border: 1px solid rgba(6, 182, 212, 0.25);
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
          color: #67e8f9;
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

        /* Target Command Input Selector */
        .target-box {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(6, 182, 212, 0.2);
          border-radius: 8px;
          padding: 4px 8px;
        }

        .target-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #67e8f9;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .target-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #ecfeff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          outline: none;
        }

        .target-input::placeholder {
          color: rgba(103, 232, 249, 0.4);
        }

        /* Action Buttons Grid (>=44px touch targets) */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-bottom: 10px;
        }

        .touch-btn {
          min-height: 44px;
          background: rgba(8, 145, 178, 0.16);
          border: 1px solid rgba(6, 182, 212, 0.3);
          border-radius: 8px;
          color: #ecfeff;
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
          background: rgba(8, 145, 178, 0.3);
          border-color: rgba(6, 182, 212, 0.6);
        }

        .touch-btn:active {
          transform: translateY(1px);
        }

        /* Terminal Execution Output */
        .terminal-deck {
          background: #010c12;
          border: 1px solid rgba(6, 182, 212, 0.25);
          border-radius: 8px;
          overflow: hidden;
        }

        .terminal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: rgba(8, 47, 61, 0.4);
          border-bottom: 1px solid rgba(6, 182, 212, 0.2);
        }

        .terminal-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #67e8f9;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .terminal-btn {
          background: rgba(6, 182, 212, 0.15);
          border: 1px solid rgba(6, 182, 212, 0.3);
          border-radius: 4px;
          color: #cffafe;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          padding: 2px 6px;
          cursor: pointer;
        }

        .terminal-btn:hover {
          background: rgba(6, 182, 212, 0.3);
        }

        .terminal-body {
          margin: 0;
          padding: 8px 10px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.45;
          color: #cffafe;
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 17l6-6-6-6"/>
              <path d="M12 19h8"/>
              <circle cx="16" cy="8" r="2"/>
            </svg>
          </div>
          <div class="brand-meta">
            <h3 class="brand-title">CmdSmith</h3>
            <span class="brand-subtitle">Pipeline Forge • v0.2.1</span>
          </div>
        </div>
        <div id="status-pill" class="status-pill">READY</div>
      </div>

      <div class="telemetry-row">
        <div class="metric-card">
          <span class="metric-label">Commands</span>
          <span id="stat-count" class="metric-value">7 Active</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Scope</span>
          <span id="stat-scope" class="metric-value">Global / Project</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Engine</span>
          <span id="stat-status" class="metric-value">Engine Ready</span>
        </div>
      </div>

      <div class="target-box">
        <span class="target-label">Target Command:</span>
        <input id="cmd-input" class="target-input" type="text" value="tr-first" placeholder="e.g. tr-first, brand-lint" />
      </div>

      <div class="actions-grid">
        <button id="btn-library" class="touch-btn" type="button">LIBRARY</button>
        <button id="btn-list" class="touch-btn" type="button">LIST</button>
        <button id="btn-show" class="touch-btn" type="button">SHOW</button>
        <button id="btn-history" class="touch-btn" type="button">HISTORY</button>
        <button id="btn-test" class="touch-btn" type="button">TEST</button>
        <button id="btn-status" class="touch-btn" type="button">STATUS</button>
      </div>

      <div class="terminal-deck">
        <div class="terminal-header">
          <span class="terminal-title">Console Output</span>
          <button id="btn-copy" class="terminal-btn" type="button">COPY</button>
        </div>
        <pre id="card-out" class="terminal-body">Dynamic agent command composition engine ready. Click any action above to inspect pipeline state.</pre>
      </div>
    `;

    const getTarget = () => {
      const input = root.querySelector('#cmd-input');
      return (input?.value || 'tr-first').trim();
    };

    root.querySelector('#btn-library')?.addEventListener('click', () => {
      this.execute('library');
    });

    root.querySelector('#btn-list')?.addEventListener('click', () => {
      this.execute('list');
    });

    root.querySelector('#btn-show')?.addEventListener('click', () => {
      this.execute('show', [getTarget()]);
    });

    root.querySelector('#btn-history')?.addEventListener('click', () => {
      this.execute('history', [getTarget()]);
    });

    root.querySelector('#btn-test')?.addEventListener('click', () => {
      this.execute('test', [getTarget()]);
    });

    root.querySelector('#btn-status')?.addEventListener('click', () => {
      this.execute('status');
    });

    root.querySelector('#btn-copy')?.addEventListener('click', () => {
      this.copyOutput();
    });
  }
}

if (!customElements.get('tr-composable-cli-card')) {
  customElements.define('tr-composable-cli-card', PipelineComposerCard);
}
