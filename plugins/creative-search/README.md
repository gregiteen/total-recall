# Creative Search

SearXNG metasearch plugin. Its manifest registers query, categories, deep, remember, health, engines and stats under `csearch`, a context generator, a half-hour health task and two UI sources. Registration is distinct from functional installed-host verification.

## Configuration and commands

Set `total-recall csearch config set searxngUrl <instance-url>` or override with
`SEARXNG_URL`. There is no default host. Settings validate and persist in the
owning SSSS plugin record. The CLI and generator consume that configuration;
compilation does not probe external engines. `TR_CLI` may override the host CLI.

```bash
npx total-recall plugin install creative-search
npx total-recall csearch query "search terms"
npx total-recall csearch categories general "climate science"
npx total-recall csearch deep "research topic"
npx total-recall csearch remember "topic"
npx total-recall csearch health
npx total-recall csearch engines
npx total-recall csearch stats
```

`csearch config show|set <key> <value>|reset` manages canonical settings. Legacy
loose JSON is not automatically imported. The overview panel accepts the host's
canonical `config` property and shows an unset state without a request. The
standalone settings panel's localStorage controls remain disconnected; host
settings persistence and a functioning UI mount still require correction.

## Current verified limitations

The audit reproduced failed writes reported as saved, healthy results despite timeout/zero results and generator output discarded by the host. Deep follow-up results are omitted from the final collection. UI sources invent engine/count/status values and fail the actual UI generator with 59 violations. A declared panel is not a functioning mount.

See PIC-009–014/PIC-022 in the [correction tracker](../../docs/projects/in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Fresh installed CLI/state/task/UI proofs remain open. These examples do not establish live SearXNG readiness.
