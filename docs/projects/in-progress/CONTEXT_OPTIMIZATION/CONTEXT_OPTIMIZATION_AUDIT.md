# CONTEXT_OPTIMIZATION — Audit

> **Project Prefix**: `CONTEXT_OPTIMIZATION`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Audit Status**: Complete
> **Audited commit**: 5b67b20b73a3bd2896036e26cb02ba917fafbfb5

---

## Process note

The preceding conversation analyzed context overhead without modifying code. This audit was the first project document. The remote baseline finished and was inspected before this audit was marked Complete and before the other four documents were created. This request authorizes project creation and planning; implementation remains pending. Audit completion does not imply clean release gates or live retrieval readiness.

## 1. Scope and method

Request: create a new context optimization project from the preceding recommendation. Reduce Total Recall's session context while preserving applicable instructions, user-authored rules, memory ownership and reliable action coverage.

Scope: static instruction compilation, dynamic context assembly, plugin contributions, skill discovery and generated repository experts, installation/scaffold propagation, measurement and verification. All implementation work stays in this repository. Host application context, unrelated integrations, production changes and other repositories are excluded.

Code inspection spans the current and preceding read-only turns. Whole-file reads: `src/core/context-compiler.mjs`, `src/core/plugin-context.mjs`, `src/server/routes/context.mjs`, `src/cli/repo-expert-generate.mjs`, `src/core/context-cache.mjs`, `vitest.config.ts`, package manifest, applicable skills and gate configuration. Section reads reconstruct the relevant surface compiler; searches cover call sites, environment variables, scaffold ownership and existing tests. Generator inventories are candidates, not authoritative API contracts. No memory-vault files were searched or edited manually.

Commands: `git status --short --branch`, `git rev-parse HEAD`, targeted `rg`, `wc -l -w -c`, `node bin/total-recall.mjs startup check --json`, mesh access/SSH, a clean `git archive`, and the remote background gate. Command outputs are observations, not inferred deployment evidence.

## 2. Inventory

| Area | Path | Observed size | Authored / generated | Git status |
| --- | --- | --- | --- | --- |
| Static compiler | `src/core/surface.mjs` | 946 lines | Authored | Tracked |
| Dynamic compiler | `src/core/context-compiler.mjs` | 412 lines | Authored | Tracked |
| Repository expert generator | `src/cli/repo-expert-generate.mjs` | 577 lines | Authored | Tracked |
| Instruction surface | `AGENTS.md` | 259 lines; 38,759 bytes; 5,574 words | Managed injection plus authored content | Not tracked in this snapshot; verified with `git ls-files` |
| Mandatory core skill | `.agent/skills/total-recall/SKILL.md` | 673 lines; 36,958 bytes; 5,250 words | Live canonical skill | Brain-owned; not included by clean Git export |
| Repository expert | `.agent/skills/repo-expert/SKILL.md` | 755 lines; 33,123 bytes; 3,365 words | Generated | Brain-owned; projected into IDE skill directories |

The three observed documents total 108,840 bytes and 14,189 words. Bytes and words are not exact model token counts. Nor does disk duplication prove multiple full bodies were loaded into one prompt. The actual session supplied duplicate skill catalog entries; client prompt provenance is not yet measured.

Entry points: `bin/total-recall.mjs` dispatches `compile` to `src/cli/rebuild.mjs` (bin:76); `skill generate-expert` reaches the generator through `src/cli/skill.mjs:745`; server context routes are mounted by `src/server/rest.mjs:232`. Generated shims are written by `src/core/surface.mjs:635` and `:725`.

`git ls-files '*.env*' '*secrets.enc*' '*context*'` returned `.env.example` and context source/spec files, with no encrypted secret store. This targeted check is not an exhaustive secrets scan. No personal vault export is included in the baseline.

## 3. Runtime surface

| Route / command | Access | Evidence | Behavior |
| --- | --- | --- | --- |
| `total-recall compile` / `rebuild` | Local CLI filesystem authority | `bin/total-recall.mjs:76`; `surface.mjs:780` | Merges rules, writes shims, indexes and projections |
| `total-recall remember` | Local CLI filesystem authority | `src/cli/remember.mjs:348` | Validated write, then detached background compile |
| `total-recall connect` | Local CLI filesystem authority | `src/cli/connect.mjs:782` | Compiles and projects client skills |
| `total-recall skill generate-expert` | Local CLI filesystem authority | `repo-expert-generate.mjs:558` | Scans a repository and writes a large SKILL.md |
| `POST /api/context` | Authentication + `memory:read` | `src/server/routes/context.mjs:12` | Query-based assembly |
| `GET /api/context/preview` | Authentication + `memory:read` | `src/server/routes/context.mjs:32` | Candidate preview |
| `POST /api/context/stream` | Authentication + `memory:read` | `src/server/routes/context.mjs:43` | Parallel ranking path; not required for the proposed selector |
| `GET /api/context/flash/health` | Authentication + `memory:read` | `src/server/routes/context.mjs:64` | Provider health probe |

Background paths: compile after remember (`remember.mjs:362`); plugin filesystem watchers (`plugin-context.mjs:153`); long-lived surface module freshness guard (`surface.mjs:28`). Live startup reported server 3.32.4 ready and daemon running, but instruction access HTTP 403. No restart or credential modification occurred.

| Variable | Read at | Purpose / origin |
| --- | --- | --- |
| `TR_RULE_BUDGET_CHARS` | `surface.mjs:377` | User override for section character budgets |
| `TR_LLM_COMPACT` | `surface.mjs:303` | Opt-in model compaction; shell/runtime environment |
| `AGENT_DIR`, `_TR_TEST_AGENT_DIR` | `src/cli/connect.mjs:702` | Brain resolution and isolated tests |
| `HOME` | `src/cli/connect.mjs:846` | Client/global projection location; OS environment |
| `GEMINI_API_KEY`, `GOOGLE_API_KEY` | `parallel-context.mjs:170`, `:266` | Parallel provider access; standing user restriction applies |
| `TR_SECRETS_NO_KEYCHAIN`, `TR_ENV_FILE` | `vitest.config.ts:43` | Test secret isolation; suite configuration |

These are the variables in the inspected context paths, not a repository-wide environment inventory. Provider selection and credentials remain governed by existing configuration and secrets resolution.

## 4. Data and state

| State | Location / format | Writer | Privacy and propagation |
| --- | --- | --- | --- |
| Memory and rules | Resolved brain `memory-vault/`, SSSS Markdown | Owning CLI and validated operations | Potentially personal; never export as test fixtures |
| Compaction cache | Resolved `memory-derived/compacted-rules.json` | Surface compiler | Derived rule text; disposable, not anonymous |
| Context sections | Derived section cache and `evolving-context.md` | Context generators | May contain project/research data |
| Instruction surfaces | Connected IDE shims, Markdown | `compilePointers` | Selected content becomes agent-visible |
| Skill packages | Live brain skills plus client projections | Skill registry/connect/generator | Ownership and package support files must survive restructuring |
| Project documentation | This project folder | Documentation edits | Ordinary Markdown, outside memory vault |

The project must use existing SSSS document primitives for any new persistent policy, selection or telemetry state. A disposable cache may be derived from those documents; no new canonical JSON database is proposed. Exact extensions require registry verification during implementation.

## 5. Integrations

Embeddings are obtained through `getEmbedding` in `context-compiler.mjs:262`; optional compaction uses configured `callLocalRuntime` in `surface.mjs:305`. No account, model identifier or provider credential is hardcoded by this project. The parallel context path reads Google credentials and requires standing-rule review before activation. No provider call or provider API change is part of project creation. Mac mini transport uses the CLI-resolved mesh access record; remote tests use existing installed dependencies.

## 6. Security and privacy

Context routes explicitly require authentication and the `memory:read` scope. This audit does not certify the complete authorization stack or selected-vault isolation; the future adapter walkthrough must exercise both. No context-specific cookie change is proposed. The live authenticated instruction probe failed with 403, so live instruction retrieval is unverified.

Plugin generators are dynamically imported and can produce arbitrary text (`plugin-context.mjs:23`). User-authored content, plugin material and facts must not manufacture higher-priority instructions. The current surface claims to override system prompts (`surface.mjs:505`), a misleading privilege claim that must be removed without altering legitimate rule meaning.

Reports should contain identifiers, digests, selection reasons and sizes by default, not raw memories, credentials or transcript bodies. Temporary baseline artifacts contain a clean source archive and gate helper, not the personal brain. Targeted tracked-file inspection found no secret store; exhaustive credential scanning is outside this planning request.

## 7. Standing-rule conflicts

| Standing requirement | Observed conflict | Finding |
| --- | --- | --- |
| Minimize context through portable memory and selective retrieval | Every eligible rule survives static compilation; MUST bypasses budget | A-001 |
| Curated global execution rules | Global rule-category nodes automatically merge into project surfaces unless overridden or explicitly restricted | A-002 |
| Preserve corrections and instruction correctness | Dynamic invariant packing can stop before required nodes; total does not cap first slot | A-003 |
| Progressive disclosure | Every-turn full master skill; generated expert includes broad inventories | A-004 |
| Shared credentials may be valid | Master skill still mandates one credential per repository | A-007 |
| Respect actual instruction hierarchy | Surface claims absolute system override | A-007 |
| Avoid prohibited provider usage | Parallel context code includes Google credential path; no invocation during audit | A-008 |

The rules themselves are not weakened by optimizing activation. Any explicit change to all-rules-visible behavior must be recorded as a deliberate policy replacement, with coverage evidence, rather than hidden through truncation.

## 8. Quality baseline

Sanctioned host: Mac mini, resolved by `node bin/total-recall.mjs mesh access macmini`. Remote Node: v25.9.0. Clean source snapshot: `git archive HEAD` at the audited commit, initially clean local working tree. An existing gate skill package was copied separately because it is outside the Git archive; installed dependencies were linked from the host checkout. This is a clean source-commit baseline with explicit helper/dependency provenance, not a fully locked fresh-install baseline.

Remote isolated directory: `/tmp/tr-context-baseline.0l5DCT`. Command: background `node .agent/skills/code-quality/scripts/check.mjs --tier remote > baseline.log 2>&1`, with exit captured separately in `baseline.exit`. The tier includes full Vitest and configured fast checks. No heavy gate ran on the laptop.

Final run: 2026-10-01T00:39:41.154Z–00:42:39.348Z, inspected directly by Codex. **364 test files and 2,256 tests passed; Vitest exit 0**, 176.31 seconds. Four additional checks passed: open-source paths, shipped-package paths, scaffold brain state and SSSS registry. Dist-freshness alone failed because `frontend/dist` is an ignored build artifact absent from a clean source archive. The wrapper exited **2**, treating that unparsed failure as opaque; the complete gate is not green and this is not release readiness. No source-code failure was observed. Do not rebuild a publication artifact solely to conceal this source-baseline limitation.

Durable evidence: [final gate report](evidence/2026-09-30-baseline-gates.json), [initial report](evidence/2026-09-30-baseline-initial.json), [test summary and provenance](evidence/2026-09-30-baseline-summary.txt). The archive SHA-256 is `b90f64bc33103c8f6f40f8cbfddd2fe0212c271490c8583c67774ef2c9af9b24`; gate config SHA-256 is `6fddd2952c1ff3d5b7b48a21c63b8b5bfb9275ed193be9c028e58d0c6918b390`. The report's `gitHead` is null because the export omits `.git`; audited commit provenance comes from the archive command and digest, not an invented remote Git checkout.

Startup at 2026-10-01T00:34:37.884Z: server ready, authenticated instructions 403, daemon running, SSSS available, app not declared; exit 1. This is not proof of healthy retrieval.

Initial discovery misses: no repository `total-recall` launcher; no `scripts/remote-gates.sh`; gate config is `.agent/skills/code-quality/config.json`, not `scripts/config.json`; compile is dispatched to `rebuild.mjs`, not `compile.mjs`. Corrected paths were used. No success claim depends on those missing paths.

Initial gate exit 2: dist-freshness failed because the clean archive excludes the ignored frontend bundle; SSSS verification failed under the linked host dependencies; Vitest exited 127 because the linked dependencies lacked its executable. This initial run did not execute the test suite. Preserved the initial report. Removed only the isolated dependency symlink and ran background `npm ci` in that snapshot: exit 0, with npm reporting 6 dependency advisories (4 moderate, 2 high). The advisory summary is not a vulnerability diagnosis; no dependency rewrite is authorized by this planning request. SSSS verification and tests passed after installation, establishing an environment/dependency mismatch in the initial run without attributing it to a source regression.

No repository lint/typecheck command exists in the package manifest. Existing specs cover global merges, soft-budget visibility, context dispatch and provider-outage behavior. Gaps: complete rendered-size accounting, conditional critical-rule coverage, action-trigger selection, oversized mandatory sets, projection duplication, version invalidation and real client consumption. Existing tests were read, not represented as executed until baseline completion.

## 9. Debt and dead code

Two independent assemblers have different policies: `buildRulesBlock` and `compileContext`. The dynamic compiler advertises a skills slot but does not assemble one; its token count omits rendered headings/separators. Invariants receive their own ceiling without first respecting the total budget, and packing stops on the first oversized node. Plugin context appends raw blocks after static section budgeting. The repository expert generator emits inventories directly into mandatory entrypoint content. Related code should be consolidated only after behavioral equivalence and action coverage are demonstrated.

Search extension from the user's follow-up: `src/cli/recall.mjs:144` searches brains serially and `:167` invokes semantic fallback when fast results are fewer than `top_k`, even when a valid exact match exists. `src/core/fast-recall.mjs:26` reads/parses the complete metadata index each request; `:69` calls `getNodes` to hydrate results. A cold `getNodes` calls `loadNodes`, which walks, reads and parses every Markdown memory document (`src/core/vault.mjs:89`). `src/core/search.mjs:148` awaits a query embedding before lexical matching. These paths explain possible latency sources, but no stage timings were collected. The current cache watcher calls `unref`; historical watcher hangs must not be asserted as the current cause. Fast mode bypasses semantic fallback but matches metadata rather than bodies. File storage remains canonical; faster derived lookup should avoid all-vault body hydration and expose local/full-text versus semantic modes honestly.

A lightweight, single local read on 2026-10-01 around 00:41 UTC measured `node bin/total-recall.mjs recall <known-project-slug> --project --fast --top-k 1 --format json`: first stdout 5,860 ms, exit 5,935 ms, exit 0, output redacted (992 stdout bytes, 588 stderr bytes). This is not a quality gate, statistical performance baseline or proof of a particular bottleneck. It demonstrates that the observed fast call is slow before output, with approximately 75 ms between first stdout and exit. The remote performance spec measures warm metadata queries over 2,000 entries with an empty vault (`search-performance.spec.mjs:66`), so it does not demonstrate cold populated-vault CLI latency.

## 10. Deploy and operations

No deployment, commit, push or publication is authorized by this request. Package whitelist is in `package.json`; project docs are not separately listed as shipped package files. `scripts/sync-scaffold.mjs:6` copies live brain content into scaffold; `src/core/project-brain.mjs:112` seeds new brains from scaffold. Editing scaffold alone would be overwritten. Future delivery must change canonical sources, regenerate permitted derived copies, preserve user-authored shim content, and verify package and fresh-install behavior.

Rollback: retain previous policy/version and projection digests; restore generated instruction artifacts through the owning compiler and restore canonical rules through validated CLI operations. Never restore an entire personal vault from test exports. Do not overwrite another repo or the mini's existing checkout during baseline verification.

## 11. Content and product fit

Total Recall should retain extensive knowledge while exposing a small task-relevant working set. Current master skill mixes a bootstrap with CLI/API references and operational runbooks. Generated repository expertise mixes routing with exhaustive inventories. User-authored rule wording must remain intact; shorten routing and move references without automatically rewriting corrections. Client-owned context is measured separately from Total Recall-owned overhead, and prompt caching is not claimed to remove text from the context window.

## 12. Findings register

| ID | Severity | Finding / evidence | Impact | Recommendation | Disposition |
| --- | --- | --- | --- | --- | --- |
| A-001 | P1-high | Soft section limits; MUST bypass; overflow indexes (`surface.mjs:463`; `surface.spec.mjs:124`) | Permanent context grows with vault | Separate activation from modality; enforce assembled budget | Fix in this project |
| A-002 | P1-high | Automatic global rules merge; missing restrictions apply everywhere (`surface.mjs:406`, `:765`) | Unrelated product rules enter projects | Curated universal set plus explicit scope/action applicability | Fix in this project |
| A-003 | P1-high | Dynamic required-rule packing can omit content; first slot ignores total; wrappers uncounted (`context-compiler.mjs:133`, `:286`, `:366`) | Smaller capsule may miss critical instructions or exceed declared total | Reserved required set; explicit overflow status; count complete rendering | Fix in this project |
| A-004 | P1-high | Every-turn master read (`surface.mjs:638`); generated inventories (`repo-expert-generate.mjs:413`) | Mandatory large/repeated skill reads | Small canonical entrypoints and versioned on-demand references | Fix in this project |
| A-005 | P1-high | Context appended outside rule budgets (`surface.mjs:535`, `:600`; `plugin-context.mjs:38`) | No aggregate bound; provider/plugin expansion | Single contribution contract and whole-output accounting | Fix in this project |
| A-006 | P2-medium | Separate dynamic endpoint; skill slot only advertised (`routes/context.mjs:12`; `context-compiler.mjs:286`) | Existing selector does not optimize static sessions | Shared selection policy with verified client adapters | Fix in this project |
| A-007 | P2-medium | Contradictory credential prose and false privilege claims | Ambiguous/incorrect instructions | Resolve supersession explicitly; remove hierarchy overclaims | Fix in this project |
| A-008 | P2-medium | Parallel path reads restricted Google credentials (`parallel-context.mjs:170`) | Reusing path blindly could violate provider restriction | Keep outside default optimization path; verify allowed configuration | Fix within this project's integration boundary; no unrelated provider rewrite |
| A-009 | P1-high | Startup instruction access 403 | Live retrieval readiness unproven | Diagnose configured access before client retrieval walkthrough; never widen scopes silently | Fix/verify in this project before rollout |
| A-010 | P2-medium | Byte/word sizes available, no end-to-end prompt provenance | Cannot demonstrate actual savings or duplicate consumption | Measure loaded contributions, repeated reads and latency with redacted metadata | Fix in this project |
| A-011 | P1-high | Fast matches hydrate through cold all-vault parsing (`fast-recall.mjs:69`; `vault.mjs:89`) | Metadata lookup still incurs full Markdown loading | Indexed document locator and selective matched-body hydration with freshness checks | Fix in this project |
| A-012 | P1-high | Fewer than top-k fast hits trigger semantic wait; brains searched serially (`recall.mjs:144`, `:167`); semantic path awaits embedding before lexical search (`search.mjs:148`) | Exact/keyword retrieval can wait for optional network work | Explicit bounded local path; exact-slug fetch; measure fallback and stage timings | Fix in this project |
| A-013 | P1-high | Surface dedup uses only first 120 normalized content characters (`surface.mjs:449`) | Distinct scoped rules sharing a prefix can collapse | Preserve stable identity and explicit supersession; test shared-prefix rules with different scope/meaning | Fix in this project |

## 13. Impact on the requested change

| Change | Shaping / blocking findings |
| --- | --- |
| Small permanent bootstrap | A-001, A-002, A-004, A-007 |
| Deterministic action coverage and selective knowledge retrieval | A-002, A-003, A-006, A-009, A-013 |
| Aggregate budget and plugin contract | A-001, A-003, A-005 |
| Canonical skills and generated expert references | A-004, A-007 |
| Measurement, client rollout and offline behavior | A-006, A-008, A-009, A-010 |
| Search latency and Markdown-backed retrieval | A-011, A-012; retain canonical Markdown and existing validated writes |

All P1 findings must become Phase 1 tracker tasks. They are planned work, not fixed by creating documentation. Full source baseline failures will be added with evidence and dispositions when observed.

## 14. Decisions

| Decision | Recommended default | Status |
| --- | --- | --- |
| Permanent context target | Approximately 1,000 tokens of Total Recall-owned bootstrap; configurable and measured | Proposed, not demonstrated |
| Active task target | Start evaluation at 4,000 tokens inclusive of bootstrap, selected rules and activated references | Proposed tuning value; coverage takes precedence |
| Required set exceeds cap | Return explicit overflow/not-ready; do not silently drop rules or pretend the limit held | Recommended |
| Missing activation metadata | Preserve conservative applicability until explicitly curated; report costly unknowns | Recommended |
| Changed rules / task / project | Invalidate selection and reload before the relevant action | Recommended |
| Deployment mode | Shadow selection and fixtures before changing default surfaces; remove temporary compatibility path after verification | Recommended |
| Current request scope | Create project docs; leave implementation unchecked | Confirmed by request |

## Completion checklist

- [x] Sections 1–14 filled, with uncertainty identified
- [x] Remote baseline finished and durable results recorded, including gate limitation
- [x] Findings have severity and disposition
- [x] Audit Status set to Complete after baseline inspection

## Action recording handoff

The future tracker must record preceding read-only analysis, current skill reads, inventory, corrected discovery misses, startup 403, mesh access resolution, clean source export, dependency/helper provenance and background baseline outcome. Use actual UTC command timestamps; do not invent timestamps for preceding chat turns. No secrets belong in the Action Log.

Final reconciliation: the tracker now records these actions, planning writes, document review and cleanup. The owned remote baseline snapshot and local source archive were removed after preserving the gate reports and test summary. The project decision CLI's detached compile exited; no owned job remains pending. Project creation is complete; implementation and live retrieval readiness are not complete.

## Final implementation dispositions

A-001/A-002/A-003: shared explicit tag activation, conservative unknown coverage and
complete-render admission replace soft section overflow and silent required omission.
A-004: live/scaffold core entrypoint and the expert generator route into references.
A-005: bootstrap omits optional bulk sources; task contribution packing admits whole
optional blocks only within the aggregate limit. Legacy requirements remain required.
A-006: CLI, static bootstrap and API share context-policy; adapters use explicit local
CLI routing rather than an invented automatic host hook.
A-007: generated privilege override language is removed; credential reuse guidance
is corrected in the canonical operations reference without rewriting memory prose.
A-008: default local recall and capsules do not invoke any provider; optional semantic
search remains explicitly requested and governed by configured network policy.
A-009: a dedicated minimal read token repaired the observed scope denial; native
selected-brain and denied-scope checks confirm delivery and isolation separately.
A-010: estimated rendered size, source IDs, exclusion/overflow, versions and local stage
timings are reported; host-owned context/repeated reads remain outside TR measurement.
A-011/A-012: indexed local full text, source-stamp reuse, selective document hydration
and explicit semantic enrichment eliminate cold whole-vault hydration/top-k fallback.
A-013: distinct rule IDs remain distinct; only explicit subject-compatible supersession
or identical contribution identities can remove repetition.

Evidence limitations: cold benchmark samples are five module processes and one actual
CLI measurement over 10k synthetic files, with twelve warm samples. These meet the
candidate local targets without establishing a population-wide production p95. The
live laptop comparison is a single observation. Smaller generated files affect future
loads; they do not erase the current host conversation. Conservative uncurated CLI
budget was 16k in 3.33.0 because the measured required set alone exceeded 13k estimated tokens. This historical adjustment is superseded by A-014/A-015 below.

## 2026-10-01 reopened audit — Complete

Source remains a6b2531; post-release documentation changes were present. User reports Dabber startup fixed separately and authorizes fixing this repository. Inspected its compact launch skill read-only; no CRM modifications. Existing architecture, integration, mutation, authentication and release boundaries remain unchanged. Focused Mac mini baseline: 4 files / 27 tests passed (isolated snapshot; initial missing dependency symlink failed, corrected with npm ci).

| ID | Severity | Evidence | Impact and disposition |
| --- | --- | --- | --- |
| A-014 | P1 | context CLI reproduction: 85 required rules, 13,388 estimated required tokens, 15,973 body tokens, 31,891 compact-JSON tokens | Diagnostics bypass aggregate budget; fix output accounting and compact default. |
| A-015 | P1 | context-compiler.mjs automatically packs ranked knowledge; context-policy.mjs requires every unclassified rule | Static size savings did not establish actual startup savings. Make knowledge opt-in; curate repository-local activation and concise operative clauses with source fingerprints, preserving originals and conservative stale-policy fallback. |

No schema primitive, credential, provider, server authorization or other repository change is required. Curation is private validated memory; it must not ship in scaffold. Detailed diagnostic output is opt-in and must also satisfy its declared budget before readiness. Canonical wording and history remain retrievable.

## Release audit addendum — A-016 (Complete, 2026-10-01)

The versioned 3.33.1 isolated mini dependency audit found one moderate production dependency advisory group in transitive `ip-address` 10.4.0 (four address-classification/parser advisories). `npm audit --omit=dev --json` is retained with release evidence. Source/lock baseline was unchanged before this inspection. Disposition: fix in this release by updating only the compatible transitive resolution to 10.7.2; re-run the full gate and production audit before publication. No direct dependency ranges or application code change.

A-016 final disposition: fixed and verified in 3.33.1; final production audit has zero vulnerabilities. A-014/A-015 source, live and delivery evidence are preserved under evidence/release-3.33.1.


## Fresh-start and skill optimization addendum (2026-10-01T14:02:51.087707+00:00)

User confirms 78k after fresh Dabber startup and authorizes brief skills plus a periodic optimization algorithm. Previous capsule verification did not measure total fresh-start context; project completion is reopened.

Scope and method: inspected skill package ownership, discovery aliases, registry source pointers, scaffold init and surface compiler. Source baseline ba4bb42a3f89a022f7f521cd7552dd25b869600a; isolated Mac mini fast gates passed with zero findings. Initial snapshot lacked ignored checker/bundle; restored checker and rebuilt frontend on sanctioned node; these setup failures are not product failures. No private vault inspection.

Inventory/runtime: local PM 28,322 bytes, research 18,603, security 13,784, CLI agents 10,955. Global and repo discovery overlap. Full bodies load only when selected; summing every skill is not measured startup context. Skill files in .agent are ignored; shipped scaffold is authoritative for public availability. Current source CLI and global projections resolve independently.

Data/state and security/privacy: preserve authored manuals, frontmatter ownership, managed blocks, scripts/assets and reference paths. Optimizer writes only explicit skill packages, never vault/state. Hash/version checks and exclusive package lock protect concurrent edits; retain original source for recovery. No model, provider, credentials or external fetch required.

Integrations/deploy: registry contains stale and repo-owned sources; do not synchronize arbitrary skills across repositories. Apply global edits in their global owner and local edits in this repo. Copy only byte-identical shared counterparts, preserve distinct local overrides. The periodic optimizer belongs to the Total Recall daemon plugin task scheduler; the earlier Codex heartbeat was deleted. Its first daemon run and output remain unverified.

Debt/content/standing-rule conflicts: old injected skill content contains unrelated historical memory; preserve managed blocks rather than silently rewrite it. New compact entrypoints route to relevant references. No semantic truncation of required rules. Fresh session host/tool context remains independently unmeasured.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| A-017 | P1 | Fresh startup still 78k; capsule-only completion claim insufficient | Reopen; compact selected skill bodies and measure concrete source reductions; retain overall measurement as open |
| A-018 | P1 | Large shared/local skills load entire manuals; updates can regress | Lossless section optimizer, bounded entrypoints, safety checks, targeted rollout, periodic audit |
| A-019 | P1 | Ignored live skill edits alone do not ship/scaffold | Update tracked scaffold methods and verify clean init/connect |

Impact/decisions: extend existing five-file project, implement default dry-run CLI with explicit scoped apply and conservative review outcomes. Semantic rewrites require authored routing guidance; automatic pass retains all normative paragraphs and refuses budget overflow. Verify meaningful edge cases, idempotence, links, fenced headings, conflict/lock behavior, scaffolding and remote gates. Audit addendum status Complete.


## Jev, ownership and IDE extension audit — Complete

User explicitly requests correct global/repo ownership, decision assistance, Jev skill/reference routing, working IDE slash commands and web research before further work. Primary TypeSafe launch/docs, OpenRouter endpoints, Claude, Gemini, Codex, Cursor, Cline, VS Code, Antigravity, Pi, Hermes and OpenClaw documentation researched October 1. Choice returns choice/probabilities/confidence; Noul returns a yes probability. OpenRouter's model router differs from a custom skill router. Historical decision plugin choice helper reads label/value, not current choice; use its raw typed answers at the boundary without editing the foreign repo.

A-020 (P1): current Gemini adapter incorrectly claims every discovered skill is /name; native custom commands require TOML. Cline's documented .cline/skills path differs from current projection. Verify adapter contracts, collisions, safe references and global/repo scope. Codex native skill invocation is $name, Pi /skill:name; do not invent universal /name support. Unknown clients remain explicit unsupported for generated commands.

A-021 (P1): global typesafe-jev entrypoint has outdated categorical accuracy and latency assertions. Replace it with current brief decision/routing guidance plus official references; add /jev as a portable alias without changing repo-specific implementations. Keep credentials/model configured, state minimal, confidence and fallback explicit. Provider calls require supported installed adapter and outbound policy. Jev ranks knowledge/navigation; unknown mandatory rules and ownership stay deterministic.

2026-10-01 correction to A-021: the later user instruction requires exactly one public skill, `decision`. Jev is guidance and a configurable engine within that skill; no `/jev` alias is to be shipped. The original finding above is retained as historical audit text.

A-022 (P1): optimizer ownership originally relied on caller scope. Add explicit authorized roots, physical-owner deduplication, scope declaration and repository identity checks. Existing brain entrypoint uses repo_scoped to protect brain package propagation; this is not permission to copy brain state.

Quality baseline remains the verified source snapshot and focused remote tests; additions require new meaningful tests and final remote gates. Scope includes this repo plus explicitly authorized global skills, not foreign repo implementation changes.

## 2026-10-01 single decision skill consolidation

Documentation/ownership audit: Complete for this consolidation. The global typesafe-jev package was the active portable method; the separate decision plugin exposes the same capability name but is not installed in the current command catalog. Keep one public skill name, decision, with Jev guidance in references. Global catalog registration and public scaffold copies are verified separately from actual plugin/provider readiness. Existing decision adapter source defaults missing confidence to 1 and does not read current choice/noul fields correctly; it requires the already-planned runtime correction before trusted routing. No foreign implementation was changed.

## A-023 — current integration contracts and daemon ownership (2026-10-01)

This addendum records official documentation and current local adapters before any further integration edits. Some Cline/Google projection edits in the working tree preceded the complete audit; they are provisional and require a fresh review and remote tests. The verified baseline before those edits is the earlier Mac mini source baseline; the later 13-test optimizer and 44-test IDE runs cover snapshots before the final Google correction, so neither certifies the current tree. The daemon currently starts `startPluginTaskScheduler()` (`src/core/daemon-loop.mjs:378-384`). `src/core/plugin-tasks.mjs:110-204` discovers manifest `tasks`, matches five-field cron once per local minute, records last slots in the plugin record, invokes commands sequentially with a 60-second timeout and appends `plugin.task_run` VFS events. `plugins/system-monitor/plugin.json:22-28` is a working manifest example. No optimizer task is installed yet. The earlier Codex heartbeat was created in error and subsequently deleted; no scheduled optimization is currently verified.

| Integration | Official contract checked 2026-10-01 | Local adapter and decision |
| --- | --- | --- |
| Antigravity IDE / CLI | [Google skills](https://antigravity.google/docs/skills): workspace `.agents/skills`; IDE/global `~/.gemini/config/skills`; CLI/global `~/.gemini/antigravity-cli/skills`; native `/name`. | `connect.mjs:101-117` and `skill-projection.mjs:44-64` now distinguish globals. Verify actual `/decision` interactively before claiming activation. |
| Gemini CLI legacy | [Google transition](https://github.com/google-gemini/gemini-cli/discussions/28017) stopped individual-account service June 18; enterprise Code Assist and API-key users remain supported. [Gemini skills](https://geminicli.com/docs/cli/skills/) uses `.gemini/skills` or `.agents/skills`; [custom commands](https://geminicli.com/docs/cli/custom-commands/) use `.gemini/commands/*.toml` for `/name`. | `connect.mjs:109-117,590-653,946-953` retains explicit legacy connect support. Shared project skill projection remains; no universal native skill `/name` claim. Local `gemini skills list` sees one `decision` via `~/.agents/skills` after duplicate link removal; this is discovery only. |
| Claude Code | [Anthropic skills](https://code.claude.com/docs/en/skills): `.claude/skills`, native `/name`; collisions and user invocation metadata apply. | `connect.mjs:85-93` and `skill-projection.mjs:35-42` project package; inspect collisions before writing commands. |
| Codex | [OpenAI skills](https://learn.chatgpt.com/docs/build-skills): `.agents/skills`, `$skill-name` mention and `/skills` picker; duplicate names can appear. | `connect.mjs:94-100`, `skill-projection.mjs:44-50,73-79` and global skill catalog; do not advertise `/name`. |
| VS Code Copilot | [Microsoft skills](https://code.visualstudio.com/docs/agent-customization/agent-skills): `.github/skills`, `.claude/skills` or `.agents/skills`; slash invocation depends on skill metadata. | `connect.mjs:14-19` writes instruction file, not dedicated skill projection. Shared `.agents/skills` can serve the project; native activation remains unverified. |
| Cline | [Cline skills](https://docs.cline.bot/customization/skills): project `.cline/skills` (also compatible locations), global `~/.cline/skills`, native `/name`; global same-name wins. | `connect.mjs:76-84` and `skill-projection.mjs:66-71` changed provisionally; test owner collision behavior and installed discovery. |
| Pi | [Pi maintainer skills](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/skills.md): `.agents/skills`, `/skill:name`, reload after change. | `connect.mjs:20-25,810-834` writes instructions link, while shared skills are discoverable; never claim `/name`. |
| Hermes | [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [slash reference](https://hermes-agent.nousresearch.com/docs/reference/slash-commands): project `.hermes/skills` or `.agents/skills`, dynamic `/name` subject to built-in collision, `/skill name` fallback and project trust. | `connect.mjs:26-39,834-869`, `skill-projection.mjs:80-86`; project projection is declared, live command unresolved. |
| OpenClaw | [OpenClaw skills](https://docs.openclaw.ai/tools/skills), [slash reference](https://docs.openclaw.ai/tools/slash-commands): workspace `.agents/skills`, generic `/skill name`; native names are configurable and collision-adjusted. | `connect.mjs:56-67,901-929` writes workspace instructions; shared skill projection may work, but `/name` cannot be guaranteed. |
| Aider | [Aider conventions](https://aider.chat/docs/usage/conventions.html): read a conventions file via `/read` or config; no verified Agent Skills native slash contract. | `connect.mjs:118-129` writes `.aider.rules.md` and instructions, file-only support. |
| DeepSeek Harness | [Maintainer repository](https://github.com/deepseek-ai/deepseek-harness) documents a developer preview; exact stable skill/slash contract was not established. | `connect.mjs:48-55` and `skill-projection.mjs:87-94` exist; mark command activation unverified. Do not advertise native `/name`. |
| Decision / Jev | [TypeSafe typed API](https://docs.typesafe.ai/introduction), [skill suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion): Choice yields `choice`, probabilities and confidence; Noul is a 0–1 yes probability. Cookbook suggests a bounded shortlist and at most one skill. | One `decision` skill owns Jev guidance. Existing foreign decision adapter reads incompatible fields and defaults missing confidence to 1; no provider readiness claim or foreign repository edit. |

`src/cli/connect.mjs` also lists HTTP API, Obsidian and generic instruction adapters; these are not native skill hosts. The `IDE_SKILLS` registry in `src/cli/skill-projection.mjs` and live/global symlinks are inventory inputs, not proof that every host has activated a command. The project must test install/scaffold and at least one interactive native invocation, report unverified hosts accurately, and keep generic public paths and credentials out of shipped files.

A-023 (P1-high): the previous periodic-work owner and cross-IDE slash claims diverged from current contracts. Implement the optimizer as a Total Recall daemon plugin task with explicit authorized roots, dry-run/review safety, idempotent slot handling and VFS run evidence. Correct adapter claims only to documented behavior. Record a new sanctioned-host current-tree baseline and verify the audit checker before the next code edit; historical pre-audit edits remain disclosed above.

The user's selected node is the always-on Mac mini via the recorded Total Recall mesh access. Live mesh inspection at 15:50 UTC found its `com.totalrecall.daemon` LaunchAgent loaded but exiting code 1 (17,056 recorded attempts), with no daemon-loop process. Its old command targets `src/core/dream.mjs`; the log reports missing `gray-matter`. The source checkout is at 3023ece and its `node_modules` lacks that package, while the isolated test snapshot has it. The laptop currently has `src/core/daemon-loop.mjs` PID 13250. Thus neither a Mac mini daemon run nor host selection is active yet. Resolve the Mac mini service and add an explicit, generic node-selection configuration that every daemon checks before running the optimizer; merely installing a plugin on one host is insufficient for open-source users. Set this installation's selection to the mini using mesh-resolved identity and verify no second node executes it. Do not hardcode this personal node in shipped code. This is A-024 (P1-high), a live deployment blocker independent of unit tests.

A-025 (P1-high): a shipped integration plugin embeds this installation's private SearXNG mesh IP in `plugins/creative-search/cli.mjs:12,417`, `config.mjs:13`, `generator.mjs:7` and `ui/csearch-main.js:274`. The user's portability rule applies to plugins too. [Official SearXNG Search API](https://docs.searxng.org/dev/search_api.html) supports a configured instance URL with `GET /search?q=...&format=json`; JSON may be disabled by the instance. The local adapter already has a `searxngUrl` setting (`config.mjs:9-46`) but its CLI/generator ignore that setting, and the UI has no configurable URL field. Replace the private default with validated instance configuration, use it across CLI/generator/UI, and present an unconfigured state without outbound calls. Review the plugin's existing config-file persistence against the SSSS state contract before choosing the write path. A source scan across shipped `src`, `plugins`, `scaffold`, `templates`, `bin`, `scripts` and `frontend` found no other personal runtime host/path literal in core; the remaining core mesh-address references are comments/examples, while repository-author URLs are project metadata. This targeted literal scan is not a proof against all possible generated/private configuration.

Current working-tree baseline before further code edits: Mac mini isolated snapshot `/tmp/tr-skill-brevity.KHhROg`, focused Vitest 4 files / 56 tests passed, exit 0, `/tmp/tr-current-baseline-20261001.log`. The project audit checker passed on the mini against the synced five-file project folder. This snapshot was an overlay of changed source and docs onto a prior isolated checkout with installed dependencies and a built frontend; it was not a clean Git export. A later full exact-source snapshot remains required for release.

A-026 (P2-medium): [OpenAI's September 29 DevDay recap](https://openai.com/index/devday-2026-recap/) announces a Luna-powered Decisions API for finite, predefined answers from text or image context, in limited preview with broader release planned. The current public [OpenAI API overview](https://developers.openai.com/api/reference/overview) does not establish a Decisions endpoint or request/response schema. OpenRouter's public model API checked October 1 returned zero matching OpenAI decision models; its documented [Decisions endpoint](https://openrouter.ai/docs/guides/community/jev) is a Jev/TypeSafe surface, not evidence that OpenAI Decisions is available there. The local single `decision` skill currently documents Jev only (`/Users/greg/.agent/skills/decision/references/integration.md`, with tracked scaffold counterpart). Add a short provider-neutral preview note to that one skill; do not invent an OpenAI adapter or model slug until the actual contract and account availability are verified. Keep deterministic fallback.

16:16 UTC implementation evidence: the global/scaffold decision integration
references match and include the A-026 preview note. The first new focused run
had one manifest inventory failure because skill-manager omitted `use_cases`;
adding its capability tags fixed it. The next run passed 5 files/36 tests. A
separate isolated installed-plugin command walkthrough passed selection,
lossless apply, retained source/rule, cache invalidation behavior and canonical
SearXNG setting persistence. No personal SearXNG default remains in the plugin.
The mini's authored checkout overlays are dirty; deployment must preserve them.
Actual daemon execution, full-source gate and remaining UI limitations remain
unverified.

## A-027 — event-log scalability blocks selected daemon deployment

The verified Total Recall snapshot passed all six gates (371 files/2,314
tests). Its packed runtime installed successfully on the mini. Installing
skill-manager globally then failed with `Commit failed: Cannot create a string
longer than 0x1fffffe8 characters`; plugin-store rolled back its file install,
so configuration did not proceed. No daemon service has yet been changed.
The current SSSS dependency, 0.10.1, allocates a buffer for the complete event
log and converts it to one UTF-8 string in `src/events.mjs:87-104`; replay also
reads each full log as a string. This is a deployment blocker despite passing
small fixture tests. [Official SSSS repository](https://github.com/gregiteen/ssss)
and installed/local reference code confirm the JSONL append/replay and
duplicate-ID contracts. Repair bounded log reading in its owning dependency,
preserve locking/duplicate detection/cursor/UTF-8 semantics and existing logs,
run its sanctioned baseline before edits, then full conformance and a live
mini installation retry. Preserve unrelated authored overlays in that repo.

### Installed CLI host context (2026-10-01)

SSSS 0.10.3 passes both sanctioned gates and allows installation against the
mini's existing event history. Actual `skill-manager configure` then fails
because `bin/total-recall.mjs` imports plugin handlers without the host context
provided by `plugin-runner.mjs`. This also affects creative-search SSSS config.
Align the CLI package/plugin environment with the existing runner contract,
and verify the real executable with an isolated installed plugin before gates.
