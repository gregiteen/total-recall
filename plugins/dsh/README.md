# DeepSeek Harness (DSH)

Source for querying runtime status, sessions, tools, models and client plugins. The manifest declares a context generator, quarter-hour status task and two UI sources. Declarations do not establish runtime identity or functional installed UI.

```bash
npx total-recall plugin install dsh
npx total-recall dsh status
npx total-recall dsh sessions
npx total-recall dsh tools
npx total-recall dsh models
npx total-recall dsh plugins
```

`DSH_RUNTIME` supplies a filesystem location for package inspection. It does not identify the process returned by discovery. `DSH_WEB_URL` is used by the sessions path; browser-local probes do not reliably address the host runtime.

## Current verified limitations

Discovery accepts any listener on three fixed ports as DSH. Models/tools can derive invalid paths without `DSH_RUNTIME`; tools use a fixed inventory. The context generator returns an object discarded by the string-only host. UI generation rejects sources with 48 violations. The widget treats fallback HTTP 500 as online, leaves metrics unset and does not reconstruct its grid/clear errors after recovery.

PIC-013–017 in the [correction tracker](../../docs/projects/in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md) require configured identity-checked discovery, authoritative tools/metrics, valid host contracts and installed UI recovery/action proofs. Operational readiness remains unverified.
