# PRD: Intelligent Brain Architecture — Contextual, JIT, Expiring

**Companion project**: [INGESTION_AND_CHROME_EXTENSION_PRD.md](./INGESTION_AND_CHROME_EXTENSION_PRD.md) (Chrome Extension, Share-to-Brain, Google Takeout, Research UI)

## Vision

Total Recall should feel like a **living, intelligent memory system** — not a static config file generator. It should:

- **Know where it is** — detect the workspace, the connected IDEs, the consumer (UltraChat vs Cursor vs CLI)
- **Know what matters now** — compile only what's relevant, only for who's listening, only when asked
- **Let rules expire** — temporary rules ("use tabs for this sprint") auto-archive when their TTL ends
- **Never pollute** — the global brain is your personal knowledge; project brains are project rules. They don't bleed into each other unless you explicitly say so

---

## Audit: What's Wrong Today

### 1. Blind Global Merge (The Core Bug)

`surface.mjs` L330-331 always calls `loadMergedNodes(globalVaultDir, vaultDir)`. This unconditionally dumps every global node into every project's compilation. There's no opt-out, no filtering, no intelligence.

**Files**: [vault.mjs](file:///Users/greg/Github/total-recall/src/core/vault.mjs) L108-129, [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L327-L334) L327-334

### 2. Spray-and-Pray Surface Writing

`compilePointers()` L300-322 writes **12 IDE shim files** every compilation — even if only 1 IDE is connected. Meanwhile, `config/clients.json` already tracks connected clients via `registerClient()` in `connect.mjs` L250-267. The compiler never reads it.

**Files**: [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L300-L322) L300-322, [connect.mjs](file:///Users/greg/Github/total-recall/src/cli/connect.mjs) L250-267

### 3. No Rule Expiration

The SSSS schema has `decay.half_life_days` (schema.mjs L51-53) and `status` fields, but the compiler **never checks them**. `buildRulesBlock()` L194-197 filters by `category` and `status === 'active'` — it ignores `decay`, creation dates, and any temporal context. A rule saved 2 years ago has identical weight to one saved today.

**Files**: [schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs) L50-53, [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L194-L216) L194-216

### 4. Cosmetic Brain Selector

`BrainSelector.tsx` has 3 bugs: checkbox click swallowed by `stopPropagation` (L211-213), deselect blocked by `selectedIds.length > 1` guard (L86), and the state never flows to the API (App.tsx L309 → pure React state, never sent as query param).

**Files**: [BrainSelector.tsx](file:///Users/greg/Github/total-recall/frontend/src/components/BrainSelector.tsx) L82-94, L201-214

### 5. Static Server Vault

`api.mjs` L24 resolves `VAULT_DIR` once at import time. Every endpoint uses this single path — the server can't serve multiple brains. `loadNodes(VAULT_DIR)` in the grounding block (L566) always reads the global vault for chat grounding regardless of which brain the user selected.

**Files**: [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs#L22-L28) L22-28, L564-577

### 6. Forced Global Propagation

`remember.mjs` L271-306: saving to global iterates ALL registered projects and force-recompiles each. No consent, no filtering, no configuration.

### 7. No Environment Awareness

`buildRulesBlock()` injects 75 lines of CLI quickstart docs (L117-192) into every surface. The chat handler (`api.mjs` L368-410) injects a massive system prompt with browser tools, computer use tools, and desktop control instructions — even for IDE consumers that only read the shim file, and for UltraChat users who don't need `npx total-recall remember` instructions.

**Files**: [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L117-L192) L117-192, [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs#L368-L410) L368-410

### 8. Threads Have No Brain Context

Chat threads (`activeThreadId`) are passed as `x-session-id` to the server, but carry zero brain context. The chat completions handler (`api.mjs` L314-706) reads `{ messages, model, temperature, groundingNodes }` from the request body (L318) but **never reads a `brainId` field**. The grounding block (L564-577) always loads from the hardcoded `VAULT_DIR`, meaning all threads ground against the same vault regardless of which brain the user thinks they selected.

Thread listing (`/v1/chat/threads` L746-798) returns `{ id, title, turns, lastUpdated }` — no `brainId` is persisted or returned. When you switch threads, the brain context doesn't switch with it.

**Files**: [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs#L314-L318) L314-318, [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs#L564-L577) L564-577, [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs#L746-L798) L746-798

---

## Design Principles

### 1. Zero Configuration by Default
The right thing happens without any config files. No `brain.json` inheritance config. No `rules-registry.json`. The separation is structural: **project vault = project surfaces, global vault = search & chat only.**

### 2. JIT Compilation
Don't pre-build surfaces eagerly for every IDE. Build them on-demand — when an IDE reads the surface, or when the API serves a chat completion. The compiled output is cached and invalidated on vault mutation.

### 3. Connected-Client-Aware
Read `config/clients.json` (already maintained by `connect.mjs`) during compilation. Only write shim files for IDEs that are actually connected. UltraChat (mode: `api`) gets its context via the chat API, not file projection.

### 4. Temporal Intelligence
Rules can expire. The compiler should respect `decay.half_life_days`, a new `expires_at` field, and node age. Expired rules auto-archive instead of living forever.

### 5. Workspace Detection
The system already detects project brains via `detectProjectBrain()` (config.mjs L215-234). Use this to determine compilation scope automatically — no user intervention needed.

### 6. Global Brain = Personal Knowledge Vault
The global brain stores facts, lore, concepts, decisions, preferences, corrections — your identity. These are **always searchable** and **always available for chat grounding** via semantic search. But they are **never compiled into project instruction surfaces** unless the user explicitly copies a node to the project brain.

> **Key clarification**: Removing the merge does NOT make the global brain useless. The global vault still powers:
> - `/api/memory/search/semantic` — semantic search always queries across all brains
> - Chat grounding — users can manually pin global nodes as grounding context
> - `npx total-recall recall` — CLI recall searches both global and project vaults
> - The UltraChat dashboard — the global brain IS the primary brain for non-coding users

### 7. Thread = Brain Context
Every chat thread is born in a brain context. When you create a new thread in the dashboard, it inherits the currently selected brain. When UltraChat opens a thread, the server auto-detects the workspace from the connection metadata. Switching threads automatically switches the brain. No manual brain toggling needed during conversation — the thread knows where it lives.

---

## Proposed Changes

### Change 1: Stop Merging (Simplest Possible Fix)

**What**: Remove `loadMergedNodes()` from the compilation path entirely. `compileSurface()` always calls `loadNodes(vaultDir)` — just the local vault.

**Where**: [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L327-L334) L327-334

**Before**:
```js
if (globalVaultDir && fs.existsSync(globalVaultDir)) {
  nodes = loadMergedNodes(globalVaultDir, vaultDir);
} else {
  nodes = loadNodes(vaultDir);
}
```

**After**:
```js
nodes = loadNodes(vaultDir);
```

**Also remove**: `globalVaultDir` parameter from `compileSurface()` signature and all callers:
- [remember.mjs](file:///Users/greg/Github/total-recall/src/cli/remember.mjs) L258-266
- [rebuild.mjs](file:///Users/greg/Github/total-recall/src/cli/rebuild.mjs) L63
- [connect.mjs](file:///Users/greg/Github/total-recall/src/cli/connect.mjs) L720
- [init.mjs](file:///Users/greg/Github/total-recall/src/cli/init.mjs) L518
- [deploy.mjs](file:///Users/greg/Github/total-recall/src/cli/deploy.mjs) L1628
- [forget.mjs](file:///Users/greg/Github/total-recall/src/cli/forget.mjs) L83, L110
- [snapshot.mjs](file:///Users/greg/Github/total-recall/src/cli/snapshot.mjs) L91

**Also remove**: The force-recompile-all-projects loop in `remember.mjs` L269-306. When saving to global, log: `"✓ Saved to global brain."` — that's it.

**Migration note**: Users who rely on global rules appearing in project surfaces will need to copy those nodes to the project brain. Add a one-time migration helper:
```bash
npx total-recall migrate-global-rules
# → Scans global vault for invariants/preferences/corrections
# → Prompts: "Copy these 5 invariant rules to project brain 'total-recall'? [Y/n]"
```

### Change 2: Connected-Client-Aware Compilation

**What**: Read `config/clients.json` in `compilePointers()` and only write shim files for connected clients.

**Where**: [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L300-L322) L300-322

**Before**: Hardcoded array of 12 shim files, always written.

**After**:
```js
function compilePointers(instructionsFile, skillsDir, nodes = []) {
  const agentDir = path.dirname(instructionsFile);
  const baseDir = path.basename(agentDir) === '.agent' ? path.dirname(agentDir) : agentDir;
  const brainDir = path.join(agentDir, 'skills', 'total-recall');

  // Always write INSTRUCTIONS.md (canonical source)
  writeShim(path.join(baseDir, 'INSTRUCTIONS.md'), skillsDir, nodes);

  // Read connected clients and only write their shims
  const clientsPath = path.join(brainDir, 'config', 'clients.json');
  const connected = readConnectedClients(clientsPath);

  const CLIENT_SHIMS = {
    cursor:       ['.cursorrules'],
    'claude-code': ['CLAUDE.md', '.clauderules'],
    antigravity:  ['AGENTS.md'],
    gemini:       ['GEMINI.md'],
    codex:        ['CODEX.md', '.codexrules'],
    vscode:       ['.github/copilot-instructions.md', '.vscode/copilot-instructions.md'],
    pi:           ['AGENTS.md'],
    aider:        ['.aider.rules.md'],
  };

  for (const [client, shims] of Object.entries(CLIENT_SHIMS)) {
    if (connected.has(client)) {
      for (const shim of shims) {
        writeShim(path.join(baseDir, shim), skillsDir, nodes);
      }
    }
  }
}
```

**Fallback**: If `clients.json` doesn't exist or is empty, write all shims (backward compatible).

**Side effect**: Running `npx total-recall connect cursor` should auto-trigger a recompile so the new shim appears immediately.

### Change 3: Rule Expiration

**What**: Add optional `expires_at` field to the SSSS schema. The compiler skips expired nodes and auto-archives them.

**Schema change** ([schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs)):
```js
expires_at: ssssDatetime().optional().nullable(),
```

**CLI change** ([remember.mjs](file:///Users/greg/Github/total-recall/src/cli/remember.mjs)): Add `--expires` flag:
```
--expires <duration>    TTL for temporary rules (e.g. "7d", "2w", "30d", "6h")
```

**Duration parsing**: `parseDuration("7d")` → adds 7 days to `new Date()` → sets `expires_at`.
Supported units: `h` (hours), `d` (days), `w` (weeks), `m` (months).

**Compiler change** ([surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L194-L197) in `buildRulesBlock`):
```js
const now = new Date();
const isExpired = (n) => n.expires_at && new Date(n.expires_at) <= now;

const invariants = nodes.filter(n =>
  n.category === 'invariants' &&
  n.status === 'active' &&
  !isExpired(n)
);
```

**Auto-archive**: During compilation, nodes past their `expires_at` get their `status` updated to `'deprecated'` and written back to disk. Log: `"⏰ Auto-archived expired rule: {slug} (expired {timeAgo})"`.

**Edge case**: If a user runs `recall` on an expired node, it still appears in search results but with an `[EXPIRED]` badge. The node is not deleted — just excluded from active compilation.

### Change 4: Fix Brain Selector UI

**4a. Fix checkbox click** ([BrainSelector.tsx](file:///Users/greg/Github/total-recall/frontend/src/components/BrainSelector.tsx) L201-214):
- Remove `readOnly` and `onClick={(e) => e.stopPropagation()}` from `<input>`
- Use `onChange` directly:
```tsx
<input
  type="checkbox"
  checked={isSelected}
  disabled={!brain.exists}
  onChange={() => handleToggle(brain.id)}
/>
```

**4b. Allow deselecting global** ([BrainSelector.tsx](file:///Users/greg/Github/total-recall/frontend/src/components/BrainSelector.tsx) L82-94):
- Remove `if (selectedIds.length > 1)` guard
- Allow deselecting to zero → show empty state with message: "No brain selected. Select a brain to view its memories."

**4c. Wire to API** (`App.tsx` + all page fetches):
- Persist `activeBrainId` to `localStorage`
- Pass `?brain=<id>` in all memory API calls
- On mount, restore `activeBrainId` from `localStorage` (default: `'global'`)

**4d. Single brain mode**: When exactly one brain is selected, the API calls use `?brain=<id>`. When multiple are selected (multi-select), the frontend fetches from each and merges client-side (current `listMemory` already does this). When zero are selected, show empty state.

### Change 5: Brain-Scoped API Routes

**What**: Make all memory routes brain-aware by reading `?brain=<id>` from query params.

**Where**: [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs) L22-28 (static vault resolution), [memory.mjs](file:///Users/greg/Github/total-recall/src/server/routes/memory.mjs) (all routes)

**New helper** (add to `_shared.mjs` or `api.mjs`):
```js
import { resolveBrainVaultDir } from '../core/config.mjs';

function resolveVaultFromQuery(req) {
  const brainId = req.query.brain || req.body?.brainId;
  if (!brainId || brainId === 'global') return VAULT_DIR;
  
  const brainVault = resolveBrainVaultDir(brainId);
  if (!brainVault || !fs.existsSync(brainVault)) return VAULT_DIR;
  return brainVault;
}
```

**Apply to**:
- `GET /api/memory` — list nodes from the resolved brain vault
- `GET /api/memory/:slug` — read node from the resolved brain vault
- `POST /api/memory` — create node in the resolved brain vault
- `PUT /api/memory/:slug` — update node in the resolved brain vault
- `DELETE /api/memory/:slug` — delete node from the resolved brain vault
- `POST /api/memory/search/semantic` — search within the resolved brain vault
- `POST /v1/chat/completions` — grounding nodes loaded from the resolved brain vault (L564-577)

**Backward compatible**: If no `?brain=` param, fall back to `VAULT_DIR` (global brain) — existing behavior preserved.

### Change 6: Environment-Aware Surface Content

**What**: `buildRulesBlock()` injects 75 lines of CLI quickstart docs (L117-192) into every surface. UltraChat doesn't need `npx total-recall remember` instructions — it uses the REST API. IDE agents (Cursor, Claude Code) read shim files and DO need the CLI docs.

**Where**: [surface.mjs](file:///Users/greg/Github/total-recall/src/core/surface.mjs#L117-L192) L117-192

**How**:
```js
function buildRulesBlock(skillsDir, nodes = [], { consumer = 'ide' } = {}) {
  let combined = '';
  
  if (consumer !== 'api') {
    // Full CLI quickstart docs for IDE consumers
    combined += `## Total Recall — Sovereign Memory System (Installed)\n\n...`;
  } else {
    // Minimal header for API consumers (UltraChat, generic)
    combined += `## Total Recall — Active Memory Context\n\n`;
    combined += `Your memories and rules are loaded from the active brain vault.\n`;
  }
  
  // Invariants, preferences, corrections are always injected
  // ... (unchanged)
}
```

**Consumer detection**: The consumer is determined by:
1. **Shim file compilation** (surface.mjs) → always `'ide'` (unchanged behavior)
2. **Chat API** (api.mjs L314) → read from `req.body.consumer` or infer from `req.headers['user-agent']`. UltraChat sets `User-Agent: UltraChat/1.0`. Default: `'api'` for authenticated PAT requests.
3. **CLI recall** → always `'ide'`

### Change 7: Thread-Level Brain Auto-Detection

**What**: Every chat thread carries a `brainId` that determines which brain's knowledge is used for grounding, search, and system prompt injection. The thread's brain is set automatically when the thread is created.

**Server-side (the actual fix)** — [api.mjs](file:///Users/greg/Github/total-recall/src/server/api.mjs#L314-L318):

1. **Accept `brainId` from request** (L318):
   ```js
   const { messages, model, temperature, groundingNodes, brainId } = req.body;
   ```

2. **Resolve vault from brainId** (new, before L564):
   ```js
   const activeVaultDir = resolveVaultFromBrainId(brainId);
   ```

3. **Scope grounding to the active vault** (L564-577, change `VAULT_DIR` → `activeVaultDir`):
   ```js
   const allNodes = loadNodes(activeVaultDir);
   ```

4. **Scope INSTRUCTIONS.md injection** (L471-475): If `brainId` points to a project brain, read that project's `INSTRUCTIONS.md` instead of the global one.

5. **Persist `brainId` in session record** (L673-682):
   ```js
   writeSessionRecord(sessionId, {
     ...existing fields,
     brain_id: brainId || 'global',
   });
   ```

6. **Return `brainId` in thread listing** (L781-786): Parse the first session record's `brain_id` and include it in the thread response.

**Client-side**:

1. **Thread metadata** ([api.ts](file:///Users/greg/Github/total-recall/frontend/src/api.ts#L104-L109)):
   ```ts
   export interface ChatThread {
     id: string
     title: string
     turns: number
     lastUpdated: number
     brainId: string  // which brain this thread lives in
   }
   ```

2. **Thread creation**: When creating a new thread, snapshot `activeBrainId`.

3. **Thread switching**: When switching threads, auto-update `activeBrainId` from the thread's `brainId`.

4. **sendChat passes brainId** ([api.ts](file:///Users/greg/Github/total-recall/frontend/src/api.ts#L118-L138)):
   ```ts
   export async function sendChat(
     messages, signal?, sessionId?, groundingNodes?, model?, brainId?
   ) {
     body: JSON.stringify({ messages, groundingNodes, model, brainId }),
   }
   ```

5. **UltraChat auto-detection**: When UltraChat sends requests via PAT token:
   - If `brainId` is in the request → use it
   - If `x-brain-id` header is set → use it
   - If neither → default to `'global'` (for UltraChat, the global brain IS the personal brain)

6. **IDE agent context**: When an IDE agent reads a shim file, the project brain is already scoped by `detectProjectBrain()`. No change needed.

---

## What We're NOT Doing (Complexity Avoided)

| ❌ Rejected | Why |
|---|---|
| `brain.json` per-project inheritance config | Zero-config is better. Just don't merge. |
| `rules-registry.json` for curated global rules | Overengineered. If you want a rule in a project, save it to the project. |
| `loadSelectiveGlobalNodes()` filtered merge | The merge itself is the problem. Remove it entirely. |
| Multiple custom brain profiles | Out of scope. Global + N projects is sufficient for now. |
| Consumer-specific surface format templates | Out of scope. Just skip the CLI docs for API consumers. |
| Multi-brain chat grounding (query multiple vaults in one request) | Keep it simple. One brain per thread. User can create a new thread in a different brain. |

---

## Implementation Order

Changes are ordered by dependency (each builds on the previous):

| # | Change | Dependencies | Risk | Effort |
|---|---|---|---|---|
| 1 | Stop Merging | None — standalone | Low (clean removal) | 1-2 hours |
| 2 | Connected-Client-Aware | None | Low | 1-2 hours |
| 3 | Rule Expiration | None | Low (additive) | 2-3 hours |
| 4 | Fix Brain Selector UI | None | Low (frontend only) | 1-2 hours |
| 5 | Brain-Scoped API | Change 4 (frontend needs to send `?brain=`) | Medium | 3-4 hours |
| 6 | Environment-Aware Surface | Change 2 (needs consumer detection) | Low | 1-2 hours |
| 7 | Thread-Level Brain | Changes 4, 5 (needs scoped API + working selector) | Medium | 4-6 hours |

**Total estimated effort: 1-2 days**

---

## Acceptance Criteria

- [ ] `compileSurface()` loads ONLY the local vault — no `globalVaultDir` parameter
- [ ] `loadMergedNodes` import removed from `surface.mjs`
- [ ] `remember --global` does NOT recompile any project brains
- [ ] `npx total-recall migrate-global-rules` copies invariants/preferences to a project brain
- [ ] Only connected-client shim files are written during compilation
- [ ] `connect <client>` auto-triggers recompile after registration
- [ ] If `clients.json` is empty/missing, all shims written (backward compatible)
- [ ] `expires_at` field accepted in SSSS schema validation
- [ ] `remember --expires 7d` creates a rule with `expires_at` 7 days from now
- [ ] `--expires` parses `h`, `d`, `w`, `m` duration units
- [ ] Rules with `expires_at` in the past are skipped during compilation and auto-archived
- [ ] Auto-archived nodes logged: `"⏰ Auto-archived expired rule: {slug}"`
- [ ] Expired nodes still appear in `recall` search with `[EXPIRED]` badge
- [ ] BrainSelector checkbox clicks work on first click (no `stopPropagation` bug)
- [ ] Global brain can be deselected → empty state shown
- [ ] Brain selection persists to `localStorage` and flows to API calls
- [ ] `?brain=<id>` parameter accepted on all `/api/memory/*` routes
- [ ] `resolveVaultFromQuery()` falls back to `VAULT_DIR` if no param or invalid brain
- [ ] Chat grounding (api.mjs L564-577) reads from the brain-resolved vault, not hardcoded `VAULT_DIR`
- [ ] UltraChat-served system prompts don't include CLI quickstart docs
- [ ] `brainId` field accepted in `POST /v1/chat/completions` request body
- [ ] `brainId` persisted in session records and returned in thread listings
- [ ] New threads auto-inherit the active brain context
- [ ] Switching threads auto-switches the brain in the UI
- [ ] All existing tests pass
- [ ] New tests cover: expiration filtering, brain-scoped vault resolution, thread-brain binding
