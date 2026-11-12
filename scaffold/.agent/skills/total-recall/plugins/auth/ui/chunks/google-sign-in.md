---
type: ui-chunk:chunk
title: Google sign-in
description: Inspect local Google OAuth setup and use the browser-owned sign-in flow.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: google-sign-in
intents: [check Google OAuth setup, connect Google account, review Google sign-in]
surfaces: [page, right]
operations: [google]
data: ["google:/configured"]
---

<article>
  <h2>Google sign-in</h2>
  <p>Check the dashboard's client configuration and allowlist with <code>total-recall auth google status</code>. To connect, open the sign-in URL from <code>total-recall auth google connect</code> in your browser.</p>
  <details>
    <summary>Review a connected account</summary>
    <p>Use <code>total-recall auth google accounts</code> to review account status. Refresh or disconnect the selected account through the same Auth command group.</p>
  </details>
</article>
