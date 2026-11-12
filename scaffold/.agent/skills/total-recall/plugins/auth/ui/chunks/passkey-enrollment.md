---
type: ui-chunk:chunk
title: Passkey enrollment and review
description: Inspect registered authenticators and follow the Auth WebAuthn flow.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: passkey-enrollment
intents: [check passkeys, register an authenticator, remove a retired security key]
surfaces: [page, right]
operations: [passkey]
data: ["passkey:/count"]
---

<section>
  <h2>Passkey enrollment and review</h2>
  <ol>
    <li>Check the registered count with <code>total-recall auth passkey status</code>.</li>
    <li>Enroll through the dashboard's authenticated WebAuthn flow. Approve the request with a device or security key.</li>
    <li>Use <code>total-recall auth passkey list</code> to identify a retired authenticator before removing it through Auth.</li>
  </ol>
</section>
