---
type: ui-chunk:chunk
title: Credential inventory
description: Review saved credential metadata, repository bindings, and rotation due dates. Open a credential to edit its metadata, replace the stored value or delete it.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
panel: home
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
  <p>Use Edit to save a label or repository binding, or replace the stored value. Use Delete and confirm the credential name to remove it from this host.</p>
</section>
