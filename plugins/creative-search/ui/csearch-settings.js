/**
 * `csearch-settings` — Creative Search configuration panel.
 * Self-contained custom element for configuring SearXNG categories,
 * engine groups, max results, and auto-save behavior.
 * Settings are persisted to localStorage under `csearch-settings`.
 *
 * @element csearch-settings
 * @prop {string} engines - Comma-separated enabled engines
 * @prop {string} categories - Comma-separated enabled categories
 * @prop {number} maxResults - Max results per query (5-50)
 * @prop {boolean} autoSave - Auto-save search results to TR memory
 * @fires settings-changed - Dispatched when settings are saved
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--typography-body-size, 14px);
      color: var(--color-text, #1a1a1a);
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-md, 8px);
      padding: var(--spacing-lg, 16px);
      max-width: 480px;
    }
    :host(.dark) {
      color: var(--color-text, #e0e0e0);
      background: var(--color-surface, #1e1e1e);
    }
    h3 {
      margin: 0 0 var(--spacing-md, 12px) 0;
      font-size: var(--typography-h4-size, 16px);
      font-weight: 600;
    }
    .section {
      margin-bottom: var(--spacing-lg, 16px);
    }
    .section-title {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: var(--spacing-xs, 4px);
    }
    .desc {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-tertiary, #999);
      margin: 0 0 var(--spacing-sm, 8px) 0;
    }
    .engine-group {
      margin-bottom: var(--spacing-sm, 8px);
    }
    .engine-group-title {
      font-weight: 500;
      font-size: var(--typography-body-size, 14px);
      margin-bottom: var(--spacing-xs, 4px);
    }
    .engine-toggles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs, 4px);
    }
    .engine-btn {
      background: var(--color-surface-secondary, #f5f5f5);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-sm, 4px);
      padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    }
    .engine-btn:hover {
      background: var(--color-surface-hover, #eee);
    }
    .engine-btn.active {
      background: var(--color-primary, #3b82f6);
      color: var(--color-on-primary, #fff);
      border-color: var(--color-primary, #3b82f6);
    }
    .engine-btn.active:hover {
      background: var(--color-primary-hover, #2563eb);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-xs, 4px) 0;
    }
    .row label {
      font-size: var(--typography-body-size, 14px);
    }
    input[type="range"] {
      width: 120px;
      accent-color: var(--color-primary, #3b82f6);
    }
    .range-value {
      font-size: var(--typography-body-size, 14px);
      font-weight: 500;
      min-width: 24px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .toggle {
      position: relative;
      width: 40px;
      height: 22px;
      cursor: pointer;
    }
    .toggle input {
      display: none;
    }
    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--color-surface-secondary, #ccc);
      border-radius: var(--radius-full, 11px);
      transition: 0.2s;
    }
    .toggle-slider::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: var(--color-surface, #fff);
      border-radius: var(--radius-full, 50%);
      transition: 0.2s;
    }
    .toggle input:checked + .toggle-slider {
      background: var(--color-primary, #3b82f6);
    }
    .toggle input:checked + .toggle-slider::before {
      transform: translateX(18px);
    }
    .actions {
      display: flex;
      gap: var(--spacing-sm, 8px);
      margin-top: var(--spacing-lg, 16px);
      padding-top: var(--spacing-md, 12px);
      border-top: 1px solid var(--color-border, #e0e0e0);
    }
    .btn-primary {
      background: var(--color-primary, #3b82f6);
      color: var(--color-on-primary, #fff);
      border: none;
      border-radius: var(--radius-sm, 4px);
      padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
      font-size: var(--typography-body-size, 14px);
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    .btn-primary:hover {
      background: var(--color-primary-hover, #2563eb);
    }
    .btn-secondary {
      background: var(--color-surface-secondary, #f5f5f5);
      color: var(--color-text, #1a1a1a);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-sm, 4px);
      padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
      font-size: var(--typography-body-size, 14px);
      cursor: pointer;
      font-family: inherit;
    }
    .btn-secondary:hover {
      background: var(--color-surface-hover, #eee);
    }
    .toast {
      position: fixed;
      bottom: var(--spacing-lg, 16px);
      right: var(--spacing-lg, 16px);
      background: var(--color-success, #22c55e);
      color: var(--color-on-primary, #fff);
      padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
      border-radius: var(--radius-sm, 4px);
      font-size: var(--typography-caption-size, 12px);
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
    }
    .category-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs, 4px);
    }
  </style>

  <h3>Creative Search Settings</h3>

  <div class="section">
    <div class="section-title">Search Categories</div>
    <p class="desc">Select which SearXNG categories to search by default</p>
    <div class="category-group" id="categories"></div>
  </div>

  <div class="section">
    <div class="section-title">Engine Groups</div>
    <p class="desc">Toggle individual search engines on or off</p>
    <div id="engineGroups"></div>
  </div>

  <div class="section">
    <div class="section-title">Results</div>
    <div class="row">
      <label>Max results per query</label>
      <div style="display:flex;align-items:center;gap:var(--spacing-xs, 4px)">
        <input type="range" id="maxResults" min="5" max="50" step="5" value="10">
        <span class="range-value" id="maxResultsVal">10</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Memory Integration</div>
    <div class="row">
      <label>Auto-save results to TR memory</label>
      <label class="toggle">
        <input type="checkbox" id="autoSave">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  <div class="actions">
    <button class="btn-primary" id="saveBtn">Save Settings</button>
    <button class="btn-secondary" id="resetBtn">Reset Defaults</button>
  </div>

  <div class="toast" id="toast">Settings saved</div>
`;

const ENGINE_GROUPS = {
  'Web': ['duckduckgo', 'brave', 'google cse'],
  'Research': ['arxiv', 'pubmed', 'semantic_scholar', 'crossref', 'google_scholar'],
  'Wikipedia': ['wikipedia', 'wikidata', 'wikicommons'],
  'Code': ['github', 'stackexchange', 'pypi', 'docker hub'],
  'News': ['bing_news', 'hackernews', 'yahoo_news', 'reuters'],
  'Multimedia': ['flickr', 'unsplash'],
};

const ALL_CATEGORIES = ['general', 'science', 'news', 'images', 'videos', 'music', 'it', 'files', 'social media'];

const STORAGE_KEY = 'csearch-settings';

const DEFAULTS = {
  categories: ['general', 'science'],
  engines: Object.values(ENGINE_GROUPS).flat(),
  maxResults: 10,
  autoSave: false,
};

export class CSearchSettings extends HTMLElement {
  static observedAttributes = ['engines', 'categories', 'maxresults', 'autosave'];

  constructor() {
    super();
    this._settings = { ...DEFAULTS, categories: [...DEFAULTS.categories], engines: [...DEFAULTS.engines] };
    this._load();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._initCategories();
    this._initEngineGroups();
    this._initControls();
  }

  connectedCallback() {
    this.shadowRoot.getElementById('saveBtn').addEventListener('click', () => this._save());
    this.shadowRoot.getElementById('resetBtn').addEventListener('click', () => this._reset());
    this.shadowRoot.getElementById('maxResults').addEventListener('input', (e) => {
      this.shadowRoot.getElementById('maxResultsVal').textContent = e.target.value;
    });
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._settings = { ...DEFAULTS, ...parsed };
        if (parsed.categories) this._settings.categories = parsed.categories;
        if (parsed.engines) this._settings.engines = parsed.engines;
      }
    } catch {}
  }

  _initCategories() {
    const container = this.shadowRoot.getElementById('categories');
    for (const cat of ALL_CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'engine-btn' + (this._settings.categories.includes(cat) ? ' active' : '');
      btn.textContent = cat;
      btn.dataset.cat = cat;
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
      container.appendChild(btn);
    }
  }

  _initEngineGroups() {
    const container = this.shadowRoot.getElementById('engineGroups');
    for (const [group, engines] of Object.entries(ENGINE_GROUPS)) {
      const div = document.createElement('div');
      div.className = 'engine-group';
      div.innerHTML = `<div class="engine-group-title">${group}</div>`;
      const toggles = document.createElement('div');
      toggles.className = 'engine-toggles';
      for (const engine of engines) {
        const btn = document.createElement('button');
        btn.className = 'engine-btn' + (this._settings.engines.includes(engine) ? ' active' : '');
        btn.textContent = engine;
        btn.dataset.engine = engine;
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
        });
        toggles.appendChild(btn);
      }
      div.appendChild(toggles);
      container.appendChild(div);
    }
  }

  _initControls() {
    this.shadowRoot.getElementById('maxResults').value = this._settings.maxResults;
    this.shadowRoot.getElementById('maxResultsVal').textContent = this._settings.maxResults;
    this.shadowRoot.getElementById('autoSave').checked = this._settings.autoSave;
  }

  _collectSettings() {
    const catBtns = this.shadowRoot.querySelectorAll('#categories .engine-btn');
    const categories = [];
    for (const btn of catBtns) {
      if (btn.classList.contains('active')) categories.push(btn.dataset.cat);
    }

    const engineBtns = this.shadowRoot.querySelectorAll('#engineGroups .engine-btn');
    const engines = [];
    for (const btn of engineBtns) {
      if (btn.classList.contains('active')) engines.push(btn.dataset.engine);
    }

    return {
      categories,
      engines,
      maxResults: parseInt(this.shadowRoot.getElementById('maxResults').value, 10),
      autoSave: this.shadowRoot.getElementById('autoSave').checked,
    };
  }

  _save() {
    this._settings = this._collectSettings();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch {}
    this.dispatchEvent(new CustomEvent('settings-changed', { detail: { ...this._settings } }));
    const toast = this.shadowRoot.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  _reset() {
    this._settings = { ...DEFAULTS, categories: [...DEFAULTS.categories], engines: [...DEFAULTS.engines] };
    const catBtns = this.shadowRoot.querySelectorAll('#categories .engine-btn');
    for (const btn of catBtns) {
      btn.classList.toggle('active', this._settings.categories.includes(btn.dataset.cat));
    }
    const engineBtns = this.shadowRoot.querySelectorAll('#engineGroups .engine-btn');
    for (const btn of engineBtns) {
      btn.classList.toggle('active', this._settings.engines.includes(btn.dataset.engine));
    }
    this.shadowRoot.getElementById('maxResults').value = DEFAULTS.maxResults;
    this.shadowRoot.getElementById('maxResultsVal').textContent = DEFAULTS.maxResults;
    this.shadowRoot.getElementById('autoSave').checked = DEFAULTS.autoSave;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    this.dispatchEvent(new CustomEvent('settings-changed', { detail: { ...this._settings } }));
  }
}

customElements.define('csearch-settings', CSearchSettings);

export default CSearchSettings;