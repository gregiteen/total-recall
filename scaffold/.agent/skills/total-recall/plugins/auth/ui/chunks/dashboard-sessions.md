---
type: ui-chunk:chunk
title: Dashboard session signing
description: Check whether this host has a dashboard signing credential.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: dashboard-sessions
intents: [check dashboard session signing, inspect cookie security, diagnose missing session secret]
surfaces: [page, right]
operations: [session]
data: ["session:/session_secret_configured"]
---

<section>
  <h2>Dashboard session signing</h2>
  <p>Auth signs dashboard sessions and sets an HttpOnly cookie. Check whether signing is configured in Auth Home or with <code>total-recall auth session</code>.</p>
  <p style="color:var(--color-muted,#b1c9ba)">This check reports signing setup. Review a specific sign-in in the browser session that performed it.</p>
</section>
