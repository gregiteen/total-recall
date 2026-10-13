// Credential verification and storage are performed by auth through the host. Emits `save-token`; the host pipes it to
// `total-recall mesh token set --stdin` (stored in secrets, never shown again).
class MeshPanel extends HTMLElement {
  set view(value) { this._view = value; this.render(); }
  get view() { return this._view; }
  connectedCallback() { this.render(); }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    const present = Boolean(this._view && this._view.present);
    const style = document.createElement('style');
    style.textContent = ':host { display:block; color:var(--color-text); background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:var(--spacing-md); } .row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; } input, select { flex:1; min-height:44px; padding:6px 8px; border-radius:var(--radius-md); border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text); } button { min-height:44px; padding:6px 12px; border-radius:var(--radius-md); border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text); font-weight:700; cursor:pointer; }';
    const title = document.createElement('h3');
    title.textContent = "Mesh Configuration & Secrets";
    const state = document.createElement('p');
    state.textContent = present ? 'A key is saved in the Total Recall secrets store. Paste a new one to replace or rotate it.' : 'No key yet. Paste it to start using this plugin.';
    const form = document.createElement('form');
    form.className = 'row';
    const input = document.createElement('input');
    input.type = 'password'; input.autocomplete = 'off'; input.required = true;
    input.placeholder = "HEADSCALE_API_KEY";
    input.setAttribute('aria-label', "Mesh API key");

    const button = document.createElement('button');
    button.type = 'submit'; button.textContent = 'Save and test';
    form.append(input, button);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent('save-token', {
        detail: { key: "HEADSCALE_API_KEY", token: input.value.trim() },
        bubbles: true,
        composed: true
      }));
      input.value = '';
    });
    root.append(style, title, state, form);
  }
}
customElements.define('mesh-panel', MeshPanel);
