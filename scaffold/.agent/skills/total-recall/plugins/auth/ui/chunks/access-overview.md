---
type: ui-chunk:chunk
title: Dashboard access
description: Inspect local Auth readiness before signing in or reviewing credentials.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: access-overview
intents: [check dashboard sign-in, review auth configuration, check registered passkeys]
surfaces: [page]
panel: home
operations: [status]
data: ["status:/passkey/registered_count", "status:/google_oauth2/configured"]
---

<section data-design-component="access-overview" style="border-inline-start:3px solid var(--color-primary,#64e3a4);padding-inline-start:1rem">
  <p style="color:var(--color-primary,#64e3a4);font:0.75rem var(--typography-label-font-family,monospace);letter-spacing:0.05em">ACCESS CONTROL</p>
  <h2>Dashboard access</h2>
  <p>Check which sign-in methods this host has configured and run its baseline audit. Provider sign-in is verified in the browser.</p>
</section>
