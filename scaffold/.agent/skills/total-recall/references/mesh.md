# Mesh

Mesh owns node discovery, access, network/control-server observations, enrollment, leader selection, presence and dispatch. Core contains generic loading/contracts only. Read `total-recall mesh --help`; recall recorded mesh access before resolving a target, user, key or execution host. Use CLI operations instead of hand-rolled remote orchestration. Node details live in SSSS device/mesh entities, never product constants.

Credential lookup, control-server API keys and mesh sync tokens use auth. Enrollment/control API requests must verify authenticated responses, HTTPS transport and safe redirects. Saved node metadata is not live network/service evidence. Distinguish unobserved, offline, reachable, service-ready and authenticated states. Show observation timestamps and actual errors. Never fabricate peers, readiness, latency, user activity or synchronized badges.

Presence accepts fresh authenticated observations. Unknown activity cannot imply an active user. No active target is an error for automatic dispatch. Commands succeed only after their actual execution result; notification acknowledgement is not proof the user viewed it. Test timeouts, stale records, denied peers, local execution and remote failures. Never copy/merge brains during leader changes. Significant mesh extraction and truthfulness work remains in progress until owner and integration suites pass.


Host service adapters require the explicitly selected absolute TR_PACKAGE_ROOT; independently installed host packages are never execution substitutes. The mesh owner runtime suite passes 249 tests plus three Node manifest/host-boundary tests; these do not prove live mesh provider health.

## Developer-owned control server

`mesh server init --host H --domain D` installs the developer's own Headscale on a Debian 12+/Ubuntu 22.04+ host they reach over SSH (any provider). It refuses a host that already has Headscale, verifies the release checksum, patches the release's own example config (fails loudly if upstream renames a patched line), runs `headscale configtest`, starts it, creates the first user, saves the API key through auth, and enrolls this machine when the Tailscale client is present (pre-auth key passed by file). The domain must resolve to the host before Let's Encrypt can issue. `mesh server update` stages the new release, trials it against a copy of the real database, switches only when healthy and restores the saved binary and database on failure; the switch pauses the control plane for a few seconds while established connections continue. A daily task runs it with `--if-provisioned`. The Headplane admin console runs beside it bound to 127.0.0.1 only; `mesh server console` opens an SSH tunnel and puts a one-day login key on the clipboard, never the terminal. `total-recall new` provisions all of this only when a registered deployment has an SSH host, user and domain; `--no-mesh` skips it. Verified on a real Debian 12 host except public-domain TLS; never claim a server reachable from a loopback-only or unverified domain.

## Mesh secrets grants

`mesh grants add (--node | --tag | --user) KEY…` lets a machine read named secrets (patterns ending in `*`). Default is deny; a grant with no selector matches nobody. The leader identifies the caller with `tailscale whois` (works on Headscale), so no shared token is involved. Grants live in `config/mesh-secrets-policy.json` at mode 0600. Audit `mesh grants list` before widening a grant.
