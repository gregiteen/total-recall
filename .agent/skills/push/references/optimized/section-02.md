## Deploy model — read before pushing

> [!CAUTION]
> **Total Recall has no push-triggered deploy. The host pulls `main`.** No
> watcher reacts to a branch push for this repo, so pushing `production` deploys
> **nothing** here.

| action | effect |
|:---|:---|
| `git push origin main` | ships the source; a host that runs `auto-pull.sh` picks it up on its own schedule |
| `npm publish` (via `publish.mjs`) | ships the package to the registry |
| `git push origin production` | **no deploy** — nothing consumes that branch for this repo |

