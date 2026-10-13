# Hello Phone — Bell

> Every line, every agent, one number to call.

## Concept
A service bell: the sound of someone answering. Friendly, reads at 16 px, works as an app icon.

## Palette
| Role | Hex |
| --- | --- |
| primary | `#1D4ED8` |
| accent | `#FACC15` |
| ink | `#0B1B3F` |
| surface | `#FFFFFF` |
| muted | `#E8EEFB` |
| ok | `#15803D` |
| warn | `#B45309` |
| error | `#B91C1C` |

Contrast (WCAG 2.1):
- ink on surface: 16.9:1 (passes AA for text)
- surface on primary: 6.7:1 (passes AA for text)
- ink on accent: 11.0:1 (passes AA for text)
- primary on surface: 6.7:1 (passes AA for text)

Rule: the accent color is for fills, highlights and the live indicator. Text on the accent uses the ink color. Never set accent-colored text on a light surface.

## Typography
`dm-sans` for headings and body, tabular numerals for counts, money and durations. Sizes: 12 label, 14 body, 16 control, 20 section, 28 figure.

## Shape and density
Radius `lg`, density `comfortable`, header `band`, 44 px minimum touch targets, 150 ms state transitions only, no decorative animation, reduced motion respected.

## Voice
Warm and direct. Short sentences. Say what the line is doing.

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
  "color": "#1D4ED8",
  "accent": "#FACC15",
  "font": "dm-sans",
  "density": "comfortable",
  "radius": "lg",
  "header": "band",
  "logo": "ui/logo.svg"
},
"card_layout": { "template": "console" }
```
