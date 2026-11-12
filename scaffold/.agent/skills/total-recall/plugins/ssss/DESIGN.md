---
version: alpha
name: SSSS ledger
description: Inspection and contract workbench for the canonical SSSS engine, skill and scaffold.
colors:
  ink: "#1b1814"
  panel: "#27211a"
  line: "#564636"
  paper: "#f7ebd6"
  quiet: "#c2b59f"
  amber: "#b98439"
  gold: "#f4c97a"
  pass: "#c2e4ad"
  fail: "#ffaaa1"
typography:
  heading:
    fontFamily: IBM Plex Sans, system-ui, sans-serif
    fontSize: 18px
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: IBM Plex Sans, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  evidence:
    fontFamily: IBM Plex Mono, ui-monospace, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
rounded:
  sm: 5px
  md: 10px
components:
  ledger-sheet:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    borderColor: "{colors.line}"
    borderWidth: 1px
    borderStyle: solid
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    typography: "{typography.body}"
  ledger-slot:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    borderColor: "{colors.amber}"
    borderStyle: solid
    borderWidth: 0 0 0 3px
    padding: 12px 16px
  evidence-readout:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    typography: "{typography.evidence}"
  field-pointer:
    textColor: "{colors.gold}"
    typography: "{typography.evidence}"
  verdict-pass:
    textColor: "{colors.pass}"
  verdict-fail:
    textColor: "{colors.fail}"
---

# SSSS ledger

Operators open this Home to check whether the engine, the portable skill and the managed project scaffold all match the canonical release. From there they can repair managed files, validate a document, verify a registry lock, run engine conformance or create a new project. The page answers one question first: is this installation complete and current? Every other check is an action the operator chooses.

## Identity

The mark is four offset strokes on one spine, like the ruled entries of a ledger. Ink, parchment and amber carry the palette. Amber is the spine: each reading slot has an amber rule on its leading edge, joining the skill and scaffold to the engine identity above them. Gold marks the primary action and the field names that carry a verdict. Pass and fail tones are reserved for verdicts.

## Typography

Headings and body text use IBM Plex Sans. File paths, integrity hashes, JSON pointers and conformance output use IBM Plex Mono, so an operator can compare them character by character.

## Layout

The installation ledger comes first: engine and spec version, skill, then scaffold, each as a slot with its value and the path or failure beneath. Below it, the controls are grouped by the artifact they check: one document, one registry lock, one new project. Each group shows its own verdict. Long evidence such as conformance output scrolls inside its readout instead of stretching the page.

## States

Nothing is seeded. Before the first reading the ledger shows dashes. If the command bridge is missing, or a reply cannot be parsed, the Home says the reading is unavailable and why, and clears earlier readings. A failure names the part that failed and the time of the attempt. Controls are disabled while an operation is running.

## Motion and accessibility

A new verdict slides 3px into place. Reduced motion turns this off. Every control has a visible gold focus ring and a 44px minimum target. Verdicts are announced through a polite live region. Pass and fail are shown in words as well as color.
