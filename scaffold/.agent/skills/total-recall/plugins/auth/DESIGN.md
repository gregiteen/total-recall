---
version: "1.0"
name: Auth & Secrets
description: A pine-green access console for sign-in readiness and credential maintenance.
colors:
  primary: "#64e3a4"
  background: "#101e19"
  surface: "#192d24"
  text: "#f2f8f3"
  muted: "#b1c9ba"
  outline: "#3f6350"
  warning: "#f4d18c"
  danger: "#ffbbb1"
typography:
  body:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: 1rem
    lineHeight: 1.5
  heading:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: 1.4rem
    fontWeight: 700
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 0.75rem
    letterSpacing: 0.05em
spacing:
  sm: 0.65rem
  md: 1rem
  lg: 1.5rem
rounded:
  panel: 0.65rem
  control: 0.4rem
components:
  access-overview:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.outline}"
    borderWidth: 1px
    borderStyle: solid
    rounded: "{rounded.panel}"
    padding: "{spacing.md}"
---

# Auth & Secrets

## Overview

Auth Home is a dashboard access console. Put sign-in readiness first and the baseline audit immediately after it. Keep workflow blocks independent so the operator can place a passkey or credential maintenance reference near the task at hand.

## Colors

Use deep pine for the workspace and a lighter pine for inset surfaces. Mint identifies a present configuration or a completed audit. Amber flags setup or a finding. Coral marks unavailable checks and failed requests. Accompany every status color with readable text.

## Typography

Use Outfit for headings and body text. Use JetBrains Mono for workflow labels and command syntax. Fall back to the system families on a device without either font.

## Layout

Use a compact vertical list for the sign-in methods and a short checklist for command workflows. Allow labels and status text to stack at narrow widths. Keep credential values out of every surface.

## Elevation & Depth

Separate the console with a single outline and inset dividers. Use flat color so a warning keeps its prominence.

## Shapes

Use modestly rounded corners for the console and controls. Keep state labels as plain text.

## Components

Access overview introduces the local configuration and links its block to the native panel. The panel uses the authenticated bridge to refresh state and run a baseline audit. Workflow blocks use headings, short steps and exact local command names. Named component tokens apply to the access overview.

## Do's and Don'ts

Use visible focus, status announcements and touch targets of at least 44 pixels. Keep the interface still. Report a failed or unavailable check in text. Keep sign-in ceremonies and credential entry in the owner workflows.
