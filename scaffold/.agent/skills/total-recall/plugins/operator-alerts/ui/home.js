const channels = {
  os: 'Desktop', email: 'Email', sms: 'SMS', webhook: 'Webhook',
  telegram: 'Telegram', slack: 'Slack', discord: 'Discord', github: 'Issue tracker', expo: 'Expo',
};
const states = {
  accepted: 'Accepted', failed: 'Failed', pending: 'Pending', duplicate: 'Duplicate',
  suppressed: 'Suppressed', 'dry-run': 'Dry run passed',
};
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export class OperatorAlertsHome extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host {display:block;background:var(--color-background,#1c1714);color:var(--color-text,#fff5e8);font:var(--typography-body-font-size,15px)/1.5 var(--typography-body-font-family,system-ui,sans-serif)}
          main {padding:clamp(16px,5vw,44px)}
          header {border-block-start:5px solid var(--color-primary,#ffb069);padding-block:var(--spacing-lg,24px);border-block-end:1px solid var(--color-border,#6d5546)}
          h2 {margin:.15em 0;font:700 clamp(2rem,8vw,4.2rem)/1.03 var(--typography-title-font-family,Georgia,serif)}
          h3 {margin:.25em 0;font-size:1.28rem}
          p {margin:.35em 0;color:var(--color-muted,#dac0aa)}
          .marker {color:var(--color-primary,#ffb069);font:700 .76rem var(--typography-label-font-family,ui-monospace,monospace);letter-spacing:.08em;text-transform:uppercase}
          .split {display:grid;gap:var(--spacing-lg,24px);grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);margin-block:var(--spacing-lg,24px)}
          aside {background:var(--color-surface,#2a211c);padding:var(--spacing-md,16px);border-radius:var(--radius-sm,4px)}
          ul,ol {list-style:none;margin:.65em 0;padding:0}
          .receipts li,.checks li {display:flex;flex-wrap:wrap;justify-content:space-between;gap:.25rem .8rem;padding:.55rem 0;border-block-end:1px solid var(--color-border,#6d5546)}
          time {font: .82rem var(--typography-label-font-family,ui-monospace,monospace);color:var(--color-muted,#dac0aa)}
          .routes {display:flex;flex-wrap:wrap;gap:var(--spacing-sm,8px)}
          .routes li {border:1px solid var(--color-border,#6d5546);border-radius:var(--radius-sm,4px);padding:.25rem .45rem}
          .notice {color:var(--color-notice,#ffcc9d)}
          button,summary {font:inherit;min-height:var(--spacing-touch,44px);cursor:pointer}
          button {border:1px solid var(--color-border,#6d5546);border-radius:var(--radius-sm,4px);background:transparent;color:inherit;padding:.45em .8em}
          .check {background:var(--color-primary,#ffb069);color:var(--color-on-primary,#2c1708);font-weight:700}
          button:disabled {opacity:.6;cursor:wait}
          button:focus-visible,summary:focus-visible {outline:2px solid var(--color-primary,#ffb069);outline-offset:3px}
          details {border-block-start:1px solid var(--color-border,#6d5546);padding-block:.55em}
          summary {display:list-item;line-height:var(--spacing-touch,44px)}
          code {overflow-wrap:anywhere}
          @media (max-width:620px) {.split {grid-template-columns:minmax(0,1fr)}}
        </style>
        <main>
          <header>
            <p class="marker">Operator Alerts</p>
            <h2>Dispatch Watch</h2>
            <p>Review recent submissions and check which configured routes are ready for a dry run.</p>
          </header>
          <p id="status" role="status">Reading alert status…</p>
          <div class="split">
            <section aria-labelledby="ledger-title">
              <p class="marker">Recorded evidence</p>
              <h3 id="ledger-title">Recent receipts</h3>
              <p>Accepted means the channel accepted a submission. Recipient delivery is a separate check.</p>
              <ol class="receipts" id="receipts" aria-label="Recent recorded receipts"></ol>
              <button type="button" id="refresh">Refresh receipts</button>
            </section>
            <aside aria-labelledby="routes-title">
              <p class="marker">Local routing</p>
              <h3 id="routes-title">Configured routes</h3>
              <ul class="routes" id="routes" aria-label="Configured routes"></ul>
              <button class="check" type="button" id="check">Run dry check</button>
              <p id="check-status" role="status">A dry check reviews local settings without sending a notification.</p>
              <ul class="checks" id="checks" aria-label="Dry-run results"></ul>
            </aside>
          </div>
          <details>
            <summary>Terminal operations</summary>
            <p>Use <code>total-recall alerts config</code> for complete settings and <code>total-recall alerts log</code> for private receipts.</p>
            <p>Before <code>total-recall alerts send</code>, choose the route and confirm the recipient. Manage credential references through Auth.</p>
          </details>
        </main>`;
      this.shadowRoot.getElementById('refresh').addEventListener('click', () => this.refresh());
      this.shadowRoot.getElementById('check').addEventListener('click', () => this.refresh(true));
    }
    void this.refresh();
  }

  async refresh(check = false) {
    if (this.loading) return;
    this.loading = true;
    const root = this.shadowRoot;
    const refreshButton = root.getElementById('refresh');
    const checkButton = root.getElementById('check');
    const status = root.getElementById('status');
    const checkStatus = root.getElementById('check-status');
    refreshButton.disabled = checkButton.disabled = true;
    if (check) {
      checkStatus.textContent = 'Checking local route settings…';
      root.getElementById('checks').replaceChildren();
    } else status.textContent = 'Reading alert status…';
    try {
      const response = await this.host.run('status', check ? ['--check', '--json'] : ['--json']);
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      if (data?.ok !== true || !Array.isArray(data.configuredChannels) || !Array.isArray(data.recentReceipts) ||
          (check && !Array.isArray(data.channelChecks))) throw new Error('Invalid alerts status');
      this.showStatus(data);
      status.textContent = 'Alert status refreshed.';
      if (check) {
        const rows = data.channelChecks.map(row => this.item(this.channelName(row.channel), states[row.status] || 'Unavailable'));
        root.getElementById('checks').replaceChildren(...rows);
        checkStatus.textContent = rows.length ? 'Dry check complete. Review the result for each route.' : 'No configured routes to check.';
      } else {
        root.getElementById('checks').replaceChildren();
        checkStatus.textContent = 'A dry check reviews local settings without sending a notification.';
      }
    } catch {
      if (check) checkStatus.textContent = 'Could not complete the dry check.';
      else status.textContent = this.hasSnapshot ? 'Could not refresh. Showing the previous snapshot.' : 'Could not read alert status.';
    } finally {
      this.loading = false;
      refreshButton.disabled = checkButton.disabled = false;
    }
  }

  showStatus(data) {
    const routes = data.configuredChannels.map(channel => this.item(this.channelName(channel)));
    this.shadowRoot.getElementById('routes').replaceChildren(...(routes.length ? routes : [this.item('No configured routes')]));
    const receipts = data.recentReceipts.map(row => {
      const label = row.outcome === 'unknown' ? 'Outcome unknown' : states[row.status] || 'Unavailable';
      const item = this.item(this.channelName(row.channel), label);
      if (row.outcome === 'unknown' || row.status === 'failed') item.className = 'notice';
      const date = new Date(row.at);
      if (Number.isFinite(date.getTime())) {
        const timestamp = document.createElement('time');
        timestamp.dateTime = date.toISOString();
        timestamp.textContent = timeFormat.format(date);
        item.append(timestamp);
      }
      return item;
    });
    this.shadowRoot.getElementById('receipts').replaceChildren(...(receipts.length ? receipts : [this.item('No recorded receipts')]));
    this.hasSnapshot = true;
  }

  channelName(channel) {
    return Object.hasOwn(channels, channel) ? channels[channel] : 'Unknown route';
  }

  item(title, detail) {
    const item = document.createElement('li');
    const heading = document.createElement('strong');
    heading.textContent = title;
    item.append(heading);
    if (detail) {
      const text = document.createElement('span');
      text.textContent = detail;
      item.append(text);
    }
    return item;
  }
}

if (!customElements.get('tr-operator-alerts-home')) {
  customElements.define('tr-operator-alerts-home', OperatorAlertsHome);
}
