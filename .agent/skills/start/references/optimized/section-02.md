## 1. Shared runtime preflight (always)

Use the installed CLI from the current repository: `./total-recall startup-check ensure --json`, or `total-recall startup-check ensure --json` when there is no repo launcher. This explicit /start step starts only missing configured managed local services. Ordinary `brief` remains read-only. Read `references/runtime-contract.md` for readiness boundaries. The functional `scripts/start-session.mjs` wrapper performs the preflight and brief with bounded child processes.

Report server health, authenticated brain access, daemon identity, SSSS tooling, and current-app readiness separately. An undeclared app remains unknown; shared readiness proves only shared runtime health. Supply app check/start command names only when the owning repository explicitly registers those commands. Never guess commands or start sibling repositories. Never change credentials or permission scopes merely to make a check pass.

The registered `startup-check` composable wrapper resolves the native builtin or one verified source checkout from existing registered repository roots. `TR_STARTUP_CLI` is an explicit optional override; ambiguous or missing sources fail. If that wrapper is unavailable, try the native `startup` command and report unsupported checks when the installed package lacks it. Do not auto-download a package or claim the runtime was checked.


Before reporting an unreachable server, allow the bounded transport retry in the startup command to finish. Health and authenticated-instructions requests each allow ten seconds and one retry. HTTP authorization errors, unrecognized responses, and foreign/unknown process identities remain failures. Recheck shared startup once after the product bootstrap when it initially reported only transport failures; report the latest verified result and note any recovery. Never restart a live process to conceal a timeout.

Use `startup-check check --json`, `status --json`, and `daemon status` to diagnose a running system. `doctor` checks installation prerequisites and free ports: its occupied-port message alone does not prove a running Total Recall server is unhealthy. Verify the listener identity before interpreting it as a conflict.

Verify `help daemon --json` and `help startup --json` using the installed CLI. Missing `docs/reference/cli-reference.md` is a package defect; restore the matching canonical reference and its packaging entry, then re-run installed help. Do not invent an unsupported service command.

