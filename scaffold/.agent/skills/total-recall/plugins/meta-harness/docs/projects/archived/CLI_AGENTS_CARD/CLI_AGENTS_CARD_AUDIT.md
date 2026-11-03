# CLI_AGENTS_CARD — Audit

> **Project Prefix**: `CLI_AGENTS_CARD`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-10-25
> **Audit Status**: Complete
> **Audited commit**: `3047ee7caea8546a1becf1e57e1cfe259d1ed302`

---

## Process note
None. Audit is written first before any subsequent documents or code modifications.

## 1. Scope and method
- **Request being audited for:** Eradicate legacy card template containing copied 3-box metric strips (`.telemetry-row`), terminal readout text sinks (`#card-out`), missing `ui/DESIGN.md`, and raw CSS hex values. Replace with an authentic, purpose-built Command Fleet coordination console.
- **Repositories / paths in scope:** `/Users/gregoryiteen/github/tr-plugin-cli-agents/ui/card.js`, `/Users/gregoryiteen/github/tr-plugin-cli-agents/ui/DESIGN.md`, `/Users/gregoryiteen/github/tr-plugin-cli-agents/test/`.
- **Out of scope:** Core CLI agent coordination and dispatch logic (`src/runtime.mjs`, `src/dispatch.mjs`, `src/docs.mjs`).
- **Audit method:** Full source reading, AST pattern search, CLI execution tests, and `record.mjs` validator analysis.

## 2. Inventory
| Area | Path | Size | Authored / generated | Tracked in git |
|---|---|---|---|---|
| Card Face | `ui/card.js` | 13.7 KB | Authored (legacy template) | Tracked |
| Design Tokens | `ui/DESIGN.md` | Absent | Missing | Uncommitted |
| Plugin Manifest | `plugin.json` | 6.8 KB | Authored | Tracked |
| Runtime Core | `src/runtime.mjs` | 9.1 KB | Authored | Tracked |
| Test Suite | `test/cli-agents.test.mjs` | 12.3 KB | Authored | Tracked |

- **Entry points:** `cli.mjs` (CLI command), `ui/card.js` (Web Component `<command-fleet-card>`).
- **Tracked but should not be:** None.

## 3. Runtime surface
### Routes / commands
| Route or command | Method | Who can call it | File:line | Notes |
|---|---|---|---|---|
| `status` | CLI | Operator / UI | `cli.mjs:15` | Overall fleet readiness status |
| `catalog` | CLI | Operator / UI | `cli.mjs:15` | Discovered terminal coding agents |
| `nodes` | CLI | Operator / UI | `cli.mjs:15` | Agent capabilities across mesh nodes |
| `inspect` | CLI | Operator / UI | `cli.mjs:15` | Deep inspection of specific agent |
| `docs-status` | CLI | Operator / UI | `cli.mjs:15` | Freshness of official documentation |

### Scheduled jobs and background processes
Documentation refresh is scheduled through the Total Recall daemon.

### Environment variables
None required.

## 4. Data and state
| State | Location | Format | Writer | Personal data? | Deployed / synced? |
|---|---|---|---|---|---|
| Agent Docs Cache | `data/docs/` | Markdown files | `src/docs.mjs` | No | Local filesystem only |
| Agent Inventory | `.agent/skills/cli-agents/` | JSON files | `src/runtime.mjs` | No | Project memory |

## 5. Integrations
| Service | Account / credential | Where the credential comes from | Used at |
|---|---|---|---|
| None | N/A | Authenticates directly via local CLI bins | Process execution |

## 6. Security and privacy
- **Authentication:** Scoped permission booleans gate commands (`read`, `write`, `send`, `destructive`).
- **Token handling:** Redacts raw tokens from command argv and transcripts.

## 7. Standing-rule conflicts
| Rule (source) | Conflict found | Evidence | Finding |
|---|---|---|---|
| `invariants-297721bb` (No templates) | Stamped-out 3-metric strip and terminal readout box | `ui/card.js:129,380` | `A-001` |
| `invariants-4f742f48` (Bespoke design) | Raw terminal stdout text sink (`#card-out`) | `ui/card.js:70,380` | `A-002` |
| Design Tokens | 23 raw hex codes and missing `ui/DESIGN.md` | `record.mjs` warning | `A-003` |
| Motion Invariant | Missing `prefers-reduced-motion` media queries | `ui/card.js:150` | `A-004` |

## 8. Quality baseline
- **Host and command:** Mac mini (`darwin-arm64`), `npm test`.
- **Result:** 15 tests pass, 0 fail.
- **Record Validator:** 15 passed, 0 failed, 4 warnings (`A-001` through `A-004`).

## 9. Debt and dead code
The `#card-out` element is used as an untyped text dump for multiple actions, failing to display structured agent discovery status, model limits, and official doc freshness.

## 10. Deploy and operations
- Shipped as standard Total Recall plugin package via npm (`tr-plugin-cli-agents`).
- Rebuilding card face has zero breaking impact on CLI commands.

## 11. Content and product fit
Card claims to be "Command Fleet Coordination" but renders a generic 3-box metric strip and terminal box instead of a multi-agent discovery matrix and fleet node inspection dashboard.

## 12. Findings register
| ID | Severity | Finding | Evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| A-001 | P0-critical | Template layout using `.telemetry-row` metric strip | `ui/card.js:129` | Violates no-template rule | Replace with bespoke Fleet Agent Matrix | fix in this project |
| A-002 | P0-critical | Raw terminal output box dumping CLI stdout | `ui/card.js:380` | Unusable text dump | Replace with structured Fleet Inspector | fix in this project |
| A-003 | P1-high | 23 raw hex values and missing `ui/DESIGN.md` | `record.mjs` | Missing design tokens | Author `ui/DESIGN.md` and `--face-*` tokens | fix in this project |
| A-004 | P1-high | Missing reduced motion accessibility rules | `record.mjs` | Accessibility failure | Implement `prefers-reduced-motion` | fix in this project |

## 13. Impact on the requested change
Resolving findings A-001 through A-004 delivers a completely bespoke, highly functional command fleet console.

## 14. Decisions
| Question | Recommended default | Answer |
|---|---|---|
| What structured data should the card display? | Discovered CLI agents (Claude, DSH, Hermes, AGY, Codex, etc.), authentication state, and doc freshness | Adopted |
| How should nodes be switched? | Interactive mesh node selector chips | Adopted |

## Completion checklist
- [x] Sections 1–14 filled
- [x] Baseline tests run before any change (15/15 pass)
- [x] Every finding has a severity and disposition
- [x] `Audit Status` set to Complete on audited commit `3047ee7caea8546a1becf1e57e1cfe259d1ed302`
