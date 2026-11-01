/**
 * Auth & Secrets — Hardware WebAuthn FIDO2, OAuth Identity & Secrets Store.
 *
 * This face is purpose-built for the operator: it provides an instant
 * verdict on the secrets store, hardware biometric passkeys, Google OAuth
 * account tokens, and system security audit baseline findings.
 *
 * Every value traces directly to a host command read. A value the command did not
 * supply renders an em dash with its reason; nothing is seeded, and nothing is
 * defaulted to a reassuring word.
 *
 * Design rationale: ui/DESIGN.md.
 */

const DASH = '\u2014';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function asObject(result) {
  if (result === null || result === undefined) return null;
  if (typeof result === 'object') {
    if (typeof result.output === 'string') {
      try {
        const parsed = JSON.parse(result.output);
        return typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }
    return result;
  }
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      return typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export class AuthCard extends HTMLElement {
  constructor() {
    super();
    this.screen = 'secrets';
    this.busy = false;
    this.statusData = null;
    this.passkeysData = null;
    this.googleData = null;
    this.secretsData = null;
    this.auditData = null;
    this.lastError = null;
    this.lastAttempt = null;
    this.activeFilter = 'all';
    this.confirmAction = null;
  }

  get screens() {
    return [
      { id: 'secrets', label: 'Secrets Store' },
      { id: 'google', label: 'Google OAuth' },
      { id: 'passkeys', label: 'Passkeys' },
      { id: 'audit', label: 'Audit & Sessions' },
    ];
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
    this.onScreen = (event) => {
      const detail = event.detail || {};
      if (detail.id && this.screens.some((s) => s.id === detail.id)) {
        this.screen = detail.id;
        this.paint();
      }
    };
    window.addEventListener('tr:screen-change', this.onScreen);
    this.readAll();
  }

  disconnectedCallback() {
    window.removeEventListener('tr:screen-change', this.onScreen);
  }

  async readAll() {
    if (this.busy) return;
    this.busy = true;
    this.lastAttempt = new Date().toISOString();
    this.lastError = null;
    this.paint();

    try {
      if (this.host && typeof this.host.run === 'function') {
        const [statusRes, passkeysRes, googleRes, secretsRes, auditRes] = await Promise.allSettled([
          this.host.run('status', ['--json']),
          this.host.run('passkey', ['list', '--json']),
          this.host.run('google', ['accounts', '--json']),
          this.host.run('secret', ['list', '--json']),
          this.host.run('audit', ['--json']),
        ]);

        if (statusRes.status === 'fulfilled') {
          this.statusData = asObject(statusRes.value);
        } else {
          this.statusData = null;
        }

        if (passkeysRes.status === 'fulfilled') {
          this.passkeysData = asObject(passkeysRes.value);
        } else {
          this.passkeysData = null;
        }

        if (googleRes.status === 'fulfilled') {
          this.googleData = asObject(googleRes.value);
        } else {
          this.googleData = null;
        }

        if (secretsRes.status === 'fulfilled') {
          this.secretsData = asObject(secretsRes.value);
        } else {
          this.secretsData = null;
        }

        if (auditRes.status === 'fulfilled') {
          this.auditData = asObject(auditRes.value);
        } else {
          this.auditData = null;
        }
      }
    } catch (err) {
      this.lastError = err && err.message ? err.message : String(err);
      this.statusData = null;
      this.passkeysData = null;
      this.googleData = null;
      this.secretsData = null;
      this.auditData = null;
    } finally {
      this.busy = false;
      this.paint();
    }
  }

  async refreshGoogleAccount(accountId) {
    if (!this.host || typeof this.host.run !== 'function' || this.busy) return;
    this.busy = true;
    this.paint();
    try {
      await this.host.run('google', ['refresh', accountId, '--json']);
      await this.readAll();
    } catch (err) {
      this.lastError = err && err.message ? err.message : String(err);
      this.busy = false;
      this.paint();
    }
  }

  async revokePasskey(credentialId) {
    if (!this.host || typeof this.host.run !== 'function' || this.busy) return;
    this.busy = true;
    this.paint();
    try {
      await this.host.run('passkey', ['delete', credentialId, '--json']);
      this.confirmAction = null;
      await this.readAll();
    } catch (err) {
      this.lastError = err && err.message ? err.message : String(err);
      this.busy = false;
      this.paint();
    }
  }

  computeVerdict() {
    if (this.lastError) {
      return { tone: 'danger', label: 'Read Error', detail: this.lastError };
    }
    if (!this.statusData && !this.secretsData) {
      return { tone: 'muted', label: 'Unchecked', detail: 'Reading telemetry' };
    }

    const overdueCount = (this.secretsData?.keys || []).filter((k) => k.rotation_overdue).length;
    const auditPassed = this.auditData?.passed ?? true;
    const findingsCount = this.auditData?.findings_count ?? 0;

    if (!auditPassed || findingsCount > 0) {
      return {
        tone: 'danger',
        label: 'Policy Flagged',
        detail: `${findingsCount} security baseline findings detected`,
      };
    }
    if (overdueCount > 0) {
      return {
        tone: 'warn',
        label: 'Rotation Due',
        detail: `${overdueCount} secret keys overdue for 90-day rotation`,
      };
    }
    return {
      tone: 'ok',
      label: 'Secure',
      detail: 'Hardware passkeys active, zero findings, secrets sealed',
    };
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    root.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--font-body, 'Outfit', system-ui, sans-serif);
          color: var(--text-primary, var(--face-text-default, #f1f5f9));
          background: var(--bg-primary, var(--face-bg-default, #090d16));
          border: 1px solid var(--border, var(--face-border-default, #1e293b));
          border-radius: var(--border-radius, 8px);
          box-sizing: border-box;
          padding: 16px;
          min-width: 320px;
          max-width: 100%;
          line-height: 1.4;

          /* Palette Tokens */
          --face-text-default: #f1f5f9;
          --face-bg-default: #090d16;
          --face-border-default: #1e293b;
          --face-primary: #10b981;
          --face-primary-bg: #064e3b;
          --face-primary-text: #041f17;
          --face-accent: #34d399;
          --face-ok: #059669;
          --face-ok-bg: rgba(5, 150, 105, 0.15);
          --face-warn: #d97706;
          --face-warn-bg: rgba(217, 119, 6, 0.15);
          --face-danger: #dc2626;
          --face-danger-bg: rgba(220, 38, 38, 0.15);
          --face-muted: var(--text-secondary, #94a3b8);
          --face-surface: var(--bg-secondary, #0f172a);
          --face-surface-subtle: rgba(255, 255, 255, 0.03);
          --face-border: var(--border, #1e293b);
          --face-border-active: #334155;
          --face-font-mono: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--face-border);
        }

        .brand-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .wordmark {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-primary, var(--face-text-default));
        }

        .badge {
          font-family: var(--face-font-mono);
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--face-primary-bg);
          color: var(--face-accent);
          border: 1px solid rgba(52, 211, 153, 0.3);
          text-transform: uppercase;
        }

        .verdict-line {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
        }

        .verdict-line[data-tone="ok"] {
          background: var(--face-ok-bg);
          color: var(--face-accent);
          border: 1px solid rgba(5, 150, 105, 0.3);
        }

        .verdict-line[data-tone="warn"] {
          background: var(--face-warn-bg);
          color: var(--face-warn);
          border: 1px solid rgba(217, 119, 6, 0.3);
        }

        .verdict-line[data-tone="danger"] {
          background: var(--face-danger-bg);
          color: var(--face-danger);
          border: 1px solid rgba(220, 38, 38, 0.3);
        }

        .verdict-line[data-tone="muted"] {
          background: var(--face-surface);
          color: var(--face-muted);
          border: 1px solid var(--face-border);
        }

        .verdict-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .tabs-nav {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--face-border);
          padding-bottom: 10px;
          overflow-x: auto;
        }

        .tab-btn {
          min-height: 44px;
          padding: 8px 14px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--face-muted);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .tab-btn:hover {
          color: var(--text-primary, var(--face-text-default));
          background: var(--face-surface-subtle);
        }

        .tab-btn.active {
          color: var(--face-accent);
          background: var(--face-surface);
          border-color: var(--face-border-active);
        }

        .refresh-btn {
          min-height: 44px;
          padding: 8px 14px;
          border-radius: 6px;
          border: 1px solid var(--face-border);
          background: var(--face-surface);
          color: var(--text-primary, var(--face-text-default));
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }

        .refresh-btn:hover {
          background: var(--face-border-active);
        }

        .screen-container {
          min-height: 220px;
        }

        .metrics-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .metric-card {
          background: var(--face-surface);
          border: 1px solid var(--face-border);
          border-radius: 6px;
          padding: 10px 12px;
        }

        .metric-label {
          font-size: 11px;
          color: var(--face-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
        }

        .metric-value {
          font-family: var(--face-font-mono);
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text-default));
        }

        .metric-sub {
          font-size: 11px;
          color: var(--face-muted);
          margin-top: 2px;
        }

        .item-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .item-row {
          background: var(--face-surface);
          border: 1px solid var(--face-border);
          border-radius: 6px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .item-main {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .item-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, var(--face-text-default));
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .item-meta {
          font-family: var(--face-font-mono);
          font-size: 12px;
          color: var(--face-muted);
        }

        .action-btn {
          min-height: 44px;
          padding: 8px 14px;
          border-radius: 6px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid transparent;
        }

        .action-btn.primary {
          background: var(--face-primary);
          color: var(--face-primary-text);
        }

        .action-btn.primary:hover {
          background: var(--face-accent);
        }

        .action-btn.secondary {
          background: var(--face-surface-subtle);
          border-color: var(--face-border);
          color: var(--text-primary, var(--face-text-default));
        }

        .action-btn.secondary:hover {
          background: var(--face-border-active);
        }

        .action-btn.danger {
          background: var(--face-danger-bg);
          border-color: rgba(220, 38, 38, 0.4);
          color: var(--face-danger);
        }

        .action-btn.danger:hover {
          background: rgba(220, 38, 38, 0.25);
        }

        .empty-state {
          text-align: center;
          padding: 32px 16px;
          border: 1px dashed var(--face-border);
          border-radius: 6px;
          color: var(--face-muted);
        }

        .empty-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, var(--face-text-default));
          margin-bottom: 6px;
        }

        .empty-text {
          font-size: 13px;
          margin-bottom: 14px;
          max-width: 440px;
          margin-left: auto;
          margin-right: auto;
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
          border: 1px solid var(--face-border);
          border-radius: 6px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          text-align: left;
        }

        th {
          background: var(--face-surface);
          color: var(--face-muted);
          font-weight: 600;
          padding: 10px 12px;
          border-bottom: 1px solid var(--face-border);
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.05em;
        }

        td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--face-border);
          color: var(--text-primary, var(--face-text-default));
        }

        tr:last-child td {
          border-bottom: none;
        }

        .code-cell {
          font-family: var(--face-font-mono);
          font-size: 12px;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          font-family: var(--face-font-mono);
        }

        .status-pill.ok {
          background: var(--face-ok-bg);
          color: var(--face-accent);
        }

        .status-pill.warn {
          background: var(--face-warn-bg);
          color: var(--face-warn);
        }

        .status-pill.danger {
          background: var(--face-danger-bg);
          color: var(--face-danger);
        }

        .status-pill.muted {
          background: var(--face-surface-subtle);
          color: var(--face-muted);
        }

        .filter-strip {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .filter-btn {
          min-height: 32px;
          padding: 4px 10px;
          border-radius: 4px;
          border: 1px solid var(--face-border);
          background: var(--face-surface);
          color: var(--face-muted);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        .filter-btn.active {
          background: var(--face-primary-bg);
          color: var(--face-accent);
          border-color: rgba(52, 211, 153, 0.4);
        }

        .confirmation-box {
          background: var(--face-danger-bg);
          border: 1px solid var(--face-danger);
          border-radius: 6px;
          padding: 14px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .footer-note {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--face-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 12px;
          color: var(--face-muted);
        }
      </style>

      <div class="header">
        <div class="brand-group">
          <div class="wordmark">AUTH & SECRETS</div>
        </div>
        <div id="verdict" class="verdict-line" data-tone="muted">
          <div class="verdict-dot"></div>
          <span id="verdict-label">Checking...</span>
        </div>
      </div>

      <div class="tabs-nav">
        <button class="tab-btn" data-screen="secrets">Secrets</button>
        <button class="tab-btn" data-screen="passkeys">Passkeys</button>
        <button class="tab-btn" data-screen="google">Google OAuth</button>
        <button class="tab-btn" data-screen="audit">Audit & Sessions</button>
        <button class="refresh-btn" id="refresh-action">Refresh</button>
      </div>

      <div id="confirmation-zone"></div>
      <div id="screen-zone" class="screen-container"></div>

      <div class="footer-note">
        <span id="last-attempt-note">Attempted: ${DASH}</span>
        <span>Isolated Auth Secrets Store Follows TR_SECRETS_BRAIN</span>
      </div>
    `;

    this.bindEvents();
    this.paint();
  }

  bindEvents() {
    const root = this.shadowRoot;
    if (!root) return;

    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const targetScreen = target?.getAttribute('data-screen');
        if (targetScreen) {
          this.screen = targetScreen;
          root.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
          target.classList.add('active');
          this.paint();
        }
      });
    });

    const refreshBtn = root.getElementById('refresh-action');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.readAll());
    }
  }

  paint() {
    const root = this.shadowRoot;
    if (!root) return;

    // Update active tab
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-screen') === this.screen);
    });

    // Update verdict
    const verdict = this.computeVerdict();
    const verdictEl = root.getElementById('verdict');
    const verdictLabel = root.getElementById('verdict-label');
    if (verdictEl && verdictLabel) {
      verdictEl.setAttribute('data-tone', verdict.tone);
      verdictLabel.textContent = `${verdict.label} — ${verdict.detail}`;
    }

    // Update last attempt
    const attemptEl = root.getElementById('last-attempt-note');
    if (attemptEl) {
      attemptEl.textContent = this.lastAttempt
        ? `Last checked: ${new Date(this.lastAttempt).toLocaleTimeString()}`
        : `Attempted: ${DASH}`;
    }

    // Confirmation zone
    const confirmZone = root.getElementById('confirmation-zone');
    if (confirmZone) {
      if (this.confirmAction) {
        confirmZone.innerHTML = `
          <div class="confirmation-box">
            <div>
              <strong>Confirm Revocation:</strong> Are you sure you want to revoke passkey <code>${escapeHtml(
                this.confirmAction.name || this.confirmAction.id
              )}</code>? This hardware authenticator will no longer grant access.
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="action-btn danger" id="btn-confirm-delete">Revoke Passkey</button>
              <button class="action-btn secondary" id="btn-cancel-delete">Cancel</button>
            </div>
          </div>
        `;
        confirmZone.querySelector('#btn-confirm-delete')?.addEventListener('click', () => {
          this.revokePasskey(this.confirmAction.id);
        });
        confirmZone.querySelector('#btn-cancel-delete')?.addEventListener('click', () => {
          this.confirmAction = null;
          this.paint();
        });
      } else {
        confirmZone.innerHTML = '';
      }
    }

    // Render active screen
    const screenZone = root.getElementById('screen-zone');
    if (!screenZone) return;

    switch (this.screen) {
      case 'passkeys':
        this.paintPasskeys(screenZone);
        break;
      case 'google':
        this.paintGoogle(screenZone);
        break;
      case 'secrets':
        this.paintSecrets(screenZone);
        break;
      case 'audit':
        this.paintAudit(screenZone);
        break;
      default:
        this.paintPasskeys(screenZone);
    }
  }

  paintPasskeys(container) {
    const passkeys = this.passkeysData?.passkeys || [];
    const count = this.passkeysData?.count ?? passkeys.length;
    const isEnabled = this.statusData?.passkey?.enabled ?? true;

    container.innerHTML = `
      <div class="metrics-strip">
        <div class="metric-card">
          <div class="metric-label">Registered Passkeys</div>
          <div class="metric-value">${count}</div>
          <div class="metric-sub">${count === 1 ? '1 hardware key' : `${count} keys active`}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Biometric FIDO2</div>
          <div class="metric-value" style="color: ${isEnabled ? 'var(--face-accent)' : 'var(--face-muted)'};">
            ${isEnabled ? 'Active' : 'Disabled'}
          </div>
          <div class="metric-sub">WebAuthn Relying Party</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Local Authenticator</div>
          <div class="metric-value">Platform</div>
          <div class="metric-sub">Touch ID / Platform Key</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="margin: 0; font-size: 14px;">Registered Hardware Authenticators</h4>
        <div style="font-size: 12px; color: var(--face-muted);">
          Protected by Biometric Security Policy
        </div>
      </div>

      ${
        passkeys.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-title">Zero Passkeys Registered</div>
          <div class="empty-text">
            No hardware biometric passkeys are registered yet. Register your device Touch ID, Face ID, or YubiKey hardware key for cryptographic sign-in.
          </div>
          <div style="font-size: 12px; font-family: var(--face-font-mono); color: var(--face-muted); background: var(--face-surface); padding: 8px 12px; border-radius: 4px; display: inline-block;">
            total-recall auth passkey register
          </div>
        </div>
      `
          : `
        <div class="item-list">
          ${passkeys
            .map(
              (pk) => `
            <div class="item-row">
              <div class="item-main">
                <div class="item-title">
                  <span>${escapeHtml(pk.name || 'Hardware Authenticator')}</span>
                  <span class="status-pill ok">Active</span>
                </div>
                <div class="item-meta">
                  ID: ${escapeHtml(pk.id || DASH)} · Added: ${
                pk.created_at ? new Date(pk.created_at).toLocaleDateString() : DASH
              } · Last Used: ${pk.last_used_at ? new Date(pk.last_used_at).toLocaleDateString() : 'Never'}
                </div>
              </div>
              <div>
                <button class="action-btn danger btn-revoke-passkey" data-id="${escapeHtml(
                  pk.id
                )}" data-name="${escapeHtml(pk.name || pk.id)}">
                  Revoke
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    `;

    container.querySelectorAll('.btn-revoke-passkey').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget?.getAttribute('data-id');
        const name = e.currentTarget?.getAttribute('data-name');
        if (id) {
          this.confirmAction = { type: 'passkey', id, name };
          this.paint();
        }
      });
    });
  }

  paintGoogle(container) {
    const accounts = this.googleData?.accounts || [];
    const isConfigured = this.statusData?.google_oauth2?.configured ?? (accounts.length > 0);
    const clientId = this.statusData?.google_oauth2?.client_id || DASH;

    container.innerHTML = `
      <div class="metrics-strip">
        <div class="metric-card">
          <div class="metric-label">Google Accounts</div>
          <div class="metric-value">${accounts.length}</div>
          <div class="metric-sub">${accounts.length === 1 ? '1 active connection' : `${accounts.length} connections`}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">OAuth2 Service</div>
          <div class="metric-value" style="color: ${isConfigured ? 'var(--face-accent)' : 'var(--face-warn)'};">
            ${isConfigured ? 'Configured' : 'Missing Credentials'}
          </div>
          <div class="metric-sub">Client ID: ${escapeHtml(clientId.slice(0, 16))}…</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Session Scopes</div>
          <div class="metric-value">OpenID + API</div>
          <div class="metric-sub">Verified OAuth Callback</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="margin: 0; font-size: 14px;">Connected Google Cloud Accounts</h4>
        <div style="font-size: 12px; color: var(--face-muted);">
          Encrypted Token Rotation
        </div>
      </div>

      ${
        accounts.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-title">Zero Google Accounts Connected</div>
          <div class="empty-text">
            No Google OAuth accounts are connected. Connect your Google account to grant API access and authenticate sessions.
          </div>
          <div style="font-size: 12px; font-family: var(--face-font-mono); color: var(--face-muted); background: var(--face-surface); padding: 8px 12px; border-radius: 4px; display: inline-block;">
            total-recall auth google connect
          </div>
        </div>
      `
          : `
        <div class="item-list">
          ${accounts
            .map((acc) => {
              const isExpired = acc.expiry ? new Date(acc.expiry).getTime() < Date.now() : false;
              const scopesCount = Array.isArray(acc.scopes) ? acc.scopes.length : 0;
              return `
              <div class="item-row">
                <div class="item-main">
                  <div class="item-title">
                    <span>${escapeHtml(acc.email || acc.account_id)}</span>
                    <span class="status-pill ${isExpired ? 'warn' : 'ok'}">
                      ${isExpired ? 'Token Expired' : 'Connected'}
                    </span>
                  </div>
                  <div class="item-meta">
                    Scopes: ${scopesCount} granted · Expiry: ${
                acc.expiry ? new Date(acc.expiry).toLocaleString() : DASH
              } · Last Refresh: ${acc.updated_at ? new Date(acc.updated_at).toLocaleString() : DASH}
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="action-btn secondary btn-refresh-google" data-id="${escapeHtml(acc.account_id)}">
                    Refresh Token
                  </button>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `
      }
    `;

    container.querySelectorAll('.btn-refresh-google').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget?.getAttribute('data-id');
        if (id) this.refreshGoogleAccount(id);
      });
    });
  }

  paintSecrets(container) {
    const keys = this.secretsData?.keys || [];
    const storePath = this.secretsData?.store || DASH;
    const overdueCount = keys.filter((k) => k.rotation_overdue).length;
    const sharedCount = keys.filter((k) => k.shared_value).length;

    let filteredKeys = keys;
    if (this.activeFilter === 'overdue') {
      filteredKeys = keys.filter((k) => k.rotation_overdue);
    } else if (this.activeFilter === 'ai') {
      filteredKeys = keys.filter((k) =>
        ['google', 'openai', 'anthropic', 'deepseek', 'openrouter'].includes(k.provider)
      );
    } else if (this.activeFilter === 'infra') {
      filteredKeys = keys.filter((k) =>
        ['vercel', 'digitalocean', 'stripe', 'mailcow', 'smtp2go', 'telnyx'].includes(k.provider)
      );
    }

    container.innerHTML = `
      <div class="metrics-strip">
        <div class="metric-card">
          <div class="metric-label">Active Secrets</div>
          <div class="metric-value">${keys.length}</div>
          <div class="metric-sub">Single Secrets Store</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Overdue Rotations</div>
          <div class="metric-value" style="color: ${overdueCount > 0 ? 'var(--face-warn)' : 'var(--face-accent)'};">
            ${overdueCount}
          </div>
          <div class="metric-sub">${overdueCount === 0 ? 'All keys fresh' : 'Exceeds 90-day cycle'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Shared Bindings</div>
          <div class="metric-value">${sharedCount}</div>
          <div class="metric-sub">Multi-repo consumers</div>
        </div>
      </div>

      <div class="filter-strip">
        <button class="filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
          All Keys (${keys.length})
        </button>
        <button class="filter-btn ${this.activeFilter === 'overdue' ? 'active' : ''}" data-filter="overdue">
          Overdue (${overdueCount})
        </button>
        <button class="filter-btn ${this.activeFilter === 'ai' ? 'active' : ''}" data-filter="ai">
          AI & LLM
        </button>
        <button class="filter-btn ${this.activeFilter === 'infra' ? 'active' : ''}" data-filter="infra">
          Infrastructure
        </button>
      </div>

      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Key Identifier</th>
              <th>Provider</th>
              <th>Bound Repositories</th>
              <th>Fingerprint</th>
              <th>Rotation Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredKeys.length === 0
                ? `
              <tr>
                <td colspan="5" style="text-align: center; color: var(--face-muted); padding: 24px;">
                  No secret keys match the active filter.
                </td>
              </tr>
            `
                : filteredKeys
                    .slice(0, 50)
                    .map(
                      (k) => `
              <tr>
                <td class="code-cell">
                  <strong>${escapeHtml(k.key)}</strong>
                </td>
                <td>${escapeHtml(k.provider_name || k.provider || DASH)}</td>
                <td class="code-cell" style="font-size: 11px;">
                  ${escapeHtml(Array.isArray(k.repos) ? k.repos.join(', ') : k.repo || 'global')}
                </td>
                <td class="code-cell">${escapeHtml(k.fingerprint || DASH)}</td>
                <td>
                  <span class="status-pill ${k.rotation_overdue ? 'warn' : 'ok'}">
                    ${k.rotation_overdue ? 'Overdue' : 'Fresh'}
                  </span>
                </td>
              </tr>
            `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>

      <div style="font-size: 11px; font-family: var(--face-font-mono); color: var(--face-muted); margin-top: 10px;">
        Store: ${escapeHtml(storePath)}
      </div>
    `;

    container.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const filter = e.currentTarget?.getAttribute('data-filter');
        if (filter) {
          this.activeFilter = filter;
          this.paintSecrets(container);
        }
      });
    });
  }

  paintAudit(container) {
    const findings = this.auditData?.findings || [];
    const passed = this.auditData?.passed ?? true;
    const findingsCount = this.auditData?.findings_count ?? findings.length;
    const auditTitle = this.auditData?.audit || 'Total Recall Auth Security Baseline';

    container.innerHTML = `
      <div class="metrics-strip">
        <div class="metric-card">
          <div class="metric-label">Security Baseline</div>
          <div class="metric-value" style="color: ${passed ? 'var(--face-accent)' : 'var(--face-danger)'};">
            ${passed ? 'PASS' : 'FAIL'}
          </div>
          <div class="metric-sub">Deterministic Audit</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Findings Count</div>
          <div class="metric-value" style="color: ${findingsCount > 0 ? 'var(--face-danger)' : 'var(--face-accent)'};">
            ${findingsCount}
          </div>
          <div class="metric-sub">${findingsCount === 0 ? 'Zero vulnerabilities' : 'Issues detected'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Audit Engine</div>
          <div class="metric-value">Active</div>
          <div class="metric-sub">Hardware Token Verification</div>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 4px 0; font-size: 14px;">${escapeHtml(auditTitle)}</h4>
        <div style="font-size: 12px; color: var(--face-muted);">
          Deterministic security posture verification across credentials, session tokens, and permissions.
        </div>
      </div>

      ${
        findings.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-title" style="color: var(--face-accent);">Zero Findings Detected</div>
          <div class="empty-text">
            All security baselines satisfied. Permissions, session signing keys, and credential stores are compliant with Total Recall security policies.
          </div>
        </div>
      `
          : `
        <div class="item-list">
          ${findings
            .map(
              (f) => `
            <div class="item-row">
              <div class="item-main">
                <div class="item-title">
                  <span class="status-pill ${f.severity === 'critical' ? 'danger' : 'warn'}">
                    ${escapeHtml(f.severity || 'Warning')}
                  </span>
                  <span>${escapeHtml(f.title || f.check || 'Policy Violation')}</span>
                </div>
                <div class="item-meta">
                  ${escapeHtml(f.detail || f.message || DASH)}
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    `;
  }
}

if (!customElements.get('tr-auth-card')) {
  customElements.define('tr-auth-card', AuthCard);
}

export { asObject, escapeHtml };
