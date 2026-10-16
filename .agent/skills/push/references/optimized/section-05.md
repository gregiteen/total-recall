### What is NOT this repo's deploy path

`/root/auto-deploy.sh` on the droplet (invoked by `/root/deploy-watcher.sh` every
minute) belongs to **UltraChat**: it deploys `/root/ultrachat` with Docker Compose
and PM2, and it never mentions total-recall. Never reason about this repo's
releases from that watcher. The same applies to the `production` branch — here it
is only a leftover mirror of `main`.

**If nothing consumes a branch, pushing it is not a release.**


This skill coordinates the release lifecycle of the `total-recall` package to ensure zero-regression, fully tested, and correctly versioned releases on npm and GitHub.

---

