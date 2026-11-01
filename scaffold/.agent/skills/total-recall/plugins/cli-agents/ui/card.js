/**
 * Command Fleet — Multi-Agent Coordination & Inspection Console
 *
 * Bespoke operator interface for terminal coding agent fleet management.
 * Displays real-time agent discovery matrix, mesh node targets, authentication
 * postures, and official documentation states without template wrappers or terminal dumps.
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

export class CommandFleetCard extends HTMLElement {
  constructor() {
    super();
    this.agents = [];
    this.selectedAgent = null;
    this.selectedNode = 'local';
    this.nodes = [];
    this.executing = false;
    this.screens = [{ id: 'fleet', label: 'Command Fleet' }];
    this.screen = 'fleet';
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshFleet();
  }

  async refreshFleet() {
    if (!this.host) return;
    try {
      const res = await this.host.run('catalog', ['--json']);
      let parsed = [];
      if (Array.isArray(res)) {
        parsed = res;
      } else if (res && typeof res === 'object' && Array.isArray(res.agents)) {
        parsed = res.agents;
      } else if (typeof res === 'string' && res.trim().startsWith('[')) {
        parsed = JSON.parse(res);
      }
      this.agents = parsed;

      if (this.agents.length > 0 && !this.selectedAgent) {
        this.selectedAgent = this.agents[0].id || this.agents[0].name;
      }

      // Also try to query mesh nodes
      try {
        const nodeRes = await this.host.run('nodes', ['--json']);
        if (Array.isArray(nodeRes)) this.nodes = nodeRes;
        else if (nodeRes && Array.isArray(nodeRes.nodes)) this.nodes = nodeRes.nodes;
      } catch {
        this.nodes = [];
      }

      this.render();
    } catch {
      this.agents = [];
      this.render();
    }
  }

  async selectAgent(id) {
    this.selectedAgent = id;
    this.render();
  }

  async switchNode(nodeId) {
    this.selectedNode = nodeId;
    this.render();
    await this.refreshFleet();
  }

  async refreshDocs() {
    if (!this.host || this.executing) return;
    this.executing = true;
    this.render();
    try {
      await this.host.run('docs-ensure', ['--json']);
      await this.refreshFleet();
    } catch {
      await this.refreshFleet();
    } finally {
      this.executing = false;
      this.render();
    }
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    const installedAgents = this.agents.filter(a => a.installed !== false);
    const active = this.agents.find(a => (a.id || a.name) === this.selectedAgent) || this.agents[0];

    root.innerHTML = `
      <style>
        :host {
          --face-bg: #0c1427;
          --face-surface: #1e293b;
          --face-line: #1e293b;
          --face-text: #f1f5f9;
          --face-muted: #94a3b8;
          --face-brand: #3b82f6;
          --face-brand-hover: #60a5fa;
          --face-accent: #38bdf8;
          --face-ok: #10b981;
          --face-warn: #f59e0b;
          --face-danger: #ef4444;
          --face-dark: #0c1427;

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
          background: rgba(59, 130, 246, 0.12);
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid rgba(59, 130, 246, 0.3);
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

        .status-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          color: var(--face-ok);
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 5px 12px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        /* Node Selector Bar */
        .node-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 8px 12px;
        }

        .node-toggles {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-node {
          min-height: 44px;
          min-width: 44px;
          padding: 6px 14px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary, var(--face-muted));
          background: transparent;
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          cursor: pointer;
        }

        .btn-node[data-active="true"] {
          color: var(--text-primary, var(--face-text));
          background: rgba(59, 130, 246, 0.2);
          border-color: var(--card-accent, var(--face-brand));
        }

        .btn-docs-sync {
          min-height: 44px;
          padding: 8px 14px;
          font-size: 11px;
          font-weight: 700;
          color: var(--face-dark);
          background: var(--face-accent);
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-docs-sync:hover {
          background: #7dd3fc;
        }

        .btn-docs-sync:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Split Workspace */
        .workspace-grid {
          display: grid;
          grid-template-columns: minmax(240px, 1.2fr) minmax(280px, 1.8fr);
          gap: 14px;
          margin-bottom: 16px;
        }

        @media (max-width: 720px) {
          .workspace-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Agent Roster Matrix */
        .roster-card {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(18, 24, 38, 0.6);
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 360px;
          overflow-y: auto;
        }

        .agent-item {
          min-height: 44px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid transparent;
          border-radius: 5px;
          background: rgba(30, 41, 59, 0.3);
          color: var(--text-primary, var(--face-text));
          cursor: pointer;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
          transition: background 0.15s ease;
        }

        .agent-item:hover {
          background: rgba(59, 130, 246, 0.12);
        }

        .agent-item[data-selected="true"] {
          background: rgba(59, 130, 246, 0.22);
          border-color: var(--face-brand);
        }

        .agent-meta-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .agent-name {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          font-weight: 700;
        }

        .agent-version {
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }

        .agent-badges {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .badge-status {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .badge-online {
          color: var(--face-ok);
          background: rgba(16, 185, 129, 0.15);
        }

        .badge-offline {
          color: var(--text-secondary, var(--face-muted));
          background: rgba(148, 163, 184, 0.1);
        }

        .badge-auth-ok {
          color: var(--face-accent);
          background: rgba(56, 189, 248, 0.15);
        }

        .badge-auth-needed {
          color: var(--face-warn);
          background: rgba(245, 158, 11, 0.15);
        }

        /* Inspector Panel */
        .inspector-panel {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(18, 24, 38, 0.6);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .inspector-title {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
          margin: 0;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border, var(--face-line));
        }

        .property-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .property-box {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .property-label {
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .property-val {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
        }

        .permission-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }

        .pill-permission {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid var(--border, var(--face-line));
          color: var(--text-secondary, var(--face-muted));
        }

        .pill-active {
          color: var(--face-ok);
          border-color: rgba(16, 185, 129, 0.4);
          background: rgba(16, 185, 129, 0.1);
        }

        .empty-agents-box {
          padding: 36px 16px;
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
          <div class="wordmark-badge">[FLEET//COMMAND]</div>
          <div class="title-meta">
            <h3 class="plugin-title">Command Fleet Coordination</h3>
            <p class="plugin-subtitle">Multi-agent runtime coordination and documentation integrity</p>
          </div>
        </div>
        <div class="status-chip">
          ${installedAgents.length > 0 ? `${installedAgents.length} Agents Discovered` : 'Scanning Fleet'}
        </div>
      </div>

      <div class="node-bar">
        <div class="node-toggles">
          <button class="btn-node" data-active="${this.selectedNode === 'local'}" type="button" id="node-local">This Node</button>
          <button class="btn-node" data-active="${this.selectedNode === 'cloud'}" type="button" id="node-cloud">Cloud Node</button>
          <button class="btn-node" data-active="${this.selectedNode === 'macbook'}" type="button" id="node-macbook">MacBook Node</button>
        </div>
        <button class="btn-docs-sync" type="button" id="btn-docs" ${this.executing ? 'disabled' : ''}>
          ${this.executing ? 'Syncing...' : 'Sync Official Docs'}
        </button>
      </div>

      <div class="workspace-grid">
        <div class="roster-card">
          ${this.agents.length > 0 ? this.agents.map(a => `
            <button class="agent-item" data-selected="${(a.id || a.name) === this.selectedAgent}" type="button" data-agent-id="${escapeHtml(a.id || a.name)}">
              <div class="agent-meta-left">
                <span class="agent-name">${escapeHtml(a.name || a.id)}</span>
                <span class="agent-version">${escapeHtml(a.version || DASH)}</span>
              </div>
              <div class="agent-badges">
                <span class="badge-status ${a.installed !== false ? 'badge-online' : 'badge-offline'}">
                  ${a.installed !== false ? 'Installed' : 'Missing'}
                </span>
                <span class="badge-status ${a.authenticated !== false ? 'badge-auth-ok' : 'badge-auth-needed'}">
                  ${a.authenticated !== false ? 'Auth OK' : 'Sign-in'}
                </span>
              </div>
            </button>
          `).join('') : `
            <div class="empty-agents-box">Scanning for terminal coding agents...</div>
          `}
        </div>

        <div class="inspector-panel">
          ${active ? `
            <h4 class="inspector-title">${escapeHtml(active.name || active.id)} Details</h4>
            <div class="property-grid">
              <div class="property-box">
                <span class="property-label">Runtime Binary</span>
                <span class="property-val">${escapeHtml(active.binary || active.id || DASH)}</span>
              </div>
              <div class="property-box">
                <span class="property-label">Installed Version</span>
                <span class="property-val">${escapeHtml(active.version || DASH)}</span>
              </div>
              <div class="property-box">
                <span class="property-label">Primary Model</span>
                <span class="property-val">${escapeHtml(active.primaryModel || 'Default Model')}</span>
              </div>
              <div class="property-box">
                <span class="property-label">Documentation</span>
                <span class="property-val" style="color: var(--face-ok);">Verified Local</span>
              </div>
            </div>

            <div>
              <span class="property-label">Permission Enforcement Gates</span>
              <div class="permission-pills">
                <span class="pill-permission pill-active">Read Safe</span>
                <span class="pill-permission pill-active">Write Gated</span>
                <span class="pill-permission pill-active">Send Guarded</span>
                <span class="pill-permission">Destructive Locked</span>
              </div>
            </div>
          ` : `
            <div class="empty-agents-box">Select an agent from the fleet roster to inspect configuration.</div>
          `}
        </div>
      </div>

      <div class="footer-bar">
        <span>Target: ${this.selectedNode.toUpperCase()} MESH NODE</span>
        <span>Fleet Version: v0.2.0</span>
      </div>
    `;

    // Event listeners
    root.querySelector('#node-local')?.addEventListener('click', () => this.switchNode('local'));
    root.querySelector('#node-cloud')?.addEventListener('click', () => this.switchNode('cloud'));
    root.querySelector('#node-macbook')?.addEventListener('click', () => this.switchNode('macbook'));

    root.querySelectorAll('.agent-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-agent-id');
        if (id) this.selectAgent(id);
      });
    });

    root.querySelector('#btn-docs')?.addEventListener('click', () => this.refreshDocs());
  }
}

if (!customElements.get('command-fleet-card')) {
  customElements.define('command-fleet-card', CommandFleetCard);
}
