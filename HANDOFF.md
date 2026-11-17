# Mesh update cache repair

Release candidate: 3.49.5. Source reviewed and all release checks pass; publication and runtime rollout in progress.

The updater previously dispatched version-pinned npm exec for every peer needing
maintenance, including peers with a working installed CLI. This release advertises
`capabilities.automaticLocalUpdate: true` in update status and reuses that installed
CLI only after a successful probe with the strictly true flag. Legacy or failed
probes retain the pinned bootstrap. Dispatch still waits for an independently
verified durable report; local failures and stale serving processes remain failures.

Focused verification: 45 tests in three files pass. All eight configured fast
checks pass with zero findings; that tier deliberately omits the full suite.
Publication and installed-runtime verification remain required.
No installed runtime is certified by the source tests.

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

Project evidence: docs/projects/in-progress/MESH_UPDATE_CACHE/.
