# PLUGIN_P2P — PRD

> **Project Prefix**: `PLUGIN_P2P`
> **Date**: 2026-09-22
> **Audit**: [PLUGIN_P2P_AUDIT.md](PLUGIN_P2P_AUDIT.md)

## 1. Problem

Plugins are meant to let one Total Recall install be shaped for a particular use — a developer's workstation, a research desk, an ops box — by adding memory categories, compiled context, CLI commands, and scheduled jobs. Today (audit §2–§6):

- The discovery surface is a storefront of **invented ratings, review counts, install counts and "verified" badges**.
- **0 of 6** catalog entries install on a fresh machine.
- There is **no direct way for different Total Recall users to share a plugin over the public internet**. A private mesh connects one user's own devices and does not meet this goal.
- Declared `tasks` never run; the dashboard runner can **kill the brain server**.

## 2. Goals

1. **Honest** — every value shown about a plugin is a fact the local node can verify: its manifest, where it came from, its content hash, which peer offers it, whether that peer is online right now. No ratings, reviews, install/download counts, popularity sorting, or "verified" badges anywhere (REST, CLI, JSON, UI).
2. **Person-to-person** — a user explicitly publishes a plugin bundle at their public HTTPS origin and sends a hash-pinned link to another Total Recall user. The recipient verifies the content hash before installing. No central catalog or shared mesh is required.
3. **Customization by use** — manifests declare the `use_cases` they are for; list/search/UI can filter by use case. Bundled plugins ship inside the npm package so they are installable everywhere.
4. **Everything declared works** — `tasks` actually run on schedule; anything that cannot be wired is removed from the schema rather than displayed.
5. **Safe** — plugin code never runs inside the server process; execution needs a write scope; no caller-chosen filesystem roots.

## 3. Scope

### In scope
- Delete `CURATED_CATALOG`, ratings endpoint/storage/UI, star components, rating sorts, fake fallbacks.
- Plugin sources: `bundled` (shipped in package `plugins/`), direct HTTPS share link, optional `peer:<host>/<id>` for one user's own mesh, git URL, local path/link.
- Public bundle endpoint exposes only plugins explicitly opted in for public sharing. Existing mesh-only share records stay private.
- Mesh endpoints serving a node's mesh-shared plugins (listing + content bundle) behind `requireMeshSyncAuth` remain an optional own-device convenience.
- Local endpoint aggregating peers' shared plugins with real per-peer reachability.
- Content hashing (SHA-256 over a canonical file list) verified on peer install.
- Share/unshare + install/remove recorded as SSSS VFS `plugin_record` documents and `event` envelopes.
- Scheduled plugin tasks (5-field cron) executed from the daemon loop in a child process.
- Out-of-process runner with timeout and output cap.
- Move plugin dirs under `skills/total-recall/plugins/` (layout invariant). No migration: zero external installs.
- Fix audit defects §6.1–§6.8.
- `use_cases` manifest field, CLI `--use-case`, UI filter.
- Dashboard page rewritten to: Installed / Bundled / On the mesh, with a public share link in installed-plugin details.

### Out of scope
- A central marketplace, ratings or reviews (explicitly rejected).
- Publisher identity/signatures. The direct link pins content bytes but does not attest who wrote the code.
- UltraChat marketplace projections (UltraChat owns hosted marketplace).

## 4. Success criteria (verifiable)

| # | Criterion | Verify with |
|---|---|---|
| S1 | No rating/review/install-count/verified fields remain in plugin code paths | `grep -rniE "rating|reviewCount|installCount|verified" src/server/routes/plugins.mjs src/cli/plugin frontend/src/pages/PluginsPage.tsx frontend/src/api/plugins.ts` → no matches |
| S2 | Every bundled plugin installs on a clean project | `plugin install <id>` for each id in `plugin available` succeeds in a temp dir (spec) |
| S3 | A plugin explicitly shared by user A is installable by user B using a direct HTTPS link, without a common mesh | public route + installer specs; live public-host check |
| S4 | Tampered peer bundle is rejected | spec: hash mismatch → 4xx, nothing written |
| S5 | A plugin calling `process.exit` via `/run` does not stop the server | spec |
| S6 | A manifest task with `schedule` runs its `command` when due, once per minute slot | spec |
| S7 | Share / install / remove produce `plugin_record` docs + events through the Core Contract | spec |
| S8 | Full vitest suite green; `node src/server/index.mjs` boots | test skill / boot check |

## 5. Prioritization (TR framework)

1. Data safety / stability — runner isolation (§6.1), const crash (§6.5), atomic installs.
2. Honesty — remove fabricated data (user's explicit ask).
3. P2P distribution.
4. Tasks execution, use-case customization.
5. UI polish.

## 6. Dependencies & risks

- Public sharing requires an externally reachable HTTPS origin configured in `TR_PUBLIC_BASE_URL`. If absent, the plugin can be marked shared but no public link is offered.
- Installing a public link blocks private or mixed DNS destinations, custom ports, credentials, redirects, oversized bundles, and missing or mismatched hash pins.
- Executable plugin code runs with the recipient's process permissions after explicit installation. Users must trust the sender and inspect the plugin's code.
- Mesh sync token (`TR_MESH_SYNC_TOKEN`) remains necessary only for optional own-device mesh browsing.
- Peers running an older Total Recall return 404 for the new routes → reported per peer as "does not serve plugins (older version)".
- Host is memory constrained (8 GB); tests run on the Mac mini per standing rule.
