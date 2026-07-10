# Total Recall modules (minimal)

Only files **required for operation** live here. Not IDE skills.

| Path | Required by |
|------|-------------|
| `skill-deploy/scripts/*.mjs` | `total-recall skill` CLI + REST `/api/skills` |
| `agents/agents.yml` | Headless CLI agent dispatch (`runtime.mjs`) |

Everything else was removed. Prefer `@ssss/cli` for SSSS; prefer vault + openwiki for knowledge.
