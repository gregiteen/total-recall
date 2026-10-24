# TR_MARKETING_LAUNCH — Architecture

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Based on audit**: `TR_MARKETING_LAUNCH_AUDIT.md` (Complete, d7fc0bc16f0c9c6b4d2a15f0b81031e410d7e423)

---

## 1. Unified System Architecture: Daily Driver + Autonomous Software Factory (`A-002`)

Total Recall operates simultaneously as the operator's **Multi-Interface Daily Driver** and as an **Autonomous Software Factory** across all enrolled mesh devices:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ANY INTERFACE (DAILY DRIVER ACCESS)                      │
│  Terminal CLI  •  CLI Agents (Claude/Codex/Gemini/Hermes/DSH)  •  Web UI     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  AUTOMATIC COGNITIVE & ORCHESTRATION ENGINE                  │
│  • Context Capsule (`context`) + Automatic Top Semantic CLI Verbs (`A-011`)  │
│  • Auto-Compiled Surfaces (`INSTRUCTIONS.md`, `CLAUDE.md`, `GEMINI.md`)      │
│  • Self-Learning Loop (`dream` consolidation, `proposals`, `skill-manager`)  │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌───────────────────────────────────────────┐  ┌───────────────────────────────┐
│     SOVEREIGN VAULT & ZERO-COST VECTORS   │  │   32 VISUAL & CLI PLUGINS     │
│  • SSSS Markdown Vault (Global + Project) │  │  • 9 Default Foundation Tools │
│  • Encrypted Secrets (`secrets.enc`)      │  │  • 23 Domain & Commerce Bricks│
│  • OpenWiki Knowledge Graph Hubs          │  │  • Confined `ui/card.js` UIs  │
│  • Local/Cloud Ollama (`nomic-embed-text`)│  │  • New `tr-plugin-marketing`  │
└───────────────┬───────────────────────────┘  └───────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌───────────────────────────────────────────┐  ┌───────────────────────────────┐
│     AUTOMATIC MULTI-DEVICE MESH SYNC      │  │   AUTONOMOUS SOFTWARE FACTORY │
│  • Mac mini (100.64.0.2)                  │  │  `total-recall new <app>`     │
│  • Cloud Daemon + Ollama (100.64.0.1)     │  │  `--with auth,stripe,domains,`│
│  • MacBook Pro (100.64.0.6) & Mobile      │  │  `marketing,deploy` -> Owned! │
└───────────────────────────────────────────┘  └───────────────────────────────┘
```

---

## 2. Automatic Semantic CLI & Verb Index Architecture (`A-011`)

Across 70+ built-in commands, 32 plugins (345 operations), and composed commands (`composable-cli`), Total Recall exposes over 415 executable verbs. To ensure no verb ever gets lost, the **Semantic CLI Index** (`src/core/cli-semantic-index.mjs`) integrates directly into the automatic compilation and context pipeline:

```
[Trigger: `compileSurface` / `plugin install|on|off` / `command create|update`]
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. Harvest Complete Command Catalog (`buildCliVerbCatalog`)                  │
│    • Built-in commands (`src/core/cli-commands.mjs` + `cli-reference.md`)    │
│    • Installed plugin operations (`plugin-catalog.json` / `plugin.json`)     │
│    • Composed commands (`.agent/commands/*.mjs` + global commands)           │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. Incremental Content-Hash & Zero-Cost Vector Embedding                     │
│    • Compute SHA-256 of `command + namespace + description + args + effect`  │
│    • Embed changed entries via local/cloud Ollama `nomic-embed-text:latest`  │
│    • Persist in `<derivedDir>/embeddings.db` (`cli_verb_embeddings` table)   │
│      and `<derivedDir>/cli-verb-index.json`                                  │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌──────────────────────┐   ┌────────────────────────┐   ┌──────────────────────┐
│ `total-recall context│   │ `total-recall help <q>`│   │ Unknown CLI Verb     │
│ "<task>"`            │   │ or `find "<q>"`        │   │ Automatic Fallback   │
│ Automatically injects│   │ Hybrid vector + BM25   │   │ Suggests top ranked  │
│ top 8 matched verbs  │   │ search across all 415+ │   │ runnable commands    │
│ for the current task │   │ commands & plugin ops  │   │ instead of failing   │
└──────────────────────┘   └────────────────────────┘   └──────────────────────┘
```

### Key Design Properties
- **100% Automatic Rebuild:** `compileSurface` (`src/core/surface.mjs`) updates the CLI verb index automatically whenever any command, plugin manifest, or skill changes. Unchanged command hashes skip re-embedding (`O(1)` steady-state cost).
- **Zero-Cost Vector + Lexical Hybrid Scoring:** Combines cosine similarity from `nomic-embed-text:latest` (`768` dims) with exact token/namespace/verb matching so both conceptual queries (*"how do I rotate credentials across servers"*) and keyword queries (*"dkim"* or *"qr pass"*) rank the exact owning command (`total-recall auth secret rotate --remote`, `total-recall domains`, `total-recall tickets pass`) at #1.
- **Automatic Context Capsule Enrichment (`src/cli/context.mjs`):** Every `total-recall context "<task>"` invocation automatically includes a compact `## Matched CLI & Plugin Verbs for This Task` block before the agent acts.

---

## 3. `tr-plugin-marketing` (`total-recall marketing`) Architecture (`A-012`)

`tr-plugin-marketing` lives in `/Users/gregoryiteen/github/tr-plugin-marketing` (symlinked into both `.agent/skills/total-recall/plugins/marketing` and `~/.agent/skills/total-recall/plugins/marketing`) and functions as both Total Recall's own growth engine and a vendorable brick (`total-recall new <app> --with marketing`):

```
/Users/gregoryiteen/github/tr-plugin-marketing/
├── plugin.json                # Manifest declaring operations, tasks, skills, and UI
├── package.json               # Zero-bloat ESM package manifest
├── cli.mjs                    # CLI dispatcher for `total-recall marketing <op>`
├── src/
│   ├── brand-store.mjs        # SSSS-validated brand vision, promise, trust & personas
│   ├── copy-linter.mjs        # Deterministic gate: banned terms & trailing prepositions
│   ├── campaign-engine.mjs    # Launch angles, hooks, README & channel draft generator
│   ├── seo-auditor.mjs        # README, OpenWiki & live URL OpenGraph/meta verifier
│   └── click-telemetry.mjs    # UTM link builder & click/conversion event ledger
├── ui/
│   ├── card.js                # Bespoke animated JS dashboard card (no emojis/mocks)
│   └── panel.js               # Full interactive campaign, copy-lint & funnel workspace
└── test/
    └── marketing.spec.mjs     # Deterministic unit & CLI parity test suite
```

### Automatic Marketing & Copy Governance
- **Automatic Preposition & Banned-Term Gate (`marketing lint`):** Scans Markdown files (`README.md`, `docs/projects/**`, `openwiki/**`) using deterministic sentence-boundary parsing to detect sentence-ending prepositions (`A-008`) and banned competitor IDE names (`A-004`, `A-007`, `A-009`).
- **Automatic Brand Sync:** Reads and writes validated SSSS envelopes so any agent running across the mesh shares the exact brand vision, promise, trust pillars, and audience hooks.

---

## 4. Automatic Plugin & Scaffold Alignment Architecture (`A-003`–`A-007`)

1. **Canonical Repository Location:** Move `/Users/gregoryiteen/tr-plugin-embeddings` to `/Users/gregoryiteen/github/tr-plugin-embeddings` (`A-003`, `A-006`).
2. **Project & Global Brain Parity:** Link all 33 plugins (the existing 32 plus `marketing`) consistently across `/Users/gregoryiteen/github/total-recall/.agent/skills/total-recall/plugins/` and `~/.agent/skills/total-recall/plugins/` pointing to `/Users/gregoryiteen/github/tr-plugin-*`, eliminating stale copied folders (`mesh v0.2.1`, `skill-manager v1.1.0`) (`A-004`, `A-006`, `A-007`).
3. **Complete Visual Card Coverage (`A-005`):** Implement real, functional `ui/card.js` files for `tr-plugin-embeddings`, `tr-plugin-hermes`, and `tr-plugin-marketing` so 100% of installed plugins render bespoke interactive cards in the dashboard.
4. **Automatic Scaffold Pinning (`A-003`):** Wire `syncScaffoldPlugins` into the automatic compile/check workflow so `scaffold/.agent/skills/total-recall/plugins/` never drifts from the 9 default plugins.
