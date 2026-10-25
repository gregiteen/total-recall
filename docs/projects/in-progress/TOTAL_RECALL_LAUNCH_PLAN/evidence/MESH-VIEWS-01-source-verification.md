# Mesh screens, manifest matrix and integration verification

Source stage, 2026-10-25, Codex on the sanctioned Mac mini. Existing core/OpenWiki/OKF extraction commits were pushed after Greg's explicit approval. This new batch is committed for review; no release, deployment, enrollment, policy/grant change or credential-value mutation is implied.

## Delivered contracts

The mesh owner implements Machines, Flows, Placement, Boundary and Join. The five views come from its own design and component, with independent source failures and observation dates. Machines separates control, path, login and executed probes. Sleeping devices are neutral; phones have no applicable shell requirement. Mesh-IP joins cannot borrow a different peer's probe. Presence requires a fresh timestamp and an actual idle measurement before activity is claimed. Placement filters confirmed runtime/harness/I/O capabilities, preserves unknown cells after failed probes, and dates recorded hardware.

`plugin.json.mesh` declares nine provided primitives, eleven integration/evidence contracts, two peer endpoints and explicit unsupported capabilities. Provided operation effects come from the canonical CLI declarations. `mesh view <screen> --json` joins fixed read operations and returns per-source attempt/data/error envelopes plus the manifest declarations. It accepts no arbitrary command. The matrix separates support declarations from current observations; file-push without a transfer-history read is not certified by a badge. Metadata grants no primitive authority.

The generic frame exposes a frozen permitted-operation list. Read-only cards show CLI handoffs for administration; writable hosts retain target-specific re-enrollment confirmation. The generic owned-screen bridge validates source iframe, opaque origin, channel and declared IDs. The outer menu/flipper uses the owner's exact screen order and acknowledges internal selection. No mesh-specific screen set or command-derived screens enter core.

## Verified integration matrix

| Contract | Evidence in this source stage | Limits shown by the view |
| --- | --- | --- |
| Auth | Real CLI regression proves project-pinned AGENT_DIR/TR_BRAIN cannot select another host store; explicit operational/test roots remain supported | Credential values never enter the matrix; low-level explicit store APIs retain their existing contracts |
| Headscale | Actual authenticated user/control and policy reads succeed with the shared auth selector | No policy mutation or provider-wide acceptance claim |
| Tailscale | Current client/network/enrollment status is read | Membership, network and execution remain separate |
| SSH | Actual doctor JSON parses strictly; three machines execute probes | Offline machine remains unknown for execution; phone shell is not applicable |
| Presence | Cloud and laptop return authenticated fresh observations using recorded service ports | Phone has no configured presence service; unknown idle data and expired records remain unknown/stale |
| Plugin sharing | Owner read returns per-peer results; two peers answer in the reviewed observation | Offline/unavailable peers stay explicit; no inferred catalog completeness |
| Updates | Actual last maintenance report is read | Existing recorded failures remain visible; this read does not rerun maintenance or certify current consumers |
| Scheduled work | Declarations and placement are returned from three nodes | Declaration is not execution; unavailable/offline nodes remain explicit |
| Agents | Actual running/recent registered-process inventory is read | Not an inventory of every external agent application |
| Alerts | Delivery-attempt ledger is read; JSONL records survive banner text | Acceptance does not prove recipient viewing |
| Deployments | Selected-project release state is read | No deployment execution is configured for the selected project; other projects are not inferred |

Official primary references reviewed before implementation: [Headscale troubleshooting](https://headscale.net/stable/ref/debug/) and [Tailscale CLI](https://tailscale.com/docs/reference/tailscale-cli). Existing owner platform documentation lists unavailable tunnels, exposure inventory, route management, speed, shared-file spaces and messaging. This stage does not represent those as implemented.

## Source defects fixed during verification

- `view` formerly repeated status while three old tabs contradicted the five-screen design. Five new DOM regressions failed before implementation.
- Doctor's JSON banner broke the actual strict dashboard bridge; it now emits pure JSON and never writes login verification metadata. Local command availability is measured and the tested set is reported.
- Policy and mesh-sync reads used inconsistent project/host stores. Auth now owns the pure host-secret-store selector, reused by its CLI and mesh adapters. A real project-pinned CLI regression failed against baseline before the fix. The bundled binding and explicit scaffold pin are updated.
- Concurrent credential-read audit appends immediately failed on the generic native mutation guard. A concurrent append regression failed against baseline. Bounded acquisition waits now serialize valid writes without losing records, bypassing audits or deleting a persistent guard. Actual aggregated status/presence reads now succeed.
- Presence used an ambient default port instead of recorded peer service metadata. Recorded nondefault-port and unconfigured-device tests now pass; actual cloud observation succeeds.
- Read-only mutation controls, unlock failures disguised as first run, stale/unknown activity, unrelated identity joins and truncated banner-prefixed JSONL are covered by meaningful negative cases.
- Outer navigation previously derived menu items from commands and never reached the opaque frame. Browser inspection of the actual frame document now proves Next reaches Flows/Placement and an internal Join selection makes Previous reach Boundary.

## Verification and retained failures

Mesh baseline after installing its declared missing Vitest dependency:18 Node tests plus309 Vitest tests/28 files pass. Initial npm test exited127 after18 Node passes; not complete verification. Dependency installation exposed a body-parser development advisory, repaired through npm audit fix; final owner audit has zero vulnerabilities.

Final mesh suite:30 Node tests plus315 Vitest tests/30 files, actual exit0. Delivered source identity before/after matches4724d184c87801b424ac0d633789cbcc6162d0b4079cf67b8f238066a44acdfd; owner commitsfd9831d and469e8c1. Owner manifest/card verification:17 checks,0 errors/warnings; npm pack dry run includes screen-view runtime, peer code, card and manifest. Final auth owner:34 Node plus189 Vitest tests/29 files, actual exit0; committedb092d91. Generic frame/navigation focused suite:30 tests/4 files pass. Guard/frame focused suite:17 tests/2 files pass. Final core2430 tests/377 files pass, actual exit0; before/after source identity matchesd0d14c76ffaa618458a8abf111fed1aa83c9a426e4525ba02bae1eabc946cdd2. All8 configured quality checks pass with0 findings and the report is fresh. Frontend TypeScript/Vite build passes; the configured remote-tier test gate is covered by the separately executed full Mini suite.

The first core gate caught a stale bundled-source hash allowlist after adding the new auth binding. Updated only the three affected source pins; scaffold-state validation then passes. One intermediate full run was terminated before completion to refresh that pin and is not passing evidence. The completed checkpoint before the outer bridge was2424 tests/376 files with identicalc9d3913ee05dd0075f637ccb7ae9dd60ee65a7a90d9ddbbe6b61c4305ef7d08e source hashes. Final verification follows the complete bridge source.

Dark dashboard tokens were inspected in Chrome at360,768 and1280 CSS px, including machine selection, capability filtering, Boundary, read-only Join and compact Flows. Page width never exceeded viewport width; wide matrices scroll within their own regions. The actual opaque sandbox document and parent/child screen messaging were exercised using recorded real CLI observations, with writes disabled. This is source/render verification, not a deployed dashboard claim. Screenshots remain local rather than publishing machine telemetry.

OpenWiki ingest returns8 imports/0 errors and the fix is saved as project memory. Startup reports shared_ready:true with its explicitly limited shared-runtime scope. Broader provider budgets, restricted workflows, actual agent instruction consumption and launch acceptance remain in progress. New mesh/auth/core commits await explicit push authorization.
