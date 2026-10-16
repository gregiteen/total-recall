## 4. Progressive Validation
If a script fails in Code Mode (e.g. throws an exception, exceeds 60s timeout, or breaches the 512MB RAM cap), the sandbox captures the stdout/stderr and feeds it back into the Gemma 4 kernel. The kernel then attempts to self-correct the logic up to the `[Retry: N]` bound defined in the `type: workflow` memory node.
