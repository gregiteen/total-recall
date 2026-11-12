---
version: alpha
name: Security evidence desk
description: A paper field notebook for measured and manual security evidence.
colors:
  background: "#f4f0e6"
  surface: "#fdfbf5"
  text: "#22342d"
  muted: "#4d6157"
  border: "#aab6a8"
  primary: "#31564b"
  primary-soft: "#dce9dd"
  notice: "#795117"
typography:
  title:
    fontFamily: "Georgia, serif"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.05
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 700
    letterSpacing: 0.06em
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
  lg: 22px
  xl: 28px
  touch: 44px
components:
  evidence-note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "{spacing.md}"
    rounded: "{rounded.sm}"
  section-marker:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    padding: "{spacing.sm}"
---

# Security evidence desk

## Overview

The desk reads like an operator’s field notebook. It starts with the scope of a check and makes room for a clear result, partial coverage, and the next deliberate action.

## Colors

Use warm paper for the main surface and forest ink for headings, focus and separators. Keep secondary explanations muted with enough contrast to read beside evidence. Use notice ink for a review state with a visible label.

## Typography

Use the serif title for major sections and system sans for dense evidence. Give numbers and scope labels room to scan. Keep technical state labels readable without relying on color.

## Layout

Use one column on narrow screens. On wide screens place target controls on the left and the current evidence on the right. Long forms and permission repair belong in disclosed sections.

## Elevation & Depth

Use rules and background changes to distinguish regions. The evidence area is a single work surface with no floating layers.

## Shapes

Small radii keep fields and controls consistent. Aim for at least 44 pixels for action targets and a strong keyboard focus outline.

## Components

Use evidence notes for one selected scope and its measured limits. Use section markers for labels on local, mesh, device and website workflows.

## Do's and Don'ts

Write explicit status labels and identify what was observed. Keep measurement, manual review and unavailable state distinct. Use aggregate coverage in the browser and terminal entry points for private material. Start an assessment or repair after an explicit action.
