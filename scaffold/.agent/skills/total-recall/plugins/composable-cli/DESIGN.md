---
version: alpha
name: CmdSmith
description: Pipeline Forge for composed Total Recall commands. Calm deep-teal workbench, cyan forge mark, risk read at a glance.
colors:
  primary: "#0891b2"
  primary-strong: "#06b6d4"
  primary-soft: "#0c3a47"
  on-primary: "#ecfeff"
  secondary: "#083344"
  background: "#061a20"
  surface: "#0b2731"
  surface-raised: "#10333f"
  line: "#1d4a57"
  text: "#e6f6f9"
  muted: "#93b5bd"
  ok: "#22c55e"
  ok-soft: "#0f3a26"
  warn: "#eab308"
  warn-soft: "#3a3110"
  danger: "#ef4444"
  danger-soft: "#3f1717"
  info: "#38bdf8"
  info-soft: "#0e3247"
typography:
  title:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.06em
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 4px
  md: 6px
  lg: 10px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  touch: 44px
components:
  forge-header:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  verb-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
    height: "{spacing.touch}"
  verb-row-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  risk-badge:
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  inspector:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  action-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  action-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  status-line:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  op-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  field-list:
    textColor: "{colors.muted}"
    typography: "{typography.code}"
---

# CmdSmith

CmdSmith is the Composable CLI plugin's brand: a forge where repeated command sequences become named, versioned verbs. The surface is a quiet deep-teal workbench. The cyan forge mark (`primary`) is reserved for the plugin wordmark, the selected verb and the one primary action on screen.

## Colors

- `background`, `surface`, `surface-raised` and `line` build the workbench in three depths. Text sits in `text`; supporting labels and paths in `muted`.
- Risk is the most important signal and always reads the same way: `ok` for `read`, `warn` for `write`, `danger` for destructive and gated classes (`money`, `dns-cert`, `production-deploy`, `secret-revoke`), and `info` for scope and neutral facts. Each has a `-soft` fill for badge backgrounds so no transparency math is needed.

## Typography

Space Grotesk carries titles, body and labels. JetBrains Mono carries command names, paths, digests and source. Labels are uppercase with `letterSpacing` only in badges.

## Layout

Spacing steps are 4, 8, 12, 16 and 24 pixels. Every interactive target is at least `spacing.touch` (44px) tall. Corners are `rounded.md` on controls and `rounded.lg` on regions.

## Components

- `forge-header`: wordmark "CmdSmith", badge "Pipeline Forge", inventory count.
- `verb-row` / `verb-row-selected`: one composed command with its scope tag and `risk-badge`.
- `inspector`: the selected command's registry record, history and source.
- `action-primary` for the single forward action (Run test); `action-danger` for remove, which always needs a second confirming click.
- `status-line`: loading, unavailable and error states, stated in words.
- `op-sheet` and `field-list`: the portable operation chunks.

## Do and don't

- Do state "Unavailable" and the reason when the host or an operation fails. Don't show placeholder numbers.
- Don't name vendors or implementation details in visible text. Don't use neon glow, scanlines or glitch effects.
