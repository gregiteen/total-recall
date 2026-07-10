# Total Recall modules

These folders are **not** IDE agent skills. They hold documentation and scripts that
implement Total Recall features. The only agent skill is:

```text
.agent/skills/total-recall/SKILL.md
```

| Module | Purpose |
|--------|---------|
| `ssss/` | SSSS memory/schema notes + validators (prefer `@ssss/cli`) |
| `skill-deploy/` | Scripts for creating/installing/scanning user skills |
| `agents/` | CLI agent registry (`agents.yml`) for headless dispatch |
| `research/` | Background research API notes (optional / demoted) |

User-authored skills for a repo go in `.agent/skills/<name>/` (sibling of total-recall),
not under `total-recall/modules/`.
