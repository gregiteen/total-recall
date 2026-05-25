# How to Deploy on a Cloud VM

- **Plan**: How-To
- **Last Updated**: May 25, 2026
- **Summary**: Step-by-step guide to deploying a Total Recall Sovereign Brain on a lightweight cloud VM.

---

## Why a Cloud VM?

Total Recall works great locally, but hosting your brain on a private virtual machine (VM) provides several benefits:

- **Always-on daemon** — The Dream Cycle optimization loop and Priority Task Scheduler run 24/7 uninterrupted.
- **Offloaded compute** — Vector embedding updates and headless CLI agent dispatches run on the VM, keeping your workstation light.
- **Accessible from anywhere** — Conversational terminal REPL logs, session relays, and visual dashboards sync to a single remote brain.

---

## Choosing a Provider

Because Total Recall completely deprecated local GPU/Ollama VM requirements in favor of **Unified Headless CLI Dispatches** and **Google Embeddings APIs**, your server footprint is exceptionally small. 

You **DO NOT** need to rent expensive GPU VM clusters or large-RAM instances. A small, cost-effective server (such as a Hetzner CX22 for €3.79/mo or a DigitalOcean 1GB Droplet for $6.00/mo) is all you need.

See the [Cloud Provider Guide](../reference/cloud-providers.md) for a full breakdown.

---

## Step 1: Provision the VM

1. Log in to your cloud provider (e.g. Hetzner Cloud or DigitalOcean).
2. Create a new virtual server running **Ubuntu 24.04 LTS** (or 22.04 LTS).
3. Choose the standard shared-CPU type (e.g. Hetzner **CX22** or DigitalOcean **Basic $6/mo**).
4. Add your workstation's SSH public key (`~/.ssh/id_ed25519.pub`) for secure access.
5. Complete provisioning to get your server's public IPv4 address.

---

## Step 2: SSH In and Install Node.js

SSH into your server as root:

```bash
ssh root@<your-server-ip>
```

Install **Node.js 20+** using standard Node Version Manager (nvm):

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Install Node.js
nvm install 20
nvm use 20
```

---

## Step 3: Deploy the Brain Server

Total Recall provides a comprehensive `deploy` script to configure the entire server natively from scratch:

```bash
# Deploy with a DNS domain (recommended — Caddy handles SSL certificates natively):
npx total-recall deploy --domain brain.yourdomain.com

# Deploy without a domain (binds HTTP directly on port 3000):
npx total-recall deploy
```

**What `deploy` does on the VM:**
1. **Scaffolds the VFS**: Sets up the consolidated `.agent/skills/total-recall/` data structure.
2. **Configures HTTPS Edge**: Installs Caddy and configures it to reverse proxy incoming SSL traffic to the Express REST server on port 3000.
3. **Installs System Services**: Registers the API server and the Dream Daemon as standard `systemd` user services to auto-start on VM boot.
4. **Validates Environment**: Verifies that standard CLI agent binaries (`antigravity`, `gemini`, `claude`, `codex`) are discoverable.

---

## Step 4: Secure Your API Credentials

All third-party credentials (e.g. `GOOGLE_API_KEY`, `GITHUB_TOKEN`, `OPENAI_API_KEY`) must be configured securely on the server.

Generate your initial master encryption password:

```bash
npx total-recall init
```

The setup wizard will prompt you to enter your credentials securely. They are immediately encrypted using **AES-256-GCM** under `secrets.enc` using OWASP-aligned **scrypt** key derivation. Your plaintext credentials are never logged or written to disk.

---

## Step 5: Connect Your Local Workstation

Once the server is running, generate a Personal Access Token (PAT) on the server to authorize your workstation clients:

```bash
npx total-recall generate-pat
# → prints: tr_xxxxxxxxxxxx
```

Back on your **local workstation**, configure your IDE agents and Relays to sync with your remote sovereign brain:

```bash
# Configure Claude Code CLI
npx total-recall connect claude-code --brain https://brain.yourdomain.com --token tr_xxxx

# Configure Codex CLI
npx total-recall connect codex --brain https://brain.yourdomain.com --token tr_xxxx

# Start the silent background log relay on your workstation
npx total-recall relay --start
```

---

## Step 6: Verify Diagnostics

Check server health from the command-line on your workstation:

```bash
curl -H "Authorization: Bearer tr_xxxx" \
  https://brain.yourdomain.com/health
```

The server will return a clean JSON health summary detailing disk usage, active CLI agents, running daemon status, and VFS exists verification.
