export class SecuritySecurityCard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{display:block;color:#edf3fa;background:#16222e;font:14px system-ui;border-radius:12px;padding:18px}header{display:flex;align-items:center;gap:12px}svg{width:32px;height:38px;color:#73d6bf}h2{margin:0;font-size:20px}p{color:#bbcad6;line-height:1.5}nav{display:flex;gap:8px;flex-wrap:wrap}button,input,select{min-height:44px;border:1px solid #71928e;border-radius:6px;padding:8px 12px;background:#213644;color:inherit}button{cursor:pointer}button:disabled{opacity:.5}input{min-width:0;flex:1}#state{margin:14px 0;color:#73d6bf}table{width:100%;border-collapse:collapse}td,th{padding:10px 6px;text-align:left;border-bottom:1px solid #3a4e5c;vertical-align:top}td:last-child{line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto}.scroll{overflow:auto}
      </style><header><svg viewBox="0 0 32 38" fill="none" aria-hidden="true"><path d="M16 2 29 8v11c0 8-7 14-13 17C10 33 3 27 3 19V8Z" stroke="currentColor" stroke-width="2"/><path d="m9 19 5 5 10-12" stroke="currentColor" stroke-width="2"/></svg><h2>Security Assessments</h2></header>
      <p>Inspect this machine or your mesh. Review firewall, SSH, disk protection, and listening services with concrete remediation.</p>
      <nav><button data-action="machine">This machine</button><button data-action="fleet">Mesh fleet</button><button data-action="plugins">Plugin audit</button><button data-action="harden">Hardening plan</button></nav>
      <nav style="margin-top:10px"><input id="target" aria-label="Machine name" placeholder="Optional mesh machine name"><button id="selected">Audit selected</button></nav>
      <nav style="margin-top:10px"><input id="website" type="url" aria-label="Authorized HTTPS website" placeholder="https://your-site.example"><button id="probe">Check website</button></nav>
      <nav style="margin-top:10px"><input id="source" aria-label="Source directory" placeholder="Source directory"><button id="scan">Scan source</button><button id="permissions">Repair local SSH permissions</button></nav>
      <nav style="margin-top:10px"><select id="platform" aria-label="Device platform"><option value="ios">iPhone</option><option value="ipados">iPad</option><option value="android">Android</option><option value="chromeos">Chromebook</option><option value="chromeos-flex">ChromeOS Flex</option><option value="windows">Windows</option></select><input id="device" aria-label="Device label" placeholder="Device label (no passwords)"><button id="review-device">Review device</button></nav>
      <section id="device-review" hidden><p>Manual device review — answers are your observations, not an automatic scan. Unknown checks remain unverified. Never enter passwords or recovery keys.</p><div id="device-checks"></div><button id="evaluate-device">Evaluate review</button></section>
      <nav style="margin-top:10px"><input id="android-serial" aria-label="Already authorized Android serial" placeholder="Already authorized Android serial"><button id="android-check">Read Android properties</button></nav>
      <div id="state" role="status">Not audited</div><div class="scroll"><table hidden><thead><tr><th>Check / machine</th><th>State</th><th>Remediation / coverage</th></tr></thead><tbody></tbody></table></div><pre id="details"></pre>`;
    root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => this.execute(button.dataset.action)));
    root.querySelector('#selected').addEventListener('click', () => {
      const target = root.querySelector('#target').value.trim();
      if (!target) { root.querySelector('#state').textContent = 'Enter a discovered machine name'; return; }
      this.execute('fleet', ['--target', target]);
    });
    root.querySelector('#probe').addEventListener('click', () => {
      const website = root.querySelector('#website').value.trim();
      try {
        const url = new URL(website);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      } catch { root.querySelector('#state').textContent = 'Enter an authorized HTTPS URL without credentials or query'; return; }
      this.execute('probe', ['--url', website]);
    });
    root.querySelector('#scan').addEventListener('click', () => {
      const source = root.querySelector('#source').value.trim();
      if (!source) { root.querySelector('#state').textContent = 'Enter a source directory'; return; }
      this.execute('scan', [source]);
    });
    root.querySelector('#permissions').addEventListener('click', () => this.execute('machine', ['--apply-permissions']));
    const resetReview = () => { root.querySelector('#device-review').hidden = true; root.querySelector('#device-checks').replaceChildren(); };
    root.querySelector('#platform').addEventListener('change', resetReview);
    root.querySelector('#device').addEventListener('input', resetReview);
    const identity = () => ['--platform', root.querySelector('#platform').value, '--device', root.querySelector('#device').value.trim()];
    root.querySelector('#review-device').addEventListener('click', () => this.execute('device', identity()));
    root.querySelector('#evaluate-device').addEventListener('click', () => {
      const observations = {};
      root.querySelectorAll('#device-checks select').forEach(select => { if (select.dataset.observedAt) observations[select.dataset.check] = { status: select.value, observedAt: select.dataset.observedAt }; });
      this.execute('device', [...identity(), '--answers-json', JSON.stringify(observations)]);
    });
    root.querySelector('#android-check').addEventListener('click', () => this.execute('android', ['--serial', root.querySelector('#android-serial').value.trim()]));
  }
  async execute(action, args = []) {
    const root = this.shadowRoot;
    const state = root.querySelector('#state');
    const details = root.querySelector('#details');
    root.querySelectorAll('button,input,select').forEach(button => { button.disabled = true; });
    state.textContent = 'Checking…';
    details.textContent = '';
    root.querySelector('tbody').replaceChildren();
    root.querySelector('table').hidden = true;
    try {
      if (!this.host?.run) throw new Error('Security runtime is unavailable');
      let response;
      try { response = await this.host.run(action, [...args, '--json']); }
      catch (error) {
        try { response = JSON.parse(error.message); } catch { throw error; }
      }
      const report = typeof response === 'string' ? JSON.parse(response) : typeof response?.output === 'string' ? JSON.parse(response.output) : response;
      if (!report || typeof report !== 'object') throw new Error('No audit report returned');
      if (report.status === 'failed') throw new Error(report.error);
      if (report.schema === 'security-device/v1' && !args.includes('--answers-json')) {
        const form = root.querySelector('#device-checks'); form.replaceChildren();
        for (const check of report.checks) {
          const label = document.createElement('label'); label.style.display = 'block';
          const title = document.createElement('p'); title.textContent = `${check.title}: ${check.remediation}`;
          const select = document.createElement('select'); select.dataset.check = check.id; select.setAttribute('aria-label', check.title);
          for (const [value, text] of [['unknown', 'Not checked'], ['secure', 'Reviewed — protection confirmed'], ['needs-attention', 'Needs attention']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
          select.addEventListener('change', () => { select.dataset.observedAt = new Date().toISOString(); });
          label.append(title, select); form.append(label);
        }
        root.querySelector('#device-review').hidden = false;
      }
      state.textContent = `${report.status || (report.total_findings ? 'Findings require review' : 'Audit returned')} · ${report.timestamp || 'No observation timestamp supplied'}`;
      const rows = report.checks?.map(check => [check.id, check.state, check.remediation || check.reason || 'Observed']) || report.machines?.map(machine => [machine.hostname, machine.report?.status || machine.state, machine.reason || `${machine.report.coverage.observed}/${machine.report.coverage.total} checks observed`]) || [];
      if (rows.length) {
        root.querySelector('table').hidden = false;
        for (const row of rows) {
          const tr = document.createElement('tr');
          row.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
          root.querySelector('tbody').append(tr);
        }
      }
      details.textContent = JSON.stringify(report, null, 2);
    } catch (error) { state.textContent = 'Audit unavailable'; details.textContent = error.message; }
    finally { root.querySelectorAll('button,input,select').forEach(button => { button.disabled = false; }); }
  }
}
if (!customElements.get('tr-security-card')) customElements.define('tr-security-card', SecuritySecurityCard);

class SecurityPanel extends SecuritySecurityCard {}
if (!customElements.get('security-panel')) customElements.define('security-panel', SecurityPanel);
