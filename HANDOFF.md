# Mesh update cache repair

Released: 3.49.5. Source, package and all three eligible active runtimes are verified.

The updater previously dispatched version-pinned npm exec for every peer needing
maintenance, including peers with a working installed CLI. This release advertises
`capabilities.automaticLocalUpdate: true` in update status and reuses that installed
CLI only after a successful probe with the strictly true flag. Legacy or failed
probes retain the pinned bootstrap. Dispatch still waits for an independently
verified durable report; local failures and stale serving processes remain failures.

Focused verification: 45 tests in three files pass. All eight configured fast
checks pass with zero findings; that tier deliberately omits the full suite.
Registry artifact and serving runtimes were verified independently of source tests.

The first full gate passed 3,867/3,869 tests and exposed two contended native
integration fixtures. Their unchanged isolated run passed 22/22 in 4.92s. The
durability fixture now aborts and awaits its real children before deleting storage,
including failed readiness; a real PID/ESRCH regression verifies it. Canonical
fact readiness and bounded integration-specific deadlines preserve all rollback,
permission, CAS and privacy/export assertions. The repaired focused run passes
23/23 in 14.33s. The fresh full gate is required before release.

Full run two passed 3,869 tests and exceeded the deadline in an existing ledger
rollover case. Its append loop is now bounded by a measured real-document size
boundary, with sealed-byte, complete-history and tail assertions intact. Its
focused spec passes 17/17 in 7.64s. The native isolated server serves 3.49.5 and
exits cleanly; its temporary home is removed. Dist verification and the required
publish dry run pass, including 57 fresh-install/harness/vault assertions and
zero remaining installer fixtures. Full run three passes all nine configured
checks, 437 test files and 3,870 tests, with zero findings on source identity
`e83055f292ab83d58f699afba5c82a95c0c549599747874c4c4d013ae15d22f8`.

Prior committed work `fd980750` preceded this task and is preserved in the release
batch; this task did not author it.

Follow the repository's local push protocol. Update both the issuing maintenance
daemon and receiving CLI. A legacy peer may need one bootstrap before advertising
the capability. The cloud serving process uses `total-recall deploy release` with
its configured adapter; preserve the zero-downtime replacement contract.

Project evidence: docs/projects/completed/MESH_UPDATE_CACHE/ (private records).

Publication at source commit `a769e1903699d4b383d3d53144d9d17359dd537f`
matches the tested tarball SHA-1 `c5789734fadf90e8474919b8beeef7490b03b0aa`.
The owning publisher completed with zero consumer-update failures, restored the
npm profile, and left no installer fixtures. Source-only consumers retain their
pins without new dependency installations. Offline or non-executable peers are
not claimed updated.

All three active servers report 3.49.5 and installed status advertises the new
capability. The two active issuer daemons use verified repaired CLI entries;
the delegated host has no local daemon. Production used the zero-downtime
adapter; its declared serving checkout is verified separately from the global
CLI's strict foreign-root observation. Brain data and worker placement stayed
with their existing owners. Final evidence is retained in the private project
record under `docs/projects/completed/MESH_UPDATE_CACHE/`.
