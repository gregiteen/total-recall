/** Automations control ledger. Values come only from the inventory owner. */
const SCREENS = [
  { id: 'scheduled', label: 'Scheduled' }, { id: 'nodes', label: 'Nodes' },
  { id: 'audit', label: 'Audit' }, { id: 'run', label: 'Run' },
];
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = (value) => String(value ?? 'unknown').replaceAll('_', ' ').replaceAll('-', ' ');
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : '— not recorded';
const stateClass = (value) => ['error', 'failed', 'offline', 'unreachable', 'unauthorized'].includes(value) ? 'bad' : 'neutral';

/** Decode the host wrapper without turning command failures into inventory. */
export function decodeInventory(result) {
  if (result?.success === false || (typeof result?.exitCode === 'number' && result.exitCode !== 0) || (typeof result?.code === 'number' && result.code !== 0)) {
    throw new Error(result.error || 'Inventory command failed');
  }
  let data = result?.output !== undefined ? result.output : result;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { throw new Error('Inventory returned invalid JSON'); }
  }
  if (!data || !Array.isArray(data.nodes) || data.nodes.some((node) => !node || !Array.isArray(node.automations))) {
    throw new Error('Inventory response is incomplete or unsupported');
  }
  return data;
}

export class AutomationsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.screen = 'scheduled';
    this.filters = { node: '', source: '', trigger: '', state: '' };
    this.inventory = null;
    this.phase = 'unchecked';
    this.error = '';
    this.feedback = '';
    this.selected = '';
    this.request = 0;
    this.attemptedAt = null;
    this.pendingControl = null;
    this.boundClick = (event) => this.click(event);
    this.boundChange = (event) => this.change(event);
    this.boundKey = (event) => this.key(event);
    this.boundScreen = (event) => {
      if (event.detail?.pluginId === this.host?.pluginId) this.selectScreen(event.detail.screen);
    };
  }

  get host() { return this._host; }
  set host(value) {
    this._host = value;
    if (this.isConnected && value?.run) void this.refresh();
  }
  get screens() { return SCREENS; }

  connectedCallback() {
    this.shadowRoot.addEventListener('click', this.boundClick);
    this.shadowRoot.addEventListener('change', this.boundChange);
    this.shadowRoot.addEventListener('keydown', this.boundKey);
    window.addEventListener('plugin-show-screen', this.boundScreen);
    this.render();
    void this.refresh();
  }

  disconnectedCallback() {
    this.request++;
    this.controller?.abort();
    this.shadowRoot.removeEventListener('click', this.boundClick);
    this.shadowRoot.removeEventListener('change', this.boundChange);
    this.shadowRoot.removeEventListener('keydown', this.boundKey);
    window.removeEventListener('plugin-show-screen', this.boundScreen);
  }

  async invoke(command, args = []) {
    if (this.host?.run) return this.host.run(command, args);
    const response = await fetch('/api/plugins/automations/run', {
      method: 'POST', credentials: 'same-origin', signal: this.controller?.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subcommand: command, args }),
    });
    if (!response.ok) throw new Error(`Automation request failed (${response.status})`);
    return response.json();
  }

  async refresh() {
    const request = ++this.request;
    this.controller?.abort();
    this.controller = new AbortController();
    this.phase = 'loading'; this.inventory = null; this.error = ''; this.feedback = ''; this.pendingControl = null;
    this.attemptedAt = new Date().toISOString();
    this.render();
    try {
      const data = decodeInventory(await this.invoke('list'));
      if (request !== this.request || !this.isConnected) return;
      this.inventory = data; this.phase = 'ready';
    } catch (error) {
      if (request !== this.request || !this.isConnected) return;
      this.inventory = null; this.phase = 'error';
      this.error = error.message || 'Automation inventory unavailable';
    }
    this.render();
  }

  records() {
    return (this.inventory?.nodes || []).flatMap((node) => node.automations.map((item) => ({
      ...item, _node: node, _key: `${node.node_id || node.ip || node.hostname}:${item.id || `${item.plugin_id}:${item.command}`}`,
    })));
  }
  filteredRecords() {
    return this.records().filter((item) =>
      (!this.filters.node || this.nodeKey(item._node) === this.filters.node) &&
      (!this.filters.source || item.source === this.filters.source) &&
      (!this.filters.trigger || item.trigger?.kind === this.filters.trigger) &&
      (!this.filters.state || item.state === this.filters.state));
  }
  nodeKey(node) { return String(node.node_id || node.ip || node.hostname || ''); }
  selectedRecord() {
    const records = this.filteredRecords();
    return records.find((item) => item._key === this.selected) || records[0];
  }
  selectScreen(screen, focus = false) {
    if (!SCREENS.some((item) => item.id === screen)) return;
    this.screen = screen; this.feedback = ''; this.pendingControl = null; this.render();
    this.host?.screenChanged?.(screen);
    if (focus) this.shadowRoot.querySelector(`[data-screen="${screen}"]`)?.focus();
  }
  key(event) {
    const tab = event.target.closest('[data-screen]');
    if (!tab) return;
    const index = SCREENS.findIndex((item) => item.id === tab.dataset.screen);
    const next = event.key === 'ArrowRight' ? (index + 1) % SCREENS.length
      : event.key === 'ArrowLeft' ? (index + SCREENS.length - 1) % SCREENS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? SCREENS.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); this.selectScreen(SCREENS[next].id, true);
  }
  change(event) {
    const filter = event.target.dataset.filter;
    if (!(filter in this.filters)) return;
    this.filters[filter] = event.target.value; this.selected = ''; this.pendingControl = null; this.render();
    this.shadowRoot.querySelector(`[data-filter="${filter}"]`)?.focus();
  }
  click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.screen) this.selectScreen(button.dataset.screen, true);
    else if (button.dataset.record) {
      this.selected = button.dataset.record; this.pendingControl = null; this.render();
      const selected = [...this.shadowRoot.querySelectorAll('[data-record]')].find((item) => item.dataset.record === this.selected);
      selected?.focus();
    } else if (button.dataset.action === 'refresh') void this.refresh();
    else if (button.dataset.action === 'copy') void this.copyOutput();
    else if (button.dataset.action === 'confirm-control') void this.executeControl(this.pendingControl?.index, true);
    else if (button.dataset.action === 'dismiss-control') { this.pendingControl = null; this.render(); }
    else if (button.dataset.control) void this.executeControl(Number(button.dataset.control));
  }

  async copyOutput() {
    if (!this.inventory) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(JSON.stringify(this.inventory, null, 2));
      if (this.isConnected) this.feedback = 'Inventory copied';
    } catch (error) { if (this.isConnected) this.feedback = `Copy failed: ${error.message}`; }
    if (this.isConnected) this.render();
  }

  async executeControl(index, confirmed = false) {
    const item = this.selectedRecord();
    const action = item?.actions?.[index];
    if (!action || typeof action.command !== 'string' || !Array.isArray(action.args) || !action.args.every((arg) => typeof arg === 'string')) return;
    if (Array.isArray(this.host?.operations) && !this.host.operations.includes(action.command)) {
      this.feedback = 'Action unavailable for this access level'; this.render(); return;
    }
    if (!['read', 'write', 'destructive', 'send'].includes(action.effect)) {
      this.feedback = 'Action unavailable: source did not declare its effect'; this.render(); return;
    }
    if (action.effect !== 'read') {
      if (!confirmed) { this.pendingControl = { key: item._key, index }; this.render(); return; }
      if (this.pendingControl?.key !== item._key || this.pendingControl.index !== index) return;
    }
    this.pendingControl = null;
    this.feedback = 'Submitting source action…'; this.render();
    const request = this.request;
    try {
      const result = await this.invoke(action.command, action.args);
      if (request !== this.request || !this.isConnected) return;
      if (result?.success === false || result?.code > 0 || result?.exitCode > 0) throw new Error(result.error || 'Source rejected the action');
      await this.refresh();
      if (this.isConnected) this.feedback = 'Source action completed; inventory refreshed';
    } catch (error) {
      if (request !== this.request || !this.isConnected) return;
      this.feedback = `Action failed: ${error.message}`;
    }
    if (this.isConnected) this.render();
  }

  renderFilters() {
    const records = this.records();
    const options = (values, selected) => '<option value="">All</option>' + [...new Set(values.filter(Boolean))].sort().map((value) => `<option value="${escape(value)}" ${selected === value ? 'selected' : ''}>${escape(words(value))}</option>`).join('');
    return `<div class="filters">
      <label>Node<select data-filter="node">${'<option value="">All</option>' + (this.inventory?.nodes || []).map((node) => `<option value="${escape(this.nodeKey(node))}" ${this.filters.node === this.nodeKey(node) ? 'selected' : ''}>${escape(node.hostname || node.ip || 'Unnamed node')}</option>`).join('')}</select></label>
      <label>Source<select data-filter="source">${options(records.map((item) => item.source), this.filters.source)}</select></label>
      <label>Trigger<select data-filter="trigger">${options(records.map((item) => item.trigger?.kind), this.filters.trigger)}</select></label>
      <label>State<select data-filter="state">${options(records.map((item) => item.state), this.filters.state)}</select></label>
    </div>`;
  }

  renderDetails(item, controls = false) {
    if (!item) return '<section class="detail"><h3>No automation selected</h3><p>Select a record after discovery.</p></section>';
    const knownBool = (value, yes, no) => value === true ? yes : value === false ? no : '— not reported';
    const run = item.last_run;
    return `<section class="detail"><p class="eyebrow">${escape(words(item.source || 'source not reported'))}</p><h3>${escape(item.name || item.intent || item.id || item.command)}</h3>
      <dl>
        <dt>Trigger</dt><dd>${escape(item.trigger?.summary || item.schedule || '— not reported')} <span class="subtle">${escape(item.trigger?.kind || '')}</span></dd>
        <dt>Enabled</dt><dd>${escape(knownBool(item.enabled, 'Enabled', 'Disabled'))}</dd>
        <dt>Runner</dt><dd>${escape(knownBool(item.runner_available, 'Available', 'Unavailable'))}</dd>
        <dt>Node</dt><dd>${escape(item._node.hostname || item._node.ip || '— not reported')}</dd>
        <dt>Placement</dt><dd>${escape(words(item.placement || 'not reported'))}</dd>
        <dt>Origin</dt><dd class="mono">${escape(item.origin || item.id || '— not reported')}</dd>
        <dt>Last handled slot</dt><dd>${escape(item.last_handled_slot || '— not recorded')}</dd>
        <dt>Observed run</dt><dd>${run ? `${escape(words(run.state))} · ${escape(date(run.at))}${run.exit_code != null ? ` · exit ${escape(run.exit_code)}` : ''}` : '— no run outcome recorded'}</dd>
      </dl>
      ${controls ? this.renderControls(item) : '<p class="note">A handled slot is scheduling evidence. It does not establish a successful run.</p>'}
    </section>`;
  }
  renderControls(item) {
    const actions = Array.isArray(item.actions) ? item.actions : [];
    const pending = this.pendingControl?.key === item._key ? actions[this.pendingControl.index] : null;
    return `<div class="source-actions">${actions.length ? actions.map((action, index) => `<button data-control="${index}" ${this.feedback === 'Submitting source action…' ? 'disabled' : ''}>${escape(action.label || words(action.command))}<span class="effect">${escape(action.effect || 'effect not declared')}</span></button>`).join('') : '<p>No executable controls were advertised by this source.</p>'}</div>${pending ? `<section class="confirmation" role="group" aria-label="Confirm source action"><p>${escape(pending.label || words(pending.command))}: <strong>${escape(item.name || item.id)}</strong>?</p><div class="source-actions"><button data-action="confirm-control">Confirm ${escape(pending.label || words(pending.command))}</button><button data-action="dismiss-control">Keep unchanged</button></div></section>` : ''}<p class="note">Actions are delegated to the source owner. Available controls depend on its capabilities and your access.</p>`;
  }
  renderScheduled() {
    const records = this.filteredRecords();
    return `${this.renderFilters()}<div class="ledger"><section class="index"><h3>Automation index <span class="count">${records.length}</span></h3>${records.length ? `<ul>${records.map((item) => `<li><button data-record="${escape(item._key)}" aria-pressed="${this.selectedRecord()?._key === item._key}"><span><strong>${escape(item.name || item.intent || item.id || item.command)}</strong><small>${escape(item._node.hostname || item._node.ip)} · ${escape(words(item.source || 'source not reported'))}</small></span><span class="state ${stateClass(item.state)}">${escape(words(item.state))}</span></button></li>`).join('')}</ul>` : '<p>No records match these filters.</p>'}</section>${this.renderDetails(this.selectedRecord())}</div>`;
  }
  renderNodes() {
    const nodes = this.inventory?.nodes || [];
    return `<div class="node-grid">${nodes.map((node) => `<section class="node"><header><h3>${escape(node.hostname || node.ip || 'Unnamed node')}</h3><span class="state ${stateClass(node.status)}">${escape(words(node.status))}</span></header><p class="mono">${escape(node.ip || node.node_id || '— address not reported')}</p>${node.error ? `<p class="bad">${escape(node.error)}</p>` : ''}${Array.isArray(node.coverage) && node.coverage.length ? `<ul class="coverage">${node.coverage.map((coverage) => `<li><div><strong>${escape(words(coverage.source))}</strong><span class="state ${stateClass(coverage.status)}">${escape(words(coverage.status))}</span></div>${coverage.error ? `<p>${escape(coverage.error)}</p>` : ''}<small>${escape(date(coverage.checked_at))}</small></li>`).join('')}</ul>` : '<p>— source coverage was not reported. This node cannot establish complete discovery.</p>'}</section>`).join('') || '<p>No mesh nodes were reported.</p>'}</div>`;
  }
  renderAudit() {
    const records = this.filteredRecords();
    return `${this.renderFilters()}<p class="note">Observed outcomes only. Declarations and handled slots do not prove execution.</p><ul class="audit">${records.map((item) => `<li><div><strong>${escape(item.name || item.id || item.command)}</strong><small>${escape(item._node.hostname || item._node.ip)} · ${escape(words(item.source))}</small></div><div><span class="state ${stateClass(item.last_run?.state)}">${escape(item.last_run ? words(item.last_run.state) : 'No observed run')}</span><small>${escape(date(item.last_run?.at))}</small>${item.last_run?.exit_code != null ? `<small>Exit ${escape(item.last_run.exit_code)}</small>` : ''}</div></li>`).join('') || '<li>No records match these filters.</li>'}</ul>`;
  }
  renderRun() {
    const records = this.filteredRecords();
    return `${this.renderFilters()}<div class="ledger"><section class="index"><h3>Choose a source-owned action</h3><p>Only advertised controls are executable.</p><ul>${records.map((item) => `<li><button data-record="${escape(item._key)}" aria-pressed="${this.selectedRecord()?._key === item._key}"><span><strong>${escape(item.name || item.id || item.command)}</strong><small>${escape(item._node.hostname || item._node.ip)} · ${(item.actions || []).length} advertised controls</small></span></button></li>`).join('')}</ul></section>${this.renderDetails(this.selectedRecord(), true)}</div>`;
  }
  render() {
    const focus = this.shadowRoot.activeElement;
    const focusedAction = focus?.dataset.action;
    const status = this.phase === 'loading' ? 'Checking sources' : this.phase === 'error' ? 'Inventory unavailable'
      : this.phase === 'ready' ? (this.inventory.complete === true ? 'Discovery complete' : 'Partial discovery — inspect source coverage') : 'Not checked';
    const content = this.phase !== 'ready' ? `<div class="empty"><h3>${escape(status)}</h3><p>${escape(this.phase === 'error' ? this.error : this.phase === 'loading' ? 'Reading automation sources and node availability…' : 'Refresh to inspect automation sources.')}</p></div>`
      : this.screen === 'nodes' ? this.renderNodes() : this.screen === 'audit' ? this.renderAudit() : this.screen === 'run' ? this.renderRun() : this.renderScheduled();
    this.shadowRoot.innerHTML = `
      <style>
      :host { --face-bg:#181713; --face-surface:#24221c; --face-text:#f4efe5; --face-muted:#c5bca9; --face-border:#726652; --face-accent:#f2bd63; --face-error:#ffb5a9; --face-focus:#b8d9ff; --automation-bg:var(--bg-card,var(--face-bg)); --automation-surface:var(--bg-elevated,var(--face-surface)); --automation-text:var(--text-primary,var(--face-text)); --automation-muted:var(--text-secondary,var(--face-muted)); --automation-border:var(--border,var(--face-border)); --automation-accent:var(--accent,var(--face-accent)); --automation-error:var(--face-error); --automation-focus:var(--face-focus); display:block; color:var(--automation-text); font:14px/1.45 system-ui,sans-serif; min-width:0; color-scheme:dark; }
      *,*::before,*::after { box-sizing:border-box; } button,select { font:inherit; color:inherit; min-height:44px; min-width:44px; } button { cursor:pointer; } button:disabled { cursor:wait; opacity:.6; } button:focus-visible,select:focus-visible { outline:3px solid var(--automation-focus); outline-offset:3px; } .workspace { border:1px solid var(--automation-border); border-radius:12px; background:var(--automation-bg); overflow:hidden; } .masthead { padding:20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; } .brand { display:flex; gap:12px; align-items:center; flex:1; min-width:0; } svg { width:40px; height:40px; color:var(--automation-accent); flex:none; } h2,h3,p { margin:0; } h2 { font-size:20px; letter-spacing:-.03em; } h3 { font-size:15px; } .eyebrow { text-transform:uppercase; letter-spacing:.11em; font-size:10px; color:var(--automation-muted); margin-bottom:4px; } .subtle,small,.note { color:var(--automation-muted); } small { display:block; font-size:11px; margin-top:3px; overflow-wrap:anywhere; } .refresh { border:1px solid var(--automation-accent); background:var(--automation-accent); color:var(--automation-bg); border-radius:7px; padding:8px 14px; font-weight:700; } .status-line { padding:12px 20px; background:var(--automation-surface); border-block:1px solid var(--automation-border); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; } .status-line strong { font-size:12px; font-weight:600; } .tabs { display:flex; padding:8px 12px 0; gap:4px; border-bottom:1px solid var(--automation-border); } .tabs button { flex:1; background:transparent; border:0; border-bottom:3px solid transparent; padding:10px 4px; color:var(--automation-muted); } .tabs button[aria-selected=true] { border-color:var(--automation-accent); color:var(--automation-text); font-weight:700; } .body { padding:16px; min-height:200px; animation:reveal .16s ease-out; } .filters { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:16px; } label { font-size:11px; color:var(--automation-muted); display:grid; gap:4px; } select { width:100%; max-width:100%; background:var(--automation-surface); border:1px solid var(--automation-border); border-radius:5px; padding:6px; } .ledger { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; } .index,.detail,.node { min-width:0; } .index h3 { margin-bottom:8px; } ul { list-style:none; padding:0; margin:0; } .index ul { max-height:380px; overflow:auto; } .index li+li { margin-top:6px; } .index button { width:100%; display:flex; justify-content:space-between; gap:12px; align-items:center; text-align:left; padding:12px; background:transparent; border:1px solid var(--automation-border); border-radius:7px; } .index button[aria-pressed=true] { border-color:var(--automation-accent); background:var(--automation-surface); } strong { overflow-wrap:anywhere; } .state { display:inline-block; text-transform:none; font:11px/1.4 ui-monospace,monospace; border:1px solid var(--automation-border); border-radius:4px; padding:3px 6px; overflow-wrap:anywhere; } .bad { color:var(--automation-error); } .detail { border-left:2px solid var(--automation-accent); padding:0 0 0 16px; } .detail h3 { font-size:19px; margin-bottom:12px; overflow-wrap:anywhere; } dl { display:grid; grid-template-columns:minmax(80px,.7fr) minmax(0,1fr); gap:9px 12px; margin:0; } dt { color:var(--automation-muted); font-size:11px; } dd { margin:0; overflow-wrap:anywhere; font-size:12px; } .mono { font-family:ui-monospace,monospace; overflow-wrap:anywhere; font-size:11px; } .note { font-size:11px; margin-top:16px; } .count { font:11px ui-monospace,monospace; margin-left:4px; color:var(--automation-muted); } .node-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr)); gap:16px; } .node { border:1px solid var(--automation-border); border-radius:8px; padding:14px; } .node header { display:flex; justify-content:space-between; align-items:start; gap:12px; margin-bottom:4px; } .coverage { margin-top:12px; } .coverage li { border-top:1px solid var(--automation-border); padding:10px 0; } .coverage li>div { display:flex; justify-content:space-between; align-items:center; gap:12px; } .coverage strong { font-size:12px; } .coverage p { font-size:12px; margin-top:6px; } .audit li { display:flex; justify-content:space-between; gap:16px; padding:12px 0; border-bottom:1px solid var(--automation-border); } .audit li>div { min-width:0; } .audit li>div:last-child { text-align:right; } .audit { margin-top:12px; } .source-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; } .source-actions button { border:1px solid var(--automation-accent); border-radius:5px; background:var(--automation-surface); padding:8px 12px; } .effect { display:block; font:10px ui-monospace,monospace; color:var(--automation-muted); } .footer { display:flex; align-items:center; justify-content:space-between; padding:8px 16px; gap:12px; border-top:1px solid var(--automation-border); } .footer button { background:transparent; border:0; color:var(--automation-muted); padding:8px; font-size:12px; } .feedback { font-size:12px; overflow-wrap:anywhere; } .empty { padding:26px 12px; } .empty p { color:var(--automation-muted); margin-top:8px; } @keyframes reveal { from { opacity:.65; } to { opacity:1; } } @media(max-width:600px) { .masthead { padding:16px; gap:10px; } .filters { grid-template-columns:repeat(2,minmax(0,1fr)); } .ledger { grid-template-columns:minmax(0,1fr); } .detail { border-left:0; border-top:2px solid var(--automation-accent); padding:16px 0 0; } .index ul { max-height:260px; } .status-line { padding:10px 16px; } .body { padding:12px; } h2 { font-size:18px; } } @media(prefers-reduced-motion:reduce) { .body { animation:none; } }
      </style>
      <div class="workspace"><header class="masthead"><div class="brand"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M4 20h9m0 0 7-11h12m-19 11 7 11h12M13 20h19" stroke="currentColor" stroke-width="2"/><circle cx="5" cy="20" r="3" fill="currentColor"/><path d="M30 6h6v6h-6zM30 17h6v6h-6zM30 28h6v6h-6z" stroke="currentColor" stroke-width="2"/></svg><div><p class="eyebrow">Triggers · sources · outcomes</p><h2>Automations</h2></div></div><button class="refresh" data-action="refresh" ${this.phase === 'loading' ? 'disabled' : ''}>Refresh</button></header>
      <div class="status-line" role="status" aria-live="polite"><strong class="${this.phase === 'error' ? 'bad' : ''}">${escape(status)}</strong><small>${this.phase === 'ready' ? 'Checked' : 'Last attempt'} ${escape(date(this.phase === 'ready' ? this.inventory.checked_at : this.attemptedAt))}</small></div>
      <nav class="tabs" role="tablist" aria-label="Automation views">${SCREENS.map((screen) => `<button id="tab-${screen.id}" role="tab" aria-controls="panel-${screen.id}" aria-selected="${this.screen === screen.id}" tabindex="${this.screen === screen.id ? '0' : '-1'}" data-screen="${screen.id}">${screen.label}</button>`).join('')}</nav>
      <div class="body" id="panel-${this.screen}" role="tabpanel" aria-labelledby="tab-${this.screen}" tabindex="0" aria-busy="${this.phase === 'loading'}">${content}</div>
      <footer class="footer"><span class="feedback" role="status">${escape(this.feedback || (this.phase === 'ready' ? 'Coverage determines completeness.' : 'No current inventory.'))}</span><button data-action="copy" ${this.inventory ? '' : 'disabled'}>Copy inventory</button></footer></div>`;
    if (focusedAction) this.shadowRoot.querySelector(`[data-action="${focusedAction}"]`)?.focus();
  }
}

// Card and panel share the same inventory contract.
export const ChronosAutomationsCard = AutomationsCard;
export class AutomationsElement extends AutomationsCard {}
if (!customElements.get('tr-automations-card')) customElements.define('tr-automations-card', AutomationsCard);
if (!customElements.get('automations-card')) customElements.define('automations-card', class extends AutomationsCard {});
if (!customElements.get('tr-automations')) customElements.define('tr-automations', AutomationsElement);
