---
type: skill
name: total-recall
description: "Use this skill as the master guide to understand the entire Total Recall Sovereign AI OS setup, VFS topologies, SSSS protocol, CLI parameter reference, troubleshooting, and automated upstream repository sync. MANDATORY: Read this file before attempting major setup modifications or diagnoses."
---

# Total Recall — Master Agent Skill (REST API First)

Welcome to the master control skill for the **Total Recall Sovereign AI OS**. > [!NOTE]
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
*   **Action**: Use the two complementary search modes:
     *   **Regular Text Search** (e.g. filesystem grep / literal matching): Use this when searching for specific literal keywords, exact config keys, exact filenames, or exact slugs.
     *   **Semantic Search (REST API POST `/api/memory/search/semantic`)**: Use this when searching for conceptual matching, high-level intent, design patterns, or user preferences. Do NOT rely on only one search mode; combine both to ensure absolute coverage.

### 4. When a topic requires deep, structured domain learning and mastery
*   **Trigger**: When you encounter a complex architectural topic, a deep conceptual system, or a technical domain where you need to acquire deep mastery to proceed effectively.
*   **Must NOT Trigger**: Do NOT use background research for quick searches of simple APIs, common code snippets, or basic web-related docs. Standard models have active web search capabilities that should be used for these quick, on-demand reference lookups.
*   **Action**: Autonomously queue the topic to the background research agenda using the `/api/research` REST API POST endpoint to let the daemon build a high-confidence vault node.

### 5. When you modify, add, or delete files in the memory vault
*   **Trigger**: Immediately after performing any memory node writes.
*   **Action**: Rebuild the instruction shims by sending a POST request to `/api/vault/compile`.

### 6. When troubleshooting connections, port blocks, or sync errors
*   **Trigger**: If the REST server is unreachable, ports are blocked, or the upstream sync tool encounters errors.
*   **Action**: Refer to the active diagnostics manual within this skill to heal the local runtime.

---

## ⚡ Core Directives for IDE Agents

### 1. Zero-Database Sovereign Integrity
Total Recall operates **entirely database-free**. The local filesystem is the source of truth. Every rule, pattern, decision, concept, preference, and fact exists as a plain Markdown file with semantic YAML frontmatter. Derived indexes are disposable caches. Do not look for PostgreSQL or SQLite databases.

### 2. Precise Tool & API Selection Heuristics
When interacting with the system, choose your interfaces based on the following:
*   **Local Skills**: Use local skill packages (located in `.agent/skills/`) for complex workspace tasks, testing, and formatting. If a local skill has custom helper scripts, ALWAYS invoke them via your shell command tool instead of running raw standard commands.
*   **Total Recall Brain (MANDATORY)**: For all semantic searches, memory retrieval, memory writes, and derived index recompilation, **ALWAYS use shell `curl` commands** targeting the REST API endpoints documented below.

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

---

## 🌐 DIRECT REST API REFERENCE

All requests to the Total Recall REST API must include the Bearer token in the `Authorization` header.

*   **Active Bearer PAT Token**: `<YOUR_PAT_TOKEN>` (Retrieve dynamically from process.env.TR_PAT or read .agent/config/brain.json)
*   **Base URL**: `<YOUR_BRAIN_URL>` (Retrieve from process.env.TR_BRAIN or read .agent/config/brain.json; default: http://localhost:3000)

### Endpoint Reference & curl Templates

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Check system health (vault count, embeddings, Ollama status) |
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

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T03:34:14.837Z -->

<!-- END INJECTED MEMORY -->
