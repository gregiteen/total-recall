---
type: ui-chunk:chunk
title: Credentials and access inventory
description: Browse the encrypted credential inventory, registered brains, and Mesh machines, then inspect dashboard sign-in and the host baseline.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: access-overview
intents: [find all stored secrets, inspect repository credential bindings, see registered brains, see mesh machines, check dashboard sign-in]
surfaces: [page]
panel: home
operations: [status]
data: ["status:/passkey/registered_count", "status:/google_oauth2/configured"]
---

<aside aria-label="Credential handling">
  <p>Repository bindings show where each stored credential is available. Use the rotation column to find credentials that need review.</p>
</aside>
