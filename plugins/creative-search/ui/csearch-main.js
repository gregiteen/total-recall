/**
 * `csearch-main` — Creative Search plugin main overview page.
 * Shows plugin branding, active settings summary, engine health, and links.
 *
 * @element csearch-main
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--color-text, #1a1a1a);
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-md, 8px);
      padding: var(--spacing-xl, 24px);
      max-width: 600px;
    }
    :host(.dark) {
      color: var(--color-text, #e0e0e0);
      background: var(--color-surface, #1e1e1e);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--spacing-md, 12px);
      margin-bottom: var(--spacing-lg, 16px);
    }
    .brand-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--color-accent, #8b5cf6), var(--color-secondary, #ec4899));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      color: var(--color-on-primary, #fff);
      flex-shrink: 0;
    }
    .brand-text h2 {
      margin: 0;
      font-size: var(--typography-h3-size, 20px);
      font-weight: 700;
    }
    .brand-text .sub {
      margin: 2px 0 0;
      font-size: var(--typography-caption-size, 12px);
      color: var(--color-text-secondary, #666);
    }
    .summary {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: var(--spacing-sm, 8px);
      margin-bottom: var(--spacing-lg, 16px);
    }
    .stat-card {
      background: var(--color-surface-secondary, #f8f8f8);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-md, 8px);
      padding: var(--spacing-sm, 8px);
      text-align: center;
    }
    :host(.dark) .stat-card {
      background: var(--color-surface-secondary, #252525);
      border-color: var(--color-border, #333);
    }
    .stat-value {
      font-size: var(--typography-h2-size, 28px);
      font-weight: 700;
      color: var(--color-primary, #3b82f6);
    }
    .stat-label {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
      margin-top: var(--spacing-xs, 2px);
    }
    .section-title {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: var(--spacing-sm, 8px);
    }
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs, 4px);
      margin-bottom: var(--spacing-md, 12px);
    }
    .tag {
      background: var(--color-surface-secondary, #f0f0f0);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-sm, 4px);
      padding: 2px var(--spacing-xs, 6px);
      font-size: var(--typography-caption-size, 11px);
    }
    :host(.dark) .tag {
      background: var(--color-surface-secondary, #2a2a2a);
      border-color: var(--color-border, #444);
    }
    .engine-group {
      margin-bottom: var(--spacing-sm, 8px);
    }
    .engine-group-title {
      font-weight: 500;
      font-size: var(--typography-body-size, 13px);
      margin-bottom: var(--spacing-xs, 2px);
    }
    .engine-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs, 3px);
    }
    .engine-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full, 50%);
      margin-right: var(--spacing-xs, 2px);
    }
    .engine-dot.online { background: var(--color-success, #22c55e); }
    .engine-dot.offline { background: var(--color-error, #ef4444); }
    .engine-item {
      font-size: var(--typography-caption-size, 11px);
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .cmd-bar {
      display: flex;
      gap: var(--spacing-sm, 8px);
      margin-top: var(--spacing-md, 12px);
      flex-wrap: wrap;
    }
    .cmd {
      background: var(--color-surface-secondary, #f5f5f5);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-sm, 4px);
      padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
      font-family: var(--font-family-mono, monospace);
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
    }
    .actions {
      display: flex;
      gap: var(--spacing-sm, 8px);
      margin-top: var(--spacing-lg, 16px);
      padding-top: var(--spacing-md, 12px);
      border-top: 1px solid var(--color-border, #e0e0e0);
    }
    .action-link {
      color: var(--color-primary, #3b82f6);
      text-decoration: none;
      font-size: var(--typography-body-size, 14px);
      font-weight: 500;
      cursor: pointer;
    }
    .action-link:hover {
      text-decoration: underline;
    }
    .health-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm, 8px);
      padding: var(--spacing-xs, 4px) 0;
      font-size: var(--typography-body-size, 13px);
    }
    .health-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full, 50%);
      flex-shrink: 0;
    }
    .health-dot.green { background: var(--color-success, #22c55e); }
    .health-dot.yellow { background: var(--color-warning, #f59e0b); }
    .health-dot.red { background: var(--color-error, #ef4444); }
  </style>

  <div class="brand">
    <div class="brand-icon">CS</div>
    <div class="brand-text">
      <h2>Creative Search</h2>
      <p class="sub">Total Recall Plugin v2.0.0 — SearXNG Metasearch</p>
    </div>
  </div>

  <div class="summary">
    <div class="stat-card">
      <div class="stat-value" id="engineCount">25+</div>
      <div class="stat-label">Engines</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="categoryCount">9</div>
      <div class="stat-label">Categories</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="healthIndicator">✓</div>
      <div class="stat-label">SearXNG Health</div>
    </div>
  </div>

  <div>
    <div class="section-title">Active Categories</div>
    <div class="tag-list" id="categoriesList"></div>
  </div>

  <div>
    <div class="section-title">Engine Groups</div>
    <div id="engineGroups"></div>
  </div>

  <div class="section-title">Quick Commands</div>
  <div class="cmd-bar">
    <span class="cmd">csearch query "..."</span>
    <span class="cmd">csearch categories science "..."</span>
    <span class="cmd">csearch deep "..."</span>
    <span class="cmd">csearch remember "..."</span>
    <span class="cmd">csearch stats</span>
    <span class="cmd">csearch health</span>
  </div>

  <div class="actions">
    <a class="action-link" id="refreshLink">↻ Refresh Status</a>
  </div>
`;

const ENGINE_GROUPS = {
  'Web': ['duckduckgo', 'brave', 'google cse'],
  'Research': ['arxiv', 'pubmed', 'semantic_scholar', 'crossref', 'google_scholar'],
  'Wikipedia': ['wikipedia', 'wikidata', 'wikicommons'],
  'Code': ['github', 'stackexchange', 'pypi', 'docker hub'],
  'News': ['bing_news', 'hackernews', 'yahoo_news', 'reuters'],
  'Multimedia': ['flickr', 'unsplash'],
};


export class CSearchMain extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this._loadSettings();
    this._checkHealth();
    this._buildEngineGroups();
    this.shadowRoot.getElementById('refreshLink').addEventListener('click', (e) => {
      e.preventDefault();
      this._checkHealth();
    });
  }

  _loadSettings() {
    const categories = this.config.categories || ['general', 'science'];
    const container = this.shadowRoot.getElementById('categoriesList');
    container.innerHTML = categories.map(c => `<span class="tag">${c}</span>`).join('');
  }

  set config(value) {
    this._config = value || {};
    if (this.isConnected) { this._loadSettings(); this._checkHealth(); }
  }

  get config() { return this._config || {}; }

  async _checkHealth() {
    const indicator = this.shadowRoot.getElementById('healthIndicator');
    const base = this.config.searxngUrl;
    if (!base) { indicator.textContent = 'Not configured'; this.shadowRoot.getElementById('engineCount').textContent = '—'; return; }
    try {
      const url = new URL(base);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid instance URL');
      const res = await fetch(`${url.href.replace(/\/$/, '')}/search?q=health&format=json&categories=general`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const engineCount = new Set((data.results || []).flatMap(result => result.engines || (result.engine ? [result.engine] : []))).size;
        indicator.textContent = engineCount > 0 ? `${engineCount} engines` : '✓ Online';
        this.shadowRoot.getElementById('engineCount').textContent = engineCount || '—';
      } else {
        indicator.textContent = '⚠ Error';
      }
    } catch {
      indicator.textContent = '⚠ Offline';
    }
  }

  _buildEngineGroups() {
    const container = this.shadowRoot.getElementById('engineGroups');
    for (const [group, engines] of Object.entries(ENGINE_GROUPS)) {
      const div = document.createElement('div');
      div.className = 'engine-group';
      div.innerHTML = `<div class="engine-group-title">${group}</div>`;
      const list = document.createElement('div');
      list.className = 'engine-list';
      for (const engine of engines) {
        const span = document.createElement('span');
        span.className = 'engine-item';
        span.innerHTML = `<span class="engine-dot online"></span>${engine}`;
        list.appendChild(span);
      }
      div.appendChild(list);
      container.appendChild(div);
    }
  }
}

customElements.define('csearch-main', CSearchMain);
export default CSearchMain;
