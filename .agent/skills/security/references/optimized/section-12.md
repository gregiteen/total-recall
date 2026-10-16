### ACL policy (`total-recall mesh policy`)

- **Networking is not authorisation.** A control server with no policy still
  routes packets, but every host falls back to its own sshd and per-machine
  `authorized_keys`. The policy is what lets the control server authorise SSH.
- Policy management over the API **requires `policy.mode: database`** on the
  control server. In `file` mode the policy lives on the server's disk and the
  API cannot manage it — the client raises `POLICY_MODE_FILE` with the fix.
- A control server in database mode with an empty policy table answers **500,
  not 404**, on read. That is the expected first-run state, so
  `getHeadscalePolicy()` normalises it to `{configured: false, unset: true}`.
  Treating it as an error makes bootstrapping a first policy impossible.
- `mesh policy init-ssh` generates the **single-operator** shape: every member
  reaches every member. Mesh membership is the trust boundary, so any node
  admitted inherits it. Narrow `src`/`dst` before admitting a node you do not
  control. root is excluded by default (`autogroup:nonroot`) so mesh SSH keeps
  a per-user audit trail.

