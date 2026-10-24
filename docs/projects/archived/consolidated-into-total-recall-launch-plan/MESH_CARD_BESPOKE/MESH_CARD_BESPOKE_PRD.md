# MESH_CARD_BESPOKE — PRD

> **Project Prefix**: `MESH_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Sonnet 5.5 agent
> **Date**: 2026-10-23
> **Based on audit**: MESH_CARD_BESPOKE_AUDIT.md (Complete)

## Who it is for

Greg, or an agent acting for him, who depends on reaching every machine over the mesh (cloud droplet, Mac mini, MacBook) and has been burned by silent infrastructure faults. This operator does not browse a topology. They ask **"can I reach every machine I rely on, and is the control plane healthy?"** and need the one machine that is not reachable named, with its reason.

## Tasks

1. Confirm the fleet is reachable (about one second, no click).
2. Find which node is down or has no login, and why.
3. Check the control server and this machine's enrollment.
4. See who the leader is and what runtimes and agent harnesses each node offers.
5. Ping or probe one node on demand.

## Requirements

- **MSR-1** Every figure traces to a returned `status`, `doctor` or `leader` payload. No seeded value, no default string that reads as a state.
- **MSR-2** An unknown value renders an em dash with its reason.
- **MSR-3** A verdict line computed only from returned values, in a documented priority order.
- **MSR-4** The unreachable and unconfigured nodes outrank the healthy ones in the layout.
- **MSR-5** Node state is shown as three separate facts: network (`network_state`), access (`access_state`), reachability (`reachable`). They are different problems with different fixes.
- **MSR-6** The control server shown with its verification state and URL host, never assumed.
- **MSR-7** Failed read clears every figure and shows the error with attempt time.
- **MSR-8** Three screens defined by the plugin: `Fleet`, `Control`, `Capability`.
- **MSR-9** Ping is the only action; it takes a node chosen from the real list, not free text.
- **MSR-10** No concrete IP, hostname or node name in source. Names come from the payload.
- **MSR-11** Headscale branding from `plugin.json` (`#818cf8`, logo `ui/logo.svg`); no wordmark glyph brackets; light-on-dark only, matching the dashboard.
- **MSR-12** Colour is always paired with a word.
