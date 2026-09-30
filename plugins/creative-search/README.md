# Creative Search

SearXNG metasearch plugin. Its manifest registers query, categories, deep, remember, health, engines and stats under `csearch`, a context generator, a half-hour health task and two UI sources. Registration is distinct from functional installed-host verification.

## Configuration and commands

Provide `SEARXNG_URL` explicitly. The CLI currently has a personal mesh fallback, which violates generic configuration and is scheduled for removal. `TR_CLI` can select a host CLI file; its derived default is unreliable after installation.

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

There is no registered `csearch config` or `csearch-config` command. CLI settings load loose JSON selected by `AGENT_DIR` or a user-config path; UI settings use localStorage. They are disconnected and some controls are ignored. The correction requires one validated SSSS configuration consumed by every surface.

## Current verified limitations

The audit reproduced failed writes reported as saved, healthy results despite timeout/zero results and generator output discarded by the host. Deep follow-up results are omitted from the final collection. UI sources invent engine/count/status values and fail the actual UI generator with 59 violations. A declared panel is not a functioning mount.

See PIC-009–014/PIC-022 in the [correction tracker](../../docs/projects/in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Fresh installed CLI/state/task/UI proofs remain open. These examples do not establish live SearXNG readiness.
