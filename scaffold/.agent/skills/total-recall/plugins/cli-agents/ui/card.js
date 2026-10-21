export class CommandFleetCard extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>:host{display:block;color:#143d38;font-family:var(--font-sans,system-ui)}.fleet{padding:18px;border-radius:18px;background:#f3eee3;border:1px solid #dbb76a}.mark{display:flex;align-items:center;gap:12px}svg{width:36px;height:36px;stroke:#184e47;fill:none;stroke-width:2}h2{font-size:24px;margin:0;letter-spacing:-1px}p{font-size:12px;opacity:.8}.agents{display:flex;overflow-x:auto;gap:9px;scroll-snap-type:x mandatory}.agent{flex:0 0 140px;scroll-snap-align:start;border-left:3px solid #dbb76a;padding:12px;background:#fff9}.agent b{display:block}.agent span{font-size:11px}button{margin-top:12px;padding:10px;border:1px solid #184e47;border-radius:8px;background:#184e47;color:#f3eee3;cursor:pointer}button:disabled{opacity:.6}.working svg{animation:orbit 1.4s ease-in-out infinite}@keyframes orbit{50%{transform:rotate(12deg)}}@media(prefers-reduced-motion:reduce){.working svg{animation:none}}</style><section class="fleet"><div class="mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 10h28M6 20h28M6 30h28"/><circle cx="12" cy="10" r="4"/><circle cx="28" cy="20" r="4"/><circle cx="18" cy="30" r="4"/></svg><h2>Command Fleet</h2></div><p>Choose an agent and its workspace for each command.</p><div class="agents" aria-live="polite">No inspection yet.</div><button>Inspect local agents</button><p class="error" role="alert"></p></section>`;
    this.shadowRoot.querySelector('button').onclick = () => this.inspect();
  }
  async inspect() {
    const button = this.shadowRoot.querySelector('button'); button.disabled = true; this.shadowRoot.querySelector('.fleet').classList.add('working');
    try {
      if (!this.host?.run) throw new Error('Connect this card to its command host');
      const result = await this.host.run('status'); const list = this.shadowRoot.querySelector('.agents'); list.replaceChildren();
      for (const agent of result.agents || []) { const entry = document.createElement('div'); entry.className = 'agent'; const title = document.createElement('b'); title.textContent = agent.name; const state = document.createElement('span'); state.textContent = agent.installed ? `Installed · ${agent.version || 'version unknown'} · ${agent.authenticated === true ? 'signed in' : agent.authenticated === false ? 'sign in needed' : 'account unchecked'}` : 'Not installed'; entry.append(title, state); list.append(entry); }
      this.shadowRoot.querySelector('.error').textContent = '';
    } catch (error) { this.shadowRoot.querySelector('.error').textContent = error.message; }
    finally { button.disabled = false; this.shadowRoot.querySelector('.fleet').classList.remove('working'); }
  }
}
if (!customElements.get('command-fleet-card')) customElements.define('command-fleet-card', CommandFleetCard);
