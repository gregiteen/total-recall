/**
 * <code-quality-report> — renders a code-quality report view.
 *
 * Reads the JSON printed by `code-quality report --json` through the host
 * (core/report-data.mjs). Nothing here is computed locally: every number is a
 * field of that view, and a missing/unreadable/stale/partial view never renders
 * as passing. With no view set the element says so instead of showing data.
 *
 * Explicit gate actions run the owner checker once and reload its report.
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
.report { border: 1px solid var(--color-border, currentColor); border-radius: var(--radius-md, 6px); padding: var(--space-4, 16px); background: var(--color-surface, transparent); }
.status { font-weight: 600; font-size: 1.1em; }
.status[data-status="clean"] { color: var(--color-success, inherit); }
.status[data-status="partial"], .status[data-status="stale"], .status[data-status="unknown-freshness"], .status[data-status="zero-scope"] { color: var(--color-warning, inherit); }
.status[data-status="failed"], .status[data-status="unparsed-failure"], .status[data-status="infrastructure"], .status[data-status="unreadable"], .status[data-status="missing"] { color: var(--color-danger, inherit); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 12px 0; }
dt { opacity: .7; } dd { margin: 0; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--color-border, currentColor); }
ul { margin: 8px 0; padding-left: 20px; }
button { font: inherit; min-height: 44px; margin-right: 8px; cursor: pointer; }
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
  #busy = false;
  #notice = '';

  connectedCallback() {
    this.#root ||= this.attachShadow({ mode: 'open' });
    this.#render();
    if (this.host) void this.#refresh();
  }

  get view() { return this.#view; }
  set view(value) {
    this.#view = value && typeof value === 'object' ? value : null;
    if (this.#root) this.#render();
  }

  async #read() {
    let report;
    try { report = await this.host.run('report', ['--json']); }
    catch (error) { report = JSON.parse(error.message); }
    if (typeof report?.status !== 'string') throw new Error('The owner returned no report.');
    this.view = report;
  }

  async #refresh(tier) {
    if (!this.host || this.#busy) return;
    this.#busy = true;
    this.#notice = tier ? `Running the ${tier} gates…` : 'Reading the report…';
    this.#render();
    const previous = this.#view?.finishedAt;
    let failure;
    try {
      if (tier) {
        try { await this.host.run('run', ['--tier', tier, '--json']); }
        catch (error) {
          try { failure = JSON.parse(error.message).error || 'The gate run exited nonzero.'; }
          catch { failure = 'The gate run could not complete.'; }
        }
      }
      await this.#read();
      this.#notice = tier && (!this.#view?.finishedAt || this.#view.finishedAt === previous)
        ? failure || 'The run did not produce a fresh report.' : '';
    } catch {
      this.#notice = failure || 'Could not read the latest report.';
    } finally {
      this.#busy = false;
      this.#render();
    }
  }

  #render() {
    const v = this.#view;
    const report = el('div', { className: 'report' });
    if (!v || typeof v.status !== 'string') {
      report.append(el('div', { className: 'status', text: 'No report data', 'data-status': 'missing' }),
        el('p', { text: 'Reload the selected repository’s report or run its configured gates.' }));
    } else {
      report.append(el('div', { className: 'status', text: STATUS_LABEL[v.status] || `Unknown status: ${v.status}`, 'data-status': v.status }));
      if (v.reasons?.length) report.append(el('ul', {}, ...v.reasons.map((r) => el('li', { text: r }))));
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
        report.append(dl);
      }
      if (v.gates?.length) {
        const head = el('tr', {}, ...['Gate', 'Result', 'Files scanned', 'Findings', 'Time'].map((h) => el('th', { text: h })));
        const body = v.gates.map((g) => {
          const result = g.skipped ? `skipped (${g.tier})` : g.spawnError ? `spawn failed: ${g.spawnError}` : g.timedOut ? 'timed out' : g.ok ? 'passed' : `failed (exit ${g.exitCode})`;
          return el('tr', {}, el('td', { text: g.id }), el('td', { text: result }),
            el('td', { text: g.scanned ?? '—' }), el('td', { text: g.skipped ? '—' : g.findings }), el('td', { text: g.skipped ? '—' : fmtMs(g.durationMs) }));
        });
        report.append(el('table', {}, el('thead', {}, head), el('tbody', {}, ...body)));
      }
      if (v.findings?.length) {
        report.append(el('ul', {}, ...v.findings.slice(0, 50).map((f) => el('li', { text: `${f.file}:${f.line}  ${f.code}  ${f.message}` }))));
        if (v.findings.length > 50 || v.findingsTruncated) report.append(el('p', { text: 'More findings are in the report file.' }));
      }
      if (v.reportFile) report.append(el('p', { text: `Report file: ${v.reportFile}` }));
    }
    report.append(
      el('button', { type: 'button', text: 'Run fast check', disabled: this.#busy, onclick: () => void this.#refresh('fast') }),
      el('button', { type: 'button', text: 'Run full check', disabled: this.#busy, onclick: () => void this.#refresh('full') }),
      el('button', { type: 'button', text: 'Reload report', disabled: this.#busy, onclick: () => void this.#refresh() }),
      el('p', { role: 'status', text: this.#notice }),
    );
    this.#root.replaceChildren(el('style', { textContent: STYLE }), report);
  }
}

if (!customElements.get('code-quality-report')) customElements.define('code-quality-report', CodeQualityReport);
