# OKF Integration — Product Requirements Document (PRD)

> **Status**: Planned
> **Date**: June 17, 2026
> **Author**: Antigravity (Advanced Agentic Coding)
> **Target Version**: v3.3.0
> **Spec Reference**: [OKF v0.1 Draft](https://github.com/GoogleCloudPlatform/knowledge-catalog) · [SSSS v0.2 Draft](../../.agent/skills/ssss/references/ssss-spec.md)

---

## 1. Executive Summary & Vision

The **Open Knowledge Format (OKF)** is a vendor-neutral specification (v0.1, June 2026) introduced by Google Cloud that standardizes how organizational knowledge is represented as a directory of interlinked Markdown files with YAML frontmatter. It formalizes the "LLM-wiki" pattern into a portable, interoperable standard.

Total Recall's **SSSS (Structured Semantic Syntax System)** already shares OKF's foundational philosophy — Markdown-first, YAML-frontmatted, database-free, Git-versioned. This project formalizes the relationship by making Total Recall a **first-class OKF-compatible host**. This means:

1. Any OKF bundle from any compliant system can be **imported** into a Total Recall brain.
2. Any Total Recall vault can be **exported** as a standards-compliant OKF bundle.
3. The SSSS operation pipeline **validates OKF compliance** as part of its existing §6 processing.
4. Developers can **install** curated OKF knowledge packs from Git repositories.

### Why This Matters

- **Interoperability**: Total Recall becomes compatible with the broader OKF ecosystem (Google Cloud, Vertex AI, enterprise knowledge catalogs).
- **Distribution**: Total Recall knowledge vaults become shareable, publishable artifacts — not locked inside `.agent/` directories.
- **Credibility**: Adopting an industry-backed open standard strengthens Total Recall's position as a serious, portable sovereign memory system.
- **Zero Risk**: OKF is a strict subset of what SSSS already does. There is no architectural conflict — only a superset/subset relationship to formalize.

---

## 2. Spec Gap Analysis: OKF v0.1 vs. SSSS v0.2

### 2.1 Structural Alignment (Already Compatible)

| OKF Concept | SSSS Equivalent | Status |
|---|---|---|
| Knowledge Bundle (directory of `.md` files) | Vault (`memory-vault/`) | ✅ Identical |
| Concept (single `.md` file) | Document Primitive (`type: memory`, `type: skill`, etc.) | ✅ Identical |
| Concept ID (file path minus `.md`) | `slug` + `category/` directory path | ✅ Compatible |
| YAML Frontmatter block | SSSS frontmatter (§4.1) | ✅ Identical |
| Markdown Body | SSSS body | ✅ Identical |
| Git-versioned distribution | Git backup strategy (§6 of repo-expert) | ✅ Identical |
| Tarball/Zip distribution | `npx total-recall backup --no-encrypt` | ✅ Identical |

### 2.2 Frontmatter Field Mapping

| OKF Field | Required? | SSSS Memory Equivalent | Gap? |
|---|---|---|---|
| `type` | **Required** | `type: memory` | ✅ Present (literal `memory`) |
| `title` | Recommended | `title` | ✅ Present & required |
| `description` | Recommended | Body (first sentence) / `title` | ⚠️ Not a discrete field |
| `resource` | Recommended | `x_browser_context.url` / `x_citations[].url` | ⚠️ Scattered across extensions |
| `tags` | Recommended | `tags` | ✅ Present |
| `timestamp` | Recommended | `updated` / `created` | ✅ Present (more granular) |

### 2.3 OKF Features SSSS Lacks

| OKF Feature | Description | Implementation Needed |
|---|---|---|
| `description` field | Standalone one-line summary in frontmatter | Add as OPTIONAL field to `MemoryNodeSchema` |
| `resource` field | Canonical URI to the underlying asset | Add as OPTIONAL field to `MemoryNodeSchema` |
| `index.md` | Directory listing for progressive disclosure | New: Generate from vault scan |
| `log.md` | Chronological update history | New: Generate from audit event log |
| Markdown cross-links | Standard `[text](./other-concept.md)` links between concepts | New: Parse and index in `graph-index.jsonl` |
| Bundle packaging | Self-contained export with metadata | New: `npx total-recall export --okf` |
| Bundle ingestion | Import external OKF bundles into a brain | New: `npx total-recall ingest okf <path>` |

### 2.4 SSSS Features That Extend Beyond OKF

These are SSSS-specific superset features that OKF does not prescribe but does not conflict with (OKF explicitly allows producer-defined frontmatter fields):

| SSSS Feature | OKF Position |
|---|---|
| Schema V2 knowledge-graph fields (`confidence`, `importance`, `modality`, `subject/predicate/object`) | Producer-defined extensions — fully valid |
| Operation Contract (§6) — envelopes, idempotency, leases | Not in OKF scope — complementary |
| Append-type documents (`conversation`, `run`) | Not in OKF scope — complementary |
| Surface compiler / instruction shims | Not in OKF scope — complementary |
| Semantic search / vector embeddings | Not in OKF scope — complementary |
| Conflict detection & quarantine | Not in OKF scope — complementary |

---

## 3. Key Product Requirements

### 3.1 OKF-Compatible Schema Extensions (P1)

- **Requirement 1**: Add an OPTIONAL `description` field (string) to `MemoryNodeSchema` in `src/core/schema.mjs`.
- **Requirement 2**: Add an OPTIONAL `resource` field (string, URI format) to `MemoryNodeSchema`.
- **Requirement 3**: These fields MUST be OPTIONAL to preserve backward compatibility. Existing vault nodes without them remain valid.
- **Requirement 4**: The `description` and `resource` fields MUST be preserved during `processOperation()` round-trips (no stripping on write).
- **Requirement 5**: Follow SSSS Appendix A — new fields SHOULD NOT conflict with reserved keys. `description` and `resource` are OKF-standard and safe.

### 3.2 OKF Bundle Exporter — `npx total-recall export --okf` (P1)

- **Requirement 1**: New CLI command `export` in `src/cli/export.mjs`.
- **Requirement 2**: Scans the active vault (`memory-vault/`) and produces a self-contained OKF bundle directory.
- **Requirement 3**: Each memory node `.md` file is mapped to OKF-compliant frontmatter:
  - SSSS `type: memory` → OKF `type:` derived from `category` (e.g., `Invariant`, `Pattern`, `Fact`).
  - SSSS `title` → OKF `title`.
  - SSSS body first sentence → OKF `description` (if not already present).
  - SSSS `updated` → OKF `timestamp`.
  - SSSS `tags` → OKF `tags`.
  - SSSS-specific fields (`confidence`, `importance`, `modality`, etc.) preserved as producer-defined extensions.
- **Requirement 4**: Generate `index.md` at bundle root listing all concepts with links.
- **Requirement 5**: Generate `log.md` from `audit.jsonl` events with recent changes.
- **Requirement 6**: Output to a user-specified directory or default to `./total-recall-okf-bundle/`.
- **Requirement 7**: Support `--format tar.gz` flag to produce a compressed tarball instead of a directory.

### 3.3 OKF Bundle Importer — `npx total-recall ingest okf <path>` (P1)

- **Requirement 1**: New ingest subcommand added to `src/cli/ingest.mjs` alongside existing `google-takeout`.
- **Requirement 2**: Walks the OKF bundle directory, parses each `.md` concept file.
- **Requirement 3**: Maps OKF frontmatter to SSSS memory node fields:
  - OKF `type` → SSSS `category` (mapped via configurable type-to-category lookup, default: `facts`).
  - OKF `title` → SSSS `title`.
  - OKF `description` → SSSS `description`.
  - OKF `resource` → SSSS `resource`.
  - OKF `tags` → SSSS `tags`.
  - OKF `timestamp` → SSSS `created` / `updated`.
  - SSSS-required V2 fields (`confidence`, `importance`, `modality`, `subject`, `predicate`, `object`, `sentiment_polarity`) are auto-generated with sensible defaults.
- **Requirement 4**: All imported nodes MUST flow through `writeNodeValidated()` — the full §6 pipeline. No raw writes.
- **Requirement 5**: Support `--dry-run` to preview what would be imported.
- **Requirement 6**: Support `--category <name>` to override the default category mapping.
- **Requirement 7**: Support `--brain global|project` to target the import destination.
- **Requirement 8**: Duplicate detection via slug matching — skip or warn on collisions.

### 3.4 OKF Compliance Linter — `npx total-recall lint --okf` (P2)

- **Requirement 1**: Extend the existing `src/cli/lint.mjs` command with an `--okf` flag.
- **Requirement 2**: Validate every node in the vault against OKF v0.1 requirements:
  - `type` field present (always true for SSSS nodes).
  - `title` recommended — warn if missing.
  - `description` recommended — warn if missing.
  - `tags` recommended — warn if empty.
  - `timestamp` recommended — warn if `updated` is missing.
- **Requirement 3**: Report results as a structured summary (pass/warn/fail counts).
- **Requirement 4**: Exit code `0` for pass, `1` for hard failures.

### 3.5 Markdown Cross-Link Graph Indexing (P2)

- **Requirement 1**: During vault compilation (`surface.mjs` / `compilePointers()`), parse all Markdown bodies for standard links (`[text](./relative-path.md)`).
- **Requirement 2**: Add discovered cross-links to `graph-index.jsonl` entries as a `links` array.
- **Requirement 3**: The semantic search engine (`search.mjs`) MAY use graph adjacency as a boosting signal during hybrid retrieval.

### 3.6 Installable Knowledge Packs (P3 — Future)

- **Requirement 1**: A new command `npx total-recall install <git-url>` that clones an OKF bundle from a Git repository and ingests it into the active project brain.
- **Requirement 2**: Packs are namespaced under a `packs/` subdirectory in the vault to prevent slug collisions with user-authored nodes.
- **Requirement 3**: Packs can be updated via `npx total-recall install --update <pack-name>`.
- **Requirement 4**: Packs can be removed via `npx total-recall uninstall <pack-name>`.

---

## 4. Out of Scope

- **OKF-to-SSSS primitive mapping beyond `memory`**: OKF concepts could theoretically map to `skill`, `rule`, `workflow`, etc., but this initial integration focuses exclusively on importing OKF concepts as SSSS `memory` nodes.
- **Centralized OKF registry**: OKF explicitly has no central authority. We will not build one.
- **Breaking changes to SSSS**: All OKF fields are additive OPTIONAL extensions. No existing SSSS required field is removed or changed.
- **OKF serving infrastructure**: OKF does not prescribe query or serving infrastructure. Our existing REST API and semantic search already exceed OKF's scope.

---

## 5. Key Performance Indicators (KPIs)

| Metric | Target | Measurement |
|---|---|---|
| OKF Export time (1000-node vault) | < 5 seconds | CLI timing |
| OKF Import time (500-concept bundle) | < 10 seconds | CLI timing |
| Zero breaking changes to existing vaults | 0 regressions | Existing test suite passes |
| OKF lint pass rate on fresh vault | > 90% warn-free | `npx total-recall lint --okf` |
| Round-trip fidelity (export → import → diff) | 100% content preserved | Automated integration test |

---

## 6. Success Criteria

This project succeeds when:

1. A developer can export their Total Recall vault as a portable OKF bundle, share it via Git, and another developer can import it into their own Total Recall brain with zero data loss.
2. An enterprise team using Google Cloud's knowledge catalog can export their OKF bundle and a Total Recall user can ingest it directly.
3. All existing vaults, tests, and CLI commands continue working with zero regressions.
