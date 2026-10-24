# Hello Phone — Dialpad

> Every line, every agent, one number to call.

## Concept
The nine-dot keypad with one yellow key lit. Instantly a phone, and the lit key doubles as the live-call indicator.

## Palette
| Role | Hex |
| --- | --- |
| primary | `#2563EB` |
| accent | `#FFC800` |
| ink | `#0A1B4D` |
| surface | `#F8FAFF` |
| muted | `#DBEAFE` |
| ok | `#15803D` |
| warn | `#B45309` |
| error | `#B91C1C` |

Contrast (WCAG 2.1):
- ink on surface: 15.7:1 (passes AA for text)
- surface on primary: 4.9:1 (passes AA for text)
- ink on accent: 10.6:1 (passes AA for text)
- primary on surface: 4.9:1 (passes AA for text)

Rule: the accent color is for fills, highlights and the live indicator. Text on the accent uses the ink color. Never set accent-colored text on a light surface.

## Typography
`inter` for headings and body, tabular numerals for counts, money and durations. Sizes: 12 label, 14 body, 16 control, 20 section, 28 figure.

## Shape and density
Radius `md`, density `compact`, header `plain`, 44 px minimum touch targets, 150 ms state transitions only, no decorative animation, reduced motion respected.

## Voice
Plain and exact. Numbers first.

## Logo
`ui/logo.svg`: a flat mark in the palette above, readable at 16 px, on light and dark surfaces. Keep clear space equal to one quarter of the mark's width. Do not recolor, outline or animate it. The about text credits the infrastructure the service runs on.

## What the product does (the card must expose all of it)
- Lines and numbers (search, buy, assign, port)
- Inbound and outbound calls with a browser softphone
- Voicemail, routing and IVR
- SMS and MMS with 10DLC registration
- AI voice agents, inbound and outbound, on the carrier's agent API
- Outbound agent campaigns with consent and do-not-call checks
- Call recording, transcripts and summaries
- E911 and compliance
- Usage and cost per line and per project

## Card layout (template `console`)
- `status`: strip: lines up, agents live, calls now
- `keypad`: dial or paste a number; pick the line to call from
- `list`: active calls and agent sessions
- `table`: lines and numbers with capabilities and monthly cost
- `actions`: start outbound agent campaign, assign agent to inbound line, send text
- `log`: call and message log with transcript links
- `settings`: routing, voicemail, agent prompts, quiet hours
- `credentials`: carrier key, webhook secret

## Manifest tokens
```json
"branding": {
  "color": "#2563EB",
  "accent": "#FFC800",
  "font": "inter",
  "density": "compact",
  "radius": "md",
  "header": "plain",
  "logo": "ui/logo.svg"
},
"card_layout": { "template": "console" }
```
