const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--color-text, #f1f5f9);
      font: 14px/1.5 var(--typography-body-font-family, system-ui, sans-serif);
    }
    * { box-sizing: border-box; }
    .home {
      background: var(--color-canvas, #0c1427);
      border: 1px solid var(--color-line, #334155);
      border-radius: var(--radius-frame, 8px);
      padding: var(--spacing-inset, 16px);
    }
    header, .actions {
      display: flex;
      justify-content: space-between;
      align-items: start;
      flex-wrap: wrap;
      gap: var(--spacing-row, 12px);
    }
    h2 {
      font-size: var(--typography-title-font-size, 18px);
      font-weight: var(--typography-title-font-weight, 650);
      margin: 0;
    }
    p { margin: 0.25rem 0; }
    .route {
      margin-block: var(--spacing-row, 12px);
      border-inline-start: 2px solid var(--color-signal, #38bdf8);
      background: var(--color-surface, #1e293b);
      padding: 0.6rem 0.75rem;
    }
    .label {
      color: var(--color-signal, #38bdf8);
      font: 600 11px/1.4 var(--typography-label-font-family, ui-monospace, monospace);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .subtle { color: var(--color-muted, #94a3b8); }
    [data-error] { color: var(--color-danger, #ef4444); }
    .fields {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
      gap: var(--spacing-row, 12px);
    }
    label { display: block; font-weight: 600; }
    input, select, button {
      background: var(--color-surface, #1e293b);
      border: 1px solid var(--color-line, #334155);
      border-radius: var(--radius-frame, 8px);
      color: inherit;
      font: inherit;
      min-height: 44px;
      padding: 0.4rem 0.7rem;
    }
    input, select { width: 100%; min-width: 0; margin-top: 0.3rem; }
    button { cursor: pointer; }
    button:disabled { cursor: default; opacity: 0.55; }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid var(--color-signal, #38bdf8);
      outline-offset: 2px;
    }
    .actions { align-items: center; margin-top: var(--spacing-row, 12px); }
    #save { border-color: var(--color-signal, #38bdf8); }
    @media (max-width: 530px) { .fields { grid-template-columns: 1fr; } }
  </style>
  <section class="home" aria-labelledby="default-title">
    <header>
      <div>
        <h2 id="default-title">Default Chat harness</h2>
        <p class="subtle">Use this destination with any brain selection in the Chat drawer.</p>
      </div>
      <button type="button" id="refresh">Reload settings</button>
    </header>
    <div class="route" aria-live="polite">
      <div class="label">Saved handoff</div>
      <strong id="saved">Reading Chat settings…</strong>
      <p class="subtle" id="mode"></p>
    </div>
    <div class="fields">
      <label>Registered harness
        <select id="adapter" disabled><option value="">Choose a harness</option></select>
      </label>
      <label>Optional launch URL
        <input id="url" type="text" inputmode="url" autocomplete="off" maxlength="2048" disabled>
      </label>
    </div>
    <p class="subtle">Use a trusted HTTPS page or a supported native Chat link.</p>
    <div class="actions">
      <p id="notice" class="subtle" role="status"></p>
      <button type="button" id="save" disabled>Save default</button>
    </div>
  </section>
`;

const adapterId = /^[a-z][a-z0-9-]{0,63}$/;
const nativeDraft = /^codex:\/\/threads\/new(?:\?|$)/;

class MetaharnessHome extends HTMLElement {
  #target = null;
  #working = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.#field('refresh').addEventListener('click', () => void this.load());
    this.#field('save').addEventListener('click', () => void this.#save());
    this.#field('adapter').addEventListener('change', () => {
      this.#fillUrl();
      this.#syncControls();
    });
  }

  #field(id) {
    return this.shadowRoot.getElementById(id);
  }

  #notice(text, error = false) {
    const notice = this.#field('notice');
    notice.textContent = text;
    notice.toggleAttribute('data-error', error);
  }

  #syncControls() {
    const adapter = this.#field('adapter');
    const locked = this.#working || !this.#target;
    adapter.disabled = locked;
    this.#field('url').disabled = locked || !adapter.value;
    this.#field('save').disabled = locked || !adapter.value;
    this.#field('refresh').disabled = this.#working;
  }

  #fillUrl() {
    const { harness, href } = this.#target || {};
    this.#field('url').value = harness?.id === this.#field('adapter').value && typeof href === 'string' && !nativeDraft.test(href)
      ? href : '';
  }

  #showTarget(target) {
    if (target?.ok !== true || typeof target.configured !== 'boolean' || !Array.isArray(target.choices)) throw new Error('Invalid Chat target');
    const choices = target.choices.filter(choice => typeof choice?.id === 'string' &&
      adapterId.test(choice.id) && typeof choice.name === 'string');
    const selected = choices.find(choice => choice.id === target.harness?.id);
    if (target.configured && !selected) throw new Error('Invalid saved Chat adapter');
    this.#target = { choices, harness: selected, href: target.href };
    const picker = this.#field('adapter');
    picker.replaceChildren(new Option('Choose a harness', ''), ...choices.map(choice => new Option(choice.name, choice.id)));
    picker.value = selected?.id || '';
    this.#fillUrl();
    this.#field('saved').textContent = selected?.name || 'Choose a default harness';
    this.#field('mode').textContent = !selected
      ? target.warning || `${choices.length} registered harnesses`
      : nativeDraft.test(target.href) ? 'Opens a reviewable native draft'
        : target.href ? 'Opens the saved destination' : 'Copy context from the Chat drawer';
  }

  async load() {
    if (this.#working) return;
    this.#working = true;
    this.#syncControls();
    this.#notice('Reading Chat settings…');
    try {
      this.#showTarget(await this.host.run('chat-target'));
      this.#notice('');
    } catch {
      this.#target = null;
      this.#field('saved').textContent = 'Chat settings unavailable';
      this.#field('mode').textContent = '';
      this.#notice('Reload to try the owner read again.', true);
    } finally {
      this.#working = false;
      this.#syncControls();
    }
  }

  async #save() {
    const id = this.#field('adapter').value;
    if (this.#working || !this.#target?.choices.some(choice => choice.id === id)) return;
    const url = this.#field('url').value.trim();
    this.#working = true;
    this.#syncControls();
    this.#notice('Saving Chat default…');
    try {
      const target = await this.host.run('chat-default', [id, ...(url ? ['--url', url] : [])]);
      this.#showTarget(target);
      this.#notice('Chat default saved.');
    } catch {
      this.#notice('Could not save the default. Check the harness and launch URL.', true);
    } finally {
      this.#working = false;
      this.#syncControls();
    }
  }
}

if (!customElements.get('tr-metaharness-home')) customElements.define('tr-metaharness-home', MetaharnessHome);
