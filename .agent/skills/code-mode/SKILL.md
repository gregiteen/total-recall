---
name: code-mode
description: "Use this skill when working on the Code Mode Infrastructure, sandbox VFS, or instruction-led architecture. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Code Mode Infrastructure

This skill governs the Sandbox execution environment and the Omnichannel Dashboard architecture for the Total Recall Sovereign OS.

## 1. JIT Code Execution Sandbox

Total Recall relies on a highly restricted JIT Code Execution sandbox. Since the OS kernel operates autonomously, it uses the sandbox to execute scripts without exposing the host OS.

- **Isolation**: Scripts run in `experimental-vm-modules` Node threads. They cannot access the host outside `~/.agent/`.
- **Resource Constraints**: Hard cap of 512MB RAM per thread, with a strict 60-second timeout to prevent infinite loops from the LLM.
- **Subprocesses**: No `child_process.exec` is allowed in the un-sandboxed environment.
- **Opt-in Network**: Network access is disabled by default and must be explicitly opted into.
- **Credential Injection**: Secrets and credentials are NOT passed via environment variables. They are injected via `{{secrets.*}}` syntax which is AES-256 decrypted at runtime.

## 2. Omnichannel Dashboard Surface

While the system is autonomous, human operators interact with the sandbox and memory structure via the React Dashboard SPA.

- **Routing**: Reverse proxied by Caddy, running on standard TLS ports.
- **Visual SSSS Manager**: A UI for manipulating the YAML frontmatter and priority logic of memory nodes in `.agent/memory-vault/`.
- **Code Playground**: A live execution surface to test `scripts/` before committing them to a `SKILL.md`.
- **File Explorer**: Direct VFS explorer for `~/.agent/`.
- **IDE Integration**: The dashboard is fully renderable inside Cursor or Claude Desktop via the MCP gateway, allowing for seamless human-in-the-loop oversight.

## 3. Tool Suite Integration
Code Mode acts as the execution layer for the Kernel Tool Suite.
- When Gemma 4 generates a workflow plan, the OS Daemon (`task_runner.mjs`) dispatches the required logic to the Code Mode sandbox.
- Other tools like SearXNG (Web Search) and Web Scraper run alongside Code Mode in the `Kernel Tool Suite`.

## 4. Progressive Validation
If a script fails in Code Mode (e.g. throws an exception, exceeds 60s timeout, or breaches the 512MB RAM cap), the sandbox captures the stdout/stderr and feeds it back into the Gemma 4 kernel. The kernel then attempts to self-correct the logic up to the `[Retry: N]` bound defined in the `type: workflow` memory node.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-20T03:58:33.392Z -->

<!-- END INJECTED MEMORY -->
