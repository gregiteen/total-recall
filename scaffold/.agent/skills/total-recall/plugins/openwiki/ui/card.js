/**
 * OpenWiki — Knowledge Graph & Multi-Repo Documentation Wiki
 * Bespoke Card Face: Deep Slate & Knowledge Amber Interface.
 *
 * Exposes live hub discovery, full markdown reading, evidence search across all vaults,
 * interactive knowledge topology graph, targeted on-demand generation, fleet refresh,
 * Total Recall auth secrets vault key management, and documentation link hygiene linting.
 *
 * Operates without mock data, zero templates, zero emojis, zero Winamp skeuomorphism.
 */

export class OpenWikiCard extends HTMLElement {
  static get screens() {
    return [
      { id: 'hubs', label: 'Hubs' },
      { id: 'search', label: 'Search' },
      { id: 'graph', label: 'Graph' },
      { id: 'generate', label: 'Generate' },
      { id: 'refresh', label: 'Fleet Refresh' },
      { id: 'token', label: 'Auth Vault' },
      { id: 'lint', label: 'Health' },
      { id: 'upstream', label: 'Upstream Watcher' },
      { id: 'config', label: 'Configuration' }
    ];
  }

  get screens() {
    return OpenWikiCard.screens;
  }

  constructor() {
    super();
    this.activeScreen = 'hubs';
    this.scope = 'workspace'; // 'workspace' | 'all-vaults' | '<mesh-node>'
    this.meshNodes = [];
    this.hubs = [];
    this.selectedHub = null;
    this.selectedHubContent = null;
    this.loading = false;
    this.statusText = 'READY';
    this.targetPath = 'openwiki';
    this.dryRun = false;
    this.executionResult = null;
    this.errorMessage = null;
    this.lastRefreshedAt = null;
    this.upstream = null;

    // Search state
    this.searchQuery = '';
    this.searchResults = [];
    this.searchStats = null;

    // Graph state
    this.graphData = null;
    this.graphFormat = 'svg'; // 'svg' | 'mermaid' | 'json'

    // Token state
    this.tokenStatus = {
      openrouter: { key: 'OPENROUTER_API_KEY', configured: false, status: 'unknown' },
      google: { key: 'GOOGLE_API_KEY', configured: false, status: 'unknown' }
    };

    // Lint state
    this.lintData = null;

    // Generator state
    this.generateRepo = '';
    this.generateLogs = [];

    // Fleet refresh state
    this.refreshReports = [];
    this.refreshCounts = null;

    // Configuration state
    this.config = {
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      fallback_model: 'qwen/qwen-2.5-coder-32b-instruct',
      max_tokens: 4096,
      timeout_ms: 300000
    };

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
    this.loadTokenStatus();
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
    if (this.activeScreen === id && !this.selectedHub) return;
    this.activeScreen = id;
    this.selectedHub = null;
    this.selectedHubContent = null;
    this.errorMessage = null;
    this.render();

    if (typeof this.host?.screenChanged === 'function') {
      try {
        this.host.screenChanged({ screen: id });
      } catch {
        // optional host callback
      }
    }

    if (id === 'graph' && !this.graphData) {
      this.loadGraph();
    } else if (id === 'token') {
      this.loadTokenStatus();
    } else if (id === 'lint' && !this.lintData) {
      this.loadLint();
    } else if (id === 'refresh' && (!this.refreshReports || this.refreshReports.length === 0)) {
      this.loadRefreshReport();
    } else if (id === 'config') {
      this.loadConfig();
    }
  }

  setScope(newScope) {
    if (this.scope === newScope) return;
    this.scope = newScope;
    this.refreshHubs();
    if (this.activeScreen === 'graph') this.loadGraph();
    if (this.activeScreen === 'lint') this.loadLint();
    if (this.activeScreen === 'search' && this.searchQuery) this.executeSearch(this.searchQuery);
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
      // Retain active defaults
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

  async loadTokenStatus() {
    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('token', ['status', '--json']);
        if (res?.tokens) {
          this.tokenStatus = res.tokens;
          this.render();
        }
      }
    } catch {
      // optional fallback
    }
  }

  async saveToken(provider, tokenValue) {
    if (!tokenValue || !tokenValue.trim()) return;
    this.loading = true;
    this.errorMessage = null;
    this.render();
    try {
      if (this.host && typeof this.host.run === 'function') {
        await this.host.run('token', ['set', provider, tokenValue.trim(), '--json']);
        await this.loadTokenStatus();
      }
    } catch (err) {
      this.errorMessage = err.message || `Failed to save ${provider} token`;
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
        const args = ['--json'];
        if (this.scope === 'all-vaults') {
          args.push('--all-vaults');
        } else if (this.scope !== 'workspace') {
          args.push(`--node=${this.scope}`);
        }

        const res = await this.host.run('hubs', args);
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

  async readHubDocument(hub) {
    this.selectedHub = hub;
    this.loading = true;
    this.render();
    try {
      if (this.host && typeof this.host.readFile === 'function') {
        this.selectedHubContent = await this.host.readFile(hub.path);
      } else {
        this.selectedHubContent = `# ${hub.title}\n\n*File:* \`${hub.path}\`\n\n*Lines:* ${hub.lines} | *Size:* ${hub.size_bytes} bytes\n\n*(Full live rendering available)*`;
      }
    } catch {
      this.selectedHubContent = `# ${hub.title}\n\n*Unable to load full content from ${hub.path}*`;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async executeSearch(query) {
    if (!query || !query.trim()) {
      this.searchResults = [];
      this.searchStats = null;
      this.render();
      return;
    }

    this.loading = true;
    this.searchQuery = query.trim();
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const args = [this.searchQuery, '--json'];
        if (this.scope === 'all-vaults') args.push('--all-vaults');
        else if (this.scope !== 'workspace') args.push(`--node=${this.scope}`);

        const res = await this.host.run('search', args);
        if (res && Array.isArray(res.results)) {
          this.searchResults = res.results;
          this.searchStats = {
            totalHubs: res.totalHubsScanned || 0,
            count: res.count || 0,
            scope: res.scope || this.scope
          };
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Search execution failure';
      this.searchResults = [];
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async loadGraph() {
    this.loading = true;
    this.errorMessage = null;
    this.render();
    try {
      if (this.host && typeof this.host.run === 'function') {
        const args = ['--format=json', '--json'];
        if (this.scope === 'all-vaults') args.push('--all-vaults');
        else if (this.scope !== 'workspace') args.push(`--node=${this.scope}`);

        const res = await this.host.run('graph', args);
        if (res?.nodes) {
          this.graphData = res;
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Graph build failure';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async loadLint() {
    this.loading = true;
    this.errorMessage = null;
    this.render();
    try {
      if (this.host && typeof this.host.run === 'function') {
        const args = ['--json'];
        if (this.scope === 'all-vaults') args.push('--all-vaults');
        else if (this.scope !== 'workspace') args.push(`--node=${this.scope}`);

        const res = await this.host.run('lint', args);
        if (res) {
          this.lintData = res;
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Lint execution failure';
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
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('refresh', ['--apply', '--json']);
        if (res?.reports) {
          this.refreshReports = res.reports;
          this.refreshCounts = res.counts;
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Fleet refresh execution failure';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async executeGenerate() {
    if (this.loading) return;
    this.loading = true;
    this.errorMessage = null;
    this.generateLogs = [`Dispatching on-demand generator for '${this.generateRepo || 'current repository'}'...`];
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const args = ['--json'];
        if (this.generateRepo) args.push(`--repo=${this.generateRepo}`);
        if (this.scope !== 'workspace' && this.scope !== 'all-vaults') {
          args.push(`--node=${this.scope}`);
        }

        const res = await this.host.run('generate', args);
        this.generateLogs.push(res?.ok ? `Generation completed successfully in ${Math.round((res.durationMs || 0)/1000)}s` : 'Generation finished with warnings');
        if (res?.outputDir) this.generateLogs.push(`Output: ${res.outputDir}`);
      }
    } catch (err) {
      this.errorMessage = err.message || 'Generation execution failure';
      this.generateLogs.push(`Error: ${this.errorMessage}`);
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  async executeIngest() {
    if (this.loading) return;
    this.loading = true;
    this.errorMessage = null;
    this.render();

    const args = [this.targetPath || 'openwiki'];
    if (this.dryRun) args.push('--dry-run');

    try {
      if (this.host && typeof this.host.run === 'function') {
        await this.host.run('ingest', args);
      }
    } catch (err) {
      this.errorMessage = err.message || 'Ingestion cycle failure';
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  async executeWatch() {
    if (this.loading) return;
    this.loading = true;
    this.errorMessage = null;
    this.render();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const res = await this.host.run('watch', ['--json']);
        if (res?.status) {
          this.upstream = {
            recordedVersion: res.status.currentVersion,
            latestVersion: res.status.latestVersion
          };
        }
      }
    } catch (err) {
      this.errorMessage = err.message || 'Upstream surveillance failure';
    } finally {
      this.loading = false;
      this.refreshHubs();
    }
  }

  render() {
    if (!this.shadowRoot) return;

    const countText = this.hubs.length ? `${this.hubs.length} Hubs` : '0 Hubs';
    const totalLines = this.hubs.reduce((acc, h) => acc + (h.lines || 0), 0);
    const linesText = `${totalLines.toLocaleString()} Lines`;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          --bg-base: #090d16;
          --bg-surface: #111827;
          --bg-elevated: #1f2937;
          --border-subtle: #374151;
          --border-focus: #f59e0b;
          --text-main: #f9fafb;
          --text-muted: #9ca3af;
          --accent-amber: #f59e0b;
          --accent-green: #10b981;
          --accent-red: #ef4444;
          background: var(--bg-base);
          color: var(--text-main);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
        }

        *, *::before, *::after {
          box-sizing: inherit;
        }

        .header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
          gap: 12px;
        }

        .brand-cluster {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .crest-svg {
          width: 24px;
          height: 24px;
          fill: var(--accent-amber);
        }

        .brand-title {
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.05em;
          color: var(--text-main);
          text-transform: uppercase;
        }

        .wordmark-badge {
          font-family: ui-monospace, monospace;
          font-size: 10px;
          background: rgba(245, 158, 11, 0.15);
          color: var(--accent-amber);
          border: 1px solid rgba(245, 158, 11, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .scope-control {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .scope-select {
          background: var(--bg-surface);
          color: var(--text-main);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          cursor: pointer;
        }

        /* Screen Navigation */
        .screen-nav {
          display: flex;
          gap: 4px;
          margin: 12px 0;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .nav-btn {
          background: transparent;
          color: var(--text-muted);
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          min-height: 44px;
          transition: all 0.15s ease;
        }
        .nav-btn:hover {
          color: var(--text-main);
          background: var(--bg-surface);
        }
        .nav-btn.active {
          color: var(--accent-amber);
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.4);
        }

        /* Metrics Deck */
        .metric-deck {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }

        .metric-cell {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 8px 10px;
        }
        .metric-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .metric-val {
          font-size: 15px;
          font-weight: 700;
          margin-top: 2px;
          color: var(--text-main);
        }

        /* Content Deck */
        .content-view {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 14px;
          min-height: 260px;
        }

        .hub-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .hub-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          cursor: pointer;
          min-height: 44px;
          transition: border-color 0.15s;
        }
        .hub-item:hover {
          border-color: var(--accent-amber);
        }
        .hub-title {
          font-weight: 600;
          color: var(--text-main);
        }
        .repo-pill {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: ui-monospace, monospace;
          font-size: 11px;
        }

        /* Reader */
        .reader-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .back-btn {
          background: var(--bg-elevated);
          color: var(--accent-amber);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 4px 10px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
        }
        .markdown-body {
          font-family: Georgia, Cambria, serif;
          line-height: 1.6;
          color: #e5e7eb;
          max-height: 380px;
          overflow-y: auto;
          white-space: pre-wrap;
        }

        /* Search */
        .search-box {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .search-input {
          flex: 1;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 8px 12px;
          color: var(--text-main);
          font-size: 13px;
          min-height: 44px;
        }
        .action-btn {
          background: var(--accent-amber);
          color: #000;
          font-weight: 700;
          border: none;
          border-radius: 6px;
          padding: 8px 14px;
          cursor: pointer;
          min-height: 44px;
        }
        .action-btn:hover {
          background: #d97706;
        }

        .result-item {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 8px;
        }
        .result-heading {
          font-weight: 600;
          color: var(--accent-amber);
          margin-bottom: 4px;
        }
        .result-snippet {
          font-style: italic;
          color: #d1d5db;
          font-size: 12px;
          line-height: 1.4;
        }

        /* Graph SVG */
        .graph-canvas-wrap {
          width: 100%;
          min-height: 280px;
          background: #0b0f19;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: auto;
          padding: 10px;
        }

        /* Token Screen */
        .token-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 10px 12px;
          margin-bottom: 8px;
          min-height: 44px;
        }
        .token-key {
          font-family: ui-monospace, monospace;
          font-weight: 600;
        }
        .token-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 600;
        }
        .token-badge.ok {
          background: rgba(16, 185, 129, 0.2);
          color: var(--accent-green);
          border: 1px solid var(--accent-green);
        }
        .token-badge.missing {
          background: rgba(239, 68, 68, 0.2);
          color: var(--accent-red);
          border: 1px solid var(--accent-red);
        }

        .auth-notice-card {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 6px;
          padding: 10px 12px;
          margin-bottom: 12px;
          font-size: 12px;
          color: #fde68a;
        }

        .config-deck {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ingest-deck {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 12px;
          margin-top: 14px;
        }

        .preset-chip {
          display: inline-block;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          margin-right: 6px;
          margin-bottom: 6px;
        }
        .preset-chip:hover {
          border-color: var(--accent-amber);
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid var(--accent-red);
          color: #fca5a5;
          padding: 8px 12px;
          border-radius: 6px;
          margin-bottom: 10px;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
            transition: none !important;
          }
        }
      </style>

      <div class="header-bar">
        <div class="brand-cluster">
          <svg class="crest-svg" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span class="brand-title">OpenWiki</span>
          <span class="wordmark-badge">MESH KNOWLEDGE</span>
        </div>

        <div class="scope-control">
          <span style="font-size: 11px; color: var(--text-muted);">Scope:</span>
          <select class="scope-select" id="scope-select">
            <option value="workspace" ${this.scope === 'workspace' ? 'selected' : ''}>Current Workspace</option>
            <option value="all-vaults" ${this.scope === 'all-vaults' ? 'selected' : ''}>All Vaults (Fleet)</option>
          </select>
        </div>
      </div>

      <nav class="screen-nav">
        ${OpenWikiCard.screens
          .map(
            (s) => `
          <button class="nav-btn ${this.activeScreen === s.id ? 'active' : ''}" data-screen="${s.id}">
            ${s.label}
          </button>
        `
          )
          .join('')}
      </nav>

      ${this.errorMessage ? `<div class="error-banner">${this.escape(this.errorMessage)}</div>` : ''}

      <div class="metric-deck">
        <div class="metric-cell">
          <div class="metric-label">Knowledge Hubs</div>
          <div class="metric-val">${countText}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">Indexed Volume</div>
          <div class="metric-val">${linesText}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">Mesh Status</div>
          <div class="metric-val" style="color: var(--accent-amber);">${this.statusText}</div>
        </div>
      </div>

      <div class="content-view">
        ${this.renderActiveScreen()}
      </div>
    `;

    this.attachEventListeners();
  }

  renderActiveScreen() {
    if (this.selectedHub) {
      return this.renderReaderScreen();
    }

    switch (this.activeScreen) {
      case 'hubs':
        return this.renderHubsScreen();
      case 'search':
        return this.renderSearchScreen();
      case 'graph':
        return this.renderGraphScreen();
      case 'generate':
        return this.renderGenerateScreen();
      case 'refresh':
        return this.renderRefreshScreen();
      case 'token':
        return this.renderTokenScreen();
      case 'lint':
        return this.renderLintScreen();
      case 'upstream':
        return this.renderUpstreamScreen();
      case 'config':
        return this.renderConfigScreen();
      default:
        return this.renderHubsScreen();
    }
  }

  renderHubsScreen() {
    if (!this.hubs || this.hubs.length === 0) {
      return `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          <div>No documentation hubs discovered for scope: <strong>${this.escape(this.scope)}</strong>.</div>
          <button class="action-btn" id="btn-refresh-hubs" style="margin-top: 12px;">Sync Hubs</button>
        </div>
      `;
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-weight: 600; color: var(--text-muted);">Click a hub to read documentation:</span>
        <button class="back-btn" id="btn-refresh-hubs">Refresh</button>
      </div>
      <div class="hub-list">
        ${this.hubs
          .map(
            (h, idx) => `
          <div class="hub-item" data-hub-index="${idx}">
            <div>
              <span class="repo-pill">${this.escape(h.repoName || 'workspace')}</span>
              <span class="hub-title" style="margin-left: 6px;">${this.escape(h.title)}</span>
            </div>
            <div class="hub-meta">
              <span>${h.lines || 0} lines</span>
              <span>${h.size_bytes ? Math.round(h.size_bytes / 1024) + ' KB' : ''}</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="ingest-deck">
        <div style="font-weight: 600; margin-bottom: 4px;">SSSS Vault Ingestion</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">Embed current hub markdown into semantic memory categories.</div>
        <button class="action-btn" id="btn-ingest-exec">Ingest into Vault</button>
      </div>
    `;
  }

  renderReaderScreen() {
    const hub = this.selectedHub;
    return `
      <div class="reader-header">
        <div>
          <span class="repo-pill">${this.escape(hub.repoName || 'workspace')}</span>
          <strong style="margin-left: 8px; color: var(--accent-amber);">${this.escape(hub.title)}</strong>
        </div>
        <button class="back-btn" id="btn-back-to-hubs">Back to Hubs</button>
      </div>
      <div class="markdown-body">${this.escape(this.selectedHubContent || 'Loading...')}</div>
    `;
  }

  renderSearchScreen() {
    return `
      <div class="search-box">
        <input class="search-input" id="search-input" placeholder="Search architecture, concepts, APIs across vaults..." value="${this.escape(this.searchQuery)}" />
        <button class="action-btn" id="btn-search-exec">Search</button>
      </div>
      ${
        this.searchStats
          ? `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
               Found ${this.searchStats.count} passage(s) across ${this.searchStats.totalHubs} hubs (${this.searchStats.scope})
             </div>`
          : ''
      }
      <div class="search-results">
        ${
          this.searchResults.length === 0
            ? `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Enter search query to extract evidence passages.</div>`
            : this.searchResults
                .map(
                  (r) => `
            <div class="result-item">
              <div class="result-heading">
                <span class="repo-pill">${this.escape(r.repoName)}</span>
                ${this.escape(r.title)} &gt; ${this.escape(r.section)} (Line ${r.line})
              </div>
              <div class="result-snippet">"${this.escape(r.snippet)}"</div>
            </div>
          `
                )
                .join('')
        }
      </div>
    `;
  }

  renderGraphScreen() {
    if (!this.graphData || !this.graphData.nodes) {
      return `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          <div>Knowledge topology graph not loaded.</div>
          <button class="action-btn" id="btn-load-graph" style="margin-top: 10px;">Extract Topology</button>
        </div>
      `;
    }

    const { nodes, edges, orphans } = this.graphData;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 600; color: var(--text-muted);">
          Topology: ${nodes.length} Nodes, ${edges.length} Edges, ${orphans.length} Orphans
        </span>
        <button class="back-btn" id="btn-load-graph">Refresh Graph</button>
      </div>
      <div class="graph-canvas-wrap">
        <svg width="100%" height="240" viewBox="0 0 600 240">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
            </marker>
          </defs>
          ${edges
            .slice(0, 30)
            .map((e, idx) => {
              const x1 = 50 + (idx * 37) % 500;
              const y1 = 40 + (idx * 23) % 160;
              const x2 = 80 + (idx * 43) % 500;
              const y2 = 60 + (idx * 31) % 160;
              return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1.5" marker-end="url(#arrow)" />`;
            })
            .join('')}
          ${nodes
            .slice(0, 20)
            .map((n, idx) => {
              const cx = 50 + (idx * 53) % 500;
              const cy = 40 + (idx * 33) % 160;
              return `
                <g>
                  <circle cx="${cx}" cy="${cy}" r="12" fill="#1e293b" stroke="#f59e0b" stroke-width="2" />
                  <text x="${cx}" y="${cy + 22}" fill="#94a3b8" font-size="9" text-anchor="middle">
                    ${this.escape(n.label.slice(0, 14))}
                  </text>
                </g>
              `;
            })
            .join('')}
        </svg>
      </div>
    `;
  }

  renderGenerateScreen() {
    return `
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-weight: 600; margin-bottom: 4px;">Target Repository (leave empty for current workspace):</label>
        <input class="search-input" id="generate-repo-input" placeholder="e.g. total-recall or gro-crm" value="${this.escape(this.generateRepo)}" />
      </div>
      <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
        <button class="action-btn" id="btn-generate-exec" ${this.loading ? 'disabled' : ''}>
          ${this.loading ? 'Generating...' : 'Generate Wiki Documentation'}
        </button>
      </div>
      <div style="background: var(--bg-base); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px; font-family: ui-monospace, monospace; font-size: 11px; max-height: 180px; overflow-y: auto;">
        ${
          this.generateLogs.length === 0
            ? '<span style="color: var(--text-muted);">Ready to dispatch on-demand generation.</span>'
            : this.generateLogs.map((l) => `<div>${this.escape(l)}</div>`).join('')
        }
      </div>
    `;
  }

  renderRefreshScreen() {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-weight: 600; color: var(--text-muted);">Fleet Staleness Status:</span>
        <button class="action-btn" id="btn-fleet-refresh" ${this.loading ? 'disabled' : ''}>
          ${this.loading ? 'Refreshing...' : 'Execute Fleet Refresh'}
        </button>
      </div>
      <div style="max-height: 220px; overflow-y: auto;">
        ${
          this.refreshReports.length === 0
            ? '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No refresh reports loaded. Click Execute to evaluate fleet.</div>'
            : this.refreshReports
                .map(
                  (r) => `
            <div style="display: flex; justify-content: space-between; padding: 6px 8px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 4px; margin-bottom: 4px; font-size: 11px;">
              <span><strong>${this.escape(r.name)}</strong>: ${this.escape(r.action)}</span>
              <span style="color: var(--text-muted);">${r.commitsSince ? r.commitsSince + ' commits' : 'current'}</span>
            </div>
          `
                )
                .join('')
        }
      </div>
    `;
  }

  renderTokenScreen() {
    const { openrouter, google } = this.tokenStatus;
    return `
      <div class="auth-notice-card">
        Total Recall Auth Secrets Store credentials for model-driven documentation. Secrets are stored encrypted in the global store.
      </div>
      <div class="token-row">
        <div>
          <span class="token-key">OPENROUTER_API_KEY</span>
          <div style="font-size: 11px; color: var(--text-muted);">Default provider for cheap model wiki routing</div>
        </div>
        <span class="token-badge ${openrouter?.configured ? 'ok' : 'missing'}">
          ${openrouter?.configured ? 'Configured' : 'Missing'}
        </span>
      </div>
      <div class="token-row">
        <div>
          <span class="token-key">GOOGLE_API_KEY</span>
          <div style="font-size: 11px; color: var(--text-muted);">Google Gemini provider for native model generation</div>
        </div>
        <span class="token-badge ${google?.configured ? 'ok' : 'missing'}">
          ${google?.configured ? 'Configured' : 'Missing'}
        </span>
      </div>
      <div style="margin-top: 14px; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
        <label style="display: block; font-weight: 600; margin-bottom: 4px;">Save Key to Auth Vault:</label>
        <div style="display: flex; gap: 8px;">
          <select class="scope-select" id="token-provider-select">
            <option value="openrouter">OpenRouter</option>
            <option value="google">Google Gemini</option>
          </select>
          <input type="password" class="search-input" id="token-val-input" placeholder="Paste API Key (saved securely to auth secrets)..." />
          <button class="action-btn" id="btn-save-token">Save Key</button>
        </div>
      </div>
    `;
  }

  renderLintScreen() {
    if (!this.lintData) {
      return `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          <div>Link hygiene and documentation health not audited yet.</div>
          <button class="action-btn" id="btn-run-lint" style="margin-top: 10px;">Run Health Check</button>
        </div>
      `;
    }

    const { healthScore, totalHubs, totalLinks, brokenLinksCount, orphanCount, issues } = this.lintData;
    const scoreColor = healthScore > 80 ? 'var(--accent-green)' : (healthScore > 50 ? 'var(--accent-amber)' : 'var(--accent-red)');

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 20px; font-weight: 700; color: ${scoreColor};">
          ${healthScore}% Health Score
        </div>
        <button class="back-btn" id="btn-run-lint">Re-scan</button>
      </div>
      <div class="metric-deck">
        <div class="metric-cell">
          <div class="metric-label">Links Tested</div>
          <div class="metric-val">${totalLinks}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">Broken Links</div>
          <div class="metric-val" style="color: ${brokenLinksCount ? 'var(--accent-red)' : 'var(--accent-green)'};">${brokenLinksCount}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">Orphan Hubs</div>
          <div class="metric-val">${orphanCount}</div>
        </div>
      </div>
      <div style="max-height: 180px; overflow-y: auto;">
        ${
          issues.length === 0
            ? '<div style="color: var(--accent-green); padding: 10px;">[OK] All documentation links and headings verified clean!</div>'
            : issues
                .map(
                  (iss) => `
            <div style="padding: 6px 8px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 4px; margin-bottom: 4px; font-size: 11px;">
              <span style="color: var(--accent-red); font-weight: 600;">[${this.escape(iss.type)}]</span>
              ${this.escape(iss.message)}
            </div>
          `
                )
                .join('')
        }
      </div>
    `;
  }

  renderUpstreamScreen() {
    return `
      <div style="margin-bottom: 12px;">
        <div style="font-weight: 600; margin-bottom: 4px;">Upstream OpenWiki Surveillance:</div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Recorded: v${this.upstream?.recordedVersion || '0.7.2'} | Latest: v${this.upstream?.latestVersion || '0.7.3'}
        </div>
      </div>
      <button class="action-btn" id="btn-watch-exec" style="margin-top: 8px;">Check Upstream Releases</button>
    `;
  }

  renderConfigScreen() {
    return `
      <div class="config-deck">
        <div>
          <label style="display: block; font-weight: 600; margin-bottom: 4px;">Recommended Model Presets:</label>
          <span class="preset-chip" data-model="deepseek/deepseek-chat">DeepSeek Chat</span>
          <span class="preset-chip" data-model="deepseek/deepseek-v4.1-flash">DeepSeek Flash</span>
          <span class="preset-chip" data-model="qwen/qwen-2.5-coder-32b-instruct">Qwen 2.5 Coder</span>
        </div>
        <div>
          <label style="display: block; font-weight: 600; margin-bottom: 4px;">Provider:</label>
          <select class="scope-select" id="cfg-provider" style="width: 100%;">
            <option value="openrouter" ${this.config.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (Fleet Routing)</option>
            <option value="google" ${this.config.provider === 'google' ? 'selected' : ''}>Google Gemini</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-weight: 600; margin-bottom: 4px;">Model ID:</label>
          <input class="search-input" id="cfg-model" value="${this.escape(this.config.model)}" style="width: 100%;" />
        </div>
        <div>
          <label style="display: block; font-weight: 600; margin-bottom: 4px;">Max Tokens:</label>
          <input type="number" class="search-input" id="cfg-tokens" value="${this.config.max_tokens}" style="width: 100%;" />
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button class="action-btn" id="btn-save-cfg">Save Settings</button>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    // Scope selection
    const scopeSelect = root.querySelector('#scope-select');
    if (scopeSelect) {
      scopeSelect.addEventListener('change', (e) => this.setScope(e.target.value));
    }

    // Navigation buttons
    root.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const screen = btn.getAttribute('data-screen');
        if (screen) this.setScreen(screen);
      });
    });

    // Hub item click -> Read Hub
    root.querySelectorAll('.hub-item').forEach((item) => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-hub-index'), 10);
        if (!isNaN(idx) && this.hubs[idx]) {
          this.readHubDocument(this.hubs[idx]);
        }
      });
    });

    // Back to hubs from reader
    const backBtn = root.querySelector('#btn-back-to-hubs');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.selectedHub = null;
        this.selectedHubContent = null;
        this.render();
      });
    }

    // Refresh hubs button
    const refreshHubsBtn = root.querySelector('#btn-refresh-hubs');
    if (refreshHubsBtn) {
      refreshHubsBtn.addEventListener('click', () => this.refreshHubs());
    }

    // Ingest button
    const ingestBtn = root.querySelector('#btn-ingest-exec');
    if (ingestBtn) {
      ingestBtn.addEventListener('click', () => this.executeIngest());
    }

    // Search button
    const searchBtn = root.querySelector('#btn-search-exec');
    const searchInput = root.querySelector('#search-input');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => this.executeSearch(searchInput.value));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.executeSearch(searchInput.value);
      });
    }

    // Graph button
    const loadGraphBtn = root.querySelector('#btn-load-graph');
    if (loadGraphBtn) {
      loadGraphBtn.addEventListener('click', () => this.loadGraph());
    }

    // Lint button
    const runLintBtn = root.querySelector('#btn-run-lint');
    if (runLintBtn) {
      runLintBtn.addEventListener('click', () => this.loadLint());
    }

    // Fleet refresh button
    const fleetRefreshBtn = root.querySelector('#btn-fleet-refresh');
    if (fleetRefreshBtn) {
      fleetRefreshBtn.addEventListener('click', () => this.executeFleetRefresh());
    }

    // Upstream watch button
    const watchBtn = root.querySelector('#btn-watch-exec');
    if (watchBtn) {
      watchBtn.addEventListener('click', () => this.executeWatch());
    }

    // Generate button
    const genBtn = root.querySelector('#btn-generate-exec');
    const genInput = root.querySelector('#generate-repo-input');
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        if (genInput) this.generateRepo = genInput.value.trim();
        this.executeGenerate();
      });
    }

    // Save token button
    const saveTokenBtn = root.querySelector('#btn-save-token');
    const tokenProviderSelect = root.querySelector('#token-provider-select');
    const tokenValInput = root.querySelector('#token-val-input');
    if (saveTokenBtn && tokenProviderSelect && tokenValInput) {
      saveTokenBtn.addEventListener('click', () => {
        this.saveToken(tokenProviderSelect.value, tokenValInput.value);
        tokenValInput.value = '';
      });
    }

    // Preset chips
    root.querySelectorAll('.preset-chip').forEach((chip) => {
      chip.addEventListener('click', async () => {
        const model = chip.getAttribute('data-model');
        if (model) {
          const modelInput = root.querySelector('#cfg-model');
          if (modelInput) modelInput.value = model;
          await this.setConfigValue('model', model);
        }
      });
    });

    // Save config button
    const saveCfgBtn = root.querySelector('#btn-save-cfg');
    if (saveCfgBtn) {
      saveCfgBtn.addEventListener('click', async () => {
        const prov = root.querySelector('#cfg-provider')?.value;
        const mod = root.querySelector('#cfg-model')?.value;
        const tok = root.querySelector('#cfg-tokens')?.value;
        if (prov) await this.setConfigValue('provider', prov);
        if (mod) await this.setConfigValue('model', mod);
        if (tok) await this.setConfigValue('max_tokens', tok);
      });
    }
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('tr-openwiki-card')) {
  customElements.define('tr-openwiki-card', OpenWikiCard);
}
