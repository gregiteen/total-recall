---
type: ui-chunk:chunk
title: Dashboard password
description: Inspect password configuration and follow the protected dashboard reset flow.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: dashboard-password
intents: [check dashboard password, force a password reset, change dashboard sign-in password]
surfaces: [page, right]
operations: [password]
data: ["password:/configured", "password:/forcePasswordReset"]
---

<section>
  <h2>Dashboard password</h2>
  <p>Use <code>total-recall auth password status --json</code> to see whether a password is configured and whether a reset is required.</p>
  <p>Change the password in the signed-in dashboard flow or use <code>total-recall auth password set --stdin</code> in the owner terminal. Auth invalidates existing dashboard sessions after the change.</p>
</section>
