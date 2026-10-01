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

Optional navigation: `total-recall skill-manager route "task" --repo /absolute/repository`
on the selected node returns one advisory skill name. Run the normal context
command independently for required instructions; this suggestion cannot admit
or remove rules and does not automatically change IDE context.

Add an explicit `decision` object to the existing configuration to enable the
installed decision capability's raw client, without another decision skill:

```json
{
  "plugin": "decision", "module": "src/client.mjs", "export": "requestDecision",
  "model": "typesafe/jev-1.13", "endpoint": "https://openrouter.ai/api/alpha/decisions",
  "secretKey": "OPENROUTER_API_KEY", "confidence": 0.8, "fit": 0.8,
  "timeoutMs": 10000, "maxBytes": 8000
}
```

The example gates need calibration for your catalog. Model, endpoint, plugin
module and credential name are instance configuration. No credential value is
stored here. Only task and authorized name/description metadata go outbound;
repository ownership is checked first. Choice proposes a label, then Noul checks
its fit. Invalid answers, low certainty, missing capability/key, budget overflow
or network failures preserve deterministic name/description matching. A valid
`none` answer returns no suggestion. Successful advice caches for five minutes
by task, repository, content, client and config hashes; failures are retried.
The existing client's alternate endpoint is disabled because its schema differs.
