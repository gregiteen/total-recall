---
type: ui-chunk:chunk
title: Verified mesh file transfer
description: Send one bounded file and verify the destination byte count and SHA-256.
timestamp: "2026-11-08T09:10:00Z"
plugin: mesh
id: file-receipt
intents: [copy file to mesh peer, verify mesh file transfer, check destination checksum, send file through mesh]
surfaces: [page]
operations: [file]
data: ["file:/ok", "file:/bytes", "file:/sha256"]
---

<style>
  .mesh-receipt { padding:var(--spacing-md); background:var(--color-surface); border:1px solid var(--color-border); }
  .mesh-receipt h2 { margin-top:0; }
  .mesh-receipt li::marker { color:var(--color-ok); }
</style>
<section class="mesh-receipt">
  <h2>Read a transfer receipt</h2>
  <ol>
    <li>Choose a peer, source file, and destination explicitly.</li>
    <li>Read the destination byte count and SHA-256 after the transfer.</li>
  </ol>
</section>
