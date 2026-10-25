/** The mesh operator's five views. All observations arrive through the scoped host. */
const DASH = '—';
const words = value => typeof value === 'string' && value ? value : DASH;
const list = value => Array.isArray(value) ? value : [];
export function asObject(result) {
  if (result == null || result.ok === false) return null;
  if (typeof result === 'object') return typeof result.output === 'string' ? asObject(result.output) : result;
  if (typeof result !== 'string') return null;
  for (let start = 0; start < result.length; start++) {
    if (!'{['.includes(result[start])) continue;
    let depth = 0, quoted = false;
    for (let end = start; end < result.length; end++) {
      const ch = result[end];
      if (quoted) { if (ch === '\\') end++; else if (ch === '"') quoted = false; }
      else if (ch === '"') quoted = true;
      else if ('{['.includes(ch)) depth++;
      else if ('}]'.includes(ch) && --depth === 0) {
        try { return JSON.parse(result.slice(start, end + 1)); } catch { break; }
      }
    }
  }
  return null;
}
export function joinNodes(status, doctor) {
  return list(status?.nodes).map(node => {
    const probe = list(doctor).find(p => node.ip ? p.ip === node.ip : !p.ip && node.hostname && p.hostname === node.hostname);
    const loginApplicable = !node.self && !/^(ios|ipados|android)$/i.test(node.os || '') && !node.vault_only;
    const reach = probe?.reachable === true ? 'reachable' : probe?.reachable === false && (probe.sshConfigured || node.self) ? 'unreachable' : 'unprobed';
    let tone = 'neutral', severity = 1, label = 'Not probed';
    if (node.vault_only) { label = 'Recorded only'; severity = -2; }
    else if (node.online === false) { label = 'Offline'; severity = -1; }
    else if (node.online === true && reach === 'unreachable') { label = 'Stops at Run'; tone = 'danger'; severity = 4; }
    else if (loginApplicable && node.access_state !== 'configured') { label = 'Stops at Login'; tone = 'warn'; severity = 3; }
    else if (!loginApplicable && !node.self) { label = 'Member · no remote shell'; severity = 0; }
    else if (reach === 'reachable') { label = 'Execution verified'; tone = 'ok'; severity = 0; }
    return { ...node, probe, reach, loginApplicable, vaultOnly: node.vault_only === true, accessState: node.access_state, tone, severity, label, runtimes: list(probe?.runtimes), harnesses: list(probe?.harnesses), reason: probe?.error };
  });
}
export function meshVerdict(status, doctor, leader) {
  if (!status) return { tone: 'neutral', text: 'Cannot verify the mesh.' };
  if (status.state !== 'connected') return { tone: 'danger', text: 'This machine is disconnected.' };
  if (status.control?.verified !== true) return { tone: 'danger', text: 'Control server unverified; observations are incomplete.' };
  const nodes = joinNodes(status, doctor).filter(n => !n.vaultOnly && (n.loginApplicable || n.self) && n.online !== false);
  if (!nodes.length) return { tone: 'neutral', text: 'No online execution targets observed.' };
  const danger = nodes.filter(n => n.tone === 'danger').length;
  if (danger) return { tone: 'danger', text: `${danger} online machine${danger === 1 ? '' : 's'} failed execution.` };
  const missing = nodes.filter(n => n.label === 'Stops at Login').length;
  if (missing) return { tone: 'warn', text: `${missing} machine${missing === 1 ? '' : 's'} need a recorded login.` };
  if (nodes.some(n => n.reach !== 'reachable') || !Array.isArray(doctor) || !leader) return { tone: 'warn', text: 'Execution is partly verified.' };
  return { tone: 'ok', text: 'Online execution targets answered.' };
}
export function capabilityState(node, column) {
  const [kind, name] = column.split(':');
  if (kind === 'io') {
    const io = node.io;
    const values = { screen: io?.display?.present, microphone: io?.audio?.input, speaker: io?.audio?.output, camera: io?.camera?.present, headless: io?.headless };
    return typeof values[name] === 'boolean' ? values[name] ? 'Present · recorded' : 'Absent · recorded' : 'Unknown';
  }
  if (node.reach !== 'reachable') return 'Unknown';
  const available = kind === 'runtime' ? node.runtimes : node.harnesses;
  if (available.includes(name)) return 'Present';
  const tested = kind === 'runtime' ? node.probe?.tested_runtimes : node.probe?.tested_harnesses;
  return list(tested).includes(name) ? 'Absent' : 'Unknown';
}
function hostName(url) { try { return new URL(url).host; } catch { return DASH; } }
const sourceLabels = { grants: 'Secrets', plugins: 'Plugins', updates: 'Updates', tasks: 'Scheduled work', agents: 'Agents', alerts: 'Alerts', deployments: 'Deployments', policy: 'Policy', presence: 'Presence' };

export class MeshlinkControlCard extends HTMLElement {
  constructor() {
    super(); this.status = null; this.doctor = null; this.leader = null;
    this.errors = {}; this.views = {}; this.loading = {}; this.pings = {};
    this.screen = 'machines'; this.selected = null; this.filters = new Set();
    this.loginDrafts = {};
    this.busy = false; this.confirmEnrollment = false;
  }
  get screens() { return [
    { id: 'machines', label: 'Machines' }, { id: 'flows', label: 'Flows' },
    { id: 'placement', label: 'Placement' }, { id: 'boundary', label: 'Boundary' }, { id: 'join', label: 'Join' },
  ]; }
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.onScreen = event => { if ((!event.detail?.pluginId || event.detail.pluginId === this.host?.pluginId) && this.screens.some(s => s.id === event.detail?.screen)) void this.show(event.detail.screen); };
    window.addEventListener('plugin-show-screen', this.onScreen);
    void this.read();
  }
  disconnectedCallback() { window.removeEventListener('plugin-show-screen', this.onScreen); }
  async call(operation, args = []) {
    if (!this.host?.run) throw new Error('Mesh command runner unavailable. Open this view in the dashboard.');
    const result = await this.host.run(operation, args);
    if (result?.ok === false) throw new Error('Owner command failed. Inspect its CLI result.');
    return result;
  }
  async readOne(key, op, args) {
    this[key] = null; delete this.errors[key]; this.paint();
    try {
      const value = asObject(await this.call(op, args));
      if (!value || key === 'doctor' && !Array.isArray(value) || key !== 'doctor' && Array.isArray(value)) throw new Error('Command returned an unreadable observation.');
      this[key] = value;
    } catch (error) { this.errors[key] = error.message; }
    this.paint();
  }
  read() {
    if (this.busy) return this.readPromise;
    this.busy = true; this.lastAttempt = new Date().toISOString(); this.pings = {}; this.paint();
    this.readPromise = Promise.all([
      this.readOne('status', 'status', ['--json']), this.readOne('doctor', 'doctor', ['--json']),
      this.readOne('leader', 'leader', ['--json']), this.readView(this.screen, true),
    ]).finally(() => { this.busy = false; this.paint(); });
    return this.readPromise;
  }
  async readView(screen, force = false) {
    if (this.loading[screen]) return this.loading[screen];
    if (this.views[screen] && !force) return;
    delete this.views[screen]; delete this.errors[`view-${screen}`];
    this.loading[screen] = (async () => {
      try {
        const view = asObject(await this.call('view', [screen, '--json']));
        if (!view?.sources || typeof view.sources !== 'object') throw new Error('Screen sources were not returned.');
        this.views[screen] = view;
      } catch (error) { this.errors[`view-${screen}`] = error.message; }
      finally { delete this.loading[screen]; this.paint(); }
    })();
    this.paint(); return this.loading[screen];
  }
  async show(screen) {
    if (!this.screens.some(s => s.id === screen)) return;
    this.screen = screen; this.confirmEnrollment = false; this.paint();
    this.host?.screenChanged?.(screen);
    if (this.busy) await this.readPromise;
    await this.readView(screen);
  }
  canRun(operation) { return Array.isArray(this.host?.operations) && this.host.operations.includes(operation); }
  async ping(node) {
    this.pings[node.ip] = { state: 'checking' }; this.paint();
    try {
      const value = asObject(await this.call('ping', [node.ip, '--json']));
      const rows = Array.isArray(value) ? value : value?.ip ? [value] : list(value?.results);
      const observation = rows.find(row => row.ip === node.ip || row.node === node.ip || row.hostname === node.hostname);
      if (!observation || typeof observation.reachable !== 'boolean') throw new Error('Ping returned no matching path observation.');
      this.pings[node.ip] = { state: observation.reachable ? 'passed' : 'failed', detail: observation.latency_ms == null ? words(observation.error) : `${observation.latency_ms} ms` };
    } catch (error) { this.pings[node.ip] = { state: 'failed', detail: error.message }; }
    this.paint();
  }
  async action(operation, args, label) {
    this.actionMessage = `${label}…`; this.paint();
    try { await this.call(operation, args); this.actionMessage = `${label} completed.`; await this.read(); }
    catch (error) { this.actionMessage = `${label} failed: ${error.message}`; }
    this.paint();
  }
  el(tag, props = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'text') element.textContent = value;
      else if (key === 'class') element.className = value;
      else if (key === 'dataset') Object.assign(element.dataset, value);
      else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else element.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) if (child) element.append(child);
    return element;
  }
  text(value, cls = '') { return this.el('p', { text: value, class: cls }); }
  button(label, fn, props = {}) { return this.el('button', { type: 'button', text: label, onclick: fn, ...props }); }
  section(title, ...children) { return this.el('section', { class: 'block' }, this.el('h3', { text: title }), children); }
  command(value) { return this.el('pre', { class: 'command', text: value }); }
  fields(rows) { return this.el('dl', {}, rows.map(([key, value]) => [this.el('dt', { text: key }), this.el('dd', { text: value == null ? DASH : String(value) })])); }
  render() {
    this.shadowRoot.innerHTML = `
      <style>
      :host { --face-bg:var(--bg-primary,#0b1020); --face-panel:var(--bg-secondary,#121933); --face-line:var(--border,#26305a); --face-text:var(--text-primary,#e8ecff); --face-muted:var(--text-secondary,#aab5d7); --face-brand:var(--accent,#818cf8); --face-ok:#34d399; --face-warn:#fbbf24; --face-danger:#f87171; display:block; color:var(--face-text); background:var(--face-bg); font:14px/1.5 system-ui,sans-serif; padding:16px; container-type:inline-size; border:1px solid var(--face-line); border-radius:8px; }
      * { box-sizing:border-box; min-width:0; } h2,h3,p { margin:0 0 8px; } h2 { font-size:18px; } h3 { font-size:14px; } button,input { font:inherit; min-height:44px; color:inherit; background:var(--face-bg); border:1px solid var(--face-line); border-radius:5px; padding:8px 12px; } button { cursor:pointer; text-align:left; } button:hover { border-color:var(--face-brand); } button:disabled { opacity:.65; cursor:wait; } button:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--face-brand); outline-offset:2px; } [data-tone=ok] { color:var(--face-ok); } [data-tone=warn] { color:var(--face-warn); } [data-tone=danger] { color:var(--face-danger); } .muted,dt,small { color:var(--face-muted); } .strip { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:14px; } .strip strong { display:block; overflow-wrap:anywhere; } .verdict { border-left:3px solid currentColor; padding:8px 12px; background:var(--face-panel); } nav { display:flex; flex-wrap:wrap; gap:6px; margin:14px 0; } nav button[aria-selected=true] { border-color:var(--face-brand); background:var(--face-panel); } .refresh { margin-left:auto; } .block { padding:14px; background:var(--face-panel); border:1px solid var(--face-line); border-radius:6px; margin-bottom:12px; overflow-wrap:anywhere; } .panes { display:grid; grid-template-columns:minmax(190px,.8fr) minmax(0,1.6fr); gap:12px; align-items:start; } .roster { display:grid; gap:6px; } .roster button { display:grid; gap:3px; width:100%; } .roster button[aria-pressed=true] { border-color:var(--face-brand); } .ladder { display:grid; gap:8px; } .rung { display:grid; grid-template-columns:70px 1fr; gap:8px; border:1px dashed var(--face-line); padding:10px; border-radius:4px; } .rung[data-state=passed] { border-style:solid; border-left:4px solid var(--face-ok); } .rung[data-state=failed] { border-style:double; border-left:4px solid var(--face-danger); } .rung[data-state=na] { border-style:dotted; color:var(--face-muted); } .actions,.filters { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; } .filters label { display:flex; align-items:center; gap:6px; min-height:44px; padding:0 8px; border:1px solid var(--face-line); border-radius:4px; } .filters input { min-height:20px; width:20px; } dl { display:grid; grid-template-columns:minmax(80px,.6fr) minmax(0,1.4fr); gap:5px 12px; margin:10px 0; } dd { margin:0; overflow-wrap:anywhere; } .command { white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.6 ui-monospace,monospace; background:var(--face-bg); padding:12px; border:1px solid var(--face-line); border-radius:4px; } .error { color:var(--face-danger); padding:10px; border:1px solid var(--face-danger); border-radius:4px; margin:8px 0; overflow-wrap:anywhere; } .flow { border-bottom:1px solid var(--face-line); padding:12px 0; } .flow:last-child { border:0; } .table-wrap { max-width:100%; overflow:auto; } table { border-collapse:collapse; width:100%; font-size:12px; } th,td { text-align:left; padding:9px; border:1px solid var(--face-line); vertical-align:top; } th { background:var(--face-bg); } summary { min-height:44px; cursor:pointer; padding:10px 0; } .recorded { margin-top:12px; } .login-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .login-form label { display:grid; gap:3px; } .login-form button { grid-column:1/-1; } .danger { border-color:var(--face-danger); } .foot { margin-top:12px; font-size:12px; color:var(--face-muted); }
      @container(max-width:690px) { .panes,.strip { grid-template-columns:1fr; } .strip { gap:6px; } .strip strong { display:inline; margin-right:8px; } .login-form { grid-template-columns:1fr; } } @media(prefers-reduced-motion:reduce) { * { animation:none; transition:none; } }
      </style>
      <header><h2><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/><path d="M10 7 5 16m9-9 5 9M7 19h10"/></svg> HEADSCALE <small>· Your machines</small></h2><div id="strip" class="strip"></div><p id="verdict" class="verdict"></p></header>
      <nav id="tabs" role="tablist" aria-label="Mesh views"></nav><div id="errors" role="status"></div><main id="body" role="tabpanel"></main><footer id="foot" class="foot"></footer>`;
    this.paint();
  }
  paint() {
    const root = this.shadowRoot; if (!root?.querySelector('#body')) return;
    const focused = root.activeElement;
    const focusKey = focused && ['id', 'aria-label', 'name'].map(attribute => [attribute, focused.getAttribute(attribute)]).find(([, value]) => value);
    const verdict = meshVerdict(this.status, this.doctor, this.leader);
    root.querySelector('#verdict').textContent = verdict.text; root.querySelector('#verdict').dataset.tone = verdict.tone;
    const status = this.status;
    root.querySelector('#strip').replaceChildren(...[
      ['Control', `${hostName(status?.control?.url)} · ${status?.control?.verified === true ? 'Verified' : 'Not verified'}`],
      ['Leader', `${words(this.leader?.leader?.hostname)} · ${words(this.leader?.leader?.strategy)}`],
      ['This machine', `${words(status?.enrollment?.hostname)} · ${words(status?.enrollment?.state)}`],
    ].map(([title, value]) => this.el('div', {}, this.el('strong', { text: title }), this.el('span', { text: value }))));
    root.querySelector('#tabs').replaceChildren(...this.screens.map(screen => this.button(screen.label, () => void this.show(screen.id), { role: 'tab', id: `tab-${screen.id}`, 'aria-selected': String(this.screen === screen.id), 'aria-controls': 'body' })), this.button(this.busy ? 'Reading…' : 'Refresh', () => void this.read(), { class: 'refresh', ...(this.busy ? { disabled: '' } : {}) }));
    root.querySelector('#errors').replaceChildren(...Object.entries(this.errors).map(([key, error]) => this.text(`${key}: ${error}`, 'error')), ...(status?.control?.error || status?.control?.reason ? [this.text(`Control: ${status.control.error || status.control.reason}`, 'error')] : []), ...(this.actionMessage ? [this.text(this.actionMessage)] : []));
    const nodes = joinNodes(status, this.doctor);
    const body = root.querySelector('#body'); body.setAttribute('aria-labelledby', `tab-${this.screen}`);
    const firstRun = status?.configured === false && ['no-headscale-api-key', 'no-control-url'].includes(status.control?.reason);
    body.replaceChildren(firstRun ? this.firstRun() : this.screen === 'machines' ? this.machines(nodes) : this.screen === 'flows' ? this.flows() : this.screen === 'placement' ? this.placement(nodes) : this.screen === 'boundary' ? this.boundary(nodes) : this.join());
    root.querySelector('#foot').textContent = this.lastAttempt ? `Last refresh attempted ${this.lastAttempt}. Hardware and access records retain their own dates.` : 'No observations yet.';
    if (focusKey) [...root.querySelectorAll('button,input,summary')].find(element => element.getAttribute(focusKey[0]) === focusKey[1])?.focus({ preventScroll: true });
  }
  presenceFor(node) {
    const source = this.views.machines?.sources?.presence;
    if (!source?.ok) return `Presence unavailable${source?.error ? `: ${source.error}` : ' · checking'}`;
    const data = source.data;
    const record = [data.local, ...list(data.peers)].find(item => item?.mesh_ip && item.mesh_ip === node.ip);
    if (!record || record.state === 'unavailable') return `Presence unavailable${record?.error ? `: ${record.error}` : ''}`;
    const age = Date.now() - Date.parse(record.timestamp);
    if (!Number.isFinite(age) || age < -5000 || age > 60000) return 'Presence stale · refresh to check activity';
    if (!Number.isFinite(record.idle_seconds) || record.idle_seconds < 0 || typeof record.user_active !== 'boolean') return 'Activity unknown · no idle measurement';
    return `${record.user_active === true ? 'Active here' : record.user_active === false ? 'Idle' : 'Activity unknown'}${typeof record.idle_seconds === 'number' ? ` · ${record.idle_seconds}s idle` : ''}`;
  }
  machines(nodes) {
    const live = nodes.filter(node => !node.vaultOnly).sort((a, b) => b.severity - a.severity || words(a.hostname).localeCompare(words(b.hostname)));
    const selected = live.find(node => node.ip === this.selected) || live[0];
    if (selected) this.selected = selected.ip;
    const roster = this.el('div', { class: 'roster', 'aria-label': 'Machines' }, live.map(node => this.button('', () => { this.selected = node.ip; this.paint(); }, { 'aria-pressed': String(selected?.ip === node.ip), 'aria-label': `${words(node.hostname)}: ${node.label}` })));
    [...roster.children].forEach((button, index) => button.append(this.el('strong', { text: words(live[index].hostname) }), this.el('span', { text: live[index].label, dataset: { tone: live[index].tone } }), this.el('small', { text: this.presenceFor(live[index]) })));
    const recorded = nodes.filter(node => node.vaultOnly);
    if (recorded.length) roster.append(this.el('details', { class: 'recorded' }, this.el('summary', { text: `${recorded.length} recorded-only record${recorded.length === 1 ? '' : 's'}` }), recorded.map(node => this.text(`${words(node.hostname)} · recorded ${words(node.last_heartbeat)}`, 'muted'))));
    return this.el('div', { class: 'panes' }, this.section(`${this.status ? live.length : DASH} members`, roster), selected ? this.machineDetail(selected) : this.section('Machines', this.text(this.status ? 'No member machines returned.' : 'Machine inventory is unreadable.')));
  }
  machineDetail(node) {
    const ping = this.pings[node.ip];
    const applicable = node.loginApplicable || node.self;
    const rungs = [
      ['Control', node.online === true ? 'passed' : node.online === false ? 'failed' : 'checking', node.online === true ? 'Online on the mesh' : node.online === false ? 'Offline · sleeping devices are not faults' : 'Not yet checked'],
      ['Path', node.self ? 'na' : ping?.state || 'checking', node.self ? 'Not applicable · this machine' : ping?.detail || 'Not yet checked · use Ping now'],
      ['Login', node.self || !applicable ? 'na' : node.access_state === 'configured' ? 'passed' : 'failed', node.self ? 'Not applicable · local execution' : !applicable ? 'Not applicable · no remote shell on this device' : node.access_state === 'configured' ? `Recorded ${words(node.access?.ssh_user)} · verified ${words(node.access?.verified_at)}` : 'No SSH login recorded'],
      ['Run', !applicable ? 'na' : node.reach === 'reachable' ? 'passed' : node.reach === 'unreachable' ? 'failed' : 'checking', !applicable ? 'Not applicable' : node.reach === 'reachable' ? 'Probe command executed' : node.reason || 'Not yet checked'],
    ];
    const actions = this.el('div', { class: 'actions' }, !node.self && node.ip ? this.button('Ping now', () => void this.ping(node)) : null, applicable ? this.button('Verify execution', () => void this.readOne('doctor', 'doctor', ['--json'])) : null);
    const detail = this.section(words(node.hostname), this.text(`${words(node.ip)} · ${words(node.os)}`, 'muted'), this.el('div', { class: 'ladder' }, rungs.map(([name, state, evidence]) => this.el('div', { class: 'rung', dataset: { state } }, this.el('strong', { text: name }), this.el('div', {}, this.el('b', { text: state === 'na' ? 'Not applicable' : state === 'checking' ? 'Not yet checked' : state === 'passed' ? 'Passed' : 'Failed' }), this.text(evidence, 'muted'))))), actions);
    if (node.loginApplicable && node.access_state !== 'configured') {
      if (this.canRun('access')) detail.append(this.button('Find a login', () => void this.action('access', ['discover', node.ip], 'Login discovery')), this.loginForm(node));
      else detail.append(this.text('This card is read-only. Find or record a login through the CLI.'), this.command(`total-recall mesh access discover ${node.ip}\ntotal-recall mesh access ${node.ip} --user <login>`));
    }
    if (node.reach === 'reachable' && !node.self) detail.append(this.text('SSH handoff'), this.command(`total-recall mesh ssh ${node.ip}`));
    detail.append(this.el('h3', { text: 'Recorded earlier' }), this.fields([
      ['Hardware measured', node.io?.measured_at], ['Login source', node.access?.source], ['Login verified', node.access?.verified_at], ['Heartbeat recorded', node.last_heartbeat], ['LAN address', node.lan_ip],
    ]), this.text('Only physical LAN and mesh addresses are shown; a recorded heartbeat is not a live probe.', 'muted'));
    return detail;
  }
  loginForm(node) {
    const form = this.el('form', { class: 'login-form' });
    const controls = {};
    for (const [key, label, value] of [['user', 'Login account', ''], ['host', 'SSH host', node.ip || ''], ['port', 'Port', '22'], ['identity', 'Key file path (optional)', '']]) {
      const input = this.el('input', { name: key, value: this.loginDrafts[node.ip]?.[key] ?? value, oninput: event => { (this.loginDrafts[node.ip] ||= {})[key] = event.target.value; }, ...(key === 'user' ? { required: '' } : {}), ...(key === 'port' ? { type: 'number', min: '1', max: '65535' } : {}) });
      controls[key] = input; form.append(this.el('label', { text: label }, input));
    }
    form.append(this.el('button', { type: 'submit', text: 'Record login' }));
    form.addEventListener('submit', event => {
      event.preventDefault(); const args = [node.ip, '--user', controls.user.value, '--host', controls.host.value, '--port', controls.port.value];
      if (controls.identity.value) args.push('--identity', controls.identity.value);
      void this.action('access', args, 'Record login');
    });
    return form;
  }
  sourceBlock(name, source) {
    if (!source) return this.el('div', { class: 'flow' }, this.el('h3', { text: sourceLabels[name] || name }), this.text('Observation not yet read.', 'muted'));
    return this.el('details', { class: 'flow' }, this.el('summary', { text: `${sourceLabels[name] || name} · ${source.ok ? this.flowHeadline(name, source.data) : `Unavailable: ${words(source.error)}`}`, dataset: { tone: source.ok ? 'neutral' : 'danger' } }), source.ok ? this.describeSource(name, source.data) : this.text(`Unavailable: ${words(source.error)}`, 'error'), this.el('small', { text: `Attempted ${words(source.checked_at)}` }));
  }
  flowHeadline(name, data) {
    if (name === 'grants') return Array.isArray(data.grants) ? `${data.grants.length} secret grants` : 'Grant inventory unreadable';
    if (name === 'updates') return data.last ? `${data.last.failed ?? DASH} failures in the last recorded update` : 'No recorded update report';
    if (name === 'deployments') return data.executionConfigured === false ? 'Not configured for this project' : 'Release state read';
    if (name === 'plugins') return Array.isArray(data.peers) ? `${data.peers.filter(peer => peer.status === 'ok').length} peers answered · ${data.peers.filter(peer => peer.status === 'offline').length} offline · ${data.peers.filter(peer => !['ok', 'offline'].includes(peer.status)).length} unavailable` : 'Peer observations unreadable';
    if (name === 'tasks') return Array.isArray(data.nodes) ? `Task declarations from ${data.nodes.filter(node => node.status === 'ok').length} nodes · ${data.nodes.filter(node => node.status !== 'ok').length} unavailable` : 'Task declarations read';
    if (name === 'agents') return Array.isArray(data) ? `${data.length} process records` : 'Process inventory read';
    if (name === 'alerts') { const count = Array.isArray(data) ? data.length : 1; return `${count} recorded delivery attempt${count === 1 ? '' : 's'}`; }
    return 'Observation read';
  }
  describeSource(name, data) {
    if (name === 'grants') {
      if (!Array.isArray(data.grants)) return this.text('Grant list was not returned.', 'error');
      return this.el('div', {}, data.grants.length ? data.grants.map(grant => this.text(`${grant.node || grant.tag || grant.user || grant.selector?.node || grant.selector?.tag || grant.selector?.user || 'Unrecognised selector'} → ${list(grant.keys).join(', ') || 'No key names returned'}`)) : this.text('No machine may read a secret through the mesh.'));
    }
    if (name === 'updates') {
      const report = data.last || data.report || data;
      return this.fields([['Last result', report.ok === true || report.success === true ? 'Succeeded' : report.ok === false || report.success === false ? 'Failed' : words(report.status || report.state)], ['Recorded', report.finished_at || report.completed_at || report.timestamp || report.at], ['Failures', Array.isArray(report.failures) ? report.failures.length : report.failed ?? DASH]]);
    }
    if (name === 'deployments') return data.executionConfigured === false ? this.text('No deployment execution is configured for this project. Other projects are not inferred.') : this.fields([['Active slot', data.activeSlot || data.active_slot || data.slot], ['Release', data.activeVersion || data.version || data.release], ['Health', typeof data.healthy === 'boolean' ? String(data.healthy) : data.health?.status]]);
    if (name === 'tasks' && Array.isArray(data.nodes)) return this.el('div', {}, data.nodes.map(node => this.el('div', {}, this.text(`${words(node.hostname)} · ${words(node.status)}${node.error ? ` · ${node.error}` : ''}`), list(node.automations).map(task => this.text(`${words(task.intent)} · ${words(task.placement)} · ${words(task.schedule)}`, 'muted')))));
    if (name === 'plugins' && data.mesh?.available === false) return this.text('Peer sharing is unavailable because the mesh is unavailable.', 'error');
    const rows = Array.isArray(data) ? data : name === 'alerts' && data.event_id ? [data] : data.peers || data.agents || data.tasks || data.automations || data.events || data.entries || data.hosts;
    if (!Array.isArray(rows)) return this.text('Owner returned no recognised inventory. Inspect the owner CLI for details.', 'muted');
    if (!rows.length) return this.text(name === 'agents' ? 'No agent processes returned.' : name === 'tasks' ? 'No scheduled tasks returned.' : name === 'plugins' ? 'No peer sharing observations returned.' : 'No entries returned.');
    return this.el('div', {}, rows.slice(0, 30).map(row => this.fields([
      [name === 'plugins' ? 'Peer' : 'Name', row.hostname || row.node || row.node_id || row.name || row.intent || row.id || row.type],
      ['State', row.status || row.state || row.result?.status],
      ...(!['plugins', 'alerts'].includes(name) ? [['Runs on', row.target_node || row.node_name || row.node || row.placement]] : []),
      ...(name === 'alerts' ? [['Channel', row.channel], ['Observed', row.at]] : []),
      ...(name === 'plugins' ? [['Shared plugins', row.status === 'ok' && Array.isArray(row.plugins) ? row.plugins.length : DASH]] : []),
    ])), rows.length > 30 ? this.text(`${rows.length - 30} more entries are available through the owner CLI.`, 'muted') : null);
  }
  flows() {
    const sources = this.views.flows?.sources || {};
    return this.section('What moves across the mesh', this.text('Each row is an independent owner observation; a grant or configuration is not proof of a successful transfer.', 'muted'), ['grants', 'plugins', 'updates', 'tasks', 'agents', 'alerts', 'deployments'].map(name => this.sourceBlock(name, sources[name])), this.text('Transfer history, per-node service health and speed are not readable through the current CLI.', 'muted'));
  }
  placement(nodes) {
    const live = nodes.filter(node => !node.vaultOnly);
    const columns = [...new Set(live.flatMap(node => [...node.runtimes.map(name => `runtime:${name}`), ...node.harnesses.map(name => `agent:${name}`), ...list(node.probe?.tested_runtimes).map(name => `runtime:${name}`), ...list(node.probe?.tested_harnesses).map(name => `agent:${name}`)]))].sort();
    columns.push(...['screen', 'microphone', 'speaker', 'camera', 'headless'].map(name => `io:${name}`));
    const filters = this.el('div', { class: 'filters' }, columns.map(column => {
      const input = this.el('input', { type: 'checkbox', 'aria-label': `Require ${column}`, ...(this.filters.has(column) ? { checked: '' } : {}), onchange: event => { event.target.checked ? this.filters.add(column) : this.filters.delete(column); this.paint(); } });
      return this.el('label', {}, input, this.el('span', { text: column }));
    }));
    const matches = live.filter(node => [...this.filters].every(column => capabilityState(node, column).startsWith('Present')));
    const table = this.el('table', {}, this.el('thead', {}, this.el('tr', {}, this.el('th', { text: 'Machine' }), columns.map(column => this.el('th', { text: column })))), this.el('tbody', {}, matches.map(node => this.el('tr', {}, this.el('th', { text: `${words(node.hostname)} · hardware ${words(node.io?.measured_at)}` }), columns.map(column => this.el('td', { text: capabilityState(node, column) }))))));
    const sources = this.views.placement?.sources || {};
    return this.section('Where work can run', this.text('Runtime and agent cells come from execution probes. Hardware cells are recorded facts with their own measurement date.', 'muted'), filters, this.el('div', { class: 'table-wrap', tabindex: '0', 'aria-label': 'Machine capability matrix' }, table), !matches.length ? this.text('No machine has all selected capabilities confirmed.') : null, this.integrationMatrix(nodes), this.el('h3', { text: 'Where work runs' }), this.sourceBlock('tasks', sources.tasks), this.sourceBlock('agents', sources.agents));
  }
  integrationMatrix(nodes) {
    const declarations = this.views.placement?.declarations;
    const rows = list(declarations?.integrations).map(integration => {
      const [screen, sourceName] = integration.observation.split('.');
      const source = sourceName ? this.views[screen]?.sources?.[sourceName] : null;
      let state = 'Not checked', tone = 'neutral';
      if (integration.id === 'ssh') {
        const targets = nodes.filter(node => !node.vaultOnly && (node.loginApplicable || node.self));
        state = Array.isArray(this.doctor) ? `${targets.filter(node => node.reach === 'reachable').length}/${targets.length} execution probes answered` : 'Execution not checked';
      } else if (source?.ok === false) { state = `Failed: ${words(source.error)}`; tone = 'danger'; }
      else if (source?.ok) {
        const data = source.data;
        if (integration.id === 'auth' || integration.id === 'headscale') { state = data.control?.verified === true ? 'Authentication verified' : 'Authentication unverified'; tone = data.control?.verified ? 'ok' : 'danger'; }
        else if (integration.id === 'tailscale') { state = data.network_available === true ? 'Network observed' : 'Network unavailable'; tone = data.network_available ? 'ok' : 'warn'; }
        else if (integration.id === 'updates') { state = data.last ? `${data.last.failed ?? DASH} failures in last recorded report` : 'No last report returned'; tone = data.last?.failed > 0 ? 'danger' : 'neutral'; }
        else if (integration.id === 'deployments') state = data.executionConfigured === false ? 'Not configured for selected project' : 'Release state read';
        else if (integration.id === 'presence') { const failures = list(data.peers).filter(peer => peer.state === 'unavailable').length; state = failures ? `${failures} peers unavailable` : 'Activity observations read'; tone = failures ? 'warn' : 'neutral'; }
        else state = 'Owner observation read';
      }
      return this.el('tr', {}, this.el('th', { text: integration.id }), this.el('td', { text: integration.owner }), this.el('td', { text: integration.purpose }), this.el('td', { text: state, dataset: { tone } }), this.el('td', { text: integration.evidence }), this.el('td', { text: source?.checked_at || (integration.id === 'ssh' ? this.lastAttempt : DASH) }));
    });
    const table = this.el('table', {}, this.el('thead', {}, this.el('tr', {}, ['Integration', 'Owner', 'Declared purpose', 'Observed result', 'Evidence means', 'Attempted'].map(text => this.el('th', { text })))), this.el('tbody', {}, rows));
    const primitives = list(declarations?.provides);
    const primitiveTable = this.el('table', {}, this.el('thead', {}, this.el('tr', {}, ['Primitive', 'Operation', 'Effect', 'Observation contract'].map(text => this.el('th', { text })))), this.el('tbody', {}, primitives.map(capability => this.el('tr', {}, [capability.id, capability.operation, capability.effect || 'See command declaration', capability.observation || 'No read-back contract'].map(text => this.el('td', { text }))))));
    return this.section('Plugin integration matrix', this.text('Support comes from this plugin’s manifest. Read results certify only the named observation, not every action in an integration.', 'muted'), this.button('Verify integrations', () => void Promise.all(['machines', 'flows', 'boundary', 'join'].map(screen => this.readView(screen, true))), { ...(this.busy || Object.keys(this.loading).length ? { disabled: '' } : {}) }), rows.length ? this.el('div', { class: 'table-wrap', tabindex: '0', 'aria-label': 'Plugin integration capability matrix' }, table) : this.text('Manifest integration declarations were not returned.', 'muted'), this.el('details', {}, this.el('summary', { text: `${primitives.length} declared mesh primitives` }), this.text('Effects come from the command declaration. This inventory grants no authority and does not certify unobserved actions.', 'muted'), this.el('div', { class: 'table-wrap', tabindex: '0', 'aria-label': 'Declared mesh primitives' }, primitiveTable)));
  }
  boundary(nodes) {
    const sources = this.views.boundary?.sources || {};
    const policy = sources.policy;
    let parsed = policy?.data?.policy ?? policy?.data;
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch {} }
    const policyView = !policy?.ok ? this.text(policy?.error || 'Policy not yet read.', 'muted') : this.el('div', {},
      parsed && typeof parsed === 'object' ? list(parsed.acls).map(rule => this.text(`${words(rule.action)}: ${list(rule.src).join(', ')} → ${list(rule.dst).join(', ')}`)) : this.text('No structured policy returned; no permissions are inferred.'),
      parsed && typeof parsed === 'object' ? list(parsed.ssh).map(rule => this.text(`SSH ${words(rule.action)}: ${list(rule.src).join(', ')} → ${list(rule.dst).join(', ')} as ${list(rule.users).join(', ')}${list(rule.users).includes('root') ? ' · root access is enabled' : ''}`)) : null,
      this.text('Policy changes stay in the CLI; review a dry run before applying.'), this.command('total-recall mesh policy get\ntotal-recall mesh policy init-ssh --dry-run'));
    const macs = new Map();
    for (const node of nodes) for (const face of list(node.interfaces).filter(i => i.kind === 'ethernet' && i.mac)) { const names = macs.get(face.mac) || new Set(); names.add(node.hostname); macs.set(face.mac, names); }
    const duplicates = [...macs.values()].filter(names => names.size > 1);
    return this.el('div', { class: 'panes' }, this.section('Inside the boundary', this.text(`${this.status ? nodes.filter(node => !node.vaultOnly).length : DASH} mesh members. Membership defines who enters this boundary.`), policyView, this.sourceBlock('grants', sources.grants), duplicates.map(names => this.text(`Possible duplicate records: ${[...names].join(', ')}. Record retirement is not readable through the current CLI.`, 'muted')), this.text('Exit nodes and subnet routes are not readable through the current CLI.', 'muted')),
      this.section('Outside the boundary', this.text('Public exposure and tunnel inventories are not readable through the current CLI. No absence of exposure is inferred.'), this.text('DNS, release health and firewall findings remain with their owning plugins; no live security audit is started by this view.', 'muted'), this.command('total-recall domains --help\ntotal-recall deploy status --json\ntotal-recall security status --json')));
  }
  firstRun() {
    return this.section('Configure your own mesh', this.text('A control server credential or URL is missing. Configure your own server before admitting machines.'), this.command(this.status?.control?.url ? 'total-recall mesh token status\ntotal-recall mesh token --help' : 'total-recall mesh server init --host <your-host> --domain <your-domain>'), this.text('The server must belong to this project’s operator. No shared server address is supplied.', 'muted'));
  }
  join() {
    const enrollment = this.status?.enrollment || {};
    const target = words(enrollment.hostname);
    const view = this.section('Admit a machine', this.text('Every admitted machine enters the mesh trust boundary. Review membership and policy before adding one.'), this.fields([
      ['This machine', target], ['Enrollment', enrollment.state], ['Backend', enrollment.backend_state], ['Addresses', list(enrollment.ips).join(', ') || DASH], ['Auto-enroll', typeof enrollment.auto_enroll_enabled === 'boolean' ? enrollment.auto_enroll_enabled ? 'Enabled' : 'Disabled' : DASH], ['Blocked reason', enrollment.auto_enroll_blocked_reason || DASH], ['Checked', enrollment.checked_at],
    ]), this.el('h3', { text: 'Enrollment key handoff' }), this.text('Mint the key in your shell, then pass it directly to the new machine. This view never requests or displays the enrollment key.'), this.command('total-recall mesh preauthkey\n# Optional: --reusable admits multiple machines; --ephemeral removes a disconnected node.\n# On the new machine: tailscale up --login-server <your-control-server> --auth-key <key-from-your-shell>'));
    if (enrollment.hostname && this.canRun('enroll')) {
      view.append(this.button(`Re-enroll ${target}`, () => { this.confirmEnrollment = true; this.paint(); }, { class: 'danger' }));
      if (this.confirmEnrollment) view.append(this.text(`Re-enroll ${target}? This may interrupt its mesh connection.`, 'error'), this.button(`Confirm re-enrollment of ${target}`, () => { this.confirmEnrollment = false; void this.action('enroll', ['--force'], 'Re-enrollment'); }, { class: 'danger', 'data-action': 'confirm-enroll' }), this.button('Cancel', () => { this.confirmEnrollment = false; this.paint(); }));
    }
    else if (enrollment.hostname) view.append(this.text(`This card is read-only. Re-enrolling ${target} can interrupt its connection; use the CLI after confirming that target.`), this.command('total-recall mesh enroll --force'));
    return view;
  }
}
if (!customElements.get('tr-mesh-card')) customElements.define('tr-mesh-card', MeshlinkControlCard);
