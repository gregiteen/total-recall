# Surface Compiler Quality — OKF-Aligned Rule Compilation

## Goal

Fix Total Recall's surface compilation pipeline so agents in Antigravity 2.0 (and all other IDEs) actually follow the rules. Right now agents constantly violate invariants because the compiled shims produce low-quality, unstructured output that agents struggle to parse and prioritize.

## Problem Statement

The compiled instruction shims (`INSTRUCTIONS.md`, `GEMINI.md`, `AGENTS.md`) are the ONLY channel through which Total Recall's memory vault reaches agents. If these shims are broken, ALL agents violate ALL rules regardless of how carefully the rules were authored.

Current problems, diagnosed by comparing our shim output against OKF spec §4 (concept structure) and the OKF enrichment agent's instruction design:

### Problem 1: Compacted rules duplicate title and body
The `heuristicCompact()` function produces output like:
```
- Self-captured memory: The .agent/ directory strictly contains only the s...: The .agent/ directory strictly contains only the skills/ folder...
```
The title is a truncation of the body, so compaction duplicates the first ~60 chars twice. OKF §4.1 requires `description` to be "a single sentence summarizing the concept" — **distinct from the body**. Our compaction violates this by echoing the body as the title.

### Problem 2: No priority/modality markers
An invariant with `priority: absolute, modality: must` renders identically to a preference with `priority: low, modality: should`. Agents have no signal about which rules are inviolable vs. nice-to-have. OKF uses `type` as the primary classification field; we have `modality` and `priority` but strip them during compilation.

### Problem 3: Duplicate rules in output  
The compiled shim contains duplicate entries (e.g., two `npm_recovery_code` rules, two `ephemeral documents` rules). The compiler doesn't deduplicate by content.

### Problem 4: CLI docs consume 41% of the shim
Lines 1–77 of `INSTRUCTIONS.md` are CLI reference docs. The actual rules don't start until line 79. Per OKF §6 (progressive disclosure), index-level content should be a compact summary that lets agents navigate deeper on demand — not a full reference manual inlined before the rules.

### Problem 5: Stale compaction cache (force flag not propagated)
`compileSurface()` accepts `force` but never passes it to `compactNode()`. After modifying compaction logic, cached stale compactions persist until `compacted-rules.json` is manually deleted.

## Proposed Changes (OKF-Aligned)

### Phase 1: Fix `force` flag propagation (Cache Bypass)
Thread `force` through the full compilation pipeline per OKF Pattern 1 (read-before-write augmentation):

| Function | Change |
|----------|--------|
| `compactNode(node, derivedDir)` | Add `force = false` param. Guard cache read with `if (derivedDir && !force)`. |
| `buildRulesBlock(skillsDir, nodes, opts)` | Destructure `force` from opts. Pass to `compactNode()` in `formatNodes` closure. |
| `writeShim(shimPath, skillsDir, nodes, opts)` | Destructure `force` from opts. Pass to `buildRulesBlock()`. |
| `compilePointers(instructionsFile, skillsDir, nodes, opts)` | Destructure `force` from opts. Pass to all `writeShim()` calls. |
| `compileSurface({ force })` | Pass `force` to `compilePointers()`. (Already accepts it.) |

Cache writes remain unchanged — per OKF augmentation rules, we always merge into the existing cache object rather than replacing it.

### Phase 2: Fix compaction quality (`heuristicCompact`)
Rewrite `heuristicCompact()` to produce OKF-quality summaries:

**Current output (broken):**
```
- Self-captured memory: The .agent/ directory strictly contains only the s...: The .agent/ directory strictly contains only the skills/ folder and secrets.enc.
```

**Fixed output (OKF-aligned):**
```
- [MUST] The .agent/ directory strictly contains only the skills/ folder and secrets.enc. Everything else (memory... (use recall to read more)
```

Changes to `heuristicCompact()`:
1. **Prefix with modality marker**: `[MUST]`, `[MUST NOT]`, `[SHOULD]`, `[SHOULD NOT]`, `[INFO]` based on `node.modality`. This gives agents instant priority signal.
2. **Skip "Self-captured memory:" prefix**: When the title is auto-generated (starts with "Self-captured memory:"), use the body directly instead of prepending the title. This eliminates the duplication.
3. **Smarter truncation**: When body exceeds 180 chars, truncate at the nearest sentence boundary rather than mid-word.

### Phase 3: Add deduplication to `buildRulesBlock`
Add content-hash deduplication before formatting nodes. If two nodes produce identical compacted text, keep only the one with higher importance/priority.

### Phase 4: Shorten CLI reference block
The CLI quickstart block in `buildRulesBlock()` (lines 261–334) is 73 lines of reference documentation. OKF §6 says index files should provide progressive disclosure — a summary, not the full manual.

Replace the full CLI reference with a compact 10-line summary:
```markdown
## Total Recall — Sovereign Memory System (Installed)

**Quick Reference:**
- `npx total-recall remember <category> "<content>"` — Save to memory (categories: invariant, preference, correction, fact, concept, pattern, anti-pattern, decision, lore)
- `npx total-recall recall "<query>"` — Search memory (--top-k, --category, --tags)
- `npx total-recall forget <slug>` — Delete a memory node
- `npx total-recall compile` — Rebuild instruction surfaces
- `npx total-recall --help` — Full CLI reference
```

This moves agents' attention from CLI docs to the actual rules.

## Verification Plan

### Automated Tests
- `npx vitest run` — no regressions.

### Manual Verification
1. Run `npx total-recall compile` — clean compilation.
2. Inspect `INSTRUCTIONS.md` — verify:
   - Rules have modality markers (`[MUST]`, `[SHOULD]`, etc.)
   - No duplicated title/body text
   - No duplicate rules
   - CLI reference is compact (≤15 lines)
   - Rules section starts within the first 20 lines
3. Commit to `main`.
