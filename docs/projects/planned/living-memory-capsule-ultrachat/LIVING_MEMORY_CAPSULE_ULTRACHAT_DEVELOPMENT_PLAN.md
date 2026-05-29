# Development Plan: Workspace-Scoped Living Memory Folder & Branded LLM Pricing

This document presents the detailed development plan and implementation schedule to build the folder-based **Living Memory Capsule** architecture and introduce the state-of-the-art 2026 open-source LLM packages into the UltraChat marketplace.

---

## 1. System Design & Architecture

### A. Directory Structure
Workspace capsule folders reside strictly within the SSSS memory environment:
`memory-vault/living-capsules/<workspace-id>/`

Files inside are named deterministically:
`<category>-<slug>.md`

### B. Alpha-Numeric Deterministic Joins
At runtime, we read and concatenate the workspace directory files deterministically:
```javascript
import fs from 'fs/promises';
import path from 'path';

export async function getDeterministicCapsule(vaultDir, workspaceId) {
  const capsuleDir = path.join(vaultDir, 'living-capsules', workspaceId);
  try {
    const files = await fs.readdir(capsuleDir);
    // Sort alphabetically by filename to guarantee cache prefix stability
    files.sort();
    
    let combined = '';
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const fileContent = await fs.readFile(path.join(capsuleDir, file), 'utf8');
      combined += `\n\n## Memory: ${file.replace('.md', '')}\n${fileContent.trim()}`;
    }
    return combined.trim();
  } catch (err) {
    if (err.code === 'ENOENT') return ''; // Empty capsule
    throw err;
  }
}
```

### C. The Garbage Collection Cron Task
A background pruning worker runs in the scheduler loop:
- Scans `living-capsules/**/*.md`.
- Parses YAML frontmatter attributes (e.g. `superseded_by`, `created_at`).
- Auto-deletes contradicting records and trims context size to protect token budgets.

---

## 2. API Design & Endpoint Specification

We will modify `src/server/rest.mjs` to add the following endpoints:

### Endpoint 1: Retrieve Dynamic Capsule
- **Route**: `GET /api/comms/capsule`
- **Query Params**: `?workspace_id=string`
- **Output**: Returns the alphabetically concatenated raw markdown capsule directly for prompt insertion.

### Endpoint 2: Instant Record observation
- **Route**: `POST /api/comms/capsule/record`
- **Body**:
  ```json
  {
    "workspace_id": "string",
    "category": "preferences|facts",
    "slug": "string",
    "title": "string",
    "content": "string"
  }
  ```
- **Output**: Instant write (<2ms) returning `{ success: true, path: "string" }`.

### Endpoint 3: Marketplace Packages Fleet
- **Route**: `GET /api/marketplace/packages`
- **Output**: Returns the curated list of 2026 SOTA open-source model packages (Gemma 4, Llama 4 Scout, DeepSeek R1/V4, GLM-5.1) with their credit pricing tiers.

---

## 3. Implementation Steps

### Step 1: Core VFS Helpers (`src/core/capsule.mjs`)
- Implement file operations, deterministic alphabetized concatenation, and pruning algorithms.

### Step 2: REST Server Integrations (`src/server/rest.mjs`)
- Connect routes and wire them to the active VFS directories.

### Step 3: Verification & Test Suite (`src/core/capsule.spec.mjs`)
- Author test specs asserting character-by-character stability, under-2ms write speeds, and pruning safety.
