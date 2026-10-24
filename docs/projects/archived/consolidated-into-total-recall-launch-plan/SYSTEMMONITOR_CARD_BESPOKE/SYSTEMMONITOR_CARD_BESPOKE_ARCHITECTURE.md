# SYSTEMMONITOR_CARD_BESPOKE — Architecture

> **Project Prefix**: `SYSTEMMONITOR_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: SYSTEMMONITOR_CARD_BESPOKE_AUDIT.md (Complete)

---

## 1. Shape: a wide instrument panel, not a tile stack

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HOST TELEMETRY            Gregorys-Mac-mini · darwin        ● live  [ Pause ] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   MEMORY                                     LOAD (1m / 5m / 15m)             │
│   ┌──────────────────────────────────┐       ┌──────────────────────────────┐ │
│   │  96%                             │       │  5.22   4.84   5.09          │ │
│   │  ████████████████████████░░      │       │  ▂▃▅  ▂▃▄  ▂▃▄              │ │
│   │  critical · threshold 90%        │       │  cores: unknown              │ │
│   └──────────────────────────────────┘       └──────────────────────────────┘ │
│                                                                              │
│   FREE / TOTAL          UPTIME              PLATFORM          SAMPLED        │
│   690 MB / 16.0 GB      7d 11h 42m          darwin            14:51:33        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Now | Trend | Host
```

Two large instrument cards side by side, then a row of supporting facts. Wide because telemetry is comparative: memory next to load is the whole point, and stacking them vertically destroys the comparison.

## 2. Why this arrangement

- **Memory and load are co-primary and side by side.** These are the two figures that decide whether a machine is in trouble, and they are read together.
- **The memory figure is the percentage, with a bar and a stated threshold.** The bar gives the fast read; the number gives the exact one; the word (`critical`) means colour is never the only channel (SMR-3, SMR-12).
- **Free/total sits below, in absolute units.** "690 MB free of 16.0 GB" is what tells you whether you are about to run out; a percentage alone does not (SMR-5).
- **All three load averages are shown together and labelled.** The 1m/5m/15m shape is the information — a spike versus a sustained climb (SMR-4).
- **Cores: unknown** is printed rather than omitted, because load without a core count is not interpretable and pretending otherwise would be a fabricated normalisation (SMR-4).
- **Timestamp is always visible.** The payload carries its own `timestamp`; a reading with no age is a claim about now that may be false (SMR-7).
- **Nothing is drawn before the first sample.** The instrument frames render empty with an em dash, never a zero and never a placeholder (SMR-1).

## 3. Screens

| Screen | Contents | Why it exists here |
| --- | --- | --- |
| **Now** | The panel above. | The one-second glance. |
| **Trend** | Samples collected this session in order: memory % sparkline and load, with a clear note that this is session-only and in-memory. | `sample` returns a single instant, so change over time can only come from repeated sampling. This is the plugin's own honest answer to "did my change help?" |
| **Host** | Hostname, platform, total memory, boot-derived uptime, sampling commands, and the exact CLI lines behind the figures. | Static facts and provenance, kept off the glance screen. |

## 4. Data flow

```
connectedCallback()
  ├─ render()            frames with em dashes; no figures exist yet
  ├─ sample()            host.run('sample')  → paint
  └─ (opt-in) timer      one host.run('sample') per interval → paint + push to trend

[Sampling on]  → setInterval(intervalMs) → sample() → trend.push(reading)
[Sampling off] → clearInterval
disconnectedCallback() → clearInterval   (never leave a timer running)
```

- **One command path**: `sample` is the only source of figures. `status` is offered as readable text on the Host screen, never parsed for numbers (it is the human-readable variant and duplicating its content as data would be guesswork).
- **Failure sets `state = 'error'` with the real message and `lastAttempt`.** No branch retains a figure as current (SMR-2).
- **Trend is capped** (a bounded ring, 60 readings) and cleared on disconnect, so a long session cannot grow without limit.

## 5. Severity

Thresholds are declared constants and printed next to the bar, so the rule is visible:

| Reading | Band | Wording |
| --- | --- | --- |
| memory < 75% | nominal | `nominal` |
| 75–89% | elevated | `elevated` |
| ≥ 90% | critical | `critical` |
| load 1m ≥ cores (when known) | saturated | `saturated` |

When the core count is unknown the load band is reported as `unknown` rather than guessed (SMR-4).

## 6. Styling

- Host tokens for surfaces and text: `--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary`, `--border`, `--accent`.
- Brand: `#059669` accent, `jetbrains-mono` for every numeral, tabular so digits do not shift as values change.
- Severity colours (`ok`, `warn`, `danger`) are declared once in the `:host` token block and always accompanied by a word.
- The memory bar is the only filled shape; motion is limited to a soft transition when a value changes and to nothing at all under `prefers-reduced-motion`.
- Two-column instrument row collapses to one column below 760 px.

## 7. Manifest change

Remove `card_layout`. Keep the single existing element; add `design_tokens`:

```json
"ui": { "design_tokens": "ui/DESIGN.md",
  "elements": [ { "id": "card", "kind": "card", "tag": "tr-system-monitor-card", "module": "ui/card.js" } ] }
```
