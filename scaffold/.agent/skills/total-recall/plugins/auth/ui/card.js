/**
 * Auth & Secrets — Hardware WebAuthn Biometric FIDO2 Passkeys & OAuth Sessions
 * Auth controls display only requested operation results.
 *
 * Zero emojis, authentic commercial brand identity, touch-first ergonomics (>=44px).
 */

export class AuthCard extends HTMLElement {
  constructor() {
    super();
    this.executing = false;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();

  }

  async execute(action, args = []) {
    const out = this.shadowRoot.querySelector('#card-out');
    const actionLabel = action.toUpperCase();
    if (out) out.textContent = `[ENCLAVE AUTH] Running ${actionLabel}...`;
    this.executing = true;

    try {
      const res = await this.host.run(action, args);
      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res);
      }
      if (out) out.textContent = text.trim();
    } catch (err) {
      if (out) out.textContent = `[ENCLAVE ERROR] ${err.message}`;
    } finally {
      this.executing = false;
    }
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    root.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'Space Grotesk', -apple-system, sans-serif;
          background: #021a12;
          color: #ecfdf5;
          border-radius: 14px;
          border: 1px solid #064e3b;
          padding: 16px;
          box-sizing: border-box;
          user-select: none;
        }

        * { box-sizing: border-box; }

        .brand-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(16, 185, 129, 0.2);
        }

        .identity {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-mark {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #047857 0%, #064e3b 100%);
          border: 1px solid #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .title-block {
          display: flex;
          flex-direction: column;
        }

        .name {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: #ffffff;
          line-height: 1.2;
        }

        .tagline {
          font-size: 11px;
          color: #6ee7b7;
          font-family: 'JetBrains Mono', monospace;
        }

        .badge-enclave {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.4);
          padding: 3px 8px;
          border-radius: 6px;
        }

        /* Biometric Enclave Telemetry Deck */
        .enclave-deck {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: rgba(4, 47, 34, 0.6);
          border: 1px solid rgba(16, 185, 129, 0.25);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 12px;
        }

        .enclave-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1;
        }

        .enclave-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #a7f3d0;
          letter-spacing: 0.02em;
        }

        .enclave-status {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #6ee7b7;
        }

        .canvas-container {
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Action Buttons Grid (>=44px touch targets) */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-bottom: 10px;
        }

        .btn-action {
          min-height: 44px;
          min-width: 44px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(16, 185, 129, 0.25);
          border-radius: 8px;
          color: #ecfdf5;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          touch-action: manipulation;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 4px 6px;
          transition: all 0.15s ease;
        }

        .btn-action:hover {
          background: #047857;
          border-color: #10b981;
          color: #ffffff;
        }

        .btn-action.btn-passkey {
          background: rgba(16, 185, 129, 0.18);
          border-color: #10b981;
          color: #34d399;
        }

        .btn-action.btn-passkey:hover {
          background: #10b981;
          color: #021a12;
        }

        /* Terminal Readout */
        .terminal-readout {
          background: #01110b;
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.4;
          color: #34d399;
          min-height: 42px;
          max-height: 100px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
      </style>

      <!-- Commercial Brand Identity (Rendered once) -->
      <div class="brand-bar">
        <div class="identity">
          <div class="logo-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div class="title-block">
            <span class="name">Auth & Secrets</span>
            <span class="tagline">Biometric FIDO2 Passkeys</span>
          </div>
        </div>
        <span class="badge-enclave">AUTH</span>
      </div>

      <!-- Biometric Enclave Deck -->
      <div class="enclave-deck">
        <div class="enclave-info">
          <span class="enclave-title">WebAuthn Security Keys</span>
          <span class="enclave-status">Review registered credentials and authentication settings</span>
        </div>

      </div>

      <!-- Touch-First Actions (>=44px touch targets) -->
      <div class="actions-grid">
        <button class="btn-action btn-passkey" data-cmd="passkey">PASSKEYS</button>
        <button class="btn-action" data-cmd="session">SESSIONS</button>
        <button class="btn-action" data-cmd="status">STATUS</button>
      </div>

      <!-- Live Terminal Output -->
      <div class="terminal-readout" id="card-out">Not checked. Select an action to retrieve current auth information.</div>
    `;

    const buttons = root.querySelectorAll('.btn-action');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        this.execute(cmd, []);
      });
    });
  }
}

if (!customElements.get('tr-auth-card')) {
  customElements.define('tr-auth-card', AuthCard);
}
