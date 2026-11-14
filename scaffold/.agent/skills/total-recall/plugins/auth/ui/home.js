const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--color-text, #edf6f0);
      font: 400 0.9rem/1.5 var(--typography-body-font-family, system-ui, -apple-system, sans-serif);
    }
    * { box-sizing: border-box; }
    main {
      background: linear-gradient(180deg, rgba(13, 25, 20, 0.96) 0%, rgba(9, 17, 14, 0.98) 100%);
      border: 1px solid rgba(100, 227, 164, 0.22);
      border-radius: 14px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.36);
      overflow: hidden;
    }
    .stats-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
      padding: 16px clamp(14px, 3vw, 24px);
      background: rgba(16, 33, 26, 0.55);
      border-block-end: 1px solid rgba(100, 227, 164, 0.14);
    }
    .stat-card {
      background: rgba(20, 38, 30, 0.72);
      border: 1px solid rgba(100, 227, 164, 0.16);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-label {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-muted, #9ec0ac);
    }
    .stat-value {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f0fdf4;
      font-variant-numeric: tabular-nums;
    }
    .stat-sub {
      font-size: 0.78rem;
      color: var(--color-muted, #9ec0ac);
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 12px clamp(14px, 3vw, 24px);
      border-block-end: 1px solid rgba(100, 227, 164, 0.16);
      background: rgba(11, 22, 17, 0.75);
    }
    .body {
      padding: clamp(16px, 3vw, 24px);
    }
    h2, h3, p { margin: 0; }
    h2 { font-size: 1.08rem; font-weight: 650; }
    .muted, th { color: var(--color-muted, #9ec0ac); }
    button, input, select { font: inherit; color: inherit; }
    button {
      min-height: 38px;
      cursor: pointer;
      padding: 0 13px;
      background: rgba(25, 45, 36, 0.9);
      border: 1px solid rgba(100, 227, 164, 0.24);
      border-radius: 8px;
      font-weight: 500;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }
    button:hover:not(:disabled) {
      background: rgba(34, 62, 49, 0.95);
      border-color: rgba(100, 227, 164, 0.45);
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    button.primary {
      background: rgba(16, 185, 129, 0.18);
      border-color: rgba(52, 211, 153, 0.55);
      color: #6ee7b7;
      font-weight: 600;
    }
    button.primary:hover:not(:disabled) {
      background: rgba(16, 185, 129, 0.28);
    }
    button.danger {
      color: #fca5a5;
      border-color: rgba(248, 113, 113, 0.28);
      background: rgba(127, 29, 29, 0.18);
    }
    button.danger:hover:not(:disabled) {
      border-color: rgba(248, 113, 113, 0.55);
      background: rgba(127, 29, 29, 0.34);
    }
    nav button[data-view] {
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--color-muted, #9ec0ac);
      padding: 0 14px;
    }
    nav button[data-view][aria-pressed="true"] {
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(52, 211, 153, 0.36);
      font-weight: 600;
    }
    nav #refresh {
      margin-inline-start: auto;
      font-size: 0.84rem;
    }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid #34d399;
      outline-offset: 2px;
    }
    .tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .filters {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 0.84rem;
      color: var(--color-muted, #9ec0ac);
    }
    input, select {
      background: rgba(16, 30, 25, 0.9);
      border: 1px solid rgba(100, 227, 164, 0.24);
      border-radius: 8px;
      min-height: 38px;
      padding: 6px 11px;
      max-width: 100%;
      color: #edf6f0;
    }
    .count-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.25);
      color: #a7f3d0;
    }
    .table {
      overflow: auto;
      max-height: 460px;
      border: 1px solid rgba(100, 227, 164, 0.16);
      border-radius: 10px;
      background: rgba(10, 19, 15, 0.65);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: start;
    }
    th, td {
      padding: 11px 14px;
      text-align: start;
      border-block-end: 1px solid rgba(100, 227, 164, 0.11);
      vertical-align: middle;
    }
    tbody tr:hover {
      background: rgba(16, 185, 129, 0.05);
    }
    tbody tr:last-child td {
      border-block-end: none;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: rgba(17, 33, 27, 0.98);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      border-block-end: 1px solid rgba(100, 227, 164, 0.22);
    }
    td { overflow-wrap: anywhere; }
    .key-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.84rem;
      font-weight: 600;
      color: #f0fdf4;
    }
    .key-label {
      display: block;
      font-size: 0.78rem;
      color: var(--color-muted, #9ec0ac);
      margin-top: 2px;
    }
    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.76rem;
      background: rgba(148, 163, 184, 0.12);
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: #cbd5e1;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .pill-ready {
      background: rgba(16, 185, 129, 0.14);
      border: 1px solid rgba(52, 211, 153, 0.34);
      color: #6ee7b7;
    }
    .pill-warn {
      background: rgba(245, 158, 11, 0.14);
      border: 1px solid rgba(251, 191, 36, 0.34);
      color: #fcd34d;
    }
    .pill-muted {
      background: rgba(148, 163, 184, 0.1);
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: #94a3b8;
    }
    .pill-info {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #7dd3fc;
    }
    td.actions {
      white-space: nowrap;
      text-align: end;
    }
    td.actions button {
      min-height: 32px;
      padding: 0 10px;
      font-size: 0.8rem;
    }
    td.actions button + button { margin-inline-start: 6px; }
    .signin-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .signin-card {
      background: rgba(18, 35, 28, 0.68);
      border: 1px solid rgba(100, 227, 164, 0.18);
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .signin-card dt {
      font-size: 0.78rem;
      color: var(--color-muted, #9ec0ac);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
    }
    .signin-card dd {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 650;
      color: #f0fdf4;
    }
    .audit-panel {
      background: rgba(16, 33, 26, 0.62);
      border: 1px solid rgba(100, 227, 164, 0.22);
      border-radius: 10px;
      padding: 16px 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }
    .audit-copy p { margin-top: 4px; font-size: 0.85rem; }
    dialog {
      color: inherit;
      background: #0d1a14;
      border: 1px solid rgba(100, 227, 164, 0.35);
      border-radius: 14px;
      padding: 22px;
      width: min(480px, calc(100% - 26px));
      max-height: calc(100% - 26px);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    }
    dialog::backdrop {
      background: rgba(4, 9, 7, 0.78);
      backdrop-filter: blur(4px);
    }
    dialog label { display: grid; margin: 12px 0; color: #edf6f0; }
    dialog .tools { margin: 16px 0 0; }
    .state-ready { color: #6ee7b7; font-weight: 600; }
    .state-attention { color: #fcd34d; font-weight: 600; }
    [role="alert"] { color: #fca5a5; }
    #audit-result { margin: 10px 0 0; font-size: 0.88rem; }
    [hidden] { display: none !important; }
  </style>
  <main aria-label="Auth &amp; Secrets">
    <section class="stats-strip" aria-label="Access summary">
      <div class="stat-card">
        <span class="stat-label">Stored Secrets</span>
        <span class="stat-value" id="stat-secrets">—</span>
        <span class="stat-sub" id="stat-secrets-sub">Loading encrypted store…</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Accessible Brains</span>
        <span class="stat-value" id="stat-brains">—</span>
        <span class="stat-sub" id="stat-brains-sub">Global &amp; project scopes</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Mesh Machines</span>
        <span class="stat-value" id="stat-machines">—</span>
        <span class="stat-sub" id="stat-machines-sub">Checking fleet status…</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Auth Posture</span>
        <span class="stat-value" id="stat-posture">—</span>
        <span class="stat-sub" id="stat-posture-sub">Passkeys, OAuth &amp; session</span>
      </div>
    </section>
    <nav aria-label="Auth views">
      <button type="button" data-view="secrets" aria-pressed="true">Secrets</button>
      <button type="button" data-view="brains" aria-pressed="false">Brains</button>
      <button type="button" data-view="machines" aria-pressed="false">Machines</button>
      <button type="button" data-view="sign-in" aria-pressed="false">Sign-in &amp; audit</button>
      <button type="button" id="refresh">Refresh</button>
    </nav>
    <section class="body" id="inventory" aria-label="Inventory">
      <div class="tools">
        <span class="count-pill" id="summary" role="status">Loading…</span>
        <div class="filters">
          <label id="repo-filter-label" hidden>Repository<select id="repo-filter"></select></label>
          <label id="search-label">Search<input type="search" id="search" placeholder="Key, provider, repo…" autocomplete="off"></label>
        </div>
      </div>
      <p id="problem" role="alert" hidden></p>
      <p id="receipt" role="status" class="state-ready" style="margin-bottom:10px" hidden></p>
      <div class="table" id="table" role="region" aria-label="Inventory results" tabindex="0" hidden></div>
    </section>
    <section class="body" id="sign-in" aria-label="Sign-in and audit" hidden>
      <dl class="signin-grid" aria-live="polite">
        <div class="signin-card"><dt>Registered passkeys</dt><dd id="passkeys">Checking…</dd></div>
        <div class="signin-card"><dt>Google sign-in</dt><dd id="google">Checking…</dd></div>
        <div class="signin-card"><dt>Session signing</dt><dd id="session">Checking…</dd></div>
      </dl>
      <div class="audit-panel">
        <div class="audit-copy">
          <h2>Security baseline</h2>
          <p class="muted">Inspect file permissions, encrypted key health, and host session configuration.</p>
          <p id="audit-result" role="status"></p>
        </div>
        <button type="button" class="primary" id="audit">Run baseline audit</button>
      </div>
    </section>
    <dialog id="credential-dialog" aria-labelledby="credential-heading">
      <h2 id="credential-heading">Edit credential</h2>
      <p class="muted" id="credential-key" style="margin-top:4px;font-family:monospace"></p>
      <div id="credential-fields">
        <label>Label<input id="credential-label" maxlength="120" autocomplete="off"></label>
        <label>Repository binding<input id="credential-repo" maxlength="256" list="registered-repositories" autocomplete="off"></label>
        <datalist id="registered-repositories"></datalist>
        <button type="button" id="credential-clear-repo">Clear binding</button>
        <p class="muted" id="binding-status" style="margin-top:6px;font-size:0.82rem"></p>
        <label>Replacement value<input type="password" id="credential-value" maxlength="16384" autocomplete="new-password"></label>
      </div>
      <div id="delete-fields" hidden>
        <p style="margin-top:10px">Remove this credential from this host’s encrypted store. Enter its name to confirm.</p>
        <label>Credential name<input id="credential-confirm" maxlength="256" autocomplete="off"></label>
      </div>
      <p id="credential-error" role="alert" hidden></p>
      <div class="tools">
        <button type="button" id="credential-close">Cancel</button>
        <button type="button" id="credential-replace">Replace value</button>
        <button type="button" class="primary" id="credential-save">Save details</button>
      </div>
    </dialog>
  </main>
`;

const count = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Unscheduled';
const state = (value, positive, negative) => value === true ? positive : value === false ? negative : 'Unreported';

const makePill = (text, tone) => {
  const span = document.createElement('span');
  span.className = `pill pill-${tone}`;
  span.textContent = text;
  return span;
};

const views = {
  secrets: {
    name: 'credentials', headers: ['Credential', 'Provider', 'Bound repositories', 'Storage', 'Rotation'],
    row: item => [item.label ? `${item.key} · ${item.label}` : item.key, item.provider_name || 'Unassigned',
      Array.isArray(item.repos) && item.repos.length ? item.repos.join(', ') : 'Unbound',
      state(item.set, 'Stored', 'Empty'), item.rotation_overdue ? 'Overdue' : date(item.next_rotate_due)],
    renderCells(entry, item) {
      const keyCell = entry.insertCell();
      const keySpan = document.createElement('span');
      keySpan.className = 'key-name';
      keySpan.textContent = item.key;
      keyCell.append(keySpan);
      if (item.label) {
        const labelSpan = document.createElement('span');
        labelSpan.className = 'key-label';
        labelSpan.textContent = item.label;
        keyCell.append(labelSpan);
      }
      const providerCell = entry.insertCell();
      providerCell.append(makePill(item.provider_name || 'Unassigned', item.provider_name ? 'info' : 'muted'));

      const repoCell = entry.insertCell();
      if (Array.isArray(item.repos) && item.repos.length) {
        const list = document.createElement('div');
        list.className = 'chip-list';
        for (const repo of item.repos) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = repo;
          list.append(chip);
        }
        repoCell.append(list);
      } else {
        repoCell.append(makePill('Unbound', 'muted'));
      }

      const storageCell = entry.insertCell();
      const stored = state(item.set, 'Stored', 'Empty');
      storageCell.append(makePill(stored, stored === 'Stored' ? 'ready' : 'muted'));

      const rotCell = entry.insertCell();
      if (item.rotation_overdue) rotCell.append(makePill('Overdue', 'warn'));
      else rotCell.append(makePill(date(item.next_rotate_due), item.next_rotate_due ? 'info' : 'muted'));
    },
  },
  brains: {
    name: 'brains', headers: ['Brain', 'Layer', 'Memory nodes', 'State'],
    row: item => [item.name, item.layer, count(item.node_count) ? String(item.node_count) : 'Unreported',
      state(item.exists, 'Present', 'Unavailable')],
    renderCells(entry, item) {
      const nameCell = entry.insertCell();
      const nameSpan = document.createElement('span');
      nameSpan.className = 'key-name';
      nameSpan.textContent = item.name;
      nameCell.append(nameSpan);

      const layerCell = entry.insertCell();
      layerCell.append(makePill(item.layer || 'project', item.layer === 'global' ? 'info' : 'muted'));

      const nodesCell = entry.insertCell();
      nodesCell.textContent = count(item.node_count) ? String(item.node_count) : 'Unreported';

      const stateCell = entry.insertCell();
      const present = state(item.exists, 'Present', 'Unavailable');
      stateCell.append(makePill(present, present === 'Present' ? 'ready' : 'warn'));
    },
  },
  machines: {
    name: 'machines', headers: ['Machine', 'OS', 'Role', 'Mesh state'],
    row: item => [item.self ? item.hostname + ' (this host)' : item.hostname, item.os || 'Unreported',
      item.role || 'Unassigned', item.vault_only ? 'Registered' : state(item.online, 'Online', 'Offline')],
    renderCells(entry, item) {
      const hostCell = entry.insertCell();
      const hostSpan = document.createElement('span');
      hostSpan.className = 'key-name';
      hostSpan.textContent = item.hostname || 'Unknown';
      hostCell.append(hostSpan);
      if (item.self) {
        hostCell.append(document.createTextNode(' '));
        hostCell.append(makePill('this host', 'info'));
      }

      entry.insertCell().textContent = item.os || 'Unreported';
      entry.insertCell().append(makePill(item.role || 'Unassigned', item.role ? 'info' : 'muted'));

      const meshStatus = item.vault_only ? 'Registered' : state(item.online, 'Online', 'Offline');
      const tone = meshStatus === 'Online' ? 'ready' : meshStatus === 'Registered' ? 'info' : 'muted';
      entry.insertCell().append(makePill(meshStatus, tone));
    },
  },
};

class AuthHome extends HTMLElement {
  constructor() {
    super();
    this.activeView = 'secrets';
    this.inventory = {};
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.field('refresh').addEventListener('click', () => void this.load());
    this.field('audit').addEventListener('click', () => void this.audit());
    this.field('search').addEventListener('input', () => this.renderInventory());
    this.field('repo-filter').addEventListener('change', () => this.renderInventory());
    this.field('credential-close').addEventListener('click', () => this.field('credential-dialog').close());
    this.field('credential-save').addEventListener('click', () => void this.changeCredential(this.credentialAction));
    this.field('credential-replace').addEventListener('click', () => void this.changeCredential('replace'));
    this.field('credential-repo').addEventListener('input', () => { this.bindingChanged = true; });
    this.field('credential-clear-repo').addEventListener('click', () => {
      this.bindingChanged = true;
      this.field('credential-repo').value = '';
      this.field('binding-status').textContent = 'The binding will be cleared when you save.';
    });
    this.field('credential-dialog').addEventListener('cancel', event => {
      if (this.credentialBusy) event.preventDefault();
    });
    this.field('credential-dialog').addEventListener('close', () => {
      this.field('credential-value').value = '';
      this.field('credential-confirm').value = '';
    });
    for (const button of this.shadowRoot.querySelectorAll('[data-view]')) {
      button.addEventListener('click', () => {
        this.activeView = button.dataset.view;
        this.field('search').value = '';
        for (const item of this.shadowRoot.querySelectorAll('[data-view]')) {
          item.setAttribute('aria-pressed', String(item === button));
        }
        this.renderInventory();
      });
    }
  }

  field(id) { return this.shadowRoot.getElementById(id); }

  repoAliases() {
    const groups = new Map();
    for (const brain of this.inventory.brains?.rows || []) {
      if (brain.layer !== 'project' || typeof brain.name !== 'string') continue;
      const normalized = brain.name.toLowerCase().replaceAll('_', '-');
      const labels = groups.get(normalized) || new Set();
      labels.add(brain.name);
      groups.set(normalized, labels);
    }
    return new Map([...groups].filter(([, labels]) => labels.size === 1)
      .map(([key, labels]) => [key, [...labels][0]]));
  }

  updateSummaryCards() {
    const secrets = this.inventory.secrets?.rows;
    if (Array.isArray(secrets)) {
      const stored = secrets.filter(s => s.set === true).length;
      const overdue = secrets.filter(s => s.rotation_overdue).length;
      this.field('stat-secrets').textContent = `${stored} / ${secrets.length}`;
      this.field('stat-secrets-sub').textContent = overdue > 0 ? `${overdue} rotation overdue` : 'All rotations current';
    }
    const brains = this.inventory.brains?.rows;
    if (Array.isArray(brains)) {
      const present = brains.filter(b => b.exists === true).length;
      this.field('stat-brains').textContent = String(present);
      this.field('stat-brains-sub').textContent = `${brains.length} total configured`;
    }
    const machines = this.inventory.machines?.rows;
    if (Array.isArray(machines)) {
      const online = machines.filter(m => m.online === true).length;
      this.field('stat-machines').textContent = `${online} / ${machines.length}`;
      this.field('stat-machines-sub').textContent = `${machines.filter(m => m.vault_only).length} vault-only`;
    }
  }

  renderInventory() {
    this.updateSummaryCards();
    const signing = this.activeView === 'sign-in';
    this.field('sign-in').hidden = !signing;
    this.field('inventory').hidden = signing;
    if (signing) return;

    const view = views[this.activeView];
    const result = this.inventory[this.activeView];
    const problem = this.field('problem');
    const tableRegion = this.field('table');
    const summary = this.field('summary');
    const search = this.field('search');
    const repoFilter = this.field('repo-filter');
    const credentials = this.activeView === 'secrets';
    problem.hidden = !result?.error;
    problem.textContent = result?.error || '';
    tableRegion.hidden = true;
    tableRegion.replaceChildren();
    this.field('search-label').hidden = !result?.rows?.length;
    this.field('repo-filter-label').hidden = !credentials || !result?.rows?.length;
    if (!result) { summary.textContent = `Loading ${view.name}…`; return; }
    if (result.error) { summary.textContent = ''; return; }

    const aliases = credentials ? this.repoAliases() : new Map();
    const repoLabels = item => [...new Set((Array.isArray(item.repos) ? item.repos : []).filter(repo => typeof repo === 'string').map(repo =>
      aliases.get(repo.toLowerCase().replaceAll('_', '-')) || repo))];
    const selectedRepo = repoFilter.value;
    if (credentials) {
      const repos = [...new Set(result.rows.flatMap(repoLabels))].sort((left, right) => left.localeCompare(right));
      repoFilter.replaceChildren(new Option('All repositories', ''),
        ...repos.map(repo => new Option(repo, repo)));
      if (repos.includes(selectedRepo)) repoFilter.value = selectedRepo;
    }
    const query = search.value.trim().toLocaleLowerCase();
    const rows = result.rows.flatMap(item => {
      const repos = credentials ? repoLabels(item) : [];
      if (credentials && repoFilter.value && !repos.includes(repoFilter.value)) return [];
      const shaped = credentials ? { ...item, repos } : item;
      const values = view.row(shaped);
      const searchText = values.concat(credentials ? item.repos || [] : []).join(' ').toLocaleLowerCase();
      return searchText.includes(query) ? [{ item: shaped }] : [];
    });
    summary.textContent = rows.length === result.rows.length
      ? `${result.rows.length} ${view.name}` : `${rows.length} of ${result.rows.length} ${view.name}`;
    if (!rows.length) return;
    const table = document.createElement('table');
    table.setAttribute('aria-label', view.name);
    const heading = table.createTHead().insertRow();
    const canEdit = credentials && typeof this.host?.changeCredential === 'function';
    for (const title of canEdit ? [...view.headers, 'Manage'] : view.headers) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = title;
      heading.append(cell);
    }
    const body = table.createTBody();
    for (const { item } of rows) {
      const entry = body.insertRow();
      view.renderCells(entry, item);
      if (canEdit) {
        const actions = entry.insertCell();
        actions.className = 'actions';
        for (const [action, label, cls] of [['edit', 'Edit', ''], ['delete', 'Delete', 'danger']]) {
          const button = document.createElement('button');
          button.type = 'button';
          if (cls) button.className = cls;
          button.textContent = label;
          button.setAttribute('aria-label', `${label} ${item.key}`);
          button.addEventListener('click', () => this.openCredential(item, action));
          actions.append(button);
        }
      }
    }
    tableRegion.append(table);
    tableRegion.hidden = false;
  }

  openCredential(item, action) {
    const deleting = action === 'delete';
    this.selectedCredential = item;
    this.credentialAction = action;
    this.bindingChanged = false;
    this.field('credential-heading').textContent = deleting ? 'Delete stored credential' : 'Edit credential';
    this.field('credential-key').textContent = item.key;
    this.field('credential-fields').hidden = deleting;
    this.field('delete-fields').hidden = !deleting;
    this.field('credential-replace').hidden = deleting;
    const saveBtn = this.field('credential-save');
    saveBtn.textContent = deleting ? 'Delete credential' : 'Save details';
    saveBtn.className = deleting ? 'danger' : 'primary';
    this.field('credential-label').value = item.label || '';
    this.field('credential-repo').value = (item.repos || []).length <= 1 ? item.repos?.[0] || '' : '';
    this.field('registered-repositories').replaceChildren(
      ...[...this.repoAliases().values()].sort().map(repo => new Option(repo, repo)),
    );
    this.field('credential-error').hidden = true;
    this.field('binding-status').textContent = item.repos?.length > 1
      ? `Current bindings: ${item.repos.join(', ')}. Select one repository to replace them.`
      : '';
    this.field('credential-dialog').showModal();
  }

  async changeCredential(action) {
    if (this.credentialBusy || !this.selectedCredential) return;
    const { key } = this.selectedCredential;
    const error = this.field('credential-error');
    const data = { action, key };
    if (action === 'edit') {
      data.label = this.field('credential-label').value;
      if (this.bindingChanged) data.repo = this.field('credential-repo').value;
    } else if (action === 'replace') {
      data.value = this.field('credential-value').value;
      this.field('credential-value').value = '';
    } else {
      data.confirm = this.field('credential-confirm').value;
    }
    this.credentialBusy = true;
    const controls = ['credential-close', 'credential-save', 'credential-replace'];
    for (const id of controls) this.field(id).disabled = true;
    error.hidden = true;
    try {
      const result = await this.host.changeCredential(data);
      if (result?.ok !== true) throw new Error('Auth did not confirm the change.');
      this.field('credential-dialog').close();
      const receipt = this.field('receipt');
      receipt.textContent = action === 'delete' ? `Deleted ${key} from this host’s store.`
        : action === 'replace' ? `Replaced the stored value for ${key}.` : `Saved details for ${key}.`;
      receipt.hidden = false;
      await this.load();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      this.credentialBusy = false;
      for (const id of controls) this.field(id).disabled = false;
    }
  }

  async load() {
    const button = this.field('refresh');
    if (button.disabled) return;
    button.disabled = true;
    this.inventory = {};
    this.renderInventory();
    await Promise.all([
      ...Object.keys(views).map(async resource => {
        try {
          const rows = await this.host.readInventory(resource);
          if (!Array.isArray(rows)) throw new Error('Incomplete inventory response');
          this.inventory[resource] = { rows };
        } catch (error) {
          this.inventory[resource] = { error: `Could not load ${views[resource].name}. ${error.message}` };
        }
        this.renderInventory();
      }),
      this.loadSignIn(),
    ]);
    button.disabled = false;
  }

  async loadSignIn() {
    for (const id of ['passkeys', 'google', 'session']) this.field(id).textContent = 'Checking…';
    const [status, session] = await Promise.allSettled([
      this.host?.run('status'), this.host?.run('session'),
    ]);
    const providers = status.status === 'fulfilled' ? status.value : null;
    const registered = providers?.passkey?.registered_count;
    const passkeyLabel = count(registered) ? String(registered) : 'Unavailable';
    const googleLabel = state(providers?.google_oauth2?.configured, 'Configured', 'Needs setup');
    const sessionLabel = state(session.status === 'fulfilled' && session.value
      ? session.value.session_secret_configured : null, 'Configured', 'Needs setup');
    this.field('passkeys').textContent = passkeyLabel;
    this.field('google').textContent = googleLabel;
    this.field('session').textContent = sessionLabel;
    this.field('stat-posture').textContent = sessionLabel === 'Configured' ? 'Secured' : 'Action needed';
    this.field('stat-posture-sub').textContent = `${passkeyLabel} passkeys · Google ${googleLabel}`;
  }

  async audit() {
    const button = this.field('audit');
    const result = this.field('audit-result');
    if (button.disabled) return;
    button.disabled = true;
    result.textContent = 'Checking this host…';
    try {
      let report;
      try { report = await this.host.run('audit'); }
      catch (error) { report = JSON.parse(error.message); }
      if (typeof report?.passed !== 'boolean' || !count(report.findings_count)) throw new Error('Invalid audit response');
      const findings = `${report.findings_count} ${report.findings_count === 1 ? 'finding' : 'findings'}`;
      result.textContent = report.passed ? `Baseline passed with ${findings}.` : `Review required. ${findings}.`;
      result.className = report.passed && !report.findings_count ? 'state-ready' : 'state-attention';
    } catch {
      result.textContent = 'Baseline audit unavailable. Retry or run auth audit in the terminal.';
      result.className = 'state-attention';
    } finally { button.disabled = false; }
  }
}

if (!customElements.get('tr-auth-home')) customElements.define('tr-auth-home', AuthHome);
