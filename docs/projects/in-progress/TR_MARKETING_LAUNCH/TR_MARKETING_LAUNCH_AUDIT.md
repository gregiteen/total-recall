# TR_MARKETING_LAUNCH — Audit

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Audit Status**: Complete
> **Audited commit**: d7fc0bc16f0c9c6b4d2a15f0b81031e410d7e423

---

## Process note

In commit `d03adb1`, the initial project pass violated the `/project-management` audit-first invariant (`section-06.md` and `section-09.md`):
1. **Premature Document Generation:** The initial pass created a shallow 140-line `TR_MARKETING_LAUNCH_AUDIT.md` and simultaneously generated `PRD`, `ARCHITECTURE`, `DEVELOPMENT_PLAN`, `PROJECT_TRACKER`, `VIBEBRAIN_MARKETING_MANIFEST.md`, and `VIRAL_LAUNCH_ASSETS.md`, marking all project phases complete before inspecting the 32 installed plugins, the Software Factory (`src/cli/new.mjs`, `src/core/plugin-vendor.mjs`), the visual card runtime (`frontend/src/components/plugins/card/CardEngine.tsx`), or the multi-device mesh and daemon architecture.
2. **Temporary Embedding Bypass (Resolved):** During the initial surface compile, `TR_EMBEDDINGS_DISABLED=1` was passed instead of executing the full local and cloud Ollama `nomic-embed-text:latest` vector build. This was remediated in commit `d7fc0bc`, embedding all `926/926` canonical nodes at zero cost via `nomic-embed-text:latest` (`768` dimensions).
3. **Reductionist Product Framing:** The initial pass framed Total Recall narrowly as "memory for vibe coding," omitting that Total Recall is an integrated **Autonomous Software Factory and Multi-Interface Daily Driver** combining 32 visual and CLI plugins, SSSS memory, deterministic rules, encrypted secrets, zero-cost bundled embeddings, adaptive self-learning (`dream`, `proposals`, `skill-manager`, `composable-cli`), and automatic multi-device mesh synchronization.

**Reconciliation:** The two non-standard extra files (`VIBEBRAIN_MARKETING_MANIFEST.md` and `VIRAL_LAUNCH_ASSETS.md`) have been removed. This document replaces the superficial initial audit with an exhaustive process, codebase, plugin-ecosystem, and market-research audit. All downstream documents (`PRD`, `ARCHITECTURE`, `DEVELOPMENT_PLAN`, and `PROJECT_TRACKER`) are revised from the findings (`A-001` through `A-012`) established below.

---

## 1. Scope and method

- **Request being audited:** Establish a comprehensive process and product audit of Total Recall, its 32-plugin ecosystem, its Software Factory and Daily Driver capabilities, and the 2026 agentic development market in order to ground the brand vision, naming strategy, product promise, trust architecture, and launch roadmap.
- **Repositories and paths in scope:**
  - Core CLI and Software Factory: `bin/total-recall.mjs`, `bin/total-recall-memory.mjs`, `src/cli/new.mjs`, `src/cli/init.mjs`, `src/cli/connect.mjs`, `src/cli/plugin.mjs`, `src/cli/rebuild.mjs`, `src/cli/update.mjs`, `src/cli/command.mjs`.
  - Core Runtime, Memory, Embeddings, and Adaptive Learning: `src/core/surface.mjs`, `src/core/embeddings.mjs`, `src/core/ollama-embeddings.mjs`, `src/core/default-plugins.mjs`, `src/core/scaffold-plugins.mjs`, `src/core/plugin-vendor.mjs`, `src/core/plugin-loader.mjs`, `src/core/plugin-store.mjs`, `src/core/daemon-loop.mjs`, `src/core/dream.mjs`.
  - Visual Dashboard and Confined Card Engine: `frontend/src/pages/PluginsPage.tsx`, `frontend/src/components/plugins/card/CardEngine.tsx`, `frontend/src/components/plugins/PluginPanel.tsx`.
  - Installed Plugin Ecosystem (32 plugins): `.agent/skills/total-recall/plugins/*` (29 project-scoped plugins), `~/.agent/skills/total-recall/plugins/*` (32 global-scoped plugins), `scaffold/.agent/skills/total-recall/plugins/*` (9 default scaffolded plugins), and sibling repositories `/Users/gregoryiteen/github/tr-plugin-*` plus `/Users/gregoryiteen/tr-plugin-embeddings`.
  - Public Documentation and Onboarding Surfaces: `README.md`, `package.json`, `docs/ARCHITECTURE.md`, `docs/SSSS.md`, `docs/reference/CLI_INVENTORY.md`, `docs/reference/legacy-product-readme.md`, `templates/openwiki/`, `scaffold/openwiki/`.
- **Out of scope:**
  - Modifying private business data or credentials inside encrypted stores (`config/secrets.enc`).
  - Unauthorized production deployments prior to completing the full batch of requested work (`preferences-a985cc77`).
- **Audit method:**
  - Read whole files for core entrypoints (`package.json`, `README.md`, `src/core/default-plugins.mjs`, `src/core/scaffold-plugins.mjs`, `src/cli/new.mjs`, `src/core/plugin-vendor.mjs`, `src/core/surface.mjs`, `src/core/embeddings.mjs`, `src/core/ollama-embeddings.mjs`, `src/cli/rebuild.mjs`, `frontend/src/components/plugins/card/CardEngine.tsx`, `scripts/sync-scaffold-plugins.mjs`).
  - Executed `node bin/total-recall.mjs plugin library --json` and `node bin/total-recall.mjs composable-cli library --json`, plus filesystem manifest and asset inspection across all 32 installed plugins.
  - Executed `node bin/total-recall.mjs mesh status`, `node bin/total-recall.mjs embeddings status`, `node bin/total-recall.mjs openwiki status`, `node bin/total-recall.mjs openwiki hubs`, `node bin/total-recall.mjs doctor`, `node scripts/sync-scaffold-plugins.mjs --check`, and `node bin/total-recall.mjs mesh exec 100.64.0.1 "curl -s http://127.0.0.1:11434/api/tags"`.
  - Conducted web research on 2026 vibe coding maturity, autonomous software factories, agent operating systems, and local-first multi-device agent workbenches.

---

## 2. Inventory

### Core Repository & Artifact Inventory

| Area | Path | Size / Count | Authored / Generated | Tracked in Git |
|---|---|---|---|---|
| Package Manifest | `package.json` | 123 lines (v3.40.2) | Authored | Yes |
| Primary Public README | `README.md` | 71 lines (3.4 KB) | Authored | Yes |
| Legacy Product README | `docs/reference/legacy-product-readme.md` | 158 lines (6.2 KB) | Authored | Yes |
| Main CLI Entrypoint | `bin/total-recall.mjs` | 13.8 KB | Authored | Yes |
| Memory CLI Entrypoint | `bin/total-recall-memory.mjs` | 4.2 KB | Authored | Yes |
| Software Factory CLI | `src/cli/new.mjs` & `src/core/plugin-vendor.mjs` | 131 lines & 237 lines | Authored | Yes |
| Surface Compiler | `src/core/surface.mjs` | 868 lines | Authored | Yes |
| Embeddings Engine | `src/core/embeddings.mjs` & `src/core/ollama-embeddings.mjs` | 719 lines & 313 lines | Authored | Yes |
| Dashboard Plugin Page | `frontend/src/pages/PluginsPage.tsx` | 1,265 lines | Authored | Yes |
| Confined Card Engine | `frontend/src/components/plugins/card/CardEngine.tsx` | 115 lines | Authored | Yes |
| Default Scaffold Plugins | `scaffold/.agent/skills/total-recall/plugins/` | 9 plugins (209 pinned files) | Generated via `sync:scaffold-plugins` | Yes |
| Compiled Agent Surface | `INSTRUCTIONS.md`, `GEMINI.md`, `CLAUDE.md`, `AGENTS.md` | ~25.7 KB | Generated via `compile` | Yes |

### Complete 32-Plugin Ecosystem Inventory (`total-recall plugin library --json` + Filesystem Audit)

Total Recall hosts **32 active plugins** exposing **345 CLI operations**, **8 scheduled daemon tasks**, **10 embedded skill routers**, **29 bespoke visual `ui/card.js` interfaces**, and **11 `ui/panel.js` workspaces**:

| # | Plugin ID | Version | Tier / Role | CLI Ops | `ui/card.js` | `ui/panel.js` | Key Capabilities |
|---|---|---|---|---|---|---|---|
| 1 | `auth` | `1.0.1` | Default Core (9) | 12 | Yes (7,639 B) | Yes (15,538 B) | Hardware FIDO2 WebAuthn passkeys, Google OAuth, encrypted `secrets.enc` store (`secret list\|get\|set\|rotate\|remote deploy`), scoped keys |
| 2 | `mesh` | `0.2.2` (proj) / `0.2.1` (glob) | Default Core (9) | 21 | Yes (4,164 B) | Yes (2,454 B) | Headscale control server provisioning (`server init`), Tailscale SSH/exec, node discovery, peer file transfer, grant policies |
| 3 | `openwiki` | `0.1.1` | Default Core (9) | 6 | Yes (8,544 B) | Yes (16,771 B) | Multi-repo knowledge graph and Markdown wiki engine (`status`, `probe`, `hubs`, `ingest`) |
| 4 | `composable-cli` | `0.2.1` | Default Core (9) | 14 | Yes (8,352 B) | No | Dynamic agent command composition (`create`, `read`, `update`, `test`, `promote`, `rollback`, `library`) |
| 5 | `cli-agents` | `0.2.0` | Default Core (9) | 17 | Yes (2,920 B) | No | Discover, configure, maintain official docs, and dispatch terminal coding agents across mesh nodes |
| 6 | `code-quality` | `0.2.1` | Default Core (9) | 8 | Yes (8,211 B) | No | Fail-closed deterministic code-quality gates, snapshots, lint rules, and test compliance reports |
| 7 | `security` | `0.3.1` | Default Core (9) | 22 | Yes (9,307 B) | Yes (9,459 B) | Device and fleet security assessments (macOS, Linux, Windows, Android, iOS, Chromebook), encryption, site-shield, bot-mitigate |
| 8 | `embeddings` | `0.1.0` | Default Core (9) | 7 | **No (0 B)** | **No (0 B)** | Local and mesh Ollama embedding management (`status`, `models`, `pull`, `benchmark`, `coverage`) |
| 9 | `git-sentinel` | `1.2.1` | Default Core (9) | 4 | Yes (8,269 B) | No | Worktree hygiene, branch inspection, unpushed commit detection, and stash tracking |
| 10 | `deploy` | `0.2.0` | Brick / Ops | 13 | Yes (11,697 B) | Yes (7,315 B) | Zero-downtime multi-provider blue/green staging, traffic switching, rollback, and resource optimization |
| 11 | `domains` | `0.3.1` | Brick / Ops | 53 | Yes (10,003 B) | No | Unified Vercel DNS management, domain search/purchase/renewal, TLS certs, Mailcow mailboxes, SPF/DKIM alignment |
| 12 | `stripe` | `0.1.2` | Brick / Commerce | 9 | Yes (9,067 B) | Yes (7,375 B) | Checkout sessions, payment intents, refunds, and webhook verification |
| 13 | `tickets` | `0.1.1` | Brick / Commerce | 11 | Yes (9,518 B) | No | Tiered event tickets, inventory holds, reservations, double-entry QR passes, and check-in scanning |
| 14 | `phone` | `0.1.1` | Brick / Comms | 15 | Yes (7,552 B) | No | Telephony, direct line inventory, dialer sessions, voicemails, call routing, and compliance |
| 15 | `phone-companion` | `0.3.1` | Brick / Mobile | 6 | Yes (8,321 B) | No | Mobile companion push pairing, notification broadcast, and receiver scaffold |
| 16 | `text` | `0.1.1` | Brick / Comms | 11 | Yes (8,575 B) | No | Direct SMS/MMS messaging, number pooling, threads, history, and verification |
| 17 | `signing` | `0.3.1` | Brick / Commerce | 6 | Yes (9,087 B) | No | Digital agreement signing engine with automated workflows and SSSS audit lifecycle events |
| 18 | `design` | `0.2.1` | Brick / Creative | 6 | Yes (7,485 B) | No | Design system synthesis, canonical `DESIGN.md` token inspection, CSS and Tailwind generation |
| 19 | `image-generator` | `0.2.1` | Brick / Creative | 4 | Yes (8,015 B) | No | Visual asset studio for brand imagery, vector graphics, and UI assets |
| 20 | `sticker-generator`| `1.0.1` | Brick / Creative | 9 | Yes (4,093 B) | Yes (7,084 B) | 300 DPI sticker generation, upscaling, cutlines, quotes, and fulfillment order submission |
| 21 | `creative-search` | `2.1.1` | Brick / Research | 10 | Yes (9,125 B) | No | SearXNG-powered metasearch (`csearch`) with categories, deep research, and memory integration |
| 22 | `decision` | `0.2.1` | Brick / AI Logic | 7 | Yes (8,346 B) | No | Typed decisions (`choice`, `binary`, `rank`) with confidence gates, fallbacks, and SSSS records |
| 23 | `dsh` | `1.1.1` | Brick / Harness | 8 | Yes (8,580 B) | No | DeepSeek Harness runtime state, sessions, tools, models (`deepseek/deepseek-v4.1-flash`), and plugins |
| 24 | `hermes` | `0.1.0` | Brick / Harness | 8 | **No (0 B)** | Yes (654 B) | Hermes Agent runtime monitoring, messaging gateway supervision, and skill bridging |
| 25 | `maps` | `0.1.1` | Brick / Geo | 9 | Yes (8,257 B) | Yes (9,811 B) | Geocoding, reverse geocoding, places search, and routing |
| 26 | `okf` | `0.1.1` | Brick / Standard | 6 | Yes (8,233 B) | Yes (2,975 B) | Open Knowledge Framework schema validation and portable memory exchange |
| 27 | `operator-alerts` | `1.1.1` | Brick / Ops | 6 | Yes (8,009 B) | No | Alert dispatcher (`alerts`) across desktop notifications, SMS, and webhooks with quiet hours |
| 28 | `skill-manager` | `1.2.1` (proj) / `1.1.0` (glob) | Brick / Adaptive | 7 | Yes (8,177 B proj / **No glob**) | No | Conservative skill optimization and routing across authorized daemon nodes |
| 29 | `system-monitor` | `1.2.1` | Brick / Ops | 4 | Yes (8,104 B) | No | Host CPU load and memory telemetry with real-time resource sampling |
| 30 | `tr-transcribe` | `0.2.1` | Brick / Media | 4 | Yes (7,783 B) | No | Speech-to-text audio file transcription with word-level timestamps |
| 31 | `translator` | `0.1.1` | Brick / Media | 8 | Yes (8,203 B) | Yes (3,031 B) | Automated multi-locale translation pipeline emitting SSSS mutation envelopes |
| 32 | `user-automations` | `1.0.1` | Brick / Ops | 3 | Yes (7,917 B) | No | Lists installed scheduled plugin tasks and node availability across the mesh |

---

## 3. Runtime surface

### Core CLI & Software Factory Commands (`bin/total-recall.mjs`)
| Command | Handler Path | Purpose & Operational Mechanics |
|---|---|---|
| `total-recall new <name> [--with ids]` | `src/cli/new.mjs:96` | **The Software Factory:** Calls `@gregiteen/ssss-cli new <dir> --with-total-recall`, initializes the project brain, wires the chosen agent surface, vendors requested plugins into `bricks/` (`tr-bricks.json`) with transitive `requires`, and provisions a dedicated Headscale mesh server (`mesh server init`). Shipped apps own their code with zero runtime dependency on Total Recall. |
| `total-recall plugin vendor <id>` | `src/core/plugin-vendor.mjs:170` | Copies a plugin and its `requires` graph into `<project>/bricks/<id>` with `.plugin-source.json` provenance and SHA-256 drift tracking (`listBricks`). |
| `total-recall context "<task>" --action <a>` | `src/cli/context.mjs:1` | **Deterministic Governance:** Emits the required-rule capsule (`ready:true`) before any agent action; exits `2` (fail-closed) when required rules exceed the token budget. |
| `total-recall remember / forget / edit / recall` | `src/cli/remember.mjs`, `src/cli/recall.mjs` | Validated SSSS vault write and hybrid local search (TF-IDF + SQLite VSS 768-dim `nomic-embed-text:latest` vectors). |
| `total-recall compile / rebuild` | `src/cli/rebuild.mjs:81`, `src/core/surface.mjs:689` | Rebuilds `INSTRUCTIONS.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, skill injections, JSONL indexes, and SQLite vector embeddings. Triggered automatically on CLI and plugin changes (`every-cli-addition-auto-compiles`). |
| `total-recall dream` & `proposals` | `src/core/dream.mjs:508`, `src/cli/proposals.mjs` | **Self-Learning Engine:** Consolidates episodic session history, detects rule conflicts, prunes stale nodes, and generates reviewable optimizer proposals. |
| `total-recall update --all-brains --apply` | `src/cli/update.mjs` | Propagates Total Recall and `@gregiteen/ssss-cli` updates across every registered consumer and mesh node, recompiling all surfaces. |
| `total-recall harness` & `agent` | `src/cli/harness.mjs`, `src/cli/agent.mjs` | Meta-harness quota tracking, multi-agent council, and cross-mesh agent process spawning/supervision. |

### Web Dashboard & Confined UI Runtime (`src/server/index.mjs`, `frontend/src/`)
- Port `3000` serves the full Total Recall API and React/Preact dashboard (`frontend/src/pages/PluginsPage.tsx`).
- `CardEngine.tsx` (`lines 99–115`) and `PluginPanel.tsx` render each plugin's `ui/card.js` and `ui/panel.js` inside a scripts-only sandboxed iframe with an opaque origin, communicating solely via `host.run(subcommand, args)` restricted to manifest-declared commands.

### Scheduled Jobs & Background Processes (`src/core/daemon-loop.mjs`)
- The cloud node (`100.64.0.1`) runs the background Total Recall daemon, executing scheduled plugin tasks (`creative-search`, `dsh`, `mesh`, `skill-manager`, `system-monitor`, `cli-agents`, `hermes`), automatic documentation refresh (`cli-agents maintenance`), and idle Dream consolidation.

---

## 4. Data and state

| State | Location | Format | Writer | Personal Data? | Deployed / Synced? |
|---|---|---|---|---|---|
| Project Memory Vault | `<repo>/.agent/skills/total-recall/memory-vault/` | SSSS Markdown (`.md`) | CLI / API (`memory-ops.mjs`) | No (project rules/facts) | Tracked per repo policy |
| Global Memory Vault | `~/.agent/skills/total-recall/memory-vault/` | SSSS Markdown (`.md`) | CLI / API (`memory-ops.mjs`) | Operator rules & facts | Separate per device (`invariants-072a305a`) |
| Derived Vector Index | `<brain>/memory-derived/embeddings.db` | SQLite + `sqlite-vss` (768 dims) | `src/core/embeddings.mjs` | Derived vectors | Disposable local projection (`invariants-55b934b4`) |
| Encrypted Secrets | `<brain>/config/secrets.enc` | AES-encrypted store | `total-recall auth secret` | Yes (credentials/keys) | Deployed explicitly via `auth secret remote deploy` |
| Vendored App Bricks | `<app>/bricks/<id>/` & `tr-bricks.json` | Source files + SHA-256 manifest | `total-recall plugin vendor` | No | Owned by target project |
| OpenWiki Hubs | `<repo>/openwiki/` or `docs/` | Markdown (`.md`) | Developer / Agent + `openwiki ingest` | No | Indexed into project vault |

---

## 5. Integrations

- **Zero-Cost Local & Cloud Embeddings (`src/core/ollama-embeddings.mjs`):**
  - Resolves `TR_OLLAMA_URL` / `OLLAMA_HOST`, then local loopback `http://127.0.0.1:11434`, then mesh discovery (`lines 82–108`).
  - Verified live on both the Mac mini (`127.0.0.1:11434`) and the Cloud mesh node (`100.64.0.1:11434`): serving `nomic-embed-text:latest` (`137M` parameters, `F16`, `768` dimensions, `capabilities: ["embedding"]`) at zero cost.
- **Mesh Control Plane (`tr-plugin-mesh`):**
  - Connected to `https://headscale.ultrachat.app` (`state: verified`).
  - Active enrolled nodes: `macmini.mesh.ultrachat.app` (`100.64.0.2`, self), `cloud.mesh.ultrachat.app` (`100.64.0.1`, online, port `3900`), `gregs-macbook-pro.mesh.ultrachat.app` (`100.64.0.6`, online, port `3000`), `iphone.mesh.ultrachat.app` (`100.64.0.7`, online), `chromebook.mesh.ultrachat.app` (`100.64.0.4`, offline).
- **Composable Commands (`total-recall composable-cli library --json`):**
  - 4 global composed verbs active: `code-quality-check`, `code-quality-report`, `m4-image-prune`, `tr-first`.

---

## 6. Security and privacy

- **Credential Isolation:** All credentials reside exclusively in `secrets.enc` managed through `total-recall auth secret`. No raw keys exist in git, vault Markdown, OpenWiki pages, or compiled instruction surfaces.
- **Iframe Confinement:** Plugin visual cards (`ui/card.js`) and workspaces (`ui/panel.js`) execute inside sandboxed scripts-only frames without DOM/storage access to the host dashboard (`README.md:41-44`, `CardEngine.tsx`).
- **Open-Source Visibility Policy (`invariants-f33a3be3`):** Only `total-recall` and `ssss` are public on GitHub; individual `tr-plugin-*` repositories remain private unless explicitly vendored or shared peer-to-peer (`preferences-80788c7b`, `preferences-8b00a499`).

---

## 7. Standing-rule conflicts

| Rule (source) | Conflict / Gap Found | Evidence | Finding ID |
|---|---|---|---|
| `project-management` (`section-06.md`) | Initial pass created PRD, Architecture, Dev Plan, and Tracker before completing a deep codebase/plugin audit | Commit `d03adb1` | `A-001` |
| `invariants-1933916a` & `plugin-purpose-ui-required` | Every installed plugin must have a bespoke functional `ui/card.js` in its repo; `embeddings` (`v0.1.0`) and `hermes` (`v0.1.0`) lack `ui/card.js` | `~/.agent/skills/total-recall/plugins/embeddings` (`card:false`), `tr-plugin-hermes` (`card:false`) | `A-002` |
| `invariants-5d8df45d` | Always work inside `/Users/gregoryiteen/github`; `tr-plugin-embeddings` lives at `/Users/gregoryiteen/tr-plugin-embeddings` outside `github/` | `ls -d /Users/gregoryiteen/tr-plugin-embeddings` | `A-003` |
| `all-plugins-every-repo-default` | Default 9 plugins must be present in both global and project brains; `.agent/skills/total-recall/plugins/` in `total-recall` has 29 plugins but is missing symlinks for `cli-agents` and `embeddings` (and `hermes`) | `ls .agent/skills/total-recall/plugins/` | `A-004` |
| `automatic-tr-ssss-updates-everywhere` | Global plugin directory `~/.agent/skills/total-recall/plugins/` has stale copied directories for `mesh` (`v0.2.1` vs `v0.2.2`) and `skill-manager` (`v1.1.0` without `ui/card.js` vs `v1.2.1` with `ui/card.js`) | Filesystem manifest comparison across roots | `A-005` |
| `every-cli-addition-auto-compiles` | `scripts/sync-scaffold-plugins.mjs --check` failed (exit 1) due to unsynced `cli-agents/src/setup.mjs` in `scaffold/` | `node scripts/sync-scaffold-plugins.mjs --check` (fixed in this pass) | `A-006` |
| `no-cursor-or-windsurf-mentions` | Historical docs (`docs/IDE_INTEGRATION.md`, `docs/reference/legacy-product-readme.md:33`, `templates/openwiki/ide.md:6`, `scaffold/openwiki/ide.md:6`) contain prohibited competitor IDE strings | `grep -rnI` across `docs/`, `templates/`, `scaffold/` | `A-007` |
| `preferences-e415549e` | Never end sentences with prepositions in Greg's site/document copy or replies | Previous assistant reply ended with a preposition | `A-008` |

---

## 8. Quality baseline

- **Host and environment:** Mac mini (`Darwin arm64`, 10 cores, 16 GB RAM), commit `d7fc0bc16f0c9c6b4d2a15f0b81031e410d7e423`.
- **Directly executed verification commands and outputs:**
  - `npm run check:package`: Passed (`{"ok":true,"version":"3.40.2","files":850,"memoryFiles":78,"compatiblePluginScaffold":true,"unpackedBytes":11206056}`).
  - `npm run check:dist`: Passed (`Dashboard bundle is current`).
  - `node scripts/check-scaffold-state.mjs`: Passed (`shipped scaffold carries no per-brain state`, `no self-dependency on total-recall-brain`).
  - `npm run check:ssss-registry`: Passed (`ssss-registry: OK — spec 0.9, integrity matches lock`).
  - `node scripts/sync-scaffold-plugins.mjs --check`: Initially exited `1` (`updated cli-agents/src/setup.mjs`); executed `node scripts/sync-scaffold-plugins.mjs` to sync `209` pinned files across the 9 default plugins (`auth, mesh, openwiki, composable-cli, cli-agents, code-quality, security, embeddings, git-sentinel`), then re-verified `--check` with `0` changes (exit `0`).
  - `node bin/total-recall.mjs compile`: Passed (`Processed 926 canonical memory nodes`, `Injected memory into 13 skill files`, `Embeddings: 926 built, 0 unchanged`, `0 drift`).
  - `node bin/total-recall.mjs embeddings status`: Passed (`endpoint: http://127.0.0.1:11434 (reachable)`, `model: nomic-embed-text:latest (768 dims)`, `926` embedded).

---

## 9. Debt and dead code

1. **Public Positioning Debt (`README.md` & `package.json`):**
   - `package.json:4` describes the system as `"Portable SSSS memory, local retrieval and task instructions with explicit plugin loading"`, and `keywords` (`package.json:64-69`) lists only `["ai", "ssss", "memory", "local-llm"]`.
   - `README.md` (71 lines) reads like an internal migration note rather than a category-defining product launch page. It never mentions the **Software Factory** (`total-recall new <name> --with <bricks>`), the **Daily Driver** multi-interface workflow, the **9 default runtime plugins**, the **23 functional brick plugins**, the **visual animated JS cards**, the **zero-cost bundled Ollama embeddings**, or the **automatic multi-device mesh sync and Dream learning loop**.
2. **Scaffold OpenWiki Template Debt (`templates/openwiki/ide.md` & `scaffold/openwiki/ide.md`):**
   - Both files still contain the prohibited IDE name on line 6, and `templates/openwiki/secrets.md` references `"future CLI ... TR_CORE_FOCUS Phase 4"` even though `total-recall auth secret` is already shipped and active (`v1.0.1`).
3. **Plugin Root Drift:**
   - Global `~/.agent/skills/total-recall/plugins/` contains non-symlinked copies of 29 plugins (allowing version drift on `mesh` and `skill-manager`), whereas project `.agent/skills/total-recall/plugins/` uses symlinks to `/Users/gregoryiteen/github/tr-plugin-*` for 28 plugins but omits `cli-agents`, `embeddings`, and `hermes`.

---

## 10. Deploy and operations

- **Package & Consumer Propagation:** Total Recall publishes to npm as `total-recall-brain` and propagates across all registered local brains and remote mesh nodes (`100.64.0.1` cloud, `100.64.0.6` MacBook Pro) via `total-recall update --all-brains --apply` (`every-release-propagates-everywhere`).
- **Deployment Batch Rule (`preferences-a985cc77`):** Hold any remote deploy until the entire batch of requested work is finished, verified, and approved.

---

## 11. Content, Market Research, and Product Fit

### Why Competitors Fail in Late 2026 (Evidence from Web & Vault Research)
1. **The Vibe Coding Trap & Context Amnesia:** While 90%+ of developers generate code via prompts (Karpathy, 2025–2026), stateless coding agents suffer from severe context rot, rule amnesia, and hallucinated rewrites across sessions.
2. **Fragmentation Between "Prototyping Toys" and "Enterprise Factories":** The 2026 market split into consumer zero-to-one toys (which break in production) and heavyweight cloud "Software Factories" (Factory 2.0, Devin Teams) that charge per seat/token, lock intellectual property inside third-party clouds, and force developers into a single proprietary UI.
3. **The Local-First Multi-Device Bottleneck:** Developers want local-first agent workbenches with MCP/plugin extensibility, but existing local tools fail at multi-device synchronization, secret distribution, and cross-machine agent orchestration.

### What Total Recall Actually Is (The Category-Defining Truth)
Total Recall is **both the Autonomous Software Factory AND the Personal Daily Driver**:
1. **Everything Automatically Managed Across Every Device:** Memory, rules, instructions, skills, plugins, and encrypted secrets synchronize across your Mac mini, MacBook, Linux cloud server, and phone over your own private Headscale mesh.
2. **Bundled Zero-Cost Embeddings:** Ships with `tr-plugin-embeddings` driving `nomic-embed-text:latest` (768 dimensions) on your local machine or cloud mesh node at zero API cost.
3. **32 Visual & Fully Functional Plugins (Tools + App Bricks):**
   - Use them **directly as your Daily Driver workbench** (via CLI, any coding agent, or bespoke interactive JS cards/panels in the dashboard).
   - Or **vendor them into any new project as owned bricks** (`total-recall new my-app --with auth,stripe,domains,phone,tickets,deploy`), turning weeks of integration work into a 10-second command with zero runtime lock-in.
4. **Adaptive Self-Learning Brain:** The system learns how you work—recording decisions, consolidating memories during the background `dream` cycle, proposing skill optimizations (`proposals`, `skill-manager`), and letting agents compose new CLI commands (`composable-cli`) that auto-compile into every agent surface immediately.
5. **Any Interface, Zero Friction:** Whether you type in a terminal, dispatch Claude Code / Codex / Gemini / Hermes / DSH, click inside the visual Web Dashboard, or check your mobile companion, every rule, secret, memory, and plugin is in the exact place where you need it.

---

## 12. Findings register

| ID | Severity | Evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|
| `A-001` | `P0-critical` | Commit `d03adb1` generated PRD/Arch/Plan/Tracker before completing a deep codebase and plugin audit | Violates `/project-management` First Rule; produced a superficial framing of Total Recall | Replace with this exhaustive audit first, then revise PRD, Architecture, Dev Plan, and Tracker from these findings | Fix in this project |
| `A-002` | `P0-critical` | `README.md` (71 lines) and `package.json` describe only a basic memory CLI, hiding the Software Factory (`new`/`vendor`), the 32 visual/functional plugins, bundled zero-cost embeddings, self-learning Dream loop, and automatic multi-device mesh | Massive underselling of the product; fails to capture the "Software Factory + Daily Driver" category | Design the complete brand vision, naming architecture, promise, trust pillars, and launch assets around the full unified system | Fix in this project |
| `A-003` | `P1-high` | `scripts/sync-scaffold-plugins.mjs --check` failed (exit 1) due to drift in `cli-agents/src/setup.mjs` | Breaks scaffold freshness check | Run `node scripts/sync-scaffold-plugins.mjs` and verify zero drift (completed during audit) | Fixed in this pass |
| `A-004` | `P1-high` | `templates/openwiki/ide.md:6` and `scaffold/openwiki/ide.md:6` contain prohibited competitor IDE strings; `templates/openwiki/secrets.md` calls `auth secret` a "future CLI" | Violates `no-cursor-or-windsurf-mentions` and misleads new users about shipped `auth secret` capabilities | Update `templates/openwiki/` and `scaffold/openwiki/` to reflect current shipped commands and remove prohibited IDE references | Fix in this project |
| `A-005` | `P1-high` | `embeddings` (`v0.1.0`) and `hermes` (`v0.1.0`) lack bespoke `ui/card.js` files (`invariants-1933916a`) | Incomplete visual card coverage across the 32-plugin showcase | Track visual card completion in the launch readiness plan so every showcased plugin renders a bespoke functional card | Fix in this project |
| `A-006` | `P1-high` | `/Users/gregoryiteen/tr-plugin-embeddings` resides outside `/Users/gregoryiteen/github/`, and `cli-agents`, `embeddings`, `hermes` are missing from `.agent/skills/total-recall/plugins/` in this repo | Inconsistent plugin pathing and project/global brain parity (`invariants-5d8df45d`, `all-plugins-every-repo-default`) | Document and align plugin symlink parity across project and global roots | Fix in this project |
| `A-007` | `P1-high` | Global `~/.agent/skills/total-recall/plugins/` has stale copies of `mesh` (`v0.2.1` vs `v0.2.2`) and `skill-manager` (`v1.1.0` without card vs `v1.2.1` with card) | Global brain runs older plugin versions than project brain | Synchronize global plugin installs with the canonical `/Users/gregoryiteen/github/tr-plugin-*` repositories | Fix in this project |
| `A-008` | `P1-high` | Previous copy and replies risked ending sentences with prepositions (`preferences-e415549e`) | Direct violation of Greg's writing rule | Enforce an automated preposition check across all project docs, README copy, and OpenWiki files | Fix in this project |
| `A-009` | `P2-medium` | `docs/IDE_INTEGRATION.md` and `docs/reference/legacy-product-readme.md` contain legacy competitor IDE mentions | Conflicts with `no-cursor-or-windsurf-mentions` | Sanitize active public documentation and onboarding guides | Fix in this project |
| `A-010` | `P2-medium` | OpenWiki hubs in `total-recall` lacked a comprehensive guide covering the 32 plugins, the Software Factory (`new`/`vendor`), and the Daily Driver architecture | Agents and users querying OpenWiki miss the full system capabilities | Expand `openwiki/` hubs with complete plugin, Software Factory, and Daily Driver documentation and re-ingest into the vault | Fix in this project |
| `A-011` | `P0-critical` | `src/cli/help.mjs` matches only exact `### <cmd>` headings in `docs/reference/cli-reference.md` and ignores 345 plugin operations plus composed commands; no semantic index exists over the 415+ total CLI verbs | New built-in, plugin, and composed verbs get lost as the surface grows; agents and users cannot discover commands by natural-language intent | Build a **Semantic CLI Index** (using bundled zero-cost `nomic-embed-text:latest` 768-dim vectors + hybrid keyword search) compiled automatically into `memory-derived/` and surfaced through `total-recall help "<query>"`, `total-recall find "<query>"`, and `total-recall context "<task>"` | Fix in this project |
| `A-012` | `P1-high` | Among the 32 installed plugins, no plugin owns brand positioning, launch campaigns, copy compliance linting, UTM/click telemetry, or SEO/OpenGraph readiness (`invariants-791019ac`) | Marketing workflows rely on ad-hoc Markdown files instead of an executable SSSS plugin and reusable app brick | Build `tr-plugin-marketing` (`total-recall marketing`) with SSSS brand/campaign records, deterministic copy linting (enforcing banned-term and preposition rules), UTM/click tracking, SEO/OG probes, and a bespoke functional `ui/card.js` | Fix in this project |

---

## 13. Impact on the requested change

- **Redefining the Launch Strategy (`A-001`, `A-002`, `A-010`):** Instead of marketing Total Recall as a narrow "memory helper," the PRD, Architecture, and Launch Plan position Total Recall as **The Autonomous Software Factory & Vibe Coding Brain (Your Daily Driver Operating System for Makers, Builders, Founders, and Sellers)**.
- **Solving Verb Discovery via a Semantic CLI Index (`A-011`):** With 70+ core commands, 345 plugin operations across 32 namespaces, and user-composed commands, adding a zero-cost semantic vector index over every CLI verb ensures that both `total-recall help "<intent>"` and `total-recall context "<task>"` automatically surface the exact command needed for any task.
- **Turning Marketing into an Executable Brick (`A-012`):** Building `tr-plugin-marketing` follows Rule #1 (*always improve the product*): Total Recall markets itself through its own `total-recall marketing` plugin, and every builder can vendor `marketing` into new projects (`total-recall new <app> --with marketing`).
- **Proving the Promise with Real Capabilities (`A-003` through `A-009`):** Because trust in 2026 depends on verifiable, working tools rather than hype, our launch roadmap pairs high-click brand positioning with concrete codebase hygiene: syncing scaffold plugins, updating OpenWiki templates, aligning the 32 plugins across project/global roots, and showcasing real functional plugin cards and zero-cost cloud/local embeddings.

---

## 14. Decisions

1. **Decision D-001 — Category & Brand Positioning Hook:**
   - How should we headline the unified system so it gets maximum clicks from vibe coders while immediately communicating that it is a full Software Factory and Daily Driver?
   - **Recommended default:** **Total Recall — The Vibe Brain & Autonomous Software Factory** (Tagline: *"Your AI Daily Driver: Memory, Rules, Secrets, and 32 Visual Plugins — Automatically Managed Across All Your Devices."* Viral shorthand hook: **VibeBrain**).
2. **Decision D-002 — Semantic CLI Index Scope (`A-011`):**
   - Should the new Semantic CLI Index cover all three command layers (built-in CLI commands, all installed plugin operations from `plugin.json`, and all `composable-cli` commands) and inject the top task-matched verbs directly into `total-recall context "<task>"`?
   - **Recommended default:** Yes — index all three layers into `memory-derived/cli-semantic-index.json` (or `embeddings.db`) during `compile` using the zero-cost `nomic-embed-text:latest` model, expose `total-recall help "<natural language query>"` (plus `total-recall command search "<query>"`), and include top matched verbs in `context`.
3. **Decision D-003 — `tr-plugin-marketing` Scope (`A-012`):**
   - Should we scaffold and build `tr-plugin-marketing` (`total-recall marketing`) as both our own launch engine for Total Recall and a vendored brick for any new app?
   - **Recommended default:** Yes — create `/Users/gregoryiteen/github/tr-plugin-marketing` (private repo per `invariants-f33a3be3`) with SSSS brand/campaign state, deterministic copy compliance gates (`lint`), SEO/OpenGraph auditing (`seo-audit`), UTM/click attribution (`links`, `clicks`), and a bespoke functional `ui/card.js`.
