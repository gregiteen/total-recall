const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display:block; color:var(--color-text,#edf6f0); font:400 .9rem/1.5 var(--typography-body-font-family,system-ui); }
    * { box-sizing:border-box; }
    main { background:var(--color-background,#101e19); border:1px solid var(--color-outline,#3f6350); border-radius:var(--rounded-panel,.75rem); overflow:hidden; }
    header, .body { padding:clamp(14px,3vw,26px); }
    header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
    h1,h2,p { margin:0; }
    h1 { font-size:clamp(1.5rem,4vw,2.25rem); letter-spacing:-.035em; line-height:1.15; }
    h2 { font-size:1.1rem; }
    .eyebrow { color:var(--color-primary,#64e3a4); font:600 .72rem var(--typography-label-font-family,monospace); letter-spacing:.1em; margin-bottom:6px; }
    .muted, th { color:var(--color-muted,#b1c9ba); }
    header p:last-child { margin-top:6px; }
    nav { display:flex; flex-wrap:wrap; gap:4px; padding:0 clamp(14px,3vw,26px); border-block-end:1px solid var(--color-outline,#3f6350); }
    button, input { font:inherit; color:inherit; }
    button { min-height:44px; cursor:pointer; padding:0 12px; background:var(--color-surface,#192d24); border:1px solid var(--color-outline,#3f6350); border-radius:var(--rounded-control,.4rem); }
    button:disabled { opacity:.65; cursor:wait; }
    nav button { background:transparent; border:1px solid transparent; border-radius:0; color:var(--color-muted,#b1c9ba); }
    nav button[aria-pressed="true"] { color:var(--color-primary,#64e3a4); border-block-end:2px solid currentColor; font-weight:700; }
    button:focus-visible, input:focus-visible { outline:2px solid var(--color-primary,#64e3a4); outline-offset:2px; }
    .tools { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
    label { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
    input { background:var(--color-surface,#192d24); border:1px solid var(--color-outline,#3f6350); border-radius:var(--rounded-control,.4rem); min-height:44px; padding:6px 10px; max-width:100%; }
    .table { overflow:auto; max-height:430px; }
    table { width:100%; border-collapse:collapse; text-align:start; }
    th, td { padding:9px 10px; text-align:start; border-block-end:1px solid var(--color-outline,#3f6350); vertical-align:top; }
    th { position:sticky; top:0; background:var(--color-surface,#192d24); font-size:.75rem; }
    td { overflow-wrap:anywhere; }
    td.actions { white-space:nowrap; }
    td.actions button + button { margin-inline-start:6px; }
    select { font:inherit; min-height:44px; color:inherit; background:var(--color-surface,#192d24); border:1px solid var(--color-outline,#3f6350); border-radius:var(--rounded-control,.4rem); padding:6px 10px; }
    dialog { color:inherit; background:var(--color-background,#101e19); border:1px solid var(--color-outline,#3f6350); border-radius:var(--rounded-panel,.75rem); padding:20px; width:min(480px,calc(100% - 26px)); max-height:calc(100% - 26px); }
    dialog::backdrop { background:#08110dcc; }
    dialog label { display:grid; margin:10px 0; }
    dialog .tools { margin:12px 0 0; }
    .state-ready { color:var(--color-primary,#64e3a4); }
    .state-attention { color:var(--color-warning,#f4d18c); }
    [role="alert"] { color:var(--color-danger,#ffbbb1); }
    dl { margin:0 0 16px; }
    dl div { display:flex; justify-content:space-between; flex-wrap:wrap; padding:8px 0; border-block-end:1px solid var(--color-outline,#3f6350); }
    dd { margin:0; }
    #audit-result { margin:8px 0; }
    [hidden] { display:none!important; }
  </style>
  <main aria-labelledby="auth-title">
    <header>
      <div><p class="eyebrow">ACCESS CONTROL</p><h1 id="auth-title">Auth &amp; Secrets</h1>
      <p class="muted">Credentials and access across this host’s brains and machines.</p></div>
      <button type="button" id="refresh">Refresh</button>
    </header>
    <nav aria-label="Auth views">
      <button type="button" data-view="secrets" aria-pressed="true">Secrets</button>
      <button type="button" data-view="brains" aria-pressed="false">Brains</button>
      <button type="button" data-view="machines" aria-pressed="false">Machines</button>
      <button type="button" data-view="sign-in" aria-pressed="false">Sign-in &amp; audit</button>
    </nav>
    <section class="body" id="inventory" aria-label="Inventory">
      <div class="tools">
        <p id="summary" role="status"></p>
        <label id="repo-filter-label" hidden>Repository<select id="repo-filter"></select></label>
        <label id="search-label">Filter inventory<input type="search" id="search" autocomplete="off"></label>
      </div>
      <p id="problem" role="alert" hidden></p>
      <p id="receipt" role="status" hidden></p>
      <div class="table" id="table" role="region" aria-label="Inventory results" tabindex="0" hidden></div>
    </section>
    <section class="body" id="sign-in" aria-label="Sign-in and audit" hidden>
      <dl aria-live="polite">
        <div><dt>Registered passkeys</dt><dd id="passkeys">Checking…</dd></div>
        <div><dt>Google sign-in configuration</dt><dd id="google">Checking…</dd></div>
        <div><dt>Dashboard session signing</dt><dd id="session">Checking…</dd></div>
      </dl>
      <h2>Security baseline</h2>
      <p id="audit-result" role="status">Check the current host configuration.</p>
      <button type="button" id="audit">Run baseline audit</button>
    </section>
    <dialog id="credential-dialog" aria-labelledby="credential-heading">
      <h2 id="credential-heading"></h2>
      <p id="credential-key"></p>
      <div id="credential-fields">
        <label>Label<input id="credential-label" maxlength="120" autocomplete="off"></label>
        <label>Repository binding<input id="credential-repo" maxlength="256" list="registered-repositories" autocomplete="off"></label>
        <datalist id="registered-repositories"></datalist>
        <button type="button" id="credential-clear-repo">Clear binding</button>
        <p class="muted" id="binding-status"></p>
        <label>Replacement value<input type="password" id="credential-value" maxlength="16384" autocomplete="new-password"></label>
      </div>
      <div id="delete-fields" hidden>
        <p>Remove this credential from this host’s encrypted store. Enter its name to confirm.</p>
        <label>Credential name<input id="credential-confirm" maxlength="256" autocomplete="off"></label>
      </div>
      <p id="credential-error" role="alert" hidden></p>
      <div class="tools">
        <button type="button" id="credential-close">Cancel</button>
        <button type="button" id="credential-replace">Replace value</button>
        <button type="button" id="credential-save">Save details</button>
      </div>
    </dialog>
  </main>
`;

const count = value => Number.isSafeInteger(value) && value >= 0;
const words = values => Array.isArray(values) && values.length ? values.join(', ') : 'Unbound';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Unscheduled';
const state = (value, positive, negative) => value === true ? positive : value === false ? negative : 'Unreported';

const views = {
  secrets: {
    name: 'credentials', headers: ['Credential', 'Provider', 'Bound repositories', 'Storage', 'Rotation'],
    row: item => [item.label ? `${item.key} · ${item.label}` : item.key, item.provider_name || 'Unassigned', words(item.repos),
      state(item.set, 'Stored', 'Empty'), item.rotation_overdue ? 'Overdue' : date(item.next_rotate_due)],
  },
  brains: {
    name: 'brains', headers: ['Brain', 'Layer', 'Memory nodes', 'State'],
    row: item => [item.name, item.layer, count(item.node_count) ? String(item.node_count) : 'Unreported',
      state(item.exists, 'Present', 'Unavailable')],
  },
  machines: {
    name: 'machines', headers: ['Machine', 'OS', 'Role', 'Mesh state'],
    row: item => [item.self ? item.hostname + ' (this host)' : item.hostname, item.os || 'Unreported',
      item.role || 'Unassigned', item.vault_only ? 'Registered' : state(item.online, 'Online', 'Offline')],
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

  renderInventory() {
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
      const values = view.row(credentials ? { ...item, repos } : item);
      const searchText = values.concat(credentials ? item.repos || [] : []).join(' ').toLocaleLowerCase();
      return searchText.includes(query) ? [{ item, values }] : [];
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
    for (const { item, values } of rows) {
      const entry = body.insertRow();
      for (const value of values) {
        const cell = entry.insertCell();
        cell.textContent = value ?? 'Unreported';
        if (['Stored', 'Online', 'Present'].includes(value)) cell.className = 'state-ready';
        if (['Overdue', 'Offline', 'Empty'].includes(value)) cell.className = 'state-attention';
      }
      if (canEdit) {
        const actions = entry.insertCell();
        actions.className = 'actions';
        for (const [action, label] of [['edit', 'Edit'], ['delete', 'Delete']]) {
          const button = document.createElement('button');
          button.type = 'button';
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
    this.field('credential-save').textContent = deleting ? 'Delete credential' : 'Save details';
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
    this.field('passkeys').textContent = count(registered) ? String(registered) : 'Unavailable';
    this.field('google').textContent = state(providers?.google_oauth2?.configured, 'Configured', 'Needs setup');
    this.field('session').textContent = state(session.status === 'fulfilled' && session.value
      ? session.value.session_secret_configured : null, 'Configured', 'Needs setup');
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
