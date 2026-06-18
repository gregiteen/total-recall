# OKF Integration — Development Plan

> **Status**: Planned
> **Date**: June 17, 2026
> **Companion**: [OKF_INTEGRATION_PRD.md](./OKF_INTEGRATION_PRD.md) · [OKF_INTEGRATION_ARCHITECTURE.md](./OKF_INTEGRATION_ARCHITECTURE.md)

---

## Phase 1: Schema Extensions

**Goal**: Add the two new OPTIONAL fields to the SSSS schema. This is the smallest possible shippable unit — no adapter code yet.

**Dependencies**: None.

### 1.1 Add OPTIONAL `description` and `resource` fields to MemoryNodeSchema

**File**: `src/core/schema.mjs` (line ~21, inside `MemoryNodeSchema`)

Add two OPTIONAL fields:
- `description: z.string().optional()` — OKF-standard one-line summary.
- `resource: z.string().optional()` — OKF-standard canonical URI for the underlying asset.

> **⚠️ Do NOT use `z.string().url()`** for `resource`. Zod's `.url()` rejects non-HTTP URIs like `gs://bucket/path`, `bigquery://project.dataset.table`, and `s3://...` which are valid OKF resource identifiers used by Google Cloud knowledge catalogs. Use plain `z.string().optional()` instead.

Both fields are additive and OPTIONAL. No existing field is changed. No `schema_version` bump needed.

### 1.2 Update schema tests

**File**: `src/core/schema.spec.mjs`

Add test cases:
- A valid memory node with `description` and `resource` passes validation.
- A valid memory node without them still passes (backward compatibility).
- A memory node with `resource: "gs://my-bucket/data"` passes (non-HTTP URI).

---

## Phase 2: OKF Adapter Foundation

**Goal**: Build the core adapter module with field mapping logic and comprehensive unit tests.

**Dependencies**: Phase 1 complete.

### 2.1 Create OKF Adapter module

**File**: `src/core/okf-adapter.mjs` (NEW)

This module contains two families of functions:

**Pure field-mapping functions** (no I/O):

1. **`okfConceptToSsssNode(okfFrontmatter, okfBody, conceptId, options)`**
   - Maps OKF fields → SSSS fields per the Architecture §2.2 import mapping table.
   - Auto-generates SSSS V2 required fields: `confidence` (default `0.8`), `importance` (default `3`), `modality` (default `descriptive`), `subject`/`predicate`/`object`, `sentiment_polarity` (default `descriptive`), `sentiment_target`.
   - Derives `slug` from the Concept ID (filepath minus `.md`, slashes to hyphens, lowercased).
   - Maps OKF `type` → SSSS `category` using the configurable lookup table (Architecture §2.3).
   - Sets `source.type` to `okf-import`, `source.agent` to `total-recall-cli`, `source.session_id` to a generated UUID, `source.evidence_count` to `1`.
   - Initializes decay, supersedes, contradicts, related, routes_to_skills, and tags to sensible defaults.
   - **Graceful handling**: If `okfFrontmatter` is `null`/`undefined` (file has no frontmatter), return `null` so the caller can skip with a warning.

2. **`ssssNodeToOkfConcept(ssssNode)`**
   - Maps SSSS fields → OKF fields per the Architecture §2.2 export mapping table.
   - Capitalizes `category` → OKF `type` (e.g., `facts` → `Fact`).
   - If `description` is absent, derives it from the first sentence of the body.
   - Preserves all SSSS-specific fields as producer-defined extensions (OKF allows this).
   - Uses `safeStringify()` from `vault.mjs` for serialization to prevent `js-yaml` crashes on undefined values.

3. **`DEFAULT_OKF_TYPE_MAP`** — Exported constant with the default OKF type → SSSS category mappings from Architecture §2.3.

### 2.2 Create OKF Adapter unit tests

**File**: `src/core/okf-adapter.spec.mjs` (NEW)

Test cases:
- `okfConceptToSsssNode()` with full OKF fields produces valid SSSS V2 node.
- `okfConceptToSsssNode()` with minimal OKF (only `type`) produces valid node with defaults.
- `okfConceptToSsssNode()` with unknown OKF type falls back to `facts` category.
- `okfConceptToSsssNode()` derives slug correctly from nested paths (`tables/users.md` → `tables-users`).
- `okfConceptToSsssNode()` with `null` frontmatter (no YAML block) returns `null`.
- `ssssNodeToOkfConcept()` maps all SSSS fields to OKF fields.
- `ssssNodeToOkfConcept()` derives `description` from body when absent.
- Round-trip: `concept → node → concept` preserves content.
- All generated SSSS nodes pass `validateMemoryNode()` from `total-recall-memory-validator.mjs`.

---

## Phase 3: OKF Bundle Import

**Goal**: Build the bundle-level import orchestration and CLI command.

**Dependencies**: Phase 2 complete.

### 3.1 Implement `importBundle()` in okf-adapter.mjs

**File**: `src/core/okf-adapter.mjs`

Add the bundle-level import orchestration function (this function has I/O — it calls `writeNodeValidated()`):
- Walk the bundle directory recursively, finding all `.md` files.
- **Skip reserved filenames**: `index.md` and `log.md` at any directory level (per OKF spec §3.1).
- **Skip non-SSSS files**: If `gray-matter` parse returns no frontmatter or no `type` field, log a warning and skip (don't crash).
- For each valid file: parse frontmatter via `gray-matter`, call `okfConceptToSsssNode()`, then call `writeNodeValidated()` from `validated-write.mjs`.
- Track results: `{ imported: [], skipped: [], errors: [] }`.
- Slug collision handling: check if slug already exists in vault before writing. Strategy controlled by `options.onConflict` (`skip` | `warn` | `overwrite`, default `warn`).
- Support `options.dryRun` — pass `dryRun: true` to `writeNodeValidated()` for preflight checks.
- Support `options.category` — override category for all imported concepts.
- Support `options.importance` — override default importance level.
- Support `options.typeMap` — custom OKF type → SSSS category map (merged with defaults via spread).

### 3.2 Add `okf` subcommand to ingest CLI

**File**: `src/cli/ingest.mjs` (MODIFY)

Add an `okf` subcommand handler using the existing routing pattern at line 65:
```javascript
// Existing pattern:
if (args[0] === 'google-takeout') { ... }
// New:
if (args[0] === 'okf') { ... }
```

- Parse CLI arguments: `<bundle-path>`, `--dry-run`, `--category`, `--importance`, `--brain`, `--type-map`, `--on-conflict`.
- Resolve brain layer (global vs project) using existing `resolveAgentDir()` / `resolveBrainDir()` logic.
- Resolve vault path: `path.join(brainDir, 'memory-vault')`.
- Call `importBundle()` with resolved vault path and options.
- Print summary report to stdout.
- Trigger async background compile on success — replicate the `spawn(process.argv[0], ['compile'], { detached: true, stdio: 'ignore' })` pattern from `src/cli/remember.mjs`.
- Update `printHelp()` to include `okf <path>` subcommand in the help text.

### 3.3 Create test OKF fixture bundles

**Directory**: `fixtures/okf-bundles/` (NEW)

Create test bundles:
- `minimal/` — Single concept with only required `type` field and a markdown body. Flat structure.
- `full/` — 3-5 concepts with all OKF fields (`type`, `title`, `description`, `resource`, `tags`, `timestamp`).
- `nested/` — Multi-level directory: `tables/users.md`, `tables/orders.md`, `metrics/revenue.md`.
- `cross-linked/` — Concepts with Markdown cross-links between them (`[Users Table](./tables/users.md)`).
- `with-reserved/` — Bundle containing `index.md` and `log.md` alongside regular concepts (reserved files should be skipped).
- `no-frontmatter/` — A bundle containing a plain `.md` file with no YAML block (should be skipped gracefully).

### 3.4 Integration tests for import pipeline

**File**: `src/core/okf-adapter.spec.mjs` (EXTEND)

Add integration-level test cases (use temp directories for vault isolation):
- Import `minimal/` bundle — verify single node created in vault.
- Import `full/` bundle — verify all OKF fields mapped correctly.
- Import with `dryRun: true` — verify no files written to vault.
- Import duplicate bundle twice — verify slug collision warning on second import.
- Import with `category: 'facts'` override — verify category applied to all nodes.
- Import `with-reserved/` — verify `index.md` and `log.md` skipped.
- Import `no-frontmatter/` — verify plain `.md` file skipped with warning, no crash.
- Verify audit trail: imported nodes produce entries in `.events/audit.jsonl`.
- Verify all imported nodes pass `validateMemoryNode()` (V2 compliance).

---

## Phase 4: OKF Bundle Export

**Goal**: Build the CLI command to export a Total Recall vault as an OKF-compliant bundle.

**Dependencies**: Phase 2 complete.

### 4.1 Implement `exportBundle()` in okf-adapter.mjs

**File**: `src/core/okf-adapter.mjs`

Add the bundle-level export orchestration function:
- Read all memory nodes from vault via `getNodes()` from `vault-cache.mjs`.
- For each node: call `ssssNodeToOkfConcept()`, serialize via `safeStringify()` from `vault.mjs` (NOT raw `gray-matter.stringify()` — prevents js-yaml crashes).
- Write each concept to the output directory, organized by category subdirectories (e.g., `facts/`, `patterns/`).
- Generate `index.md` at bundle root: list all concepts with relative Markdown links and descriptions.
- Generate `log.md` from `audit.jsonl`: extract recent write/update audit events, format as chronological Markdown list.
- Support `options.format` — `dir` (default) or `tar.gz` (shell `tar czf` via `child_process.execSync`).
- Support `options.stripSsss` — if true, remove all SSSS-specific fields (`confidence`, `importance`, `modality`, `subject`, `predicate`, `object`, `sentiment_polarity`, `sentiment_target`, `decay`, `source`, `supersedes`, `superseded_by`, `contradicts`, `related`, `routes_to_skills`, `schema_version`, `x_*` fields) from output frontmatter, producing pure OKF-only files.

### 4.2 Create export CLI command

**File**: `src/cli/export.mjs` (NEW)

Create new CLI command:
- Parse CLI arguments: `--okf`, `[output-path]`, `--format`, `--brain`, `--strip-ssss`.
- Resolve brain layer using existing `resolveAgentDir()` / `resolveBrainDir()` patterns.
- Call `exportBundle()` with resolved vault path and options.
- Print summary report to stdout.

### 4.3 Register export command in CLI entrypoint

**File**: `bin/total-recall.mjs` (MODIFY — line ~83, inside the `COMMANDS` object)

Add:
```javascript
export: 'export.mjs',
```

Also update the `printHelp()` function (~line 84) to include `export` in the command listing.

### 4.4 Export unit and integration tests

**File**: `src/core/okf-adapter.spec.mjs` (EXTEND)

Test cases:
- Export a vault with 3 nodes → verify 3 `.md` files in output directory.
- Verify exported files have valid OKF frontmatter (`type` present, `title` present).
- Verify `index.md` generated with correct relative links.
- Verify `log.md` generated from audit events (or is empty if no audit log exists).
- Verify `--strip-ssss` removes SSSS-specific fields but preserves `type`, `title`, `description`, `resource`, `tags`, `timestamp`.
- Round-trip test: export vault → import bundle into fresh temp vault → compare node content. Bodies and core fields must be identical.

---

## Phase 5: OKF Compliance Linter

**Goal**: Add an `--okf` flag to the existing lint command that validates vault nodes against OKF v0.1 recommended fields.

**Dependencies**: Phase 1 complete.

### 5.1 Implement `lintOkfCompliance()` in okf-adapter.mjs

**File**: `src/core/okf-adapter.mjs`

Add the linting function:
- Read all nodes from vault via `getNodes()`.
- For each node, check OKF v0.1 compliance:
  - `type` present → always true for SSSS (pass).
  - `title` present → warn if missing.
  - `description` present → warn if missing.
  - `tags` present and non-empty → warn if missing or empty.
  - `timestamp` (i.e., `updated`) present → warn if missing.
  - `resource` present → info-level note only (genuinely optional in OKF).
- Return structured report: `{ total, pass, warnings: [], errors: [] }`.
- `strict` mode: treat warnings as errors.

### 5.2 Add `--okf` flag to lint CLI

**File**: `src/cli/lint.mjs` (MODIFY)

- Add `--okf` to `parseArgs()` (line ~26). Note: `--strict` already exists (line 31) — it works for both SSSS and OKF lint modes.
- When `--okf` is present, import and call `lintOkfCompliance()` instead of the default SSSS schema validation.
- Print formatted report: pass/warn/fail counts with per-node slug details.
- Exit code `0` for pass, `1` for failures (or strict warnings).
- Update `printHelp()` to document `--okf` flag.

### 5.3 Lint tests

**File**: `src/core/okf-adapter.spec.mjs` (EXTEND)

Test cases:
- A node with all OKF recommended fields passes with zero warnings.
- A node missing `description` produces a warning.
- A node missing `tags` (or empty `tags: []`) produces a warning.
- `strict: true` converts warnings to error-level entries.

---

## Phase 6: Markdown Cross-Link Enhancement (Stretch Goal)

**Goal**: Enhance the existing wikilink parser to also capture standard Markdown links, enriching the graph index for OKF-style cross-references.

**Dependencies**: Phases 1-5 complete. This is a stretch goal — skip if timeline is tight.

> **Note**: This phase extends existing code rather than creating new utilities. `surface.mjs` already has `extractWikilinks()` (line 16) which parses `[[slug]]` wikilinks. We extend it to also capture standard `[text](./path.md)` links.

### 6.1 Extend `extractWikilinks()` to also capture Markdown links

**File**: `src/core/surface.mjs` (MODIFY — line 16, `extractWikilinks()`)

Add a second regex pass to extract standard Markdown links matching `[text](./relative-path.md)` or `[text](relative-path.md)` (excluding absolute URLs like `https://...`). Return both wikilinks and Markdown links as a combined array.

### 6.2 Add `links` to graph index entries

**File**: `src/core/surface.mjs` (MODIFY — line 561, graph index builder)

In the `graphIndex` map (line 561-568), add a `links` field:
```javascript
const graphIndex = nodes.map(n => ({
  slug: n.slug,
  title: n.title,
  category: n.category,
  status: n.status,
  confidence: n.confidence,
  memory_layer: inferMemoryLayer(n),
  links: extractWikilinks(n.body || [])  // NEW
}));
```

### 6.3 Cross-link tests

**File**: `src/core/surface.spec.mjs` (EXTEND)

Test cases:
- A node body with `[see also](./patterns/atomic-writes.md)` produces a link entry.
- A node body with `[[some-slug]]` still works (backward compat).
- A node body with `[Google](https://google.com)` does NOT produce a link (absolute URL excluded).
- A node with no links produces an empty array.

---

## Phase 7: Documentation & Help Updates

**Goal**: Update CLI help text, skill documentation, and repo-expert references.

**Dependencies**: Phases 1-5 complete.

### 7.1 Update CLI help

**File**: `src/cli/help.mjs` (MODIFY)

Add documentation for:
- `export --okf` command with usage examples.
- `ingest okf` subcommand with usage examples.
- `lint --okf` flag.

### 7.2 Update repo-expert skill

**File**: `.agent/skills/repo-expert/SKILL.md` (MODIFY)

Add a section documenting:
- The OKF adapter module (`src/core/okf-adapter.mjs`) and its role as the OKF ↔ SSSS translation layer.
- The new CLI commands: `export --okf`, `ingest okf`, `lint --okf`.
- The schema additions: `description` and `resource` fields.

### 7.3 Update SSSS skill

**File**: `.agent/skills/ssss/SKILL.md` (MODIFY)

Add a note about OKF compatibility:
- SSSS is a superset of OKF v0.1.
- `description` and `resource` are OKF-standard fields adopted into SSSS.
- The adapter layer location: `src/core/okf-adapter.mjs`.

### 7.4 Add Knowledge Packs (P3) to DEFERRED_BACKLOG.md

**File**: `docs/projects/DEFERRED_BACKLOG.md` (MODIFY)

Per project-management skill rules, add a section for the OKF Knowledge Packs (P3/Future) feature:
- `npx total-recall install <git-url>` — install OKF bundles from Git
- `npx total-recall install --update <pack-name>` — update packs
- `npx total-recall uninstall <pack-name>` — remove packs
- Packs namespaced under `packs/` in the vault
- Bidirectional OKF sync (like Obsidian mirroring)

---

## Phase 8: Testing & Verification

**Goal**: Run the full test suite, verify round-trip fidelity, and confirm zero regressions.

**Dependencies**: All prior phases complete.

### 8.1 Run full existing test suite

Verify zero regressions across all existing tests:
```bash
npx vitest run
```

### 8.2 Run OKF-specific test suite

```bash
npx vitest run src/core/okf-adapter.spec.mjs
```

### 8.3 Run schema tests

```bash
npx vitest run src/core/schema.spec.mjs
```

### 8.4 Run operation pipeline tests

Verify the §6 pipeline still works correctly with new fields:
```bash
npx vitest run src/core/operation-validator.spec.mjs src/core/total-recall-memory-validator.spec.mjs src/core/vault-cache.spec.mjs
```

### 8.5 Manual round-trip verification

1. Create a test vault with 5-10 diverse memory nodes.
2. Run `npx total-recall export --okf ./test-bundle/`.
3. Verify `index.md` and `log.md` generated.
4. Create a fresh vault directory.
5. Run `npx total-recall ingest okf ./test-bundle/`.
6. Compare original and imported nodes — content must be identical.
7. Clean up test artifacts.

### 8.6 Manual OKF lint verification

1. Run `npx total-recall lint --okf` on a real vault.
2. Verify report output is readable and accurate.
3. Run with `--strict` and verify exit code behavior.

### 8.7 Code quality checks

```bash
node .agent/skills/code-quality/scripts/start-here-ts.mjs
node .agent/skills/code-quality/scripts/start-here-lint.mjs
```
