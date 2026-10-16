## 1. JIT Code Execution Sandbox

Total Recall relies on a highly restricted JIT Code Execution sandbox. Since the OS kernel operates autonomously, it uses the sandbox to execute scripts without exposing the host OS.

- **Isolation**: Scripts run in `experimental-vm-modules` Node threads. They cannot access the host outside `~/.agent/`.
- **Resource Constraints**: Hard cap of 512MB RAM per thread, with a strict 60-second timeout to prevent infinite loops from the LLM.
- **Subprocesses**: No `child_process.exec` is allowed in the un-sandboxed environment.
- **Opt-in Network**: Network access is disabled by default and must be explicitly opted into.
- **Credential Injection**: Secrets and credentials are NOT passed via environment variables. They are injected via `{{secrets.*}}` syntax which is AES-256 decrypted at runtime.

