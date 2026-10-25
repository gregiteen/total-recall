# OpenWiki

OpenWiki is a plugin-owned documentation hub and ingestion capability. Discover `total-recall openwiki --help`, then `openwiki hubs --json`. Current hubs discovery reads Markdown files directly under the current project's `openwiki/` directory; ingestion recursively reads a supplied directory. The hub count is a filesystem inventory, not proof of prior graph indexing.

Core initialization does not create wiki pages. Use `total-recall openwiki bootstrap --brain <absolute-brain-dir> [--project-root <absolute-repo-dir>] --json` explicitly when seed documentation is wanted. `--dry-run` previews missing pages; existing authored pages and page symlinks are preserved. The OpenWiki plugin owns these templates and their bootstrap implementation.

Read existing relevant hubs before changing architecture or capability boundaries. Maintain source-linked hubs for core architecture, plugin ownership, auth/secrets, CRM and current implementation/verification state. Use normal source edits for documentation Markdown; never edit canonical memory files directly. Keep secrets, personal vault contents and generated state out of hubs.

Review `openwiki ingest <absolute-directory> --dry-run --project`, then ingest through the plugin without `--dry-run`. `--global` explicitly selects the global brain. The plugin routes each document through validated `remember`; read import/error totals and actual exit status. Verify resulting `openwiki-<path-slug>` documents with local recall. A dry run does not index anything. A backend health probe does not prove graph coverage. Partial imports must be reported and repaired.
