---
name: total-recall
provenance: total-recall
description: >-
  Use this skill to operate Total Recall — portable memory, instructions,
  openwiki, skill deploy, and secrets. MANDATORY: Read this file before changing
  TR setup. Nested packages under modules/ are NOT agent skills.
version: 3.14.1
repo_scoped: true
---

# Total Recall — Master Agent Skill

> **Product focus:** portable personal memory + IDE instructions + openwiki + skill deploy + secrets.
> **Only agent skill in this package.** Implementation helpers live in `modules/` (not skills).
> Openwiki ships with the brain at `openwiki/`.


Welcome to the master control skill for the **Total Recall Autonomous AI OS**. > [!NOTE]
> **Total Recall Architecture:**
> The Total Recall memory kernel runs as a standalone REST service. Agents interact with the memory vault, perform semantic searches, and compile rules directly using lightweight, filesystem-native REST API calls via standard shell `curl` commands.

---

## 🎯 WHEN TO USE THIS SKILL

You MUST actively reference and apply this skill under the following specific runtime scenarios:

### 1. When the user establishes a rule, preference, or correction
*   **Trigger**: Whenever the user corrects your behavior, shares a coding style, defines an architectural pattern, or establishes a preference you must remember.
*   **Action**: Autonomously create a new SSSS v2 memory node under `.agent/memory-vault/` and compile the vault.

### 2. When referencing invariants, preferences, and corrections (Intrinsically Known Rules)
*   **⚠️ MANDATORY**: The compiled instruction files (like `INSTRUCTIONS.md`, `GEMINI.md`, `AGENTS.md`, etc.) contain the **entirety** of active invariants, preferences, and behavior corrections (rules/directives).
*   **Action**: You **intrinsically know these rules** because they are injected directly into your active prompt/instruction context. You **MUST NEVER** execute manual filesystem searches (grep, find) or REST API/curl queries to discover or check these basic rules.

### 3. When searching for complex domain knowledge or general facts
*   **Trigger**: When you need to retrieve deep factual information (e.g. from the `facts/` category) or conceptual domain structures (e.g. from `concepts/`) that are not present in your active instruction files.
*   **Action**: Use the semantic/lexical hybrid search engine (via the local `recall` command, or `/api/memory/search/semantic` endpoint) along with regular text search (e.g., grep):
     *   **Hybrid Search**: Blends cosine-similarity vector search and lexical density TF-IDF keyword matching using Reciprocal Rank Fusion (RRF). This blends intent-based semantic matching with exact keyword accuracy.
     *   **Hierarchical Parent-Child Search**: Memory node bodies are chunked and indexed as children. The vector store searches both the parent node and child chunks, returning matches based on maximum similarity.
     *   **Regular Text Search**: Use grep to locate exact configurations, literal keys, or symbols.

### 4. When a topic requires deep, structured domain learning and mastery
*   **Trigger**: When you encounter a complex architectural topic, a deep conceptual system, or a technical domain where you need to acquire deep mastery to proceed effectively.
*   **Must NOT Trigger**: Do NOT use background research for quick searches of simple APIs, common code snippets, or basic web-related docs. Standard models have active web search capabilities that should be used for these quick, on-demand reference lookups.
*   **Action**: Autonomously queue the topic to the background research agenda using the `/api/research` REST API POST endpoint to let the daemon build a high-confidence vault node.

### 4b. When work should outlive this chat (daemon tasks — anything)
*   **Trigger**: Long-running or deferred work: post-session extract, scheduled dream, custom maintenance, follow-ups the user wants the daemon to run later.
*   **Action**: Enqueue an open task envelope (not only research):
    ```bash
    npx total-recall task add "<intent>" --cap vault:write --priority high --agent <your-id>
    npx total-recall task list
    npx total-recall task cancel <slug>
    ```
*   **Policy**: Default capabilities are `vault:read`. Use `--cap vault:write` to land drafts in `memory-inbox/pending` for dream promotion. Shell/net-post caps are denied. Do not assume idle auto-fill; the queue only runs what was enqueued (plus periodic system dream).

### 5. When you modify, add, or delete files in the memory vault
*   **Trigger**: Immediately after performing any memory node writes.
*   **Action**: Rebuild the instruction shims. If using CLI commands (`npx total-recall remember` / `forget`), recompilation runs automatically in the background (asynchronously via detached subprocesses) to minimize latency. If editing vault files directly, trigger manual compilation by sending a POST request to `/api/vault/compile` or running `npx total-recall compile`.

### 6. When troubleshooting connections, port blocks, or sync errors
*   **Trigger**: If the REST server is unreachable, ports are blocked, or the upstream sync tool encounters errors.
*   **Action**: Refer to the active diagnostics manual within this skill to heal the local runtime.

---

## ⚡ Core Directives for IDE Agents

### 1. Zero-Database Integrity
Total Recall operates **entirely database-free**. The local filesystem is the source of truth. Every rule, pattern, decision, concept, preference, and fact exists as a plain Markdown file with semantic YAML frontmatter. Derived indexes are disposable caches. While the internal Vector Store engine is pluggable and ready for native drop-in indexing engines (such as SQLite-VSS or HNSWLib), the canonical source of truth remains filesystem flat files. Do not look for PostgreSQL or traditional SQL databases.

### 2. Precise Tool & API Selection Heuristics
When interacting with the system, choose your interfaces based on the following:
*   **Local Skills**: Use local skill packages (located in `.agent/skills/`) for complex workspace tasks, testing, and formatting. If a local skill has custom helper scripts, ALWAYS invoke them via your shell command tool instead of running raw standard commands.
*   **Total Recall CLI (PRIMARY — use this)**: For all memory operations — saving, recalling, forgetting, and compiling — use the `npx total-recall` CLI commands. This is the correct and preferred interface.
    ```bash
    npx total-recall recall "your query here" --top-k 5
    npx total-recall remember invariant "rule text" --importance 5 --priority absolute
    npx total-recall remember fact "fact text" --project
    npx total-recall forget <slug>
    npx total-recall compile
    ```
*   **Custom Local Commands**: The Total Recall CLI supports managing project-specific CLI commands dynamically. Use the `command` subcommand to manage these.
    ```bash
    npx total-recall command create hello "console.log('Hello from the brain!');"
    npx total-recall command list
    npx total-recall command read hello
    npx total-recall command update hello "console.log('Updated hello command');"
    npx total-recall command remove hello
    ```
    Custom commands are auto-generated and stored in the workspace at `.agent/commands/<name>.mjs`.
*   **REST API via curl (SECONDARY — fallback only)**: Use raw `curl` commands to the REST API endpoints only when the CLI is unavailable or for advanced programmatic use cases not covered by the CLI.

### 3. Non-Destructive Code Modifications
When modifying existing rule surfaces or IDE shims (such as `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, etc.), **NEVER** overwrite the developer's custom pre-existing rules. Instead, write compiled absolute invariants inside the managed comment block:
`<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->`
...
`<!-- END INJECTED MEMORY -->`

### 4. Upstream Skill Synchronization
Keep local skill definitions and invariant files updated by executing the sync runner:
```bash
node .agent/skills/total-recall/scripts/sync-repo.mjs
```
This utility fetches standard skill and invariant definitions from the upstream repository, merges them non-destructively preserving custom user nodes, and auto-recompiles the workspace.

### 5. Premium Browser Setup Wizard Onboarding
For first-time system installations, migrations, or editor reconnections, launch the visual onboarding setup wizard:
```bash
npx total-recall deploy --ui
```
This spins up a secure local Express server (port 3000, increments dynamically if occupied) and automatically launches the graphical installation dashboard in your macOS or Linux browser, providing:
*   **Deployment Scoping**: Seamless visual provisioning for local machine brains, remote network computers (SSH), rented GPU cloud servers (Vast.ai), or custom VPS droplets.
*   **Credential Restoration**: Automatically parses, protects, and restores AES-encrypted API tokens and bcrypt cost-12 dashboard passwords from `.agent/secrets.enc` so you never lose credentials.
*   **Automated SSL & Tunnels**: Automatically deploys free, encrypted Cloudflare Quick Tunnels (`*.trycloudflare.com`) or permanent Zero Trust domains over secure HTTPS/Caddy TLS.
*   **Omni-Channel Integration Checklists**: Multi-select and configure your active editors (Claude Code, Cursor, Codex, Gemini, VS Code, Obsidian) with live terminal logs in the browser.

---

## 🛠️ LOCAL CLI SUITE REFERENCE

For local workstation and terminal-based agent workflows, Total Recall provides a CLI command suite:

### 1. Save Memory Node
```bash
npx total-recall remember <category> "<content>" [options]
```
Save rules, preferences, corrections, and facts.
*   **Categories**: `invariant`, `preference`, `correction`, `fact`, `concept`, `pattern`, `anti-pattern`, `decision`, `lore`.
*   **Options**:
    *   `--global` / `--project`: Target scope. Global writes propagate to all registered projects.
    *   `--importance <1-5>`: Define relative importance.
    *   `--priority <level>`: Set priority level (`absolute`, `high`, `normal`, `low`).
    *   `--modality <type>`: Modality constraints (`must`, `must_not`, `should`, `should_not`, `descriptive`).
    *   `--slug <custom-slug>` / `--title "<custom-title>"`: Override automatic identifiers.
    *   `--expires <duration>`: Set expiration lifespan (e.g. `7d`, `2w`, `6h`, `3m`).
*   *Note*: Spawns an asynchronous background surface compile process immediately on execution to avoid synchronous blockages.

### 2. Delete Memory Node
```bash
npx total-recall forget <slug> [options]
```
Delete a memory node by slug.
*   **Options**:
    *   `--global` / `--project`: Scope layers. If omitted, checks project first, then global.
    *   `--no-compile`: Skip automatic background recompilation.
*   *Note*: Spawns an asynchronous background surface compile process immediately on execution.

### 3. Recall / Hybrid Search
```bash
npx total-recall recall "<query>" [options]
```
Perform semantic/lexical hybrid search across rules, facts, and session history using Reciprocal Rank Fusion (RRF).
*   **Options**:
    *   `--top-k, -k <number>`: Number of results (default: 5).
    *   `--category, -cat <name>`: Filter by SSSS category.
    *   `--tags, -t <list>`: Filter by tags.
    *   `--global` / `--project`: Search specific layer.

### 4. Build Memory Vault (Recompile)
```bash
npx total-recall compile
```
Synchronously rebuild the entire memory index (derived embeddings) and regenerate prompt instruction shims (such as `INSTRUCTIONS.md`, `GEMINI.md`, `AGENTS.md`, etc.).

### 5. Ingest OKF Bundle
```bash
npx total-recall ingest okf <path> [options]
```
Recursively parse and ingest an Open Knowledge Format (OKF v0.1 Draft) bundle directory.
*   **Options**:
    *   `--dry-run`: Parse and validate nodes without writing files.
    *   `--category <name>`: Override and force all imported nodes to a specific category.
    *   `--importance <1-5>`: Override importance for imported nodes.
    *   `--on-conflict <strategy>`: Slug conflict behavior (`overwrite`, `skip`, `warn` - default is `warn`).
    *   `--type-map <json>`: Custom type-to-category mapping JSON.
*   *Note*: Spawns an asynchronous background surface compile process immediately on successful ingest.

### 6. Ingest OpenWiki Directory
```bash
npx total-recall ingest openwiki <path>
```
Automatically ingest LangChain's auto-generated architectural OpenWiki directories into Total Recall's semantic knowledge graph.
*   Tags all ingested nodes with `openwiki`, `architecture`, `auto-generated`.
*   Nodes can be viewed in the dashboard's OpenWiki browser.

### 7. Export OKF Bundle
```bash
npx total-recall export <path> [options]
```
Export the memory vault into an OKF-compliant directory structure.
*   **Options**:
    *   `--okf`: Run in OKF export mode.
    *   `--strip-ssss`: Strip all SSSS-specific metadata parameters from output frontmatter.
    *   `--format <type>`: Package output as archive (`tar.gz`).
    *   `--global` / `--project`: Target scope layer.

### 8. Lint OKF Compliance
```bash
npx total-recall lint --okf [options]
```
Scan vault memory nodes and check for OKF metadata compliance (presence of title, description, tags, and updated timestamp).
*   **Options**:
    *   `--strict`: Promote compliance warnings to errors and exit with code 1.

---

## 🌐 DIRECT REST API REFERENCE

All requests to the Total Recall REST API must include the Bearer token in the `Authorization` header.

*   **Active Bearer PAT Token**: `<YOUR_PAT_TOKEN>` (Retrieve dynamically from process.env.TR_PAT or read .agent/config/brain.json)
*   **Base URL**: `<YOUR_BRAIN_URL>` (Retrieve from process.env.TR_BRAIN or read .agent/config/brain.json; default: http://localhost:3000)

### Endpoint Reference & curl Templates

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Check system health (vault count, embeddings, CLI agents availability) |
| `GET` | `/api/vault/status` | Vault stats summary |
| `GET` | `/api/memory` | List all SSSS memory nodes |
| `GET` | `/api/memory/:slug` | Fetch a single SSSS memory node by its slug |
| `POST` | `/api/memory` | Create or update (upsert) a memory node |
| `POST` | `/api/memory/search/semantic` | Perform vector semantic search using local dense embeddings |
| `POST` | `/api/research` | Queue a topic for the background research daemon |
| `GET` | `/api/research` | Retrieve/search active research agenda & queue |
| `POST` | `/api/vault/compile` | Recompile derived index caches and rule surfaces |
| `DELETE` | `/api/memory/:slug` | Archive a memory node |

#### 1. Check System Health
```bash
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/health
```

#### 2. Perform Vector Semantic Search (Use this for all concept lookup requests)
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query here", "top_k": 5}' \
  <YOUR_BRAIN_URL>/api/memory/search/semantic
```

#### 3. Fetch a Specific Memory Node
```bash
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/api/memory/slug-name
```

#### 4. List All Memory Nodes
```bash
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/memory"
```

#### 5. Create or Update a Memory Node
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "atomic-writes",
    "category": "facts",
    "title": "Always write files atomically",
    "status": "active",
    "confidence": 0.95,
    "importance": 4,
    "modality": "must",
    "content": "Always write files atomically by creating a temporary file first and renaming it to prevent partial file writes."
  }' \
  <YOUR_BRAIN_URL>/api/memory
```

#### 6. Trigger Surface Recompilation (Run this after adding, editing, or deleting memory files)
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/api/vault/compile
```

#### 7. Archive a Memory Node
```bash
curl -X DELETE \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/api/memory/slug-name
```

#### 8. Queue Autonomous Research
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Next.js 15 routing models", "priority": "high", "notes": "Analyze layout models"}' \
  <YOUR_BRAIN_URL>/api/research
```

#### 9. Retrieve and Search/Filter Research Projects
Query the background research queue, optionally filtering by status (`pending`, `in_progress`, `done`, `failed`) or searching the `topic` and `notes` fields with a dynamic query string.
```bash
# Retrieve entire research queue
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/research"

# Filter research projects by status
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/research?status=pending"

# Dynamically search research projects by topic/notes query
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/research?query=Next.js"
```

---

## 🔐 SECRETS STORE (separate from the memory vault — `secret` subcommand)

API keys and credentials are **not** memory nodes. They live encrypted at
`<brain>/config/secrets.enc`, managed exclusively via `npx total-recall secret
<cmd>` — never write them into vault markdown, openwiki, or a compiled
INSTRUCTIONS.md/skill surface (`secret check-surfaces` fails the build if one
ever leaks in). Full reference: `npx total-recall secret --help`.

```bash
npx total-recall secret set <key> <value>            # store (0600, optional AES)
npx total-recall secret rotate <key> <new-value>      # replace + mark rotated
npx total-recall secret get <key>                     # print value (audited)
npx total-recall secret list                          # metadata only, no values
npx total-recall secret export-env --path <repo>       # SSOT → local .env.local
```

### Remote (production) deploy — `secret remote` (added 3.21.1)

`export-env` only ever wrote a **local** file — there was no path from the
SSOT to an actual production host. `secret remote` closes that gap over SSH,
entirely generically: every host/path/restart-command is declared per-repo in
that repo's own `<brain>/config/remote-targets.json`, never hardcoded in
Total Recall core.

```bash
# One-time: register a target (per repo, per environment)
npx total-recall secret remote add production \
  --host <ip-or-hostname> --path </remote/dir> \
  --filename .env.local --restart-cmd "pm2 restart <app> --update-env"

npx total-recall secret remote list                    # show configured targets
npx total-recall secret remote deploy production        # push current SSOT now
npx total-recall secret remote deploy production --dry-run

# Steady state: rotate AND ship to prod AND restart, in one call
npx total-recall secret rotate SMTP2GO_API_KEY "<new-value>" --remote production
```

Secret values travel over SSH **stdin only** — never as an argv string or in
a shell-interpolated command — written via a remote temp-file + atomic
rename so a dropped connection can't leave a truncated secrets file live,
then `chmod 600`. This is also why a value should never be pasted into chat
to get it into production: paste it straight into `secret set`/`secret
rotate` in your own terminal, or — if a provider's API supports minting a
new key from an existing one (e.g. SMTP2GO `POST /api_keys/add`) — mint the
replacement programmatically and it never has to be typed anywhere at all.
When self-minting a replacement key, scope it to include the provider's own
key-management endpoints (not just its functional one) so it can service
its *own* next rotation too — otherwise you've built a one-shot capability
that dead-ends back at a manual dashboard step.

---

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T03:34:14.837Z -->

<!-- END INJECTED MEMORY -->


---

## Operational modules only (not skills)

Only files required at runtime live under `modules/`. Everything else was removed.

| Path | Role |
|------|------|
| `modules/skill-deploy/scripts/` | `find-skills` / `install-skill` / `scan-skill` for CLI + API |
| `modules/agents/agents.yml` | Headless CLI agent registry for `runtime.mjs` |
| `openwiki/` | Knowledge docs (auto-shipped on init) |
| `references/ssss-reference.md` | Compact SSSS notes (prefer `@ssss/cli` for mutations) |

Do **not** nest agent skills inside total-recall. User skills: `.agent/skills/<name>/SKILL.md`.
