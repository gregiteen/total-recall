Read and follow .agent/skills/total-recall/SKILL.md on every turn.

<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->
## Total Recall — Sovereign Memory System (Installed)

You have Total Recall installed. Use these CLI commands to remember and recall information.

### npx total-recall remember <category> "<content>" [options]
Save rules, preferences, corrections, and facts to permanent memory.

**Categories:** invariant, preference, correction, fact, concept, pattern, anti-pattern, decision, lore

**Options:**
  --tags, -t <list>          Comma-separated tags (e.g. "config,server")
  --importance, -i <1-5>     Importance level (default: 3)
  --priority, -p <level>     absolute | high | normal | low (default: normal)
  --modality, -m <type>      must | must_not | should | should_not | descriptive | preference
  --confidence, -c <0-1>     Confidence level (default: 1.0)
  --slug <custom-slug>       Custom kebab-case slug
  --title <custom-title>     Custom human-readable title
  --status <state>           active | draft | archived (default: active)
  --related <list>           Comma-separated related slugs
  --global                   Save to global brain (identity layer)
  --project                  Save to project brain (context layer)

**Examples:**
  npx total-recall remember invariant "Never run tsc directly." --importance 5 --priority absolute
  npx total-recall remember preference "Always use single quotes." --tags "style,js"
  npx total-recall remember fact "The server runs on port 3000." --importance 4
  npx total-recall remember fact "Uses Drizzle ORM" --project

### npx total-recall recall "<query>" [options]
Semantic search across rules, facts, and session history.

**Options:**
  --top-k, -k <number>       Results to return (default: 5, max: 20)
  --no-sessions, -ns         Exclude session chunks, vault only
  --format, -f <type>        text (default) or json
  --category, -cat <name>    Filter by SSSS category
  --tags, -t <list>          Filter by tags
  --modality, -m <type>      Filter by modality
  --importance, -i <1-5>     Filter by minimum importance
  --global                   Search global brain only
  --project                  Search project brain only

**Examples:**
  npx total-recall recall "Never run tsc directly"
  npx total-recall recall "Express server port" --top-k 3
  npx total-recall recall "tsc" --category invariants --modality must

### npx total-recall help <topic>
Query interactive local documentation, VFS specifications, and command references.

**Options:**
  --json, -j               Emit machine-readable JSON (ideal for programmatic retrieval)

**Examples:**
  npx total-recall help connect
  npx total-recall help architecture
  npx total-recall help ssss

### npx total-recall --help
Show all available commands.


## Invariant Rules

- # Total Recall Operating Protocol

You are operating within the **Total Recall Sovereign OS**. Your memory and logic are entirely governed by the **Structured Semantic Syntax System (SSSS)**. There is no external database. The filesystem is your brain.

## 1. Memory Architecture
Your memory is strictly localized to the `.agent/memory-vault/` directory.
- You do not use external databases or third-party persistence stores.
- Every memory, rule, concept, or workflow is a standalone Markdown (`.md`) file with YAML frontmatter.

## 2. Reading Memory
- Your immediate context is injected automatically.
- If you need deeper knowledge on a specific domain, use your filesystem tools to read the `SKILL.md` files located in `.agent/skills/`.
- You may actively search the `.agent/memory-vault/` directory for historical decisions, patterns, or facts.

## 3. Writing Memory
When you learn a new pattern, receive a correction, or establish a new rule, you must autonomously save it to the vault:
1. Determine the appropriate category (e.g., `patterns/`, `concepts/`, `preferences/`).
2. Use your file writing tools to create a new `.md` file inside `.agent/memory-vault/<category>/<slug>.md`.
3. **MANDATORY**: Before writing the file, you MUST read `.agent/skills/ssss/SKILL.md` to get the exact required YAML schema. Do not guess the schema. The file MUST contain valid SSSS YAML frontmatter.

## 4. Compiling the Vault
Any time you create, edit, or delete a file in the memory vault, the system indexes must be rebuilt so your instructions update.
- **Mandatory Action:** Immediately after writing a memory node, you must execute `npx total-recall compile` in your terminal.
- If the compile process flags a conflict, you must read the conflict record in `.agent/memory-inbox/conflicts/` and resolve it using `npx total-recall resolve`.

## 5. Execution Mandate
You must operate autonomously. Do not ask for permission to save memories or compile the vault. If you observe a pattern or receive a correction, write the node and compile it immediately.

## 6. Continuous Intelligence & Research Queue
To support long-horizon and complex reasoning tasks, Total Recall features an autonomous background Research Queue:
- **Cloud-Brain Queueing:** Agents can enqueue deep research projects via `POST /api/research` with parameters: `{ topic: "string", priority: "high|medium|low", notes: "string" }`.
- **Background Execution:** The daemon loop and background scheduler poll and execute pending research projects, committing new semantic nodes to the `memory-vault/` automatically upon completion.
- **Dynamic Search & Filtering:** Agents can check progress or find existing research projects using `GET /api/research` with filtering parameters like `status` (e.g., `pending`, `in_progress`, `done`, `failed`) and `query` to search project topics and notes dynamically.
- **Zero Local Footprint:** Always interact with the cloud-brain queue through API calls rather than direct JSONL modifications to maintain isolation and security boundaries.
<!-- END INJECTED ACTIVE DIRECTIVES -->
