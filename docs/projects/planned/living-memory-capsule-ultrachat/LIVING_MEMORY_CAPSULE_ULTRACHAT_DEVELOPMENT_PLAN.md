# Development Plan: Workspace-Scoped Living Memory Folder & Branded LLM Pricing

This document presents the detailed development plan and implementation schedule to build the folder-based **Living Memory Capsule** architecture and introduce the state-of-the-art 2026 open-source LLM packages into the UltraChat marketplace.

---

## 1. System Design & Architecture

### A. Directory Structure

Workspace capsule folders reside **outside** the SSSS `memory-vault/` to prevent contamination of vault indexes, embeddings, and graph generation:

```
<BRAIN_DIR>/living-capsules/<workspace-id>/
```

> **Why not `memory-vault/living-capsules/`?**
> The existing `loadNodes()` in `src/core/vault.mjs` uses `walkMd()` which recursively scans **all** `.md` files in `memory-vault/`. Placing capsules there would cause them to be parsed as SSSS memory nodes, corrupting the vault index, semantic embeddings, and Obsidian Canvas graph.

Files inside are named deterministically:
```
<category>-<slug>.md
```

### B. Shared Constants

Add to `src/server/routes/_shared.mjs`:
```javascript
export const CAPSULES_DIR = path.join(BRAIN_DIR, 'living-capsules');
```

### C. Alpha-Numeric Deterministic Joins with Safety Bounds

At runtime, read and concatenate workspace directory files deterministically with parallel I/O, error handling, and size limits:

```javascript
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.mjs';

const MAX_CAPSULE_FILES = 200;
const MAX_CAPSULE_BYTES = 512_000; // 500KB
const MAX_FILE_BYTES = 4_096;      // 4KB per file

export async function getDeterministicCapsule(brainDir, workspaceId) {
  const capsuleDir = path.join(brainDir, 'living-capsules', workspaceId);
  
  try {
    let files = await fs.readdir(capsuleDir);
    files = files.filter(f => f.endsWith('.md')).sort(); // Deterministic alphabetical order
    
    if (files.length > MAX_CAPSULE_FILES) {
      logger.warn('capsule', `Workspace ${workspaceId} exceeds file limit: ${files.length}`);
      files = files.slice(0, MAX_CAPSULE_FILES);
    }
    
    // Parallel read for performance (all files read concurrently)
    const contents = await Promise.all(
      files.map(async (file) => {
        try {
          const filePath = path.join(capsuleDir, file);
          const stat = await fs.stat(filePath);
          if (stat.size > MAX_FILE_BYTES) {
            logger.warn('capsule', `Skipping oversized file: ${file} (${stat.size}B)`);
            return null;
          }
          const content = await fs.readFile(filePath, 'utf8');
          return { file, content: content.trim() };
        } catch (err) {
          logger.warn('capsule', `Skipping corrupt file: ${file}`, { err: err.message });
          return null;
        }
      })
    );
    
    let combined = '';
    let totalBytes = 0;
    const validEntries = contents.filter(Boolean);
    
    for (const entry of validEntries) {
      const section = `\n\n## Memory: ${entry.file.replace('.md', '')}\n${entry.content}`;
      if (totalBytes + section.length > MAX_CAPSULE_BYTES) {
        logger.warn('capsule', `Workspace ${workspaceId} hit byte limit at ${totalBytes}B`);
        break;
      }
      combined += section;
      totalBytes += section.length;
    }
    
    return {
      content: combined.trim(),
      meta: {
        fileCount: validEntries.length,
        totalBytes,
        workspaceId,
        truncated: totalBytes >= MAX_CAPSULE_BYTES
      }
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { content: '', meta: { fileCount: 0, totalBytes: 0, workspaceId, truncated: false } };
    }
    throw err;
  }
}
```

### D. Capsule Record Writer

```javascript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

export async function writeCapsuleRecord(brainDir, { workspaceId, category, slug, title, content }) {
  if (!SAFE_NAME.test(slug)) throw new Error(`Invalid slug: ${slug}`);
  if (!SAFE_NAME.test(category)) throw new Error(`Invalid category: ${category}`);
  if (!SAFE_NAME.test(workspaceId)) throw new Error(`Invalid workspace ID: ${workspaceId}`);
  
  const capsuleDir = path.join(brainDir, 'living-capsules', workspaceId);
  await fs.mkdir(capsuleDir, { recursive: true });
  
  // Enforce directory file count limit
  const existing = await fs.readdir(capsuleDir);
  if (existing.filter(f => f.endsWith('.md')).length >= MAX_CAPSULE_FILES) {
    throw new Error(`Capsule directory full (max ${MAX_CAPSULE_FILES} files)`);
  }
  
  const filename = `${category}-${slug}.md`;
  const filePath = path.join(capsuleDir, filename);
  const now = new Date().toISOString();
  
  const frontmatter = {
    type: 'capsule',
    title,
    category,
    slug,
    workspace_id: workspaceId,
    created_at: now,
    superseded_by: null,
    decay: { half_life_days: 30 }
  };
  
  const raw = matter.stringify(content || '', frontmatter);
  
  // Enforce per-file size limit
  if (Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) {
    throw new Error(`Record exceeds max file size (${MAX_FILE_BYTES} bytes)`);
  }
  
  // Atomic write: write to tmp, then rename
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, raw, 'utf8');
  await fs.rename(tmpPath, filePath);
  
  return { success: true, path: filePath };
}
```

### E. The Garbage Collection Daemon Task

A deterministic background pruning worker runs as a `memory-maintenance` daemon task. No LLM required.

```javascript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { logger } from './logger.mjs';

export async function runCapsuleGarbageCollection(brainDir) {
  const capsulesRoot = path.join(brainDir, 'living-capsules');
  
  try {
    const workspaces = await fs.readdir(capsulesRoot);
    let totalDeleted = 0;
    
    for (const ws of workspaces) {
      const wsDir = path.join(capsulesRoot, ws);
      const stat = await fs.stat(wsDir);
      if (!stat.isDirectory()) continue;
      
      const files = (await fs.readdir(wsDir)).filter(f => f.endsWith('.md'));
      const now = new Date();
      
      for (const file of files) {
        const filePath = path.join(wsDir, file);
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          const { data } = matter(raw);
          
          // Rule 1: Delete if superseded by another record
          if (data.superseded_by) {
            const successor = path.join(wsDir, `${data.superseded_by}.md`);
            try {
              await fs.access(successor);
              await fs.unlink(filePath);
              totalDeleted++;
              logger.info('capsule-gc', `Deleted superseded: ${file} → ${data.superseded_by}`);
              continue;
            } catch {
              // Successor doesn't exist — keep the original
            }
          }
          
          // Rule 2: Delete if past decay half-life and not recently created
          if (data.decay?.half_life_days && data.created_at) {
            const created = new Date(data.created_at);
            const ageMs = now - created;
            const halfLifeMs = data.decay.half_life_days * 86_400_000;
            if (ageMs > halfLifeMs * 2) {
              await fs.unlink(filePath);
              totalDeleted++;
              logger.info('capsule-gc', `Deleted expired: ${file} (age: ${Math.floor(ageMs / 86_400_000)}d)`);
              continue;
            }
          }
        } catch (err) {
          logger.warn('capsule-gc', `Error processing ${file}: ${err.message}`);
        }
      }
      
      // Rule 3: Enforce max file count (delete oldest files first)
      const remaining = (await fs.readdir(wsDir)).filter(f => f.endsWith('.md'));
      if (remaining.length > MAX_CAPSULE_FILES) {
        const sorted = [];
        for (const f of remaining) {
          const fp = path.join(wsDir, f);
          const s = await fs.stat(fp);
          sorted.push({ file: f, path: fp, mtime: s.mtimeMs });
        }
        sorted.sort((a, b) => a.mtime - b.mtime); // oldest first
        const excess = sorted.slice(0, remaining.length - MAX_CAPSULE_FILES);
        for (const { file: f, path: fp } of excess) {
          await fs.unlink(fp);
          totalDeleted++;
          logger.info('capsule-gc', `Deleted overflow: ${f}`);
        }
      }
    }
    
    return { success: true, deleted: totalDeleted };
  } catch (err) {
    if (err.code === 'ENOENT') return { success: true, deleted: 0 };
    throw err;
  }
}
```

**Daemon integration** in `src/core/daemon-loop.mjs`:
```javascript
case 'memory-maintenance':
  if (task.slug.includes('capsule-gc')) {
    return await runCapsuleGarbageCollection(BRAIN_DIR);
  }
  return await runMaintenanceTask(task);
```

---

## 2. API Design & Endpoint Specification

All endpoints are implemented as a dedicated route module: `src/server/routes/capsule.mjs`.

### Endpoint 1: Retrieve Dynamic Capsule
- **Route**: `GET /api/comms/capsule`
- **Auth**: `requireAuth` middleware
- **Query Params**: `?workspace_id=string`
- **Output**: Returns the alphabetically concatenated raw markdown capsule plus metadata:
  ```json
  {
    "content": "## Memory: facts-api-key\n...\n\n## Memory: preferences-theme\n...",
    "meta": {
      "fileCount": 12,
      "totalBytes": 4821,
      "workspaceId": "ws-abc123",
      "truncated": false
    }
  }
  ```

### Endpoint 2: Instant Record Observation
- **Route**: `POST /api/comms/capsule/record`
- **Auth**: `requireAuth` middleware
- **Rate Limit**: 100 requests/minute per API key
- **Body**:
  ```json
  {
    "workspace_id": "string",
    "category": "preferences|facts|observations",
    "slug": "string",
    "title": "string",
    "content": "string"
  }
  ```
- **Validation**: slug, category, workspace_id must match `/^[a-zA-Z0-9_-]+$/`
- **Size Limits**: Max 4KB per file, max 200 files per capsule directory
- **Output**: Instant write (<2ms) returning:
  ```json
  { "success": true, "path": "living-capsules/ws-abc123/preferences-theme.md" }
  ```

### Endpoint 3: Delete Capsule Record
- **Route**: `DELETE /api/comms/capsule/:workspace_id/:filename`
- **Auth**: `requireAuth` middleware
- **Output**: `{ "success": true }` or 404

### Endpoint 4: Marketplace Packages Fleet
- **Route**: `GET /api/marketplace/packages`
- **Auth**: `requireAuthOrLocal` middleware
- **Output**: Returns the curated list of 2026 SOTA open-source model packages with credit pricing tiers, sourced from the `models/catalog/total-recall/` directory.

---

## 3. Route Module Design

Following the existing refactored pattern (`src/server/routes/memory.mjs`, `sessions.mjs`, etc.):

```javascript
// src/server/routes/capsule.mjs
import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import {
  getDeterministicCapsule,
  writeCapsuleRecord,
} from '../../core/capsule.mjs';

export const capsuleRouter = express.Router();

const writeRateLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,
  keyGenerator: (req) => req.user?.keyId || req.ip,
  message: { error: 'Too many capsule writes. Limit: 100/minute.' }
});

capsuleRouter.get('/', requireAuth, async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });
  
  const result = await getDeterministicCapsule(BRAIN_DIR, workspace_id);
  return res.json(result);
});

capsuleRouter.post('/record', requireAuth, writeRateLimiter, async (req, res) => {
  const { workspace_id, category, slug, title, content } = req.body;
  // ... validation and write ...
});
```

**Registration** in `src/server/rest.mjs`:
```javascript
import { capsuleRouter } from './routes/capsule.mjs';
// ...
router.use('/api/comms/capsule', capsuleRouter);
```

---

## 4. Model Catalog Entries

Extend the existing `models/catalog/total-recall/` directory with verified 2026 model entries:

```
models/catalog/total-recall/
  gemma4/MODEL.md                ← existing (31B Dense)
  gemma4-e4b/MODEL.md            ← NEW (4B Dense, edge/CPU)
  gemma4-moe/MODEL.md            ← NEW (26B-A4B MoE)
  deepseek-r1-32b/MODEL.md       ← NEW (R1 Distilled 32B)
  deepseek-v4-flash/MODEL.md     ← NEW (284B/13B MoE)
  qwen36-35b-a3b/MODEL.md        ← NEW (35B/3B MoE)
  llama4-scout/MODEL.md          ← NEW (109B/17B MoE)
  glm5-1/MODEL.md                ← NEW (745B/44B MoE)
```

Each MODEL.md includes:
```yaml
---
type: model
provider: total-recall
name: total-recall/deepseek-r1-32b
display_name: DeepSeek R1 Distilled (32B)
provider_type: local-runtime
architecture: dense
total_params: 32B
active_params: 32B
context_window: 131072
quantization_recommended: INT4
min_vram_gb: 16
hardware_tier: pro-rtx4000ada
pricing_monthly_credits: 5830000
is_available: true
supports_tools: true
supports_vision: false
supports_code: true
license: Apache-2.0
---
```

---

## 5. Inference Engine Configuration

### vLLM (Production)
```bash
vllm serve <model> \
  --enable-prefix-caching \
  --gpu-memory-utilization 0.9 \
  --max-model-len 131072 \
  --kv-cache-dtype fp8 \
  --port 8000
```

Key features leveraged:
- **Automatic Prefix Caching (APC)**: Capsule content sorted alphabetically produces stable prefixes, maximizing KV cache reuse across requests.
- **FP8 KV Cache**: Halves cache memory → 2× concurrent capsule-augmented conversations.
- **CPU Offloading**: Cold capsule caches spill to RAM instead of evicting.

### Ollama (Developer/Local)
```bash
ollama serve  # Default port 11434
# Model auto-caches while loaded (keep_alive controls lifetime)
```

### SGLang (Alternative for high-throughput agentic workloads)
- RadixAttention provides ~29% higher throughput than vLLM for prefix-heavy workloads
- Best for: multi-turn chat with capsule contexts, agent workflows

---

## 6. Implementation Steps

### Step 1: Core Capsule Module (`src/core/capsule.mjs`)
- Implement `getDeterministicCapsule()`, `writeCapsuleRecord()`, `runCapsuleGarbageCollection()`
- All functions operate on `<BRAIN_DIR>/living-capsules/` — never touch `memory-vault/`

### Step 2: Route Module (`src/server/routes/capsule.mjs`)
- Implement `capsuleRouter` with GET, POST, DELETE endpoints
- Wire auth, rate limiting, and validation
- Register in `src/server/rest.mjs`

### Step 3: Shared Constants (`src/server/routes/_shared.mjs`)
- Add `CAPSULES_DIR` export

### Step 4: Daemon Integration (`src/core/daemon-loop.mjs`)
- Register `capsule-gc` task slug under `memory-maintenance` category
- Add `runCapsuleGarbageCollection()` dispatch

### Step 5: Model Catalog (`models/catalog/total-recall/`)
- Create MODEL.md entries for all 7 new marketplace models
- Include hardware tier, quantization, VRAM requirements in frontmatter

### Step 6: Verification & Test Suite (`src/core/capsule.spec.mjs`)
- Character-by-character alphabetical sort stability
- Under-2ms write speed (single file atomic write)
- Parallel read correctness (output matches sequential)
- GC pruning safety (superseded deletion, decay expiry, overflow trimming)
- Rate limiter enforcement
- Auth scope isolation (cross-tenant rejection)
- Size limit enforcement (per-file 4KB, per-directory 200 files / 500KB)
