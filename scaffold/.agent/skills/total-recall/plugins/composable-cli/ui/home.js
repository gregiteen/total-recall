/**
 * CmdSmith Home: the Composable CLI plugin's native panel.
 *
 * Reads real CLI output through this.host.run(<operation>, [..., '--json']):
 * status, list, show and history. Runs test, rollback and remove only when the
 * operator clicks, and remove only after a second confirming click. Every
 * region states "Unavailable" with the reason when the host or an operation
 * fails. Styles come from DESIGN.md frontmatter tokens only.
 */

const RISK_TONE = {
  read: 'ok',
  write: 'warn',
  money: 'danger',
  'dns-cert': 'danger',
  'production-deploy': 'danger',
  'secret-revoke': 'danger',
};

const SCOPES = [
  { id: 'all', label: 'All' },
  { id: 'project', label: 'Project' },
  { id: 'group', label: 'Group' },
  { id: 'global', label: 'Global' },
];

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function parseJsonText(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new Error('The operation returned no output');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('The operation output was not JSON');
  }
}

/** Accept an object, a JSON string, or a host wrapper carrying the JSON in stdout. */
function normalize(raw) {
  if (raw === null || raw === undefined) throw new Error('The operation returned no output');
  if (typeof raw === 'string') return parseJsonText(raw);
  if (typeof raw === 'object' && !Array.isArray(raw) && typeof raw.stdout === 'string' && !('testFile' in raw)) {
    return parseJsonText(raw.stdout);
  }
  return raw;
}

function failureOf(data) {
  return data && typeof data === 'object' && !Array.isArray(data) && data.ok === false && !('testFile' in data)
    ? (typeof data.error === 'string' && data.error ? data.error : 'The operation failed')
    : null;
}

/** Scope flags the CLI's detectScope() expects for a list item, or null when the item cannot be addressed. */
function scopeArgs(item) {
  if (!item || item.scope === 'project') return [];
  if (item.scope === 'global') return ['--global'];
  if (item.scope === 'group') {
    const parts = String(item.path || '').split(/[\\/]+/);
    const index = parts.lastIndexOf('groups');
    const id = index >= 0 ? parts[index + 1] : '';
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) ? ['--group', id] : null;
  }
  return null;
}

export class ComposableCliHome extends HTMLElement {
  constructor() {
    super();
    this._host = null;
    this.status = { state: 'loading' };
    this.commands = { state: 'loading', items: [] };
    this.scope = 'all';
    this.selected = null;
    this.detail = null;
    this.action = null;
    this.armedRemove = false;
    this.busy = false;
  }

  get host() {
    return this._host;
  }

  set host(value) {
    this._host = value;
    if (this.isConnected) this.load();
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.setAttribute('data-loaded', '');
    this.load();
  }

  async call(operation, args) {
    if (!this._host || typeof this._host.run !== 'function') {
      throw new Error('No Total Recall host connection');
    }
    try {
      return normalize(await this._host.run(operation, args));
    } catch (error) {
      // A non-zero exit can still carry the operation's JSON result.
      const text = error && (typeof error.stdout === 'string' ? error.stdout :
        typeof error.output === 'string' ? error.output : error.message);
      if (typeof text === 'string' && /^\s*[\[{]/.test(text)) {
        try { return parseJsonText(text); } catch { /* keep the original operation error */ }
      }
      throw error;
    }
  }

  /** For operations that confirm in prose on success and print { ok:false } JSON on failure. */
  async callConfirm(operation, args) {
    if (!this._host || typeof this._host.run !== 'function') {
      throw new Error('No Total Recall host connection');
    }
    const raw = await this._host.run(operation, args);
    const text = typeof raw === 'string' ? raw : raw && typeof raw.stdout === 'string' ? raw.stdout : null;
    if (text && /^\s*\{/.test(text)) {
      const failure = failureOf(parseJsonText(text));
      if (failure) throw new Error(failure);
    } else if (raw && typeof raw === 'object') {
      const failure = failureOf(raw);
      if (failure) throw new Error(failure);
    }
    return text ? text.trim() : 'Done';
  }

  async load() {
    if (!this.shadowRoot) return;
    this.status = { state: 'loading' };
    this.commands = { state: 'loading', items: this.commands.items };
    this.render();
    const [status, list] = await Promise.allSettled([
      this.call('status', ['--json']),
      this.call('list', ['--json']),
    ]);
    this.status = this.settle(status, data => data && typeof data === 'object' && Array.isArray(data.implemented));
    const commands = this.settle(list, Array.isArray);
    this.commands = commands.state === 'ready'
      ? { state: 'ready', items: commands.data.filter(item => item && typeof item.name === 'string') }
      : { state: 'error', error: commands.error, items: [] };
    const current = this.commands.items.find(item => this.key(item) === this.selected);
    if (current) await this.inspect(current, { keepAction: true });
    else {
      this.selected = null;
      this.detail = null;
      this.render();
    }
  }

  settle(result, valid) {
    if (result.status === 'rejected') {
      return { state: 'error', error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
    }
    const failure = failureOf(result.value);
    if (failure) return { state: 'error', error: failure };
    if (!valid(result.value)) return { state: 'error', error: 'The operation returned an unexpected shape' };
    return { state: 'ready', data: result.value };
  }

  key(item) {
    return `${item.scope}:${item.path || item.name}`;
  }

  async inspect(item, { keepAction = false } = {}) {
    this.selected = this.key(item);
    this.armedRemove = false;
    if (!keepAction) this.action = null;
    const flags = scopeArgs(item);
    if (!flags) {
      this.detail = { item, state: 'error', error: 'This command\'s scope cannot be addressed from its path' };
      this.render();
      return;
    }
    this.detail = { item, state: 'loading' };
    this.render();
    const [show, history] = await Promise.allSettled([
      this.call('show', [item.name, ...flags, '--json']),
      this.call('history', [item.name, ...flags, '--json']),
    ]);
    if (this.selected !== this.key(item)) return;
    this.detail = {
      item,
      state: 'ready',
      show: this.settle(show, data => data && typeof data === 'object' && 'code' in data),
      history: this.settle(history, data => data && typeof data === 'object' && Array.isArray(data.versions)),
    };
    this.render();
  }

  selectedItem() {
    return this.commands.items.find(item => this.key(item) === this.selected) || null;
  }

  async runTest() {
    const item = this.selectedItem();
    const flags = scopeArgs(item);
    if (!item || !flags || this.busy) return;
    this.busy = true;
    this.armedRemove = false;
    this.action = { kind: 'test', state: 'running' };
    this.render();
    try {
      const data = await this.call('test', [item.name, ...flags, '--json']);
      if (data && typeof data === 'object' && 'testFile' in data) this.action = { kind: 'test', state: 'done', data };
      else this.action = { kind: 'test', state: 'error', error: failureOf(data) || 'The test returned an unexpected shape' };
    } catch (error) {
      this.action = { kind: 'test', state: 'error', error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async runRollback(version) {
    const item = this.selectedItem();
    const flags = scopeArgs(item);
    if (!item || !flags || this.busy || !Number.isInteger(version)) return;
    this.busy = true;
    this.armedRemove = false;
    this.action = { kind: 'rollback', state: 'running', version };
    this.render();
    try {
      const message = await this.callConfirm('rollback', [item.name, String(version), ...flags, '--json']);
      this.action = { kind: 'rollback', state: 'done', message };
    } catch (error) {
      this.action = { kind: 'rollback', state: 'error', error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.busy = false;
    }
    await this.load();
  }

  async runRemove() {
    const item = this.selectedItem();
    const flags = scopeArgs(item);
    if (!item || !flags || this.busy) return;
    if (!this.armedRemove) {
      this.armedRemove = true;
      this.render();
      return;
    }
    this.busy = true;
    this.armedRemove = false;
    this.action = { kind: 'remove', state: 'running' };
    this.render();
    try {
      const message = await this.callConfirm('remove', [item.name, ...flags, '--json']);
      this.action = { kind: 'remove', state: 'done', message };
    } catch (error) {
      this.action = { kind: 'remove', state: 'error', error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.busy = false;
    }
    await this.load();
  }

  riskBadge(risk) {
    const tone = RISK_TONE[risk] || 'info';
    return `<span class="risk risk-${tone}" data-design-component="risk-badge">${escapeHtml(risk || 'undeclared')}</span>`;
  }

  renderStatus() {
    const s = this.status;
    if (s.state === 'loading') return `<p class="status-line" data-design-component="status-line" role="status">Reading plugin status…</p>`;
    if (s.state === 'error') return `<p class="status-line is-error" data-design-component="status-line" role="status">Unavailable: ${escapeHtml(s.error)}</p>`;
    const { implemented, scope = {} } = s.data;
    return `
      <dl class="status-line facts" data-design-component="status-line">
        <div><dt>Operations</dt><dd>${implemented.length} implemented</dd></div>
        <div><dt>Project commands</dt><dd class="mono">${escapeHtml(scope.project || 'Not resolved')}</dd></div>
        <div><dt>Global commands</dt><dd class="mono">${escapeHtml(scope.global || 'Not resolved')}</dd></div>
      </dl>`;
  }

  renderList() {
    const c = this.commands;
    const filters = SCOPES.map(s => `
      <button type="button" class="chip" data-scope="${s.id}" aria-pressed="${this.scope === s.id}">${s.label}</button>`).join('');
    let body;
    if (c.state === 'loading') body = `<p class="status-line" data-design-component="status-line" role="status">Reading composed commands…</p>`;
    else if (c.state === 'error') body = `<p class="status-line is-error" data-design-component="status-line" role="status">Unavailable: ${escapeHtml(c.error)}</p>`;
    else {
      const items = c.items.filter(item => this.scope === 'all' || item.scope === this.scope);
      body = items.length
        ? `<ul class="verbs">${items.map(item => {
            const selected = this.key(item) === this.selected;
            return `<li><button type="button" class="verb" data-key="${escapeHtml(this.key(item))}" aria-current="${selected}"
              data-design-component="${selected ? 'verb-row-selected' : 'verb-row'}">
              <span class="verb-name">${escapeHtml(item.name)}</span>
              <span class="verb-meta">${this.riskBadge(item.risk)}<span class="scope-tag">${escapeHtml(item.scope)}</span></span>
              ${item.description ? `<span class="verb-desc">${escapeHtml(item.description)}</span>` : ''}
            </button></li>`;
          }).join('')}</ul>`
        : `<p class="status-line" data-design-component="status-line">No composed commands in this scope. Create one with <code>total-recall composable-cli create</code>.</p>`;
    }
    return `<section class="deck" aria-label="Composed commands"><div class="chips" role="group" aria-label="Scope">${filters}</div>${body}</section>`;
  }

  renderAction() {
    const a = this.action;
    if (!a) return '';
    if (a.state === 'running') {
      const label = a.kind === 'test' ? 'Running the test…' : a.kind === 'rollback' ? `Rolling back to v${a.version}…` : 'Removing…';
      return `<p class="status-line" data-design-component="status-line" role="status">${label}</p>`;
    }
    if (a.state === 'error') return `<p class="status-line is-error" data-design-component="status-line" role="status">${escapeHtml(a.kind)} failed: ${escapeHtml(a.error)}</p>`;
    if (a.kind !== 'test') return `<p class="status-line is-ok" data-design-component="status-line" role="status">${escapeHtml(a.message)}</p>`;
    const d = a.data;
    return `
      <div class="result ${d.ok ? 'is-ok' : 'is-error'}" role="status">
        <p class="result-head">${d.ok ? 'Test passed' : 'Test failed'}</p>
        <dl class="facts">
          <div><dt>Exit code</dt><dd>${escapeHtml(d.exitCode ?? 'none')}</dd></div>
          <div><dt>Signal</dt><dd>${escapeHtml(d.signal ?? 'none')}</dd></div>
          ${d.error ? `<div><dt>Process error</dt><dd>${escapeHtml(d.error)}</dd></div>` : ''}
          <div><dt>Test file</dt><dd class="mono">${escapeHtml(d.testFile)}</dd></div>
        </dl>
        ${d.stdout ? `<pre class="code" aria-label="Test output">${escapeHtml(d.stdout)}</pre>` : ''}
        ${d.stderr ? `<pre class="code is-error" aria-label="Test errors">${escapeHtml(d.stderr)}</pre>` : ''}
      </div>`;
  }

  renderInspector() {
    const d = this.detail;
    if (!d) return `<section class="inspector" data-design-component="inspector">${this.renderAction()}<p class="muted">Select a composed command to read its record, history and source.</p></section>`;
    const item = d.item;
    const addressable = Boolean(scopeArgs(item));
    const head = `
      <div class="inspector-head">
        <h3 class="mono">${escapeHtml(item.name)}</h3>
        <div class="actions">
          <button type="button" class="act act-primary" data-act="test" data-design-component="action-primary" ${this.busy || !addressable ? 'disabled' : ''}>Run test</button>
          <button type="button" class="act act-danger" data-act="remove" data-design-component="action-danger" ${this.busy || !addressable ? 'disabled' : ''}>${this.armedRemove ? 'Confirm remove' : 'Remove'}</button>
        </div>
      </div>
      ${this.armedRemove ? `<p class="status-line is-error" data-design-component="status-line" role="alert">Removing deletes ${escapeHtml(item.name)} from the ${escapeHtml(item.scope)} scope. Select Confirm remove to continue.</p>` : ''}
      ${this.renderAction()}`;
    if (d.state === 'loading') return `<section class="inspector" data-design-component="inspector">${head}<p class="status-line" data-design-component="status-line" role="status">Reading the command record…</p></section>`;
    if (d.state === 'error') return `<section class="inspector" data-design-component="inspector">${head}<p class="status-line is-error" data-design-component="status-line" role="status">Unavailable: ${escapeHtml(d.error)}</p></section>`;

    let record;
    if (d.show.state === 'error') record = `<p class="status-line is-error" data-design-component="status-line">Record unavailable: ${escapeHtml(d.show.error)}</p>`;
    else if (!d.show.data.registry) record = `<p class="status-line" data-design-component="status-line">No registry record. The command file exists without its cli_command document.</p>`;
    else {
      const r = d.show.data.registry;
      record = `
        <dl class="facts record">
          <div><dt>Version</dt><dd>v${escapeHtml(r.version ?? '?')}</dd></div>
          <div><dt>Risk</dt><dd>${this.riskBadge(r.risk)}</dd></div>
          <div><dt>Scope</dt><dd>${escapeHtml(r.scope)}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(r.source || 'Not recorded')}</dd></div>
          <div><dt>Author</dt><dd>${escapeHtml(r.author || 'Not recorded')}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(formatTime(r.created))}</dd></div>
          <div><dt>Updated</dt><dd>${escapeHtml(formatTime(r.updated))}</dd></div>
          <div><dt>Background runs</dt><dd>${r.background_allowed ? 'Allowed' : 'Not allowed'}</dd></div>
          <div class="wide"><dt>Code digest</dt><dd class="mono">${escapeHtml(r.code_sha256 || 'Not recorded')}</dd></div>
          ${r.description ? `<div class="wide"><dt>Description</dt><dd>${escapeHtml(r.description)}</dd></div>` : ''}
        </dl>`;
    }

    let history;
    if (d.history.state === 'error') history = `<p class="status-line is-error" data-design-component="status-line">History unavailable: ${escapeHtml(d.history.error)}</p>`;
    else if (!d.history.data.versions.length) history = `<p class="muted">No earlier versions. Updates and rollbacks save a snapshot here.</p>`;
    else history = `<ul class="versions">${d.history.data.versions.map(v => `
        <li><span class="mono">v${escapeHtml(v)}</span>
          <button type="button" class="act" data-rollback="${escapeHtml(v)}" ${this.busy || !addressable ? 'disabled' : ''}>Roll back to v${escapeHtml(v)}</button></li>`).join('')}</ul>`;

    const source = d.show.state === 'ready'
      ? `<pre class="code" aria-label="Command source">${escapeHtml(d.show.data.code)}</pre>`
      : '';

    return `
      <section class="inspector" data-design-component="inspector" aria-label="Command inspector">
        ${head}
        <h4>Record</h4>${record}
        <h4>History</h4>${history}
        <h4>Source</h4>${source}
      </section>`;
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;
    const count = this.commands.state === 'ready' ? `${this.commands.items.length} composed` : this.commands.state === 'error' ? 'Unavailable' : 'Reading…';
    root.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--color-background);
          color: var(--color-text);
          font-family: var(--typography-body-font-family);
          font-size: var(--typography-body-font-size);
          line-height: var(--typography-body-line-height);
          padding: var(--spacing-lg);
          border: 1px solid var(--color-line);
          border-radius: var(--radius-lg);
          box-sizing: border-box;
        }
        * { box-sizing: border-box; }
        h3, h4, p, dl, dd, ul { margin: 0; }
        ul { padding: 0; list-style: none; }
        .mono, code, .verb-name { font-family: var(--typography-code-font-family); font-size: var(--typography-code-font-size); }
        .muted { color: var(--color-muted); }
        header {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-md);
          background: var(--color-secondary); border-radius: var(--radius-lg); padding: var(--spacing-md);
          margin-bottom: var(--spacing-md);
        }
        .mark { display: flex; align-items: baseline; gap: var(--spacing-sm); }
        .wordmark {
          font-family: var(--typography-title-font-family); font-size: var(--typography-title-font-size);
          font-weight: var(--typography-title-font-weight); line-height: var(--typography-title-line-height);
          color: var(--color-primary-strong);
        }
        .badge, .scope-tag, .risk, dt {
          font-family: var(--typography-label-font-family); font-size: var(--typography-label-font-size);
          font-weight: var(--typography-label-font-weight); letter-spacing: var(--typography-label-letter-spacing);
          text-transform: uppercase;
        }
        .badge { color: var(--color-muted); }
        .head-right { display: flex; align-items: center; gap: var(--spacing-sm); }
        .count { color: var(--color-text); }
        button {
          font: inherit; color: var(--color-text); cursor: pointer;
          min-height: var(--spacing-touch); min-width: var(--spacing-touch);
          border: 1px solid var(--color-line); border-radius: var(--radius-md);
          background: var(--color-surface); padding: var(--spacing-xs) var(--spacing-md);
          transition: background-color 120ms ease, border-color 120ms ease;
        }
        button:hover:not(:disabled) { border-color: var(--color-primary); }
        button:focus-visible { outline: 2px solid var(--color-primary-strong); outline-offset: 2px; }
        button:disabled { cursor: not-allowed; color: var(--color-muted); }
        .status-line {
          background: var(--color-surface-raised); color: var(--color-muted);
          border-radius: var(--radius-md); padding: var(--spacing-sm); margin-bottom: var(--spacing-md);
        }
        .status-line.is-error, .is-error { color: var(--color-danger); }
        .status-line.is-error { background: var(--color-danger-soft); }
        .status-line.is-ok { background: var(--color-ok-soft); color: var(--color-ok); }
        .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--spacing-sm); }
        .facts .wide { grid-column: 1 / -1; }
        dt { color: var(--color-muted); margin-bottom: var(--spacing-xs); }
        dd { overflow-wrap: anywhere; }
        .split { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(300px, 1.6fr); gap: var(--spacing-md); }
        @media (max-width: 720px) { .split { grid-template-columns: 1fr; } }
        .chips { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm); }
        .chip[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); }
        .verbs { display: flex; flex-direction: column; gap: var(--spacing-xs); max-height: 460px; overflow-y: auto; }
        .verb {
          width: 100%; text-align: left; display: grid; gap: var(--spacing-xs); padding: var(--spacing-sm);
          grid-template-columns: 1fr auto;
        }
        .verb[aria-current="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); }
        .verb-meta { display: flex; gap: var(--spacing-xs); align-items: center; }
        .verb-desc { grid-column: 1 / -1; color: var(--color-muted); }
        .scope-tag { color: var(--color-info); background: var(--color-info-soft); border-radius: var(--radius-sm); padding: 2px var(--spacing-xs); }
        .risk { border-radius: var(--radius-sm); padding: 2px var(--spacing-xs); }
        .risk-ok { color: var(--color-ok); background: var(--color-ok-soft); }
        .risk-warn { color: var(--color-warn); background: var(--color-warn-soft); }
        .risk-danger { color: var(--color-danger); background: var(--color-danger-soft); }
        .risk-info { color: var(--color-info); background: var(--color-info-soft); }
        .inspector {
          background: var(--color-surface); border: 1px solid var(--color-line); border-radius: var(--radius-lg);
          padding: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0;
        }
        .inspector h4 { margin-top: var(--spacing-sm); color: var(--color-muted); font-size: var(--typography-label-font-size); text-transform: uppercase; letter-spacing: var(--typography-label-letter-spacing); }
        .inspector-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
        .actions { display: flex; gap: var(--spacing-sm); }
        .act-primary { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); }
        .act-primary:hover:not(:disabled) { background: var(--color-primary-strong); }
        .act-danger { background: var(--color-danger-soft); color: var(--color-danger); border-color: var(--color-danger); }
        .versions { display: flex; flex-direction: column; gap: var(--spacing-xs); }
        .versions li { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
        .result { border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: var(--spacing-sm); }
        .result.is-ok { border-color: var(--color-ok); }
        .result.is-error { border-color: var(--color-danger); }
        .result-head { font-weight: var(--typography-title-font-weight); margin-bottom: var(--spacing-sm); }
        .code {
          font-family: var(--typography-code-font-family); font-size: var(--typography-code-font-size);
          line-height: var(--typography-code-line-height); background: var(--color-background);
          border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: var(--spacing-sm);
          max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; margin: var(--spacing-sm) 0 0;
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
      </style>
      <header data-design-component="forge-header">
        <div class="mark"><span class="wordmark">CmdSmith</span><span class="badge">Pipeline Forge</span></div>
        <div class="head-right">
          <span class="count" aria-live="polite">${escapeHtml(count)}</span>
          <button type="button" data-act="refresh" ${this.busy ? 'disabled' : ''}>Refresh</button>
        </div>
      </header>
      ${this.renderStatus()}
      <div class="split">
        ${this.renderList()}
        ${this.renderInspector()}
      </div>`;

    root.querySelector('[data-act="refresh"]')?.addEventListener('click', () => this.load());
    root.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => {
      this.scope = button.getAttribute('data-scope');
      this.render();
    }));
    root.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => {
      const item = this.commands.items.find(entry => this.key(entry) === button.getAttribute('data-key'));
      if (item) this.inspect(item);
    }));
    root.querySelector('[data-act="test"]')?.addEventListener('click', () => this.runTest());
    root.querySelector('[data-act="remove"]')?.addEventListener('click', () => this.runRemove());
    root.querySelectorAll('[data-rollback]').forEach(button => button.addEventListener('click', () => {
      this.runRollback(Number.parseInt(button.getAttribute('data-rollback'), 10));
    }));
  }
}

if (!customElements.get('tr-composable-cli-home')) {
  customElements.define('tr-composable-cli-home', ComposableCliHome);
}
