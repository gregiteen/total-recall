---
type: ui-chunk:chunk
title: Credential inventory
description: Review saved credential metadata, repository bindings, and rotation due dates.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: secret-inventory
intents: [inspect credential inventory, check secret repository bindings, review rotation due dates]
surfaces: [page, right]
operations: [secret]
---

<section>
  <h2>Credential inventory</h2>
  <dl>
    <dt><code>total-recall auth secret list --json</code></dt>
    <dd>Read repository bindings, tags, provider and verification metadata.</dd>
    <dt><code>total-recall auth secret catalog</code></dt>
    <dd>Review the credentials known to the host.</dd>
    <dt><code>total-recall auth secret rotation-due</code></dt>
    <dd>Review due dates before selecting credentials to rotate.</dd>
  </dl>
  <p>Make credential changes through Auth in the owner terminal.</p>
</section>
