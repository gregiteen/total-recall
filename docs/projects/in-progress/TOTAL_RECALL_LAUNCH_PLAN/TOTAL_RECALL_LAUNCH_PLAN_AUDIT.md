# TOTAL_RECALL_LAUNCH_PLAN — Audit

## PLUGIN-BOUNDARY-01 — OpenWiki and OKF ownership

Source remediation is implemented in core and the two existing owner repositories. [Boundary and artifact evidence](evidence/PLUGIN-BOUNDARY-01-source-verification.md) records migrated behavior, negative cases and retained failures. Final combined-source counts and identity reside in the tracker; plugin UI and complete launch acceptance are outside this source-stage closure.

**Audit Status**: Complete
**Audited commit**: 4e33bc2 (instruction artifact changes are an identified in-progress working-tree overlay)

Greg explicitly confirmed extraction in this chat. Core still holds the complete OKF adapter and tests, automatic OKF compiler projections, OpenWiki bootstrap/templates and interactive setup. OKF's plugin CLI currently fabricates validation and probe success. OpenWiki's existing ingestion already lives in its plugin. Fresh pre-extraction Mini baseline43 tests/6 files passes, exit0 (`/tmp/tr-boundary-baseline.log`); prior8 gates pass. Plugin owners run their own baselines before backend edits. Existing dirty plugin files are preserved, with no UI authoring in this stage.

Finding A-029 (P1-high, fix now): move OKF mapping/import/export/lint/projection implementation and tests into its plugin; core CLI aliases bind the declared active runtime module and fail if unavailable. Remove automatic OKF projection from core compilation. Move OpenWiki bootstrap/templates into its plugin's explicit CLI and remove its core provisioning/readiness dependency. Core initialization remains complete without documentation plugins; existing wiki files are preserved. Shared memory validation/writes remain generic host services. No fallback implementation in core. Preserve real owner behavior and report unsupported operations honestly.

Official primary OKF spec reviewed: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md (v0.2 as retrieved2026-10-25). Format `type` is required; index/log are optional reserved files; no central type registry exists. This extraction does not claim universal conformance beyond executable owner validation. The plugin recipe explicitly authorizes delegation of separable backend extraction; narrow agents own these two plugin backend paths and preserve prior authored/dirty files. This does not authorize changes to other plugin implementations, production state or deployment.

## LR-1 instruction artifact integrity follow-up

**Audit Status**: Complete
**Audited commit**: 4e33bc2

Codex, sanctioned Mac mini, October24 (2026-10-25 UTC): inspected complete compiler write/cache paths and rebuild command, connected-client mapping and existing surface/rebuild tests. Fresh baseline58 tests/4 files pass, exit0 (`/tmp/tr-surfaces-baseline.log`);8 configured full-tier gates pass,0 findings. Shared runtime is ready. Existing fourteen-section audit remains applicable; this stage changes core derived instruction artifacts, tests and docs. No plugin source, key state or runtime activation is included.

Finding A-028 (P1-high, fix in this project): `compileSurface` skips solely from input hashes, ignoring missing/edited instruction outputs and connected-client configuration. `writeShim` trusts an atomic write without reading its result; rebuild accepts any pre-existing nonempty INSTRUCTIONS.md. A suppressed write can therefore report success and a deleted client shim can remain absent indefinitely. Record verified relative output paths, canonical bindings and hashes in a disposable artifact manifest; only skip when current required outputs and inputs match. Recompile damaged outputs while preserving authored text, verify every write and reject stale-code skips in rebuild callers. Baseline tests do not inject silent write failures; add meaningful failing regressions before implementation.

Official Codex discovery documentation reviewed: https://learn.chatgpt.com/docs/agent-configuration/agents-md (retrieved2026-10-25 UTC). Codex reads its home guidance and root-to-cwd project files with override/size rules. Compiler artifact integrity proves filesystem delivery only; actual runtime consumption across supported harnesses and discovery overrides remains separate acceptance. Initial imports briefly failed while zod files were absent; files reappeared, imports/OpenWiki/startup then passed without this agent reinstalling dependencies. No failed command is counted as passing evidence.

## LR-1 shared daemon identity follow-up

**Audit Status**: Complete
**Audited commit**: 813edca

Codex, sanctioned Mac mini, October24 (2026-10-25 UTC): read complete daemon-control, startup-health and status implementations and tests. Baseline47 tests/4 files pass, actual exit0 (`/tmp/tr-lr1-baseline.log`);8 full-tier quality checks pass with0 findings. Shared runtime readiness is true. Official Node process documentation confirms signal0 tests existence rather than executable identity (https://nodejs.org/api/process.html). The existing fourteen-section audit remains applicable; this follow-up touches generic core lifecycle/status, tests and docs, with no plugin changes or deployment.

Finding A-027 (P1-high, fix in this project): daemon-control accepts any command containing `core/daemon-loop.mjs` or `core/dream.mjs`, while startup-health resolves the entry against the process cwd. Missing identity is collapsed to dead, permitting another start. Startup's unresolved entry-tail fallback can certify a different nonexistent install. Share installation-aware observation, preserve conflict/unknown, refuse starts on uncertain/live foreign locks, and expose observed/expected entry paths in status. Verify same-install, second-install, missing/dead/malformed/unreadable locks and refusal without signals/spawn/unlink. State remains existing PID files; no new store or daemon. Broader readiness/harness/launch acceptance stays open.

## DEV-API-06 composed workflow baseline

**Audit Status**: Complete
**Audited commit**: a821ecd

Codex, sanctioned Mac mini, 2026-10-25 UTC: read the complete CLI composed dispatch, static command-surface owner, invoke handlers and execution environment, plus actual auth-owned HTTP acceptance. Fresh baseline:75 tests/2 files pass (`/tmp/tr-api06-baseline.log`). Shared runtime is ready. Official Node child-process documentation was consulted at https://nodejs.org/api/child_process.html. Existing evidence below supplies the broader fourteen-section audit; this scoped follow-up changes only core command resolution, invoke, tests and documentation. Another agent owns plugin implementations.

Finding A-026: `commandScopeDirectories` projects exact group memberships between project and global commands, but `bin/total-recall.mjs` and invoke each implement a separate two-scope resolver. Group commands advertised on instruction surfaces cannot execute. Invoke also assumes an immediate `.agent` directory instead of the CLI's selected brain, causing disagreement for nested working directories and `.agents` brains. Fix with one shared execution resolver that honors the existing brain owner and explicit AGENT_DIR selection, keeps project/group/global precedence, and statically discovers commands without importing them. Full-mode real HTTP/child acceptance must prove literal argv, effects, nonzero exits and restricted denial. No new restricted adapter or provider spending claim.

## DEV-API-05 project target baseline

Follow-up source audit: `brain register` calls `registerProjectBrain`, but that owner omitted `project_id`; a fresh project could therefore require a manual ID/registry repair before its grant appeared. Fix registration to persist the existing identity owner's UUID automatically. The identity creator currently defaults on corrupt JSON; it must instead preserve malformed state and fail explicitly. `brain register` must stop when provisioning fails rather than register an incomplete fallback row. Verify this actual onboarding path before final acceptance.

**Audit Status**: Complete
**Audited commit**: 80c95dc

Codex, Gregorys-Mac-mini.local (Node v25.9.0), 2026-10-25 UTC: inspected invoke authority/execution, confined memory, brain registry/project identity and auth scope validation. Fresh baseline86 tests/2 files pass, exit0 (`/tmp/tr-api05-baseline.log`); shared runtime ready. Existing auth accepts two-part dynamic scopes and enforces role/issuer ceilings, so `brain:project-<uuid>` needs no second key/grant store or auth-repository change. Existing `project-id --all --json`, `brain register/on/off` and auth key issuance supply operator controls. The current restricted policy binds all memory to `brain:server`; registry reads intended for display silently default on corrupt data and are unsuitable as authorization inputs.

Current official Node permission documentation reviewed (https://nodejs.org/api/permissions.html, retrieved 2026-10-25 UTC). Permissions constrain trusted code and are not malicious-code isolation. Proposed adapter resolves only granted registered UUIDs, verifies brain identity and canonical project path, honors enabled state with strict metadata reads, and pins the resolved target throughout execution. Read/write children receive only the selected canonical brain; fact inputs retain the existing closed schema. Discovery lists only usable granted target IDs, never project paths/names. Registry removal, disablement, identity/path change or grant loss cancels running work. Server-brain grants retain their existing behavior. Broader owner adapters, provider budgets and full launch acceptance remain open. This batch changes source/tests/docs and Git publication only.

## DEV-API-04 decision cancellation baseline

**Audit Status**: Complete
**Audited commit**: 96a7ddb

Codex, Gregorys-Mac-mini.local, 2026-10-25 UTC: source review found both decision handlers execute provider/plugin code directly inside the HTTP server, outside `executeInvokeChild`. The authority monitor aborts a controller these handlers never consume; configured child timeout/output limits therefore do not govern them. Fresh Mini baseline:57 tests/2 files passed, exit0 (`/tmp/tr-api04-baseline.log`). Current official Node child-process documentation (https://nodejs.org/api/child_process.html, retrieved 2026-10-25 UTC) confirms detached process groups and close/error lifecycle. Installed decision CLI/client/auth owner and action predictor were inspected; no new provider protocol or credential store is needed.

Remediation: run existing decision owner APIs in a full-mode bounded child, pass structured parameters through stdin, resolve credentials only through the existing auth adapter inside that child, and reuse cancellation/concurrency/output ceilings. Preserve typed decision and prediction results; normalize missing credentials, provider failure and invalid owner output without leaking owner exception text or child logs. Restricted decision operations remain denied. Killing a child stops local continuation, not accepted remote billing; per-provider budgets and broader API/launch acceptance remain open. No serving or npm activation in this source stage.

## DEV-API-03 confined mutation baseline

**Audit Status**: Complete
**Audited commit**: 182ee62

Codex, Gregorys-Mac-mini.local, 2026-10-25 UTC: inspected the invoke policy/router, validated memory writer, SSSS kernel bridge, vault/cache imports and local search projection. Shared runtime readiness is true. The focused pre-change route suite is recorded in this batch's evidence. The existing A-006 remains open: restricted writes have no adapter. The normal remember path compiles executable plugin generators; argv filtering cannot confine it. Validated SSSS operations already support injected principals, so a trusted fact-only creator can reuse canonical validation without invoking compilation or a second key store.

Current official Node filesystem and permission documentation was consulted (https://nodejs.org/api/fs.html and https://nodejs.org/api/permissions.html, retrieved 2026-10-25 UTC). Node permissions do not isolate malicious code. This batch executes only trusted package code with structured data, generated create-only paths, fixed descriptive fact metadata and no credential/provider/plugin resolution. Server-brain paths and derived/audit paths must reject symlinks before mutation. Host administrators who concurrently replace directories remain trusted; no hostile-host isolation claim is made.

Decision: add a bounded dedicated child and shared memory-owner function, granting only memory creation through an explicit kernel principal. Only server-target facts are supported. Unknown fields, rule categories, caller paths/slugs, metadata/frontmatter injection and context-routing tags are denied. Rebuild the local projection from canonical memory without running surface generators; failed post-commit indexing must report committed state explicitly. All broader restricted adapters, provider budgets and launch acceptance remain in progress.

## DEV-API-02 formal audit baseline

**Audit Status**: Complete
**Audited commit**: 6f48d39 (baseline before this implementation)
**Audit host**: Gregorys-Mac-mini.local; Codex; 2026-10-24.

### Scope and method

Continue the existing launch plan and root handoff, focusing on API-1–API-6. Read the five-file plan, invoke implementation/tests, CLI router, auth-owner access-key/server-auth modules, brain selection, composed registries, recall, remember and compilation call graph. Baseline runtime check and fresh focused invoke execution ran on the Mini. Historical consolidation observations below keep their original provenance; they are not fresh release certification.

### Inventory and runtime surface

Full server mounts `src/server/routes/invoke.mjs`; memory-only app does not. `src/server/auth.mjs` and `keys.mjs` are adapters to the auth plugin, which owns named PATs, roles, issuer identity and validated SSSS state. `bin/total-recall.mjs` dispatches built-ins, installed plugin namespaces and project/global composed modules. `src/core/config.mjs` and CLI layer selectors govern brains. `startup check --json` currently reports shared_ready:true on the Mini; this does not prove fleet state or that the serving process has loaded this patch.

### Data and state

Canonical memory remains validated SSSS Markdown; local indexes are projections. Existing auth-owned PAT state remains authoritative, with no second grant/key store. The new execution ledger uses validated SSSS event operations with caller/operation/target/outcome metadata. Request text, argv, tokens and output must never enter that ledger. Disposable acceptance keys and fixture brains are removed after tests; private local brain/OpenWiki state remains outside the public artifact.

### Integrations

Node's direct-argv child API supplies process groups, pipes and termination signals. Restricted retrieval uses trusted local search/data parsing only; ordinary recall no longer needs a logger/config/auth import merely to access filesystem helpers. Full mode deliberately retains auth-owner credential resolution and trusted plugin/composed code. Paid decision providers remain full-mode functionality with incomplete quota/cancellation acceptance. Gro's seller services and image are outside this repository's change.

### Security and privacy

The original route's raw-scope checks lost role ceilings and execution identity. A generic child inherited server administration and credentials, arbitrary target flags and nested owner work. Prototype names could resolve through inherited object members. Named scopes alone did not constrain filesystem/provider work. The implementation must require explicit mode grants, fresh key/issuer/role checks, registry membership and truthful resource outcomes. Unsupported restricted execution must fail closed; an environment marker is attribution, not a sandbox.

### Standing-rule conflicts

The root handoff was explicitly requested and force-added by the owner in `6f48d39`, but the historical repo-hygiene test unconditionally bans it. The fresh full suite reproduced this single failure. Preserve the requested project handoff and instead check it for private state and npm exclusion. Keep private session exports ignored. No change to the no-private-state packaging requirement is authorized.

### Quality baseline

The incoming handoff records 13 historical route tests; those were not rerun before these edits. This turn verified runtime readiness before implementation, then ran fresh source tests below. First focused implementation run:42 tests passed; expanded regression:84 tests passed. Independent agent:5 real HTTP tests passed using actual auth-owned disposable keys. First full suite:2296 passed,1 failed across370 files; the failure is the contradictory handoff ban above. Final-source full suite, default SSSS audit persistence, server-free memory and configured gates are recorded in the tracker/evidence after completion. Earlier suite totals remain historical.

### Debt and dead code

Current generic CLI/plugin/composed handlers have no enforceable restricted-owner contract. `remember` invokes compilation, including plugin generators. Do not label these safe by filtering argv. Restricted mutation/owner adapters and provider spending ceilings remain required work. Full mode intentionally permits host administration; narrower consumers must not receive full grants as an operational workaround.

### Deploy and operations

This batch changes source/tests/documentation and commits/pushes the complete working tree. It does not publish npm, activate a serving release, change cloud binds or rotate production keys. Migration is explicit and documented in the developer guide. Child termination cannot undo committed memory or already accepted provider work; outcome-audit failure requires checking owner state before retrying a mutation.

### Content and product fit

TR's optional developer API supports intentional full access alongside confined access. Ordinary memory remains server-free. The guide must distinguish source acceptance, actual served source and publication, and must describe unsupported restricted adapters as unavailable. The six launch streams and full install/upgrade journey remain in progress.

### Findings register

| ID | Finding | Disposition and evidence |
| --- | --- | --- |
| A-001 | Raw scopes bypass role/lifecycle ceilings through dispatch | Fresh shared-auth authority and issuer-chain checks; route and real HTTP tests |
| A-002 | Restricted requests inherit server CLI/credential/brain authority | Dedicated local server-brain retrieval; all unsupported restricted owners denied |
| A-003 | Prototype operation names and syntax-only composed membership | Own-property operation checks and actual executable registry membership |
| A-004 | Unbounded caller timeout, missing concurrency contract and false successful exits | Child/server limits, group cancellation and truthful failed envelopes; resource tests |
| A-005 | No validated per-execution outcome ledger | SSSS authorization/outcome events, secret-free payload tests and audit-unavailable denial |
| A-006 | Restricted mutations/owner adapters and provider quotas not complete | Open API-1–API-6 acceptance; no completed-launch or hardened-API claim |
| A-007 | Root handoff publication conflicts with hygiene assertion | Preserve owner deliverable; assert private-state exclusion and npm exclusion |
| A-026 | Group commands appear on surfaces but CLI/invoke omit their scope; invoke guesses the immediate `.agent` | DEV-API-06 shared selected-brain resolver and static scope projection; actual composed HTTP acceptance |
| A-027 | P1-high: lifecycle substring checks and startup suffix fallback misidentify daemon installations and collapse uncertainty | LR-1 shared canonical observation, explicit conflict/unknown and lifecycle refusal; real child/CLI acceptance and source evidence |

### Impact on the requested change

Reuse auth instead of introducing credentials or policy stores. Implement an explicit opt-in migration, safe local retrieval, unsupported-owner denial, bounded children and matching capability discovery. Preserve legitimate full developer work. Keep canonical write/compilation behavior unchanged while restricted writes remain denied. Run all relevant and full Mini tests, independent acceptance and configured gates before Git publication.

### Decisions

DEV-API-01 retention stands. DEV-API-02 is a staged security boundary, not complete API acceptance: full mode is literal and intentional throughout its issuer chain; restricted retrieval is server-brain-only; unsupported confinement is denied. No competing project, Gro dependency or cloud prerequisite is introduced.

## DEV-API-02 — Execution boundary audit, October 24

Codex verified the sanctioned host is Gregorys-Mac-mini.local and `startup check --json` reports shared_ready:true. Shared auth already stores arbitrary validated scopes, role ceilings, expiry, issuer identity and revocation in SSSS; no additional key store is needed. Invoke currently bypasses role ceilings by inspecting raw scopes, accepts prototype operation names, treats failed CLI exits as successful envelopes and inherits all server environment variables. CLI `remember` also compiles executable plugin generators, so its restricted write path cannot be approved merely by filtering argv. Composed discovery and execution must use the actual project/global registry and CLI precedence.

Implementation boundary: explicit literal `invoke:full` opts a key into trusted host developer authority (including host credentials and nested execution); `*` alone does not migrate a key. `invoke:restricted` plus `brain:server` permits only the dedicated local recall adapter and discovery. Arbitrary CLI/plugin/composed execution, memory writes and paid decisions fail closed for restricted keys until their owners provide enforceable confinement. Restricted provider spending is zero. This closes unsafe dispatch without claiming all API-1–API-6 acceptance is complete.

Research: [Node child processes](https://nodejs.org/api/child_process.html) documents direct argv, detached POSIX process groups and signal handling. [Node permissions](https://nodejs.org/api/permissions.html) describes resource controls, which do not make arbitrary plugin JavaScript a safe restricted execution adapter. Prefer trusted owner code and explicit denial over treating flags or environment context as a sandbox.

## SCOPE-RECONCILE-01 — Complete source audit, October 24

Owner clarification: Gro CRM owns its seller-facing scoped command API, public agent guide/skills and integrated DSH runtime. The pasted handoff mixed these requirements with Total Recall work. Gro source already implements its gateway/catalog/guide and public skill/client routes in `crm_runtime/server.py`; Gro's own plan owns empty-platform discovery, scoped external-agent acceptance, native UI restoration and optional seller-memory provisioning. A downloadable MCP client is not an MCP server. No DSH bundle into Total Recall is specified by this launch plan.

Implementation inventory: commit `69addd2` adds `src/server/routes/invoke.mjs` and mounts `/v1/invoke` in the full TR server. The separate `src/server/memory-app.mjs` does not mount it. CLI recall searches local vault/index state; ordinary memory does not require HTTP hosting. The full server uses configured/mesh/loopback binding; the memory server defaults to loopback. The route originally lacked plan coverage. The owner has now approved retaining it as an optional developer API, distinct from Gro's seller gateway; DEV-API-01 below supersedes the earlier undecided disposition.

## DEV-API-01 — Developer API authorization audit, October 24

**Decision:** retain `/v1/invoke`; TR serves developers, while Gro serves sellers. CLI execution, plugins, project files and composed workflows are legitimate TR capabilities. Explicit full developer authority is valid; restricted keys must not accidentally inherit it. This is a documentation decision, not a security-completion claim.

**Observed source:** `requireAuth` supplies key identity, role, expiry and scopes. `invoke.mjs` checks operation-family scopes, but `cli.run` then starts the CLI with the server's environment and package-root cwd, without carrying a restricted caller identity. `composable.run` validates name syntax but does not establish that the name is a registered composed command. Memory target selection is not bound to key-specific brain grants; `ssss.write` permits a requested global scope. Child output is capped, but the request can supply a timeout and no endpoint-specific concurrency/budget contract is established. These are authorization/target/resource gaps; shell:false alone does not solve them.

**Required evidence:** explicit full-developer and restricted-key paths; exact command and target enforcement through plugins/composed workflows; denied scope-changing flags and delegation escalation; revocation/expiry at execution boundaries; controlled environment/credential use; bounded resource use and accurate failures; secret-free audit records; independent-agent round trip; server-free local memory baseline. Full developer access may intentionally exercise administrative capabilities within its recorded grants. No implementation or new tests are claimed in this documentation pass.

Plan drift is independently visible: `8de9f11` adds capsule telemetry and action prediction, and tracker measurements show the old overflow blocker is stale. `0062229` and tracker evidence resolve the panel decision and modernize the card tests. The pasted handoff reports 2,263 tests for `69addd2`; this is historical evidence, not a fresh full-suite certification. The development plan and Readiness summary lagged those changes. This reconciliation updates known statuses without asserting fleet propagation, current sync, upgrade preservation or completed launch acceptance.

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Audit Status**: Complete
> **Audited commit**: `aee2ad0` (source `3.40.7`), 2026-10-24T05:17Z
> **Audit host**: MacBook (`/Users/gregoryiteen/github/total-recall`)
> **Author**: Claude (DeepSeek Harness)

This audit establishes the real state before any consolidation edit. Every claim below carries the command or file that produced it. Nothing here is certified beyond the stated scope: **the sanctioned gates were not run on the Mac mini for this audit**, so all results are local-host observations, not release evidence.

## 1. Why this project exists

Greg's instruction (2026-10-24, continuing the Codex thread `01a16c06`):

> "ok i really need to finish total recall first i really want to get these projects done and launched... i just want to combine all these projects into one cohesive launch plan and get it done can you help with that?"
>
> "we can archive all the old projects once we have the cohesive launch plan"

The Codex thread ended at 05:01:17 with the agent having only **announced** the consolidation; it wrote no plan and archived nothing. The work was never started.

### 1.1 A consolidation already happened once, and drifted

This matters more than anything else in this audit. `TR_CORE_PLUGIN_SPLIT` was itself the product of an earlier consolidation:

- 13 predecessor projects were archived into [`archived/consolidated-into-tr-core-plugin-split/`](../../archived/consolidated-into-tr-core-plugin-split/).
- 549 source checklist items were mapped to canonical work IDs in `evidence/consolidation/source-items.json` (254 pending at the time).
- [`docs/projects/README.md`](../../README.md) declared: *"The single active project is TR_CORE_PLUGIN_SPLIT."*

**Then 12 more projects were created after it**, and the README was never updated. `TR_CORE_PLUGIN_SPLIT` is now one of 13 in-progress folders, not the single owner. The drift is the defect this project fixes, and it is why the fix must be structural rather than another README edit.

Current state — `ls docs/projects/in-progress/`:

```
in-progress: 13   completed: 37   archived: 8
```

### 1.2 The 13 in-progress projects

| Project | Created by | Declared state | Relationship to this plan |
| --- | --- | --- | --- |
| `TR_CORE_PLUGIN_SPLIT` | Codex | In Progress | **Predecessor master** — carries TR-001…TR-006 and the 549-item register |
| `PLUGIN_CARDS_BESPOKE` | DSH agent | In Progress | Owns card faces; supersedes UI Overhaul's template model |
| `PLUGIN_UI_OVERHAUL` | Antigravity | **Says "Completed"** | Contradicts Bespoke; must be superseded, not completed |
| `PLUGIN_CREATOR_SKILL` | DSH agent | In Progress | Private plugin creation |
| `PLUGIN_BRICK_STANDALONE` | — | In Progress (**no tracker**) | Capability extraction |
| `UNIFORM_BRAIN_UPDATES` | Codex | In Progress | Update propagation |
| `SURFACE_COMPILATION_FIX` | Antigravity | In Progress (returned from completed) | Instruction surfaces |
| `TR_MARKETING_LAUNCH` | Greg & Antigravity | In Progress | Public launch surface |
| `TR_LAUNCH_HARNESS_DISCOVERY` | Codex | In Progress (**audit only**) | Harness/landing discovery |
| `GITSENTINEL_CARD_BESPOKE` | DSH agent | In Progress | One card face |
| `MESH_CARD_BESPOKE` | Claude Sonnet agent | In Progress | One card face |
| `STRIPE_CARD_BESPOKE` | DSH agent | In Progress | One card face |
| `SYSTEMMONITOR_CARD_BESPOKE` | DSH agent | In Progress | One card face |

Four separate projects each own **one** plugin card face. That is project overhead, not engineering work: they share one contract, one acceptance test, and one migration gauge.

## 2. Verified current state

### 2.1 The card architecture is settled and enforced in code

The single largest open contradiction between projects is already resolved in source. Measured:

| Claim | Command | Result |
| --- | --- | --- |
| Template vocabulary removed from core | `grep -rn "CARD_TEMPLATES\|CARD_WIDGETS\|WidgetKind\|CardRegion" src/` | **0 matches** |
| Card validator replaced | `grep -rn "validateCardFace\|validateLayout" src/` | Only `validateCardFace` at `src/core/plugin-contracts/card.mjs:109`; no `validateLayout` |
| No plugin declares a template | `grep -l card_layout` across all `plugin.json` | **0 of 9** in-repo plugins |
| In-repo plugins carry a bespoke face | `find -path "*/plugins/*/ui/card.js"` | **9** (one per in-repo plugin) |

`src/core/plugin-contracts/card.mjs:109` now **errors** on `card_layout`:

```
"'card_layout' is not supported: a card face is bespoke owner code in ui.elements[], never a shared template"
```

**Consequence for the plan**: `PLUGIN_CARDS_BESPOKE` Phases 1–3 are genuinely complete. `PLUGIN_UI_OVERHAUL`'s template prescription (`PLUGIN_UI_OVERHAUL_DEVELOPMENT_PLAN.md:22` — "layout templates") and its `Completed` status are both wrong and must be explicitly superseded. Only Phase 4 of Bespoke (34 hand-authored faces) remains, and it is design work, not a launch blocker for the platform.

### 2.2 The runtime is NOT ready — this is the launch blocker

`total-recall startup check --json` at 05:17:39Z:

```json
{
  "server": { "status": "conflict", "reason": "server-process-unverified" },
  "brain":  { "status": "ready", "scope": "instructions-access-only; selected project identity not independently verified" },
  "daemon": { "status": "conflict", "reason": "foreign-pid", "source": "local-pid" },
  "ssss":   { "status": "available" },
  "app":    { "status": "not-declared" },
  "required_plugins": { "status": "ready", "errors": [] },
  "shared_ready": false,
  "ready": false
}
```

`shared_ready: false`. The server cannot be verified as the process it claims to be, and the daemon PID does not match this checkout's owner — a **foreign PID** holds the lock. `total-recall status` separately reports `Daemon Status: 🟢 Running`, so the daemon is running but is **not this checkout's daemon**. Two conflicting signals over one lock is exactly the class of defect that produced earlier brain-routing and surface-dir incidents.

### 2.3 Version skew between source, npm, and the installed CLI

| Surface | Version | Command |
| --- | --- | --- |
| Source checkout | `3.40.7` | `node -p "require('./package.json').version"` |
| Published npm | `3.40.7` | `npm view total-recall-brain version` |
| **Installed CLI** | **`3.40.4`** | `total-recall --version` |

npm and the tag agree at `3.40.7` (`git tag` shows `v3.40.7`), and the working tree is level with `origin/main` (no unpushed commits). But the CLI actually on `PATH` is **three patch versions behind the published package**. The release exists; the release is not what runs. Per the standing invariant *"A release that is only on npm is not released,"* propagation to this machine is incomplete.

### 2.4 Instruction surfaces are out of sync

`total-recall status`:

```
Local INSTR.:     28192 bytes, sha=ebb5a95cd762…
Remote INSTR.:    24897 bytes, sha=06177c3992a3…
In sync:          no
Last sync:        never
Sync targets:     (none)
```

A 3,295-byte divergence, no sync targets, and `never` synced. `TR_CORE_PLUGIN_SPLIT` records this class of defect as already re-opened once (TR-003, the surface-dir audit) on the reasoning that *"every command still reported success."* The 28,192-byte local figure is also close to the documented capsule-overflow problem: TR-003 records 12 of 13 capsules **over budget** at ~9,807–9,870 tokens against a 4,000 budget, with `context "x" --action read` exiting 2.

### 2.5 Codex's plugin-creator findings are confirmed in live source

| Finding | Verification |
| --- | --- |
| `tokenPanelSource()` still present though the tracker claims removal | `src/cli/plugin/create.mjs:76` — `function tokenPanelSource(id, panelClass, pluginName, apiKeys)` |
| `plugin create` still has a separate recursive skill-import path | `src/cli/plugin/create.mjs:163` `--from-skill`, `:174` `skillSourceDir`, `:181–187` reads `SKILL.md` and parses frontmatter independently of the shared exclusion predicate |

The tracker's completion claim is unreconciled with the source. Packaging acceptance must cover **every export, import, scaffold, install and sharing path**, not `skill deploy` alone — which is precisely the gap the earlier private-state leak came through.

### 2.6 Scale of the ecosystem

| Measure | Value |
| --- | --- |
| Installed plugins | 34 (`total-recall plugin list --json`) |
| In-repo plugin directories | 9 |
| Spec files | 312 (`find -name "*.spec.mjs"`) |
| Registered project brains | 56 |
| Global brain nodes | 1,617 compiled SSSS nodes |
| Connected clients | 11 (Codex, Claude Code, Antigravity, Gemini, DSH, Cursor, Grok Build, Muse Code, Pi, Hermes, Obsidian) |

34 installed plugins against 9 in-repo directories confirms the plugin-ownership mandate: most capabilities live in their own `tr-plugin-*` repositories, not in this tree.

## 3. Contradictions that must be resolved by this plan

These are recorded as findings, not silently rewritten. Each gets one owner and one disposition in the plan.

| # | Contradiction | Evidence | Required resolution |
| --- | --- | --- | --- |
| C1 | A single active project exists, and 13 projects are in progress | `README.md` vs `ls in-progress/` | One owner; the other 12 archived with history preserved |
| C2 | `PLUGIN_UI_OVERHAUL` is "Completed" while prescribing the template model that `PLUGIN_CARDS_BESPOKE` forbids and the validator now rejects | Overhaul tracker header vs `card.mjs:109`, 0 `card_layout` anywhere | Overhaul superseded, not completed; its real remaining scope (catalog, install, permissions, navigation) reassigned |
| C3 | Creator tracker claims `tokenPanelSource()` removed; source contains it | `PLUGIN_CREATOR_SKILL_PROJECT_TRACKER.md` vs `create.mjs:76` | Reconcile claim against source before any customer-facing creation ships |
| C4 | npm publishes `3.40.7`; the installed CLI is `3.40.4` | `npm view` vs `total-recall --version` | Propagation must be completed and independently verified |
| C5 | `status` reports the daemon running; `startup check` reports a foreign PID conflict | `total-recall status` vs `startup check --json` | Resolve lock ownership; the two commands must agree |
| C6 | Instructions report `In sync: no`, `never` synced, no targets | `total-recall status` | Reconcile from scaffold as publish source; never hand-edit the live copy |
| C7 | The capsule is unusable at its default budget, so the documented `ready:true` gate cannot be met | TR-003 evidence, 59% overshoot | Curate or explicitly justify a higher budget — **blocked on Greg's decision** |
| C8 | Four projects each own one plugin card face | 4 card-bespoke trackers | Fold into the single card workstream with one contract and one gauge |

## 4. What is genuinely near launch

Recorded so the plan does not re-litigate finished work:

- **Memory core and instruction workflow** — global brain healthy, 1,617 nodes, `brain: ready`.
- **Plugin host** — 34 plugins installed, `required_plugins: ready`, zero contract errors.
- **Card contract** — template model removed and enforced; bespoke faces are the only valid shape.
- **Release mechanics** — `3.40.7` tagged and published; tree level with `origin/main`.
- **Consolidation machinery** — `source-items.json` with per-item disposition, SHA-256 provenance, and an explicit rule that *"a historical checked box is a claim requiring source/runtime evidence."* This plan reuses that machinery rather than inventing a second one.

## 5. Audit limits

- No sanctioned Mac mini gates were run. Every result is local to the MacBook.
- `startup check` describes *this* machine's runtime; it is not a cloud or fleet statement.
- Version numbers are point-in-time at `aee2ad0`.
- The four card-bespoke projects were assessed from their trackers and from the shared card contract; their individual design work was not reviewed face-by-face.
- No plugin UI was rendered in a browser for this audit.
- Claims in predecessor trackers were **not** re-certified. Checked boxes remain historical claims until the owning workstream supplies source and runtime evidence, per the existing register rule.

## 6. Conclusion

Total Recall is closer to launch than the 13-folder sprawl makes it appear. The card architecture — the largest architectural conflict — is already correct and enforced. The genuine launch blockers are operational and narrow:

1. The runtime cannot prove it is healthy (`shared_ready: false`, foreign daemon PID).
2. The published release is not the release that runs (`3.40.7` vs `3.40.4`).
3. Instruction surfaces are out of sync and the capsule overflows its budget.
4. The plugin creator's packaging claim does not match its source.
5. Nothing verifies the whole path end to end for a real user.

The plan in [`TOTAL_RECALL_LAUNCH_PLAN_DEVELOPMENT_PLAN.md`](TOTAL_RECALL_LAUNCH_PLAN_DEVELOPMENT_PLAN.md) reduces these to **six workstreams with one owner each and one decisive end-to-end acceptance journey**, then archives the 13 predecessors with their evidence intact.

## MESH-VIEWS-01 — plugin screens and truthful observations

**Audit Status**: Complete
**Audited commit**: 7574ad3 (core), mesh owner current source with only pre-existing generated instruction changes before this batch.

Greg authorized continued mesh-plugin and screen-view work after approving the three extraction pushes. Core/OpenWiki/OKF pushes independently completed; remote tracking matches their commits. Owner design requires Machines, Flows, Placement, Boundary and Join. Current card exposes Fleet, Control and Capability; view aliases status. Independent source review confirms missing screen aggregation, IP joins that match undefined identities, phones incorrectly treated as missing logins, offline machines treated as faults, failed probes reported as empty capabilities, and doctor mutating access verification despite a read declaration. Local doctor seeds node/git rather than measuring availability. Source is in tr-plugin-mesh; generic host behavior stays in core.

Mac mini baseline after installing declared missing Vitest: 18 Node tests plus309 Vitest tests/28 files pass, actual exit0. Initial npm test exited127 after18 passes because Vitest was absent; not counted as complete verification. npm install exposed the known body-parser development advisory; npm audit fix is applied before final verification. Existing generated owner files preserved. Live CLI status confirms separate control/enrollment/node/recorded-I/O contracts; presence/doctor are independent slow reads.

Primary docs retrieved2026-10-25: https://headscale.net/stable/ref/debug/ and https://tailscale.com/docs/reference/tailscale-cli document client status, ping and control troubleshooting. Network status is distinct from execution, and recorded hardware/heartbeat cannot certify current reachability. Existing owner docs/MESH_PLATFORM.md identifies unsupported transfer history, tunnel/exposure inventory and route management. This batch uses implemented owners only and explicitly labels unavailable capabilities.

Finding A-030 (P1): implement five designed screens with progressive independent observations, a read-only mesh view contract for fixed owner-backed reads, no credential values, mesh-IP identity joins, explicit failed/unobserved/not-applicable states and safe command handoffs. Preserve provider and shared-plugin boundaries. Verify read failures, selection/filtering, confirmation, disconnected host, real dark-token rendering at360/768/1280 widths and actual installed CLI results. No enrollment, policy/grant mutation, server provisioning, release or deployment is authorized by read verification.

MESH-VIEWS-01 extension (Greg,2026-10-25): verify integrations and add manifest declarations consumed by the plugin capability matrix. Live fixed-source reads confirm grants, peers, updates, schedules, agents, alert ledger and selected-project deployment status. Policy alone failed because the compatibility CLI selected a project credential store while status used the global auth store. Fix that at the owner under the one-store auth contract; verify a real authenticated policy read. Declarations describe supported primitives, endpoints, placement and observation commands; no live-host success is hardcoded into a reusable manifest. Read-only verification joins declarations with timestamped actual source evidence and reports failures/unavailable contracts independently.

A-031 (P1, observed during live verification): parallel fixed mesh reads race native auth audit appends at plugin-state-store's shared `.mutation-lock`. The second valid audit immediately fails busy, so presence fails only when aggregated alongside status. Direct presence succeeds. Retain fail-closed auditing, but serialize contending native operations with a bounded acquisition wait. Never remove another guard, bypass auditing, recover unknown ownership or treat a timeout as success. Prove concurrent appends are all retained and persistent/unsafe guards remain preserved. This is a generic host-state contract defect, not mesh-specific core behavior.

MESH-VIEWS-01 host integration finding: the outer CardScenes menu derives entries from commands and its arrows scroll a single iframe mount; parent plugin-show-screen never reaches the sandbox. Internal mesh tabs work, but outer navigation does not. Add a generic channel-validated owner-screen discovery/selection bridge, expose only declared IDs, replace command-derived menu entries with the owner's screens, and synchronize active selection. No host-defined screen set or mesh-specific host behavior. Existing operation enforcement remains unchanged. Prior combined core2424 tests pass; final source rerun follows the bridge fix.

MESH-VIEWS-01/A-030/A-031 source remediation complete: final2430 core tests,345 mesh tests,223 auth tests and8 gates pass with matching before/after source identities. Real control/policy/SSH/presence reads and actual opaque-frame navigation are verified; unsupported/unconfigured capabilities and prior update failures remain explicit. [Final evidence](evidence/MESH-VIEWS-01-source-verification.md). No release/deployment or credential-value/policy/enrollment mutation. Project remains in progress for broader launch requirements.
