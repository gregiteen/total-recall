# Total Recall

[![Version](https://img.shields.io/badge/version-3.13.0-indigo.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-emerald.svg)](LICENSE)

**Portable personal memory for any IDE** — filesystem-native, database-free, open source.

Total Recall stores your rules, preferences, facts, and project knowledge as plain Markdown (SSSS). It compiles them into IDE instruction surfaces, runs a dream consolidation cycle, and lets agents enqueue background tasks. Host apps and product repos are equal implementations: **nothing is hard-coded to a specific codebase.**

```text
write   →  remember / session ingest
sleep   →  dream  (consolidate, conflict, compile, prune)
read    →  recall + compiled surfaces
async   →  daemon task queue (agents may enqueue anything under policy)
```

```text
your brain  =  ~/.agent/skills/total-recall/
your project  =  <repo>/.agent/skills/total-recall/
```

---

## Quick start (IDE memory, ~2 minutes)

No always-on LLM and no research daemon required.

```bash
cd /path/to/any-project
npx total-recall init --project    # project brain + openwiki scaffold
npx total-recall connect claude-code   # or: cursor | codex | gemini | aider | obsidian | http-api
npx total-recall remember preference "Prefer clear, short answers."
npx total-recall recall "short answers"
npx total-recall compile           # rebuild INSTRUCTIONS.md inject blocks
```

Injected rules sit only between:

```text
<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
…
<!-- END INJECTED MEMORY -->
```

Existing local rules outside those markers are never clobbered.

---

## Core workflows

| Workflow | Commands |
|----------|----------|
| **Remember / recall** | `remember`, `forget`, `recall` |
| **Dream (sleep)** | `dream` — or daemon system dream on empty queue |
| **Defer work** | `task add "<intent>"` then `daemon start` |
| **Skills across repos** | `skill track <path>`, `skill deploy`, `skill sync` |
| **Secrets (not vault)** | `secret set\|list\|rotate\|usage\|check-surfaces` |
| **Connect an IDE** | `connect <client>` |

### Multi-repo skills (any path you choose)

```bash
npx total-recall skill track /path/to/any-app
npx total-recall skill sync --repo /path/a --repo /path/b
# or: export TR_SYNC_REPOS="/path/a:/path/b"
```

Roots come only from: project registry, install map, `TR_SYNC_REPOS`, CLI `--repo`, and cwd when it looks like a project.

### Secrets

```bash
npx total-recall secret set some_api_key "$KEY" --provider example
npx total-recall secret list                 # metadata only
npx total-recall secret check-surfaces       # fail if values leaked into surfaces
```

Optional AES: `TR_SECRETS_PASSWORD`. Values never belong in vault markdown or openwiki.

### Optional background daemon

```bash
npx total-recall daemon start    # idle invent OFF unless TR_IDLE_TASKS=1
npx total-recall task add "Extract decisions from last session" --cap vault:write
```

---

## Dual-layer brain

```text
GLOBAL   ~/.agent/skills/total-recall/     identity, shared preferences
PROJECT  <repo>/.agent/skills/total-recall/  repo facts, decisions, openwiki
```

CLI flags: `--global` / `--project`. Project wins on slug conflicts when both apply.

---

## CLI inventory

Commands are classified as **core** (default product path), **optional** (power features), or **legacy** (still shipped, not the focus).

Full table: [`docs/reference/CLI_INVENTORY.md`](docs/reference/CLI_INVENTORY.md)

| Tier | Examples |
|------|----------|
| **Core** | `init`, `connect`, `remember`, `forget`, `recall`, `compile`, `dream`, `task`, `daemon`, `skill`, `secret`, `brain`, `status`, `doctor` |
| **Optional** | `research`, `relay`, `deploy`, `setup`, `backup`/`restore`, `chat`, `map`, `export`/`import`, `ingest` |
| **Legacy / niche** | `collab`, `friction`, `upgrade`, `migrate`, `snapshot`, `command` |

Default install story: **init → connect → remember/recall → dream**. No LLM required.

---

## Optional full server

For a local REST API + dashboard (not required for IDE memory):

```bash
npx total-recall start
# or: npm start
```

Deploy/tunnels are optional (`deploy`, `setup`). Configure only what you need.

---

## Architecture sketch

- **SSSS vault** — Markdown + YAML frontmatter (filesystem SSOT)
- **Openwiki** — human/agent long-form docs (ships with init)
- **Surfaces** — compiled inject blocks for IDEs
- **Dream** — consolidation cycle (deterministic first)
- **Daemon tasks** — open envelope + capability policy
- **Secrets** — separate store from vault

Host apps consume TR the same way: PAT + brain URL (`connect http-api`) or local files.

---

## Uninstall

```bash
npx total-recall uninstall
```

Project brains inside git repos are preserved when possible so you do not lose custom rules and memories.

---

## License

MIT — see [LICENSE](LICENSE).

*Portable memory. Your files. Any IDE.*
