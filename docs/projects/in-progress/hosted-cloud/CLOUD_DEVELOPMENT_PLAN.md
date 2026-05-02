# Total Recall Cloud — Development Plan

## Goal
Transform Total Recall from a local-only CLI tool into a portable, secure memory engine with encrypted config sharing, multi-channel notifications, and direct LLM API support. Portability model: host your config file anywhere, pull it from any machine with `total-recall setup --config <URL>`. No SaaS infrastructure required.

## Key Design Decisions

### 1. Dual-Mode Architecture (Not Cloud-Only)
Local mode remains the default. Cloud is opt-in. The core engine is shared — storage and notifications are abstracted behind adapters. A user who never signs up still gets the full local experience.

```
totalrecall.config.mjs:
  mode: 'local' | 'cloud' | 'hybrid'
  cloud:
    apiKey: process.env.TOTAL_RECALL_API_KEY
    syncMode: 'push' | 'pull' | 'bidirectional'
```

### 2. Storage Adapter Pattern
Abstract all I/O behind an adapter interface so the engine doesn't care whether it's writing to SQLite or PostgreSQL:

```javascript
// src/core/storage.mjs
export class StorageAdapter {
  async readWikiNodes(query) {}
  async writeWikiNode(node) {}
  async searchFTS(term) {}
  async readEpisodes(filter) {}
  async writeEpisode(episode) {}
}

export class LocalStorageAdapter extends StorageAdapter { /* SQLite + fs */ }
export class CloudStorageAdapter extends StorageAdapter { /* Supabase */ }
```

### 3. Notification Channel System
Replace the current macOS-only `osascript` with a channel-based dispatcher:

```javascript
// src/notifications/dispatcher.mjs
const CHANNELS = {
  macos: (title, msg) => execSync(`osascript ...`),
  webpush: (title, msg, sub) => webpush.sendNotification(sub, payload),
  email: (title, msg, to) => resend.send({ to, subject: title, text: msg }),
  slack: (title, msg, webhook) => fetch(webhook, { body: { text: `*${title}*\n${msg}` } }),
  discord: (title, msg, webhook) => fetch(webhook, { body: { content: `**${title}**\n${msg}` } }),
};
```

### 4. Auth Strategy
- **Local mode**: No auth needed. Engine runs on your machine.
- **API access**: API key (`TOTAL_RECALL_API_KEY`) — simple, stateless, good for CI/CD.
- **Cloud dashboard**: OAuth 2.1 via GitHub/Google — standard web login.
- **CLI login**: `total-recall login` opens browser OAuth flow, stores token in `~/.total-recall/auth.json`.

### 5. `.env` Convention

```env
# ─── Auth ──────────────────────────────────────────
TOTAL_RECALL_API_KEY=tr_live_...
TOTAL_RECALL_MODE=local              # local | cloud | hybrid

# ─── Cloud Storage (only if mode=cloud/hybrid) ────
TOTAL_RECALL_SUPABASE_URL=https://xxx.supabase.co
TOTAL_RECALL_SUPABASE_KEY=eyJ...
TOTAL_RECALL_S3_BUCKET=total-recall-episodes
TOTAL_RECALL_S3_REGION=us-east-1

# ─── LLM API Keys (for direct API mode) ───────────
TOTAL_RECALL_OPENAI_KEY=sk-...
TOTAL_RECALL_ANTHROPIC_KEY=sk-ant-...
TOTAL_RECALL_GOOGLE_KEY=AIza...
TOTAL_RECALL_OPENROUTER_KEY=sk-or-...

# ─── Notifications ────────────────────────────────
TOTAL_RECALL_SLACK_WEBHOOK=https://hooks.slack.com/...
TOTAL_RECALL_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
TOTAL_RECALL_EMAIL_FROM=memory@totalrecall.dev
TOTAL_RECALL_RESEND_KEY=re_...
TOTAL_RECALL_VAPID_PUBLIC_KEY=...
TOTAL_RECALL_VAPID_PRIVATE_KEY=...

# ─── Billing (Stripe) ─────────────────────────────
TOTAL_RECALL_STRIPE_SECRET_KEY=sk_live_...
TOTAL_RECALL_STRIPE_WEBHOOK_SECRET=whsec_...
```

## Proposed Changes

### Phase C1: Auth & Config Foundation

#### [NEW] `.env.example`
Document all environment variables with comments.

#### [NEW] `src/core/env.mjs`
Centralized env loader. Reads `.env` file, validates required vars per mode, exports typed config.

#### [MODIFY] `src/core/utils.mjs`
Add env-based config override: env vars take precedence over `totalrecall.config.mjs` for secrets.

#### [NEW] `src/auth/api-key.mjs`
API key generation (`tr_live_` prefix), validation middleware, key rotation.

#### [NEW] `src/auth/oauth.mjs`
OAuth 2.1 PKCE flow for GitHub/Google. Token storage in `~/.total-recall/auth.json`.

#### [MODIFY] `bin/total-recall`
Add `login`, `logout`, `whoami`, `config set/get` commands.

---

### Phase C4: Native Notification Integrations

#### [NEW] `src/notifications/dispatcher.mjs`
Channel-based notification system. Replaces `notify.mjs` macOS-only logic.

#### [NEW] `src/notifications/channels/`
Individual channel adapters: `macos.mjs`, `webpush.mjs`, `email.mjs`, `slack.mjs`, `discord.mjs`.

#### [MODIFY] `src/coprocessor/notify.mjs`
Refactor to use dispatcher. `enqueue()` routes through channel config instead of hardcoded osascript.

#### [MODIFY] `totalrecall.config.mjs`
Add notification channel config:
```javascript
notifications: {
  channels: ['macos', 'slack'],
  slack: { webhook: process.env.TOTAL_RECALL_SLACK_WEBHOOK },
  quietHours: { start: '22:00', end: '07:00' },
}
```

## Verification Plan

### Automated Tests
- Unit tests for each notification channel (mock webhooks)
- Storage adapter interface compliance tests
- Auth flow tests (API key validation, OAuth token refresh)
- `.env` loading and precedence tests

### Manual Verification
- End-to-end: `total-recall login` → cloud sync → `total-recall search` from another machine
- Notification delivery: test each channel with real webhooks
- Billing: Stripe test mode subscription lifecycle
