---
type: ui-chunk:chunk
title: Agent sign-in
description: Check supported agent profiles and complete an approved terminal sign-in.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: agent-login
intents: [sign in Codex CLI, check agent sign-in profiles, approve terminal sign-in]
surfaces: [page, right]
operations: [agent]
---

<section style="border-block-start:1px solid var(--color-outline,#3f6350)">
  <h2>Agent sign-in</h2>
  <ol>
    <li>Find the supported profiles with <code>total-recall auth agent list</code>.</li>
    <li>Start the selected sign-in with <code>total-recall auth agent login &lt;profile&gt;</code> in the owner terminal.</li>
    <li>Complete browser approval in the browser session where you intend to sign in. Enter any approval code in the owner flow.</li>
  </ol>
</section>
