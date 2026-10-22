# PLUGIN_UI_OVERHAUL — Comprehensive 34-Plugin Audit & System Architecture

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## 1. System Failure Analysis: Why the UI Was Broken

1. **Card Engine Stripped Identity**:
   [`CardEngine.tsx`](file:///Users/gregoryiteen/github/total-recall/frontend/src/components/plugins/card/CardEngine.tsx#L101-L106) evaluated `const owned = pluginElements(plugin).some(...)`. When `owned` was true, it hid the standardized top `<Header>` and stripped container borders (`border: 0; background: transparent; padding: 0`). Plugins whose embedded custom element in `ui/card.js` did not manually draw a header were rendered completely nameless in the UI grid.
2. **No Separation Between Workspace and Store**:
   The Web UI (`PluginsPage.tsx`) dumped all 34 discovered plugins onto the active workspace grid simultaneously. Unowned, inactive, or optional plugins were rendered as full cards, flooding the screen with clutter.
3. **Absence of Easy Plugin Creation**:
   Users had no intuitive interface to scaffold their own plugins in the UI, toggle between private usage and store publishing, or configure domain actions visually.
4. **Gimmicks and Fake Hardware Skins (`[anti-patterns-ec0c0d95]`)**:
   Plugins contained fake equalizers, `"skin": "winamp-classic"`, and non-functional canvas animations violating the platform rule for authentic domain tooling.

---

## 2. Core Architectural Solution

### A. Two Distinct UI Spaces
1. **"My Cards" (User-Owned Workspace Cards)**:
   - Only plugins explicitly installed, vendored, or activated by the user render as full operational cards in the active workspace.
   - Every single card is guaranteed a uniform, commercial-grade header with its Brand Icon, Official Name, Version Tag, Semantic Status Pill (`● Active` / `○ Inactive`), and Drawer trigger.
   - Every card provides high-density, real domain telemetry and touch-first (>=44px) operational buttons.
2. **"Plugin Store" (Marketplace & Catalog)**:
   - Unowned, available, bundled, and mesh-shared plugins reside in the Store.
   - Displayed as clean store listings: Name, Version, Author, License Tier, Description, Use Cases, Interactive Preview Modal, and a 1-click **"Install / Add to Workspace"** action.
   - Unowned plugins never clutter the active dashboard.

### B. User Plugin Creator ("Create Plugin")
An easy, high-speed scaffolding flow accessible directly in the UI:
- **Metadata**: Name, ID, Description, Category.
- **Template Selector**: `Dashboard`, `Workbench`, `Vault`, `Monitor`, `Ledger`, `Console`, or `Inbox`.
- **Identity**: Accent color, font token, and vector mark.
- **CLI Verbs & Secrets**: Define custom subcommands and required API keys.
- **Privacy & Distribution Selector**:
  - **Use Privately (Default)**: Scaffolds the plugin directly into the project's local workspace or global brain; never shared or published.
  - **Publish to Store**: Automatically validates manifest, calculates SHA-256 integrity hash, locks the version, and deploys it to the Plugin Store.

---

## 3. The 34-Plugin Domain & Functionality Catalog

| # | Plugin ID | Official Name | Domain & Purpose | Live Telemetry Deck | Primary Operational Actions |
|---|-----------|---------------|------------------|---------------------|-----------------------------|
| 1 | `auth` | Auth & Secrets | Hardware FIDO2 passkeys, WebAuthn biometric credentials, Google OAuth, session secrets | Active sessions count, registered passkeys, Google OAuth state, password configuration | `[FIDO2 Passkeys]`, `[Active Sessions]`, `[Google OAuth]`, `[Audit Secrets]` |
| 2 | `cli-agents` | Command Fleet | Multi-agent CLI coding harnesses (Claude, Cursor, Codex, OpenClaw, Hermes, Agy) | Detected local agent binaries, node routing targets, adapter contracts | `[Inspect Local]`, `[Mesh Targets]`, `[Adapter Catalog]`, `[Docs Freshness]` |
| 3 | `code-quality` | Code Quality Gates | Fail-closed deterministic code-quality gates, linter rules, test snapshots | Passing/failing gate matrix, latest snapshot hash, lint violation count | `[Run Gate Check]`, `[Latest Report]`, `[Snapshot Hash]`, `[Detect Rules]` |
| 4 | `composable-cli` | Composable CLI | Dynamic CLI pipeline composition, macro workflows, command versioning | Registered composed verbs count, global vs project scope, execution count | `[Command Library]`, `[Test Pipeline]`, `[Run History]`, `[Rollback]` |
| 5 | `creative-search` | Metasearch | Privacy metasearch, multi-category scraping, deep research synthesis | SearXNG instance health (HTTP 200), engine response latency, active categories | **Inline Search Query Bar**, `[General]`, `[Science]`, `[Deep Research]` |
| 6 | `decision` | Decisions | Typed logical decision evaluation (choice, binary, rank) with confidence | Registered decision sets, evaluation log count, average confidence scores | `[Evaluate Logic]`, `[Decision Sets]`, `[Audit Log]`, `[Test Suite]` |
| 7 | `deploy` | Zero-Downtime Deploy | Multi-provider traffic switching, blue/green staging slots, rollback engine | Active serving slot (Blue/Green), staged slot health probe, version hash | `[Stage Version]`, `[Switch Traffic]`, `[Rollback]`, `[Health Probe]` |
| 8 | `design` | Design System Engine | Canonical DESIGN.md token inspection, CSS variables compilation, Tailwind presets | Parsed token count (Colors, Typography, Spacing, Elevation) | `[Inspect Tokens]`, `[Generate CSS]`, `[Export Tailwind]`, `[Audit Contrast]` |
| 9 | `domains` | Holy MX DNS | Unified Vercel DNS management, MX/DKIM alignment, certificate lifecycle | Managed zones count, SSL certificate validity, DNS propagation health | `[List Domains]`, `[DNS Records]`, `[Verify SSL]`, **Domain Search Bar** |
| 10 | `dsh` | DeepSeek Harness | Assistant runtime orchestration, tool definitions, session telemetry | Runtime status (Active/Standby), connected harnesses, available tool definitions | `[Runtime Status]`, `[Inspect Tools]`, `[Session Logs]`, `[Tool Latency]` |
| 11 | `embeddings` | Local Embeddings | Local ONNX/Ollama embedding models, vector dimensions, coverage audits | Loaded model name & dimension, memory vault vector coverage percentage | `[Model Status]`, `[Pull Model]`, `[Benchmark]`, `[Vector Coverage]` |
| 12 | `git-sentinel` | Git Sentinel | Worktree hygiene, unpushed commit audits, branch divergence, dirty tree checks | Unpushed commits counter, modified files count, active branch name | `[Worktree Audit]`, `[Dirty Diffs]`, `[Branch Sync]`, `[Hygiene Report]` |
| 13 | `hermes` | Hermes Agent | Autonomous background agent supervisor, tool permissions, skill routing | Hermes daemon status, active task dispatch count, gateway connection state | `[Gateway Status]`, `[Dispatch Task]`, `[Inspect Skills]`, `[Supervise Logs]` |
| 14 | `image-generator` | Visual Studio | Commercial branding imagery, vector graphics, marketing hero visual generation | Local GPU / remote provider readiness, generated asset cache count | **Inline Prompt Input Bar**, `[Brand Vector]`, `[Product Shot]`, `[Render]` |
| 15 | `maps` | Location & Maps Engine | Geocoding, reverse geocoding, transit routing, place discovery | Geocoding provider status, cached coordinate lookups, API quota gauge | **Address Input Bar**, `[Geocode]`, `[Calculate Route]`, `[Reverse Lookup]` |
| 16 | `marketing` | Brand Vision & Copy | Brand vision compliance linter, SEO/OG tag audits, prohibited term detection | Copy compliance score (0-100%), prohibited terms, trailing prepositions count | `[Lint Brand Copy]`, `[SEO Tag Audit]`, `[Brand Guide]`, `[Verify Links]` |
| 17 | `mesh` | Tailscale Mesh Network | Control-server mesh administration, Tailscale SSH, peer access policies | Enrolled mesh nodes counter (Cloud, Mini, MacBook, Mobile), leader identity | `[Node Topology]`, `[Ping Peer]`, `[Mesh Doctor]`, `[Preauth Key]` |
| 18 | `okf` | Open Knowledge Framework | OKF portable knowledge schema validation, JSON-LD compatibility | Registered schemas count, validation pass/fail rate, ontology entities | `[Validate Schemas]`, `[Schema Catalog]`, `[Compatibility Probe]` |
| 19 | `openclaw` | OpenClaw Gateway | Multi-channel gateway, skill mounting, session synchronization | Gateway socket state, active channels (Discord, Slack, Web), mounted skills | `[Gateway Status]`, `[Sync Channels]`, `[Skill Registry]`, `[Restart Gateway]` |
| 20 | `openwiki` | OpenWiki Knowledge Hub | Multi-repo knowledge graph, documentation hub ingestion, entity search | Indexed hubs count, total ingested markdown documents, last sync timestamp | `[Explore Hubs]`, `[Ingest Hub]`, `[Wiki Search]`, `[Probe Graph]` |
| 21 | `operator-alerts` | Operator Alerts | Multi-channel operator alerting (Desktop Notification, Audio, Webhook, SMS) | Configured alert channels, dispatch rate limits, recent alert history | `[Send Test Alert]`, `[Channel Health]`, `[Alert History]`, `[Mute / Quiet]` |
| 22 | `phone` | Autodialer Telephony | Direct line inventory, SIP sessions, voicemail inbox, call recordings | Active numbers count, SIP trunk registration state, call queue status | **Phone Dialer Deck**, `[Line Inventory]`, `[Recent Calls]`, `[Voicemails]` |
| 23 | `phone-companion` | Gro CRM Companion | Mobile companion pairing, QR code authorization, remote notifications | Paired devices count, mobile push readiness, last active device ping | **Pairing QR Code Container**, `[Device Inventory]`, `[Send Test Push]` |
| 24 | `security` | Machine Security Scanner | Host security audits, OS compliance (macOS/Linux), open ports, firewall | Machine hardening score (0-100%), open ports count, FileVault/SIP state | `[Audit Host]`, `[Port Scan]`, `[Fleet Security]`, `[Harden Machine]` |
| 25 | `signing` | Digital Agreement Signing | Digital agreement workflow, cryptographic signatures, PDF generation | Pending signatures count, executed agreements count, verification key | `[Agreements List]`, `[Verify Signature]`, `[Account Status]`, `[Issue Envelope]` |
| 26 | `skill-manager` | Skill Manager | Conservative skill optimization, reference compression, token reduction | Installed skills count, token savings percentage, optimized reference count | `[Audit Skills]`, `[Optimize Skill]`, `[Skill Routing]`, `[Restore Original]` |
| 27 | `sticker-generator` | Sticker Studio | High-quality vector sticker generation, upscaling, print-ready CMYK export | Generated sticker catalog count, upscaler backend status, print quotes | **Prompt Input Bar**, `[Generate Sticker]`, `[Upscale 4x]`, `[Order Quote]` |
| 28 | `stripe` | Stripe Payments | Payment processing, checkout sessions, customer billing, refunds | Mode indicator (Test/Live), successful payments count, webhook status | `[Create Checkout]`, `[Recent Payments]`, `[Webhook Health]`, `[Refund]` |
| 29 | `system-monitor` | System Monitor | Host resource telemetry, CPU load, RAM allocation, disk capacity | Real CPU Load %, RAM Used/Total GB, Disk Free GB, Event loop lag | **Live SVG Load Sparkline**, `[Refresh Metrics]`, `[Top Processes]`, `[Flush]` |
| 30 | `text` | Direct Messaging (SMS) | Direct SMS/MMS messaging, number pooling, message threads | Active number pool count, unread message threads count, delivery success rate | **Quick SMS Dispatcher**, `[Active Threads]`, `[Number Pool]` |
| 31 | `tickets` | Velvet Rope Admissions | Box office ticket tiers, double-entry reservations, QR admission scanning | Tier inventory (General, VIP, Backstage), sold count vs capacity, held seats | `[Tier Inventory]`, `[Scan QR Pass]`, `[Issue Ticket]`, `[Hold Capacity]` |
| 32 | `tr-transcribe` | Acoustic Transcription | Speech-to-text transcription, word-level timestamps, speaker diarization | Transcription backend state (Local Whisper / Remote), audio queue count | **Audio File Drop Zone**, `[Transcribe Audio]`, `[Model Status]`, `[Export SRT]` |
| 33 | `translator` | BabelStone Multilingual | Multilingual translation pipeline, locale dictionary scanning | Supported locales count, untranslated keys count, translation cache state | **Source & Target Translation Workbench**, `[Translate Now]`, `[Scan Locales]` |
| 34 | `user-automations` | Scheduled Tasks | Mesh-wide scheduled tasks inventory, cron triggers, worker logs | Installed scheduled tasks count across mesh, next upcoming job timer | **Cron Timetable Deck**, `[List Tasks]`, `[Run Now]`, `[Node Placements]` |
