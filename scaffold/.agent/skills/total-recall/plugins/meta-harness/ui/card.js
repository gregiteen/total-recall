/**
 * Meta Harness — Multi-Agent Coordination & Inspection Console
 *
 * Bespoke operator interface for terminal coding agent fleet management.
 * Displays real-time agent discovery matrix, mesh node targets, authentication
 * postures, quotas/RAM, SWE-bench/Terminal-Bench benchmarks, and RouteLLM router.
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
    this.screen = 'fleet'; // 'fleet' | 'router' | 'quotas' | 'benchmarks'
    this.quotas = null;
    this.benchmarks = null;
    this.routeResult = null;
    this.routeInput = '';
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

      this.render();
    } catch {
      this.agents = [];
      this.render();
    }
  }

  async refreshQuotas() {
    if (!this.host) return;
    try {
      const res = await this.host.run('quota', ['--node', this.selectedNode, '--json']);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      this.quotas = parsed?.quotas || null;
      this.render();
    } catch {
      this.quotas = null;
      this.render();
    }
  }

  async refreshBenchmarks() {
    if (!this.host) return;
    try {
      const res = await this.host.run('benchmarks', ['--json']);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      this.benchmarks = parsed?.matrix || null;
      this.render();
    } catch {
      this.benchmarks = null;
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
          ${installedAgents.length > 0 ? `${installedAgents.length} Agents Discovered` : 'Scanning Fleet'}
        </div>
      </div>

      <div class="tabs-bar">
        <button class="tab-btn" data-active="${this.screen === 'fleet'}" data-screen="fleet" type="button">Fleet Roster</button>
        <button class="tab-btn" data-active="${this.screen === 'quotas'}" data-screen="quotas" type="button">Quotas & RAM</button>
        <button class="tab-btn" data-active="${this.screen === 'benchmarks'}" data-screen="benchmarks" type="button">Benchmarks</button>
        <button class="tab-btn" data-active="${this.screen === 'router'}" data-screen="router" type="button">Smart Router</button>
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
                  <span class="property-val" style="color: ${this.docsFresh ? 'var(--face-ok)' : 'var(--face-muted)'};">
                    ${this.docsFresh ? 'Verified Fresh' : 'Documentation Checked'}
                  </span>
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
      ` : ''}

      ${this.screen === 'quotas' ? `
        <div class="table-panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>Harness / System</th>
                <th>Type</th>
                <th>Usage %</th>
                <th>5h Rolling Left</th>
                <th>Weekly Left</th>
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
                  <td>${typeof q.rolling5hRemainingPercent === 'number' ? `${q.rolling5hRemainingPercent}%` : DASH}</td>
                  <td>${typeof q.weeklyRemainingPercent === 'number' ? `${q.weeklyRemainingPercent}%` : (q.quotaNote ? escapeHtml(q.quotaNote) : DASH)}</td>
                  <td>
                    <span class="badge-status ${q.status === 'optimal' || q.status === 'ready' ? 'badge-online' : (q.status === 'not_installed' ? 'badge-offline' : 'badge-auth-needed')}">
                      ${escapeHtml(q.status)}
                    </span>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="6" style="text-align:center;">Loading quota telemetry...</td></tr>
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
                <th>Harness</th>
                <th>Provider</th>
                <th>SWE-bench Pro</th>
                <th>Terminal-Bench 2</th>
                <th>ELO Rating</th>
                <th>Local Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              ${this.benchmarks ? Object.entries(this.benchmarks).map(([k, b]) => `
                <tr>
                  <td><strong>${escapeHtml(k.toUpperCase())}</strong></td>
                  <td>${escapeHtml(b.provider)}</td>
                  <td>${typeof b.sweBenchPro === 'number' ? `${b.sweBenchPro}%` : DASH}</td>
                  <td>${typeof b.terminalBench2 === 'number' ? `${b.terminalBench2}%` : DASH}</td>
                  <td>${typeof b.artificialAnalysisElo === 'number' ? b.artificialAnalysisElo : DASH}</td>
                  <td>${b.localPassRatePercent !== null ? `${b.localPassRatePercent}% (${b.localRuns} runs)` : DASH}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="6" style="text-align:center;">Loading benchmark matrix...</td></tr>
              `}
            </tbody>
          </table>
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
              <h4 class="inspector-title">Route Recommendation: ${escapeHtml(this.routeResult.selected?.toUpperCase())} (${escapeHtml(this.routeResult.tier?.toUpperCase())} TIER)</h4>
              <div class="property-grid">
                <div class="property-box">
                  <span class="property-label">Complexity Score</span>
                  <span class="property-val">${this.routeResult.complexity?.score}/100</span>
                </div>
                <div class="property-box">
                  <span class="property-label">Active Factors</span>
                  <span class="property-val">${(this.routeResult.complexity?.factors || []).join(', ') || 'Standard task'}</span>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="footer-bar">
        <span>Target: ${this.selectedNode.toUpperCase()} MESH NODE</span>
        <span>Fleet Version: v0.3.0</span>
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

    const taskInput = root.querySelector('#task-input');
    if (taskInput) {
      taskInput.addEventListener('input', (e) => {
        this.routeInput = e.target.value;
      });
    }

    root.querySelector('#btn-route')?.addEventListener('click', () => {
      if (this.routeInput) this.executeRoute(this.routeInput);
    });
  }
}

if (!customElements.get('meta-harness-card')) {
  customElements.define('meta-harness-card', CommandFleetCard);
}
if (!customElements.get('command-fleet-card')) {
  customElements.define('command-fleet-card', CommandFleetCard);
}
