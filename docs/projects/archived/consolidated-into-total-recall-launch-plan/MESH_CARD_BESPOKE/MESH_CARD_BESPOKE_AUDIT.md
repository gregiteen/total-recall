# MESH_CARD_BESPOKE — Audit

> **Project Prefix**: `MESH_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Sonnet 5.5 agent
> **Date**: 2026-10-23
> **Status**: Complete
> **Parent**: PLUGIN_CARDS_BESPOKE (Phase 4, plugin 4 of 34 after git-sentinel, stripe, system-monitor)

## Scope

`tr-plugin-mesh` (display name Headscale): `plugin.json`, `ui/card.js` (451 lines), `ui/panel.js`, `ui/DESIGN.md`, and the real output of the commands the card calls.

## Evidence gathered

- `plugin.json`: `card_layout` template `monitor` was declared and is now removed (2026-10-23T23:47Z). Exactly one `kind: card` element, `tr-mesh-card`, plus a `panel` element for token entry.
- Real `total-recall mesh status --json` returns an object with `state`, `network_available`, `control{state,verified,url}`, `enrollment{state,backend_state,hostname,ips,login_server,checked_at}` and `nodes[]`. Each node carries `hostname`, `ip`, `online`, `self`, `os`, `network_state`, `access_state`, `service_state`, `last_heartbeat`, `observed_at`, `io`, `capabilities`, `access`.
- Real `mesh doctor --json` returns, per node, `reachable`, `sshConfigured`, `sshTarget`, `runtimes[]`, `harnesses[]` and `error`.
- Real `mesh leader --json` returns `leader{hostname,ip,strategy}` and `is_current_node_leader`.
- Live fleet at audit time: 5 registered nodes plus 1 vault-only entry; macmini (self) online, cloud online and reachable, MacBook online and reachable, iphone online with no SSH login, chromebook offline with no SSH login.

## Findings

| ID | Finding | Evidence |
| --- | --- | --- |
| MS-01 | Node count falls back to a **fabricated 4**: `const count = lines.length \|\| 4` | `ui/card.js:38`. The real fleet is 5 registered nodes |
| MS-02 | `refreshTelemetry` parses the human-readable `nodes` table with a regex (`/^\d+/`) instead of reading the JSON payload | `ui/card.js:37`. Any format change silently yields the fabricated count |
| MS-03 | "Cloud Gateway" and "Local Node" are **constant strings** shown as if they were live values | `ui/card.js:15-16, 42-43`; they never reflect a real node |
| MS-04 | Status pill is hardcoded `ONLINE` in the template and set to `ONLINE` after **any** command succeeds, including a command that reports an offline mesh | `ui/card.js:86, 373` |
| MS-05 | Template defaults show "4 Nodes", "Connected", "Enrolled" before any data arrives | `ui/card.js:379-387` |
| MS-06 | The console claims "WireGuard mesh topology active" with no check behind it | `ui/card.js:410` |
| MS-07 | A hardcoded version string `v0.2.2` in the header | `ui/card.js:370` |
| MS-08 | Failure of the data read is swallowed and replaced with the same fabricated labels | `ui/card.js:46-53` |
| MS-09 | The card never shows the facts an operator needs: which node is **unreachable and why**, whether the control server is verified, who the leader is, which harnesses each node has | none of `control`, `enrollment`, `access_state`, `reachable`, `harnesses` is read |
| MS-10 | `ui/DESIGN.md` names the brand `Ghost Net` with wordmark `[GHOST//NET]` and a terminal-green palette that contradicts `plugin.json` branding (`Headscale`, `#818cf8`); the glyph-bracket wordmark is the aesthetic the invariants forbid | `ui/DESIGN.md` |
| MS-11 | Placeholder text embeds a CIDR (`100.64.0.0/10`) and the default target is the string `cloud`, an assumption about this deployment | `ui/card.js:393` |
| MS-12 | Output pane is a generic terminal console: every command renders as raw text, so the card is a command launcher, not a view of the mesh | `ui/card.js:405-411` |

## Verdict

The card is a launcher around fabricated telemetry. It would report "ONLINE", "4 Nodes" and "Connected" on a mesh that is down. It must be rewritten from the real payloads. Nothing in it is worth preserving except the logo mark, the Headscale branding in `plugin.json`, and the `host.run` calling convention.
