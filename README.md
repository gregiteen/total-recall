# Total Recall — VibeBrain

> **The Vibe Coding Brain & Autonomous Software Factory**  
> *Your AI Daily Driver: Memory, Rules, Secrets, and 33 Visual Plugins — Automatically Managed Across All Your Devices.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Cost Embeddings](https://img.shields.io/badge/Embeddings-Zero--Cost%20Ollama-emerald.svg)](#zero-cost-local-intelligence)
[![Visual Plugins](https://img.shields.io/badge/Visual%20Plugins-33%20Installed-violet.svg)](#installed-plugins--capabilities)
[![Spec: SSSS 0.9](https://img.shields.io/badge/Spec-SSSS%200.9-amber.svg)](docs/SSSS.md)

---

## ⚡ Why Total Recall?

Modern software development with AI agents requires more than fragmented chat sessions or fragile prompt snippets. Developers need an integrated environment that remembers project rules, safeguards credentials, and scales from local prototype to autonomous multi-node production.

Total Recall delivers two synchronized engines in one unified system:

1. **The Personal Daily Driver**: A persistent memory layer, secret vault, and semantic CLI across every editor, terminal, and enrolled device.
2. **The Autonomous Software Factory**: A modular scaffolding system that constructs production applications from battle-tested plugin bricks (`total-recall new <app> --with <bricks>`) with deterministic quality gates.

---

## 🚀 Quickstart (Under 60 Seconds)

### 1. Install Total Recall
```bash
npm install -g total-recall-brain
```

### 2. Initialize Your Project Brain
```bash
npx total-recall init --project
```

### 3. Record Facts, Preferences, and Invariants
```bash
# Store project facts and guidelines
npx total-recall remember preference "Prefer clear, short answers and functional TypeScript code."
npx total-recall remember invariant "Databases are disposable projections; never back up raw SQL."

# Hybrid vector and keyword recall (zero token cost via local Ollama)
npx total-recall recall "database backup policy" --local
```

### 4. Semantic CLI Discovery
Query over 415 built-in verbs, plugin operations, and composed commands using natural language:
```bash
# Ask questions in natural language
npx total-recall help "how do I buy a domain and configure DNS"
npx total-recall help "check test code quality"
npx total-recall help "rotate production credentials"
```

### 5. Generate Task Rule Capsules
Before executing tasks, compile verified instructions that fit your model's exact token budget:
```bash
npx total-recall context "Configure production DNS and payment webhooks" --action publish,network
```

---

## 🏗️ The Software Factory: Owned Modular Bricks

Never start an application from empty directories again. Total Recall plugins are **vendorable bricks**: when you scaffold a project, the plugin implementation vendors directly into your repository, giving your team full code ownership.

```bash
# Scaffold an entire production application with pre-wired capabilities
npx total-recall new my-saas-app --with auth,domains,stripe,marketing,code-quality
```

### Shipped Bricks Include:
- **`auth`**: Hardware WebAuthn biometric FIDO2 passkeys, OAuth session management, and AES-256 encrypted credential vaults.
- **`domains`**: Unified registrar purchasing, DNS table synchronization, Mailcow mailboxes, and SPF/DKIM verification.
- **`stripe`**: Checkout sessions, automated payment intents, webhook signing verification, and refunds.
- **`marketing`**: SSSS brand vision profiles, fail-closed copy compliance linters, social card auditors, and UTM link attribution.
- **`code-quality`**: Deterministic test compliance gates, fail-closed linting, and coverage snapshots.
- **`mesh`**: Tailscale-based encrypted peer-to-peer device mesh, remote execution, and node presence monitoring.

---

## 🧠 Zero-Cost Local Intelligence

Total Recall prioritizes local-first intelligence. While legacy tools impose per-query token fees, Total Recall pairs with local and mesh Ollama instances to deliver fast vector embeddings at zero cost:

- **Model**: `nomic-embed-text:latest` (768 dimensions)
- **Local Endpoint**: `http://127.0.0.1:11434` (falls back to mesh cloud nodes)
- **Content-Hash Incremental Rebuilds**: Skips unchanged vault nodes during surface compilation
- **Fail-Closed Fallback**: Seamlessly falls back to local keyword token matching when offline

```bash
# Rebuild surfaces and vector indices
npx total-recall compile

# Inspect vector model coverage and benchmarks
npx total-recall embeddings status
```

---

## 👥 Personas & Workflows

### 🎨 For Makers
- **Problem**: Context windows reset constantly, losing instructions and design preferences.
- **Solution**: Total Recall automatically injects relevant memory, design tokens, and image generation studio tools into any client.

### 🛠️ For Builders
- **Problem**: Wiring authentication, DNS records, and quality gates from scratch drains engineering momentum.
- **Solution**: Vendor pre-built, tested plugin bricks with `total-recall new` and maintain deterministic CI gates locally.

### 🏢 For Founders
- **Problem**: Managing scattered API keys and multi-server fleet deployments creates operational risk.
- **Solution**: Encrypt all secrets in local AES-256 stores (`total-recall auth secret`) and coordinate multi-node execution over the secure mesh network.

### 📈 For Sellers
- **Problem**: Coordinating direct line telephony, customer messaging, and ticket inventory requires multiple disconnected services.
- **Solution**: Run integrated phone dialers, SMS pooling, and tiered ticket reservations directly from your terminal.

---

## 🔌 Visual Plugin Ecosystem (33 Installed Plugins)

Total Recall plugins feature bespoke animated interfaces with zero simulated state, touch-first ergonomics, and live operational controls:

| Plugin | Namespace | Role |
| :--- | :--- | :--- |
| **Auth** | `auth` | Biometric WebAuthn passkeys, OAuth sessions, and AES-256 secrets |
| **Marketing** | `marketing` | Brand vision, copy compliance linter, SEO auditor, and campaign UTMs |
| **Domains** | `domains` | Domain purchases, DNS records, Mailcow mailboxes, and SPF/DKIM alignment |
| **Stripe** | `stripe` | Payment processing, checkout sessions, and webhook signature verification |
| **Code Quality** | `code-quality` | Fail-closed deterministic code gates and test reports |
| **Embeddings** | `embeddings` | Local zero-cost embedding model management and benchmarks |
| **Mesh** | `mesh` | Encrypted Tailscale control server, remote execution, and node presence |
| **Hermes** | `hermes` | Hermes Agent runtime supervision and messaging gateway |
| **CLI Agents** | `cli-agents` | Authenticated terminal coding agent orchestration and documentation |
| **OpenWiki** | `openwiki` | Multi-repository documentation graph and knowledge ingestion |
| **Phone** | `phone` | Direct telephony dialer, call session control, and inventory |
| **Text** | `text` | Direct SMS/MMS messaging, number pooling, and message threads |
| **Tickets** | `tickets` | Tiered ticket types, reservations, and double-entry ledger audits |
| **Security** | `security` | Machine security scanning, OS hardening, and credential audits |
| **Decision** | `decision` | Typed SSSS decision sets with confidence rankings and event logging |
| **Design** | `design` | Design system synthesis, theme tokens, and CSS variable generation |

---

## 💻 Composable CLI Architecture

Total Recall eliminates script sprawl through its dynamic composable CLI engine. Compose reusable multi-step workflows with full version history and rollback capabilities:

```bash
# Run configured repository quality gates
npx total-recall code-quality-check

# Inspect latest gate report
npx total-recall code-quality-report
```

---

## 🛠️ Development & Quality Gates

Total Recall source code enforces strict deterministic quality checks:

```bash
# Run unit and integration tests
npm test

# Verify npm package distribution inventory
npm run check:package

# Verify SSSS specification schema registry lock
npm run check:ssss-registry

# Verify scaffold plugin synchronization
node scripts/sync-scaffold-plugins.mjs --check
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for full details.
