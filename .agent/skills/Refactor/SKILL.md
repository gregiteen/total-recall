---
name: refactor
description: "Use this skill when you need to modularize complex files (>1000 lines) or extract services from bloated route handlers. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /refactor
metadata:
  version: "6.1.0"
---
#  Refactor Skill

Breaks down genuinely over-complex files into focused modules. Line count alone is **not** sufficient reason to refactor  the skill requires genuine complexity (multiple distinct concerns, deep coupling, tangled state) before acting.

> **Critical distinction for route files**: "NEVER SPLIT" means never divide `routes/foo.ts` into multiple route files. It does NOT prohibit extracting inline business logic from route handlers into service classes  that extraction is **required** when route files contain logic beyond thin wiring.

---

##  Quick-Pick Mode

| Symptom | Mode |
|---|---|
| Route file >1000 lines with inline business logic | **Service Extraction** (see below) |
| Service/class file >1000 lines with 3+ unrelated concerns | **Standard Split** (Step 05) |
| Not sure | Run `audit.sh` and ask |

---

##  References (READ THESE BEFORE ACTING)

| File | Purpose |
|---|---|
| `references/never-split-patterns.md` | Full list of file types that must NEVER be split, with reasoning |
| `references/split-patterns.md` | Real before/after examples of good refactors including the StreamHandler split |

---

##  Service Extraction Mode (Route Files With Bloated Handlers)

Use this mode when a route file has inline business logic that belongs in services. The route file is **never split**  it stays as one file with thin wiring only.

**Trigger condition:** Route file >500 lines OR any route handler >30 lines of business logic.

### Mandatory script gate

```bash
# 1. Confirm it's a route file candidate (not already thin)
npx tsx .agent/skills/refactor/scripts/analyze.ts server/routes/<file>.ts
```

If `analyze.ts` shows route handlers with embedded logic blocks >30 lines  proceed.

### Service Extraction Steps

1. **Map handler groups**  group handlers by domain (query, mutation, sharing, email, etc.)
2. **Propose service names**  one per domain group, all <500 lines, list to user before writing
3. **Get user agreement**  STOP here and confirm before writing any code
4. **Extract atomically in parallel** using the `/cli-agents` skill:
   - Do NOT extract services sequentially.
   - Dispatch Gemini, Claude, and Codex in parallel to extract independent services simultaneously.
   - Use the explicit Prompt Template documented in `cli-agents/SKILL.md`.
   - Wire up the new imports in the route file only *after* subagents finish.
   - Run TS check: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
5. **Verify** with `verify.ts` across all output files
6. **Target**: route file reduced to `router.verb(path, auth, handler)` lines only  no business logic

**Rule**: Route file line count must drop by at least 50% to justify this work. If the file only has thin handlers already, stop.

### Integration with /cli-agents (MANDATORY)
For any refactoring involving 2 or more component/service extractions, you **MUST** use the `/cli-agents` parallel subagent protocol. Do not attempt to rewrite multiple files sequentially in a single session. Delegate the extraction of non-overlapping files to subagents.

---

##  Scripts

All scripts live in `.agent/skills/refactor/scripts/`. Run from the project root with `npx tsx` or `bash`.

| Script | Usage | What it does | When mandatory |
|---|---|---|---|
| `audit.sh` | `bash .agent/skills/refactor/scripts/audit.sh` | Lists all files >1000 lines, classified as CANDIDATE or SKIP (route files, tests, etc.) | **Always**  run first if no target given |
| `analyze.ts` | `npx tsx .agent/skills/refactor/scripts/analyze.ts <file>` | Breaks a file down by top-level exported blocks with line counts  reveals logical split points | **Always**  must run before any proposal |
| `extract-to-module.ts` | `npx tsx .agent/skills/refactor/scripts/extract-to-module.ts <source> <startLine> <endLine> <target>` | Extracts a line range to a new file and adds the import back to source | Optional  for non-route splits |
| `fix-imports.ts` | `npx tsx .agent/skills/refactor/scripts/fix-imports.ts <oldPath> <newPath>` | Project-wide import path updater  use after moving/renaming files | After any path change |
| `verify.ts` | `npx tsx .agent/skills/refactor/scripts/verify.ts <original> <new1> <new2>...` | Checks file sizes, remaining exports, coupling, runs ESLint. Does NOT run tsc (RAM). | **Always**  final gate before done |

**Example workflow:**
```bash
# 1. Find candidates (shows SKIP vs CANDIDATE  only act on CANDIDATEs)
bash .agent/skills/refactor/scripts/audit.sh

# 2. Analyze split points for chosen file
npx tsx .agent/skills/refactor/scripts/analyze.ts server/services/streaming/StreamHandler.ts

# 3. (Manual) Create new modules using Write/Edit tools

# 4. Fix any importers that changed paths
npx tsx .agent/skills/refactor/scripts/fix-imports.ts "StreamHandler" "streaming/StreamHandler"

# 5. Verify the refactor
npx tsx .agent/skills/refactor/scripts/verify.ts server/services/streaming/StreamHandler.ts \
  server/services/streaming/CoreStreamProcessor.ts \
  server/services/streaming/FallbackStreamer.ts \
  server/services/streaming/SkillsInjector.ts
```

---

##  Session Continuity Handoff Protocol

For session continuity during a complex refactor, you MUST capture the in-progress status in `HANDOFF.md` at the project root:

```markdown
## Refactor In Progress: <filename>
- **Target file**: `server/routes/assistants.ts` (2212 lines)
- **Mode**: Service Extraction
- **Analyze output**: (paste `npx tsx .agent/skills/refactor/scripts/analyze.ts` output)
- **Proposed services**: AssistantQueryService, AssistantMutationService, ... (with estimated line counts)
- **Already extracted**: AssistantApiService (553 lines)  chat completions 
- **Remaining**: list each handler group not yet extracted
- **TS state**: N errors before starting (run `node .agent/skills/code-quality/scripts/start-here-ts.mjs` and record)
- **Rule**: Extract one service per session commit  never leave the file in a broken state
```

The next session agent will read `HANDOFF.md` and the compiled Total Recall vault to pick up immediately.

---

##  Step 0: Classify Before Acting

**If no target is specified**, run `audit.sh`, then STOP and ASK the user which file to tackle. Do NOT start refactoring every large file autonomously.

**If a target is specified**, read `references/never-split-patterns.md` and classify it first:

###  NEVER SPLIT (see references/never-split-patterns.md for full reasoning)

> **Route file clarification**: "NEVER SPLIT" = do not divide into sub-route files. Extracting inline business logic to services is not splitting  it is required cleanup.

| File type | Example |
|---|---|
| Express route files (`routes/**/*.ts`) into sub-route files | `asterisk.ts`  `asterisk-sip.ts` + `asterisk-ivr.ts`  |
| Test files | `*.test.ts`, `*.spec.ts` |
| Database migrations | `supabase/migrations/*.sql` |
| Type-only files | Files with only `interface`/`type`/`enum` |
| Catalog / lookup / config files | `workflow/library/catalog.ts` |
| Already-modular files | Has `* Refactored to use:` header or imports from sibling `./Module.js` files |

###  GOOD CANDIDATES

| File type | Key signal |
|---|---|
| React components | Inline sub-components, sections with own state, tabs as large JSX blocks |
| Service classes | 3+ unrelated method groups, imports from 5+ domains |
| Large utility files | Independent functions with no shared state |
| Orchestrator classes | Delegates to multiple sub-systems but contains sub-system logic inline |

See `references/split-patterns.md` for real before/after examples.

---

##  Step 1: Coupling Analysis (ALWAYS do this first)

Run `analyze.ts` to see block structure, then grep for importers:

```bash
npx tsx scripts/refactor/analyze.ts <targetFile>
grep -r "from.*TargetFile" src/ server/ --include="*.ts" --include="*.tsx" -l
```

If >10 files import from it, any export change cascades. Plan to either preserve all existing exports or update all importers with `fix-imports.ts`.

Also check: does the file already have a `* Refactored to use:` comment or import from sibling files? If yes  it's already been split. Stop here.

---

##  Step 2: Complexity Gate (NOT just line count)

Read the file. A refactor is justified only if **most** of these are true:
- **3+ genuinely distinct concerns** (not 3 sections of similar things)
- Those concerns are **independently testable**
- A new developer must read the **whole file** to understand any one part
- There is **shared mutable state** that could be isolated per module

If the file is long but linear (e.g., route handlers, a list of functions), it does not meet the complexity gate. Report this to the user and stop.

---

##  Step 3: Propose Split Strategy

State explicitly before writing any code:
1. Which logical units will be extracted and why
2. New file names and locations
3. What stays in the original (orchestrator? re-exporter?)
4. Estimated line count for each output file (all must be **under 500**)
5. Which files outside the target will need import updates

**Get user agreement before writing any code.**

---

##  Step 4: Execute Atomically

One new file at a time:
1. Create the new file with extracted code
2. Add the import in the original file
3. Remove the extracted code from the original
4. Check TS: run `node .agent/skills/code-quality/scripts/start-here-ts.mjs`  **NEVER** run `tsc` directly (RAM) or `npm run lint` (prohibited by CLAUDE.md)
5. Repeat for next module
6. Update all importers using `fix-imports.ts` if paths changed

---

##  Step 5: Verify

```bash
npx tsx .agent/skills/refactor/scripts/verify.ts <original> <new1> <new2> ...
```

Then check TS: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`  never run `tsc` or `npm run lint` directly.

Zero new errors is the only acceptable outcome.

---

##  Step 6: API KB Sync (MANDATORY if API routes changed)

If any route was **added, removed, renamed, or its request/response shape changed**, you MUST resync the API Knowledge Base so Code Mode stays accurate.

```bash
# Re-seed the API Reference KB
npx tsx scripts/seed-api-reference-kb.ts
```

**When this applies:**
- New service extracted a route  its documentation moves with it (KB update required)
- A route was deleted or merged  remove stale KB entry
- A route's params/response changed  update KB entry

This is NOT optional. Code Mode assistants query the KB for route discovery. Stale KB = hallucinated API docs.

---

##  Changelog

### [6.1.0] - 2026-04-06
- **Service Extraction Mode**: Added explicit pattern for route files with bloated inline handlers  distinct from "NEVER SPLIT" file division
- **Quick-Pick Mode table**: Fast symptommode decision at top of skill
- **Mandatory script gate**: `analyze.ts` and `verify.ts` marked mandatory (not just documented)
- **Session Continuity Handoff Protocol**: Formal section capturing what must be in HANDOFF.md during complex refactors
- **NEVER SPLIT clarification**: Route file prohibition now distinguishes "sub-route file split" from "service extraction"
- **TS check corrected**: Replaced `mcp__devtools__typescript_critical_only` with canonical `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- **Step 6  API KB Sync**: Mandatory `npx tsx scripts/seed-api-reference-kb.ts` after any route addition/removal/rename  keeps Code Mode assistant accurate

### [6.0.2] - 2026-04-02
- **Standard Alignment**: Bumped to v6.0.2 to align with the "Properly Written" standard.
- **Audit Pass**: Verified modularization protocols (`audit.sh`, `analyze.ts`, `extract-to-module.ts`, `fix-imports.ts`, `verify.ts`), "NEVER SPLIT" patterns, and the 1000/500 rule against the March 2026 production environment.

### [2.0.0] - 2026-03-18

- **Major rewrite**: Classify-first approach with explicit NEVER-SPLIT list
- **References added**: `never-split-patterns.md` and `split-patterns.md` with real examples
- **All scripts documented**: Full usage, flags, and example workflow for all 5 scripts
- **Coupling analysis step**: Added as mandatory Step 1 before any edits
- **Complexity gate**: 4-question test  line count alone no longer justifies a split
- **Ask-first rule**: When no target is given, show audit and ask  do NOT act autonomously
- **Removed fictional capabilities**: Replaced `audit_large_files()` etc. with real script commands
- **Fixed atomic steps**: "Update all importers via fix-imports.ts" not just original file
- **Already-modular check**: Check for `Refactored to use:` header before proposing split
- **RAM safety**: Explicit prohibition on running `tsc`  use `mcp__devtools__typescript_critical_only`
- **verify.ts rewritten**: Removed `tsc` call, added line count check per output file, added coupling check

### [1.3.0] - 2026-01-18

- Master Skill Sync. Path verification.

### [1.2.0] - 2026-01-18

- Script Reversal. Structural Standardization.

### [1.1.0] - 2026-01-18

- Updated verify.ts for ESM. Introduced Delegation Pattern.

### [1.0.0] - 2026-01-17

- Initial release. Established 1000/500 rule.


> **CODE MODE MANDATE**: You MUST use the `execute_api` tool for all API interaction, and `search_api` to discover endpoints/schemas.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T22:41:36.409Z -->

<!-- END INJECTED MEMORY -->
