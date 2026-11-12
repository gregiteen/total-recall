---
type: ui-chunk:chunk
plugin: auth
id: credential-store-maintenance
title: Replace or remove a stored credential
description: Update a credential value in the encrypted Auth store or explicitly delete its stored record.
timestamp: '2026-11-08T23:23:00Z'
intents: [replace a stored credential value, delete an obsolete credential, remove a stored secret from this host]
surfaces: [page]
operations: [secret]
panel: home
---

<section data-design-component="access-overview">
  <h2>Stored credential maintenance</h2>
  <p>Use Edit and Replace value to save a new value. Use Delete and enter the credential name to remove it from the host store. Provider revocation is a separate Auth operation.</p>
</section>
