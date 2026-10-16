## Semantic Search and Localization

Treat semantic indexes and localized trees as disposable projections. Use
the installed SSSS package's `semantic` export, `ssss semantic`, and
`ssss localize` for the dependency-free reference behavior.

- Index only `structural` documents by default. Include `tenant_private` and
  `resource_bound` sources only after an explicit authorized opt-in.
- Derive stable identity from `semantic_id`, then `resource`, then source path.
- Build edges from explicit `relations`, wiki links, and Markdown links.
- Keep projection output outside the source vault; reject symlinks and unsafe paths,
  and stage the complete tree before publishing it.
- Model localization as a `translation` document pointing to an existing
  structural source and its exact SHA-256 content hash.
- Translate only `title`, `description`, and body. Preserve types, ids, enums,
  permissions, status, portability, relations, and paths from the source.
- Apply approved overlays by default. Reject stale hashes, duplicate locale/source
  overlays, recursive translations, private sources, and immutable identity edits.

