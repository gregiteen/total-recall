# Plugin completion verification

Status: In Progress. Tests run in an isolated source snapshot on the configured Mac mini, with fresh root and frontend lockfile installations. No production source, provider credentials or live vault was copied. Curated source-controlled scaffold seed templates and bundled auth/mesh owner source were included explicitly.

`source.sha256` records the local source set for comparison with the snapshot. Full-suite runs include root and dashboard tests through the root Vitest configuration. Raw logs and command exit files remain in the isolated test directory and a private scratch evidence copy; they are not package artifacts.

Failures retained during verification:

- First baseline omitted bundled auth from the snapshot. Adding source repaired the import failures; the next baseline passed 48 tests.
- Bridge tests exposed an obsolete expectation that command names imply read effects. Expectations now require explicit declarations.
- Frontend dependencies in the initial test copy lacked the required type/lint executables. Fresh lockfile installations repaired the test environment.
- A focused panel mock omitted `pluginElements`. The partial module mock now preserves the actual export; the focused rerun passed 79 tests.
- First full suite omitted mesh source and curated scaffold seeds. The next source-complete run reached 2,064 passing tests with two genuine model-catalog regressions.
- Both model routers ignored the explicit catalog root. They now honor `TR_ROOT`, and the test restores the previous environment value.
- A local legacy scaffold embeddings database was preserved outside the template. The canonical and shipped brain-state manifests now classify legacy derived state; the regression proves the gate rejects it. The third full run correctly rejected an empty legacy directory still present only in the test copy. Removing that empty directory repaired the snapshot.

The checklist distinguishes these shared changes from unfinished owner cards, service integrations, distribution, metering, authoring/store and live acceptance. Passing source checks cannot certify provider calls, physical audio, publication or deployment.

## Verified shared implementation

Final core/dashboard suite: 340 files, 2,069 tests, exit 0. Frontend build: exit 0. Eight fast gates: exit 0. Expanded lint: exit 0, 19 warnings and no errors. Type check: exit 0. Current source identity: all 1,047 files match, exit 0. The phone adapter has four passing native regressions and a matching source hash.

Brick vendoring now rejects a destination whose symlink parent escapes the real project root; its regression proves the external directory remains empty. Drawer focus is contained/restored, missing usage measurements are unavailable, and session activity does not claim agent history. A new drawer ref lint error was fixed and included in the passing final suite/build/lint.
