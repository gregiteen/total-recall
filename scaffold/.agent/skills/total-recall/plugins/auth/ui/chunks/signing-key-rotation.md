---
type: ui-chunk:chunk
title: Rotate a session signing key
description: Replace the signing credential for dashboard or collaboration sessions.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: signing-key-rotation
intents: [rotate session signing key, invalidate dashboard sessions, rotate collaboration signing]
surfaces: [page, right]
operations: [rotate]
data: ["rotate:/rotated"]
---

<section style="border-inline-start:3px solid var(--color-warning,#f4d18c);padding-inline-start:1rem">
  <h2>Rotate a session signing key</h2>
  <p>Rotation invalidates existing sessions for the selected purpose. Make sure you can sign back in before rotating.</p>
  <ul>
    <li><strong>Dashboard</strong> <code>total-recall auth rotate</code></li>
    <li><strong>Collaboration</strong> <code>total-recall auth rotate --collaboration</code></li>
  </ul>
  <p>Run the selected command in the owner terminal.</p>
</section>
