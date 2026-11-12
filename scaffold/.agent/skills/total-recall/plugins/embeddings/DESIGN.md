---
name: Embeddings
description: Local embedding provider, model roster and vault vector coverage for a Total Recall brain.
colors:
  primary: "#06b6d4"
  primary-hover: "#22d3ee"
  background: "#07171d"
  surface: "#0e2a35"
  line: "#164e63"
  text: "#ecfeff"
  muted: "#67e8f9"
  on-primary: "#07171d"
  ok: "#10b981"
  warn: "#f59e0b"
  danger: "#ef4444"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 13px
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 11px
    fontWeight: 700
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 12px
    fontWeight: 600
  figure:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 28px
    fontWeight: 800
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
components:
  section:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  locality-chip:
    textColor: "{colors.ok}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs}"
  coverage-figure:
    textColor: "{colors.text}"
    typography: "{typography.figure}"
  count-row:
    textColor: "{colors.muted}"
    typography: "{typography.mono}"
  model-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  notice:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
---

# Embeddings

## Overview

An operator console for the vectors behind Total Recall search. It answers four questions, in this order: which provider serves vectors and whether text stays on this machine, how much of the vault has a usable vector, which models the endpoint offers, and how fast the selected model embeds. Every figure comes from the plugin's own JSON operations. Anything not reported renders as a dash, never as a guess.

## Colors

Deep teal surfaces with a cyan primary. Locality and health use the state colors: `ok` for local and current, `warn` for remote, unknown or partial, and `danger` for unreachable or failed. Text uses `text` on `surface`, with `muted` for labels and secondary counts.

## Typography

Sans-serif for prose and labels. Monospace for anything an operator might copy: endpoints, model names, counts and timings. A single large monospace `figure` carries the usable-coverage percentage.

## Components

- `section`: a bordered surface panel per question (provider, coverage, models, benchmark, pull).
- `locality-chip`: the local, remote, unknown or disabled verdict, colored by state.
- `coverage-figure`: the usable-vector percentage.
- `count-row`: one labelled count (usable, stale, wrong width, missing, orphaned).
- `model-row`: one model with its width, capability and selection.
- `button-primary`: an operator-triggered action. Touch targets are at least 44px.
- `notice`: unavailable, failed or explanatory text.

## Do's and Don'ts

- Do show a non-`ok` index state by name. Don't render it as 0%.
- Do keep provider state separate from credentials. Hosted fallback keys belong to the Auth owner and are never displayed.
- Don't claim "on-device" unless `locality` is `local`.
- Don't run benchmark or pull on load.
- Respect `prefers-reduced-motion`.
