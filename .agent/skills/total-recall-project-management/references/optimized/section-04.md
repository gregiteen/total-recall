## Actual test and release configuration

`package.json` defines `npm test` as `vitest run`, `npm run check:dist`, and `npm run check:ssss-registry`. `vitest.config.ts` uses jsdom by default, fileParallelism false and excludes `.agent/**`, `.agents/**`, `.claude/**`, `.cursor/**`; individual test environment annotations must be inspected rather than assumed. Therefore skill helpers need separate targeted verification.

Read `.agent/skills/code-quality/config.json` and its skill for actual gates: dist freshness, open-source paths, shipped package paths, scaffold brain state, SSSS registry and remote test suite. Do not invent lint/typecheck scripts. Run suites/gates on the sanctioned Mac mini in background according to the user's instructions; resolve access through CLI/config rather than hardcoding machine details in reusable instructions. Record working-tree baselines honestly and separate post-edit checks.

Read local `push` before publishing a release and obey the user's authorization and current branch state. No direct-trunk push is authorized by this overlay. Verify the native backend boot and appropriate gates before a release; production/provider readiness requires its own evidence. The coordinator records delegated reads, decisions, writes, commands, tests, failures and verification in the shared tracker's final Action Log before completion.
