# Card design

The host runs one engine for behavior: actions with typed forms, settings, credentials, status, activity. You choose the design: a layout template, the widgets inside it, and brand tokens. Every plugin gets its own look, tied to what it does.

## Pick a template by function
| Template | Use it when the job is | Arrangement |
| --- | --- | --- |
| `console` | running a task and reading the result | primary form beside the output |
| `ledger` | reviewing records and acting on one | table first, action rail at the side |
| `monitor` | watching live health | gauges or status tiles above a live log |
| `inbox` | working through items | list and detail |
| `dashboard` | an overview then a few actions | status tiles, then actions |
| `workbench` | several related tools | tabs, one tool per tab |
| `vault` | managing stored records | record list with per-row actions |

## Widgets
`status`, `actions`, `table`, `detail`, `log`, `form`, `keypad`, `gauge`, `list`, `settings`, `credentials`, `activity`, `live`. Widgets that read data (`table`, `detail`, `list`, `gauge`, `log`) need `source: { "command": "<declared read command>", "path": "<json path>" }`. `table` needs `columns` with `key`, `label` and optional `format` (`text number money date datetime bytes percent status`). `form` needs `command`. `actions` may list `commands` to feature; the rest stay reachable under "All commands". `live` mounts the plugin's own sandboxed panel.

```json
"card_layout": { "template": "ledger", "regions": [
  { "widget": "status", "variant": "strip" },
  { "widget": "table", "source": { "command": "list", "path": "payments" },
    "columns": [ { "key": "id", "label": "Payment" }, { "key": "amount", "label": "Amount", "format": "money" }, { "key": "state", "label": "State", "format": "status" } ] },
  { "widget": "actions", "commands": ["refund"] },
  { "widget": "settings" }, { "widget": "credentials" } ] }
```
Always include `settings` and `credentials` (or let the engine append them) so every setting and credential is visible.

## Name, logo and brand
- **A wrapper of someone else's API keeps that provider's brand.** Name it for the provider (`Stripe`, `Google Maps`, `Telnyx Voice`) and set `branding.provider`. Do not invent a brand for a wrapper.
- **First-party plugins** use a plain descriptive name.
- **Monetized, operated services** (you run the instance or hold the provider accounts) have their own brand and logo, distinct from the software and providers behind them. Credit the underlying software in the about text.
- **Real logos only.** `branding.logo` is an `.svg` or `.png` shipped in the plugin. A provider's logo comes from the provider's brand kit and is used only to identify the integration; record its source in `ui/LOGO.md`. First-party and monetized plugins ship an original mark. Never use an emoji or a generic icon as the brand. `branding.icon` is deprecated and warns.

## Drawer
The card face stays compact: logo, real status, and the two or three primary actions. The host's slide-out drawer carries Settings, Credentials, Usage and Projects (see [distribution](distribution.md)); declare `configuration`, `secrets` and a `status` command and the drawer fills itself. Do not build your own settings or usage screens.

## Brand tokens
```json
"branding": { "color": "#635bff", "accent": "#0a2540", "font": "ibm-plex",
  "density": "compact", "radius": "sm", "header": "ledger-rule" }
```
- `color`, `accent`: `#rrggbb`. The engine derives surfaces and state colors and checks contrast.
- `font`: `system inter ibm-plex space-grotesk jetbrains-mono dm-sans outfit fraunces newsreader chivo-mono`.
- `density`: `compact comfortable spacious`. `radius`: `none sm md lg pill`. `header`: `plain ledger-rule band tab-strip badge-left`.
Choose tokens from the plugin's function and audience, not from a default: a payments ledger reads as compact and exact, a messaging inbox as roomy and conversational, a security monitor as high-contrast and dense.

## Design process for an agent
1. Write down in `ui/DESIGN.md`: who uses the card, the two or three actions they take most, what they need to see without clicking, and the reasons for the template and tokens.
2. Declare `card_layout` and `branding`. Bind every data widget to a real command.
3. Render at 360, 768 and 1280 px wide and look at it. Check light and dark, keyboard focus order, 44 px targets and long values (wrapping, truncation with a title, empty and error states).
4. Compare against other plugins' cards. If it looks like another plugin's, change the template, widget order or tokens.

## Anti-patterns the validator or review rejects
Fixed metrics; sample data; a made-up brand on a wrapper; an emoji or generic icon in place of a logo; decorative canvas or CSS animation; emoji as icons; hardware-skin imitations; raw hex colors in plugin code; one template used for every plugin; hiding settings or credentials; showing a secret value; claiming "connected" without a returned status.
