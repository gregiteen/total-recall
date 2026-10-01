# CONTEXT_OPTIMIZATION — Architecture

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
