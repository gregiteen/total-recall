/**
 * Pipe Dream — Composable CLI Pipeline Forge Console
 *
 * Bespoke operator interface for dynamic agent command composition.
 * Displays real-time command matrix, risk classifications, argument schema,
 * and version snapshot controls with zero template wrappers or terminal dumps.
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

export class PipelineComposerCard extends HTMLElement {
  constructor() {
    super();
    this.commands = [];
    this.selectedCommand = null;
    this.commandDetail = null;
    this.executing = false;
    this.activeScope = 'all';
    this.screens = [{ id: 'forge', label: 'Command Forge' }];
    this.screen = 'forge';
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshCommands();
  }

  async refreshCommands() {
    if (!this.host) return;
    try {
      const res = await this.host.run('library', ['--json']);
      let parsed = [];
      if (Array.isArray(res)) {
        parsed = res;
      } else if (res && typeof res === 'object' && Array.isArray(res.commands)) {
        parsed = res.commands;
      } else if (typeof res === 'string' && res.trim().startsWith('[')) {
        parsed = JSON.parse(res);
      } else {
        // Fallback to list
        const listRes = await this.host.run('list', ['--json']);
        if (Array.isArray(listRes)) parsed = listRes;
        else if (listRes && typeof listRes === 'object' && Array.isArray(listRes.commands)) parsed = listRes.commands;
      }

      this.commands = parsed;
      if (this.commands.length > 0 && !this.selectedCommand) {
        this.selectedCommand = this.commands[0].name;
        await this.inspectCommand(this.selectedCommand);
      } else {
        this.render();
      }
    } catch {
      this.commands = [];
      this.render();
    }
  }

  async inspectCommand(name) {
    this.selectedCommand = name;
    if (!this.host) return;
    try {
      const detail = await this.host.run('read', [name, '--json']);
      this.commandDetail = detail && typeof detail === 'object' ? detail : { name, code: String(detail || '') };
    } catch {
      this.commandDetail = null;
    }
    this.render();
  }

  async testCommand(name) {
    if (!this.host || this.executing) return;
    this.executing = true;
    this.render();

    try {
      const result = await this.host.run('test', [name, '--json']);
      if (this.commandDetail) {
        this.commandDetail.lastResult = result;
      }
    } catch (err) {
      if (this.commandDetail) {
        this.commandDetail.lastError = err instanceof Error ? err.message : 'Execution failed';
      }
    } finally {
      this.executing = false;
      this.render();
    }
  }

  setScopeFilter(scope) {
    this.activeScope = scope;
    this.render();
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    const filtered = this.commands.filter(c => {
      if (this.activeScope === 'project') return c.scope === 'project';
      if (this.activeScope === 'global') return c.scope === 'global';
      return true;
    });

    const activeCmd = this.commands.find(c => c.name === this.selectedCommand) || this.commands[0];
    const detail = this.commandDetail;

    root.innerHTML = `
      <style>
        :host {
          --face-bg: #09090b;
          --face-surface: #18181b;
          --face-line: #27272a;
          --face-text: #f4f4f5;
          --face-muted: #a1a1aa;
          --face-brand: #a855f7;
          --face-brand-hover: #c084fc;
          --face-accent: #22c55e;
          --face-ok: #22c55e;
          --face-warn: #eab308;
          --face-danger: #ef4444;
          --face-info: #38bdf8;
          --face-dark: #09090b;

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
          color: var(--card-accent, var(--face-brand));
          background: rgba(168, 85, 247, 0.12);
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid rgba(168, 85, 247, 0.3);
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

        .inventory-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          color: var(--face-accent);
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          padding: 5px 12px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        /* Main Workspace Split */
        .workspace-split {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) minmax(320px, 1.6fr);
          gap: 14px;
          margin-bottom: 16px;
        }

        @media (max-width: 680px) {
          .workspace-split {
            grid-template-columns: 1fr;
          }
        }

        /* Command List Deck */
        .deck-column {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .scope-filters {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-scope {
          min-height: 44px;
          min-width: 44px;
          padding: 6px 12px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary, var(--face-muted));
          background: transparent;
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          cursor: pointer;
        }

        .btn-scope[data-active="true"] {
          color: var(--text-primary, var(--face-text));
          background: rgba(168, 85, 247, 0.15);
          border-color: var(--card-accent, var(--face-brand));
        }

        .command-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 6px;
          background: rgba(24, 24, 27, 0.5);
        }

        .command-item {
          min-height: 44px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid transparent;
          border-radius: 5px;
          background: transparent;
          color: var(--text-primary, var(--face-text));
          cursor: pointer;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
          transition: background 0.15s ease;
        }

        .command-item:hover {
          background: rgba(39, 39, 42, 0.5);
        }

        .command-item[data-selected="true"] {
          background: rgba(168, 85, 247, 0.18);
          border-color: var(--face-brand);
        }

        .cmd-name {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          font-weight: 700;
        }

        .badges-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .risk-badge {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .risk-read {
          color: var(--face-ok);
          background: rgba(34, 197, 94, 0.15);
        }

        .risk-write {
          color: var(--face-warn);
          background: rgba(234, 179, 8, 0.15);
        }

        .risk-destructive {
          color: var(--face-danger);
          background: rgba(239, 68, 68, 0.15);
        }

        .risk-send {
          color: var(--face-info);
          background: rgba(56, 189, 248, 0.15);
        }

        .scope-tag {
          font-size: 9px;
          color: var(--text-secondary, var(--face-muted));
          border: 1px solid var(--border, var(--face-line));
          padding: 1px 4px;
          border-radius: 3px;
        }

        /* Inspector View */
        .inspector-panel {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(24, 24, 27, 0.5);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .inspector-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border, var(--face-line));
        }

        .inspector-title {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
          margin: 0;
        }

        .action-run {
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

        .action-run:hover {
          background: var(--face-brand-hover);
        }

        .action-run:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .detail-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 11px;
          color: var(--text-secondary, var(--face-muted));
        }

        .meta-entry {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .meta-entry strong {
          color: var(--text-primary, var(--face-text));
        }

        .code-preview-box {
          background: rgba(9, 9, 11, 0.8);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          padding: 10px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          line-height: 1.5;
          color: var(--text-primary, var(--face-text));
          max-height: 160px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .result-container {
          padding: 8px 12px;
          border-radius: 5px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
        }

        .result-success {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: var(--face-ok);
        }

        .result-failure {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: var(--face-danger);
        }

        .empty-command-box {
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
          <div class="wordmark-badge">[PIPE//DREAM]</div>
          <div class="title-meta">
            <h3 class="plugin-title">Composable CLI Forge</h3>
            <p class="plugin-subtitle">Dynamic agent command composition and execution</p>
          </div>
        </div>
        <div class="inventory-chip">
          ${this.commands.length > 0 ? `${this.commands.length} Verbs Active` : 'No Commands'}
        </div>
      </div>

      <div class="workspace-split">
        <div class="deck-column">
          <div class="scope-filters">
            <button class="btn-scope" data-active="${this.activeScope === 'all'}" type="button" id="scope-all">All</button>
            <button class="btn-scope" data-active="${this.activeScope === 'project'}" type="button" id="scope-project">Project</button>
            <button class="btn-scope" data-active="${this.activeScope === 'global'}" type="button" id="scope-global">Global</button>
          </div>

          <div class="command-list">
            ${filtered.length > 0 ? filtered.map(c => `
              <button class="command-item" data-selected="${c.name === this.selectedCommand}" type="button" data-cmd="${escapeHtml(c.name)}">
                <span class="cmd-name">${escapeHtml(c.name)}</span>
                <div class="badges-group">
                  <span class="risk-badge risk-${escapeHtml(c.risk || 'read')}">${escapeHtml(c.risk || 'read')}</span>
                  <span class="scope-tag">${escapeHtml(c.scope || 'proj')}</span>
                </div>
              </button>
            `).join('') : `
              <div class="empty-command-box">No composed commands in this scope.</div>
            `}
          </div>
        </div>

        <div class="inspector-panel">
          ${activeCmd ? `
            <div class="inspector-header">
              <h4 class="inspector-title">${escapeHtml(activeCmd.name)}</h4>
              <button class="action-run" type="button" id="btn-test" ${this.executing ? 'disabled' : ''}>
                ${this.executing ? 'Executing...' : 'Test Verb'}
              </button>
            </div>

            <div class="detail-meta-row">
              <div class="meta-entry"><span>Scope:</span> <strong>${escapeHtml(activeCmd.scope || 'project')}</strong></div>
              <div class="meta-entry"><span>Risk:</span> <strong class="risk-badge risk-${escapeHtml(activeCmd.risk || 'read')}">${escapeHtml(activeCmd.risk || 'read')}</strong></div>
              <div class="meta-entry"><span>Updated:</span> <strong>${activeCmd.updated_at ? new Date(activeCmd.updated_at).toLocaleDateString() : DASH}</strong></div>
            </div>

            ${detail?.lastResult ? `
              <div class="result-container result-success">
                Return: ${escapeHtml(JSON.stringify(detail.lastResult))}
              </div>
            ` : detail?.lastError ? `
              <div class="result-container result-failure">
                Failure: ${escapeHtml(detail.lastError)}
              </div>
            ` : ''}

            <div class="code-preview-box">${escapeHtml(detail?.code || detail?.source || '// Select a composed verb to inspect implementation')}</div>
          ` : `
            <div class="empty-command-box">Select or create a composed command to inspect properties.</div>
          `}
        </div>
      </div>

      <div class="footer-bar">
        <span>Engine: Composable CLI v0.2.2</span>
        <span>Scope: ${this.activeScope.toUpperCase()}</span>
      </div>
    `;

    // Event listeners
    root.querySelector('#scope-all')?.addEventListener('click', () => this.setScopeFilter('all'));
    root.querySelector('#scope-project')?.addEventListener('click', () => this.setScopeFilter('project'));
    root.querySelector('#scope-global')?.addEventListener('click', () => this.setScopeFilter('global'));

    root.querySelectorAll('.command-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd) this.inspectCommand(cmd);
      });
    });

    root.querySelector('#btn-test')?.addEventListener('click', () => {
      if (this.selectedCommand) this.testCommand(this.selectedCommand);
    });
  }
}

if (!customElements.get('tr-composable-cli-card')) {
  customElements.define('tr-composable-cli-card', PipelineComposerCard);
}
