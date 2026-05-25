# Total Recall — Diagnostic & Troubleshooting Reference

Use this reference to diagnose and repair failures in the **Total Recall Sovereign AI OS** environment.

---

## 1. Local Server and Daemon Diagnostics

### Symptom: Connection Refused (`ECONNREFUSED` on port 3000)
**Causes**: The local brain server is offline, or another process has blocked port 3000.
**Diagnostic Flow**:
1. Check if the server is running by executing:
   ```bash
   lsof -i :3000
   ```
2. If another process is holding port 3000, kill it or edit the server port in `totalrecall.config.mjs`.
3. If no server process is running, start the server manually:
   ```bash
   npx total-recall start
   # or from project root:
   node src/server/index.mjs
   ```

### Symptom: Background Research Daemon Is Frozen
**Causes**: Low disk space, Ollama server is offline, or rate-limiting on Brave Search API.
**Diagnostic Flow**:
1. Check Brave Search API rate status.
2. Verify local Ollama server status by running:
   ```bash
   curl http://localhost:11434/api/tags
   ```
3. Restart the daemon loop:
   ```bash
   node src/core/daemon-loop.mjs
   ```

---

## 2. Compilation and Rule Propagation Issues

### Symptom: `Failed to import tier::` CLI Error during Compile
**Causes**: An IDE rules parser (such as Antigravity/Gemini) incorrectly parses `@` prefixed keywords (e.g. `<!-- @tier: 1 -->`) inside the rules shims as import tags and fails on file lookup.
**Diagnostic Flow**:
1. Verify that `src/core/surface.mjs` outputs `<!-- tier: 1 ... -->` instead of `<!-- @tier: 1 ... -->` to avoid parser collisions.
2. Run compilation to regenerate all shims:
   ```bash
   npx total-recall compile
   ```

### Symptom: Instructions Do Not Replicate to Custom IDE Rules Files
**Causes**: A pre-existing rules shim exists, but its managed injection block is missing or corrupt.
**Diagnostic Flow**:
1. Inspect the file (e.g. `.cursorrules`, `CLAUDE.md`, `GEMINI.md`).
2. Verify that the boundary blocks are present:
   `<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->`
   `<!-- END INJECTED MEMORY -->`
3. If they are missing, run `npx total-recall compile --force` to append/insert the fresh boundaries.

---

## 3. Authentication & PAT Token Issues

### Symptom: REST API Requests Are Unauthorized (401 Unauthorized)
**Causes**: The Personal Access Token (PAT) is missing, expired, or invalid.
**Diagnostic Flow**:
1. Inspect `.agent/config/brain.json` and ensure `"token"` contains your Personal Access Token.
2. For CLI or manual curl calls, verify that the `Authorization` header includes the correct Bearer PAT token.
3. For Codex TOML configuration, confirm that the environment variable `TR_PAT` is exported in the active shell:
   ```bash
   export TR_PAT=your-token
   ```
