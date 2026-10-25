// Auth Management Panel Web Component for Total Recall
// Exposes Passkey registration, Google OAuth2 configuration, and status verification

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class AuthPanel extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.status = null;
    this.error = '';
    this.info = '';
    this.probeResult = '';
    this.load();
  }

  async load() {
    this.shadowRoot.innerHTML = '<p role="status">Loading Auth Engine status…</p>';
    try {
      if (this.host?.run) {
        const result = await this.host.run('status', ['--json']);
        if (result?.code && result.code !== 0) throw new Error('Auth status request failed');
        this.status = typeof result?.output === 'string' ? JSON.parse(result.output) : result;
      } else {
        const res = await fetch('/auth/providers');
        if (!res.ok) throw new Error(`Auth status returned HTTP ${res.status}`);
        this.status = await res.json();
      }
      this.render();
    } catch (err) {
      this.error = `Unable to query auth status: ${err.message}`;
      this.render();
    }
  }

  async registerPasskey() {
    this.info = 'Beginning WebAuthn registration…';
    this.render();
    try {
      const optRes = await fetch('/api/webauthn/register/options', { method: 'POST' });
      if (!optRes.ok) {
        throw new Error('Server rejected registration options request');
      }
      if (!globalThis.PublicKeyCredential?.parseCreationOptionsFromJSON || !navigator.credentials?.create) throw new Error('Passkey registration requires a supported secure browser');
      const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(await optRes.json());
      const credential = await navigator.credentials.create({ publicKey });
      if (!credential?.toJSON) throw new Error('Passkey registration was not completed');
      const verified = await fetch('/api/webauthn/register/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: credential.toJSON() }),
      });
      const result = await verified.json();
      if (!verified.ok || result.verified !== true) throw new Error('Passkey verification failed');
      this.info = 'Passkey registered and verified.';
      await this.load();
    } catch (err) {
      this.error = `Passkey registration error: ${err.message}`;
      this.render();
    }
  }

  async runProbe() {
    this.probeResult = 'Probing /auth/status…';
    this.render();
    const start = performance.now();
    try {
      const res = await fetch('/auth/status');
      const latency = Math.round(performance.now() - start);
      this.probeResult = `HTTP ${res.status} ${res.ok ? 'reachable' : 'request failed'} (${latency}ms)`;
    } catch (err) {
      this.probeResult = `Probe error: ${err.message}`;
    }
    this.render();
  }

  async googleAction(action) {
    this.error = ''; this.info = '';
    const id = this.shadowRoot.getElementById('google-account-id')?.value.trim();
    try {
      if (action !== 'accounts' && !id) throw new Error('Choose an account identifier');
      const args = action === 'accounts' ? ['accounts', '--json'] : [action, id, '--json'];
      let result;
      if (this.host?.run) result = await this.host.run('google', args);
      else {
        const url = action === 'accounts' ? '/auth/google/accounts' : `/auth/google/accounts/${encodeURIComponent(id)}/${action}`;
        const response = await fetch(url, { method: action === 'accounts' ? 'GET' : 'POST' });
        if (!response.ok) throw new Error('Connection command failed');
        result = await response.json();
      }
      if (result?.code && result.code !== 0) throw new Error('Connection command failed');
      this.info = typeof result?.output === 'string' ? result.output : JSON.stringify(result, null, 2);
    } catch (error) { this.error = error.message; }
    this.render();
  }

  async keyAction(action) {
    this.error = ''; this.info = '';
    const value = id => this.shadowRoot.getElementById(id)?.value.trim();
    try {
      if (!this.host?.run) throw new Error('Use the connected CLI command surface for key management');
      let args = [action];
      if (action === 'issue') {
        const scopes = [...this.shadowRoot.querySelectorAll('input[name="key-scope"]:checked')].map(input => input.value).join(',');
        if (!value('key-name') || !scopes) throw new Error('Choose a name and explicit permissions');
        args = ['issue', value('key-name'), '--scopes', scopes, '--kind', value('key-kind')];
        if (value('key-role')) args.push('--role', value('key-role'));
        if (value('key-expiry')) args.push('--expires', value('key-expiry'));
      } else if (action === 'role-set') {
        const scopes = [...this.shadowRoot.querySelectorAll('input[name="key-scope"]:checked')].map(input => input.value).join(',');
        if (!value('key-role')) throw new Error('Choose a role name');
        args = ['role-set', value('key-role'), '--scopes', scopes];
      } else if (['revoke', 'usage'].includes(action)) {
        if (!value('key-id')) throw new Error('Choose a key identifier'); args.push(value('key-id'));
      }
      const result = await this.host.run('key', [...args, '--json']);
      if (result?.code && result.code !== 0) throw new Error('Key command failed');
      this.info = typeof result?.output === 'string' ? result.output : JSON.stringify(result, null, 2);
    } catch (error) { this.error = error.message; }
    this.render();
  }

  render() {
    const passkeyCount = this.status?.passkey?.count ?? this.status?.passkey?.registered_count ?? null;
    const googleReady = Boolean(this.status?.google?.configured || this.status?.google_oauth2?.configured);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          color: #e5e7eb;
          background: #0f1219;
          border-radius: 12px;
          padding: 16px;
        }
        * { box-sizing: border-box; }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          border-bottom: 1px solid #1f293d;
          padding-bottom: 12px;
        }
        h2 { margin: 0; font-size: 18px; color: #f3f4f6; }
        section {
          background: #151a24;
          border: 1px solid #232d40;
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 14px;
        }
        h3 { margin-top: 0; font-size: 14px; color: #c7d2fe; text-transform: uppercase; letter-spacing: 0.04em; }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }
        .badge-ok { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
        .badge-muted { background: rgba(156, 163, 175, 0.2); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
        button {
          min-height: 44px;
          min-width: 44px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #374151;
          background: #252e42;
          color: #f9fafb;
          font-weight: 600;
          cursor: pointer;
        }
        button.primary {
          background: #4f46e5;
          border-color: #6366f1;
        }
        button:hover { background: #374151; }
        button.primary:hover { background: #4338ca; }
        input {
          width: 100%;
          min-height: 44px;
          padding: 10px;
          border-radius: 6px;
          border: 1px solid #374151;
          background: #0b0e14;
          color: #fff;
          font-family: monospace;
          margin-top: 4px;
        }
        label { display: block; margin: 8px 0; color: #9ca3af; font-size: 12px; }
        .alert-error { color: #f87171; background: rgba(248, 113, 113, 0.1); padding: 8px; border-radius: 6px; }
        .alert-info { color: #60a5fa; background: rgba(96, 165, 250, 0.1); padding: 8px; border-radius: 6px; }
        pre { background: #06080d; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto; color: #818cf8; }
      </style>

      <header>
        <h2>Auth &amp; Credentials</h2>
        <button id="btn-refresh">Refresh Status</button>
      </header>

      ${this.error ? `<div class="alert-error">${esc(this.error)}</div>` : ''}
      ${this.info ? `<div class="alert-info">${esc(this.info)}</div>` : ''}

      <section>
        <h3>Passkey WebAuthn Authentication</h3>
        <div class="row">
          <span>Active Credentials</span>
          <span class="badge ${passkeyCount > 0 ? 'badge-ok' : 'badge-muted'}">${passkeyCount === null ? 'Not checked' : `${passkeyCount} Registered`}</span>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:8px 0;">
          Authenticate securely using platform biometrics such as Touch ID, Face ID, or Windows Hello.
        </p>
        <button class="primary" id="btn-register-passkey">Register New Passkey</button>
      </section>

      <section>
        <h3>Google OAuth2 Authentication</h3>
        <div class="row">
          <span>Integration Status</span>
          <span class="badge ${googleReady ? 'badge-ok' : 'badge-muted'}">${this.status ? (googleReady ? 'Configured · not verified' : 'Unconfigured') : 'Not checked'}</span>
        </div>
        <form id="google-form">
          <label>
            Google Client ID
            <input readonly name="client_id" placeholder="apps.googleusercontent.com identifier" value="${esc(
              this.status?.google?.client_id || '',
            )}">
          </label>
          <label>
            Redirect URI
            <input readonly value="${esc(new URL('/auth/google/callback', location.origin).href)}">
          </label>
        </form>
        <a href="/auth/google" target="_blank" rel="noopener">Connect account</a>
        <label>Account identifier<input id="google-account-id" placeholder="Identifier from connections"></label>
        <button id="google-accounts">List connections</button>
        <button id="google-refresh">Refresh access</button>
        <button id="google-disconnect">Disconnect account</button>
      </section>

      <section>
        <h3>Encrypted credentials</h3>
        <p style="color:#9ca3af;font-size:12px;margin:8px 0;">
          Save credentials through auth. Provider verification results appear in the response.
        </p>
        <form id="secrets-form">
          <label>
            Secret Key Name
            <select id="panel-secret-key" style="width:100%;padding:10px;border-radius:6px;border:1px solid #374151;background:#0b0e14;color:#fff;">
              <option value="GOOGLE_CLIENT_ID">GOOGLE_CLIENT_ID</option>
              <option value="GOOGLE_CLIENT_SECRET">GOOGLE_CLIENT_SECRET</option>
              <option value="GOOGLE_REDIRECT_URI">GOOGLE_REDIRECT_URI</option>
              <option value="GOOGLE_ALLOWED_EMAILS">GOOGLE_ALLOWED_EMAILS</option>
              <option value="SESSION_SECRET">SESSION_SECRET</option>
            </select>
          </label>
          <label>
            Secret Value
            <input id="panel-secret-val" type="password" placeholder="Enter key value" required>
          </label>
          <div style="margin-top:10px;">
            <button class="primary" type="submit" id="btn-save-secrets">Save to Total Recall Secrets</button>
          </div>
        </form>
      </section>

      <section>
        <h3>Access keys and permissions</h3>
        <label>Name<input id="key-name"></label>
        <label>Key type<select id="key-kind"><option value="pat">Personal access token</option><option value="api_key">Application API key</option></select></label>
        <label>Role ceiling<input id="key-role" placeholder="reader, operator, admin or configured role"></label>
        <label>Expiry<input id="key-expiry" type="datetime-local"></label>
        <fieldset><legend>Permissions</legend>
          ${['*', 'chat:read', 'chat:write', 'models:read', 'instructions:read', 'ssss:read', 'ssss:write', 'memory:read', 'memory:write', 'memory:recompile', 'sandbox:run', 'tts:use', 'tasks:read', 'tasks:write', 'files:read', 'config:read', 'config:write', 'keys:read', 'keys:write', 'health:read'].map(scope => `<label><input type="checkbox" name="key-scope" value="${scope}">${scope}</label>`).join('')}
        </fieldset>
        <p>Issued tokens are shown once. Save the result securely.</p>
        <label>Existing key identifier<input id="key-id"></label>
        <button id="key-issue">Issue key</button><button id="key-list">List keys</button>
        <button id="key-revoke">Revoke key</button><button id="key-usage">Usage history</button><button id="key-roles">Role policies</button><button id="key-role-set">Save role permissions</button>
      </section>
      <section>
        <h3>Auth endpoint check</h3>
        <p style="color:#9ca3af;font-size:12px;margin:8px 0;">
          Execute an HTTP check against the auth engine endpoints to confirm live server health.
        </p>
        <div class="row">
          <button id="btn-probe">Check endpoint</button>
          <span>${esc(this.probeResult || 'Awaiting probe execution')}</span>
        </div>
      </section>
    `;

    this.shadowRoot.getElementById('btn-refresh')?.addEventListener('click', () => {
      this.error = '';
      this.info = '';
      this.load();
    });
    this.shadowRoot.getElementById('btn-register-passkey')?.addEventListener('click', () => this.registerPasskey());
    this.shadowRoot.getElementById('btn-probe')?.addEventListener('click', () => this.runProbe());
    for (const action of ['accounts', 'refresh', 'disconnect']) this.shadowRoot.getElementById(`google-${action}`)?.addEventListener('click', () => this.googleAction(action));
    for (const action of ['issue', 'list', 'revoke', 'usage', 'roles', 'role-set']) this.shadowRoot.getElementById(`key-${action}`)?.addEventListener('click', () => this.keyAction(action));
    this.shadowRoot.getElementById('secrets-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const key = this.shadowRoot.getElementById('panel-secret-key')?.value;
      const val = this.shadowRoot.getElementById('panel-secret-val')?.value?.trim();

      if (!val) return;
      this.info = `Saving ${key} to Total Recall secrets store…`;
      this.render();

      try {
        const res = await fetch('/api/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            value: val,
          }),
        });
        if (res.ok) {
          this.info = `Credential ${key} saved through auth.`;
        } else {
          const data = await res.json().catch(() => ({}));
          this.error = `Failed to save credential: ${data.error || 'Request rejected'}`;
        }
      } catch (err) {
        this.error = `Error saving credential: ${err.message}`;
      }
      this.render();
    });
  }
}

if (!customElements.get('tr-auth-panel')) {
  customElements.define('tr-auth-panel', AuthPanel);
}
export { AuthPanel };
