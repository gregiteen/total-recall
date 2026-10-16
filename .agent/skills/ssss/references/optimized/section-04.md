## Document Contract

Every SSSS document has YAML frontmatter and a Markdown body. SSSS-managed
documents require the universal fields:

- `type`
- `title`
- `description`
- `timestamp`

Primitive-specific required fields are additive. An SSSS-managed skill also
requires `name`; a schema-v2 memory has knowledge-graph fields; a workflow
requires `name`.

Unknown frontmatter fields must be preserved for forward compatibility. Never
drop a nested map, array, or unknown field during parse/serialize or patch.

Registry declarations are executable contract. Enforce `required_fields`,
`required_when`, `enums`, `patterns`, `immutable_fields`, `references`,
`append_only`, and `portability`. Reject malformed extension definitions,
symlinked registry files, and core or sibling type collisions during load.

