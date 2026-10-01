# Skill Manager

The Total Recall daemon runs this plugin daily at 03:00 in the node's local time. A task stays idle until its
SSSS plugin record explicitly selects the current mesh node. Node identities,
skill roots and repository ownership are instance configuration.

Install on the intended node with `total-recall plugin install skill-manager`.
Create a configuration file on that node:

```json
{
  "node": "build-box",
  "autoApply": false,
  "maxTokens": 900,
  "roots": [{ "path": "/absolute/skills/root", "scope": "global" }]
}
```

For a repository skill root use `scope: "repository"` and an explicit
`repoRoot`. Run `total-recall skill-manager configure <file>` there, using
`total-recall mesh exec <node> '<command>'` for remote control. Configuration,
last results and schedule slots persist through SSSS operations. `status`
reports them; `audit` inspects without applying; `optimize` follows autoApply.

Only changed packages are reprocessed; changes to references or configuration
invalidate cached results. Automatic application is lossless: retained source,
reference hashes and essential rules remain available. Ambiguous boundaries,
ownership mismatch, symlinks or changed optimized instructions need review.
There is no model-generated rewrite or implicit traversal of other repositories.
The daemon records actual command exits, including review (2) and errors (1).
