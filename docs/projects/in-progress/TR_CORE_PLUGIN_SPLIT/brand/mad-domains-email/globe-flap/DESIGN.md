# Mad Domains & Email — Globe flap

> Manage your email empire.

## Concept
A globe (domains) crossed by a red envelope flap (email). The one-stop shop in one shape.

## Palette
| Role | Hex |
| --- | --- |
| primary | `#161616` |
| accent | `#FFD400` |
| ink | `#161616` |
| surface | `#FFF8D6` |
| muted | `#FFEE99` |
| alert | `#D7192D` |
| ok | `#15803D` |
| warn | `#A16207` |
| error | `#B91C1C` |

Contrast (WCAG 2.1):
- ink on surface: 16.9:1 (passes AA for text)
- surface on primary: 16.9:1 (passes AA for text)
- ink on accent: 12.6:1 (passes AA for text)
- primary on surface: 16.9:1 (passes AA for text)

Rule: the accent color is for fills, highlights and the live indicator. Text on the accent uses the ink color. Never set accent-colored text on a light surface.

## Typography
`fraunces` for headings and body, tabular numerals for counts, money and durations. Sizes: 12 label, 14 body, 16 control, 20 section, 28 figure.

## Shape and density
Radius `lg`, density `spacious`, header `tab-strip`, 44 px minimum touch targets, 150 ms state transitions only, no decorative animation, reduced motion respected.

## Voice
Showman. Big claims backed by numbers.

## Logo
`ui/logo.svg`: a flat mark in the palette above, readable at 16 px, on light and dark surfaces. Keep clear space equal to one quarter of the mark's width. Do not recolor, outline or animate it. The about text credits the infrastructure the service runs on.

## What the product does (the card must expose all of it)
- Domain search, registration, transfer and renewal
- DNS records with templates and propagation checks
- Mailboxes, aliases, forwarders and catch-all
- SPF, DKIM and DMARC set up and monitored
- Deliverability: warm-up, reputation, bounce and complaint handling
- Transactional send over the relay
- Newsletters with a template editor and scheduling
- Drip campaigns with triggers, delays, branches and stop rules
- Lists and segments, CSV import, double opt-in, unsubscribe and suppression
- CRM sync both ways: contacts, tags, replies as notes
- Reports: opens, clicks, replies, revenue per campaign
- Usage and cost per domain and per project

## Card layout (template `workbench`)
- `status`: strip: domains healthy, mailboxes, queue, reputation
- `table`: Domains tab: domain, expiry, DNS and mail health
- `table`: Mailboxes tab: address, quota, last login, forwards
- `table`: Campaigns tab: drips and newsletters with state and results; actions to pause, clone, send test
- `table`: Lists tab: lists and segments; form to import CSV and map fields
- `gauge`: Deliverability tab: reputation, bounce rate, complaint rate, DNS checks
- `settings`: sender defaults, footer, quiet hours, CRM sync
- `credentials`: relay key, mail server key, registrar key

## Manifest tokens
```json
"branding": {
  "color": "#161616",
  "accent": "#FFD400",
  "font": "fraunces",
  "density": "spacious",
  "radius": "lg",
  "header": "tab-strip",
  "logo": "ui/logo.svg"
},
"card_layout": { "template": "workbench" }
```
