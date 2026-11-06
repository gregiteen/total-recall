const card = `
  <style>
    :host {
      --face-ink: #1b1814; --face-panel: #27211a; --face-line: #564636; --face-paper: #f7ebd6;
      --face-quiet: #c2b59f; --face-gold: #f4c97a; --face-danger: #ffaaa1; --face-good: #c2e4ad;
      --ink:var(--face-ink); --panel:var(--face-panel); --line:var(--border,var(--face-line));
      --paper:var(--text-primary,var(--face-paper)); --quiet:var(--face-quiet);
      --gold:var(--face-gold); --danger:var(--face-danger); --good:var(--face-good);
      display:block; color:var(--paper); font:14px/1.45 system-ui,sans-serif;
    }
    * { box-sizing:border-box; }
    .workbench { background:var(--ink); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
    .head { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--line); }
    .mark { width:32px; height:32px; flex:none; color:var(--gold); }
    h2,h3,p { margin:0; }
    h2 { font-size:18px; }
    h3 { font-size:14px; margin-bottom:6px; }
    .subtle, label, dt { color:var(--quiet); }
    .rack { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr)); gap:1px; background:var(--line); }
    .slot { background:var(--panel); min-width:0; padding:13px 16px; border-left:3px solid var(--gold); }
    dl,dd { margin:0; }
    dd { margin-top:5px; font-size:16px; font-weight:650; overflow-wrap:anywhere; }
    small { display:block; color:var(--quiet); margin-top:4px; overflow-wrap:anywhere; }
    .controls, .tasks { display:grid; gap:10px; padding:12px 16px; }
    .controls { display:flex; flex-wrap:wrap; align-items:end; border-bottom:1px solid var(--line); }
    .tasks { grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr)); }
    form { padding:10px; border-top:1px solid var(--line); min-width:0; }
    label { display:grid; gap:4px; margin-bottom:8px; }
    button,input,select {
      border:1px solid var(--line); background:var(--panel); color:var(--paper); min-height:44px;
      border-radius:5px; padding:6px 9px; font:inherit; max-width:100%;
    }
    input[type=text] { width:100%; min-width:0; }
    input[type=checkbox] { min-height:auto; width:17px; height:17px; }
    .choice { display:flex; align-items:center; gap:6px; min-height:44px; }
    .scope { margin:0; }
    button { cursor:pointer; }
    .primary { border-color:var(--gold); color:var(--gold); }
    button:disabled { opacity:.55; cursor:wait; }
    :focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
    [data-tone=pass] { color:var(--good); }
    [data-tone=fail] { color:var(--danger); }
    .evidence { border-top:1px solid var(--line); padding:12px 16px; }
    .evidence p { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; }
    pre { margin:6px 0 0; white-space:pre-wrap; overflow-wrap:anywhere; max-height:240px; overflow:auto; }
    .changed { animation:readout .2s ease-out; }
    @keyframes readout { from { transform:translateY(3px); opacity:.75; } to { transform:none; opacity:1; } }
    @media(prefers-reduced-motion:reduce) { .changed { animation:none; } }
  </style>
  <section class="workbench" aria-label="SSSS workbench">
    <header class="head">
      <svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M10 8h17l3 3M10 16h14l6-5M10 24h14l6-5M10 32h17l3-5M10 8v24"
          fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div><h2>SSSS</h2><p class="subtle">Installation and contract checks</p></div>
    </header>
    <dl class="rack">
      <div class="slot"><dt>Engine / spec</dt><dd id="engine">—</dd><small id="engine-detail"></small></div>
      <div class="slot"><dt>Portable skill</dt><dd id="skill">—</dd><small id="skill-detail"></small></div>
      <div class="slot"><dt>Project scaffold</dt><dd id="scaffold">—</dd><small id="scaffold-detail"></small></div>
    </dl>
    <div class="controls">
      <label class="scope">Installation scope <select id="scope">
        <option value="auto">Current brain</option><option value="project">Project</option><option value="global">Shared</option>
      </select></label>
      <button type="button" id="refresh" class="primary">Check installation</button>
      <button type="button" id="repair">Repair managed files</button>
      <button type="button" id="suite">Run engine conformance</button>
    </div>
    <div class="tasks">
      <form id="validate"><h3>Document contract</h3>
        <label>Document path <input type="text" name="file" required></label>
        <label>Extension registry path <input type="text" name="extension"></label>
        <button>Validate document</button>
      </form>
      <form id="registry"><h3>Registry integrity</h3>
        <label>Lock file path <input type="text" name="lock" required></label>
        <label>Extension registry path <input type="text" name="extension"></label>
        <button>Verify registry</button>
      </form>
      <form id="new-project"><h3>New SSSS project</h3>
        <label>New directory <input type="text" name="directory" required></label>
        <label>Extension name <input type="text" name="extension"></label>
        <label class="choice"><input type="checkbox" name="with-total-recall"> Include Total Recall wiring</label>
        <button>Create project</button>
      </form>
    </div>
    <div class="evidence" aria-live="polite">
      <p><strong id="verdict">Awaiting inspection</strong><time id="attempt"></time></p>
      <pre id="result" tabindex="0"></pre>
    </div>
  </section>`;

export class SsssCard extends HTMLElement {
  set host(value) {
    this.bridge = value;
    if (this.isConnected && this.shadowRoot && value) this.inspect();
  }
  get host() { return this.bridge; }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).innerHTML = card;
      this.find('refresh').onclick = () => this.inspect();
      this.find('scope').onchange = () => this.inspect();
      this.find('repair').onclick = () => this.inspect('repair');
      this.find('suite').onclick = () => this.perform('conformance');
      this.bindForm('validate', 'validate');
      this.bindForm('registry', 'registry');
      this.bindForm('new-project', 'scaffold');
    }
    if (this.host) this.inspect();
  }

  find(id) { return this.shadowRoot.getElementById(id); }

  bindForm(id, operation) {
    const form = this.find(id);
    form.onsubmit = event => {
      event.preventDefault();
      const args = [];
      for (const [name, value] of new FormData(form)) {
        if (value === 'on' && name === 'with-total-recall') args.push('--with-total-recall');
        else if (String(value).trim()) args.push('--' + name, String(value).trim());
      }
      this.perform(operation, args);
    };
  }

  inspect(operation = 'status') {
    return this.perform(operation, ['--scope', this.find('scope').value]);
  }

  paintInstallation(result) {
    this.find('engine').textContent = result?.version ? result.version + ' / ' + result.specVersion : '—';
    this.find('engine-detail').textContent = result?.error || '';
    for (const part of ['skill', 'scaffold']) {
      const item = result?.[part];
      this.find(part).textContent = item ? (item.ok ? item.files + ' files verified' : 'Needs attention') : '—';
      this.find(part).dataset.tone = item ? (item.ok ? 'pass' : 'fail') : '';
      this.find(part + '-detail').textContent = item?.error || item?.path || '';
    }
  }

  async perform(operation, args = []) {
    if (!this.host || this.busy) return;
    const installation = operation === 'status' || operation === 'repair';
    this.busy = true;
    const controls = [...this.shadowRoot.querySelectorAll('button,select')];
    controls.forEach(control => { control.disabled = true; });
    const verdict = this.find('verdict');
    verdict.textContent = 'Checking…';
    verdict.dataset.tone = '';
    const output = this.find('result');
    output.textContent = '';
    output.classList.remove('changed');
    if (installation) this.paintInstallation(null);
    const attempt = new Date().toISOString();
    this.find('attempt').textContent = attempt;
    this.find('attempt').dateTime = attempt;
    try {
      const reply = await this.host.run(operation, [...args, '--json']);
      const result = typeof reply === 'string' ? JSON.parse(reply) : reply;
      if (typeof result?.ok !== 'boolean') throw new Error('SSSS returned no verdict');
      if (installation) this.paintInstallation(result);
      verdict.textContent = result.ok ? (operation === 'scaffold' ? 'Project created' : 'Verified') : 'Check failed';
      verdict.dataset.tone = result.ok ? 'pass' : 'fail';
      output.textContent = installation ? (result.error || '') : (result.output || JSON.stringify(result, null, 2));
    } catch (error) {
      verdict.textContent = 'Check failed';
      verdict.dataset.tone = 'fail';
      output.textContent = error.message;
    } finally {
      this.busy = false;
      controls.forEach(control => { control.disabled = false; });
      output.classList.add('changed');
    }
  }
}

if (!customElements.get('tr-ssss-card')) customElements.define('tr-ssss-card', SsssCard);
