/**
 * Headscale mesh card.
 *
 * Question it answers: can I reach every machine I rely on, and is the control plane healthy?
 * Every figure comes from a returned `status`, `doctor` or `leader` payload. Nothing is seeded:
 * a value the payload did not supply renders as an em dash with the reason beside it.
 */

const DASH = '\u2014';

/** A finite number only when the payload supplied one. */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value) {
  return typeof value === 'string' && value ? value : undefined;
}

/** Parse a host.run result into an object, or null. Never guesses. */
export function asObject(result) {
  if (result === null || result === undefined) return null;
  if (typeof result === 'object') {
    if (typeof result.output === 'string') return asObject(result.output);
    return result;
  }
  if (typeof result === 'string') {
    // Commands print banner and log lines around the JSON; take the first balanced value only.
    const start = result.search(/[\[{]/);
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    for (let i = start; i < result.length; i += 1) {
      const ch = result[i];
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '[' || ch === '{') depth += 1;
      else if (ch === ']' || ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(result.slice(start, i + 1));
            return typeof parsed === 'object' ? parsed : null;
          } catch { return null; }
        }
      }
    }
  }
  return null;
}

function rawText(result) {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') return result;
  if (typeof result.output === 'string') return result.output;
  try { return JSON.stringify(result, null, 2); } catch { return String(result); }
}

/**
 * Join the registry view (`status`) with the probe view (`doctor`) into one record per node.
 * `reach` is 'reachable', 'unreachable' or 'unprobed': three honest states, never a default.
 */
export function joinNodes(status, doctor) {
  const nodes = status && Array.isArray(status.nodes) ? status.nodes : [];
  const probes = Array.isArray(doctor) ? doctor : [];
  return nodes.map((node) => {
    const probe = probes.find((p) => p && (p.ip === node.ip || p.hostname === node.hostname));
    let reach = 'unprobed';
    if (probe && probe.reachable === true) reach = 'reachable';
    else if (probe && probe.reachable === false) reach = 'unreachable';
    const vaultOnly = node.vault_only === true;
    const online = node.online === true;
    const hasLogin = node.access_state === 'configured';
    let severity = 0;
    let label = 'Healthy';
    if (vaultOnly) { severity = 0.5; label = 'Recorded only'; }
    else if (reach === 'unreachable' && probe && probe.sshConfigured) { severity = 4; label = 'Unreachable'; }
    else if (!online) { severity = 3; label = 'Offline'; }
    else if (!hasLogin) { severity = 2; label = 'No login recorded'; }
    else if (reach === 'unprobed') { severity = 1; label = 'Not probed'; }
    return {
      hostname: str(node.hostname),
      ip: str(node.ip),
      os: str(node.os),
      self: node.self === true,
      vaultOnly,
      online,
      networkState: str(node.network_state),
      accessState: str(node.access_state),
      reach,
      reason: probe ? str(probe.error) : undefined,
      runtimes: probe && Array.isArray(probe.runtimes) ? probe.runtimes : undefined,
      harnesses: probe && Array.isArray(probe.harnesses) ? probe.harnesses : undefined,
      severity,
      label,
    };
  });
}

/**
 * The verdict, computed only from returned values, first match wins.
 * Returns { tone, text } where tone is ok | warn | danger | neutral.
 */
export function meshVerdict(status, doctor, leader) {
  if (!status || typeof status !== 'object') return { tone: 'neutral', text: 'Cannot verify the mesh.' };
  if (status.state !== 'connected') return { tone: 'danger', text: 'Mesh is not connected.' };
  if (!status.control || status.control.verified !== true) return { tone: 'danger', text: 'Control server is not verified.' };
  const nodes = joinNodes(status, doctor).filter((n) => !n.vaultOnly);
  const unreachable = nodes.filter((n) => n.label === 'Unreachable').length;
  if (unreachable) return { tone: 'danger', text: `${unreachable} node${unreachable === 1 ? '' : 's'} unreachable.` };
  const offline = nodes.filter((n) => n.label === 'Offline').length;
  if (offline) return { tone: 'warn', text: `${offline} node${offline === 1 ? '' : 's'} offline.` };
  const noLogin = nodes.filter((n) => n.label === 'No login recorded').length;
  if (noLogin) return { tone: 'warn', text: `${noLogin} node${noLogin === 1 ? ' has' : 's have'} no login recorded.` };
  if (!Array.isArray(doctor) || !leader || typeof leader !== 'object') return { tone: 'warn', text: 'Partly verified.' };
  return { tone: 'ok', text: 'Every node reachable.' };
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return undefined; }
}

export class MeshlinkControlCard extends HTMLElement {
  constructor() {
    super();
    this.status = null;
    this.doctor = null;
    this.leader = null;
    this.errors = {};
    this.lastAttempt = null;
    this.busy = false;
    this.screen = 'fleet';
    this.pings = {};
  }

  /** Screens this face offers; the host only provides the flipper. */
  get screens() {
    return [
      { id: 'fleet', label: 'Fleet' },
      { id: 'control', label: 'Control' },
      { id: 'capability', label: 'Capability' },
    ];
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.onScreen = (event) => {
      const detail = event.detail || {};
      if (detail.pluginId && detail.pluginId !== this.host?.pluginId) return;
      if (detail.screen && this.screens.some((s) => s.id === detail.screen)) this.show(detail.screen);
    };
    window.addEventListener('plugin-show-screen', this.onScreen);
    void this.read();
  }

  disconnectedCallback() {
    if (this.onScreen) window.removeEventListener('plugin-show-screen', this.onScreen);
  }

  async call(subcommand, args) {
    if (!this.host || typeof this.host.run !== 'function') {
      throw new Error('The host did not provide a command runner, so the mesh cannot be inspected.');
    }
    return this.host.run(subcommand, args);
  }

  /** Read one command. A failure is recorded and clears that figure; it never keeps a stale one. */
  async readOne(key, subcommand, args) {
    try {
      const payload = asObject(await this.call(subcommand, args));
      if (!payload) throw new Error(`The ${subcommand} command did not return a readable payload.`);
      this[key] = payload;
      delete this.errors[key];
    } catch (err) {
      this[key] = null;
      this.errors[key] = err && err.message ? err.message : String(err);
    }
  }

  /** The three reads are independent: a slow or failed `doctor` must not blank the fleet. */
  async read() {
    if (this.busy) return;
    this.busy = true;
    this.lastAttempt = new Date();
    this.paint();
    await Promise.all([
      this.readOne('status', 'status', ['--json']),
      this.readOne('doctor', 'doctor', ['--json']),
      this.readOne('leader', 'leader', ['--json']),
    ]);
    this.busy = false;
    this.paint();
  }

  show(screen) {
    this.screen = screen;
    this.paint();
  }

  async ping(node) {
    const target = node.ip || node.hostname;
    if (!target) return;
    this.pings[target] = { state: 'running' };
    this.paint();
    try {
      const out = rawText(await this.call('ping', [target])).trim();
      this.pings[target] = { state: 'done', text: out.split('\n').slice(0, 3).join(' ') || 'No output returned.' };
    } catch (err) {
      this.pings[target] = { state: 'failed', text: err && err.message ? err.message : String(err) };
    }
    this.paint();
  }

  /* ---------------------------------------------------------------- render */

  render() {
    const root = this.shadowRoot;
    if (!root) return;
    root.innerHTML = `
      <style>
        :host {
          --surface: #0b1020; --surface-2: #121933; --line: #26305a;
          --text: #e8ecff; --muted: #9aa6d6;
          --brand: #818cf8;
          --ok: #34d399; --warn: #fbbf24; --danger: #f87171; --neutral: #94a3b8;
          display: block; box-sizing: border-box; background: var(--surface); color: var(--text);
          font-family: 'Space Grotesk', system-ui, sans-serif; border: 1px solid var(--line);
          border-radius: 8px; padding: 14px; container-type: inline-size;
        }
        * { box-sizing: border-box; }
        header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .mark { width: 30px; height: 30px; flex: none; }
        .name { font-size: 13px; font-weight: 700; letter-spacing: .04em; color: var(--brand); }
        .badge { font-size: 11px; color: var(--muted); }
        .verdict { margin-left: auto; text-align: right; font-size: 15px; font-weight: 700; }
        .verdict small { display: block; font-size: 11px; font-weight: 400; color: var(--muted); }
        [data-tone="ok"] { color: var(--ok); } [data-tone="warn"] { color: var(--warn); }
        [data-tone="danger"] { color: var(--danger); } [data-tone="neutral"] { color: var(--neutral); }
        nav { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--line); }
        nav button { background: none; border: 0; color: var(--muted); font: inherit; font-size: 12px;
          padding: 8px 12px; min-height: 44px; cursor: pointer; border-bottom: 2px solid transparent; }
        nav button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--brand); }
        nav .spacer { flex: 1; }
        .figures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
        @container (max-width: 520px) { .figures { grid-template-columns: repeat(2, 1fr); } }
        .figure { background: var(--surface-2); border-left: 3px solid var(--neutral); border-radius: 4px; padding: 8px 10px; }
        .figure[data-tone="ok"] { border-left-color: var(--ok); } .figure[data-tone="warn"] { border-left-color: var(--warn); }
        .figure[data-tone="danger"] { border-left-color: var(--danger); }
        .figure .n { font-size: 24px; font-weight: 700; line-height: 1.1; }
        .figure .l { font-size: 11px; color: var(--muted); }
        .figure .why { font-size: 11px; color: var(--muted); }
        ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        li.node { background: var(--surface-2); border-left: 3px solid var(--neutral); border-radius: 4px; padding: 8px 10px;
          display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; }
        li.node[data-tone="danger"] { border-left-color: var(--danger); } li.node[data-tone="warn"] { border-left-color: var(--warn); }
        li.node[data-tone="ok"] { border-left-color: var(--ok); }
        .host { font-size: 13px; font-weight: 600; word-break: break-all; }
        .sub { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .states { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; color: var(--muted); }
        .states b { color: var(--text); font-weight: 600; }
        .reason { grid-column: 1 / -1; font-size: 11px; color: var(--warn); }
        .ping { background: transparent; border: 1px solid var(--line); color: var(--text); font: inherit; font-size: 12px;
          border-radius: 4px; padding: 0 12px; min-height: 44px; cursor: pointer; }
        .ping:disabled { opacity: .5; cursor: default; }
        .pingout { grid-column: 1 / -1; font-size: 11px; font-family: 'JetBrains Mono', ui-monospace, monospace; color: var(--muted); }
        dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; font-size: 12px; }
        dt { color: var(--muted); } dd { margin: 0; word-break: break-all; }
        .err { background: rgba(248,113,113,.1); border: 1px solid var(--danger); color: var(--danger);
          border-radius: 4px; padding: 8px 10px; font-size: 12px; margin-bottom: 10px; }
        .chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .chip { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; padding: 1px 6px; font-size: 11px; }
        .foot { margin-top: 10px; font-size: 11px; color: var(--muted); }
        .section { margin: 12px 0 6px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
      </style>
      <header>
        <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
          <line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/><line x1="8" y1="19" x2="16" y2="19"/>
        </svg>
        <div><div class="name">HEADSCALE</div><div class="badge">Mesh reachability</div></div>
        <div class="verdict" id="verdict" data-tone="neutral">Reading the mesh<small id="attempt"></small></div>
      </header>
      <nav id="tabs" role="tablist"></nav>
      <div id="errors"></div>
      <section id="body"></section>
      <div class="foot" id="foot"></div>
    `;
    this.paint();
  }

  /** Replace the children of an element with text-only nodes built by the caller. */
  el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const child of children) if (child) node.append(child);
    return node;
  }

  paint() {
    const root = this.shadowRoot;
    if (!root || !root.querySelector('#body')) return;

    const verdict = this.status || this.doctor || this.leader
      ? meshVerdict(this.status, this.doctor, this.leader)
      : { tone: 'neutral', text: this.busy ? 'Reading the mesh.' : 'Cannot verify the mesh.' };
    const v = root.querySelector('#verdict');
    v.dataset.tone = verdict.tone;
    v.textContent = verdict.text;
    const attempt = this.el('small', { text: this.lastAttempt ? `attempted ${this.lastAttempt.toLocaleTimeString()}` : '' });
    v.append(attempt);

    const tabs = root.querySelector('#tabs');
    tabs.replaceChildren(...this.screens.map((s) => this.el('button', {
      role: 'tab', 'aria-selected': String(s.id === this.screen), text: s.label, onclick: () => this.show(s.id),
    })), this.el('span', { class: 'spacer' }), this.el('button', {
      text: this.busy ? 'Reading' : 'Refresh', onclick: () => void this.read(),
      ...(this.busy ? { disabled: '' } : {}),
    }));

    const errors = root.querySelector('#errors');
    errors.replaceChildren(...Object.entries(this.errors).map(([key, message]) => this.el('div', {
      class: 'err', text: `${key} could not be read: ${message}`,
    })));

    const body = root.querySelector('#body');
    const nodes = joinNodes(this.status, this.doctor);
    if (this.screen === 'control') body.replaceChildren(this.controlView());
    else if (this.screen === 'capability') body.replaceChildren(this.capabilityView(nodes));
    else body.replaceChildren(...this.fleetView(nodes));

    const foot = root.querySelector('#foot');
    foot.textContent = this.status && str(this.status.observed_at) ? `Registry observed ${this.status.observed_at}` : '';
  }

  figure(label, value, tone, why) {
    return this.el('div', { class: 'figure', dataset: { tone } },
      this.el('div', { class: 'n', text: value === undefined ? DASH : String(value), dataset: { tone } }),
      this.el('div', { class: 'l', text: label }),
      value === undefined && why ? this.el('div', { class: 'why', text: why }) : null);
  }

  fleetView(nodes) {
    const live = nodes.filter((n) => !n.vaultOnly);
    const haveStatus = !!this.status;
    const haveDoctor = Array.isArray(this.doctor);
    const online = haveStatus ? live.filter((n) => n.online).length : undefined;
    const reachable = haveDoctor ? live.filter((n) => n.reach === 'reachable').length : undefined;
    const noLogin = haveStatus ? live.filter((n) => n.accessState !== 'configured').length : undefined;
    const why = (ok, label) => (ok ? undefined : `${label} unreadable`);
    const grid = this.el('div', { class: 'figures' },
      this.figure('Nodes', haveStatus ? live.length : undefined, 'neutral', why(haveStatus, 'status')),
      this.figure('Online', online, online === undefined ? 'neutral' : (online === live.length ? 'ok' : 'warn'), why(haveStatus, 'status')),
      this.figure('Reachable', reachable, reachable === undefined ? 'neutral' : (reachable === live.length ? 'ok' : 'danger'), why(haveDoctor, 'doctor')),
      this.figure('No login recorded', noLogin, noLogin === undefined ? 'neutral' : (noLogin ? 'warn' : 'ok'), why(haveStatus, 'status')));

    if (!haveStatus) return [grid];
    const ordered = [...nodes].sort((a, b) => b.severity - a.severity || String(a.hostname).localeCompare(String(b.hostname)));
    const list = this.el('ul', {}, ...ordered.map((n) => this.nodeRow(n)));
    return [grid, this.el('div', { class: 'section', text: 'Nodes, most urgent first' }), list];
  }

  nodeRow(n) {
    const tone = n.severity >= 3 ? 'danger' : (n.severity >= 1 ? 'warn' : (n.vaultOnly ? 'neutral' : 'ok'));
    const target = n.ip || n.hostname;
    const ping = this.pings[target];
    const canPing = !!target && !n.self && !n.vaultOnly;
    const row = this.el('li', { class: 'node', dataset: { tone } },
      this.el('div', {},
        this.el('div', { class: 'host', text: (n.hostname || DASH) + (n.self ? ' (this machine)' : '') }),
        this.el('div', { class: 'sub', text: [n.ip, n.os].filter(Boolean).join(' \u00b7 ') || DASH })),
      canPing ? this.el('button', {
        class: 'ping', text: ping && ping.state === 'running' ? 'Pinging' : 'Ping', onclick: () => void this.ping(n),
        ...(ping && ping.state === 'running' ? { disabled: '' } : {}),
      }) : this.el('span', { class: 'sub', text: n.self ? 'local' : '' }),
      this.el('div', { class: 'states' },
        this.el('span', { text: 'Status ' }, this.el('b', { text: n.label, dataset: { tone } })),
        this.el('span', { text: 'Network ' }, this.el('b', { text: n.networkState || DASH })),
        this.el('span', { text: 'Access ' }, this.el('b', { text: n.accessState || DASH })),
        this.el('span', { text: 'Reach ' }, this.el('b', { text: n.reach }))),
      n.reason ? this.el('div', { class: 'reason', text: n.reason }) : null,
      ping && ping.text ? this.el('div', { class: 'pingout', text: ping.text }) : null);
    return row;
  }

  controlView() {
    const s = this.status;
    if (!s) return this.el('div', { class: 'err', text: 'The status command returned nothing readable, so the control server cannot be shown.' });
    const c = s.control || {};
    const e = s.enrollment || {};
    const l = this.leader && this.leader.leader ? this.leader.leader : null;
    const row = (k, v, tone) => [this.el('dt', { text: k }), this.el('dd', { text: v === undefined ? DASH : String(v), dataset: tone ? { tone } : {} })];
    const dl = this.el('dl', {},
      ...row('Control server', hostOf(c.url)),
      ...row('Verification', c.verified === true ? 'Verified' : (c.verified === false ? 'Not verified' : undefined), c.verified === true ? 'ok' : 'danger'),
      ...row('Control state', str(c.state)),
      ...row('This machine', str(e.hostname)),
      ...row('Enrollment', str(e.state), e.enrolled === true ? 'ok' : 'warn'),
      ...row('Backend', str(e.backend_state)),
      ...row('Addresses', Array.isArray(e.ips) ? e.ips.join(', ') : undefined),
      ...row('Enrollment checked', str(e.checked_at)),
      ...row('Leader', l ? l.hostname : undefined),
      ...row('Leader strategy', l ? l.strategy : undefined),
      ...row('This node leads', this.leader && typeof this.leader.is_current_node_leader === 'boolean' ? (this.leader.is_current_node_leader ? 'Yes' : 'No') : undefined));
    return dl;
  }

  capabilityView(nodes) {
    if (!Array.isArray(this.doctor)) {
      return this.el('div', { class: 'err', text: 'The doctor command returned nothing readable, so runtimes and harnesses cannot be shown.' });
    }
    const chips = (list, none) => (list && list.length
      ? this.el('div', { class: 'chips' }, ...list.map((x) => this.el('span', { class: 'chip', text: String(x) })))
      : this.el('span', { class: 'sub', text: none }));
    const probed = nodes.filter((n) => !n.vaultOnly);
    return this.el('ul', {}, ...probed.map((n) => this.el('li', { class: 'node', dataset: { tone: n.reach === 'reachable' ? 'ok' : 'neutral' } },
      this.el('div', { class: 'host', text: n.hostname || DASH }),
      this.el('span', { class: 'sub', text: n.reach }),
      this.el('div', { class: 'states' }, this.el('span', { text: 'Runtimes ' }), chips(n.runtimes, n.reach === 'unprobed' ? 'not probed' : 'none found')),
      this.el('div', { class: 'states' }, this.el('span', { text: 'Agent harnesses ' }), chips(n.harnesses, n.reach === 'unprobed' ? 'not probed' : 'none found')))));
  }
}

if (!customElements.get('tr-mesh-card')) {
  customElements.define('tr-mesh-card', MeshlinkControlCard);
}
