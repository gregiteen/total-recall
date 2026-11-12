# Automations — Control ledger

```yaml
tokens:
  brand-name: "Automations"
  wordmark: "AUTOMATIONS"
  color-primary: "#f2bd63"
  color-background: "#181713"
  color-surface: "#24221c"
  color-text: "#f4efe5"
  color-muted: "#c5bca9"
  color-border: "#726652"
  color-success: "#a8d5b0"
  color-error: "#ffb5a9"
  color-focus: "#b8d9ff"
  font-family: "system-ui, sans-serif"
  font-mono: "ui-monospace, monospace"
  border-radius: "12px"
  spacing-unit: "8px"
```

## Purpose and first-principles decision
Greg checks which work is automated, where its source is available, and whether an observed run failed. He needs automation origins and coverage before interpreting counts. Replace the old chronometer card, fixed schedule chips and terminal output: they obscure these tasks and invent healthy state. Retain external element names and host.run because these are useful host contracts.

The control-ledger arrangement pairs an automation index with selected automation provenance. Its branching vector mark represents one trigger feeding several owned runners; it does not imply active work. One brand, Automations, appears once. The amber accent marks selection and refresh; textual state identifies every failure or unknown. No ambient decoration or hardware imitation.

## Hierarchy and screens
The first visible line states whether inventory is unchecked, loading, complete, partial or failed, plus the last actual attempt. Refresh is the primary read action. Four purpose-defined tabs preserve the requested tasks: Scheduled (automation index, not a promise every item uses cron), Nodes (source coverage per node), Audit (observed outcomes separately from handled slots), Run (only source-advertised actions). These are domain views, not generated CLI screens. Filters cover node, source, trigger and observed state.

The selected record shows trigger, enabled state, runner availability, source, placement and origin independently. Unknown values include a reason. Failed reads clear current inventory. Unsupported sources and unavailable nodes remain visible. Counts derive only from returned records and cannot imply coverage completeness.

## Interaction and safety
Read through host.run('list', []) inside the sandbox. The full panel may use the authenticated generic plugin route when no host channel is available. Reject failed wrappers and malformed inventory; do not create successful fallback output. A latest-request counter prevents stale refreshes overwriting newer results. Disconnect invalidates pending work; reconnect reuses its shadow root and selected tab.

Every control is at least 44px, with visible focus. Tabs support arrow/Home/End navigation and maintain selected-screen state. Filters have labels; loading/errors use a live region. Layout becomes one column under 600px; text wraps safely. State change motion is a short content reveal; reduced motion removes it. Copy feedback follows actual clipboard completion. Source-advertised write controls state their target and require confirmation; arbitrary commands and credential inputs are absent.

## Verification
Use real dark host tokens, then inspect at 360, 768 and 1280px. Test unchecked/loading/partial/failed/empty states, malformed/auth-rejected requests, escaping, request races, reconnect, tab keyboard behavior and clipboard rejection. Tests use explicit fixtures; the shipped component has no fixtures or seed state. Live source authenticity is a separate backend verification obligation.

## References reviewed 2026-10-29
- [Custom element lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
- [Accessible tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
