# CONTEXT_OPTIMIZATION — Product Requirements

> **Project Prefix**: `CONTEXT_OPTIMIZATION`
> **Kanban State**: ✅ Completed
> **Author**: Codex
> **Date**: 2026-09-30
> **Based on audit**: CONTEXT_OPTIMIZATION_AUDIT.md (Complete, 5b67b20b73a3bd2896036e26cb02ba917fafbfb5)

---

## Problem and desired behavior

Total Recall retains portable memory but currently expands much of its operational guidance into permanent session context. Static limits are soft, mandatory skills are large, and retrieval can incur full-vault loading or optional semantic work. The desired behavior is a small permanent bootstrap, reliable retrieval of applicable instructions before actions, and fast local access to Markdown-backed knowledge. Context savings must preserve user wording, scope, exceptions and correction coverage.

The user's follow-up asks why searching Markdown is slow. The audit observed a single local fast recall taking 5.86 seconds before output, but does not establish the stage-level cause. The project therefore includes search profiling and improvement, with Markdown remaining canonical.

## Scope and authorization

This document plans implementation in this repository. Creating the project does not authorize publication, deployment, changes to other repositories, or autonomous reclassification of the user's rules. Code and schema changes remain unchecked in the tracker. No new central service, external provider requirement or canonical database is needed.

## Requirements and acceptance

| ID | Requirement | Acceptance evidence | Audit findings |
| --- | --- | --- | --- |
| R-01 | Distinguish scope, activation and modality | Mandatory testing/deployment rules activate for those actions; unrelated questions do not load the runbooks; unknown metadata remains conservative and visible | A-001, A-002 |
| R-02 | Preserve every applicable critical instruction | Fixture oracle reports 100% required coverage before each action; missing/overflow/conflicting requirements return explicit not-ready states | A-003, A-013 |
| R-03 | Small canonical skill entrypoints | Core bootstrap and generated expert route to versioned references; regeneration, install and projection retain the structure; no unconditional full-manual read | A-004, A-007 |
| R-04 | One aggregate contribution budget | Rendered bootstrap, rules, indexes, activated skills/references, research and plugin blocks all count; oversized required set cannot be silently dropped or mislabeled within budget | A-001, A-003, A-005 |
| R-05 | Shared policy across supported consumption paths | Static shim and dynamic API use common applicability and provenance rules; at least one actual IDE walkthrough proves retrieval and refresh; unsupported adapter behavior is disclosed | A-006, A-009 |
| R-06 | Canonical Markdown with fast derived lookup | Index includes document locators and local full-text candidates; exact retrieval hydrates only matching documents; corrupted/stale/missing indexes produce explicit bounded behavior | A-011 |
| R-07 | Optional semantic enrichment cannot block local results unnecessarily | Exact-ID fetch and explicit local mode make zero embedding calls; fewer than top-k hits alone is not a reason to delay an exact lookup; semantic results and failures are labeled | A-012, A-008 |
| R-08 | Measure actual consumption and latency | Report bytes, estimated/measured tokens, source digests, selection reasons, repeated reads, first-result/exit and stage timings; label estimates and host-owned unknowns | A-010, A-011, A-012 |
| R-09 | Preserve memory/privacy/ownership | No rule body is rewritten automatically; supersession is explicit; no prefix-only rule deletion; reports exclude raw memories/credentials by default; persistent policy state uses verified SSSS contracts | A-002, A-007, A-013 |
| R-10 | Demonstrate offline and version-change behavior | Required instructions remain available from validated local sources; action stops when required content is unavailable; task/project/rule changes invalidate selection before action | A-003, A-009 |

## Proposed measurement targets

Targets are starting points for evaluation, not current product guarantees:

- Permanent Total Recall bootstrap: approximately 1,000 tokens, inclusive of its essential rule and discovery content.
- Active task capsule: default evaluation ceiling of 4,000 tokens inclusive of bootstrap, selected rules and activated references. A declared required-set overflow is a failure to resolve, not permission to omit instructions.
- At least 80% reduction in measured Total Recall-owned permanent context against the same fixture/client baseline, without loss of applicable critical coverage.
- Cold local CLI first result: p95 at or below 500 ms on the sanctioned test host with a 10,000-document populated synthetic vault. This is an initial design target to validate or revise with recorded evidence, not a promise inferred from one laptop sample.
- Warm local lookup: p95 at or below 50 ms on the same fixture and host; measure matched-body hydration, not only empty-vault metadata queries.
- Semantic latency measured separately; no fabricated network timing guarantee. Exact/local modes must not invoke providers.

Token estimates must be labeled. A configured tokenizer may supply exact counts for a specific client; no model identifier is hardcoded. Cumulative session consumption and repeated reads are reported separately from capsule size. Previously loaded text cannot be assumed to disappear from an active host session after a file changes.

## Required scenario matrix

| Scenario | Required behavior |
| --- | --- |
| Ordinary explanation or copy question | Minimal universal constraints; no unrelated testing or credential manuals |
| Testing, publishing or deployment request | Explicit action triggers load relevant required instructions before action |
| Known rule/document identifier | Deterministic fetch, source identity and version; zero semantic dependency |
| Body-only phrase | Local full-text match; relevant bodies, bounded output |
| One valid result with top-k five | Return local result without treating count shortfall as retrieval failure |
| Missing/corrupted index; modified/deleted document | Clear status, safe freshness behavior and no stale deleted-rule execution |
| Embedding unavailable or prohibited provider | Local retrieval still works; no silent provider substitution |
| Mandatory instructions exceed budget | Explicit overflow report and no ready-for-action result |
| Project switch or rule update | Correct scope and invalidation; no cross-project context contamination |
| Large plugin contribution or duplicate skill projection | Aggregate accounting and provenance; no unbounded append or presumed duplicate loading |

## Delivery criteria

Synthetic edge cases and selection fixtures precede production wiring. A shadow comparison records required coverage and savings before the default changes. Mac mini full suite and sanctioned gates, isolated save/recall/compile walkthrough, real client verification, clean package/scaffold inspection and cleanup must finish before project completion. Current audit baseline passed 2,256 tests but the source-only publication gate is not green; the project is Planned.

## Accepted implementation target adjustment

On 2026-09-30 the live required set measured 13,388 estimated tokens before supporting
knowledge. The conservative CLI default is therefore 16,000. Explicit --budget 4000
and the API's 4,000 default remain available, with not-ready required overflow.
Bootstrap retains the 1,000 estimate ceiling. Permanent TR-owned file content is
measured separately from the task capsule and host-owned session context.
