# CONTEXT_OPTIMIZATION — Audit

> **Project Prefix**: `CONTEXT_OPTIMIZATION`
> **Kanban State**: ✅ Completed
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
