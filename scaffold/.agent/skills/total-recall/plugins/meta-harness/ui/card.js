/**
 * Meta Harness — Multi-Agent Coordination & Inspection Console
 *
 * Bespoke operator interface for terminal coding agent fleet management.
 * Displays real-time agent discovery matrix, mesh node targets, authentication
 * postures, quotas and memory, sourced model figures, routing, threads and review.
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
    this.screen = 'fleet'; // 'fleet' | 'router' | 'quotas' | 'benchmarks' | 'threads'
    this.quotas = null;
    this.benchmarks = null;
    this.routeResult = null;
    this.routeInput = '';
    this.threads = [];
    this.selectedThreadId = null;
    this.reviewVerdict = null;
    this.reviewing = false;
    this.reviewBase = 'main';
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshFleet();
  }

  async setScreen(screen) {
    this.screen = screen;
    this.render();
    if (screen === 'quotas' && !this.quotas) {
      await this.refreshQuotas();
    } else if (screen === 'benchmarks' && !this.benchmarks) {
      await this.refreshBenchmarks();
    } else if (screen === 'threads' && this.threads.length === 0) {
      await this.refreshThreads();
    }
  }

  async refreshFleet() {
    if (!this.host) return;
    try {
      const res = await this.host.run('status', ['--json']);
      let parsed = [];
      if (Array.isArray(res)) {
        parsed = res;
      } else if (res && typeof res === 'object') {
        if (Array.isArray(res.agents)) parsed = res.agents;
        if (res.documentation) this.docsFresh = Boolean(res.documentation.ok);
      } else if (typeof res === 'string' && res.trim().startsWith('{')) {
        try {
          const obj = JSON.parse(res);
          if (Array.isArray(obj.agents)) parsed = obj.agents;
          if (obj.documentation) this.docsFresh = Boolean(obj.documentation.ok);
        } catch {}
      } else if (typeof res === 'string' && res.trim().startsWith('[')) {
        try { parsed = JSON.parse(res); } catch {}
      }
      this.agents = parsed;

      if (this.agents.length > 0 && !this.selectedAgent) {
        this.selectedAgent = this.agents[0].id || this.agents[0].name;
      }

      // Query mesh nodes
      try {
        const nodeRes = await this.host.run('nodes', ['--json']);
        if (Array.isArray(nodeRes)) this.nodes = nodeRes;
        else if (nodeRes && Array.isArray(nodeRes.nodes)) this.nodes = nodeRes.nodes;
        else if (nodeRes && Array.isArray(nodeRes.targets)) this.nodes = nodeRes.targets;
      } catch {
        this.nodes = [{ id: 'local', name: 'This Node' }];
      }

      this.loadError = null;
      this.render();
    } catch (error) {
      this.agents = [];
      this.loadError = error?.message || 'The fleet could not be read';
      this.render();
    }
  }

  /** Re-read whatever the visible screen shows, after a failure or a node change. */
  retry() {
    this.loadError = null;
    this.render();
    if (this.screen === 'quotas') return this.refreshQuotas();
    if (this.screen === 'benchmarks') return this.refreshBenchmarks();
    if (this.screen === 'threads') return this.refreshThreads();
    return this.refreshFleet();
  }

  async refreshQuotas() {
    if (!this.host) return;
    try {
      const res = await this.host.run('quota', ['--node', this.selectedNode, '--json']);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      this.quotas = parsed?.quotas || null;
      this.fleet = parsed?.fleet || null;
      this.loadError = null;
      this.render();
    } catch (error) {
      this.quotas = null;
      this.loadError = error?.message || 'Quotas could not be read';
      this.render();
    }
  }

  async refreshBenchmarks() {
    if (!this.host) return;
    try {
      const res = await this.host.run('benchmarks', ['--json']);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      this.benchmarks = parsed || null;
      this.loadError = null;
      this.render();
    } catch (error) {
      this.benchmarks = null;
      this.loadError = error?.message || 'The catalog could not be read';
      this.render();
    }
  }

  async executeRoute(task) {
    if (!this.host || !task) return;
    this.executing = true;
    this.render();
    try {
      const res = await this.host.run('route', [task, '--json']);
      this.routeResult = typeof res === 'string' ? JSON.parse(res) : res;
    } catch (err) {
      this.routeResult = { ok: false, error: err.message };
    } finally {
      this.executing = false;
      this.render();
    }
  }

  async refreshThreads() {
    if (!this.host) return;
    try {
      const res = await this.host.run('threads', ['list', '--json']);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      this.threads = Array.isArray(parsed) ? parsed : (parsed?.threads || []);
      if (this.threads.length > 0 && !this.selectedThreadId) {
        this.selectedThreadId = this.threads[0].id;
      }
      this.loadError = null;
      this.render();
    } catch (error) {
      this.threads = [];
      this.loadError = error?.message || 'Threads could not be read';
      this.render();
    }
  }

  async executeReview(base = 'main') {
    if (!this.host || this.reviewing) return;
    this.reviewing = true;
    this.render();
    try {
      const res = await this.host.run('review', [`${base}...HEAD`, '--json']);
      this.reviewVerdict = typeof res === 'string' ? JSON.parse(res) : res;
    } catch (err) {
      this.reviewVerdict = { ok: false, error: err.message };
    } finally {
      this.reviewing = false;
      this.render();
    }
  }

  selectThread(id) {
    this.selectedThreadId = id;
    this.render();
  }

  async selectAgent(id) {
    this.selectedAgent = id;
    this.render();
  }

  async switchNode(nodeId) {
    this.selectedNode = nodeId;
    this.render();
    await this.refreshFleet();
    if (this.screen === 'quotas') {
      await this.refreshQuotas();
    }
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
          margin-bottom: 14px;
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
          font-size: 11px;
          font-weight: 600;
          color: var(--face-ok);
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          border-radius: 20px;
          padding: 4px 10px;
        }

        /* Screen Navigation Tabs */
        .tabs-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
          border-bottom: 1px solid var(--border, var(--face-line));
          padding-bottom: 8px;
        }

        .tab-btn {
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary, var(--face-muted));
          cursor: pointer;
          min-height: 44px;
          display: flex;
          align-items: center;
        }

        .tab-btn[data-active="true"] {
          background: rgba(59, 130, 246, 0.15);
          color: var(--face-accent);
          border-color: rgba(59, 130, 246, 0.4);
        }

        /* Node Selector & Action Controls */
        .node-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 14px;
        }

        .node-toggles {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .btn-node {
          font-size: 11px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 5px;
          border: 1px solid var(--border, var(--face-line));
          background: rgba(30, 41, 59, 0.5);
          color: var(--text-secondary, var(--face-muted));
          cursor: pointer;
          min-height: 44px;
          display: flex;
          align-items: center;
        }

        .btn-node[data-active="true"] {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.5);
          color: var(--text-primary, var(--face-text));
        }

        .btn-action {
          font-size: 11px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 5px;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: var(--face-accent);
          cursor: pointer;
          min-height: 44px;
          display: flex;
          align-items: center;
        }

        /* Workspace Grid (Fleet View) */
        .workspace-grid {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 14px;
        }

        @media (max-width: 768px) {
          .workspace-grid {
            grid-template-columns: 1fr;
          }
        }

        .roster-card {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 8px;
          max-height: 380px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .agent-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          text-align: left;
          width: 100%;
          min-height: 44px;
          box-sizing: border-box;
        }

        .agent-item:hover {
          background: rgba(30, 41, 59, 0.4);
        }

        .agent-item[data-selected="true"] {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .agent-meta-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .agent-name {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
        }

        .agent-version {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }

        .agent-badges {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }

        .badge-status {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 10px;
          letter-spacing: 0.02em;
        }

        .badge-online {
          background: rgba(16, 185, 129, 0.15);
          color: var(--face-ok);
        }

        .badge-offline {
          background: rgba(239, 68, 68, 0.15);
          color: var(--face-danger);
        }

        .badge-auth-ok {
          background: rgba(56, 189, 248, 0.15);
          color: var(--face-accent);
        }

        .badge-auth-needed {
          background: rgba(245, 158, 11, 0.15);
          color: var(--face-warn);
        }

        .inspector-panel {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .inspector-title {
          font-size: 14px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary, var(--face-text));
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

        /* Quotas & Benchmarks Tables */
        .table-panel {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 12px;
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .data-table th {
          text-align: left;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border, var(--face-line));
          color: var(--text-secondary, var(--face-muted));
          font-weight: 600;
          text-transform: uppercase;
        }

        .data-table td {
          padding: 8px 10px;
          border-bottom: 1px solid rgba(30, 41, 59, 0.4);
          color: var(--text-primary, var(--face-text));
        }

        /* Router Interactive Form */
        .router-panel {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-row {
          display: flex;
          gap: 8px;
        }

        .task-input {
          flex: 1;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          color: var(--text-primary, var(--face-text));
          padding: 8px 12px;
          font-size: 12px;
          min-height: 44px;
          box-sizing: border-box;
        }

        .empty-agents-box {
          padding: 36px 16px;
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary, var(--face-muted));
        }

        /* Threads & Review Layout */
        .threads-grid {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 14px;
        }

        @media (max-width: 768px) {
          .threads-grid {
            grid-template-columns: 1fr;
          }
        }

        .threads-list {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 8px;
          max-height: 440px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .thread-card-btn {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px;
          border-radius: 5px;
          border: 1px solid transparent;
          background: rgba(30, 41, 59, 0.4);
          cursor: pointer;
          text-align: left;
          width: 100%;
          min-height: 44px;
          box-sizing: border-box;
        }

        .thread-card-btn:hover {
          background: rgba(30, 41, 59, 0.7);
        }

        .thread-card-btn[data-selected="true"] {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .thread-title-text {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
        }

        .thread-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }

        .thread-detail-panel {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 440px;
          overflow-y: auto;
        }

        .review-box {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .verdict-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
        }

        .verdict-pass {
          background: rgba(16, 185, 129, 0.2);
          color: var(--face-ok);
          border: 1px solid rgba(16, 185, 129, 0.4);
        }

        .verdict-fail {
          background: rgba(239, 68, 68, 0.2);
          color: var(--face-danger);
          border: 1px solid rgba(239, 68, 68, 0.4);
        }

        .verdict-caution {
          background: rgba(245, 158, 11, 0.2);
          color: var(--face-warn);
          border: 1px solid rgba(245, 158, 11, 0.4);
        }

        .turns-log {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .turn-box {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
          padding: 8px 10px;
          font-size: 11px;
        }

        .turn-header {
          display: flex;
          justify-content: space-between;
          font-weight: 700;
          color: var(--face-accent);
          margin-bottom: 4px;
          font-size: 10px;
          text-transform: uppercase;
        }

        .turn-content {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 10px;
          color: var(--text-primary, var(--face-text));
          white-space: pre-wrap;
          word-break: break-word;
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
          <div class="wordmark-badge">META HARNESS</div>
          <div class="title-meta">
            <h3 class="plugin-title">Meta Harness Fleet</h3>
            <p class="plugin-subtitle">Multi-agent runtime coordination, quotas & benchmarks</p>
          </div>
        </div>
        <div class="status-chip">
          ${installedAgents.length > 0 ? `${installedAgents.length} Agents Installed` : this.loadError ? 'Not Loaded' : 'Scanning Fleet'}
        </div>
      </div>

      ${this.loadError ? `
        <div class="inspector-panel" role="alert" style="flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
          <span style="font-size: 12px; color: var(--face-danger);">${escapeHtml(String(this.loadError).slice(0, 240))}</span>
          <button class="btn-action" id="btn-retry" type="button">Retry</button>
        </div>
      ` : ''}

      <div class="tabs-bar">
        <button class="tab-btn" data-active="${this.screen === 'fleet'}" data-screen="fleet" type="button">Fleet Roster</button>
        <button class="tab-btn" data-active="${this.screen === 'quotas'}" data-screen="quotas" type="button">Quotas & RAM</button>
        <button class="tab-btn" data-active="${this.screen === 'benchmarks'}" data-screen="benchmarks" type="button">Benchmarks</button>
        <button class="tab-btn" data-active="${this.screen === 'router'}" data-screen="router" type="button">Smart Router</button>
        <button class="tab-btn" data-active="${this.screen === 'threads'}" data-screen="threads" type="button">Threads & Review</button>
      </div>

      <div class="node-bar">
        <div class="node-toggles">
          ${(this.nodes.length > 0 ? this.nodes : [{ id: 'local', name: 'This Node' }]).map(node => `
            <button class="btn-node" data-active="${this.selectedNode === (node.id || node)}" type="button" data-node-id="${escapeHtml(node.id || node)}">
              ${escapeHtml(node.name || node.id || node)}
            </button>
          `).join('')}
        </div>
        <button class="btn-action" type="button" id="btn-docs" ${this.executing ? 'disabled' : ''}>
          ${this.executing ? 'Working...' : 'Sync Documentation'}
        </button>
      </div>

      ${this.screen === 'fleet' ? `
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
                  ${a.installed !== false ? `
                    <span class="badge-status ${a.authenticated === true ? 'badge-auth-ok' : 'badge-auth-needed'}">
                      ${a.blockedBy === 'no-chat-model' ? 'No chat model' : a.authenticated === true ? 'Signed in' : a.authenticated === false ? 'Sign-in needed' : 'Not probed'}
                    </span>
                  ` : ''}
                </div>
              </button>
            `).join('') : `
              <div class="empty-agents-box">${this.loadError ? 'The fleet could not be read.' : 'Scanning for terminal coding agents...'}</div>
            `}
          </div>

          <div class="inspector-panel">
            ${active ? `
              <h4 class="inspector-title">${escapeHtml(active.name || active.id)} Details</h4>
              <div class="property-grid">
                <div class="property-box">
                  <span class="property-label">Installed Version</span>
                  <span class="property-val">${escapeHtml(active.version || DASH)}</span>
                </div>
                <div class="property-box">
                  <span class="property-label">Account</span>
                  <span class="property-val">${active.authenticated === true ? 'Signed in' : active.authenticated === false ? 'Not signed in' : 'No login probe; a run proves it'}</span>
                </div>
                ${active.chatModels ? `
                  <div class="property-box">
                    <span class="property-label">Chat Models</span>
                    <span class="property-val">${escapeHtml(active.chatModels.join(', ') || 'None installed')}</span>
                  </div>
                ` : ''}
                <div class="property-box">
                  <span class="property-label">Fleet Documentation</span>
                  <span class="property-val" style="color: ${this.docsFresh ? 'var(--face-ok)' : 'var(--face-muted)'};">
                    ${this.docsFresh ? 'All sources current' : 'Some sources stale'}
                  </span>
                </div>
              </div>
              ${active.docs ? `<a class="property-label" href="${escapeHtml(active.docs)}" target="_blank" rel="noreferrer">Official documentation</a>` : ''}
            ` : `
              <div class="empty-agents-box">Select an agent from the fleet roster to inspect configuration.</div>
            `}
          </div>
        </div>
      ` : ''}

      ${this.screen === 'quotas' ? `
        <div class="table-panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>Harness / System</th>
                <th>Type</th>
                <th>Usage %</th>
                <th>5h Used</th>
                <th>Weekly Used</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${this.quotas?.system ? `
                <tr>
                  <td><strong>System Host Memory</strong></td>
                  <td>Hardware RAM</td>
                  <td>${this.quotas.system.memoryUtilizationPercent}%</td>
                  <td colspan="2">${this.quotas.system.freeMemGB} GB free / ${this.quotas.system.totalMemGB} GB total</td>
                  <td><span class="badge-status badge-online">Operational</span></td>
                </tr>
              ` : ''}
              ${this.quotas ? Object.entries(this.quotas).filter(([k]) => k !== 'system').map(([k, q]) => `
                <tr>
                  <td><strong>${escapeHtml(k.toUpperCase())}</strong></td>
                  <td>${escapeHtml(q.billingModel || (q.metered ? 'Metered Credits' : 'Subscription'))}</td>
                  <td>${typeof q.usagePercent === 'number' ? `${q.usagePercent}%` : DASH}</td>
                  <td>${typeof q.rolling5hUsedPercent === 'number' ? `${q.rolling5hUsedPercent}%` : DASH}</td>
                  <td>${typeof q.weeklyUsedPercent === 'number' ? `${q.weeklyUsedPercent}%` : DASH}</td>
                  <td title="${escapeHtml(q.quotaNote || '')}">
                    <span class="badge-status ${q.status === 'ready' ? 'badge-online' : (q.status === 'not_installed' ? 'badge-offline' : 'badge-auth-needed')}">
                      ${escapeHtml(q.status === 'exhausted' && q.resetsAt ? `exhausted until ${new Date(q.resetsAt).toLocaleString()}` : q.status)}
                    </span>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="6" style="text-align:center;">${this.loadError ? 'Not loaded.' : 'Loading quota telemetry...'}</td></tr>
              `}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${this.screen === 'benchmarks' ? `
        <div class="table-panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Harness</th>
                <th>Per 1M In / Out</th>
                <th>Intelligence</th>
                <th>Engineering</th>
                <th>SWE-bench Pro</th>
                <th>Terminal-Bench${this.benchmarks?.sources?.terminalBench?.benchmark ? ` ${escapeHtml(this.benchmarks.sources.terminalBench.benchmark)}` : ''}</th>
                <th>Harness Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              ${this.benchmarks ? (this.benchmarks.models || []).filter(m => !/-(low|medium)$/.test(m.id)).map(m => {
                const local = this.benchmarks.local?.[m.harness];
                return `
                  <tr>
                    <td><strong>${escapeHtml(m.name || m.id)}</strong></td>
                    <td>${escapeHtml(m.harness)}</td>
                    <td>${m.pricing ? `$${m.pricing.promptPer1M} / $${m.pricing.completionPer1M}` : DASH}</td>
                    <td>${m.intelligenceIndex ?? DASH}</td>
                    <td>${m.engineeringIndex ?? DASH}</td>
                    <td>${typeof m.sweBenchPro === 'number' ? `${m.sweBenchPro}%` : DASH}</td>
                    <td>${typeof m.terminalBench === 'number' ? `${m.terminalBench}%` : DASH}</td>
                    <td>${local ? `${local.passRate}% (${local.total} runs)` : DASH}</td>
                  </tr>
                `;
              }).join('') : `
                <tr><td colspan="7" style="text-align:center;">${this.loadError ? 'Not loaded.' : 'Loading catalog...'}</td></tr>
              `}
              ${this.benchmarks && !this.benchmarks.synced ? `
                <tr><td colspan="7" style="text-align:center;">${escapeHtml(this.benchmarks.note || 'Catalog not synced')}</td></tr>
              ` : ''}
            </tbody>
          </table>
          ${this.benchmarks?.sources ? `
            <div style="display:flex; flex-direction:column; gap:4px; padding:10px; font-size:11px; color:var(--face-muted);">
              ${Object.entries(this.benchmarks.sources).map(([name, s]) => `
                <span>${escapeHtml(name)}: ${s.ok ? `${s.count} rows, ${escapeHtml(new Date(s.fetchedAt).toLocaleString())}` : `unavailable (${escapeHtml(s.error || 'unknown error')})`}${s.attribution ? `. ${escapeHtml(s.attribution)}` : ''}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${this.screen === 'router' ? `
        <div class="router-panel">
          <div class="input-row">
            <input class="task-input" id="task-input" type="text" placeholder="Enter task to evaluate complexity and optimal harness..." value="${escapeHtml(this.routeInput)}" />
            <button class="btn-action" id="btn-route" type="button" ${this.executing ? 'disabled' : ''}>Evaluate Route</button>
          </div>

          ${this.routeResult ? `
            <div class="inspector-panel" style="background: rgba(30, 41, 59, 0.3);">
              <h4 class="inspector-title">${this.routeResult.selected ? `Route Recommendation: ${escapeHtml(this.routeResult.selected.toUpperCase())} (${escapeHtml(this.routeResult.tier?.toUpperCase())} TIER)` : escapeHtml(this.routeResult.error || 'No harness can take this task right now')}</h4>
              <div class="property-grid">
                <div class="property-box">
                  <span class="property-label">Complexity Score</span>
                  <span class="property-val">${this.routeResult.complexity?.score ?? DASH}/100</span>
                </div>
                <div class="property-box">
                  <span class="property-label">Active Factors</span>
                  <span class="property-val">${escapeHtml((this.routeResult.complexity?.factors || []).join(', ') || 'Standard task')}</span>
                </div>
                <div class="property-box">
                  <span class="property-label">Unavailable Now</span>
                  <span class="property-val">${escapeHtml((this.routeResult.excluded || []).map(e => `${e.harness}: ${e.reason}`).join('; ') || 'None')}</span>
                </div>
                <div class="property-box">
                  <span class="property-label">Warnings</span>
                  <span class="property-val">${escapeHtml((this.routeResult.warnings || []).join(' ') || 'None')}</span>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${this.screen === 'threads' ? `
        <div class="threads-grid">
          <div class="threads-list">
            ${this.threads.length > 0 ? this.threads.map(t => `
              <button class="thread-card-btn" data-selected="${t.id === (this.selectedThreadId || this.threads[0]?.id)}" type="button" data-thread-id="${escapeHtml(t.id)}">
                <div class="thread-title-text">${escapeHtml(t.title || t.id)}</div>
                <div class="thread-meta-row">
                  <span>${escapeHtml(t.branch || 'No branch')}</span>
                  <span class="badge-status ${t.status === 'closed' ? 'badge-offline' : 'badge-online'}">${escapeHtml(t.status || 'active')}</span>
                </div>
                <div class="thread-meta-row">
                  <span>Lead: ${escapeHtml(t.platform || DASH)}</span>
                  <span>${(t.turns || []).length} turns</span>
                </div>
              </button>
            `).join('') : `
              <div class="empty-agents-box">No persistent threads found. Create one with: total-recall meta-harness threads create</div>
            `}
          </div>

          <div class="thread-detail-panel">
            <div class="review-box">
              <h4 class="inspector-title" style="margin:0 0 6px 0;">Cross-Model Adversarial Code Review</h4>
              <p class="plugin-subtitle" style="margin:0 0 10px 0;">Audits branch diff against base using a strictly distinct model family to eliminate confirmation bias.</p>
              <div class="input-row">
                <input class="task-input" id="review-base-input" type="text" placeholder="Base branch (default: main)" value="${escapeHtml(this.reviewBase)}" />
                <button class="btn-action" id="btn-run-review" type="button" ${this.reviewing ? 'disabled' : ''}>
                  ${this.reviewing ? 'Auditing...' : 'Run Review'}
                </button>
              </div>

              ${this.reviewVerdict ? (() => {
                const result = this.reviewVerdict;
                const review = result.review;
                const verdict = review?.verdict || result.verdict || null;
                if (!verdict) return `<div style="margin-top: 10px; font-size: 11px; color: var(--face-danger);">${escapeHtml(result.error || 'The review did not complete.')}</div>`;
                const tone = verdict === 'APPROVE' ? 'pass' : verdict === 'REQUEST_CHANGES' ? 'fail' : 'caution';
                return `
                  <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                      <span class="verdict-badge verdict-${tone}">VERDICT: ${escapeHtml(verdict)}</span>
                      ${review ? `<span class="pill-permission pill-active">Reviewer: ${escapeHtml(review.reviewerName || review.reviewer)}</span>` : ''}
                    </div>
                    <div style="font-size: 11px;">${escapeHtml(review?.summary || result.summary || '')}</div>
                    ${review?.truncated ? `<div style="font-size: 11px; color: var(--face-danger);">The diff was too large to send whole; the reviewer was told to read the rest.</div>` : ''}
                    ${review?.findings?.length ? `
                      <div style="font-size: 11px; color: var(--face-danger);">
                        <strong>Findings:</strong>
                        <ul style="margin: 4px 0; padding-left: 18px;">
                          ${review.findings.map(f => `<li>${escapeHtml(f.severity || '')} ${escapeHtml(f.file || '')}: ${escapeHtml(f.issue || '')}</li>`).join('')}
                        </ul>
                      </div>
                    ` : ''}
                  </div>
                `;
              })() : ''}
            </div>

            ${(() => {
              const active = this.threads.find(t => t.id === this.selectedThreadId) || this.threads[0];
              if (!active) return '';
              return `
                <div class="inspector-panel" style="background: rgba(30, 41, 59, 0.3);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 class="inspector-title" style="margin: 0;">${escapeHtml(active.title)}</h4>
                    <span class="agent-version">Thread ID: ${escapeHtml(active.id)}</span>
                  </div>
                  <div class="turns-log">
                    ${(active.turns && active.turns.length > 0) ? active.turns.map(turn => `
                      <div class="turn-box">
                        <div class="turn-header">
                          <span>${escapeHtml(turn.role || 'Agent')} &bull; ${escapeHtml(turn.agent || '')}</span>
                          <span>${new Date(turn.timestamp || Date.now()).toLocaleTimeString()}</span>
                        </div>
                        <div class="turn-content">${escapeHtml(turn.content)}</div>
                      </div>
                    `).join('') : `
                      <div style="font-size: 11px; color: var(--face-muted);">No turns recorded in this thread yet.</div>
                    `}
                  </div>
                </div>
              `;
            })()}
          </div>
        </div>
      ` : ''}

      <div class="footer-bar">
        <span>Target: ${this.selectedNode.toUpperCase()} MESH NODE</span>
        <span>${this.agents.filter(a => a.authenticated === true).length} signed in, ${this.agents.filter(a => a.authenticated === 'unknown').length} not probed</span>
      </div>
    `;

    // Event listeners
    root.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.getAttribute('data-screen');
        if (screen) this.setScreen(screen);
      });
    });

    root.querySelectorAll('.btn-node').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-node-id');
        if (id) this.switchNode(id);
      });
    });

    root.querySelectorAll('.agent-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-agent-id');
        if (id) this.selectAgent(id);
      });
    });

    root.querySelector('#btn-docs')?.addEventListener('click', () => this.refreshDocs());
    root.querySelector('#btn-retry')?.addEventListener('click', () => this.retry());

    const taskInput = root.querySelector('#task-input');
    if (taskInput) {
      taskInput.addEventListener('input', (e) => {
        this.routeInput = e.target.value;
      });
    }

    root.querySelector('#btn-route')?.addEventListener('click', () => {
      if (this.routeInput) this.executeRoute(this.routeInput);
    });

    root.querySelectorAll('.thread-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-thread-id');
        if (id) this.selectThread(id);
      });
    });

    const reviewBaseInput = root.querySelector('#review-base-input');
    if (reviewBaseInput) {
      reviewBaseInput.addEventListener('input', (e) => {
        this.reviewBase = e.target.value;
      });
    }

    root.querySelector('#btn-run-review')?.addEventListener('click', () => {
      this.executeReview(this.reviewBase);
    });
  }
}

if (!customElements.get('meta-harness-card')) {
  customElements.define('meta-harness-card', CommandFleetCard);
}
if (!customElements.get('command-fleet-card')) {
  customElements.define('command-fleet-card', class extends CommandFleetCard {});
}
