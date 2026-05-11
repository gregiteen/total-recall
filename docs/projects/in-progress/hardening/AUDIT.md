# Total Recall 3-Tier Memory Architecture — Research Audit

> Synthesized findings from four independent frontier model research reports commissioned against the same prompt (DEEP_RESEARCH_PROMPT.md). Models: Gemini 2.5 Pro, Claude Opus 4, DeepSeek R1, OpenAI o3 (GPT-5.5 Extended Thinking).

## 1. Universal Consensus (All Four Models Agree)

### 1a. The Monolithic Compiler Is the Root Cause
All four models independently concluded that the `graph-context.md` eager-loading pattern is the single greatest architectural failure. The ETH Zurich finding (DeepSeek report §0.1) quantified this: context files *reduced* task success rates versus providing no context, while increasing inference cost by 20%+. Vercel's evals (DeepSeek §0.3) showed that skills-based on-demand retrieval produced zero improvement in 56% of cases because agents were *lazy* about invoking retrieval tools. The fix is not better retrieval — it is radical context discipline.

### 1b. Three-Tier Memory Is the 2026 Standard
Every model converged on the same three tiers with the same token budgets:
- **Tier 1 (Hot):** < 1,000 tokens. Universal invariants only.
- **Tier 2 (Curated):** Skill-bound progressive disclosure, < 5,000 tokens per skill.
- **Tier 3 (Vault):** Permanent Obsidian-style Markdown vault, accessed on-demand.

### 1c. No Relational Databases
All four models honored the SSSS constraint. Gemini and Claude both recommended SQLite FTS5 as a *disposable, rebuildable* search index — explicitly not a source of truth.

### 1d. Conflict Resolution Must Be Human-in-the-Loop
All four models rejected the legacy `steering.mjs` behavior of silently auto-deleting older rules. The ConInStruct AAAI 2026 finding (cited by Claude and DeepSeek) proved that silent conflict resolution is the #1 cause of catastrophic agent failures.

### 1e. The Dream Cycle Is Essential
All four models independently derived the GBrain-inspired background daemon concept, running on cron + file-watcher, performing deduplication, conflict detection, decay, and skill injection without LLM inference.

## 2. Model-Specific Unique Contributions

### 2a. Gemini: Philosophical Framework & Session DAGs
- **The Pi Paradigm.** Gemini provided the deepest analysis of the Pi Coding Agent's "primitives, not features" philosophy and the strict < 1,000 token system prompt constraint.
- **Session-as-Tree.** Gemini introduced the branching JSONL DAG concept (`SessionEntryBase` with `id` and `parentId`), allowing the daemon to track execution state as a Directed Acyclic Graph instead of linear arrays.
- **Asimov Safety Architecture (ASA).** Gemini proposed a dual-gate security model: Gate 1 (deterministic denylist) + Gate 2 (stateless LLM judge), physically separating the reasoning model from the judging model.
- **NSHA Conflict Resolution.** Gemini framed conflict resolution as a formal Constraint Satisfaction Problem (CSP) using Satisfiability Modulo Theories (SMT) evaluation against SSSS frontmatter priorities.
- **MCP as Tier 3 Access.** Gemini designed the MCP `obsidian_mcp_query` tool schema for Context-on-Demand vault access.

### 2b. Claude: Deterministic Math & Production Code
- **Hybrid BM25 + TF-IDF Router.** Claude provided the exact production-ready TypeScript implementation for `surface.ts`: BM25 via FTS5 as primary scorer, pure-JS TF-IDF as deterministic tiebreaker, z-normalized combination at `0.7 * z(BM25) + 0.3 * z(TF-IDF)`.
- **Steering Engine.** Claude delivered the complete `steering.ts` implementation: Jaccard token similarity + 256-dim trigram cosine + sentiment polarity flip detection, with collision threshold `combined ≥ 0.78 AND polarity_flip == true`.
- **Atomic Writes.** Claude's code uses `write → rename` atomicity to prevent race conditions between the daemon and the IDE agent.
- **SKILL.md Injection Protocol.** Claude defined the exact `<!-- BEGIN INJECTED MEMORY -->` / `<!-- END INJECTED MEMORY -->` fenced block format, with the `needs:` frontmatter array updated deterministically.
- **Complete CLI.** Claude provided the `total-recall resolve --keep | --supersede` CLI wiring with full `CONFLICTS.md` parsing and frontmatter mutation logic.
- **Unit Tests.** Claude included Vitest-style tests proving the polarity-flip detector catches `directive_must` vs `directive_must_not` collisions and avoids false positives across unrelated categories.

### 2c. DeepSeek: Research Synthesis & Progressive Disclosure Economics
- **ETH Zurich Evidence.** DeepSeek cited the strongest empirical evidence: 5,694 pull requests across 138 repositories proving context files degrade agent performance.
- **Vercel's "Index, Don't Retrieve" Finding.** DeepSeek proved that agents need indexing information *in the prompt* to know what exists, but not the full content — directly validating the Tier 1 manifest + Tier 2 progressive disclosure model.
- **Compiled Truth + Timeline.** DeepSeek introduced the Markdown node structure where synthesized rules sit at the top and raw evidence logs append at the bottom, naturally boosting TF-IDF relevance scoring.
- **Token Economics.** DeepSeek quantified the progressive disclosure budget: ~100 tokens per skill at Discovery (Level 1), < 5,000 tokens at Activation (Level 2), zero tokens at Execution (Level 3) until explicitly invoked.

### 2d. OpenAI: Formal Ontology & Safety Limits
- **Formal Rule Ontology.** OpenAI introduced the `modality` / `subject` / `predicate` / `object` schema for rules, enabling O(1) JSON collision detection without NLP: if two rules share the same subject/predicate/object but have conflicting modalities (`must` vs `must_not`), the collision is trivially detected.
- **5–7 Rule Cap per Skill.** OpenAI identified the critical limit that the other models missed: injecting unlimited rules into a `SKILL.md` just recreates context rot locally. Hard-capping at 5–7 forces the TF-IDF router to inject only the highest-scoring invariants.
- **Memory Inbox.** OpenAI designed the `.agent/memory-inbox/pending/` and `.agent/memory-inbox/conflicts/` directory structure, cleanly separating pending rules from the permanent vault.
- **Half-Life Decay.** OpenAI added `decay.half_life_days` and `decay.access_count` to the schema, providing the mathematical foundation for stale memory pruning.
- **Rule Taxonomy.** OpenAI provided a formal categorization for vault rules: `invariants/`, `preferences/`, `anti-patterns/`, `patterns/`, `decisions/`, `concepts/`.

## 3. Points of Divergence (Resolved)

| Topic | Gemini | Claude | DeepSeek | OpenAI | Resolution |
|-------|--------|--------|----------|--------|------------|
| Vault path | `.agent/memory-wiki/` | `.agent/memory-wiki/` | `.agent/memory-wiki/` | `.agent/memory-vault/rules/` | **Use `.agent/memory-vault/`** (OpenAI's cleaner separation of vault vs derived) |
| Conflict storage | `conflicts.yml` | `.agent/conflicts/CONFLICTS.md` | `.agent/memory-wiki/conflicts/` | `.agent/memory-inbox/conflicts/` | **Use `.agent/memory-inbox/conflicts/`** (OpenAI's inbox model is cleanest) |
| Derived indexes | `graph-index.jsonl` inline | `graph-index.jsonl` in vault | `graph-index.jsonl` in vault | `.agent/memory-derived/*.jsonl` | **Use `.agent/memory-derived/`** (OpenAI's separation of source vs derived) |
| Injection format | YAML `injected_nodes` array | Fenced HTML comment block | YAML `injected_memory` block | Fenced HTML comment block | **Use Claude's fenced HTML comment block** (most IDE-compatible, easiest to regex) |
| Conflict detection | NSHA/CSP formal | Jaccard + Trigram + Polarity | Priority integer comparison | Modality/Subject/Predicate JSON | **Layer both:** OpenAI's O(1) ontology check first, then Claude's Jaccard+Trigram for fuzzy matches |
| Rule cap per skill | Not specified | Not specified | Not specified | 5–7 | **Adopt OpenAI's 5–7 cap** |
| Session state | Branching JSONL | Not specified | Not specified | Not specified | **Adopt Gemini's JSONL DAG** |
| Decay mechanism | Not specified | Recency + importance | Confidence score | `half_life_days` | **Adopt OpenAI's half-life decay** with Claude's recency factor |

## 4. Conclusions

The four reports converge into a single, implementable architecture:

1. **Tier 1** is a < 1,000 token safety kernel compiled from `type: rule, priority: absolute` nodes only.
2. **Tier 2** uses Claude's `<!-- BEGIN/END INJECTED MEMORY -->` fenced blocks inside `SKILL.md`, capped at OpenAI's 5–7 rule limit, routed by Claude's hybrid BM25+TF-IDF algorithm.
3. **Tier 3** uses OpenAI's clean directory separation (`.agent/memory-vault/` for source, `.agent/memory-derived/` for indexes, `.agent/memory-inbox/` for pending/conflicts).
4. **Conflict detection** layers OpenAI's O(1) ontology check over Claude's fuzzy Jaccard+Trigram+Polarity detector.
5. **The Dream Cycle** runs as a cron + file-watcher daemon performing Gemini's 3-phase (Light/REM/Deep) lifecycle with OpenAI's half-life decay.
6. **Session state** uses Gemini's branching JSONL DAGs.
7. **All state is Markdown/JSONL.** SQLite FTS5 is disposable. Git is the version control layer.
