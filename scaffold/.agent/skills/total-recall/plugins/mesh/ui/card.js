export class MeshlinkControlCard extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>:host{display:block;color:var(--text-primary);font-family:var(--font-sans)}header{display:flex;gap:12px;align-items:center}svg{width:38px;stroke:var(--brand-primary);fill:none;stroke-width:2}h2{margin:0;font-size:20px}p{color:var(--text-secondary)}button,input{min-height:44px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:inherit;padding:8px}nav{display:flex;gap:8px;flex-wrap:wrap}table{width:100%;text-align:left;border-collapse:collapse;font-size:12px}td,th{padding:9px 4px;border-bottom:1px solid var(--border)}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow:auto}form{display:flex;gap:8px;margin-top:12px}input{min-width:0;flex:1}[aria-busy=true]{opacity:.65}</style><header><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 10 31 10 20 31Z"/><circle cx="9" cy="10" r="4"/><circle cx="31" cy="10" r="4"/><circle cx="20" cy="31" r="4"/></svg><h2>Meshlink Control</h2></header><p id="state" role="status">Awaiting observation</p><nav><button data-action="status">Refresh</button><button data-action="doctor">Diagnostics</button><button data-action="presence">Presence</button><button data-action="leader">Leader</button></nav><table><thead><tr><th>Node</th><th>Network</th><th>Access</th><th>Service</th></tr></thead><tbody></tbody></table><form><input name="target" placeholder="Node name" aria-label="Node name" required><button type="submit">Ping node</button></form><pre id="output"></pre>`;
    this.shadowRoot.querySelectorAll('[data-action]').forEach(button => button.onclick = () => this.execute(button.dataset.action));
    this.shadowRoot.querySelector('form').onsubmit = event => { event.preventDefault(); this.execute('ping', [event.target.elements.target.value]); };
    this.execute('status');
  }
  async execute(action, args = []) {
    const root = this.shadowRoot, state = root.querySelector('#state'), output = root.querySelector('#output');
    root.querySelectorAll('button').forEach(button => button.disabled = true);
    this.setAttribute('aria-busy', 'true'); state.textContent = 'Checking…';
    try {
      if (!this.host?.run) throw new Error('Plugin runner is unavailable');
      const result = await this.host.run(action, args);
      if (result?.success === false || result?.ok === false) throw new Error(result.error || 'Operation failed');
      if (action === 'status') {
        if (!Array.isArray(result?.nodes) || !result.observed_at) throw new Error('Mesh returned an invalid observation');
        this.snapshot = result;
        const body = root.querySelector('tbody'); body.replaceChildren();
        for (const node of result.nodes) {
          const row = document.createElement('tr');
          for (const value of [node.hostname || node.node_id || 'Unnamed node', node.network_state, node.access_state, node.service_state]) { const cell = document.createElement('td'); cell.textContent = value || 'Unobserved'; row.append(cell); }
          body.append(row);
        }
        if (!result.nodes.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 4; cell.textContent = 'No nodes observed'; row.append(cell); body.append(row); }
        state.textContent = `${result.state} · Control ${result.control?.state || 'unobserved'} · ${result.observed_at}`;
      } else state.textContent = this.snapshot ? `Last observation: ${this.snapshot.observed_at}` : 'No network observation yet';
      output.textContent = action === 'status' ? (result.control?.error || '') : JSON.stringify(result, null, 2);
    } catch (error) { state.textContent = this.snapshot ? `Refresh failed · Last observation: ${this.snapshot.observed_at}` : 'Observation unavailable'; output.textContent = error.message; }
    finally { this.removeAttribute('aria-busy'); root.querySelectorAll('button').forEach(button => button.disabled = false); }
  }
}
if (!customElements.get('tr-mesh-card')) customElements.define('tr-mesh-card', MeshlinkControlCard);
