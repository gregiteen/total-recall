# Total Recall — Security Audit & Hardening Plan

> **Date**: 2026-05-01
> **Scope**: Full audit of the `total-recall` standalone repository
> **Status**: Analysis complete — Phase 18 added to MEMCOMP tracker

## Executive Summary

Total Recall is a **local-first, filesystem-based** memory engine. It has a small external attack surface (no HTTP server, no database auth), but several areas need hardening before public npm release, particularly around **command injection**, **file permissions**, **secret exposure**, and **data-at-rest protection**.

---

## Vulnerability Analysis

### 🔴 CRITICAL: Shell Command Injection

**Affected files:**
- `src/coprocessor/checks/researcher.mjs:132` — User/agent-derived claim text interpolated directly into shell command:
  ```js
  `${GEMINI_BINARY} -p "${prompt.replace(/"/g, '\\"')}" -m ${model}`
  ```
  The `replace` only escapes double quotes. Backticks, `$()`, `;`, `&&`, `|`, and `\n` are NOT escaped. An agent claim containing `` `rm -rf /` `` would execute.

- `src/coprocessor/checks/researcher.mjs:176` — Same pattern with Codex fallback.

- `src/agents/switch-memory-pipeline.mjs:138` — Shell-interpolated spawn for Codex stdin adapter:
  ```js
  spawn('sh', ['-c', `cat "${tmpPrompt}" | ${adapter.bin} ${stdinArgs.join(' ')}`])
  ```
  If `adapter.bin` or `stdinArgs` contain shell metacharacters, arbitrary execution is possible. `adapter.bin` comes from `which` resolution (safe), but `stdinArgs` includes user-configured model names.

- `src/notifications/channels/macos.mjs:22-23` — Title/message passed to `osascript` shell:
  ```js
  execSync(`osascript -e 'display notification "${safeMsg}" with title "${safeTitle}"'`)
  ```
  Only strips `"`. Single quotes, backticks, `$()` are unescaped.

**Severity**: 🔴 Critical → ✅ **FIXED (2026-05-01)**

**Fix applied**: All `exec()` calls replaced with `spawn()` + argument arrays (no shell). For `osascript`, switched to `execFileSync` with direct argument passing. Prompt text is never interpolated into shell commands.

---

### 🟡 HIGH: `.env` / Secrets Not Gitignored

**Affected file:** `.gitignore`

Current `.gitignore`:
```
node_modules/
*.db
*.db-wal
*.db-shm
.DS_Store
```

**Missing entries:**
- `.env` — API keys, webhook URLs
- `.env.local` / `.env.*.local`
- `*.key` / `*.pem`

If a user creates a `.env` in the repo root (as `.env.example` encourages), it will be committed and pushed to GitHub with all secrets visible.

**Severity**: 🟡 High → ✅ **FIXED (2026-05-01)**

**Fix applied**: Added `.env`, `.env.local`, `.env.*.local`, `*.key`, `*.pem` to `.gitignore`.

---

### 🟡 HIGH: File Permissions Too Broad

**Affected:** `~/.total-recall/` directory

Current permissions: `755` (world-readable). Files inside: `644` (world-readable).

The `.env` file inside `~/.total-recall/` contains API keys, webhook URLs, and potentially LLM tokens. On multi-user systems, any local user can read these.

**Fix applied**: Set `mode: 0o700` on `~/.total-recall/` creation in both `setup` and `notify`. Set `0o600` on `.env` file creation in `setup` and `saveConfigBundle`.

**Severity**: 🟡 High → ✅ **FIXED (2026-05-01)**

### 🟡 HIGH: No Input Sanitization on Wiki/Episode Content

**Affected:** `src/core/fts5.mjs` (SQLite operations)

FTS5 `INSERT` and `SELECT` use parameterized queries (`.run()`, `.prepare()`) — this is **safe against SQL injection**.

However, wiki node file content is read from disk and inserted into the FTS5 index without content sanitization. If a wiki node contains malicious content injected by a compromised agent, it could:
- Pollute the behavioral surface with injection attacks
- Insert steering commands into `ACTIVE CONTEXT`
- Persist false "conclusions" from the researcher

**Fix**: Content hash verification for wiki nodes. Track expected hashes and flag unexpected mutations.

---

### 🟡 MEDIUM: Shared Config Encryption Key Strength

**Affected:** `src/core/crypto.mjs`

The current implementation uses PBKDF2 with 100K iterations. This is adequate but the minimum recommended for 2026 is 600K iterations (OWASP 2024 recommendation for PBKDF2-HMAC-SHA512). Additionally:
- No key stretching beyond PBKDF2
- No password complexity enforcement beyond 4-char minimum
- No rate limiting on decrypt attempts (CLI-based, so brute force is slow, but programmatic callers could try rapidly)

**Severity**: 🟡 Medium → ✅ **FIXED (2026-05-01)**

**Fix applied**: Increased to 600K iterations. Password minimum raised from 4 to 8 characters.

---

### 🟢 LOW: No Integrity Verification on Remote Config Pull

**Affected:** `bin/total-recall` (`runSetup --config`)

When pulling config from a URL, there's no integrity check beyond decryption. A MITM could:
- Serve a valid but different encrypted config (if they know the password)
- Serve a plaintext config (bypasses encryption entirely)

The `isEncrypted()` check prevents plaintext injection when the user expects encrypted, but there's no signature verification.

**Fix**: Add optional `--checksum <sha256>` flag. Or include HMAC in the encrypted envelope.

---

### 🟢 LOW: Notification Webhook URLs Not Validated

**Affected:** `src/notifications/channels/slack.mjs`, `discord.mjs`

Webhook URLs from `.env` are used directly in `fetch()` calls without validation. A malicious `.env` could set these to internal network URLs (SSRF). In practice, this is only exploitable if the attacker already has write access to `.env`, which makes it low-severity.

**Fix**: Validate webhook URLs match expected domains (`hooks.slack.com`, `discord.com/api/webhooks`).

---

### 🟢 LOW: Temp Files for Codex Stdin Not Cleaned Up on Crash

**Affected:** `src/agents/switch-memory-pipeline.mjs:131`

Temporary prompt files written to `/tmp/total-recall-codex-*.txt` may persist if the process crashes between `writeFileSync` and the `finally` cleanup block.

**Fix**: Use `process.on('exit')` cleanup handler. Consider `os.tmpdir()` + unique subdirectory.

---

### ℹ️ INFO: Data at Rest

- **SQLite databases** (`memory.db`) are stored unencrypted on disk. Contains the full FTS5 index of all wiki nodes, episodes, and learnings.
- **Wiki nodes** (`.md` files) contain raw knowledge — this IS the user's private memory.
- **Episode archive** contains verbatim conversation turns.
- **Behavioral surface** (`BEHAVIORAL_SURFACE.md`) contains compiled personality rules.

All of this is local-only and protected by OS file permissions. Encryption at rest is a future consideration for enterprise/team scenarios.

---

## Summary Matrix

| Issue | Severity | Category | Status |
|-------|----------|----------|--------|
| Shell command injection (researcher.mjs) | 🔴 Critical | Code Execution | ✅ FIXED |
| Shell injection (macos.mjs, pipeline.mjs) | 🔴 Critical | Code Execution | ✅ FIXED |
| `.env` not in `.gitignore` | 🟡 High | Secret Exposure | ✅ FIXED |
| `~/.total-recall/` permissions 755→700 | 🟡 High | Access Control | ✅ FIXED |
| Wiki content integrity (no hash verification) | 🟡 High | Data Integrity | ⏳ Future |
| PBKDF2 iterations too low (100K→600K) | 🟡 Medium | Cryptography | ✅ FIXED |
| No integrity check on remote config | 🟢 Low | Supply Chain | ⏳ Future |
| Webhook URL validation (SSRF) | 🟢 Low | Network | ⏳ Future |
| Temp file cleanup on crash | 🟢 Low | Information Leak | ⏳ Future |
| Data at rest unencrypted | ℹ️ Info | Encryption | ⏳ Future |
