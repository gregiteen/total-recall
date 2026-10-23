# PLUGIN_BRICK_STANDALONE — Development Plan

> **Project Prefix**: `PLUGIN_BRICK_STANDALONE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_BRICK_STANDALONE_AUDIT.md (Complete)

---

## Phase 0 — Audit ✅
- [x] Vendor `tr-plugin-stripe` into a clean app and inspect the payload
- [x] Prove the brick fails without the `total-recall` binary
- [x] Count the dependency across all plugin repositories: 19 of 34
- [x] Confirm the vendored payload carries `ui/card.js` and a `host.run` contract
- [x] Establish that no capability function is exported anywhere (cli.mjs exports only `run`)
- [x] Find the hard-coded `example.com` URLs and example defaults
- [x] Inspect `plugin create --with-ui` and record the old-model output
- [x] Write `PLUGIN_BRICK_STANDALONE_AUDIT.md` (Complete)

## Phase 1 — Planning ✅
- [x] Define the brick as a capability artifact, not a relocated plugin
- [x] Write the PRD (BR-1…BR-12)
- [x] Write the architecture (one source / two artifacts, capability contract, payload selection)

## Phase 2 — Let a plugin with no UI validate (BR-9, BR-10)
- [ ] Make `ui` optional in the card contract while keeping a *declared* face strictly validated
- [ ] Update the contract spec for the optional case
- [ ] Confirm a manifest with no `ui` and no `card_layout` validates clean

## Phase 3 — Make the scaffolder honest (BR-9, BR-10, BR-11)
- [ ] Remove the generated `panel.js`, the `DESIGN.md` stub and the `ui` block from `plugin create`
- [ ] Remove `--with-ui` from the scaffolder, or make it report that the face is authored later by hand
- [ ] Delete `tokenPanelSource()` and the password-input pattern entirely
- [ ] Emit a valid manifest on the first run
- [ ] State the plugin-versus-brick distinction in the scaffolder's output
- [ ] Update the scaffolder specs

## Phase 4 — Declare and select the capability (BR-1, BR-4, BR-8)
- [ ] Add `capability { entry, exports }` to the manifest contract and its validator
- [ ] Add `pluginBundleFiles(dir, { audience })` with `plugin` and `brick` selection
- [ ] Exclude `ui/**`, the plugin manifest and the CLI from a brick payload
- [ ] Write `BRICK.md` into the brick: what to import, what to pass, where credentials come from
- [ ] Have `vendor` report clearly when a plugin declares no capability

## Phase 5 — Make stripe a real reference capability (BR-1, BR-3, BR-6)
- [ ] Extract `capability/index.mjs` with exported functions and explicit parameters
- [ ] Move request construction, signature verification and response mapping out of `cli.mjs`
- [ ] Remove the `example.com` placeholders; require `successUrl`/`cancelUrl` from the caller
- [ ] Remove the example defaults (`2000`, `"General Admission Ticket"`) from the capability
- [ ] Inject the transport so an app can supply its own HTTP client
- [ ] Reduce `cli.mjs` to an adapter: parse, resolve credentials, call, format
- [ ] Keep the plugin path's behaviour and tests green

## Phase 6 — Prove standalone operation (BR-2, BR-7)
- [ ] Add a test that loads the capability with no `TOTAL_RECALL_BIN` and asserts no process was spawned
- [ ] Add a test calling each exported function with caller-supplied arguments and an injected transport
- [ ] Assert no `total-recall` string is reachable from the brick payload
- [ ] Re-vendor into a clean app and run the brick's suite there

## Phase 7 — Report both audiences (BR-5, BR-12)
- [ ] `plugin info` reports whether the capability is standalone, whether it is vendorable, and which host facilities it uses
- [ ] Update the plugin skill and its references to state the distinction and both requirement sets
- [ ] Correct `references/distribution.md` where it describes bricks as relocated plugins

## Phase 8 — Testing and verification
- [ ] Core suite green
- [ ] Scaffolder produces a valid manifest with no UI
- [ ] A vendored stripe brick runs `status` and `checkout` with `TOTAL_RECALL_BIN=/nonexistent`
- [ ] A vendored brick contains no `ui/`, no `card.js`, no `example.com`, and no `total-recall` reference
- [ ] Total Recall core tests green with the contract change

## Sequencing note

Phases 2–3 unblock everything: until a plugin with no UI validates, the scaffolder cannot stop emitting a stub panel. Phase 5 makes stripe the worked example that proves the capability shape before the remaining 18 dependent plugins are converted.
