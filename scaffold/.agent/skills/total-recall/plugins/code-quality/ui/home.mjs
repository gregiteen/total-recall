/**
 * <code-quality-home> — the plugin's Home: where this repository's gates stand.
 *
 * Home reads the JSON printed by `code-quality report --json`
 * (core/report-data.mjs), the same view the plugin's status command reads.
 * Nothing is computed here beyond formatting: every value is a field of that
 * view, and only status "clean" is ever shown in the success colour. With no
 * view, Home says there is no report instead of showing data.
 *
 * Write subcommands (snapshot, gate, config, detect, init) are listed with
 * their exact command and never fired from here.
 */
const STATUS_LABEL = {
  clean: 'Clean',
  partial: 'Partial coverage',
  'unknown-freshness': 'Freshness unknown',
  stale: 'Stale',
  'zero-scope': 'Zero scope',
  failed: 'Failed',
  'unparsed-failure': 'Failed (unparsed)',
  infrastructure: 'Infrastructure failure',
  unreadable: 'Report unreadable',
  missing: 'No report',
};

const TONE = {
  clean: 'ok',
  partial: 'warn', stale: 'warn', 'unknown-freshness': 'warn', 'zero-scope': 'warn',
  failed: 'bad', 'unparsed-failure': 'bad', infrastructure: 'bad', unreadable: 'bad', missing: 'bad',
};

// The declared subcommands, as plugin.json names them.
const OPERATIONS = [
  { name: 'report', effect: 'read', command: 'total-recall code-quality report --json', what: 'Read the latest gate report. Never starts a check.' },
  { name: 'run', effect: 'write', command: 'total-recall code-quality run --tier fast', what: 'Run the configured gates and persist a new report.' },
  { name: 'snapshot', effect: 'write', command: 'total-recall code-quality snapshot --node <name>', what: 'Copy the exact source under test to the test node.' },
  { name: 'gate', effect: 'write', command: 'total-recall code-quality gate list|add|remove', what: "Edit this repository's gate list." },
  { name: 'config', effect: 'write', command: 'total-recall code-quality config get|set|validate|check', what: 'Read or change the repo-layer config.' },
  { name: 'detect', effect: 'write', command: 'total-recall code-quality detect [--apply]', what: 'Propose gates from the repository.' },
  { name: 'init', effect: 'write', command: 'total-recall code-quality init', what: 'Create the repo-layer config.' },
];

const STYLE = `
:host { display: block; font: var(--font-body, inherit); color: var(--color-text, #f8fafc); }
.home { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border, #334155); border-radius: 8px; background: var(--color-background, #0f172a); }
.mono { font-family: var(--font-mono, monospace); }
.verdict { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.verdict h2 { margin: 0; font-size: 1.25em; }
.tone-ok { color: var(--color-success, #10b981); }
.tone-warn { color: var(--color-warning, #f59e0b); }
.tone-bad { color: var(--color-danger, #ef4444); }
.muted { color: var(--color-muted, #94a3b8); }
.reasons { margin: 0; padding-left: 18px; }
.panel { border: 1px solid var(--color-border, #334155); border-radius: 8px; background: var(--color-surface, #1e293b); padding: 12px; }
.panel h3 { margin: 0 0 8px; font-size: .8em; letter-spacing: .06em; text-transform: uppercase; color: var(--color-muted, #94a3b8); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
dt { color: var(--color-muted, #94a3b8); } dd { margin: 0; overflow-wrap: anywhere; }
.gates { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.gate { border: 1px solid var(--color-border, #334155); border-radius: 6px; padding: 8px; display: grid; gap: 2px; }
.findings { margin: 0; padding-left: 18px; }
.ops { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ops li { display: grid; gap: 2px; }
.effect { font-size: .75em; text-transform: uppercase; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button { font: inherit; min-height: 44px; padding: 8px 14px; border-radius: 6px; cursor: pointer; color: var(--color-text, #f8fafc); background: transparent; border: 1px solid var(--color-border, #334155); }
button.primary { color: var(--color-on-primary, #0f172a); background: var(--color-primary, #eab308); border-color: var(--color-primary, #eab308); }
button.primary:hover { background: var(--color-primary-strong, #facc15); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function fmtMs(ms) {
  return typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : 'unknown';
}

function fmtAge(ms) {
  if (typeof ms !== 'number') return 'unknown';
  const min = Math.round(ms / 60000);
  return min < 1 ? 'under a minute ago' : min < 120 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

function gateResult(g) {
  if (g.skipped) return { text: `skipped (${g.tier})`, tone: 'warn' };
  if (g.spawnError) return { text: 'spawn failed', tone: 'bad' };
  if (g.timedOut) return { text: 'timed out', tone: 'bad' };
  if (g.ok === true) return { text: 'passed', tone: 'ok' };
  return { text: `failed (exit ${g.exitCode ?? 'unknown'})`, tone: 'bad' };
}

export class CodeQualityHome extends HTMLElement {
  #view = null;
  #root = null;
  #readError = '';
  #reading = false;

  connectedCallback() {
    this.#root ||= this.attachShadow({ mode: 'open' });
    this.#render();
    if (this.host) void this.#reload();
  }

  get view() { return this.#view; }
  set view(value) {
    this.#view = value && typeof value === 'object' ? value : null;
    if (this.#root) this.#render();
  }

  async #reload() {
    if (!this.host || this.#reading) return;
    this.#reading = true;
    this.#readError = '';
    this.#render();
    try {
      this.view = await this.host.run('report', ['--json']);
    } catch (error) {
      try {
        // A non-clean gate report exits nonzero and still returns its structured view.
        const report = JSON.parse(error.message);
        if (typeof report.status !== 'string') throw error;
        this.view = report;
      } catch {
        this.#readError = 'The latest gate report could not be read.';
      }
    } finally {
      this.#reading = false;
      this.#render();
    }
  }

  #verdict(v) {
    const status = v && typeof v.status === 'string' ? v.status : null;
    const tone = status ? TONE[status] || 'bad' : 'bad';
    const label = status ? STATUS_LABEL[status] || `Unknown status: ${status}` : 'No report data';
    const box = el('section', { className: 'verdict', 'data-design-component': 'verdict' },
      el('h2', { className: `tone-${tone}`, text: label }),
      el('span', { className: 'muted mono', text: status ? `tier ${v.tier ?? 'unknown'}` : '' }));
    const reasons = status
      ? (v.reasons || [])
      : ['Reload to read the latest repository report.'];
    return [box, reasons.length ? el('ul', { className: 'reasons' }, ...reasons.map((r) => el('li', { text: r }))) : null];
  }

  #freshness(v) {
    const dl = el('dl');
    const row = (k, val, mono) => dl.append(el('dt', { text: k }), el('dd', { className: mono ? 'mono' : '', text: String(val ?? 'unknown') }));
    row('Revision at run', v.gitHead ? v.gitHead.slice(0, 12) : 'unknown', true);
    row('Revision now', v.currentHead ? v.currentHead.slice(0, 12) : 'unknown', true);
    row('Finished', `${v.finishedAt ?? 'unknown'} (${fmtAge(v.ageMs)})`);
    row('Duration', fmtMs(v.durationMs));
    row('Changed since run', Array.isArray(v.changedSinceRun) ? (v.changedSinceRun.length ? v.changedSinceRun.join(', ') : 'nothing') : 'unknown');
    return el('section', { className: 'panel', 'data-design-component': 'freshness' }, el('h3', { text: 'Freshness' }), dl);
  }

  #coverage(v) {
    const dl = el('dl');
    const row = (k, val) => dl.append(el('dt', { text: k }), el('dd', { text: String(val ?? 'unknown') }));
    row('Gates run', v.ranChecks?.length ? v.ranChecks.join(', ') : 'none');
    row('Gates skipped', v.skippedChecks?.length ? v.skippedChecks.map((s) => `${s.id} (${s.tier})`).join(', ') : 'none');
    row('Source files', v.sourceFileCount);
    const gates = (v.gates || []).map((g) => {
      const r = gateResult(g);
      return el('div', { className: 'gate', 'data-design-component': 'gate' },
        el('span', { className: 'mono', text: g.id }),
        el('span', { className: `tone-${r.tone}`, text: r.text }),
        el('span', { className: 'muted', text: g.skipped ? '' : `${g.findings ?? 0} findings · ${fmtMs(g.durationMs)}` }));
    });
    return el('section', { className: 'panel', 'data-design-component': 'coverage' },
      el('h3', { text: 'Coverage' }), dl, gates.length ? el('div', { className: 'gates' }, ...gates) : el('p', { className: 'muted', text: 'No gate rows in this report.' }));
  }

  #findings(v) {
    const list = (v.findings || []).slice(0, 10).map((f) => el('li', { className: 'mono', text: `${f.file ?? '(unknown file)'}:${f.line ?? '?'}  ${f.code ?? ''}  ${f.message ?? ''}` }));
    return el('section', { className: 'panel', 'data-design-component': 'findings' },
      el('h3', { text: 'Findings' }),
      el('p', { className: v.blockingFindings ? 'tone-bad' : 'muted', text: `${v.totalFindings ?? 'unknown'} total, ${v.blockingFindings ?? 'unknown'} blocking` }),
      list.length ? el('ul', { className: 'findings' }, ...list) : null,
      (v.findings?.length > 10 || v.findingsTruncated) ? el('p', { className: 'muted', text: `More in ${v.reportFile ?? 'the report file'}.` }) : null);
  }

  #operations() {
    const items = OPERATIONS.map((op) => el('li', {},
      el('span', {}, el('span', { className: 'mono', text: op.name }), el('span', { className: `effect ${op.effect === 'read' ? 'muted' : 'tone-warn'}`, text: `  ${op.effect}` })),
      el('span', { className: 'muted', text: op.what }),
      el('code', { className: 'mono', text: op.command })));
    return el('section', { className: 'panel', 'data-design-component': 'operations' }, el('h3', { text: 'Operations' }), el('ul', { className: 'ops' }, ...items));
  }

  #actions() {
    return el('section', { className: 'actions', 'data-design-component': 'actions' },
      el('button', { type: 'button', text: this.#reading ? 'Reading…' : 'Reload report',
        disabled: this.#reading, onclick: () => void this.#reload() }),
      this.#readError ? el('p', { role: 'status', text: this.#readError }) : null);
  }

  #render() {
    const v = this.#view && typeof this.#view.status === 'string' ? this.#view : null;
    const home = el('div', { className: 'home', 'data-design-component': 'home' }, ...this.#verdict(v));
    if (v?.startedAt) home.append(this.#freshness(v), this.#coverage(v), this.#findings(v));
    home.append(this.#actions(), this.#operations());
    this.#root.replaceChildren(el('style', { textContent: STYLE }), home);
  }
}

if (!customElements.get('code-quality-home')) customElements.define('code-quality-home', CodeQualityHome);
