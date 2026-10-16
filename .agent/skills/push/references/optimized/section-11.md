### Where each step runs

`publish.mjs` needs three things on ONE machine: GitHub push access, the
`npm_token` in a secrets store it can unlock, and a fresh `frontend/dist`.
It runs `git push origin main --tags`, so it also pushes every local tag, and
it aborts the publish if that push fails. When no machine has all three:

1. Run the gates and the full suite on the Mac Mini (never a laptop or the droplet).
2. Bump, tag and `git push origin main v<version>` from the machine that has
   GitHub access.
3. On the machine logged in to npm (`npm whoami`), fast-forward to the tag,
   build `frontend/dist` there or copy the test host's verified build,
   then `npm run check:dist`, `npm publish --dry-run`, `npm publish`.
4. Confirm on the registry, not from npm's output — it can lag minutes:
   `curl -s https://registry.npmjs.org/total-recall-brain | jq '."dist-tags"'`.

Update `HANDOFF.md` and the affected project trackers in the same release.

