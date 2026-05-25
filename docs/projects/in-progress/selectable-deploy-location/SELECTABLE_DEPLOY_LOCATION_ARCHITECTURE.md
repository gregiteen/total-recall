# Selectable UI Deploy Location — Architecture

## Current State

### Init Flow (`src/cli/init.mjs`)
- After scaffolding the brain, init checks if `cloudflared` binary exists
- If found, automatically spawns a quick tunnel (`cloudflared tunnel --url http://localhost:3000`)
- Polls the log file for 10 seconds to extract the `*.trycloudflare.com` URL
- Saves the URL to `brainDir/config/wizard-config.json`
- **No user choice** — it's fully automatic and silent

### Deploy Flow (`src/cli/deploy.mjs`)
- Full server provisioning (Ollama, Caddy, systemd, etc.)
- Has `--domain <domain>` flag for Caddy reverse proxy config
- Handles DuckDNS dynamic DNS via `--duckdns-token`
- **Does not manage Cloudflare tunnels**

### Server (`src/server/index.mjs`)
- Binds to `127.0.0.1:3000` by default
- Reads `security.yml` for bind config (`host`, `port`, `allow_public_bind`)
- **Does not start any tunnel itself** — relies on init or manual cloudflared

### Config Files
- `brainDir/config/wizard-config.json` — stores `cfg-domain`, `cfg-api-url`, `cfg-dash-url`, `cfg-health-url`
- `brainDir/config/security.yml` — stores `bind.host`, `bind.port`
- `brainDir/config/brain.json` — stores remote brain URL and token

## Proposed Architecture

### New Config: `deploy-mode` in `wizard-config.json`

```json
{
  "deploy-mode": "quick-tunnel",
  "cfg-domain": "abc-xyz.trycloudflare.com",
  "cfg-api-url": "https://abc-xyz.trycloudflare.com",
  "cfg-dash-url": "https://abc-xyz.trycloudflare.com/dashboard",
  "cfg-health-url": "https://abc-xyz.trycloudflare.com/health",
  "tunnel-auto-start": true
}
```

### Deploy Modes

| Mode | `deploy-mode` value | What init does |
|------|-------------------|----------------|
| Local only | `local` | No tunnel. Dashboard at `http://localhost:3000/` |
| Quick tunnel | `quick-tunnel` | Auto-spawn `cloudflared tunnel --url`. Ephemeral URL. |
| Named tunnel | `named-tunnel` | Use `cloudflared tunnel run <name>`. Permanent subdomain. |
| Custom domain | `custom-domain` | User provides domain. Caddy handles TLS. |

### Init Wizard Changes

Add an interactive prompt after Step 3.6 (password setup):

```
  How would you like to access your dashboard?

    1. Local only (http://localhost:3000)
    2. Cloudflare Quick Tunnel (random public URL, changes on restart)
    3. Cloudflare Named Tunnel (permanent subdomain, requires cloudflare auth)
    4. Custom domain (you provide the domain, uses Caddy for TLS)

  Choice [1]:
```

### Server Auto-Start Tunnel

When `deploy-mode` is `quick-tunnel` or `named-tunnel` and `tunnel-auto-start` is true:
- `src/server/index.mjs` spawns `cloudflared` on boot
- Writes the URL to `wizard-config.json`
- Logs it to the server output

### CLI: `npx total-recall status`

New subcommand that prints:
- Server health
- Current deploy mode
- Current dashboard URL
- Tunnel PID (if running)

## Files to Modify

| File | Change |
|------|--------|
| `src/cli/init.mjs` | Add interactive deploy mode prompt, refactor tunnel spawner |
| `src/server/index.mjs` | Add tunnel auto-start on boot based on config |
| `src/cli/deploy.mjs` | Wire `--domain` to `deploy-mode: custom-domain` in wizard-config |
| `bin/total-recall.mjs` | Add `status` subcommand |
| NEW: `src/cli/status.mjs` | Implement status command |
