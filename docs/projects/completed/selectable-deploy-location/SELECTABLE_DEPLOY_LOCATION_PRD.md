# Selectable UI Deploy Location — PRD

## Problem Statement

Currently, Total Recall's UI deploy location (Cloudflare tunnel URL, custom domain, local-only) is not configurable during the install/init process. The tunnel URL is ephemeral (trycloudflare.com generates random subdomains on each restart), and there's no way for users to select their preferred deploy strategy — whether that's a Cloudflare tunnel, a custom domain, local-only access, or a static subdomain via a named Cloudflare tunnel.

This means:
- Every server restart generates a new random tunnel URL
- Users have to manually configure and remember how to start their tunnel
- The `wizard-config.json` stores stale tunnel URLs that break after restart
- There's no single command to "give me my dashboard URL"

## Goals

1. During `npx total-recall init`, let the user choose their UI deploy strategy
2. Persist the choice in config so the server/daemon can auto-start the tunnel
3. Support multiple deploy modes: local-only, quick tunnel, named tunnel, custom domain
4. Make the tunnel URL discoverable via `npx total-recall status` or similar

## Deploy Modes

| Mode | Description | URL Stability |
|------|-------------|---------------|
| `local` | No tunnel, localhost:3000 only | Static (LAN) |
| `quick-tunnel` | `cloudflared tunnel --url` (random subdomain) | Ephemeral |
| `named-tunnel` | Cloudflare named tunnel (requires auth) | Permanent |
| `custom-domain` | User provides their own domain/reverse proxy | Permanent |

## User Stories

1. **As a user running `init`**, I want to be asked how I want to access my dashboard so the system sets it up for me.
2. **As a user restarting my server**, I want the tunnel to auto-start with the same config without manual intervention.
3. **As a user**, I want a single command to see my current dashboard URL.

## Success Criteria

- [ ] `npx total-recall init` wizard includes deploy mode selection
- [ ] Deploy mode persisted in brain config
- [ ] Server auto-starts tunnel on boot if configured
- [ ] `npx total-recall status` shows current dashboard URL
- [ ] `cloudflared` dependency check during init (install prompt if missing)

## Non-Goals (v1)

- Custom SSL certificate management
- Multi-server / cluster deploy
- Docker/container deploy orchestration
