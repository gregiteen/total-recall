# 🐍 SSSS (Structured Semantic Syntax System)

The SSSS is the bedrock of the Database-Free Workspace architecture. It dictates that all logic, state, and primitives in a workspace are defined as human-readable, AI-native Markdown files stored in a Virtual File System (VFS).

## 1. The Core Mandate

- **No Relational Databases**: Do not use Postgres or external databases for workspace configuration.
- **Markdown is Law**: If it exists in a workspace (an Assistant, a Workflow, a Branding config, or a Memory Node), it must exist as a Markdown (`.md`) or YAML (`.yml`) file.
- **Semantic Frontmatter**: Every file MUST contain YAML frontmatter at the top defining its core metadata and `type`.

## 2. Primitive Types

The `type` field in the frontmatter determines how the engine interprets the file.

### 2.1 Memory Node (`type: memory`)
The core primitive of Total Recall. See `schema-v2.md` for specific frontmatter rules.
```markdown
---
type: memory
slug: prefer-pm2-reload
category: patterns
---
Use pm2 reload instead of restart.
```

### 2.2 Assistant (`type: assistant`)
Assistants are simply system instructions and chat logs.
```markdown
---
type: assistant
name: Sarah
model: anthropic/claude-3-5-sonnet-20241022
---
You are Sarah...
```

### 2.3 Workflow (`type: workflow`)
Workflows are the central automation engine. They bind triggers to AI execution steps.

```markdown
---
type: workflow
name: Nightly Dream Cycle
triggers:
  - type: cron
    schedule: "0 3 * * *"
---
## Step 1: Deduplication
Run the vault librarian.
```

## 3. The Execution Primitives

- **Code Mode (The Sandbox)**: Assistants and Workflows don't need hardcoded integrations. They write and execute code in a secure Node.js sandbox.
- **Skills**: Reusable modular packages (like `total-recall` or `crm`) that extend capability via scripts and SSSS rules bundled together in the VFS.

## 4. Enforcement

Whenever you are generating, updating, or debugging Workspace files, you MUST ensure they strictly follow the SSSS frontmatter format. Never use proprietary binary blobs or obscure local databases for state.
