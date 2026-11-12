const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--color-text, #302519);
      font: 1rem/1.55 var(--typography-body-font-family, system-ui, sans-serif);
    }
    * { box-sizing: border-box; }
    .atlas {
      background: var(--color-background, #f9f1e3);
      border: 1px solid var(--color-outline, #cbb497);
      border-radius: var(--radius-panel, 0.45rem);
      padding: var(--spacing-lg, 1.5rem);
    }
    .toolbar, .search-controls, .graph-tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--spacing-sm, 0.65rem);
    }
    h2, h3 {
      font-family: var(--typography-heading-font-family, Georgia, serif);
      font-weight: var(--typography-heading-font-weight, 600);
      margin: 0;
    }
    h2 { font-size: var(--typography-heading-font-size, 1.8rem); }
    h3 { font-size: 1.3rem; }
    p { margin: 0.35rem 0; }
    .state, small { color: var(--color-muted, #6d5741); }
    [data-error] { color: var(--color-error, #9b2a20); }
    input, select, button {
      background: var(--color-surface, #fff9ee);
      border: 1px solid var(--color-outline, #cbb497);
      border-radius: var(--radius-control, 0.3rem);
      color: inherit;
      font: inherit;
      min-height: 44px;
      padding: 0.35rem 0.75rem;
    }
    input { flex: 1 1 13rem; min-width: 0; }
    button { cursor: pointer; }
    button:disabled { cursor: wait; opacity: 0.65; }
    :focus-visible { outline: 2px solid var(--color-primary, #8d3e10); outline-offset: 2px; }
    .search-controls button {
      background: var(--color-primary, #8d3e10);
      border-color: var(--color-primary, #8d3e10);
      color: var(--color-on-primary, #fff9ee);
      font-weight: 600;
    }
    .search { margin-block: var(--spacing-lg, 1.5rem); }
    label { display: block; font-weight: 600; margin-bottom: 0.3rem; }
    .grid { display: grid; gap: var(--spacing-lg, 1.5rem); grid-template-columns: repeat(2, minmax(0, 1fr)); }
    ul { list-style: none; padding: 0; margin: 0; }
    li { overflow-wrap: anywhere; }
    .index li, .links li { border-bottom: 1px solid var(--color-outline, #cbb497); padding-block: 0.5rem; }
    .index small { display: block; }
    small, code { font: 0.8rem/1.5 var(--typography-source-font-family, ui-monospace, monospace); }
    .results li {
      background: var(--color-surface, #fff9ee);
      border-inline-start: 2px solid var(--color-primary, #8d3e10);
      margin-block-start: var(--spacing-sm, 0.65rem);
      padding: var(--spacing-sm, 0.65rem) var(--spacing-md, 1rem);
    }
    .edge { color: var(--color-primary, #8d3e10); font-weight: 700; }
    @media (max-width: 580px) {
      .atlas { padding: var(--spacing-md, 1rem); }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
  <section class="atlas" aria-labelledby="atlas">
    <header class="toolbar">
      <div>
        <h2 id="atlas">Workspace wiki atlas</h2>
        <p id="upstream" class="state" role="status">Reading recorded version…</p>
      </div>
      <button type="button" id="reload">Refresh index</button>
    </header>
    <section class="search" role="search" aria-label="Evidence search">
      <label for="query">Search wiki evidence</label>
      <div class="search-controls">
        <input id="query" type="search" maxlength="220">
        <button type="button" id="search">Search</button>
      </div>
      <label for="scope">Evidence scope</label>
      <select id="scope">
        <option value="workspace">Selected workspace</option>
        <option value="all-vaults">All registered wikis</option>
      </select>
      <p id="search-state" class="state" role="status">Search headings and passages in this workspace.</p>
      <ul id="results" class="results" aria-label="Evidence results"></ul>
    </section>
    <div class="grid">
      <section class="index" aria-labelledby="index">
        <h3 id="index">Wiki index</h3>
        <p id="index-state" class="state" role="status">Reading workspace pages…</p>
        <ul id="pages" aria-label="Wiki pages"></ul>
      </section>
      <section aria-labelledby="topology">
        <div class="graph-tools">
          <h3 id="topology">Link topology</h3>
          <button type="button" id="graph">Inspect links</button>
        </div>
        <p id="graph-state" class="state" role="status">Trace links between pages in the workspace.</p>
        <ul id="links" class="links" aria-label="Documentation links"></ul>
      </section>
    </div>
  </section>
`;

const number = value => Number.isSafeInteger(value) && value >= 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

class OpenWikiPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.#field('reload').addEventListener('click', () => void this.load());
    this.#field('graph').addEventListener('click', () => void this.#graph());
    this.#field('search').addEventListener('click', () => void this.#search());
    this.#field('scope').addEventListener('change', () => {
      this.#field('results').replaceChildren();
      this.#field('links').replaceChildren();
      const label = this.#scope() === 'all-vaults' ? 'registered wikis' : 'this workspace';
      this.#state('search-state', `Search headings and passages in ${label}.`);
      this.#state('graph-state', `Trace links between pages in ${label}.`);
    });
    this.#field('query').addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      void this.#search();
    });
  }

  #field(id) {
    return this.shadowRoot.getElementById(id);
  }

  #scope() {
    return this.#field('scope').value === 'all-vaults' ? 'all-vaults' : 'workspace';
  }

  #state(id, text, error = false) {
    const field = this.#field(id);
    field.textContent = text;
    field.toggleAttribute('data-error', error);
  }

  async load() {
    const button = this.#field('reload');
    if (button.disabled) return;
    button.disabled = true;
    this.#state('index-state', 'Reading workspace pages…');
    this.#state('upstream', 'Reading recorded version…');
    this.#field('pages').replaceChildren();
    try {
      await Promise.all([
        this.#loadIndex(),
        this.#loadStatus(),
      ]);
    } finally {
      button.disabled = false;
    }
  }

  async #loadIndex() {
    try {
      const result = await this.host.run('hubs');
      if (result?.scope !== 'workspace' || !Array.isArray(result.hubs) || !number(result.count)) throw new Error('Invalid wiki index');
      const pages = result.hubs.slice(0, 12);
      for (const page of pages) {
        const row = element('li', '');
        row.append(element('strong', page.title), element('small', page.fileName));
        this.#field('pages').append(row);
      }
      const total = result.count;
      const count = total === 1 ? '1 wiki page' : `${total} wiki pages`;
      this.#state('index-state', total === 0 ? 'This workspace has no wiki pages.' :
        total > pages.length ? `${count}. Showing ${pages.length}.` : `${count}.`);
    } catch {
      this.#field('pages').replaceChildren();
      this.#state('index-state', 'Wiki index unavailable. Refresh to try again.', true);
    }
  }

  async #loadStatus() {
    try {
      const result = await this.host.run('status');
      if (result?.plugin !== 'openwiki' || !result.upstream) throw new Error('Invalid OpenWiki status');
      const { latestVersion, lastChecked } = result.upstream;
      const version = typeof result.generatorVersion === 'string'
        ? `Bundled generator ${result.generatorVersion}` : 'Bundled generator unavailable';
      const checked = Date.parse(lastChecked);
      const note = typeof latestVersion === 'string' && Number.isFinite(checked)
        ? ` · Latest upstream observation ${latestVersion} on ${new Date(checked).toISOString().slice(0, 10)}`
        : ' · Upstream check pending';
      this.#state('upstream', version + note);
    } catch {
      this.#state('upstream', 'Recorded upstream status unavailable.', true);
    }
  }

  async #search() {
    const button = this.#field('search');
    const query = this.#field('query').value.trim();
    if (button.disabled) return;
    if (!query || query.startsWith('--')) {
      this.#state('search-state', 'Enter a phrase or keyword to search.', true);
      return;
    }
    button.disabled = true;
    const scope = this.#scope();
    const label = scope === 'all-vaults' ? 'registered wikis' : 'this workspace';
    this.#state('search-state', `Searching ${label}…`);
    const list = this.#field('results');
    list.replaceChildren();
    try {
      const result = await this.host.run('search', [query, '--limit', '8', ...(scope === 'all-vaults' ? ['--all-vaults'] : [])]);
      if (scope !== this.#scope()) return;
      if (!result?.ok || result.scope !== scope || !Array.isArray(result.results) || !number(result.totalHits)) throw new Error('Invalid search results');
      for (const match of result.results) {
        const item = element('li', '');
        const section = match.section ? ` · ${match.section}` : '';
        const repository = scope === 'all-vaults' && match.repoName ? `${match.repoName} · ` : '';
        const reference = `${repository}${match.fileName}:${match.line}${section}`;
        item.append(element('strong', match.title), element('p', match.snippet), element('small', reference));
        list.append(item);
      }
      const total = result.totalHits;
      const noun = total === 1 ? 'passage' : 'passages';
      const clipped = total > result.results.length ? ` Showing ${result.results.length}.` : '';
      this.#state('search-state', total === 0 ? `No matching passages in ${label}.` : `${total} matching ${noun} in ${label}.${clipped}`);
    } catch {
      if (scope !== this.#scope()) return;
      list.replaceChildren();
      this.#state('search-state', 'Evidence search unavailable. Try again.', true);
    } finally {
      button.disabled = false;
    }
  }

  async #graph() {
    const button = this.#field('graph');
    if (button.disabled) return;
    button.disabled = true;
    const scope = this.#scope();
    const label = scope === 'all-vaults' ? 'registered wikis' : 'this workspace';
    this.#state('graph-state', 'Tracing links between wiki pages…');
    const list = this.#field('links');
    list.replaceChildren();
    try {
      const result = await this.host.run('graph', ['--format', 'json', ...(scope === 'all-vaults' ? ['--all-vaults'] : [])]);
      if (scope !== this.#scope()) return;
      if (!result?.ok || result.scope !== scope || !Array.isArray(result.nodes) || !Array.isArray(result.edges) ||
          !number(result.counts?.nodes) || !number(result.counts.edges) || !number(result.counts.orphans)) throw new Error('Invalid wiki topology');
      const labels = new Map(result.nodes.map(node => [node.id, node.label]));
      const edges = result.edges.slice(0, 12);
      for (const edge of edges) {
        const row = element('li', '');
        row.append(element('span', labels.get(edge.from) ?? edge.from),
          element('span', ' → ', 'edge'), element('span', labels.get(edge.to) ?? edge.to));
        list.append(row);
      }
      const { nodes, edges: total, orphans } = result.counts;
      const shown = total > edges.length ? ` Showing ${edges.length}.` : '';
      const pages = nodes === 1 ? '1 page' : `${nodes} pages`;
      const links = total === 1 ? '1 link' : `${total} links`;
      this.#state('graph-state', nodes === 0 ? `No pages to map in ${label}.` :
        `${pages}, ${links}, ${orphans} unlinked in ${label}.${shown}`);
    } catch {
      if (scope !== this.#scope()) return;
      list.replaceChildren();
      this.#state('graph-state', 'Link topology unavailable. Try again.', true);
    } finally {
      button.disabled = false;
    }
  }
}

if (!customElements.get('openwiki-panel')) customElements.define('openwiki-panel', OpenWikiPanel);
