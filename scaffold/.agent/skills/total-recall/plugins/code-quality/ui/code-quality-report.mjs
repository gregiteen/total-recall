/**
 * <code-quality-report> — renders a code-quality report view.
 *
 * The host sets `view` to the JSON printed by `code-quality report json`
 * (core/report-data.mjs). Nothing here is computed locally: every number is a
 * field of that view, and a missing/unreadable/stale/partial view never renders
 * as passing. With no view set the element says so instead of showing data.
 *
 * Events (host runs the named plugin command, then sets a fresh `view`):
 *   run-check  detail { command: 'code-quality-check', args: ['--tier', tier] }
 *   reload     detail { command: 'code-quality-report', args: ['json'] }
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

const STYLE = `
:host { display: block; font: var(--font-body, inherit); color: var(--color-text, inherit); }
.card { border: 1px solid var(--color-border, currentColor); border-radius: var(--radius-md, 6px); padding: var(--space-4, 16px); background: var(--color-surface, transparent); }
.status { font-weight: 600; font-size: 1.1em; }
.status[data-status="clean"] { color: var(--color-success, inherit); }
.status[data-status="partial"], .status[data-status="stale"], .status[data-status="unknown-freshness"], .status[data-status="zero-scope"] { color: var(--color-warning, inherit); }
.status[data-status="failed"], .status[data-status="unparsed-failure"], .status[data-status="infrastructure"], .status[data-status="unreadable"], .status[data-status="missing"] { color: var(--color-danger, inherit); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 12px 0; }
dt { opacity: .7; } dd { margin: 0; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--color-border, currentColor); }
ul { margin: 8px 0; padding-left: 20px; }
button { font: inherit; margin-right: 8px; cursor: pointer; }
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

export class CodeQualityReport extends HTMLElement {
  #view = null;
  #root = null;

  connectedCallback() {
    this.#root ||= this.attachShadow({ mode: 'open' });
    this.#render();
  }

  get view() { return this.#view; }
  set view(value) {
    this.#view = value && typeof value === 'object' ? value : null;
    if (this.#root) this.#render();
  }

  #emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #render() {
    const v = this.#view;
    const card = el('div', { className: 'card' });
    if (!v || typeof v.status !== 'string') {
      card.append(el('div', { className: 'status', text: 'No report data', 'data-status': 'missing' }),
        el('p', { text: 'The host has not provided a report view. Run the code-quality-report json command.' }));
    } else {
      card.append(el('div', { className: 'status', text: STATUS_LABEL[v.status] || `Unknown status: ${v.status}`, 'data-status': v.status }));
      if (v.reasons?.length) card.append(el('ul', {}, ...v.reasons.map((r) => el('li', { text: r }))));
      if (v.startedAt) {
        const dl = el('dl');
        const row = (k, val) => { dl.append(el('dt', { text: k }), el('dd', { text: String(val ?? 'unknown') })); };
        row('Revision at run', v.gitHead ? v.gitHead.slice(0, 12) : 'unknown');
        row('Revision now', v.currentHead ? v.currentHead.slice(0, 12) : 'unknown');
        row('Tier', v.tier);
        row('Gates run', v.ranChecks?.join(', ') || 'none');
        row('Gates skipped', v.skippedChecks?.length ? v.skippedChecks.map((s) => `${s.id} (${s.tier})`).join(', ') : 'none');
        row('Source files', v.sourceFileCount);
        row('Started', v.startedAt);
        row('Finished', `${v.finishedAt ?? 'unknown'} (${fmtAge(v.ageMs)})`);
        row('Duration', fmtMs(v.durationMs));
        row('Findings', `${v.totalFindings} total, ${v.blockingFindings} blocking`);
        card.append(dl);
      }
      if (v.gates?.length) {
        const head = el('tr', {}, ...['Gate', 'Result', 'Files scanned', 'Findings', 'Time'].map((h) => el('th', { text: h })));
        const body = v.gates.map((g) => {
          const result = g.skipped ? `skipped (${g.tier})` : g.spawnError ? `spawn failed: ${g.spawnError}` : g.timedOut ? 'timed out' : g.ok ? 'passed' : `failed (exit ${g.exitCode})`;
          return el('tr', {}, el('td', { text: g.id }), el('td', { text: result }),
            el('td', { text: g.scanned ?? '—' }), el('td', { text: g.skipped ? '—' : g.findings }), el('td', { text: g.skipped ? '—' : fmtMs(g.durationMs) }));
        });
        card.append(el('table', {}, el('thead', {}, head), el('tbody', {}, ...body)));
      }
      if (v.findings?.length) {
        card.append(el('ul', {}, ...v.findings.slice(0, 50).map((f) => el('li', { text: `${f.file}:${f.line}  ${f.code}  ${f.message}` }))));
        if (v.findings.length > 50 || v.findingsTruncated) card.append(el('p', { text: 'More findings are in the report file.' }));
      }
      if (v.reportFile) card.append(el('p', { text: `Report file: ${v.reportFile}` }));
    }
    card.append(
      el('button', { type: 'button', text: 'Run fast check', onclick: () => this.#emit('run-check', { command: 'code-quality-check', args: ['--tier', 'fast'] }) }),
      el('button', { type: 'button', text: 'Run full check', onclick: () => this.#emit('run-check', { command: 'code-quality-check', args: ['--tier', 'full'] }) }),
      el('button', { type: 'button', text: 'Reload report', onclick: () => this.#emit('reload', { command: 'code-quality-report', args: ['json'] }) })
    );
    this.#root.replaceChildren(el('style', { textContent: STYLE }), card);
  }
}

if (!customElements.get('code-quality-report')) customElements.define('code-quality-report', CodeQualityReport);
