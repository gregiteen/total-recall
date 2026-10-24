# SYSTEMMONITOR_CARD_BESPOKE — Product Requirements

> **Project Prefix**: `SYSTEMMONITOR_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: SYSTEMMONITOR_CARD_BESPOKE_AUDIT.md (Complete)

---

## 1. Who uses this card, and what it is really for

Agents do work across a **fleet**: a Mac mini, a MacBook, a cloud droplet, a Chromebook, a phone. Those machines have wildly different capacity — the mini has 10 cores, the cloud node has 2 — so the operator's real question is not "how busy is this box". It is:

> **Can the fleet take the work I am about to give it, and which machine is the one that is struggling?**

That is a capacity-and-triage question. A per-host thermometer cannot answer it: a comfortable reading on the 10-core mini would sit beside a hidden, genuinely overloaded 2-core cloud node. Measured at audit time, the cloud node was at load 3.90 on 2 cores (≈1.95/core, over capacity) while the mini was comfortable — exactly the state a single-machine card conceals.

So this card is a **fleet instrument** with a per-host detail view, not a single-host gauge.

## 2. What must be true the moment the card appears

- **Every machine on the mesh**, with its reachability state, worst-first — so the struggling machine is at the top and the unreachable ones are named rather than absent.
- Per machine: load relative to its own core count (the only comparable figure across a 2-core and a 10-core box), memory pressure, and whether the reading is live, cached, or unavailable.
- How old each reading is. A stale reading presented as current is worse than none.
- Machines that are duplicated in the mesh records, offline, or have no shell access, each labelled as such — never silently dropped and never counted as healthy.

Before the first real sample arrives the card shows **nothing shaped like a figure** — no placeholder numbers, no zeroed gauges.

## 3. Requirements

### SMR-1 — No seeded telemetry, ever (P0)
The constructor's hard-coded `sample` is deleted. No hostname, uptime, load average or memory figure exists in the source as a literal. **Audit SM-01.**

### SMR-2 — Failure is a state, not a fallback (P0)
A failed `sample` or `status` renders a failure with the real error and the time of the last attempt. It must never retain a previous reading as though it were current: if a stale value is shown at all, it is labelled stale with its age. **Audit SM-02.**

### SMR-3 — Memory pressure is the primary reading (P0)
Memory `usedPercent` is the largest, most prominent figure, with a real severity threshold: comfortable, elevated, critical. The threshold is visible, so the colour is never the only signal. **Audit SM-03.**

### SMR-4 — Load is shown with the context it needs (P1)
The three load averages are shown together, and the card states plainly when the CPU count is unknown rather than implying a normalised figure it does not have. **Audit SM-06.**

### SMR-5 — Free versus total memory is shown in absolute terms (P1)
Both figures appear, since "2% free" and "free: 690 MB of 16 GB" answer different questions. Sizes are human-readable (GB/MB). **Audit SM-04.**

### SMR-6 — Every returned field is either shown or deliberately omitted (P2)
`timestamp`, `platform`, `hostname`, `uptimeSeconds`, `loadAvg`, `memory.total`, `memory.free`, `memory.usedPercent` — each is presented or consciously excluded, with no field silently dropped. **Audit SM-04.**

### SMR-7 — The reading carries its age and cadence (P1)
The card shows when the sample was taken (from the payload's own `timestamp`) and whether live sampling is on. Live sampling is opt-in and stops when the element is disconnected.

### SMR-8 — Wide, with screens the plugin defines (P0)
The face is a wide surface, never a narrow column. This plugin's honest screen set is small because it has two read commands and one job:

| Screen | Purpose |
| --- | --- |
| **Fleet** | The one-second answer: every mesh machine, worst-first, with load-per-core and memory pressure, plus counts of how many are healthy, strained, unreachable and unreadable. |
| **Host** | One machine in depth: full telemetry, per-core load, process cost, OS and CPU identity. |
| **Trend** | Readings kept this session for the selected machine, so a change is visible over time. |
| **Provenance** | The exact commands and raw payloads behind every figure, per machine. |

The screens are this plugin's own. `sample` returns a single instant, so a session trend is the only way to see change without a second data source — which is why Trend exists and why it is per machine.

### SMR-9 — Fleet scope across the mesh (P0)
Every machine the mesh reports is represented, with its own reachability state. Fleet-wide scope is the point of the plugin; a single-host view is incomplete. **Correction to the pre-audit design.**

### SMR-9a — Machines that cannot be read are named, never dropped (P0)
An offline node, a node with no shell access (iOS), a node whose login fails, and a node that is a stale duplicate entry are each shown with the reason. A fleet card that silently omits an unreachable machine reports a healthy fleet that may not exist.

### SMR-9b — Self is read locally, never over the mesh (P0)
`mesh exec` to this machine fails by design (`Permission denied` when dialling its own mesh IP). The local host is read directly and marked as this machine, so it is never shown as an error.

### SMR-9c — Duplicate node records are surfaced, not merged silently (P1)
The mesh records contain two entities for the same Mac mini — one live, one stale `vault_only` entry. The card labels the stale one as a duplicate rather than drawing a second machine or hiding it.

### SMR-9d — Comparisons are per core, because capacities differ (P0)
Load is normalised against each machine's own core count before ranking or colouring. A 2-core node at load 3.9 is over capacity; a 10-core node at the same load is not. Ranking raw load across a mixed fleet is meaningless.

### SMR-10 — DESIGN.md with real tokens, and host theming (P1)
Write `ui/DESIGN.md` with a `tokens:` block (brand, colours including severity, font, radius, density, motion) and wire `ui.design_tokens` in the manifest. Use the host's injected tokens for surfaces and text so the face works in light and dark. **Audit SM-05.**

### SMR-11 — Declare the face, drop the template (P0)
Remove `card_layout` from `plugin.json`. The existing `card` element becomes the mounted face.

### SMR-12 — Accessibility preserved (P2)
44 px targets, keyboard reachable, visible focus, `prefers-reduced-motion` respected. Severity must never be conveyed by colour alone — it carries a word and a value.

### SMR-13 — Fleet reads are concurrent, bounded and honest about cost (P1)
Reading N machines means N remote commands. They run concurrently with a per-node timeout, and the card states how many nodes it queried and how many answered. A slow or dead node must not stall the fleet view, and a node that times out is reported as timed out rather than as healthy or as missing.

### SMR-14 — The commands behind fleet scope exist and are declared (P0)
Fleet scope requires commands this plugin does not yet declare. Add and declare them rather than reaching around the manifest: a fleet listing (nodes and their reachability) and a per-node telemetry read. Every new command carries an explicit effect, and all of them are `read`.

## 4. Non-goals

- No process list per machine, no disk or network I/O per machine: not collected, so not shown.
- No historical persistence across sessions. Trend is in-memory for the session, and says so.
- No alerting, paging or threshold configuration. This card reports; it does not page.
- No mutation of any node. Every fleet command is `read`.

## 5. Success condition

An operator can see, without clicking, which machine across the whole fleet is under load or memory pressure relative to its own capacity, which machines cannot be read and why, and how old each reading is — with no invented number anywhere on the face and no machine silently omitted.

