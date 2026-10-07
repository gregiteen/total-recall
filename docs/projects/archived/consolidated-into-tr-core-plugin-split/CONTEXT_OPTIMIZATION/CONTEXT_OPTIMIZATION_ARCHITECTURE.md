> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.

# CONTEXT_OPTIMIZATION — Architecture

Deployed 3.35.0 uses the existing selected-node runtime. Manager 1.1.0 files and canonical version/hash metadata were refreshed with instance configuration preserved. Ready instruction capsules remain complete; failed CLI admission is compact. Optional metadata advice is independent of native skill loading and required rule enforcement.

A-030 separates budget admission diagnostics from admitted instruction capsules at the CLI output boundary. The compiler still preserves the complete required set; only a failed default CLI response omits bodies because the caller must stop. Successful output and API contracts remain complete.

A-029: plugin-owned metadata routing filters authorized roots and repository identity before selection. An explicitly configured existing client export supplies raw typed answers. Choice proposes a label; Noul checks its description. Complete validated answers and configured gates are required. Task/catalog/config/repository fingerprints govern the canonical last-result cache. The core capsule remains unchanged and authoritative; this optional CLI does not automatically alter IDE context.

Deployment verification (2026-10-01): the selected daemon uses a persistent installed npm 3.34.1 runtime independent of authored source checkouts. Node selection, explicit authorized roots and optimizer reports remain canonical plugin-record state; release replacement preserves them. A real earlier daemon slot and the restored daily 03:00 schedule are verified separately from package tests. Published-runtime report persistence and cache are verified against actual SSSS 0.10.3. File-size estimates and routing capsule estimates remain separate from native fresh-session total context. See `evidence/release-3.34.1/` for source/package/registry identity and deployment evidence.

A-028 correction preserves the `@ssss/cli` import identity through an exact published npm alias. Registry integrity and actual module resolution are part of upgrade verification; an existing Git resolution must not masquerade as the repaired dependency. This changes dependency distribution, not the SSSS operation or event format.

> **Project Prefix**: `CONTEXT_OPTIMIZATION`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Based on audit**: CONTEXT_OPTIMIZATION_AUDIT.md (Complete, 5b67b20b73a3bd2896036e26cb02ba917fafbfb5)

---

## Audited baseline implementation

`compileSurface` merges project/global rule categories and writes connected shims through `buildRulesBlock`. Section budgets allow required rules to bypass limits; overflow remains indexed. Additional sources append afterward. Shims require reading the full core skill every turn. `compileContext` provides a separate API assembly with slot budgets and embedding ranking; it does not replace static shims and has required-set/whole-render accounting gaps. [A-001–A-006]

CLI recall scans a derived metadata index, then hydrates matches through the whole-vault cache. It searches brains serially and falls back to semantic search if fewer than top-k fast hits exist. The semantic path awaits query embedding before lexical matching. Existing warm performance fixtures do not establish cold populated-vault CLI performance. [A-011, A-012]

## Implemented composition

```text
Canonical SSSS memory/rules and canonical skill packages
  -> validated applicability + versioned document locators
  -> curated universal bootstrap / explicit action requirements
  -> local exact and full-text candidate retrieval
  -> optional semantic ranking for knowledge
  -> required-set validation + shared budget assembly
  -> static bootstrap or task capsule for verified client/API adapter
  -> redacted accounting and coverage evidence
```

The implemented selector, context CLI and local index follow this composition. No automatic host client hook or new SSSS primitive was introduced. The final contract and limits appear below.

## Ownership and contracts

| Concern | Owning path / boundary | Proposed change |
| --- | --- | --- |
| Static instruction writer | `src/core/surface.mjs` | Small bootstrap, shared contribution accounting, preserve authored blocks and connected-client behavior |
| Dynamic selector | `src/core/context-compiler.mjs` | Common applicability, required-set coverage and complete rendering; do not route static output through an unaudited API automatically |
| Exact/local search | `src/cli/recall.mjs`, `src/core/fast-recall.mjs`, `src/core/search.mjs` | Explicit exact/local/semantic policy and selective hydration |
| Canonical vault | Existing validated CLI / SSSS operation services | Remains authoritative; no manual writes or new canonical database |
| Derived indexes | Resolved brain `memory-derived/` | Disposable local postings/locators with source fingerprints; atomically replace after validated updates |
| Plugin contributions | `src/core/plugin-context.mjs` | Structured source identity, applicability, size and truncation policy; all contributions pass aggregate accounting |
| Skill packaging | Live core skill, `src/cli/repo-expert-generate.mjs`, registry/connect | Small entrypoints with package-relative references; preserve repo identity and managed-file ownership |
| Installation | `scripts/sync-scaffold.mjs`, `src/core/project-brain.mjs` | Regenerate from canonical sources; verify fresh brain and package contents |
| Client adaptation | Existing connect/shim paths | Capability detection and verified retrieval paths; avoid inventing unsupported host hooks |

## Applicability and correctness

Keep storage scope, execution applicability and obligation distinct. Curated universal rules are always present. Explicit action categories determine required conditional rules; semantic ranking selects supporting facts, not whether a critical constraint exists. A rule's `must` modality does not imply universal activation.

Persist any new canonical policy/applicability records using existing SSSS document primitives. Before implementation, inspect the composed registry and read the SSSS skill; verify whether existing fields/extensions can represent scope, triggers, supersession and version. These docs do not invent an unsupported memory schema.

Unknown applicability remains conservative until curated. Do not erase restrictions through semantic similarity or a normalized prefix. Preserve stable rule identifiers and explicit source/supersession relationships; report unresolved contradictions. Remove false system-priority claims from generated wrappers while retaining actual user requirements. [A-002, A-007, A-013]

## Retrieval and freshness

Derived metadata should map stable document IDs to permitted relative paths, content digests and index generation. Local full-text postings retrieve candidates without parsing every Markdown body. Hydrate only selected documents and validate path containment and current source identity before serving required instructions. Deletes and renames invalidate locators and postings.

Exact fetch bypasses semantic provider work. Local full-text mode returns available matches with index/freshness status. Semantic enrichment has configured timeout and clear mode labeling; it must not quietly invoke a prohibited provider or confuse an empty index with provider failure. Keep provider/model configuration in existing resolution paths. [A-008, A-011, A-012]

Treat cold process startup, index parsing, matching, hydration, embedding, assembly and CLI shutdown as separate timings. A long-lived server cache can improve warm behavior, but the CLI must have a functional bounded local path when that server is unavailable. No new daemon is introduced solely for optimization.

## Budget semantics

Assemble contributions before checking the final rendered size, including headings, delimiters, indexes and plugin content. Count bootstrap content once per emitted capsule; measure cumulative reloading separately. Required-set admission reserves space and verifies all applicable required IDs. If that set exceeds the configured limit, return overflow details and not-ready status. Optional content may be excluded by relevance; exclusion reasons are inspectable without dumping the whole vault into the prompt.

Versioned activation records prevent unnecessary repeated reads when a client can maintain them. They do not imply removal of text already present in a session. Refresh on task, action, project, rule, skill or policy changes; clients lacking reliable state receive a documented conservative fallback. Any persisted activation state must use verified SSSS primitives.

## Privacy and authority

Retain route authentication and `memory:read`; verify selected brain authorization rather than relying on a HTTP 200. Resolve the observed instruction 403 before live retrieval readiness. Telemetry contains source IDs/digests, reasons, sizes and timing by default, without rule bodies, secrets or personal session text. Plugin knowledge cannot declare itself higher-priority policy. Preserve canonical data and user-authored shims. [A-005, A-009, A-010]

## Rollout and rollback

Run fixture and shadow comparisons before changing default generation. Verify actual client behavior, not only smaller files. Correct the live canonical skill and generator before regenerating scaffold/projections; do not propagate changes into other repositories under this request. Keep previous policy/version and generated-artifact digests for rollback, with no destructive vault restore. Remove temporary shadow/compatibility paths after validated rollout and track their removal.

## Implemented contract and measured adjustments (2026-09-30)

`context-policy.mjs` is shared by static bootstrap, the CLI and the API. Existing
validated tags persist activation; no new SSSS primitive is introduced. Unknown
actions and uncategorized rules activate conservatively. Supersession is explicit
and subject checked. Complete rendered estimates include headers and separators;
required overflow preserves text and blocks readiness. Identical contributions
with identical source IDs are deduplicated; distinct rule identities remain intact.

Native instruction and context routes require their original scopes and now reject
unknown selected brains. The configured project token lacked instructions:read;
a dedicated reader with only ssss:read, memory:read and instructions:read was
verified in process and installed without exposing a token. No other repository's
configuration was changed.

The reopened correction restores a 4,000-token CLI/API default and budgets the
entire serialized response. CLI defaults to compact text; knowledge and diagnostic
inventories are explicit opt-ins. Required content is retained on overflow.
Repository-local explicit curation uses one validated decision tagged context:policy,
with source fingerprints, supported action triggers and manually verified concise
directives. Source edits, malformed/expired policies and conflicting policies fall
back to canonical rule behavior. Canonical bodies and global data remain intact.

Persistent bootstrap plus core/expert entrypoints measured 4,400 bytes compared
with the 108,840-byte audit inventory (95.96% reduction). This is TR-owned file
content only: host catalogs, tool definitions and already-loaded conversation
context are outside that measurement. No host session erasure is claimed.

The disposable full-text index has safe relative locators, SHA-256 source digests,
postings and source-stamp incremental reuse. Full compilation prunes deleted nodes;
selected reads revalidate canonical bodies and current filters. An index is a
snapshot, not proof all files are fresh; missing/corrupt/metadata-only modes are
reported and compile rebuilds them.

No host auto-hook is invented. Supported clients read a generated bootstrap and
invoke the local CLI before changed actions. Stateless fallback refreshes every
task/action/project and after memory/skill edits. Context versions include rule,
project/action and skill/reference input changes. Server-independent retrieval
and denied access are tested separately from native authenticated API delivery.

## Reopened correction — A-014/A-015

Default task routing returns required instructions only with compact output. Knowledge and diagnostic inventories are explicit opt-ins. Entire serialized responses determine readiness. A repository-local validated decision records manually curated action triggers and concise directives bound to canonical source hashes; unknown, malformed or stale entries retain original required rules. Canonical bodies remain retrievable. Verify actual local capsule sizes and conservative fallback, then run focused/full sanctioned checks before completion.


## Skill optimizer extension (A-017–A-019)

Provide `skill optimize` with explicit package/root scope, default dry-run, lossless reference extraction, content-hash concurrency checks, retained source, package lock and bounded output. Compact authored routers carry essential constraints; automatic optimization retains normative paragraphs and flags ambiguous/oversized candidates for review. Preserve repo ownership and managed blocks. Include task-ranked reference navigation as advice only. Ship updated shared scaffold methods and propagate identical shared copies. Schedule periodic checks through the existing daemon plugin-task path, with explicit root configuration and a VFS `plugin.task_run` event; retain bounded output and do not run an app automation. Total fresh-start token count remains an acceptance item independent of package estimates.


## Jev and IDE acceptance (A-020–A-022)

Use current primary docs; expose one portable `decision` skill with Jev guidance in its references. Implement optional typed decision assistance over bounded skill metadata; enforce scope/required rules in code and retain deterministic failure fallback. Verify real adapter formats and supported native invocation syntax, preserve command collisions and repo-specific content, and include public scaffolds. Gemini CLI and Antigravity share workspace `.agents/skills` but use their documented global paths and command behavior. Do not claim interactive IDE/provider readiness solely from generated files or mocked tests.

## Generic scaffold configuration and later extraction

Public scaffolded skills use generic schema/default configuration where possible; resolve repository paths, runtime targets and decision providers from configuration or flags. Keep repository-specific instances in local config/overlays and exclude personal hosts, credentials, accounts and private injected memory from shipped artifacts. Prefer the existing decision capability as the public skill name, with Jev as a configurable implementation.

Verify current behavior in this project. Subsequent skill manager extraction is explicitly tracked in [TR_CORE_PLUGIN_SPLIT](../TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md) and waits for functional evidence; no migration is performed by this addendum.

## A-023 researched integration boundary

The existing daemon calls `startPluginTaskScheduler()` and executes manifest `tasks` on each node. A thin skill-optimizer plugin should own its daily manifest command and invoke the generic optimizer over explicitly configured roots. A shared, validated node selector in instance configuration determines which daemon may execute it; every node checks the selector, and an unset or unresolved selector fails closed. Resolve device identity through the existing mesh/device layer, never a shipped personal hostname. The plugin scheduler retains last-run slots in the plugin record and records VFS events; the optimizer's report must identify reviewed/applied/skipped packages without raw private skill bodies. First sighting does not immediately run a job. Test a due slot on selected and non-selected nodes, then observe one real daemon slot before declaring the schedule live.

Implemented contract: `plugins/skill-manager` declares daily 03:00 local-time
`optimize` with `placement: selected-node`. The owning SSSS plugin record stores
`task_nodes.optimize`, validated `optimizer_config` and `optimizer_report`.
Configuration happens on the selected node through its mesh CLI, so configured
paths belong to that node. Other nodes fail closed unless their local/synced
record names their own mesh identity. Roots explicitly identify global ownership
or a repository root. Full package/reference hashes and configuration/apply mode
invalidate cached results; conservative application retains original source and
normative instructions. This does not yet prove the selected live daemon ran.

Creative Search 2.1.0 stores validated `search_config` in its plugin record;
`SEARXNG_URL` is an explicit override. CLI and compiled context share it. Context
generation reads settings without network probes. The overview custom element
accepts canonical settings through its `config` property and stays idle when
unset. Its separate settings panel/host mount remains a documented plugin
correction limitation, not a claim of complete UI persistence.

A-027 dependency repair belongs in the SSSS JSONL reference adapter. Both index
construction and replay use the same bounded UTF-8 line reader; cache freshness,
file locks and immutable event IDs retain their existing contracts. Update the
dependency version/lock after verifying that owning package, then rebuild and
retest the Total Recall release snapshot. Do not bypass canonical operations or
discard the existing event history to make deployment succeed.

Project skill projection is host-specific. Antigravity uses `.agents/skills` in a workspace, `~/.gemini/config/skills` in the IDE and `~/.gemini/antigravity-cli/skills` in its CLI; it converts skills to `/name`. Legacy Gemini CLI still supports enterprise/API-key use but needs `.gemini/commands/*.toml` for explicit `/name`. Codex uses `$name` or `/skills`, Pi uses `/skill:name`, OpenClaw guarantees `/skill name`, and Aider reads instruction files. Keep the adapter registry and user-facing descriptions faithful to each verified host. Treat an installed file or successful unit test as projection evidence, not proof of live native activation.
