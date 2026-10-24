# TR_MARKETING_LAUNCH — Product Requirements Document

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Based on audit**: `TR_MARKETING_LAUNCH_AUDIT.md` (Complete, d7fc0bc16f0c9c6b4d2a15f0b81031e410d7e423)

---

## 1. Executive Summary & Category Vision (Addressing `A-001`, `A-002`)

Total Recall is not merely a memory utility; it is **The Vibe Brain & Autonomous Software Factory** — a personal AI operating system and daily driver that manages plugins, memory, instructions, deterministic rules, and encrypted secrets **automatically across all of your devices**.

In late 2026, makers, builders, founders, and digital sellers face two broken extremes:
1. **Stateless Vibe Coding Toys:** Tools that generate rapid prototypes but suffer from severe context amnesia, forgetting architecture, breaking rules, and leaking secrets across sessions.
2. **Closed Cloud Factories:** Expensive, locked-in SaaS platforms that trap intellectual property inside remote vendor databases and force developers into a single rigid interface.

Total Recall unifies both worlds into one sovereign, local-first system:
- **The Daily Driver Workbench:** Work from any interface (terminal CLI, Claude Code, Codex, Gemini, Hermes, DSH, the visual React/Preact Web Dashboard, or the mobile companion). Your memory, rules, secrets, and 32 functional plugins reside in the exact place where you need them.
- **The Autonomous Software Factory:** Bootstrap complete production applications in seconds (`total-recall new <app> --with <bricks>`). Vendor any of the 32 battle-tested plugins as owned project bricks (`bricks/<id>`) and provision a dedicated Headscale mesh server automatically, with zero runtime lock-in.
- **Zero-Cost Bundled Intelligence:** Ships with `tr-plugin-embeddings` driving `nomic-embed-text:latest` (768 dimensions) across local and cloud mesh nodes at zero API spend.
- **100% Automatic Management:** The system learns your patterns during the background `dream` cycle, proposes conservative skill optimizations (`proposals`, `skill-manager`), composes new CLI verbs (`composable-cli`), auto-compiles instruction surfaces on every change, semantically indexes every CLI verb so nothing gets lost (`A-011`), and propagates updates across every device on your mesh automatically.

---

## 2. Brand Architecture: Vision, Promise, and Trust

### Brand Naming & High-Click Positioning (`D-001`, `A-002`)
- **Primary Brand Name:** **Total Recall — The Vibe Brain & Autonomous Software Factory**
- **Viral Shorthand Hook:** **VibeBrain**
- **Headline Hook:** *"Your AI Daily Driver & Software Factory: Memory, Rules, Secrets, and 32 Visual Plugins — Automatically Managed Across All Your Devices."*
- **Click Hooks by Segment:**
  - *"Stop vibe coding with amnesia. Give every agent one permanent brain across every device."*
  - *"From prompt to production factory: 32 visual plugins you can run daily or vendor into any app in 10 seconds."*

### The Brand Promise
> *"Use any interface on any device: your agents remember every rule, your secrets stay encrypted, your 400+ CLI and plugin verbs surface automatically, and your projects ship as owned code."*

### The Five Pillars of Trust
1. **Total Automation (Zero Manual Upkeep):** Surface compilation, semantic verb indexing, scaffold synchronization, Dream memory consolidation, CLI agent doc refreshes, and multi-device mesh updates run automatically (`A-003`, `A-006`, `A-007`, `A-011`).
2. **Real, Visual, Functional Plugins (Zero Mock State):** Every plugin includes a bespoke interactive JavaScript interface (`ui/card.js` and `ui/panel.js`) operating inside a confined iframe with real CLI/API controls and zero simulated state (`A-005`, `invariants-1933916a`).
3. **Sovereign Data & Zero-Cost Embeddings:** Canonical data lives in human-readable SSSS Markdown and local SQLite indexes powered by local/cloud Ollama `nomic-embed-text:latest` vectors that never leave your mesh.
4. **Software Factory Ownership (`total-recall new` & `plugin vendor`):** When you vendor plugins into a product, your application owns the source code in `bricks/` with SHA-256 provenance and zero runtime dependency on Total Recall.
5. **Fail-Closed Deterministic Governance:** `total-recall context` enforces mandatory rules before an agent acts, while `total-recall auth secret` keeps credentials inside encrypted stores (`secrets.enc`).

---

## 3. Market Predictions (2026–2028) & How Total Recall Leads

1. **From Prompting to Personal Software Factories:** Individual makers, builders, founders, and sellers will operate 5–20 production apps simultaneously. They will abandon standalone chat wrappers in favor of unified software factories that scaffold apps with pre-built auth, payments, DNS, telephony, ticketing, deployment, and marketing bricks (`A-002`, `A-012`).
2. **Semantic Tool & Verb Routing Replaces Static Help:** As personal agent ecosystems grow past 400+ CLI commands and plugin operations, static `--help` menus fail. Automatic semantic CLI indexing (`A-011`) that injects the exact relevant verbs into every task context capsule becomes mandatory infrastructure.
3. **Self-Improving Multi-Device Meshes:** Developers work across desktop workstations, laptops, cloud servers, and phones. Private Headscale/Tailscale meshes with separate device vaults, shared encrypted secrets, and background Dream consolidation will become the gold standard for personal AI infrastructure.

---

## 4. Core Functional Requirements (Mapped to Audit Findings)

### FR-1: Automatic Semantic CLI & Verb Index (`A-011`, `D-002`)
- Automatically index all built-in CLI commands (`src/core/cli-commands.mjs`), all installed plugin operations (`plugin.json` across project and global roots), and all composed commands (`composable-cli`) during `compileSurface` (`src/core/surface.mjs`).
- Embed every command signature, description, and argument summary using the zero-cost `nomic-embed-text:latest` vector pipeline (`src/core/embeddings.mjs`) with hybrid BM25/keyword fallback.
- **Automatic Context Injection:** When `total-recall context "<task>"` executes, automatically match `"<task>"` against the Semantic CLI Index and include the top relevant CLI and plugin verbs inside the emitted capsule so agents never lose a verb.
- **Automatic Help & Unknown-Verb Fallback:** When `total-recall help "<query>"` runs on a natural-language query or plugin/composed verb (or when an unrecognized verb is invoked), automatically query the Semantic CLI Index and return the ranked matching commands.

### FR-2: Automatic Plugin, Scaffold, and Multi-Root Synchronization (`A-003`–`A-007`)
- Relocate `/Users/gregoryiteen/tr-plugin-embeddings` into `/Users/gregoryiteen/github/tr-plugin-embeddings` and update symlinks (`A-003`, `A-006`).
- Ensure the project brain (`.agent/skills/total-recall/plugins/`) and global brain (`~/.agent/skills/total-recall/plugins/`) stay automatically synchronized with `/Users/gregoryiteen/github/tr-plugin-*`, eliminating version drift on `mesh` and `skill-manager` (`A-004`, `A-007`).
- Add bespoke, functional `ui/card.js` interfaces for `embeddings` and `hermes` so all 32 plugins meet the visual card invariant (`A-005`).
- Automatically keep `scaffold/.agent/skills/total-recall/plugins/` synchronized whenever default plugins change (`A-003`).

### FR-3: Dedicated Marketing Plugin (`tr-plugin-marketing` / `total-recall marketing`) (`A-012`, `D-003`)
- Build `tr-plugin-marketing` at `/Users/gregoryiteen/github/tr-plugin-marketing` as both the engine that markets Total Recall and a reusable brick for any project (`total-recall new <app> --with marketing`).
- Capabilities required in `total-recall marketing`:
  - `status` / `probe`: Inspect active brand profile, campaigns, copy compliance status, and channel readiness.
  - `brand`: Manage canonical SSSS brand positioning (`vision`, `promise`, `trust`, `personas`, `hooks`, `banned-terms`, `style-rules`).
  - `lint`: Deterministic copy compliance gate that scans Markdown, READMEs, OpenWiki pages, and campaign drafts, failing closed on banned competitor names (`A-007`, `A-009`) or sentence-ending prepositions (`A-008`).
  - `campaigns` / `draft`: Generate and track persona-targeted launch assets for Makers, Builders, Founders, and Sellers.
  - `seo-audit`: Inspect repository READMEs, OpenWiki hubs, and live web URLs for OpenGraph tags, meta descriptions, title lengths, and call-to-action links.
  - `links` / `clicks`: Manage campaign UTM shortlinks and inspect click/conversion telemetry.
  - Bespoke `ui/card.js` and `ui/panel.js`: Functional visual marketing console inside the Total Recall dashboard.

### FR-4: Public README, OpenWiki Hubs, and Compliance Overhaul (`A-002`, `A-004`, `A-007`–`A-010`)
- Overhaul `README.md`, `package.json` description/keywords, `templates/openwiki/`, `scaffold/openwiki/`, and local `openwiki/` hubs to present the full **Vibe Brain + Software Factory + Daily Driver** story and the 32-plugin catalog.
- Purge all banned competitor IDE mentions (`A-004`, `A-007`, `A-009`) and enforce zero sentence-ending prepositions across all touched documents (`A-008`).
