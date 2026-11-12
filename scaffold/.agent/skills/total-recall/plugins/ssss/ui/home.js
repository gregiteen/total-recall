const ink = 'var(--color-ink, #1b1814)';
const panel = 'var(--color-panel, #27211a)';
const line = 'var(--color-line, #564636)';
const paper = 'var(--color-paper, #f7ebd6)';
const quiet = 'var(--color-quiet, #c2b59f)';
const amber = 'var(--color-amber, #b98439)';
const gold = 'var(--color-gold, #f4c97a)';
const sans = 'var(--typography-body-font-family, IBM Plex Sans, system-ui, sans-serif)';
const mono = 'var(--typography-evidence-font-family, IBM Plex Mono, ui-monospace, monospace)';

const page = `
  <style>
    :host { display:block; color:${paper}; font:var(--typography-body-font-size, 14px)/var(--typography-body-line-height, 1.45) ${sans}; }
    * { box-sizing:border-box; }
    h2,h3,p,dl,dd,ul { margin:0; }
    .sheet {
      background:var(--component-ledger-sheet-background-color, ${ink});
      border:1px solid var(--component-ledger-sheet-border-color, ${line});
      border-radius:var(--radius-md, 10px); overflow:hidden;
    }
    header { display:flex; flex-wrap:wrap; align-items:center; gap:var(--spacing-md, 12px);
      padding:var(--spacing-md, 12px) var(--spacing-lg, 16px); border-bottom:1px solid ${line}; }
    .mark { width:32px; height:32px; flex:none; color:${gold}; }
    .title { flex:1 1 200px; }
    h2 { font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) ${sans}; }
    h3 { font-size:15px; margin-bottom:var(--spacing-sm, 8px); }
    .quiet, label, dt { color:${quiet}; }
    .ledger { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap:1px; background:${line}; }
    .slot {
      min-width:0; background:var(--component-ledger-slot-background-color, ${panel});
      border-left:3px solid var(--component-ledger-slot-border-color, ${amber});
      padding:var(--component-ledger-slot-padding, 12px 16px);
    }
    dd { margin-top:var(--spacing-xs, 4px); font-size:16px; font-weight:650; overflow-wrap:anywhere; }
    small, .path { display:block; margin-top:var(--spacing-xs, 4px); color:${quiet}; font-family:${mono}; font-size:12px; overflow-wrap:anywhere; }
    .reading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:var(--spacing-sm, 8px);
      padding:var(--spacing-sm, 8px) var(--spacing-lg, 16px); border-bottom:1px solid ${line}; }
    .groups { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
    section.group { min-width:0; padding:var(--spacing-lg, 16px); border-bottom:1px solid ${line}; border-right:1px solid ${line}; }
    form { display:grid; gap:var(--spacing-sm, 8px); }
    label { display:grid; gap:var(--spacing-xs, 4px); }
    .choice { display:flex; align-items:center; gap:6px; min-height:44px; color:${paper}; }
    button, input, select {
      min-height:44px; max-width:100%; padding:6px 10px; font:inherit; color:${paper};
      background:${panel}; border:1px solid ${line}; border-radius:var(--radius-sm, 5px);
    }
    input[type=text] { width:100%; min-width:0; font-family:${mono}; }
    input[type=checkbox] { min-height:auto; width:18px; height:18px; }
    button { cursor:pointer; }
    .primary { border-color:${gold}; color:${gold}; }
    button:disabled, select:disabled { opacity:.55; cursor:wait; }
    :focus-visible { outline:2px solid ${gold}; outline-offset:2px; }
    .outcome { margin-top:var(--spacing-md, 12px); }
    .verdict { font-weight:650; }
    [data-tone=pass] { color:var(--component-verdict-pass-text-color, var(--color-pass, #c2e4ad)); }
    [data-tone=fail] { color:var(--component-verdict-fail-text-color, var(--color-fail, #ffaaa1)); }
    .fields { display:grid; grid-template-columns:max-content 1fr; gap:2px var(--spacing-md, 12px); margin-top:var(--spacing-sm, 8px); }
    .fields dt { font-family:${mono}; color:var(--component-field-pointer-text-color, ${gold}); font-size:12px; }
    .fields dd { margin:0; font-size:13px; font-weight:400; font-family:${mono}; overflow-wrap:anywhere; }
    ul.findings { padding-left:18px; margin-top:var(--spacing-xs, 4px); font-family:${mono}; font-size:12px; }
    pre {
      margin:var(--spacing-sm, 8px) 0 0; max-height:280px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere;
      background:var(--component-evidence-readout-background-color, ${panel});
      padding:var(--component-evidence-readout-padding, 12px); border-radius:var(--radius-sm, 5px);
      font:var(--typography-evidence-font-size, 13px)/var(--typography-evidence-line-height, 1.5) ${mono};
    }
    pre:empty { display:none; }
    details { margin-top:var(--spacing-sm, 8px); }
    summary { cursor:pointer; color:${quiet}; min-height:28px; }
    .changed { animation:settle .2s ease-out; }
    @keyframes settle { from { transform:translateY(3px); opacity:.75; } to { transform:none; opacity:1; } }
    @media (prefers-reduced-motion: reduce) { .changed { animation:none; } }
  </style>
  <article class="sheet" aria-label="SSSS installation and contract checks">
    <header>
      <svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M10 8h17l3 3M10 16h14l6-5M10 24h14l6-5M10 32h17l3-5M10 8v24"
          fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="title"><h2>SSSS</h2><p class="quiet">Engine, portable skill and project scaffold</p></div>
      <label>Brain <select id="scope">
        <option value="auto">Current brain</option><option value="project">Project</option><option value="global">Shared</option>
      </select></label>
      <button type="button" id="inspect" class="primary">Check installation</button>
      <button type="button" id="repair">Repair managed files</button>
    </header>
    <dl class="ledger">
      <div class="slot"><dt>Engine / spec</dt><dd id="engine">—</dd><small id="engine-note"></small></div>
      <div class="slot"><dt>Portable skill</dt><dd id="skill">—</dd><small id="skill-note"></small></div>
      <div class="slot"><dt>Project scaffold</dt><dd id="scaffold">—</dd><small id="scaffold-note"></small></div>
    </dl>
    <div class="reading" aria-live="polite">
      <strong id="install-verdict" class="verdict">Not checked yet</strong>
      <time id="install-time" class="quiet"></time>
    </div>
    <div class="groups">
      <section class="group" aria-labelledby="validate-title">
        <h3 id="validate-title">Document contract</h3>
        <form id="validate">
          <label>Document path <input type="text" name="file" required autocomplete="off"></label>
          <label>Extension registry path <input type="text" name="extension" autocomplete="off"></label>
          <button type="button">Validate document</button>
        </form>
        <div class="outcome" id="validate-outcome" aria-live="polite"></div>
      </section>
      <section class="group" aria-labelledby="registry-title">
        <h3 id="registry-title">Registry lock</h3>
        <form id="registry">
          <label>Lock file path <input type="text" name="lock" required autocomplete="off"></label>
          <label>Extension registry path <input type="text" name="extension" autocomplete="off"></label>
          <button type="button">Verify registry</button>
        </form>
        <div class="outcome" id="registry-outcome" aria-live="polite"></div>
      </section>
      <section class="group" aria-labelledby="scaffold-title">
        <h3 id="scaffold-title">New SSSS project</h3>
        <form id="scaffold-form">
          <label>New directory <input type="text" name="directory" required autocomplete="off"></label>
          <label>Extension name <input type="text" name="extension" autocomplete="off"></label>
          <label class="choice"><input type="checkbox" name="with-total-recall"> Include Total Recall wiring</label>
          <button type="button">Create project</button>
        </form>
        <div class="outcome" id="scaffold-outcome" aria-live="polite"></div>
      </section>
      <section class="group" aria-labelledby="conformance-title">
        <h3 id="conformance-title">Engine conformance</h3>
        <p class="quiet">Runs the canonical reference suite. Allow up to two minutes.</p>
        <form id="conformance"><button type="button">Run engine conformance</button></form>
        <div class="outcome" id="conformance-outcome" aria-live="polite"></div>
      </section>
    </div>
  </article>`;

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function fields(entries) {
  const list = element('dl', undefined, { class: 'fields' });
  for (const [name, value] of entries) {
    if (value === undefined || value === null || value === '') continue;
    list.append(element('dt', name), element('dd', value));
  }
  return list;
}

function findings(title, items) {
  if (!Array.isArray(items) || !items.length) return [];
  const list = element('ul', undefined, { class: 'findings' });
  for (const item of items) {
    list.append(element('li', typeof item === 'string' ? item : item?.message || JSON.stringify(item)));
  }
  return [element('p', title + ' (' + items.length + ')', { class: 'quiet' }), list];
}

export class SsssHome extends HTMLElement {
  set host(value) {
    this.bridge = value;
    if (this.isConnected && this.shadowRoot) this.inspect();
  }
  get host() { return this.bridge; }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).innerHTML = page;
      this.find('inspect').onclick = () => this.inspect();
      this.find('scope').onchange = () => this.inspect();
      this.find('repair').onclick = () => this.inspect('repair');
      this.bindForm('validate', 'validate', result => this.showValidation(result));
      this.bindForm('registry', 'registry', result => this.showRegistry(result));
      this.bindForm('scaffold-form', 'scaffold', result => this.showScaffold(result));
      this.bindForm('conformance', 'conformance', result => this.showConformance(result));
    }
    this.inspect();
  }

  find(id) { return this.shadowRoot.getElementById(id); }

  bindForm(id, operation, show) {
    const form = this.find(id);
    // The dashboard frame intentionally disables native form submission.
    const run = () => {
      if (!form.reportValidity()) return;
      const args = [];
      for (const [name, value] of new FormData(form)) {
        if (name === 'with-total-recall') args.push('--with-total-recall');
        else if (String(value).trim()) args.push('--' + name, String(value).trim());
      }
      this.perform(operation, args, this.find(operation === 'scaffold' ? 'scaffold-outcome' : id + '-outcome'), show);
    };
    form.querySelector('button').onclick = run;
    form.onkeydown = event => {
      if (event.key !== 'Enter' || event.isComposing || !event.target.matches('input[type="text"]')) return;
      event.preventDefault();
      run();
    };
  }

  // Runs one operation through the authenticated bridge and returns its parsed verdict.
  async run(operation, args) {
    if (!this.host?.run) throw new Error('Command bridge unavailable. Open this Home from the Total Recall dashboard.');
    let reply;
    try {
      reply = await this.host.run(operation, [...args, '--json']);
    } catch (error) {
      // A failed check emits one JSON verdict followed by human-readable stderr.
      for (const line of String(error?.message || '').split('\n')) {
        if (!line.startsWith('{')) continue;
        try {
          const verdict = JSON.parse(line);
          if (verdict?.ok === false) return verdict;
        } catch { /* A bridge error may carry no owner verdict. */ }
      }
      throw error;
    }
    const result = typeof reply === 'string' ? JSON.parse(reply) : reply;
    if (typeof result?.ok !== 'boolean') throw new Error('SSSS returned no verdict.');
    return result;
  }

  lock(busy) {
    this.busy = busy;
    for (const control of this.shadowRoot.querySelectorAll('button,select')) control.disabled = busy;
  }

  async perform(operation, args, outcome, show) {
    if (this.busy) return;
    this.lock(true);
    outcome.replaceChildren(element('p', 'Running…', { class: 'quiet' }));
    let nodes;
    try {
      const result = await this.run(operation, args);
      nodes = show(result);
    } catch (error) {
      nodes = [element('p', 'Unavailable', { class: 'verdict', 'data-tone': 'fail' }), element('p', error.message, { class: 'path' })];
    } finally {
      this.lock(false);
    }
    const stamp = new Date().toISOString();
    outcome.replaceChildren(...nodes, element('time', stamp, { class: 'path', datetime: stamp }));
    outcome.classList.remove('changed');
    void outcome.offsetWidth;
    outcome.classList.add('changed');
  }

  verdict(ok, pass, fail) {
    return element('p', ok ? pass : fail, { class: 'verdict', 'data-tone': ok ? 'pass' : 'fail' });
  }

  showValidation(result) {
    return [
      this.verdict(result.ok, 'Valid', 'Invalid'),
      fields([['type', result.type], ['error', result.error]]),
      ...findings('Errors', result.errors),
      ...findings('Warnings', result.warnings),
    ];
  }

  showRegistry(result) {
    return [
      this.verdict(result.ok, 'Lock matches the effective registry', 'Lock does not match'),
      fields([
        ['specVersion', result.specVersion],
        ['expected_integrity', result.expected_integrity],
        ['actual_integrity', result.actual_integrity === null ? 'none in lock' : result.actual_integrity],
        ['error', result.error],
      ]),
    ];
  }

  showScaffold(result) {
    const nodes = [
      this.verdict(result.ok, 'Project created', 'Project not created'),
      fields([
        ['directory', result.directory],
        ['version', result.version],
        ['files', Array.isArray(result.files) ? result.files.length : undefined],
        ['error', result.error],
      ]),
    ];
    if (Array.isArray(result.files) && result.files.length) {
      const list = element('details');
      list.append(element('summary', 'Generated files'), element('pre', result.files.join('\n')));
      nodes.push(list);
    }
    return nodes;
  }

  showConformance(result) {
    return [
      this.verdict(result.ok, 'Conformance passed', 'Conformance failed'),
      fields([['exitCode', result.exitCode], ['signal', result.signal], ['error', result.error]]),
      element('pre', result.output || '', { tabindex: '0' }),
    ];
  }

  paintLedger(result) {
    this.find('engine').textContent = result?.version ? result.version + ' / ' + result.specVersion : '—';
    this.find('engine-note').textContent = result?.error || '';
    for (const part of ['skill', 'scaffold']) {
      const item = result?.[part];
      const value = this.find(part);
      value.textContent = item ? (item.ok ? item.files + ' files verified' : 'Needs repair') : '—';
      if (item) value.dataset.tone = item.ok ? 'pass' : 'fail';
      else delete value.dataset.tone;
      this.find(part + '-note').textContent = item ? (item.error || item.path || '') : '';
    }
  }

  async inspect(operation = 'status') {
    if (this.busy || !this.shadowRoot) return;
    const verdict = this.find('install-verdict');
    const time = this.find('install-time');
    this.paintLedger(null);
    this.lock(true);
    verdict.textContent = operation === 'repair' ? 'Repairing…' : 'Checking…';
    delete verdict.dataset.tone;
    try {
      const result = await this.run(operation, ['--scope', this.find('scope').value]);
      this.paintLedger(result);
      verdict.dataset.tone = result.ok ? 'pass' : 'fail';
      verdict.textContent = result.ok
        ? (operation === 'repair' ? 'Repaired and verified' : 'Installation complete and current')
        : 'Installation needs attention';
      const notes = [];
      if (result.error) notes.push(result.error);
      if (result.recoveredFrom) notes.push('Previous scaffold kept at ' + result.recoveredFrom);
      if (result.replacedLink) notes.push('Replaced link ' + result.replacedLink.path + ' → ' + result.replacedLink.target);
      if (notes.length) this.find('engine-note').textContent = notes.join('. ');
    } catch (error) {
      verdict.dataset.tone = 'fail';
      verdict.textContent = 'Reading unavailable: ' + error.message;
    } finally {
      this.lock(false);
    }
    const stamp = new Date().toISOString();
    time.textContent = stamp;
    time.dateTime = stamp;
    verdict.classList.remove('changed');
    void verdict.offsetWidth;
    verdict.classList.add('changed');
  }
}

if (!customElements.get('tr-ssss-home')) customElements.define('tr-ssss-home', SsssHome);
