const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      font: 1rem/1.5 var(--typography-body-font-family, Outfit, system-ui, sans-serif);
      color: var(--color-text, #f2f8f3);
    }
    section {
      background: var(--color-background, #101e19);
      border: 1px solid var(--color-outline, #3f6350);
      border-radius: var(--radius-panel, 0.65rem);
      padding: var(--spacing-md, 1rem);
    }
    header, .audit {
      display: flex;
      justify-content: space-between;
      align-items: start;
      flex-wrap: wrap;
      gap: var(--spacing-sm, 0.65rem);
    }
    h2, h3, p, dd, dl { margin: 0; }
    h2 { font-size: var(--typography-heading-font-size, 1.4rem); }
    h3 { font-size: 1.05rem; }
    p { color: var(--color-muted, #b1c9ba); }
    dl { margin-block: var(--spacing-md, 1rem); }
    dl div {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.25rem 1rem;
      padding-block: 0.5rem;
      border-block-end: 1px solid var(--color-outline, #3f6350);
    }
    [data-tone="ready"] { color: var(--color-primary, #64e3a4); }
    [data-tone="attention"] { color: var(--color-warning, #f4d18c); }
    [data-tone="error"] { color: var(--color-danger, #ffbbb1); }
    button {
      background: var(--color-surface, #192d24);
      border: 1px solid var(--color-outline, #3f6350);
      border-radius: var(--radius-control, 0.4rem);
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      min-height: 44px;
      padding: 0.35rem 0.7rem;
    }
    button:focus-visible { outline: 2px solid var(--color-primary, #64e3a4); outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: 0.65; }
  </style>
  <section aria-labelledby="readiness">
    <header>
      <div>
        <h2 id="readiness">Sign-in readiness</h2>
        <p>Local configuration for this dashboard.</p>
      </div>
      <button type="button" id="refresh">Refresh status</button>
    </header>
    <dl aria-live="polite">
      <div><dt>Registered passkeys</dt><dd id="passkeys">Checking…</dd></div>
      <div><dt>Google sign-in</dt><dd id="google">Checking…</dd></div>
      <div><dt>Dashboard session signing</dt><dd id="session">Checking…</dd></div>
    </dl>
    <div class="audit">
      <div>
        <h3>Security baseline</h3>
        <p id="audit-result" role="status">Run the audit to check this host's configuration.</p>
      </div>
      <button type="button" id="audit">Run baseline audit</button>
    </div>
  </section>
`;

const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isAudit = value => typeof value?.passed === 'boolean' && isCount(value.findings_count);

class AuthHome extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.shadowRoot.getElementById('refresh').addEventListener('click', () => void this.load());
    this.shadowRoot.getElementById('audit').addEventListener('click', () => void this.audit());
  }

  #show(id, text, tone = '') {
    const field = this.shadowRoot.getElementById(id);
    field.textContent = text;
    field.dataset.tone = tone;
  }

  async load() {
    const button = this.shadowRoot.getElementById('refresh');
    if (button.disabled) return;
    button.disabled = true;
    this.#show('passkeys', 'Checking…');
    this.#show('google', 'Checking…');
    this.#show('session', 'Checking…');
    try {
      const [status, session] = await Promise.allSettled([
        this.host.run('status'), this.host.run('session'),
      ]);
      const providers = status.status === 'fulfilled' ? status.value : null;
      const count = providers?.passkey?.registered_count;
      const google = providers?.google_oauth2?.configured;
      const signing = session.status === 'fulfilled' ? session.value?.session_secret_configured : null;
      if (isCount(count)) this.#show('passkeys', String(count), count ? 'ready' : 'attention');
      else this.#show('passkeys', 'Unavailable', 'error');
      if (typeof google === 'boolean') this.#show('google', google ? 'Configured' : 'Needs setup', google ? 'ready' : 'attention');
      else this.#show('google', 'Unavailable', 'error');
      if (typeof signing === 'boolean') this.#show('session', signing ? 'Configured' : 'Needs setup', signing ? 'ready' : 'attention');
      else this.#show('session', 'Unavailable', 'error');
    } catch {
      this.#show('passkeys', 'Unavailable', 'error');
      this.#show('google', 'Unavailable', 'error');
      this.#show('session', 'Unavailable', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async audit() {
    const button = this.shadowRoot.getElementById('audit');
    if (button.disabled) return;
    button.disabled = true;
    this.#show('audit-result', 'Checking this host…');
    try {
      let report;
      try {
        report = await this.host.run('audit');
      } catch (error) {
        // A completed audit with severe findings exits nonzero and returns its JSON as a bridge error.
        const failed = JSON.parse(error.message);
        if (!isAudit(failed) || failed.passed) throw error;
        report = failed;
      }
      if (!isAudit(report)) throw new Error('Invalid baseline report');
      const count = report.findings_count;
      const findings = `${count} ${count === 1 ? 'finding' : 'findings'}`;
      this.#show('audit-result', report.passed ? `Baseline passed with ${findings}.` : `Review required. ${findings}.`,
        report.passed && !count ? 'ready' : 'attention');
    } catch {
      this.#show('audit-result', 'Baseline audit unavailable. Retry or run auth audit in the terminal.', 'error');
    } finally {
      button.disabled = false;
    }
  }
}

if (!customElements.get('tr-auth-home')) customElements.define('tr-auth-home', AuthHome);
