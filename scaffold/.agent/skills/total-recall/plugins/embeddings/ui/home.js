/**
 * Embeddings Home — the plugin's native page.
 *
 * Answers, from the plugin's own JSON operations: which provider serves
 * vectors and whether text leaves this machine, how much of the vault has a
 * usable vector, which models the endpoint offers, and how fast the selected
 * model embeds. Reads `status` and `models` on open; benchmark and pull run
 * only when the operator asks. Anything not reported renders as a dash.
 */

const DASH = '—';
const BENCHMARK_MAX = 20;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** A reported value, or a dash when the operation did not report one. */
function shown(value) {
  return value === null || value === undefined || value === '' ? DASH : escapeHtml(value);
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** host.run may hand back parsed JSON, raw stdout, or a { stdout } envelope. */
export function parseResult(res) {
  if (res && typeof res === 'object' && typeof res.stdout === 'string') return parseResult(res.stdout);
  if (res && typeof res === 'object') return res;
  if (typeof res === 'string' && res.trim().startsWith('{')) return JSON.parse(res);
  throw new Error('the operation returned no JSON');
}

const LOCALITY = {
  local: { tone: 'ok', label: 'Local', note: 'Text sent for embedding stays on this machine.' },
  remote: { tone: 'warn', label: 'Remote', note: 'The endpoint or the selected model runs on another machine, so vault text leaves this host.' },
  unknown: { tone: 'warn', label: 'Unknown', note: 'No local model qualifies. Total Recall may try a hosted provider, which would send vault text off this machine.' },
  disabled: { tone: 'muted', label: 'Disabled', note: 'Embeddings are turned off for this brain.' },
};

export class EmbeddingsHome extends HTMLElement {
  constructor() {
    super();
    this.status = { phase: 'loading' };
    this.models = { phase: 'loading' };
    this.bench = { phase: 'idle' };
    this.pull = { phase: 'idle' };
    this.count = 10;
    this.pullModel = '';
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.load();
  }

  async read(op, args) {
    try {
      return { phase: 'ready', data: parseResult(await this.host.run(op, args)) };
    } catch (err) {
      return { phase: 'unavailable', error: err?.message || String(err) };
    }
  }

  async load() {
    if (!this.host) {
      const error = 'No Total Recall host is connected, so the plugin operations cannot run.';
      this.status = { phase: 'unavailable', error };
      this.models = { phase: 'unavailable', error };
      this.render();
      return;
    }
    this.status = { phase: 'loading' };
    this.models = { phase: 'loading' };
    this.render();
    [this.status, this.models] = await Promise.all([
      this.read('status', ['--json']),
      this.read('models', ['--json']),
    ]);
    this.render();
  }

  /** Runs a user-triggered operation; a JSON body with ok:false is a failure. */
  async act(slot, op, args) {
    if (!this.host || this[slot].phase === 'running') return;
    this[slot] = { phase: 'running' };
    this.render();
    const result = await this.read(op, args);
    if (result.phase !== 'ready') this[slot] = { phase: 'failed', error: result.error };
    else if (result.data.ok === false) this[slot] = { phase: 'failed', error: result.data.reason || 'the operation reported a failure', data: result.data };
    else this[slot] = { phase: 'done', data: result.data };
    this.render();
  }

  runBenchmark() {
    const n = Number(this.count);
    if (!Number.isInteger(n) || n < 1 || n > BENCHMARK_MAX) {
      this.bench = { phase: 'failed', error: `Samples must be a whole number from 1 to ${BENCHMARK_MAX}.` };
      this.render();
      return;
    }
    this.act('bench', 'benchmark', ['--count', String(n), '--json']);
  }

  async runPull() {
    const model = this.pullModel.trim();
    if (!model) {
      this.pull = { phase: 'failed', error: 'Type the exact model name to pull.' };
      this.render();
      return;
    }
    await this.act('pull', 'pull', [model, '--json']);
    if (this.pull.phase === 'done') this.load();
  }

  renderProvider() {
    const s = this.status;
    if (s.phase === 'loading') return `<p class="notice" data-design-component="notice">Reading provider status${DASH}</p>`;
    if (s.phase !== 'ready') return `<p class="notice bad" data-design-component="notice">Provider status unavailable: ${escapeHtml(s.error)}</p>`;
    const d = s.data;
    const loc = LOCALITY[d.locality] || { tone: 'warn', label: d.locality || 'Unreported', note: '' };
    const attempts = Array.isArray(d.attempts) ? d.attempts : [];
    return `
      <div class="verdict">
        <span class="chip ${loc.tone}" data-design-component="locality-chip">${escapeHtml(loc.label)}</span>
        <span class="note">${escapeHtml(loc.note)}</span>
      </div>
      <dl class="facts">
        <div><dt>Provider</dt><dd>${shown(d.provider)}</dd></div>
        <div><dt>Endpoint</dt><dd class="mono">${shown(d.endpoint)}</dd></div>
        <div><dt>Selected model</dt><dd class="mono">${shown(d.selected_model)}</dd></div>
        <div><dt>Vector width</dt><dd class="mono">${d.embedding_dims ? `${escapeHtml(d.embedding_dims)} dims` : DASH}</dd></div>
      </dl>
      ${d.reason ? `<p class="notice" data-design-component="notice">${escapeHtml(d.reason)}</p>` : ''}
      ${attempts.length ? `
        <ul class="attempts">
          ${attempts.map(a => `
            <li class="mono ${a.reachable ? 'ok' : 'bad'}">${escapeHtml(a.url)} ${DASH} ${a.reachable ? 'reachable' : `unreachable: ${shown(a.reason)}`}</li>`).join('')}
        </ul>` : ''}`;
  }

  renderCredentials() {
    const fallback = this.status.phase === 'ready' ? this.status.data.hosted_fallback : null;
    return `
      <dl class="facts">
        <div><dt>Hosted fallback</dt><dd class="mono">${shown(fallback)}</dd></div>
        <div><dt>Credential owner</dt><dd>Auth</dd></div>
      </dl>
      <p class="notice" data-design-component="notice">Keys for hosted embedding providers are held by the Auth owner. This plugin does not read, list or display them, so their readiness is reported as unknown rather than guessed.</p>`;
  }

  renderCoverage() {
    const s = this.status;
    if (s.phase === 'loading') return `<p class="notice" data-design-component="notice">Counting vectors${DASH}</p>`;
    if (s.phase !== 'ready') return `<p class="notice bad" data-design-component="notice">Coverage unavailable: ${escapeHtml(s.error)}</p>`;
    const b = s.data.brain;
    if (!b) return '<p class="notice" data-design-component="notice">No brain was found in the working directory or home, so there is no vault to measure.</p>';
    if (b.state !== 'ok') {
      return `
        <p class="notice warn" data-design-component="notice">Index state <span class="mono">${shown(b.state)}</span>: ${shown(b.reason)}</p>
        <dl class="facts">
          <div><dt>Brain</dt><dd class="mono">${shown(b.dir)}</dd></div>
          <div><dt>Vault nodes</dt><dd class="mono">${shown(b.vault_nodes)}</dd></div>
          <div><dt>Missing a vector</dt><dd class="mono">${shown(b.missing)}</dd></div>
        </dl>`;
    }
    const counts = [
      ['Usable', b.embedded, 'ok'],
      ['Stale', b.stale, b.stale ? 'warn' : ''],
      ['Wrong width', b.mismatched, b.mismatched ? 'warn' : ''],
      ['Missing', b.missing, b.missing ? 'warn' : ''],
      ['Orphaned rows', b.orphaned, ''],
    ];
    return `
      <div class="coverage">
        <div class="figure" data-design-component="coverage-figure">${b.percent === null || b.percent === undefined ? DASH : `${escapeHtml(b.percent)}%`}</div>
        <div class="figure-caption">${shown(b.embedded)} of ${shown(b.vault_nodes)} vault nodes have a current, correct-width vector</div>
      </div>
      <ul class="counts">
        ${counts.map(([label, value, tone]) => `
          <li class="count-row ${tone}" data-design-component="count-row"><span>${label}</span><span class="mono">${shown(value)}</span></li>`).join('')}
      </ul>
      <dl class="facts">
        <div><dt>Indexed by</dt><dd class="mono">${shown(b.model)}</dd></div>
        <div><dt>Index rows</dt><dd class="mono">${shown(b.rows)}</dd></div>
        <div><dt>Index size</dt><dd class="mono">${formatBytes(b.db_bytes)}</dd></div>
        <div><dt>Unparseable files</dt><dd class="mono">${shown(b.parse_errors)}</dd></div>
        <div><dt>Brain</dt><dd class="mono">${shown(b.dir)}</dd></div>
      </dl>
      ${b.stale || b.mismatched || b.missing ? '<p class="notice" data-design-component="notice">Rebuild the unusable vectors with <span class="mono">total-recall compile</span>.</p>' : ''}`;
  }

  renderModels() {
    const m = this.models;
    if (m.phase === 'loading') return `<p class="notice" data-design-component="notice">Listing models${DASH}</p>`;
    if (m.phase !== 'ready') return `<p class="notice bad" data-design-component="notice">Model list unavailable: ${escapeHtml(m.error)}</p>`;
    const d = m.data;
    if (d.reachable === false) return '<p class="notice bad" data-design-component="notice">No endpoint answered. The endpoints tried are listed under Provider.</p>';
    const rows = Array.isArray(d.models) ? d.models : [];
    if (!rows.length) return `<p class="notice" data-design-component="notice">${shown(d.url)} reports no models. Pull one below.</p>`;
    return `
      <p class="caption">${shown(d.url)} ${DASH} the vault needs ${shown(d.vault_dims)}-dim vectors</p>
      <ul class="models">
        ${rows.map(r => `
          <li class="model-row${r.name === d.selected ? ' selected' : ''}" data-design-component="model-row">
            <span class="mono name">${shown(r.name)}${r.name === d.selected ? ' <span class="tag ok">selected</span>' : ''}</span>
            <span class="tags">
              <span class="tag">${r.dims ? `${escapeHtml(r.dims)} dims` : 'width unknown'}</span>
              <span class="tag ${r.embedding_capable ? 'ok' : ''}">${r.embedding_capable ? 'embeds' : 'no embedding'}</span>
              <span class="tag ${r.compatible ? 'ok' : 'warn'}">${r.compatible ? 'vault-compatible' : 'not usable'}</span>
              ${r.upstream ? '<span class="tag warn">upstream</span>' : ''}
            </span>
          </li>`).join('')}
      </ul>`;
  }

  renderBenchmark() {
    const b = this.bench;
    const running = b.phase === 'running';
    const d = b.data || {};
    return `
      <div class="action">
        <label class="field">Samples
          <input id="bench-count" type="number" min="1" max="${BENCHMARK_MAX}" step="1" value="${escapeHtml(this.count)}" ${running ? 'disabled' : ''}>
        </label>
        <button id="bench-run" type="button" class="primary" data-design-component="button-primary" ${running || !this.host ? 'disabled' : ''}>${running ? 'Measuring' : 'Run benchmark'}</button>
      </div>
      <p class="caption">Embeds a neutral sentence with the selected model, never vault text. Runs only against a local model.</p>
      ${b.phase === 'failed' ? `<p class="notice bad" data-design-component="notice">Benchmark failed: ${escapeHtml(b.error)}</p>` : ''}
      ${b.phase === 'done' ? `
        <dl class="facts">
          <div><dt>Per embedding</dt><dd class="mono">${shown(d.ms_per_embedding)} ms</dd></div>
          <div><dt>Range</dt><dd class="mono">${shown(d.min_ms)}${DASH}${shown(d.max_ms)} ms</dd></div>
          <div><dt>Samples</dt><dd class="mono">${shown(d.samples)} × ${shown(d.dims)} dims</dd></div>
          <div><dt>Full vault</dt><dd class="mono">${d.projected_minutes === null || d.projected_minutes === undefined ? DASH : `about ${escapeHtml(d.projected_minutes)} min for ${shown(d.vault_nodes)} nodes`}</dd></div>
          <div><dt>Measured</dt><dd class="mono">${shown(d.model)} on ${shown(d.url)}</dd></div>
        </dl>` : ''}`;
  }

  renderPull() {
    const p = this.pull;
    const running = p.phase === 'running';
    const d = p.data || {};
    return `
      <div class="action">
        <label class="field grow">Model name
          <input id="pull-model" type="text" spellcheck="false" autocomplete="off" value="${escapeHtml(this.pullModel)}" ${running ? 'disabled' : ''}>
        </label>
        <button id="pull-run" type="button" class="primary" data-design-component="button-primary" ${running || !this.host ? 'disabled' : ''}>${running ? 'Pulling' : 'Pull model'}</button>
      </div>
      <p class="caption">Downloads the named model to the configured loopback endpoint. Cloud and upstream models are refused. A pull can take several minutes.</p>
      ${p.phase === 'failed' ? `<p class="notice bad" data-design-component="notice">Pull failed${d.model ? ` for <span class="mono">${escapeHtml(d.model)}</span>` : ''}: ${escapeHtml(p.error)}</p>` : ''}
      ${p.phase === 'done' ? `<p class="notice ok" data-design-component="notice"><span class="mono">${shown(d.model)}</span> is ready on <span class="mono">${shown(d.url)}</span>.</p>` : ''}`;
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;
    const loading = this.status.phase === 'loading' || this.models.phase === 'loading';
    root.innerHTML = `
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          padding: var(--spacing-lg, 16px);
          color: var(--colors-text, #ecfeff);
          background: var(--colors-background, #07171d);
          font-family: var(--typography-body-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          font-size: var(--typography-body-font-size, 13px);
        }
        *, *::before, *::after { box-sizing: border-box; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
        header { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md, 12px); flex-wrap: wrap; margin-bottom: var(--spacing-lg, 16px); }
        h1 { margin: 0; font-size: 18px; }
        h1 + p { margin: 2px 0 0; color: var(--colors-muted, #67e8f9); font-size: var(--typography-label-font-size, 11px); }
        h2 { margin: 0 0 var(--spacing-md, 12px); font-size: var(--typography-label-font-size, 11px); font-weight: var(--typography-label-font-weight, 700); letter-spacing: 0.05em; text-transform: uppercase; color: var(--colors-muted, #67e8f9); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md, 12px); }
        section { background: var(--colors-surface, #0e2a35); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-md, 6px); padding: var(--spacing-md, 12px); min-width: 0; }
        .mono { font-family: var(--typography-mono-font-family, 'JetBrains Mono', 'Fira Code', monospace); font-size: var(--typography-mono-font-size, 12px); overflow-wrap: anywhere; }
        .verdict { display: flex; align-items: center; gap: var(--spacing-sm, 8px); flex-wrap: wrap; margin-bottom: var(--spacing-md, 12px); }
        .chip { font-size: var(--typography-label-font-size, 11px); font-weight: 700; text-transform: uppercase; padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px); border-radius: var(--rounded-md, 6px); border: 1px solid currentColor; }
        .note, .caption { color: var(--colors-muted, #67e8f9); font-size: var(--typography-label-font-size, 11px); }
        .caption { margin: 0 0 var(--spacing-sm, 8px); }
        .ok { color: var(--colors-ok, #10b981); }
        .warn { color: var(--colors-warn, #f59e0b); }
        .bad { color: var(--colors-danger, #ef4444); }
        .muted { color: var(--colors-muted, #67e8f9); }
        .facts { display: grid; gap: var(--spacing-xs, 4px); margin: 0; }
        .facts div { display: flex; justify-content: space-between; gap: var(--spacing-md, 12px); }
        dt { color: var(--colors-muted, #67e8f9); }
        dd { margin: 0; text-align: right; }
        .notice { margin: var(--spacing-sm, 8px) 0 0; padding: var(--spacing-sm, 8px); background: var(--colors-background, #07171d); border-radius: var(--rounded-sm, 4px); }
        .attempts, .counts, .models { list-style: none; margin: var(--spacing-sm, 8px) 0 0; padding: 0; display: grid; gap: var(--spacing-xs, 4px); }
        .coverage { display: flex; align-items: baseline; gap: var(--spacing-md, 12px); flex-wrap: wrap; margin-bottom: var(--spacing-sm, 8px); }
        .figure { font-family: var(--typography-figure-font-family, 'JetBrains Mono', monospace); font-size: var(--typography-figure-font-size, 28px); font-weight: var(--typography-figure-font-weight, 800); }
        .figure-caption { color: var(--colors-muted, #67e8f9); }
        .count-row { display: flex; justify-content: space-between; font-family: var(--typography-mono-font-family, 'JetBrains Mono', monospace); font-size: var(--typography-mono-font-size, 12px); }
        .count-row:not(.ok):not(.warn) { color: var(--colors-muted, #67e8f9); }
        .counts { margin-bottom: var(--spacing-md, 12px); }
        .model-row { display: flex; justify-content: space-between; align-items: center; gap: var(--spacing-sm, 8px); flex-wrap: wrap; background: var(--colors-background, #07171d); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-sm, 4px); padding: var(--spacing-sm, 8px); }
        .model-row.selected { border-color: var(--colors-primary, #06b6d4); }
        .tags { display: flex; gap: var(--spacing-xs, 4px); flex-wrap: wrap; }
        .tag { font-size: 10px; padding: 2px 6px; border-radius: var(--rounded-sm, 4px); border: 1px solid var(--colors-line, #164e63); color: var(--colors-muted, #67e8f9); }
        .tag.ok { color: var(--colors-ok, #10b981); }
        .tag.warn { color: var(--colors-warn, #f59e0b); }
        .action { display: flex; align-items: flex-end; gap: var(--spacing-sm, 8px); flex-wrap: wrap; margin-bottom: var(--spacing-sm, 8px); }
        .field { display: grid; gap: var(--spacing-xs, 4px); color: var(--colors-muted, #67e8f9); font-size: var(--typography-label-font-size, 11px); }
        .field.grow { flex: 1 1 180px; }
        input { min-height: 44px; padding: 0 var(--spacing-sm, 8px); color: var(--colors-text, #ecfeff); background: var(--colors-background, #07171d); border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-sm, 4px); font-family: var(--typography-mono-font-family, 'JetBrains Mono', monospace); }
        input[type=number] { width: 88px; }
        button.primary { min-height: 44px; padding: 0 var(--spacing-lg, 16px); border: 0; border-radius: var(--rounded-sm, 4px); cursor: pointer; font-weight: 700; color: var(--colors-on-primary, #07171d); background: var(--colors-primary, #06b6d4); transition: background 0.15s ease; }
        button.primary:hover:not(:disabled) { background: var(--colors-primary-hover, #22d3ee); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        button.refresh { min-height: 44px; padding: 0 var(--spacing-md, 12px); color: var(--colors-text, #ecfeff); background: transparent; border: 1px solid var(--colors-line, #164e63); border-radius: var(--rounded-sm, 4px); cursor: pointer; }
        button:focus-visible, input:focus-visible { outline: 2px solid var(--colors-primary-hover, #22d3ee); outline-offset: 2px; }
      </style>
      <header>
        <div>
          <h1>Embeddings</h1>
          <p>Vectors behind Total Recall search for this brain</p>
        </div>
        <button id="refresh" type="button" class="refresh" ${loading || !this.host ? 'disabled' : ''}>${loading ? 'Reading' : 'Refresh'}</button>
      </header>
      <div class="grid">
        <section data-design-component="section" aria-labelledby="h-provider"><h2 id="h-provider">Provider</h2>${this.renderProvider()}</section>
        <section data-design-component="section" aria-labelledby="h-coverage"><h2 id="h-coverage">Vault coverage</h2>${this.renderCoverage()}</section>
        <section data-design-component="section" aria-labelledby="h-models"><h2 id="h-models">Models on the endpoint</h2>${this.renderModels()}</section>
        <section data-design-component="section" aria-labelledby="h-credentials"><h2 id="h-credentials">Credentials</h2>${this.renderCredentials()}</section>
        <section data-design-component="section" aria-labelledby="h-benchmark"><h2 id="h-benchmark">Benchmark</h2>${this.renderBenchmark()}</section>
        <section data-design-component="section" aria-labelledby="h-pull"><h2 id="h-pull">Pull a model</h2>${this.renderPull()}</section>
      </div>`;

    root.getElementById('refresh')?.addEventListener('click', () => this.load());
    root.getElementById('bench-count')?.addEventListener('input', e => { this.count = e.target.value; });
    root.getElementById('bench-run')?.addEventListener('click', () => this.runBenchmark());
    root.getElementById('pull-model')?.addEventListener('input', e => { this.pullModel = e.target.value; });
    root.getElementById('pull-run')?.addEventListener('click', () => this.runPull());
  }
}

if (!customElements.get('tr-embeddings-home')) {
  customElements.define('tr-embeddings-home', EmbeddingsHome);
}
