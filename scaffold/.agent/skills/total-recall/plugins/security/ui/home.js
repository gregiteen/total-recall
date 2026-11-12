const PLATFORM_LABELS = {
  darwin: 'macOS', linux: 'Linux', win32: 'Windows', android: 'Android',
};
const STATES = {
  'at-risk': 'At risk', incomplete: 'Incomplete', 'review-required': 'Review required',
  passed: 'Passed in inspected scope', reviewed: 'Manually reviewed', plan: 'Plan only',
  unavailable: 'Unavailable', 'header-check-passed': 'Header check passed',
  pass: 'Observed', fail: 'Needs attention', review: 'Review', unverified: 'Unverified',
  'user-confirmed': 'User confirmed', 'not-applicable': 'Not applicable',
};
const CHECKS = {
  firewall: 'Firewall', 'disk-encryption': 'Disk encryption', gatekeeper: 'Application assessment',
  'system-integrity': 'System integrity', 'automatic-updates': 'Automatic updates',
  'ssh-permitrootlogin': 'SSH root login', 'ssh-passwordauthentication': 'SSH passwords',
  'ssh-permitemptypasswords': 'SSH empty passwords', 'ssh-pubkeyauthentication': 'SSH public keys',
  'ssh-file-permissions': 'SSH permissions', 'listening-ports': 'Listening services', 'udp-bindings': 'UDP bindings',
  'ro.boot.flash.locked': 'Bootloader lock', 'ro.crypto.state': 'Reported disk protection',
  'ro.build.version.security_patch': 'Reported security patch', 'device-settings-review': 'Device settings review',
};
const ASSESSMENTS = new Set(['machine', 'network', 'fleet', 'plugins', 'audit', 'harden', 'probe', 'scan', 'device', 'android']);

const MARKUP = [
  '<style>',
  ':host{display:block;color:var(--color-text,#22342d);background:var(--color-background,#f4f0e6);font:var(--typography-body-font-size,15px)/1.55 var(--typography-body-font-family,system-ui,sans-serif)}',
  '*{box-sizing:border-box}main{max-width:68rem;margin:auto;padding:clamp(16px,4vw,42px)}',
  'header{display:grid;grid-template-columns:1fr auto;align-items:start;gap:var(--spacing-md,16px);border-bottom:2px solid var(--color-primary,#31564b);padding-bottom:var(--spacing-lg,22px)}',
  '.mark{letter-spacing:.14em;font-weight:700;text-transform:uppercase;font-size:.72em;color:var(--color-primary,#31564b)}',
  'h2{margin:.1em 0;font:600 clamp(2rem,6vw,3.5rem)/1.05 var(--typography-title-font-family,Georgia,serif)}',
  'h3{font:600 1.4rem var(--typography-title-font-family,Georgia,serif);margin:0 0 .45em}p{margin:.4em 0;color:var(--color-muted,#4d6157)}',
  'dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:var(--spacing-md,16px);margin:1.1em 0;padding:var(--spacing-md,16px) 0;border-block:1px solid var(--color-border,#aab6a8)}',
  'dt{font-weight:700;font-size:.75em;letter-spacing:.06em;text-transform:uppercase;color:var(--color-muted,#4d6157)}dd{margin:.15em 0 0;overflow-wrap:anywhere}',
  '.workbench{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--spacing-xl,28px);align-items:start;margin-top:var(--spacing-xl,28px)}',
  'article{min-width:0;padding-left:var(--spacing-md,16px);border-left:3px solid var(--color-primary,#31564b)}',
  '.buttons,form{display:flex;flex-wrap:wrap;align-items:end;gap:var(--spacing-sm,8px);margin:.7em 0}form>label{display:grid;flex:1 1 12rem;gap:.2em}',
  'button,input,select{min-height:44px;font:inherit;color:inherit;padding:.38em .75em;border:1px solid var(--color-primary,#31564b);border-radius:var(--radius-sm,4px);background:var(--color-surface,#fdfbf5)}',
  'button{cursor:pointer;font-weight:650}button:disabled{opacity:.6;cursor:default}button:not(:disabled):hover{background:var(--color-primary-soft,#dce9dd)}',
  'button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--color-primary,#31564b);outline-offset:3px}',
  'details{padding:.55em 0;border-top:1px solid var(--color-border,#aab6a8)}summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-weight:700}summary::before{content:"+";margin-right:.6em}details[open]>summary::before{content:"−"}',
  '.confirm{display:flex;align-items:center;min-height:44px}#repair-confirm{min-height:0;margin:.4em .4em .4em 0}#report-state{color:var(--color-primary,#31564b);font-weight:750}#checks{padding-left:1.15em;margin:0}#checks li{margin:.25em 0}#device-checks label{display:grid;gap:.25em;margin:.65em 0}#device-checks select{justify-self:start}',
  '@media(max-width:620px){header,.workbench{grid-template-columns:1fr}header>button{justify-self:start}}',
  '</style>',
  '<main aria-label="Security evidence desk">',
  '<header><div><div class="mark">Total Recall · Security</div><h2>Evidence desk</h2><p>Choose what to inspect, then review the observed scope.</p></div><button type="button" id="refresh-status">Refresh status</button></header>',
  '<dl aria-label="Local capability status"><div><dt>Runtime platform</dt><dd id="platform">Checking…</dd></div><div><dt>Assessment profiles</dt><dd id="profiles">Checking…</dd></div><div><dt>Session owner</dt><dd id="auth">Checking…</dd></div></dl>',
  '<p id="local-state" role="status">Reading local capability metadata…</p>',
  '<div class="workbench"><section aria-label="Start an assessment">',
  '<h3>Assess a target</h3><p>Use the machine, network and mesh controls for targets you administer.</p>',
  '<div class="buttons"><button type="button" data-action="machine">This machine</button><button type="button" data-action="network">Network posture</button><button type="button" data-action="fleet">Mesh fleet</button></div>',
  '<details><summary>Mesh target</summary><form id="mesh-form"><label>Discovered machine<input id="target" maxlength="128" required></label><button>Inspect target</button></form></details>',
  '<details><summary>Source and plugin review</summary><div class="buttons"><button type="button" data-action="plugins">Installed plugins</button><button type="button" data-action="audit">Baseline audit</button></div><form id="scan-form"><label>Source directory<input id="source" maxlength="512" required></label><button>Review source</button></form></details>',
  '<details><summary>Website headers</summary><p>Check a single HTTPS URL you are authorized to test.</p><form id="web-form"><label>HTTPS URL<input id="website" type="url" maxlength="512" required placeholder="https://example.org"></label><button>Check response</button></form></details>',
  '<details><summary>Device evidence</summary><p>Guided answers are your observations. Enter only a label and the outcome of each check.</p>',
  '<form id="device-form"><label>Platform<select id="device-platform"><option value="ios">iPhone</option><option value="ipados">iPad</option><option value="android">Android</option><option value="chromeos">ChromeOS</option><option value="chromeos-flex">ChromeOS Flex</option><option value="windows">Windows</option></select></label><label>Device label<input id="device-label" maxlength="80" required></label><button>Load review</button></form>',
  '<section id="device-review" hidden><div id="device-checks"></div><button type="button" id="evaluate-device">Evaluate review</button></section>',
  '<form id="android-form"><label>Already authorized Android serial<input id="android-serial" maxlength="128" required></label><button>Read Android properties</button></form></details>',
  '<details><summary>SSH permission repair</summary><p>Preview the local plan. Repair changes recognized SSH file modes on this machine and rechecks them.</p><div class="buttons"><button type="button" data-action="harden">Preview plan</button></div>',
  '<label class="confirm"><input type="checkbox" id="repair-confirm"> Apply local SSH permission repair</label><div class="buttons"><button type="button" id="repair" disabled>Repair and verify</button></div></details>',
  '</section><article aria-label="Assessment report"><h3>Observed evidence</h3><p id="report-state" role="status">No assessment requested</p><dl id="facts" hidden></dl><ul id="checks"></ul></article></div>',
  '</main>',
].join('\n');

function parseReport(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'output')) return value;
  const raw = typeof value === 'string' ? value : value?.output;
  if (typeof raw !== 'string' || raw.length > 1_048_576) return null;
  const text = raw.trim();
  const candidates = [text, text.slice(text.lastIndexOf('\n{\n') + 1), text.slice(text.lastIndexOf('\n') + 1)];
  for (const candidate of candidates) {
    try {
      const report = JSON.parse(candidate);
      if (report && typeof report === 'object' && !Array.isArray(report)) return report;
    } catch { /* A transport error may have no structured report. */ }
  }
  return null;
}

function stateLabel(value) {
  return typeof value === 'string' && Object.hasOwn(STATES, value) ? STATES[value] : null;
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
}

export class SecurityHome extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = MARKUP;
    root.querySelector('#refresh-status').addEventListener('click', () => void this.refresh());
    root.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => void this.assess(button.dataset.action));
    });
    const field = id => root.getElementById(id);
    const submit = (id, callback) => field(id).addEventListener('submit', event => {
      event.preventDefault();
      callback();
    });
    const identity = () => ['--platform', field('device-platform').value, '--device', field('device-label').value.trim()];
    submit('mesh-form', () => void this.assess('fleet', ['--target', field('target').value.trim()]));
    submit('scan-form', () => void this.assess('scan', [field('source').value.trim()]));
    submit('android-form', () => void this.assess('android', ['--serial', field('android-serial').value.trim()]));
    submit('device-form', () => void this.assess('device', identity()));
    submit('web-form', () => {
      try {
        const url = new URL(field('website').value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
        void this.assess('probe', ['--url', url.href]);
      } catch {
        this.clearReport('Enter an authorized HTTPS URL without credentials, query or fragment.');
      }
    });
    const clearReview = () => {
      field('device-review').hidden = true;
      field('device-checks').replaceChildren();
    };
    field('device-platform').addEventListener('change', clearReview);
    field('device-label').addEventListener('input', clearReview);
    field('evaluate-device').addEventListener('click', () => {
      const observations = {};
      for (const select of field('device-checks').querySelectorAll('select[data-observed-at]')) {
        observations[select.dataset.check] = { status: select.value, observedAt: select.dataset.observedAt };
      }
      void this.assess('device', [...identity(), '--answers-json', JSON.stringify(observations)]);
    });
    field('repair-confirm').addEventListener('change', () => {
      field('repair').disabled = this.busy || !field('repair-confirm').checked;
    });
    field('repair').addEventListener('click', () => {
      if (field('repair-confirm').checked) void this.assess('machine', ['--apply-permissions']);
    });
    void this.refresh();
  }

  async request(action, args = []) {
    let report;
    try { report = parseReport(await this.host?.run(action, [...args, '--json'])); }
    catch (error) { report = parseReport(error?.message); }
    if (!report || report.status === 'failed') throw new Error('No usable assessment result');
    return report;
  }

  async refresh() {
    const root = this.shadowRoot;
    const button = root.querySelector('#refresh-status');
    button.disabled = true;
    const state = root.querySelector('#local-state');
    state.textContent = 'Reading local capability metadata…';
    try {
      const report = await this.request('status');
      if (report.plugin !== 'security' || !Array.isArray(report.device_coverage?.platforms)) throw new Error();
      const platform = report.host_platform;
      root.querySelector('#platform').textContent = Object.hasOwn(PLATFORM_LABELS, platform) ? PLATFORM_LABELS[platform] : 'Other runtime';
      root.querySelector('#profiles').textContent = String(report.device_coverage.platforms.length);
      root.querySelector('#auth').textContent = report.auth_integration === 'auth' ? 'Bundled Auth' : 'Unavailable';
      state.textContent = 'Capability metadata available. Assessments run on demand.';
    } catch {
      for (const id of ['platform', 'profiles', 'auth']) root.getElementById(id).textContent = 'Unavailable';
      state.textContent = 'Local capability metadata is unavailable.';
    } finally {
      button.disabled = false;
    }
  }

  clearReport(message) {
    const root = this.shadowRoot;
    root.querySelector('#report-state').textContent = message;
    const facts = root.querySelector('#facts');
    facts.replaceChildren();
    facts.hidden = true;
    root.querySelector('#checks').replaceChildren();
  }

  async assess(action, args = []) {
    if (this.busy || !ASSESSMENTS.has(action)) return;
    const root = this.shadowRoot;
    const confirm = root.querySelector('#repair-confirm');
    if (args.includes('--apply-permissions') && (action !== 'machine' || !confirm.checked)) return;
    if (args.some(arg => arg === '')) {
      this.clearReport('Enter a target before requesting an assessment.');
      return;
    }
    this.busy = true;
    const controls = Array.from(root.querySelectorAll('button:not(#refresh-status), input, select'));
    for (const control of controls) control.disabled = true;
    this.clearReport('Waiting for assessment…');
    try {
      const report = await this.request(action, args);
      this.renderEvidence(report);
      if (action === 'device' && report.schema === 'security-device/v1' && !args.includes('--answers-json')) {
        this.renderDeviceReview(report.checks);
      }
    } catch {
      this.clearReport('Assessment unavailable. No result was established.');
    } finally {
      this.busy = false;
      for (const control of controls) control.disabled = false;
      confirm.checked = false;
      root.querySelector('#repair').disabled = true;
    }
  }

  renderEvidence(report) {
    const root = this.shadowRoot;
    const headerStates = report.security_headers && typeof report.security_headers === 'object'
      ? Object.values(report.security_headers).filter(value => typeof value === 'boolean') : [];
    const needsReview = report.ok === false || report.passed === false || headerStates.includes(false);
    const state = report.remediation?.status === 'failed' ? 'Permission repair incomplete'
      : stateLabel(report.status) || (needsReview ? 'Review required' : 'Assessment returned');
    root.querySelector('#report-state').textContent = state;
    const facts = root.querySelector('#facts');
    const coverage = report.coverage || report.machine?.coverage || {};
    const pairs = [
      ['Observed checks or machines', number(coverage.observed)],
      ['Total checks', number(coverage.total)],
      ['Selected machines', number(coverage.selected)],
      ['Manually reviewed', number(coverage.reviewed)],
      ['Source findings', number(report.total_findings ?? report.findings_count)],
      ['Plugins assessed', number(report.total_plugins ?? report.plugins_audited)],
      ['SSH permissions changed', number(report.remediation?.changed ?? report.applied_count)],
      ['HTTPS response status', number(report.status)],
      ['Response latency (ms)', number(report.latency_ms)],
    ];
    if (headerStates.length) pairs.push(['Expected headers present', headerStates.filter(Boolean).length + ' of ' + headerStates.length]);
    for (const [label, value] of pairs) {
      if (value === null) continue;
      const entry = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      entry.append(term, detail);
      facts.append(entry);
    }
    facts.hidden = facts.childElementCount === 0;
    const checks = report.checks || report.machine?.checks;
    if (!Array.isArray(checks)) return;
    for (const check of checks) {
      const label = check && Object.hasOwn(CHECKS, check.id) ? CHECKS[check.id] : null;
      const result = stateLabel(check?.state);
      if (!label || !result) continue;
      const item = document.createElement('li');
      item.textContent = label + ' · ' + result;
      root.querySelector('#checks').append(item);
    }
  }

  renderDeviceReview(checks) {
    if (!Array.isArray(checks)) return;
    const root = this.shadowRoot;
    const form = root.querySelector('#device-checks');
    form.replaceChildren();
    for (const check of checks.slice(0, 24)) {
      if (!check || typeof check.id !== 'string' || !/^[a-z][a-z0-9-]{0,60}$/.test(check.id) || typeof check.title !== 'string') continue;
      const label = document.createElement('label');
      const title = document.createElement('span');
      title.textContent = check.title.slice(0, 120);
      const guidance = document.createElement('small');
      guidance.textContent = typeof check.remediation === 'string' ? check.remediation.slice(0, 500) : '';
      const select = document.createElement('select');
      select.dataset.check = check.id;
      select.setAttribute('aria-label', title.textContent);
      for (const [value, text] of [['unknown', 'Not checked'], ['secure', 'Protection confirmed'], ['needs-attention', 'Needs attention']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      select.addEventListener('change', () => { select.dataset.observedAt = new Date().toISOString(); });
      label.append(title, guidance, select);
      form.append(label);
    }
    root.querySelector('#device-review').hidden = form.childElementCount === 0;
  }
}
if (!customElements.get('tr-security-home')) customElements.define('tr-security-home', SecurityHome);
