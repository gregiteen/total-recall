## Pre-publish checklist

1. `npm audit --omit=dev` → 0 vulnerabilities.
2. Secret-pattern grep over tracked files → no matches.
3. No `.env`, `secrets.enc`, key material, or `browser-profile/` tracked or in
   the `files` whitelist.
4. Every new route: auth + explicit scope, mounted **with a path prefix**.
5. No secret values in logs, errors, tests, or fixtures.
6. Unverified rotation recipes still have no `create()`.
7. Full test suite green (run it on the mesh test host, not the production box).
8. Server boots natively before tagging a release — on the test host, with an
   isolated home so the host's running brain does not win the PID lock (the
   new server otherwise logs "already running" to its log file and exits
   silently after the banner):
   `H=$(mktemp -d); HOME=$H TR_SECRETS_NO_KEYCHAIN=1 node bin/total-recall.mjs start --port 3977`
   then `curl -s 127.0.0.1:3977/health` must report the new version.

---

