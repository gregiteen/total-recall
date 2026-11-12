---
type: ui-chunk:chunk
title: Scoped access keys
description: Review access key scope and use the owner terminal for issue and revocation.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: scoped-access-keys
intents: [issue scoped access key, review PAT permissions, revoke a dashboard API key]
surfaces: [page, right]
operations: [key]
---

<section style="border-inline-start:3px solid var(--color-primary,#64e3a4);padding-inline-start:1rem">
  <h2>Scoped access keys</h2>
  <p>Review key IDs, scopes and expiry with <code>total-recall auth key list</code>. Check available roles with <code>total-recall auth key roles</code>.</p>
  <p>Issue keys with only the scopes the client needs. The owner terminal displays the new value once. Revoke retired keys by ID after checking the client has moved to its replacement.</p>
</section>
