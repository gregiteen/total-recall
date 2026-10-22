# TR_MARKETING_LAUNCH — Audit

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Audit Status**: Complete
> **Audited commit**: 65427222385b0a55c72fe93782a0ede791845311

---

## Process note

None. Clean audit initiated prior to documentation generation and implementation.

## 1. Scope and method

- Request being audited: Launch strategy, brand naming, positioning, and market penetration campaign for Total Recall as the definitive vibe coding brain across makers, builders, founders, and sellers.
- Repositories and paths in scope:
  - `README.md` (public face and primary npm / GitHub gateway)
  - `package.json` (metadata, keywords, description, binary entry points)
  - `docs/` (reference manuals, architecture documentation, OpenWiki knowledge hubs)
  - `src/cli/` and `bin/` (CLI entry surfaces and onboarding journeys)
  - `templates/openwiki/` and `scaffold/openwiki/` (documentation integration surfaces)
- Out of scope:
  - Destructive alterations to underlying SSSS schema specifications.
  - Private repository code outside the public open-source Total Recall boundary.
- Audit method:
  - Verified local repository state at commit `65427222385b0a55c72fe93782a0ede791845311`.
  - Executed Total Recall CLI diagnostic suites (`total-recall doctor`, `code-quality report`, `check:package`, `check:dist`, `check:ssss-registry`, `check-scaffold-state`).
  - Executed global and local memory searches via `total-recall recall` and verified context capsules via `total-recall context`.
  - Conducted web-grounded research regarding 2026 vibe coding adoption, memory architecture benchmarks, and competitive positioning.

## 2. Inventory

| Area | Path | Size | Authored / generated | Tracked in git |
|---|---|---|---|---|
| Project Manifest | `package.json` | 3.5 KB | Authored | Yes |
| Primary Landing | `README.md` | 7.2 KB | Authored | Yes |
| Core Binary | `bin/total-recall.mjs` | 13.8 KB | Authored | Yes |
| Memory Binary | `bin/total-recall-memory.mjs` | 4.2 KB | Authored | Yes |
| Public Architecture | `docs/ARCHITECTURE.md` | 29.4 KB | Authored | Yes |
| Documentation Hubs | `docs/` | 14 folders | Authored | Yes |
| OpenWiki Scaffold | `scaffold/openwiki/` | 8 files | Authored | Yes |

- Entry points: `bin/total-recall.mjs`, `bin/total-recall-memory.mjs`, `src/server/index.mjs`, `src/server/memory-server.mjs`.
- Largest files in scope: `docs/ARCHITECTURE.md` (29.4 KB), `bin/total-recall.mjs` (13.8 KB).
- Tracked artifacts: Clean public repository containing zero prohibited binaries or credentials.

## 3. Runtime surface

### Routes / commands
| Route or command | Method | Who can call it | File:line | Notes |
|---|---|---|---|---|
| `total-recall init` | CLI | Developer | `bin/total-recall.mjs:42` | Bootstraps personal brain |
| `total-recall connect <client>` | CLI | Developer | `bin/total-recall.mjs:51` | Wires IDE agent surface |
| `total-recall remember` | CLI | Developer / Agent | `bin/total-recall.mjs:52` | Records persistent facts |
| `total-recall recall` | CLI | Developer / Agent | `bin/total-recall.mjs:53` | Retrieves local memory nodes |
| `total-recall context` | CLI | Developer / Agent | `bin/total-recall.mjs:54` | Enforces mandatory rule capsule |
| `total-recall openwiki status` | CLI | Developer | `src/cli/handlers/openwiki.mjs:12` | Inspects OpenWiki state |
| `total-recall openwiki ingest` | CLI | Developer | `src/cli/handlers/openwiki.mjs:30` | Ingests documentation hubs |
| `/api/memory/*` | HTTP | Local process / Authenticated client | `src/server/memory-app.mjs:40` | Port 3000 / 3900 HTTP gateway |

### Scheduled jobs and background processes
- Total Recall background daemon maintains periodic memory dreaming, graph compaction, and cross-mesh synchronization.

### Environment variables
| Variable | Read at | Purpose | Source of value |
|---|---|---|---|
| `TR_SECRETS_BRAIN` | CLI authentication handlers | Selects active encrypted vault | Host environment |
| `AGENT_DIR` | Core agent paths | Explicit agent directory anchor | Host environment |
| `TR_EMBEDDINGS_DISABLED` | Retrieval core | Enables provider-free local search | Host environment |

## 4. Data and state

| State | Location | Format | Writer | Personal data? | Deployed / synced? |
|---|---|---|---|---|---|
| Project Memory | `<repo>/.agent/skills/total-recall/` | SSSS Markdown & SQLite | Developer / CLI | None | Optional Git |
| Global Memory | `~/.agent/skills/total-recall/` | SSSS Markdown & SQLite | Greg / CLI | Operator facts | Local device only |
| OpenWiki Hubs | `openwiki/` or docs paths | Markdown documents | Developer / Agent | Technical documentation | Optional Git |

## 5. Integrations

| Service | Account / credential | Where the credential comes from | Used at |
|---|---|---|---|
| NPM Registry | `@gregiteen` publisher | Local npm token / Auth plugin | Package releases |
| GitHub | `gregiteen/total-recall` | Local git SSH credentials | Repository distribution |
| Local LLM / Providers | Embeddings API keys | Encrypted vault (`secrets.enc`) | Semantic indexing |

## 6. Security and privacy

- Authentication paths: Biometric FIDO2 WebAuthn, master password hashes, and isolated access tokens via the auth plugin.
- Secret exposure prevention: Strict rule forbidding raw credentials or keys within repository tracking.
- Visibility boundaries: Only `total-recall` and `ssss` remain public open-source repositories; private plugins remain separated.

## 7. Standing-rule conflicts

| Rule (source) | Conflict found | Evidence | Finding |
|---|---|---|---|
| No prohibited IDE mentions | Existing documentation references banned IDE strings | `docs/IDE_INTEGRATION.md` and related files contain historical IDE references | F-001 |
| Sentence-ending prepositions | Prior copy occasionally concludes clauses with prepositions | Historical docs lines | F-002 |
| Public visibility invariant | Package documentation must maintain open-source boundaries | `README.md` correctly models the open core | Compliant |

## 8. Quality baseline

- Host and command: Mac mini (Darwin arm64), executing deterministic fast code-quality verification suite.
- Baseline snapshot: Working tree commit `65427222385b0a55c72fe93782a0ede791845311`.
- Evidence provenance: Directly inspected execution via agent tool calls on 2026-10-21.
- Results:
  - `memory-package`: Passed (0 errors, 1.4s).
  - `dist-freshness`: Passed (0 errors, 0.1s).
  - `open-source-paths`: Passed (0 errors, 0.0s).
  - `shipped-package-paths`: Passed (0 errors, 0.0s).
  - `scaffold-brain-state`: Passed (0 errors, 0.1s).
  - `ssss-registry`: Passed (0 errors, 0.3s).
  - System doctor diagnostic: Port 3000 verified active, instruction surfaces fully synchronized.

## 9. Debt and dead code

- The current public description ("Portable personal memory for any IDE") understates the systemic power of the engine.
- Vibe coding mindshare has exploded, yet developers lack a structured brand anchor linking spontaneous prompting to persistent architectural sovereignty.
- OpenWiki documentation hubs remain unlinked from the primary developer onboarding story.

## 10. Deploy and operations

- Total Recall publishes through standard npm packaging (`npm publish`).
- Surfaces compile deterministically through `node bin/total-recall.mjs compile`.
- Zero disruption to existing production mesh nodes during documentation and positioning rollouts.

## 11. Content and product fit

- Modern builders (founders, creators, vibe coders, digital sellers) suffer from the "Goldfish Problem." When context windows exhaust or sessions restart, their agents forget database rules, product tone, and business invariants.
- Positioning Total Recall as **The Vibe Brain** transforms the perception of the tool from an abstract memory utility into an indispensable cognitive coprocessor.

## 12. Findings register

| ID | Severity | Evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|
| F-001 | P1-high | Historical documents reference prohibited IDE terms | Potential breach of instruction directives | Purge prohibited IDE strings across marketing copy | Fix in this project |
| F-002 | P1-high | Historical prose occasionally ends sentences with prepositions | Direct rule violation | Enforce rigorous preposition syntax across all project copy | Fix in this project |
| F-003 | P0-critical | Current branding lacks viral hook for 2026 vibe coding explosion | Low organic conversion and click-through | Launch dedicated brand campaign establishing Total Recall as The Sovereign Vibe Brain | Fix in this project |
| F-004 | P1-high | OpenWiki integration remains detached from onboarding | Users miss persistent documentation hubs | Connect OpenWiki explicitly into the vibe coding developer journey | Fix in this project |

## 13. Impact on the requested change

- Findings F-001 through F-004 directly shape the new marketing launch architecture, positioning Total Recall as the definitive persistent memory engine for autonomous builders.

## 14. Decisions

- Decision 1 (Brand Name & Hook): Adopt **Total Recall — The Sovereign Vibe Brain** with consumer-facing shorthand **VibeBrain**.
  - Default recommendation: Use "Total Recall: The Sovereign Vibe Brain" across technical domains, using "Vibe Brain" as the viral campaign hook.
- Decision 2 (Audience Segment Matrix): Target four distinct user personas: Makers (rapid prototypes), Builders (full-stack production), Founders (autonomous company operating systems), and Sellers (ecommerce and multi-channel distribution).
  - Default recommendation: Structure marketing playbooks tailored explicitly for each persona.
