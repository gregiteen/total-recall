---
name: Metaharness
description: A clear handoff from Total Recall's brain selection to the operator's chosen Chat harness.
colors:
  canvas: '#0c1427'
  background: '{colors.canvas}'
  surface: '#1e293b'
  text: '#f1f5f9'
  muted: '#94a3b8'
  signal: '#38bdf8'
  primary: '#3b82f6'
  line: '#334155'
  success: '#10b981'
  warning: '#f59e0b'
  danger: '#ef4444'
typography:
  title:
    fontFamily: system-ui, sans-serif
    fontSize: 18px
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: system-ui, sans-serif
    fontSize: 14px
    lineHeight: 1.5
  label:
    fontFamily: ui-monospace, monospace
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.08em
rounded:
  frame: 8px
spacing:
  inset: 16px
  row: 12px
components:
  chat-handoff:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.frame}'
    padding: '{spacing.inset}'
---

## Overview

Metaharness works like a dispatch board. Readers should understand the selected
harness, the brain scope and the next action from a quick scan.

## Colors

Use the deep navy {colors.canvas} under pale {colors.text}. Reserve blue
{colors.signal} for the route between the brain selection and its destination.
Use status colors for verified outcomes from the host.

## Typography

Use the quiet, compact {typography.label} for handoff stages. Use
{typography.title} for the section heading and {typography.body} for instructions.

## Layout

Give the heading and route a full-width row at narrow drawer sizes. Stack route
stages when their labels would wrap. In a wider drawer, use one route line.

## Elevation & Depth

Separate the saved route from its controls with a single border. Keep the
workflow blocks flat so their order stays clear when combined in a drawer.

## Shapes

Use compact rounded frames and controls. Label the route stages with text.

## Components

The Chat handoff block explains the route. The native Home shows the saved
harness, registered choices and the optional destination. The bottom drawer
supplies brain selection and the launch and copy controls. Each operational
block describes one separate workflow and its observed owner data.

## Do's and Don'ts

Show the route in reading order. Keep operational state sourced from Metaharness.
Keep the handoff marker still and show clear focus and loading states. Use text
to distinguish saved configuration, draft behavior and unavailable reads.
