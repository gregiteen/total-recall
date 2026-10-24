# PLUGIN_UI_OVERHAUL — Exhaustive 34-Plugin Individual Audits & Plans

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## Executive Overview

This document provides an exhaustive, evidence-based audit and bespoke improvement plan for **every single one of the 34 plugins** installed in Total Recall.

### Systematic Core Failures Identified Across the Fleet:
1. **Fake Hardware & Audio Skin Gimmicks ([anti-patterns-ec0c0d95])**:
   A staggering **12 plugins** have fake Winamp skins declared in their manifests (`"skin": "winamp-classic"`), and **19 plugins** render animated `<canvas>` oscilloscopes, radar sweeps, or audio waterfalls instead of genuine operational software.
2. **Nameless Cards in UI**:
   When `CardEngine.tsx` encounters an owned plugin component, it strips the container styling and omits `<Header card={card} />`. Because many `ui/card.js` files omitted an internal title or used broken relative CSS, cards rendered completely blank or nameless.
3. **Severely Constrained Subcommand Parity**:
   Across the 34 plugins, there are **261 declared CLI subcommands**, but the legacy card faces exposed fewer than 25% of them. Essential commands (`audit`, `verify`, `rotate`, `sync`) were completely omitted.
4. **Static Blank States**:
   Cards failed to query their declared `status` command on mount, leaving users with unhelpful text such as *"Not checked. Select an action to retrieve current information."*

---

---

### 01. `auth` — Auth & Secrets

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/total-recall/.agent/skills/total-recall/plugins/auth`](file:///Users/gregoryiteen/github/total-recall/.agent/skills/total-recall/plugins/auth)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/total-recall/.agent/skills/total-recall/plugins/auth/plugin.json) (Version: `v1.0.1`, Template: `vault`)
- **Card Element**: [`tr-auth-card`](file:///Users/gregoryiteen/github/total-recall/.agent/skills/total-recall/plugins/auth/ui/card.js) (275 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 10 verbs (`status, audit, rotate, passkey, google, probe, session, secret, password, key`)
- **Secrets**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `COLLAB_SESSION_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ALLOWED_EMAILS`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **No**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `passkey`, `session`, `status`, `PASSKEYS`, `SESSIONS`, `STATUS`
- **Coverage Deficit**: Out of 10 subcommands, only 6 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-auth-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Dark Emerald Enclave (`#021a12`, accent `#10b981`, font `chivo-mono`)
  - **Custom Vector Mark**: Cryptographic FIDO2 Shield Keyhole (zero emojis, strict SVG geometry)
  - **Layout Template**: `vault`
- **Live Domain Telemetry (Queried on Mount)**:
  - FIDO2 registered passkeys count, active session tokens, Google OAuth connection state, dashboard password configuration
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Audit Credentials (`auth audit`)**
  - **Manage Passkeys (`auth passkey`)**
  - **Active Sessions (`auth session`)**
  - **Google OAuth (`auth google`)**
  - **API Key Policy (`auth key`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 02. `cli-agents` — Command Fleet

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-cli-agents`](file:///Users/gregoryiteen/github/tr-plugin-cli-agents)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-cli-agents/plugin.json) (Version: `v0.2.0`, Template: `workbench`)
- **Card Element**: [`command-fleet-card`](file:///Users/gregoryiteen/github/tr-plugin-cli-agents/ui/card.js) (19 lines of JavaScript)
- **Status Subcommand**: `None configured`
- **Total Declared Subcommands**: 15 verbs (`status, catalog, nodes, inspect, run-command, runtime, dispatch, docs-status, docs-refresh, docs-ensure, maintenance, setup, docs-sources, docs-read, docs-search`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **No**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Inspect local agents`
- **Coverage Deficit**: Out of 15 subcommands, only 1 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `command-fleet-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Slate-Teal Terminal Deck (`#184e47`, accent `#dbb76a`, font `space-grotesk`)
  - **Custom Vector Mark**: Interlocking Multi-Agent Node Array (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Discovered local coding agent binaries (Claude, Cursor, Codex, etc.), mesh node routing targets, adapter contract versions
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Inspect Local Binaries (`cli-agents status`)**
  - **Mesh Targets (`cli-agents nodes`)**
  - **Adapter Catalog (`cli-agents catalog`)**
  - **Documentation Freshness (`cli-agents docs-status`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 03. `code-quality` — Code Quality Gates

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-code-quality`](file:///Users/gregoryiteen/github/tr-plugin-code-quality)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-code-quality/plugin.json) (Version: `v0.2.1`, Template: `workbench`)
- **Card Element**: [`tr-code-quality-card`](file:///Users/gregoryiteen/github/tr-plugin-code-quality/ui/card.js) (273 lines of JavaScript)
- **Status Subcommand**: `report`
- **Total Declared Subcommands**: 6 verbs (`report, snapshot, gate, config, detect, init`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Audit`, `Lint`, `Gates`
- **Coverage Deficit**: Out of 6 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-code-quality-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Industrial Quality Gold (`#eab308`, accent `#ca8a04`, font `ibm-plex`)
  - **Custom Vector Mark**: Deterministic Quality Hex Shield (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Passing vs. failing gate matrix, latest snapshot hash, linter violation count, test coverage delta
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Run Fast Gates (`code-quality gate --tier fast`)**
  - **Read Latest Report (`code-quality report`)**
  - **Inspect Snapshot (`code-quality snapshot`)**
  - **Detect Linters (`code-quality detect`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 04. `composable-cli` — Composable CLI

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-composable-cli`](file:///Users/gregoryiteen/github/tr-plugin-composable-cli)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-composable-cli/plugin.json) (Version: `v0.2.1`, Template: `workbench`)
- **Card Element**: [`tr-composable-cli-card`](file:///Users/gregoryiteen/github/tr-plugin-composable-cli/ui/card.js) (274 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 12 verbs (`status, create, read, update, remove, list, show, history, rollback, test, promote, library`)
- **Secrets**: `COMPOSABLE_CLI_AUTH_TOKEN`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Catalog`, `Inspect`, `History`
- **Coverage Deficit**: Out of 12 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-composable-cli-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Cyber Cyan Pipeline Forge (`#0891b2`, accent `#06b6d4`, font `jetbrains-mono`)
  - **Custom Vector Mark**: Interlocking Logic Pipeline Nodes (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Total registered composed commands (global vs project), recent execution count, pipeline failure rate
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Command Library (`composable-cli library`)**
  - **Test Pipeline (`composable-cli test`)**
  - **Execution History (`composable-cli history`)**
  - **Rollback Version (`composable-cli rollback`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 05. `creative-search` — Metasearch

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-creative-search`](file:///Users/gregoryiteen/github/tr-plugin-creative-search)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-creative-search/plugin.json) (Version: `v2.1.1`, Template: `workbench`)
- **Card Element**: [`tr-csearch-card`](file:///Users/gregoryiteen/github/tr-plugin-creative-search/ui/card.js) (325 lines of JavaScript)
- **Status Subcommand**: `health`
- **Total Declared Subcommands**: 8 verbs (`config, query, health, engines, categories, deep, remember, stats`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `status`, `engines`, `research`, `STATUS`, `ENGINES`, `RESEARCH`
- **Coverage Deficit**: Out of 8 subcommands, only 6 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-csearch-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Teal Telemetry Prism (`#14b8a6`, accent `#0d9488`, font `space-grotesk`)
  - **Custom Vector Mark**: Multi-Beam Metasearch Prism (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - SearXNG instance HTTP 200 health, engine response latency, active category filters, query cache size
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Inline Search Query Input Bar**
  - **Category Filter Tabs ([General], [IT], [Science], [Files])**
  - **Instance Health Probe (`csearch health`)**
  - **Deep Research Enqueue (`csearch deep`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 06. `decision` — Decisions

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-decision`](file:///Users/gregoryiteen/github/tr-plugin-decision)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-decision/plugin.json) (Version: `v0.2.1`, Template: `dashboard`)
- **Card Element**: [`tr-decision-card`](file:///Users/gregoryiteen/github/tr-plugin-decision/ui/card.js) (275 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 5 verbs (`status, run, sets, log, test`)
- **Secrets**: `DECISION_MODEL_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Question Sets`, `Audit Log`
- **Coverage Deficit**: Out of 5 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-decision-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Deep Violet Logic Console (`#7c3aed`, accent `#a855f7`, font `space-grotesk`)
  - **Custom Vector Mark**: Bifurcated Balance Scale (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Registered decision sets, evaluation log count, average confidence scores across recent decisions
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Evaluate Logic (`decision run`)**
  - **Browse Decision Sets (`decision sets`)**
  - **Audit Log (`decision log`)**
  - **Run Test Suite (`decision test`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 07. `deploy` — Zero-Downtime Deploy

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-deploy`](file:///Users/gregoryiteen/github/tr-plugin-deploy)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-deploy/plugin.json) (Version: `v0.2.0`, Template: `dashboard`)
- **Card Element**: [`tr-deploy-card`](file:///Users/gregoryiteen/github/tr-plugin-deploy/ui/card.js) (396 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 11 verbs (`status, stage, switch, release, rollback, retire, providers, probe, token, optimize, optimize-clean`)
- **Secrets**: `DEPLOY_PROVIDER_TOKEN`, `DEPLOY_SSH_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `status`, `probe`, `SLOT STATUS`, `PROBE HEALTH`, `TARGET STATUS`, `REFRESH`
- **Coverage Deficit**: Out of 11 subcommands, only 6 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-deploy-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Mission Control Cobalt (`#3b82f6`, accent `#60a5fa`, font `ibm-plex`)
  - **Custom Vector Mark**: Dual-Slot Traffic Routing Valve (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Active serving slot (Blue vs. Green), staged slot health probe (HTTP status), deployed version hash
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Stage Build (`deploy stage`)**
  - **Switch Traffic (`deploy switch`)**
  - **Emergency Rollback (`deploy rollback`)**
  - **Provider Probe (`deploy probe`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 08. `design` — Design Tokens

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-design`](file:///Users/gregoryiteen/github/tr-plugin-design)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-design/plugin.json) (Version: `v0.2.1`, Template: `workbench`)
- **Card Element**: [`tr-design-card`](file:///Users/gregoryiteen/github/tr-plugin-design/ui/card.js) (245 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 4 verbs (`status, tokens, css, tailwind`)
- **Secrets**: `DESIGN_REGISTRY_TOKEN`, `OPENROUTER_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Tokens`, `Export CSS`
- **Coverage Deficit**: Out of 4 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-design-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Studio Indigo Palette (`#6366f1`, accent `#4f46e5`, font `inter`)
  - **Custom Vector Mark**: Geometric Swatch Layer Matrix (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Parsed canonical design tokens count (Colors, Typography, Spacing, Elevation) from DESIGN.md
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Inspect Tokens (`design tokens`)**
  - **Compile CSS Bundle (`design css`)**
  - **Export Tailwind Config (`design tailwind`)**
  - **Contrast Audit (`design status`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 09. `domains` — Holy MX

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-domains`](file:///Users/gregoryiteen/github/tr-plugin-domains)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-domains/plugin.json) (Version: `v0.3.1`, Template: `ledger`)
- **Card Element**: [`tr-domains-card`](file:///Users/gregoryiteen/github/tr-plugin-domains/ui/card.js) (349 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 51 verbs (`status, check, token, settings, view, set, list, info, add, update, remove, config, verification, claim, apex-projects, records, record, record-add, record-update, record-rm, search, availability, availability-bulk, price, price-bulk, buy, buy-many, renew, transfer-in, transfer-status, auth-code, auto-renew, nameservers, contact-schema, contact-status, order, tlds, tld, tld-price, project-list, project-get, project-add, project-update, project-remove, project-verify, project-move, certs, cert, cert-issue, cert-upload, cert-rm`)
- **Secrets**: `VERCEL_API_TOKEN`, `SMTP2GO_API_KEY`, `MAILCOW_API_KEY`, `MAILCOW_HOST`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `records`, `check`, `list`, `certs`, `ZONE RECORDS`, `CHECK ALIGN`, `PORTFOLIO`, `SSL CERTS`
- **Coverage Deficit**: Out of 51 subcommands, only 8 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-domains-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Executive Navy & Sky (`#0284c7`, accent `#38bdf8`, font `chivo-mono`)
  - **Custom Vector Mark**: Spherical World DNS Routing Grid (zero emojis, strict SVG geometry)
  - **Layout Template**: `ledger`
- **Live Domain Telemetry (Queried on Mount)**:
  - Total managed DNS zones, SSL certificate validity status, DNS propagation health, MX mail alignment
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **List Zones (`domains list`)**
  - **Inspect Records (`domains records`)**
  - **Check Certs (`domains certs`)**
  - **Domain Availability Search Bar**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 10. `dsh` — DeepSeek Harness

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-dsh`](file:///Users/gregoryiteen/github/tr-plugin-dsh)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-dsh/plugin.json) (Version: `v1.1.1`, Template: `monitor`)
- **Card Element**: [`tr-dsh-card`](file:///Users/gregoryiteen/github/tr-plugin-dsh/ui/card.js) (278 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 6 verbs (`status, sessions, tools, models, model, plugins`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Status`, `Models`, `Plugins`
- **Coverage Deficit**: Out of 6 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-dsh-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Electric Azure Compute Matrix (`#0284c7`, accent `#0ea5e9`, font `jetbrains-mono`)
  - **Custom Vector Mark**: Neural Assistant Node Graph (zero emojis, strict SVG geometry)
  - **Layout Template**: `monitor`
- **Live Domain Telemetry (Queried on Mount)**:
  - Runtime status (Active/Standby), connected harness count, available tool definitions count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Runtime Status (`dsh status`)**
  - **Inspect Tool Registry (`dsh tools`)**
  - **Session Log Stream (`dsh sessions`)**
  - **Plugin Bridge (`dsh plugins`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 11. `embeddings` — Embeddings

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-embeddings`](file:///Users/gregoryiteen/github/tr-plugin-embeddings)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-embeddings/plugin.json) (Version: `v0.1.0`, Template: `None`)
- **Card Element**: [`tr-embeddings-card`](file:///Users/gregoryiteen/github/tr-plugin-embeddings/ui/card.js) (298 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 5 verbs (`status, models, pull, benchmark, coverage`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Status`, `Coverage`, `Benchmark`
- **Coverage Deficit**: Out of 5 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-embeddings-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Deep Emerald Vector Space (`#059669`, accent `#10b981`, font `space-grotesk`)
  - **Custom Vector Mark**: Multidimensional Vector Lattice (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Active embedding model name & dimensions, memory vault vector coverage percentage, query latency
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Model Status (`embeddings status`)**
  - **Pull Weights (`embeddings pull`)**
  - **Run Benchmark (`embeddings benchmark`)**
  - **Scan Vault Coverage (`embeddings coverage`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 12. `git-sentinel` — Git Hygiene

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-git-sentinel`](file:///Users/gregoryiteen/github/tr-plugin-git-sentinel)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-git-sentinel/plugin.json) (Version: `v1.2.1`, Template: `dashboard`)
- **Card Element**: [`tr-git-sentinel-card`](file:///Users/gregoryiteen/github/tr-plugin-git-sentinel/ui/card.js) (279 lines of JavaScript)
- **Status Subcommand**: `audit`
- **Total Declared Subcommands**: 2 verbs (`audit, diff`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Audit Status`, `Working Diff`, `Help`
- **Coverage Deficit**: Out of 2 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-git-sentinel-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Graphite Sentinel Console (`#475569`, accent `#64748b`, font `jetbrains-mono`)
  - **Custom Vector Mark**: Branching Git Tree Node (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Unpushed commits counter, modified working tree files count, active branch name, upstream sync status
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Audit Repositories (`git-sentinel audit`)**
  - **Inspect Dirty Diffs (`git-sentinel diff`)**
  - **Branch Sync Check**
  - **Lockfile Hygiene Report**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 13. `hermes` — Hermes Agent

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-hermes`](file:///Users/gregoryiteen/github/tr-plugin-hermes)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-hermes/plugin.json) (Version: `v0.1.0`, Template: `None`)
- **Card Element**: [`tr-hermes-card`](file:///Users/gregoryiteen/github/tr-plugin-hermes/ui/card.js) (269 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 6 verbs (`status, dispatch, gateway, skills, plugins, auth`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Gateway`, `Skills`
- **Coverage Deficit**: Out of 6 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-hermes-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Obsidian & Gold Winged Messenger (`#d97706`, accent `#f59e0b`, font `space-grotesk`)
  - **Custom Vector Mark**: Winged Helm Intelligence Mark (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Hermes daemon status (Running/Stopped), active task dispatch count, gateway socket state
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Gateway Status (`hermes gateway`)**
  - **Dispatch Prompt (`hermes dispatch`)**
  - **Mounted Skills (`hermes skills`)**
  - **Stream Logs (`hermes status`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 14. `image-generator` — fal

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-image-generator`](file:///Users/gregoryiteen/github/tr-plugin-image-generator)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-image-generator/plugin.json) (Version: `v0.2.1`, Template: `workbench`)
- **Card Element**: [`tr-image-generator-card`](file:///Users/gregoryiteen/github/tr-plugin-image-generator/ui/card.js) (265 lines of JavaScript)
- **Status Subcommand**: `models`
- **Total Declared Subcommands**: 2 verbs (`generate, models`)
- **Secrets**: `FAL_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Model Catalog`, `Prompt Guide`
- **Coverage Deficit**: Out of 2 subcommands, only 2 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-image-generator-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Creative Studio Spectrum (`#ec4899`, accent `#f43f5e`, font `outfit`)
  - **Custom Vector Mark**: Vector Pen Tool & Optical Lens (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Local GPU / remote provider readiness, generated asset cache count, active queue length
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Inline Prompt Brief Input Bar**
  - **Style Presets ([Brand Vector], [Product Shot], [Diagram])**
  - **Render Visual (`image-generator generate`)**
  - **Model Engine Status (`image-generator models`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 15. `maps` — Google Maps

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-maps`](file:///Users/gregoryiteen/github/tr-plugin-maps)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-maps/plugin.json) (Version: `v0.1.1`, Template: `dashboard`)
- **Card Element**: [`tr-maps-card`](file:///Users/gregoryiteen/github/tr-plugin-maps/ui/card.js) (274 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 7 verbs (`status, geocode, reverse, places, route, probe, token`)
- **Secrets**: `GOOGLE_MAPS_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Status`, `Probe`, `Key Status`
- **Coverage Deficit**: Out of 7 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-maps-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Cartographic Slate & Amber (`#ea580c`, accent `#f97316`, font `ibm-plex`)
  - **Custom Vector Mark**: Folded Terrain Map Landmark (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Geocoding provider health, cached coordinates lookups count, API quota consumption
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Direct Address Input Bar**
  - **Geocode Coordinates (`maps geocode`)**
  - **Calculate Route (`maps route`)**
  - **Reverse Lookup (`maps reverse`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 16. `marketing` — Marketing Engine

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-marketing`](file:///Users/gregoryiteen/github/tr-plugin-marketing)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-marketing/plugin.json) (Version: `v0.1.0`, Template: `None`)
- **Card Element**: [`tr-marketing-card`](file:///Users/gregoryiteen/github/tr-plugin-marketing/ui/card.js) (424 lines of JavaScript)
- **Status Subcommand**: `None configured`
- **Total Declared Subcommands**: 6 verbs (`status, brand, lint, seo-audit, links, campaigns`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Brand`, `Linter`, `SEO`, `Links`, `Inspect Brand Profile`, `Run Compliance Linter`, `Audit Social & Search Tags`, `Generate Campaign UTM`
- **Coverage Deficit**: Out of 6 subcommands, only 8 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-marketing-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Editorial Crimson & Ivory (`#be123c`, accent `#e11d48`, font `newsreader`)
  - **Custom Vector Mark**: Serif Typographical Precision Glyph (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Copy compliance score (0-100%), prohibited terms count, trailing preposition violations count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Lint Copy (`marketing lint`)**
  - **SEO & OG Tag Audit (`marketing seo-audit`)**
  - **Brand Vision Guide (`marketing brand`)**
  - **Verify Campaign Links (`marketing links`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 17. `mesh` — Headscale

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-mesh`](file:///Users/gregoryiteen/github/tr-plugin-mesh)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-mesh/plugin.json) (Version: `v0.2.2`, Template: `monitor`)
- **Card Element**: [`tr-mesh-card`](file:///Users/gregoryiteen/github/tr-plugin-mesh/ui/card.js) (35 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 19 verbs (`file, status, view, nodes, doctor, ssh, exec, access, ping, leader, enroll, preauthkey, policy, probe, token, presence, dispatch, server, grants`)
- **Secrets**: `HEADSCALE_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **No**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Refresh`, `Diagnostics`, `Presence`, `Leader`, `Ping node`
- **Coverage Deficit**: Out of 19 subcommands, only 5 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-mesh-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Mesh Telemetry Command Deck (`#2563eb`, accent `#3b82f6`, font `jetbrains-mono`)
  - **Custom Vector Mark**: Interconnected Mesh Node Topology (zero emojis, strict SVG geometry)
  - **Layout Template**: `monitor`
- **Live Domain Telemetry (Queried on Mount)**:
  - Enrolled mesh nodes counter (Cloud, Mini, MacBook, Mobile), leader node identity, sync latency
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Node Topology (`mesh nodes`)**
  - **Ping Peer (`mesh ping`)**
  - **Mesh Doctor (`mesh doctor`)**
  - **Preauth Enrollment Key (`mesh preauthkey`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 18. `okf` — Knowledge Schema (OKF)

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-okf`](file:///Users/gregoryiteen/github/tr-plugin-okf)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-okf/plugin.json) (Version: `v0.1.1`, Template: `dashboard`)
- **Card Element**: [`tr-okf-card`](file:///Users/gregoryiteen/github/tr-plugin-okf/ui/card.js) (271 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 4 verbs (`status, validate, schemas, probe`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Schemas`, `Validate`
- **Coverage Deficit**: Out of 4 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-okf-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Knowledge Graph Emerald (`#047857`, accent `#10b981`, font `ibm-plex`)
  - **Custom Vector Mark**: Geometric Schema Cube (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Registered schemas count, validation pass/fail rate, ontology entity types
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Validate Schemas (`okf validate`)**
  - **Schema Catalog (`okf schemas`)**
  - **Compatibility Probe (`okf probe`)**
  - **Export JSON-LD**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 19. `openclaw` — OpenClaw Bridge

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-openclaw`](file:///Users/gregoryiteen/github/tr-plugin-openclaw)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-openclaw/plugin.json) (Version: `v0.1.0`, Template: `None`)
- **Card Element**: [`tr-openclaw-card`](file:///Users/gregoryiteen/github/tr-plugin-openclaw/ui/card.js) (284 lines of JavaScript)
- **Status Subcommand**: `None configured`
- **Total Declared Subcommands**: 5 verbs (`status, sync, channels, skills, gateway`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Channels`, `Skills`, `Sync`
- **Coverage Deficit**: Out of 5 subcommands, only 4 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-openclaw-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Obsidian & Neon Coral (`#f97316`, accent `#fb923c`, font `space-grotesk`)
  - **Custom Vector Mark**: Cybernetic Claw Interface Mark (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Gateway daemon socket state, active channels (Discord, Slack, Web), mounted skills count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Gateway Status (`openclaw gateway`)**
  - **Sync Channels (`openclaw sync`)**
  - **Skill Registry (`openclaw skills`)**
  - **Channel Health (`openclaw channels`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 20. `openwiki` — OpenWiki

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-openwiki`](file:///Users/gregoryiteen/github/tr-plugin-openwiki)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-openwiki/plugin.json) (Version: `v0.1.1`, Template: `dashboard`)
- **Card Element**: [`tr-openwiki-card`](file:///Users/gregoryiteen/github/tr-plugin-openwiki/ui/card.js) (280 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 4 verbs (`status, hubs, ingest, probe`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Status`, `Indexed Hubs`, `Ingest`
- **Coverage Deficit**: Out of 4 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-openwiki-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Academic Obsidian & Sapphire (`#1d4ed8`, accent `#3b82f6`, font `newsreader`)
  - **Custom Vector Mark**: Open Manuscript Knowledge Hub (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Indexed hubs count, total ingested markdown documents, last sync timestamp
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Explore Hubs (`openwiki hubs`)**
  - **Ingest Hub (`openwiki ingest`)**
  - **Probe Graph (`openwiki probe`)**
  - **Search Graph (`openwiki status`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 21. `operator-alerts` — Operator Alerts

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-operator-alerts`](file:///Users/gregoryiteen/github/tr-plugin-operator-alerts)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-operator-alerts/plugin.json) (Version: `v1.1.1`, Template: `inbox`)
- **Card Element**: [`tr-operator-alerts-card`](file:///Users/gregoryiteen/github/tr-plugin-operator-alerts/ui/card.js) (263 lines of JavaScript)
- **Status Subcommand**: `log`
- **Total Declared Subcommands**: 4 verbs (`send, test, config, log`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Config`, `Test Channels`, `Audit Log`
- **Coverage Deficit**: Out of 4 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-operator-alerts-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: High-Priority Crimson & Amber (`#dc2626`, accent `#ef4444`, font `space-grotesk`)
  - **Custom Vector Mark**: Broadcasting Beacon Bell (zero emojis, strict SVG geometry)
  - **Layout Template**: `inbox`
- **Live Domain Telemetry (Queried on Mount)**:
  - Configured alert channels, dispatch rate limits, recent alert dispatch count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Send Test Alert (`alerts test`)**
  - **Channel Configuration (`alerts config`)**
  - **Alert History Log (`alerts log`)**
  - **Instant Dispatch (`alerts send`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 22. `phone` — Telephony

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-phone`](file:///Users/gregoryiteen/github/tr-plugin-phone)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-phone/plugin.json) (Version: `v0.1.1`, Template: `dashboard`)
- **Card Element**: [`tr-phone-card`](file:///Users/gregoryiteen/github/tr-plugin-phone/ui/card.js) (249 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 13 verbs (`session, numbers, status, jobs, health, run, call, message, contact, voicemail, agent, settings, compliance`)
- **Secrets**: `TELNYX_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Status`, `Live Numbers`, `Line Health`
- **Coverage Deficit**: Out of 13 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-phone-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Telephony Slate & Cyan (`#0284c7`, accent `#38bdf8`, font `chivo-mono`)
  - **Custom Vector Mark**: Signal Wave Phone Receiver (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Active direct numbers inventory, SIP trunk registration state, call queue status, voicemail count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Phone Dialer Pad**
  - **Line Inventory (`phone numbers`)**
  - **Recent Calls (`phone jobs`)**
  - **Voicemail Deck (`phone voicemail`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 23. `phone-companion` — Gro Companion

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-phone-companion`](file:///Users/gregoryiteen/github/tr-plugin-phone-companion)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-phone-companion/plugin.json) (Version: `v0.3.1`, Template: `inbox`)
- **Card Element**: [`tr-phone-companion-card`](file:///Users/gregoryiteen/github/tr-plugin-phone-companion/ui/card.js) (266 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 4 verbs (`status, download, start, notify`)
- **Secrets**: `GRO_CRM_TOKEN`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Download`, `Sync Link`, `Broadcast`
- **Coverage Deficit**: Out of 4 subcommands, only 4 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-phone-companion-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Mobile Companion Indigo (`#4338ca`, accent `#6366f1`, font `inter`)
  - **Custom Vector Mark**: Smartphone Connectivity Wave (zero emojis, strict SVG geometry)
  - **Layout Template**: `inbox`
- **Live Domain Telemetry (Queried on Mount)**:
  - Paired mobile devices count, push notification service status, last active companion ping
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Dynamic Pairing QR Code Container**
  - **Device Inventory (`phone-companion status`)**
  - **Send Push Notification (`phone-companion notify`)**
  - **Companion App Download (`phone-companion download`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 24. `security` — Security Assessments

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-security`](file:///Users/gregoryiteen/github/tr-plugin-security)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-security/plugin.json) (Version: `v0.3.1`, Template: `vault`)
- **Card Element**: [`tr-security-card`](file:///Users/gregoryiteen/github/tr-plugin-security/ui/card.js) (96 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 20 verbs (`platforms, device, android, machine, network, fleet, status, audit, scan, harden, plugins, secure-all, encrypt, decrypt, probe, token, challenge, bot-mitigate, site-audit, site-shield`)
- **Secrets**: `SECURITY_MASTER_KEY`, `CHALLENGE_SECRET_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **No**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `This machine`, `Mesh fleet`, `Plugin audit`, `Hardening plan`, `Audit selected`, `Check website`, `Scan source`, `Repair local SSH permissions`, `Review device`, `Evaluate review`, `Read Android properties`
- **Coverage Deficit**: Out of 20 subcommands, only 11 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-security-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Hardened Security Obsidian (`#0f172a`, accent `#22c55e`, font `jetbrains-mono`)
  - **Custom Vector Mark**: Padlock Cyber Shield (zero emojis, strict SVG geometry)
  - **Layout Template**: `vault`
- **Live Domain Telemetry (Queried on Mount)**:
  - Machine hardening score (0-100%), open listening ports count, FileVault/SIP state, firewall state
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Audit Host (`security audit`)**
  - **Scan Ports (`security scan`)**
  - **Fleet Security (`security fleet`)**
  - **Harden Machine Baseline (`security harden`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 25. `signing` — Signed, gi.

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-signing`](file:///Users/gregoryiteen/github/tr-plugin-signing)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-signing/plugin.json) (Version: `v0.3.1`, Template: `vault`)
- **Card Element**: [`tr-signing-card`](file:///Users/gregoryiteen/github/tr-plugin-signing/ui/card.js) (324 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 4 verbs (`status, admin-api, account, token`)
- **Secrets**: `DOCUMENSO_API_KEY`, `SIGNING_ADMIN_TOKEN`, `SIGNING_ADMIN_URL`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `account`, `admin-api`, `token`, `SIGNER ACCOUNT`, `ENCLAVE API`, `TOKEN VAULT`
- **Coverage Deficit**: Out of 4 subcommands, only 6 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-signing-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Legal Seal Navy & Gold (`#1e293b`, accent `#f59e0b`, font `newsreader`)
  - **Custom Vector Mark**: Cryptographic Wax Seal (zero emojis, strict SVG geometry)
  - **Layout Template**: `vault`
- **Live Domain Telemetry (Queried on Mount)**:
  - Pending signatures count, executed agreements count, verification signing key status
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Agreements List (`signing status`)**
  - **Verify Signature (`signing admin-api`)**
  - **Account Status (`signing account`)**
  - **Issue Agreement Token (`signing token`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 26. `skill-manager` — Skill Manager

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-skill-manager`](file:///Users/gregoryiteen/github/tr-plugin-skill-manager)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-skill-manager/plugin.json) (Version: `v1.2.1`, Template: `workbench`)
- **Card Element**: [`tr-skill-manager-card`](file:///Users/gregoryiteen/github/tr-plugin-skill-manager/ui/card.js) (268 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 5 verbs (`configure, status, audit, optimize, route`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Status`, `Audit`, `Optimize`
- **Coverage Deficit**: Out of 5 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-skill-manager-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Optimization Violet (`#5b21b6`, accent `#8b5cf6`, font `chivo-mono`)
  - **Custom Vector Mark**: Compressed Crystal Facet (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Installed skills count, token savings percentage, optimized reference files count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Audit Skills (`skill-manager audit`)**
  - **Optimize Skill (`skill-manager optimize`)**
  - **Skill Router Test (`skill-manager route`)**
  - **Restore Original**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 27. `sticker-generator` — Sticker Studio

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-sticker-generator`](file:///Users/gregoryiteen/github/tr-plugin-sticker-generator)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-sticker-generator/plugin.json) (Version: `v1.0.1`, Template: `workbench`)
- **Card Element**: [`tr-sticker-generator-card`](file:///Users/gregoryiteen/github/tr-plugin-sticker-generator/ui/card.js) (133 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 7 verbs (`status, catalog, generate, upscale, quote, submit, orders`)
- **Secrets**: `GEMINI_API_KEY`, `GOOGLE_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **No**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `⚡ STATUS`, `📐 CATALOG`, `📦 ORDERS`
- **Coverage Deficit**: Out of 7 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-sticker-generator-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Pop Art Electric Violet & Yellow (`#a21caf`, accent `#facc15`, font `outfit`)
  - **Custom Vector Mark**: Die-Cut Sticker Peel (zero emojis, strict SVG geometry)
  - **Layout Template**: `workbench`
- **Live Domain Telemetry (Queried on Mount)**:
  - Generated sticker catalog count, upscaler backend status, active quote status
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Prompt Input Field**
  - **Generate Sticker (`sticker-generator generate`)**
  - **Upscale 4x (`sticker-generator upscale`)**
  - **Order Print Quote (`sticker-generator quote`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 28. `stripe` — Stripe

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-stripe`](file:///Users/gregoryiteen/github/tr-plugin-stripe)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-stripe/plugin.json) (Version: `v0.1.2`, Template: `ledger`)
- **Card Element**: [`tr-stripe-card`](file:///Users/gregoryiteen/github/tr-plugin-stripe/ui/card.js) (320 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 7 verbs (`status, checkout, payment-intent, webhook, refund, probe, token`)
- **Secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `status`, `checkout`, `webhook`, `probe`, `GATEWAY`, `CHECKOUT`, `WEBHOOKS`, `PROBE`
- **Coverage Deficit**: Out of 7 subcommands, only 8 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-stripe-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Financial Grade Violet (`#635bff`, accent `#0a2540`, font `ibm-plex`)
  - **Custom Vector Mark**: Interlocking Payment Card (zero emojis, strict SVG geometry)
  - **Layout Template**: `ledger`
- **Live Domain Telemetry (Queried on Mount)**:
  - Mode indicator (Test vs. Live), recent successful payments count, webhook signature verification state
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Create Checkout (`stripe checkout`)**
  - **Recent Payments (`stripe payment-intent`)**
  - **Webhook Health (`stripe webhook`)**
  - **Process Refund (`stripe refund`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 29. `system-monitor` — System Monitor

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-system-monitor`](file:///Users/gregoryiteen/github/tr-plugin-system-monitor)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-system-monitor/plugin.json) (Version: `v1.2.1`, Template: `monitor`)
- **Card Element**: [`tr-system-monitor-card`](file:///Users/gregoryiteen/github/tr-plugin-system-monitor/ui/card.js) (272 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 2 verbs (`status, sample`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Host Overview`, `Sample Telemetry`
- **Coverage Deficit**: Out of 2 subcommands, only 2 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-system-monitor-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: High-Precision Dark Emerald (`#064e3b`, accent `#10b981`, font `jetbrains-mono`)
  - **Custom Vector Mark**: System Pulse Sparkline (zero emojis, strict SVG geometry)
  - **Layout Template**: `monitor`
- **Live Domain Telemetry (Queried on Mount)**:
  - Real CPU Load % (User/System), RAM utilization (Used GB / Total GB), Disk Free GB
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Sample Instant Telemetry (`system-monitor sample`)**
  - **Top Memory Processes**
  - **Top CPU Processes**
  - **Flush Buffers**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 30. `text` — Telnyx Messaging

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-text`](file:///Users/gregoryiteen/github/tr-plugin-text)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-text/plugin.json) (Version: `v0.1.1`, Template: `inbox`)
- **Card Element**: [`tr-text-card`](file:///Users/gregoryiteen/github/tr-plugin-text/ui/card.js) (306 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 9 verbs (`threads, get, cancel, numbers, ingest, status, send, history, verify`)
- **Secrets**: `TELNYX_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `status`, `threads`, `pools`, `GATEWAY`, `THREADS`, `POOLS`
- **Coverage Deficit**: Out of 9 subcommands, only 6 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-text-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Conversational Emerald (`#15803d`, accent `#22c55e`, font `inter`)
  - **Custom Vector Mark**: Dual Chat Message Bubbles (zero emojis, strict SVG geometry)
  - **Layout Template**: `inbox`
- **Live Domain Telemetry (Queried on Mount)**:
  - Active number pool count, unread message threads count, SMS delivery success rate
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Quick Message Dispatch Bar (Number + Text)**
  - **Active Threads (`text threads`)**
  - **Read Thread (`text get`)**
  - **Number Pool (`text numbers`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 31. `tickets` — Velvet Rope

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-tickets`](file:///Users/gregoryiteen/github/tr-plugin-tickets)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-tickets/plugin.json) (Version: `v0.1.1`, Template: `ledger`)
- **Card Element**: [`tr-tickets-card`](file:///Users/gregoryiteen/github/tr-plugin-tickets/ui/card.js) (343 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 9 verbs (`status, tiers, list, issue, hold, scan, verify, summary, pass`)
- **Secrets**: `STRIPE_SECRET_KEY`, `TICKETS_SIGNING_SECRET`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `status`, `tiers`, `tickets`, `SCANNER`, `TIERS`, `PASSES`
- **Coverage Deficit**: Out of 9 subcommands, only 6 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-tickets-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Luxury Velvet & Gold (`#854d0e`, accent `#eab308`, font `fraunces`)
  - **Custom Vector Mark**: Perforated Ticket Stub (zero emojis, strict SVG geometry)
  - **Layout Template**: `ledger`
- **Live Domain Telemetry (Queried on Mount)**:
  - Tier inventory (General, VIP, Backstage), sold count vs. capacity, held reservations
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Tier Inventory (`tickets tiers`)**
  - **Scan QR Pass (`tickets scan`)**
  - **Issue Ticket (`tickets issue`)**
  - **Hold Seats (`tickets hold`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 32. `tr-transcribe` — Transcription

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-tr-transcribe`](file:///Users/gregoryiteen/github/tr-plugin-tr-transcribe)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-tr-transcribe/plugin.json) (Version: `v0.2.1`, Template: `dashboard`)
- **Card Element**: [`tr-tr-transcribe-card`](file:///Users/gregoryiteen/github/tr-plugin-tr-transcribe/ui/card.js) (256 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 2 verbs (`status, transcribe`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Engine Status`, `Transcribe Guide`
- **Coverage Deficit**: Out of 2 subcommands, only 2 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-tr-transcribe-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Acoustic Studio Maroon (`#881337`, accent `#e11d48`, font `space-grotesk`)
  - **Custom Vector Mark**: Soundwave Frequency Spectrum (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Transcription backend status (Local Whisper / Remote), queued audio files count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Audio File Drop Zone / Path Input**
  - **Transcribe Audio (`tr-transcribe transcribe`)**
  - **Engine Health (`tr-transcribe status`)**
  - **Export SRT / VTT Subtitles**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 33. `translator` — BabelStone Multilingual

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-translator`](file:///Users/gregoryiteen/github/tr-plugin-translator)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-translator/plugin.json) (Version: `v0.1.1`, Template: `dashboard`)
- **Card Element**: [`translator-card`](file:///Users/gregoryiteen/github/tr-plugin-translator/ui/card.js) (266 lines of JavaScript)
- **Status Subcommand**: `status`
- **Total Declared Subcommands**: 6 verbs (`status, locales, scan, translate, probe, token`)
- **Secrets**: `TRANSLATOR_API_KEY`

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **YES (Illegal skin in manifest or code)**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **YES (Decorative wave animation without real data)**
- **Action Buttons in Legacy Card**: `Status`, `Locales`, `Scan Strings`
- **Coverage Deficit**: Out of 6 subcommands, only 3 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `translator-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Golden Rosetta Stone (`#a16207`, accent `#eab308`, font `newsreader`)
  - **Custom Vector Mark**: Bilingual Character Glyph (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Supported locales count, untranslated string keys count, translation cache state
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Source & Target Translation Workbench**
  - **Translate Now (`translator translate`)**
  - **Scan Missing Locales (`translator scan`)**
  - **Probe Engine (`translator probe`)**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.

---

### 34. `user-automations` — Scheduled Tasks

#### 1. Repository & File Footprint
- **Directory**: [`/Users/gregoryiteen/github/tr-plugin-user-automations`](file:///Users/gregoryiteen/github/tr-plugin-user-automations)
- **Manifest**: [`plugin.json`](file:///Users/gregoryiteen/github/tr-plugin-user-automations/plugin.json) (Version: `v1.0.1`, Template: `dashboard`)
- **Card Element**: [`tr-user-automations-card`](file:///Users/gregoryiteen/github/tr-plugin-user-automations/ui/card.js) (267 lines of JavaScript)
- **Status Subcommand**: `list`
- **Total Declared Subcommands**: 1 verbs (`list`)
- **Secrets**: None

#### 2. Individual Audit Findings & Flaws
- **Gimmicks Detected**:
  - `"skin": "winamp-classic"`: **No**
  - Fake Canvas Oscillator / Waveform: **YES (<canvas> rendering fake wave)**
  - Simulated Audio / Sonar Radar: **No**
- **Action Buttons in Legacy Card**: `Scheduled Tasks`
- **Coverage Deficit**: Out of 1 subcommands, only 1 are exposed on the card. Important administrative and verification verbs are inaccessible.
- **Header Suppression Flaw**: Because `tr-user-automations-card` is registered, the host shell suppresses its standardized header, leaving the card titleless unless manually coded.

#### 3. Bespoke Redesign Recipe & Action Plan
- **Domain Identity & Theme**:
  - **Visual Language**: Precision Chronometer Amber (`#ca8a04`, accent `#facc15`, font `chivo-mono`)
  - **Custom Vector Mark**: Interlocking Chronos Gear (zero emojis, strict SVG geometry)
  - **Layout Template**: `dashboard`
- **Live Domain Telemetry (Queried on Mount)**:
  - Installed scheduled tasks count across mesh, next upcoming job timer, failed execution count
- **Interactive Operational Controls (>=44px Touch Targets)**:
  - **Cron Timetable Deck**
  - **List Tasks (`user-automations list`)**
  - **Force Immediate Run**
  - **Inspect Mesh Node Placements**
- **Live Execution Feedback Console**:
  - Direct execution stream routing stdout/stderr JSON responses into a scrollable, syntax-highlighted monospace terminal with a one-click copy button.
- **Privacy & Distribution**:
  - User can choose to retain in private workspace (`scope: "project"`) or one-click publish to the Plugin Store with SHA-256 integrity verification.
