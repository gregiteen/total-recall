# SYSTEMMONITOR_CARD_BESPOKE — Audit

> **Project Prefix**: `SYSTEMMONITOR_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Audit Status**: Complete
> **Audited commit**: `HEAD` (tr-plugin-system-monitor)
> **Umbrella audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## 1. What this plugin is

`tr-plugin-system-monitor` reports the host's own resource telemetry. Two commands, both `read`:

| Command | What it returns |
| --- | --- |
| `status` | Human-readable resource summary |
| `sample` | One JSON telemetry sample |

Its declared template was **`monitor`** — the same template as `dsh`, an unrelated plugin. Branding: `#059669` / accent `#10b981`, font `jetbrains-mono`, badge "Host Telemetry". One UI element: `tr-system-monitor-card`. No `DESIGN.md` exists.

Real `sample --json` output, captured 2026-10-23:

```json
{ "timestamp": "2026-10-23T14:51:33.630Z", "hostname": "Gregorys-Mac-mini.local",
  "platform": "darwin", "uptimeSeconds": 646951,
  "loadAvg": [5.22265625, 4.83984375, 5.0927734375],
  "memory": { "total": 17179869184, "free": 691060736, "usedPercent": 96 } }
```

## 2. Findings

### SM-01 — The card seeds a fabricated telemetry reading in its constructor (P0, critical)

```js
this.sample = {
  hostname: 'Gregorys-Mac-mini.local',
  platform: 'darwin',
  uptimeSeconds: 566924,
  loadAvg: [3.34, 3.76, 5.00],
  memory: { total: 17179869184, free: 159334400, usedPercent: 99.1 }
};
```

The card renders invented numbers — a specific hostname, an uptime, a load average and **99.1% memory** — before any command runs. The `catch` block comment confirms the intent: `// Retain fallback telemetry`. A host at 99.1% memory would be in genuine distress, so this is not a neutral placeholder; it is a false alarm. It also hard-codes one machine's hostname into a plugin that ships to every node.

### SM-02 — A failed read is indistinguishable from a real one (P0, critical)

`loadSample()` swallows every error and retains the seeded reading. `sample` failing, the host refusing, or the command erroring all look exactly like healthy telemetry. There is no failure state at all, so the operator cannot tell whether they are looking at their machine or at a literal.

### SM-03 — The card cannot express a serious condition (P1, high)

`usedPercent: 96` is on the wire right now. Memory pressure is the single most consequential thing this plugin measures, and there is no threshold, no colour change and no severity anywhere. A gauge that looks the same at 20% and 96% reports nothing.

### SM-04 — Three of the six real fields are unused (P1, high)

The payload carries `timestamp`, `platform`, `uptimeSeconds`, `loadAvg` (three values), `memory.total`, `memory.free` and `memory.usedPercent`. The card shows a subset as opaque text and discards the rest, so free-versus-total memory — the figure that actually tells you whether you are about to run out — is not shown.

### SM-05 — No DESIGN.md, and the theme bypasses the host (P1, high)

The plugin declares `branding.color`, `branding.accent` and `branding.font: jetbrains-mono`, but ships no `DESIGN.md`, so there are no tokens to follow. The card also hard-codes its own palette rather than using the host's injected tokens, so it cannot adapt to light or dark.

### SM-06 — Load average is shown without its normalising context (P2, medium)

Load average is only meaningful against the number of CPUs. The card shows `3.34` with no core count, so the operator cannot tell whether that is idle or saturated. The payload does not include core count, so the honest fix is to present load relative to what is known and to say when it is unknown.

### SM-07 — Template `monitor`, shared with `dsh` (P0, root cause)

Both `system-monitor` and `dsh` declared `monitor > status > live > list > actions > activity`. A host telemetry plugin and a harness-inspection plugin presented the same arrangement.

## 3. What is correct and should be kept

- **`sample --json` returns genuine, well-shaped data.** The fields are the right ones for this domain; the problem is entirely in the card.
- **Both commands are correctly declared `read`**, so read-only mounting is already safe.
- **No secrets.** This plugin has no credential surface, so it cannot leak one.
- **`jetbrains-mono` is a supported brand font token** and is the right choice for numeric telemetry.

## 4. What the domain actually requires

Host telemetry has one job: **tell me whether this machine is in trouble, right now.** The four figures that answer it are memory pressure, load, free memory in absolute terms, and how long the machine has been up. Everything else is context.

The operator is almost always doing one of three things:

1. **Glancing** — is anything wrong? This must be answerable in one second with no clicking.
2. **Diagnosing** — which resource is the problem, and how bad?
3. **Confirming a change** — I just freed something; did it help?

Because `sample` returns a single instant, the useful presentation is a **live reading with a visible sampling cadence and its timestamp**, not a static snapshot.

## 5. Root cause

The face was written to the `monitor` template's shape — status tile, gauge, log — and then needed something to put in it before the first command returned. Seeding a plausible reading was the cheapest way to fill the template. The fabrication is a *symptom* of template-driven design: the template demanded content the author had not yet fetched.

## 6. Remediation scope

Delete the seeded sample and every trace of fallback telemetry; make the first render show nothing until a real sample arrives, and show failures as failures. Present memory pressure and load as the primary readings with real thresholds, show free-versus-total memory, uptime and platform as supporting facts, and give the reading a timestamp and a live cadence. Write a `DESIGN.md` with real tokens, use the host's theme tokens, and remove `card_layout` so the declared card element becomes the face.
