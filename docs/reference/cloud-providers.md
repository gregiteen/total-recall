# Total Recall — Cloud Provider Guide

Comprehensive pricing, VM sizing, and deployment recommendations for hosting a **Total Recall Sovereign Brain**.

---

## ⚡ 1. Sizing Your Server (The Lean Architecture)

Because Total Recall completely deprecated local GPU/Ollama hardware overhead in favor of **Unified Headless CLI Dispatches** and **Google Embeddings APIs**, the brain's server footprint is exceptionally small. 

You **DO NOT** need to rent expensive GPU VM clusters or large-RAM instances. The server only hosts a lightweight Express REST API, a Caddy reverse proxy, and a Vite-compiled React Single Page Application (SPA).

### Recommended Specifications:

| Requirement | Minimum | Recommended | Why |
| :--- | :--- | :--- | :--- |
| **CPU** | 1 vCPU (x86 or ARM) | 2 vCPU | Basic HTTP request routing. |
| **RAM** | 1 GB RAM | 2 GB RAM | Fits Node Express daemon + Caddy cleanly. |
| **Storage** | 10 GB Disk (SSD) | 40 GB Disk | Enough for sessions, shims, and logs. |
| **Outbound IP** | Public IPv4 / SSH | Public IPv4 + Domain | Required for secure HTTPS TLS and Relays. |

---

## ⭐ 2. Recommended Cloud Instances

### Hetzner ⭐ Best Value Overall

Hetzner is the absolute winner for always-on sovereign servers, providing blistering speeds and premium network routing at hobbyist prices:

| Instance | vCPU | RAM | SSD Disk | Price/mo | Suitability |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CX22** | **2** | **4 GB** | **40 GB** | **~€3.79** | **Perfect default setup ⭐** |
| CX32 | 4 | 8 GB | 80 GB | ~€7.79 | Overkill (great for hosting extra tools) |

- **Setup Ease**: High. Standard Ubuntu VM with SSH access.
- **Regions**: Falkenstein (EU), Nuremberg (EU), Helsinki (EU), Ashburn (US).

---

### DigitalOcean — Easiest Provisioning

Excellent provisioning API, developer-friendly interface, and rich CLI tooling:

| Droplet | vCPU | RAM | SSD Disk | Price/mo | Suitability |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Basic** | **1** | **512 MB** | **10 GB** | **$4.00** | **Ultra-budget setup** |
| **Basic (Regular)** | **1** | **1 GB** | **25 GB** | **$6.00** | **Standard setup ⭐** |
| Basic (Premium) | 2 | 2 GB | 50 GB | $18.00 | Overkill |

- **Setup Ease**: High. Extremely simple VM spawning and instant setup.

---

### PaaS Platforms (Railway, Render, Fly.io)

Total Recall is **fully compatible** with Platform-as-a-Service (PaaS) providers. Since everything resides in Node.js, you can host the brain server easily:

- **Railway / Render**: Deploy the Node daemon with zero-configuration setup, mount a persistent volume directory (mapped to `.agent/skills/total-recall/`) for VFS memories, and bind Caddy configurations.
- **Fly.io**: Launch lightweight Docker instances globally close to your workstation, utilising a small persistent disk.

---

## 🔒 3. Credentials & Keys Security

All third-party API developer keys (e.g. `GOOGLE_API_KEY`, `GITHUB_TOKEN`, `OPENAI_API_KEY`) are entered via masked terminal inputs during wizard setups. 

The server encrypts these immediately using **AES-256-GCM** under the owner-exclusive `secrets.enc` binary folder using OWASP-aligned scrypt key derivation. Plaintext credentials are **never logged** and **never written to disk in plain text**.
