---
name: security
description: "Use this skill when performing security audits, reviewing code for vulnerabilities, hardening APIs, or establishing security practices. Trigger on: 'security audit', 'vulnerability', 'path traversal', 'command injection', 'XSS', 'CSRF', 'auth bypass', 'secret management', 'token rotation', 'hardening'. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Security Audit & Hardening Skill

> **Version:** 2.0.0 | **Updated:** 2026-05-21

> [!CAUTION]
> **MANDATORY**: Run the automated audit script before any manual review.
> ```bash
> node .agent/skills/security/scripts/run-audit.mjs
> ```
> Fix any findings it surfaces before proceeding to manual checks.

---

## 1. Context

Total Recall is a Sovereign AI OS that exposes a REST API, MCP gateway, and optional Cloudflare tunnel. Its threat surface includes:

- **REST API** — Express.js routes handling file I/O, code execution, auth
- **Sandbox** — Node.js subprocess execution (NOT truly isolated — `spawn('node')` only)
- **Computer Use** — Desktop automation via xdotool (X11/Linux only)
- **Daemon** — Background LLM-driven task loop with system notifications
- **Surface Compiler** — Writes to IDE instruction files across the workspace

### Trust Boundaries

| Boundary | Trust Level | Notes |
|----------|-------------|-------|
| Local Host (loopback) | High | Standard filesystem APIs |
| IDE Workspace | Medium | Files processed by LLM assistants, may be committed to git |
| Internet / Cloudflare Tunnel | **Zero** | Public edge nodes, endpoint discoverable |

---

## 2. Operator Loop — How to Run a Security Audit

Follow this loop exactly:

### Step 1: Run the automated scanner

```bash
node .agent/skills/security/scripts/run-audit.mjs
```

This runs grep-based vulnerability pattern checks, verifies all known mitigations are in place, and runs `npm audit`. It outputs structured JSON to stdout and a human-readable summary to stderr.

- **Exit code 0** = clean audit (no findings, all mitigations verified)
- **Exit code 1** = findings detected or mitigations missing

### Step 2: Triage findings

Read the JSON output. For each finding:
1. Check if it's a false positive (e.g., grep matching a comment or test fixture)
2. If real, classify severity using the patterns in §4
3. Apply the matching remediation pattern from §5

### Step 3: Verify mitigations

The script checks these critical mitigations automatically. If any fail, the corresponding security fix has regressed:

| # | Mitigation | File | What to check |
|---|-----------|------|---------------|
| 1 | `safeConfigName()` | `src/server/rest.mjs` | Path validation on `/api/config/:name` |
| 2 | `SAFE_NAME` regex | `src/core/vault.mjs` | Slug/category validation in `writeNode()` |
| 3 | `xrunSafe()` | `src/server/tools.mjs` | All computer-use tools use `execFileSync` with args arrays |
| 4 | `execFileSync` for osascript | `src/core/daemon-loop.mjs` | macOS notification uses arg array, not string interp |
| 5 | Restricted env whitelist | `src/core/sandbox.mjs` | Only `PATH, TMPDIR, LANG, TERM` — no HOME, SHELL, USER |
| 6 | JWT secret persistence | `src/server/auth.mjs` | Secret persisted to `config/session-secret` |
| 7 | Brain export exclusions | `src/server/rest.mjs` | Tar excludes `security.yml`, `keys.jsonl`, `session-secret` |
| 8 | Generic error messages | `src/server/rest.mjs` | `serverError()` returns "Internal server error", not `err.message` |

### Step 4: Run the pre-commit check

Before committing security-sensitive changes:

```bash
node .agent/skills/security/scripts/pre-commit-check.mjs
```

This runs a fast subset of checks focused on the patterns most likely to be introduced in new code.

### Step 5: Scan for secrets

```bash
node .agent/skills/security/scripts/scan-secrets.mjs
```

Checks source files and compiled instruction files for leaked tokens, and optionally scans git history.

### Step 6: Create UX Impact and Improvement Report

Every single time this security skill is used to analyze, audit, or implement remediations in the workspace:
- You **MUST** compile and present a dedicated markdown report assessing any adverse impacts the security changes have on user experience (UX).
- This report must evaluate both CLI environments (command verbosity, directory permission restrictions, strict formatting constraints) and UI/Web environments (wizard layouts, horizontal scroll/code block wrapping, setup status state polling, loading cards).
- Propose actionable, safe improvement ideas for each negative UX side-effect to restore developer ergonomics and simplicity.

---

## 3. Maintenance Schedule

### On Every Code Change (Automated)

Run `pre-commit-check.mjs` — enforces:
- No `execSync` with string interpolation
- No `innerHTML` with dynamic data
- No `path.join` with unvalidated user input
- No hardcoded tokens
- No `curl | bash` without checksums

### Weekly (Manual or via Daemon)

- Check `npm audit` for new advisories
- Review any new API endpoints for input validation
- Verify `.gitignore` covers all sensitive file patterns

### Monthly (Daemon Research Cycle)

- Run full `run-audit.mjs`
- Validate all mitigations intact
- Scan for new hardcoded secrets
- Review `security.yml` config settings

---

## 4. Vulnerability Classification

| Pattern | Severity | Detection |
|---------|----------|-----------|
| `execSync` with `${}` interpolation | CRITICAL | `grep -rn 'execSync(\`' src/` |
| `path.join` with `req.params/query/body` without validation | CRITICAL | grep for `path.join.*req\.` |
| `innerHTML` with dynamic data | HIGH | `grep -rn 'innerHTML' src/ frontend/` |
| Hardcoded PATs (`tr_`, `dop_`, `sk-`, `ghp_`) | CRITICAL | `grep -rn 'tr_[a-zA-Z0-9]' src/` |
| `eval()` or `new Function()` | HIGH | `grep -rn 'eval(\|Function(' src/` |
| `curl \| bash` without checksum | MEDIUM | `grep -rn 'curl.*\|.*bash' src/ scripts/` |
| `Math.random()` for security-sensitive values | MEDIUM | `grep -rn 'Math.random' src/` |
| `X-Forwarded-For` trust | HIGH | `grep -rn 'forwarded' src/` |

---

## 5. Remediation Patterns

### Path Traversal Fix

```javascript
// WRONG — user input directly in path.join
const filePath = path.join(BASE_DIR, req.params.name);

// CORRECT — validate with allowlist regex, reject traversal
function safeName(name) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) return null;
  return path.join(BASE_DIR, name);
}
const filePath = safeName(req.params.name);
if (!filePath) return res.status(400).json({ error: 'Invalid name' });
```

### Command Injection Fix

```javascript
// WRONG — string interpolation in execSync
execSync(`xdotool key ${userInput}`);

// CORRECT — execFileSync with argument array + input validation
import { execFileSync } from 'node:child_process';
if (!/^[a-zA-Z0-9_+ ]+$/.test(userInput)) throw new Error('Invalid input');
execFileSync('xdotool', ['key', userInput], { timeout: 8000 });
```

### XSS Fix

```javascript
// WRONG — innerHTML with unsanitized data
el.innerHTML = '<strong>' + userControlledData + '</strong>';

// CORRECT — DOM construction with textContent
const strong = document.createElement('strong');
strong.textContent = userControlledData;
el.replaceChildren(strong);
```

---

## 6. Pitfalls

| Pitfall | Why It's Dangerous | Mitigation |
|---------|-------------------|------------|
| Trusting `X-Forwarded-For` | Spoofable through Cloudflare tunnel | Only trust `req.socket.remoteAddress` |
| `Math.random()` for secrets | Not cryptographically secure | Use `crypto.randomBytes()` |
| `spawn('node')` as "sandbox" | Full process access, not isolated | Use `isolated-vm` or containers |
| Embedding PATs in Markdown | Enters LLM context, may be committed to git | Use env vars or redacted placeholders |
| `--no-sandbox` on Chromium | Disables browser security boundary | Only use when running as root |
| Generic error swallowing | Hides real bugs during development | Log full error server-side, return generic message to client |

---

## 7. Reference Files

- [references/vulnerability-catalog.md](./references/vulnerability-catalog.md) — Complete catalog of all 30 findings from the May 2026 audit
- [references/threat-model.md](./references/threat-model.md) — Threat model for the Cloudflare tunnel + REST API surface

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T06:00:44.284Z -->

- **security-audit-protocol** (confidence 1, importance 4):
  Security audit protocol and hardening requirements

<!-- END INJECTED MEMORY -->
