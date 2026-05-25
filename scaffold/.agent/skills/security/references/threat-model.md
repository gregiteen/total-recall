# Threat Model — Total Recall Sovereign AI OS

> **Version:** 1.0.0 | **Date:** 2026-05-21

## System Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  IDE Agent   │────▶│  REST API Server │────▶│  Memory Vault      │
│  (LLM)      │     │  (Express.js)    │     │  (.agent/memory-   │
│              │     │  Port 3000       │     │   vault/)          │
└──────────────┘     └───────┬──────────┘     └────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              ┌─────┴─────┐   ┌──────┴──────┐
              │ Cloudflare │   │   Sandbox   │
              │  Tunnel    │   │  (node      │
              │  (public)  │   │   spawn)    │
              └────────────┘   └─────────────┘
```

## Threat Actors

| Actor | Access | Motivation |
|-------|--------|------------|
| Remote Attacker | Cloudflare tunnel endpoint | Data exfiltration, code execution |
| Malicious LLM Output | Vault write, surface compiler injection | Prompt injection, rule manipulation |
| Supply Chain | npm dependencies, install scripts | Backdoor, credential theft |
| Local Process | Filesystem, loopback network | Privilege escalation |

## Attack Surfaces

### 1. REST API (Primary)

| Endpoint Group | Risk | Mitigations |
|---------------|------|-------------|
| `/api/config/:name` | Path traversal | `safeConfigName()` regex validator |
| `/api/memory` (POST) | Vault injection | `SAFE_NAME` regex on slug/category |
| `/api/sandbox` | Arbitrary code execution | Restricted env, 30s timeout cap |
| `/api/brain/export` | Secret exfiltration | `brain:export` scope, excludes sensitive files |
| `/api/import/rules` | Directory traversal | Restricted to `cwd()` and `homedir()` |
| `/api/keys` | Token management | Auth required, SHA-256 hashed storage |

### 2. Cloudflare Tunnel

- **Risk**: Exposes localhost API to the public internet
- **Mitigations**: Bearer token auth on all endpoints, `isLocalRequest()` only trusts socket address
- **Residual Risk**: Tunnel URL is discoverable; brute-force PAT guessing possible without rate limiting

### 3. Sandbox

- **Risk**: `spawn('node')` is NOT a true sandbox — child process has full OS access
- **Mitigations**: Restricted env (no HOME, SHELL, USER), 30s timeout cap
- **Residual Risk**: Child process can read/write any file the parent process can

### 4. Surface Compiler

- **Risk**: Writes directly to IDE instruction files (AGENTS.md, GEMINI.md, etc.)
- **Mitigations**: PAT redaction via `<YOUR_PAT_TOKEN>` placeholders, managed comment blocks
- **Residual Risk**: LLM-generated vault nodes could inject malicious instructions

### 5. Computer Use (Linux/X11 only)

- **Risk**: Desktop automation via xdotool — can click, type, screenshot
- **Mitigations**: `xrunSafe()` with `execFileSync` + arg arrays, coordinate validation
- **Residual Risk**: Powerful tool if exposed via tunnel without strong auth

## Data Classification

| Data | Sensitivity | Storage | Protection |
|------|------------|---------|------------|
| PAT Tokens | Critical | `keys.jsonl` (SHA-256 hashed) | File perms 0o600 |
| JWT Secret | Critical | `config/session-secret` | File perms 0o600, persisted |
| Dashboard Password | High | `security.yml` (bcrypt) | Excluded from brain export |
| DigitalOcean Token | Critical | `.env` | `.gitignore`, not exported |
| Memory Vault Nodes | Medium | `.agent/memory-vault/` | Filesystem ACLs |
| Compiled Instructions | Low | `AGENTS.md`, etc. | PATs redacted to placeholders |
