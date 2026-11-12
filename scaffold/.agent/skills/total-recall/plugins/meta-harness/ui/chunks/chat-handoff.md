---
type: ui-chunk:chunk
title: Chat handoff
description: Explain how Total Recall passes the selected brain IDs to a draft in the default Metaharness Chat destination.
timestamp: '2026-11-08T04:00:00Z'
plugin: meta-harness
id: chat-handoff
intents:
  - open the default chat harness
  - carry selected brains into chat
  - prepare a draft for review
surfaces: [page, bottom]
panel: home
operations: [chat-target, chat-default]
data: ["chat-target:/configured", "chat-target:/harness/id", "chat-default:/configured"]
---
<section aria-label="Metaharness Chat handoff" data-design-component="chat-handoff" style="box-sizing:border-box;min-width:0;padding:var(--spacing-inset,16px);border:1px solid var(--color-line,#334155);border-radius:var(--radius-frame,8px);background:var(--color-canvas,#0c1427);color:var(--color-text,#f1f5f9);font:14px/1.5 var(--typography-body-font-family,system-ui)">
  <p style="margin:0 0 6px;color:var(--color-signal,#38bdf8);font:600 11px/1.4 var(--typography-label-font-family,monospace);letter-spacing:.08em;text-transform:uppercase">Metaharness / Chat</p>
  <h2 style="margin:0 0 12px;font-size:var(--typography-title-font-size,18px);line-height:1.2;font-weight:650">Carry your brain selection into Chat</h2>
  <ol aria-label="Handoff stages" style="display:flex;flex-wrap:wrap;gap:6px 24px;margin:0 0 12px;padding:8px 12px 8px 32px;border-left:2px solid var(--color-signal,#38bdf8);background:var(--color-surface,#1e293b)">
    <li>Choose brains</li>
    <li>Open the default harness</li>
    <li>Review the draft</li>
  </ol>
  <p style="margin:0;color:var(--color-muted,#94a3b8)">Chat keeps the same default as you switch brains. The draft carries the selected brain IDs so the harness can resolve them through Total Recall.</p>
</section>
