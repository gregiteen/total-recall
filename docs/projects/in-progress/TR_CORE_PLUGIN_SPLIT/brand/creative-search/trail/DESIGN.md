# Creative Search — Trail lens

> Ask once. It finds, reads, checks and files the answer.

## Concept
The handle splits into a trail: an agent following links. Reads as search plus browsing.

## Palette
| Role | Hex |
| --- | --- |
| primary | `#4338CA` |
| accent | `#A3E635` |
| ink | `#1E1B4B` |
| surface | `#F7F7FF` |
| muted | `#E0E0FF` |
| ok | `#15803D` |
| warn | `#B45309` |
| error | `#B91C1C` |

Contrast (WCAG 2.1):
- ink on surface: 15.0:1 (passes AA for text)
- surface on primary: 7.4:1 (passes AA for text)
- ink on accent: 10.6:1 (passes AA for text)
- primary on surface: 7.4:1 (passes AA for text)

Rule: the accent color is for fills, highlights and the live indicator. Text on the accent uses the ink color. Never set accent-colored text on a light surface.

## Typography
`jetbrains-mono` for headings and body, tabular numerals for counts, money and durations. Sizes: 12 label, 14 body, 16 control, 20 section, 28 figure.

## Shape and density
Radius `sm`, density `compact`, header `tab-strip`, 44 px minimum touch targets, 150 ms state transitions only, no decorative animation, reduced motion respected.

## Voice
Technical, brisk. Shows its steps.

## Logo
`ui/logo.svg`: a flat mark in the palette above, readable at 16 px, on light and dark surfaces. Keep clear space equal to one quarter of the mark's width. Do not recolor, outline or animate it. The about text credits the infrastructure the service runs on.

## What the product does (the card must expose all of it)
- Metasearch across many engines with categories and filters
- Agentic search: multi-step research with plan, sources and citations
- Long-tail browsing agents that follow links and read pages
- Scraping and page extraction with robots and rate-limit respect, exports to JSON and CSV
- Enrichment: companies, contacts and places looked up and returned as records any project can use
- Saved searches and monitors with change alerts
- Reader view and summaries with quoted evidence
- Quotas, budgets and cost per query and per project

## Card layout (template `console`)
- `form`: query box with mode: quick, deep, agent, enrich
- `list`: ranked results with source and evidence
- `log`: agent steps: plan, searched, opened, extracted, decided
- `table`: enrichment results ready to export
- `actions`: save search, monitor, export (JSON or CSV)
- `settings`: engines, categories, depth, budgets, politeness
- `credentials`: service key

## Manifest tokens
```json
"branding": {
  "color": "#4338CA",
  "accent": "#A3E635",
  "font": "jetbrains-mono",
  "density": "compact",
  "radius": "sm",
  "header": "tab-strip",
  "logo": "ui/logo.svg"
},
"card_layout": { "template": "console" }
```
