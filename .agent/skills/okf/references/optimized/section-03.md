## Core Characteristics

OKF solves the "context problem" for AI agents by providing a unified, interoperable format that can be consumed by various systems, LLMs, and humans alike without needing complex translation or SDKs.

1. **Simple Structure**: An OKF bundle is simply a directory of standard Markdown files.
2. **YAML Frontmatter**: Every file MUST include YAML frontmatter.
3. **Mandatory Field**: The base OKF spec requires `type`; Google's reference tooling also validates `title`, `description`, and `timestamp`.
4. **Interoperable Metadata**: SSSS treats `type`, `title`, `description`, and `timestamp` as mandatory universal metadata, with `resource`, `tags`, and `aliases` as portable enrichment fields.

