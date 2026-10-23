# Anti-patterns

Every entry below was observed in a real plugin in this ecosystem, with the evidence. They are the failure modes this recipe exists to prevent. Each is a rejection, not a preference.

---

## Fabrication

**Seeded readings.** A card constructor held a literal hostname, uptime, load average and `usedPercent: 99.1`, with the comment `// Retain fallback telemetry`. A host at 99.1% memory is in distress; this was a false alarm, and one machine's hostname shipped to every node.

**Invented API results.** A card's fallback branch fabricated `cs_live_…` session ids, `pi_…` intent ids, a payment URL and a latency of "42ms" when `host.run` was unavailable. That branch was not a degraded mode; it was a mock payment terminal.

**Hard-coded claims.** A header rendered `Stripe API (Live Secret)` and `HMAC-SHA256 Verified` with no command behind either. A merchant with no key and no webhook secret saw an identical card.

**Fixed text where a command belongs.** `card_face.metrics` held literal strings such as `ONLINE`. The validator warns on it; the card must never carry it.

> **Rule.** A value appears only if a command or the host returned it. If a source fails, show the failure and when it was last attempted.

## Reassuring defaults

The single most damaging pattern found.

- A card read `data.worktree.unstaged`, `data.synced` and `data.upstream.status` — **none of which the command returns**. Every value fell through to its default.
- The defaults were `'Up to date'` and `'Synced'`.
- Therefore a repository with **three unpushed commits rendered as "Up to date."**

Related: a missing upstream comparison becoming `unpushedCommits: 0` instead of unknown.

> **Rule.** Unknown renders an em dash with its reason. `0` and `unknown` are different facts, and a reassurance the plugin has not verified is a lie.

## Credential violations

- A scaffolded panel rendered `<input type="password">` for an API key and dispatched `save-token` with the raw value — a second credential store, and a path the key could leak from.
- A card built three separate key-entry screens.
- A plugin's error text told the *application's* users to run a Total Recall command.

> **Rule.** One credential path exists in the whole plugin, and it is `total-recall auth secret`. The card reports present or missing, never renders a value, and never collects one.

## Templates

- Core enforced a closed allowlist of seven layouts, so a bespoke arrangement could not be declared even in principle.
- One engine rendered every card through a shared widget vocabulary. **24 of 34 plugins shared a byte-identical card signature**; Stripe, Domains and Tickets — three unrelated domains — were the same layout.
- 30 plugins shipped a real bespoke `card.js` that the card face never mounted.
- The scaffolder generated a stub panel and an empty `DESIGN.md`, which is the mechanism that produced the uniformity.

> **Rule.** No layout vocabulary anywhere. A face that could be dropped onto another plugin is a failed face.

## Invented brands

| Plugin | Invented wordmark | Real identity |
| --- | --- | --- |
| Stripe wrapper | `PAYFORGE` | Stripe's own |
| git-sentinel | `[BLAME//GAME]` | plain descriptive name |
| system-monitor | `[PULSE//CHECK]` | plain descriptive name |

Two of the three also carried colour values contradicting their own manifest.

> **Rule.** A wrapper of someone else's API keeps that provider's name and brand. A first-party plugin uses a plain descriptive name and its own mark. Never an emoji, never a generic icon.

## Values that break the capability elsewhere

- `const successUrl = "https://example.com/checkout/success"` shipped inside a vendorable plugin. An app scaffolding it would send paying customers to a placeholder domain.
- Defaults of `2000`, `"General Admission Ticket"` and `"usd"` — the author's examples — travelling into every copy.
- A domain default of `clean[1] || 'example.com'`.

> **Rule.** Every environment value is the caller's to supply. No placeholder, no author default, no example value in anything a builder might take.

## Host leaks into a scaffold

- A vendored brick shelled out to the `total-recall` binary for every credential read: with `TOTAL_RECALL_BIN=/nonexistent` it failed with `Auth credential read failed`.
- It shipped `ui/card.js`, whose only data channel is `host.run` — a host that application does not have.
- **19 of 34 plugins** carry this runtime dependency, and every one of them is vendorable.

> **Rule.** A scaffold runs with Total Recall absent. Its tests must fail if it spawns a process.

## Presentation defects only looking reveals

- `.figure[data-tone]` CSS was defined but the tone was never set on the wrapper, so all four accent borders rendered grey. Dead CSS, invisible to a schema check.
- A fleet tile showed a **red border beside a green load figure**: severity combined load and memory, but the tile only displayed load, so a memory-driven critical read as a contradiction.
- A selection outline collided with the severity border, so a critical tile appeared to have a green edge.
- Bars collapsed to slivers after a layout change, because a three-column grid left no room for the track.
- **"USD" appeared twice** — as a suffix in the amount field and on the currency button immediately beside it.
- A long payment URL ran into its copy button at narrow widths.

> **Rule.** Render it, look at it, measure it. A passing schema check is not a design.

## Dark-surface blindness

The dashboard is **dark-only** (`--text-primary: #f1f5f9`, zero `prefers-color-scheme` rules), but cards were authored and verified against a white test page. Light-theme state colours were therefore unreadable in production, including the verdict line.

> **Rule.** Design and verify on the tokens the host actually injects.

## Colour-only severity

Severity conveyed by hue alone, with no word and no value. Indistinguishable under colour blindness and in a screenshot without a legend.

> **Rule.** Every colour is paired with a word.

## Host-derived screens

The host built one screen per CLI subcommand, so every plugin's screens were its command list. That is the template failure at a higher level.

> **Rule.** The plugin defines its screens, ordered by its own tasks, most-used first.

## Stale documentation

A plugin's README described two reporting bugs as unfixed and pointed at a correction tracker. **Both had already been fixed and were verified against hostile input** — a file named `" leading-space.txt"` parses correctly, and a missing upstream yields `null`, not `0`. The stale warning misrepresented a working plugin and sent readers to a dead end.

> **Rule.** Documentation describes the plugin as it is now. A warning that no longer applies is a defect.

## Environments that return confidently wrong data

`cat /proc/meminfo 2>/dev/null | head -4 || vm_stat` **never fell through on macOS**, because `cat missing | head` exits 0. The macOS memory branch was dead code, and the plugin reported a false `100%` where the truth was `58.3%`.

> **Rule.** Test the condition, not the exit status. Verify a computed figure against an independent calculation before trusting it.

## Two definitions of one thing

- **30 of 30 plugin repositories** carried a stale copied `auth` plugin declaring a `yaml` dependency with no `node_modules`, so every secrets and mesh call from a plugin repository crashed.
- The scaffold held real directory copies of the nine default plugins rather than links, so each drifted independently.
- Two skills, `plugin` and `plugins`, described the same thing.

> **Rule.** One definition, referenced everywhere. A second copy is a second source of truth, and it will diverge.
