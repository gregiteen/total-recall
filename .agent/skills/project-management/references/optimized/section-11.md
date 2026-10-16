### Document header convention

Every project document starts with:

```markdown
# <PROJECT_PREFIX> — <Document Type>

> **Project Prefix**: `<PROJECT_PREFIX>`
> **Kanban State**: 📋 Planned / 🏗️ In Progress / ✅ Completed
> **Author**: <author>
> **Date**: YYYY-MM-DD

---
```

The AUDIT adds two lines: `> **Audit Status**: In progress / Complete` and `> **Audited commit**: <hash>`. Every other document adds `> **Based on audit**: <PROJECT_PREFIX>_AUDIT.md (Complete, <hash>)`.

A repo-specific overlay may extend this with additional frontmatter (e.g. YAML frontmatter for a schema the repo already uses) — that's an addition, not a replacement.

