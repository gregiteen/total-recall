---
version: alpha
name: Dispatch Watch
description: A dispatch desk for route readiness and recorded notification outcomes.
colors:
  background: "#1c1714"
  surface: "#2a211c"
  text: "#fff5e8"
  muted: "#dac0aa"
  border: "#6d5546"
  primary: "#ffb069"
  on-primary: "#2c1708"
  notice: "#ffcc9d"
typography:
  title:
    fontFamily: "Georgia, serif"
    fontSize: 42px
    fontWeight: 700
    lineHeight: 1.03
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 700
    letterSpacing: 0.08em
rounded:
  sm: 4px
  md: 10px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  touch: 44px
components:
  dispatch-note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "{spacing.md}"
    rounded: "{rounded.sm}"
  dispatch-marker:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
---

# Dispatch Watch

## Overview

The watch desk pairs an incident receipt timeline with a short set of routing controls. Keep configuration, dry-run evidence and delivery receipts visually distinct.

## Colors

Use dark warm surfaces, cream text and ember accents. Reserve the brightest accent for the deliberate route check and keyboard focus. Pair each colored signal with a written state.

## Typography

Use an editorial serif for the watch title, a readable system sans for receipts and monospace labels for route names and timestamps.

## Layout

Place the receipt timeline before route controls in reading order. On wide surfaces give the timeline more width. At compact widths keep the timeline and route check in a single column.

## Elevation & Depth

Use rules, background tones and spacing to group the masthead, receipt timeline and route checks.

## Shapes

Use small corner radii on controls, a visible keyboard focus ring and at least 44 pixels of target height.

## Components

A dispatch note addresses one decision or workflow. A dispatch marker names the evidence type, such as routing, local dry run or recorded receipt. The Home shows the newest recorded receipt first.

## Do's and Don'ts

Label accepted receipts as accepted submissions. Show unknown outcomes and missing rows directly. Keep addresses, provider receipts and event identifiers in the operator terminal. Run the dry check after an explicit action.
