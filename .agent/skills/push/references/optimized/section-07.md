### Step 1: Pre-Release Quality Safeguards
Run the full `check.mjs --tier remote` gate on the Mac Mini through the Total
Recall mesh CLI. This includes the Vitest suite. Never run the full suite or
quality gates on the laptop, Chromebook, or droplet; a single spec may run on
any mesh node. Use the `code-quality` and `test` skills for the exact commands
and preserve the gate's exit code. This repo has no ESLint or TypeScript gate.

Before tagging, boot the server natively on the Mac Mini with an isolated home
and `DISABLE_DAEMON=true` (otherwise it starts a daemon that outlives the
server against the temporary home), and verify `/health` reports the release version. Then run `npm run check:dist`
and `npm publish --dry-run` on the publishing host.

