# Prompt 8 — Verify, then report

Run every check and report the **real** result. A passing health probe is not a test result.

## The prompt

```
node <skill>/scripts/record.mjs . --json
```

Then work the list, and record the actual outcome of each. Do not tick a box you did not test.

- [ ] `total-recall plugin info <id>` reports no errors and no warnings.
- [ ] Every surface the function needs is declared, and nothing unused.
- [ ] Each shared dependency uses its existing owner command or a vendored brick. The reuse gate passes and the workflow tests exercise the declared interfaces.
- [ ] Every operation has typed arguments and an effect.
- [ ] `--json` works on every subcommand; failures exit non-zero; `--help` works without credentials.
- [ ] No secret value appears in `argv`, stdout, stderr, logs or UI state.
- [ ] The Home and its bespoke design are declared. The owner inventory and the operation and data bindings cover the same workflows.
- [ ] Every displayed value came from an actual operation. Failures and unknown values are explicit.
- [ ] Home and its assembled blocks render at 360, 768 and 1280 px with no horizontal overflow.
- [ ] Every state renders: credential present, missing, provider unreachable, rejected call, empty, stale.
- [ ] The suite passes — per-subcommand unit tests including failure paths, a manifest test, a secrets test.
- [ ] No seeded value, placeholder or example default survives anywhere in the plugin.
- [ ] If a scaffold exists: it runs with `TOTAL_RECALL_BIN` unset, and its tests fail if it spawns a process.

## Then, honestly

Bring `README.md` to describe the plugin **as it actually is**:

- what it does, in its own words
- the real commands
- where credentials come from
- **anything still outstanding**, stated plainly

No claim of a capability the plugin does not have. A stale warning about a fixed bug is itself a defect: one plugin's README described two reporting bugs as unfixed long after both were repaired and verified.

## Correct means

Every claim in the report is backed by a command you ran, and anything you could not verify is named as unverified rather than omitted.

## Check

A second reader can reproduce every claim from the report alone.
