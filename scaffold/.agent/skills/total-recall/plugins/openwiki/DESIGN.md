---
name: OpenWiki
description: A warm reference atlas for repository documentation, evidence, and links.
colors:
  background: "#f9f1e3"
  surface: "#fff9ee"
  text: "#302519"
  muted: "#6d5741"
  outline: "#cbb497"
  primary: "#8d3e10"
  on-primary: "#fff9ee"
  error: "#9b2a20"
typography:
  heading:
    fontFamily: "Newsreader, Georgia, serif"
    fontWeight: 600
    fontSize: 1.8rem
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: 1rem
    lineHeight: 1.55
  source:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontSize: 0.8rem
    lineHeight: 1.5
spacing:
  sm: 0.65rem
  md: 1rem
  lg: 1.5rem
rounded:
  panel: 0.45rem
  control: 0.3rem
components:
  atlas-intro:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.outline}"
    borderWidth: 1px
    borderStyle: solid
    padding: "{spacing.md}"
    rounded: "{rounded.panel}"
---

# OpenWiki

## Overview

OpenWiki should read like a maintained reference atlas. The index establishes which pages exist. Search moves directly to evidence with its source. The topology shows how those pages refer to one another. Repository maintenance belongs in separate blocks.

## Colors

Warm ivory is the background and pale cream holds content. Brown-black carries the text. Burnt orange marks active controls and relationships. Use red for a failed read and accompany it with a message.

## Typography

Use Newsreader for headings, DM Sans for body text, and DM Mono for paths and version labels. Give quotations space to wrap. Keep source lines beside their passages.

## Layout

Give search the full width, then place the page index beside the link topology. Stack these regions at narrow widths. Let file names and section labels wrap without obscuring line numbers.

## Elevation & Depth

Use hairline rules between index entries. A lightly contrasting reading surface is enough to separate passages from metadata.

## Shapes

Use restrained corners on the atlas and controls. Show links as direct relationships between page labels.

## Components

The atlas introduction carries the `atlas-intro` tokens. The native panel holds recorded upstream status, workspace evidence search, a page list, and the live link topology. Each independent block explains one operator workflow.

## Do's and Don'ts

Use explicit search, refresh, and topology controls with visible focus and at least 44 pixels of target height. Keep motion still. Distinguish an empty read from a failed one, and show recorded versions with their freshness. Keep generated documentation, provider checks, and credential entry outside the Home load.
