/**
 * `dsh-main` — DSH plugin main overview page.
 * Shows plugin branding, quick status summary, and links.
 *
 * @element dsh-main
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--color-text, #1a1a1a);
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-md, 8px);
      padding: var(--spacing-xl, 24px);
      max-width: 600px;
    }
    :host(.dark) {
      color: var(--color-text, #e0e0e0);
      background: var(--color-surface, #1e1e1e);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--spacing-md, 12px);
      margin-bottom: var(--spacing-lg, 16px);
    }
    .brand-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--color-primary, #3b82f6), var(--color-accent, #8b5cf6));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      color: var(--color-on-primary, #fff);
      flex-shrink: 0;
    }
    .brand-text h2 {
      margin: 0;
      font-size: var(--typography-h3-size, 20px);
      font-weight: 700;
    }
    .brand-text .sub {
      margin: 2px 0 0;
      font-size: var(--typography-caption-size, 12px);
      color: var(--color-text-secondary, #666);
    }
    .status-card {
      background: var(--color-surface-secondary, #f8f8f8);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: var(--radius-md, 8px);
      padding: var(--spacing-md, 12px);
      margin-bottom: var(--spacing-md, 12px);
    }
    :host(.dark) .status-card {
      background: var(--color-surface-secondary, #252525);
      border-color: var(--color-border, #333);
    }
    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-xs, 4px) 0;
    }
    .status-label {
      font-size: var(--typography-body-size, 14px);
      color: var(--color-text-secondary, #666);
    }
    .status-value {
      font-weight: 500;
      font-size: var(--typography-body-size, 14px);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-xs, 4px);
      padding: 2px var(--spacing-xs, 6px);
      border-radius: var(--radius-sm, 4px);
      font-size: var(--typography-caption-size, 11px);
      font-weight: 500;
    }
    .badge.online {
      background: var(--color-success-bg, #dcfce7);
      color: var(--color-success, #16a34a);
    }
    .badge.offline {
      background: var(--color-error-bg, #fee2e2);
      color: var(--color-error, #dc2626);
    }
    :host(.dark) .badge.online {
      background: rgba(34, 197, 94, 0.15);
    }
    :host(.dark) .badge.offline {
      background: rgba(239, 68, 68, 0.15);
    }
    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-sm, 8px);
      margin-top: var(--spacing-md, 12px);
    }
    .feature {
      padding: var(--spacing-sm, 8px);
      background: var(--color-surface-secondary, #f8f8f8);
      border-radius: var(--radius-sm, 4px);
      text-align: center;
    }
    :host(.dark) .feature {
      background: var(--color-surface-secondary, #252525);
    }
    .feature-icon {
      font-size: 20px;
      margin-bottom: var(--spacing-xs, 2px);
    }
    .feature-name {
      font-size: var(--typography-caption-size, 11px);
      color: var(--color-text-secondary, #666);
    }
    .actions {
      display: flex;
      gap: var(--spacing-sm, 8px);
      margin-top: var(--spacing-lg, 16px);
    }
    .action-link {
      color: var(--color-primary, #3b82f6);
      text-decoration: none;
      font-size: var(--typography-body-size, 14px);
      font-weight: 500;
      cursor: pointer;
    }
    .action-link:hover {
      text-decoration: underline;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--color-border, #e0e0e0);
      margin: var(--spacing-md, 12px) 0;
    }
  </style>

  <div class="brand">
    <div class="brand-icon">DS</div>
    <div class="brand-text">
      <h2>DeepSeek Harness</h2>
      <p class="sub">Total Recall Plugin v1.1.0 — Runtime Integration</p>
    </div>
  </div>

  <div class="status-card" id="statusCard">
    <div class="status-row">
      <span class="status-label">Status</span>
      <span class="badge" id="statusBadge">Checking...</span>
    </div>
    <hr class="divider">
    <div class="status-row">
      <span class="status-label">Commands</span>
      <span class="status-value"><code>total-recall dsh status|tools|models|plugins|sessions</code></span>
    </div>
    <div class="status-row">
      <span class="status-label">Monitor</span>
      <span class="status-value">Health check every 15m</span>
    </div>
  </div>

  <div class="features">
    <div class="feature">
      <div class="feature-icon">🔍</div>
      <div class="feature-name">Runtime Status</div>
    </div>
    <div class="feature">
      <div class="feature-icon">🧠</div>
      <div class="feature-name">Model Inventory</div>
    </div>
    <div class="feature">
      <div class="feature-icon">🔌</div>
      <div class="feature-name">Plugin Audit</div>
    </div>
    <div class="feature">
      <div class="feature-icon">🔧</div>
      <div class="feature-name">Tool Registry</div>
    </div>
  </div>

  <div class="actions">
    <a class="action-link" id="guiLink" href="http://127.0.0.1:54866" target="_blank">Open Web GUI →</a>
    <a class="action-link" href="#" id="refreshLink">↻ Refresh Status</a>
  </div>

  <dsh-status id="statusPanel"></dsh-status>
`;

export class DshMain extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this._checkStatus();
    this.shadowRoot.getElementById('refreshLink').addEventListener('click', (e) => {
      e.preventDefault();
      this._checkStatus();
    });
  }

  async _checkStatus() {
    const badge = this.shadowRoot.getElementById('statusBadge');
    try {
      const res = await fetch('http://127.0.0.1:54866/', { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      badge.className = 'badge online';
      badge.textContent = '● Online';
    } catch {
      badge.className = 'badge offline';
      badge.textContent = '● Offline';
    }
  }
}

customElements.define('dsh-main', DshMain);
export default DshMain;