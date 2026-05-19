# How to Deploy on a Cloud VM

- **Plane**: How-To
- **Last Updated**: 2026-05-18
- **Summary**: Step-by-step guide to deploying Total Recall on a cloud VM with a local AI model via Ollama.

---

## Why a Cloud VM?

Total Recall works great locally, but a dedicated VM gives you:

- **Always-on daemon** — Dream Cycle and task scheduler run 24/7 uninterrupted
- **Offloaded compute** — inference doesn't slow down your workstation
- **Accessible from anywhere** — browser dashboard and API from any device

---

## Choosing a Provider

See [Cloud Provider Guide](../reference/cloud-providers.md) for a full breakdown. Quick recommendations:

| Budget | Provider | Cost | Model |
|--------|----------|------|-------|
| Cheapest always-on | **Hetzner CX42** ⭐ | ~€18/mo | gemma4:26b |
| Best value + headroom | **Hetzner AX42** | ~€46/mo | gemma4:26b or 31b |
| Pay-as-you-go GPU | **RunPod RTX 4090** | $0.29/hr | any |
| Easiest setup | **DigitalOcean** | $96-160/mo | gemma4:26b |
| Free (if you can get it) | **Oracle Cloud Free** | $0 | gemma4:e4b |

> **Default model: `gemma4:26b`** — Mixture-of-Experts, 26B total params but only ~4B active. Needs **~16 GB RAM**, not 32 GB.

---

## Step 1: Provision the VM

Use the interactive setup wizard (recommended):

```bash
npx total-recall setup
```

The wizard asks what provider you want, fetches their current pricing, collects your API key (masked — never logged), and provisions the server for you.

---

### Manual Provisioning

**Hetzner** (via hcloud CLI):
```bash
brew install hcloud
hcloud context create total-recall   # paste your API token
hcloud server create \
  --name total-recall-brain \
  --type cx42 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key ~/.ssh/id_ed25519.pub
```

**DigitalOcean** (via API):
```bash
curl -s -X POST "https://api.digitalocean.com/v2/droplets" \
  -H "Authorization: Bearer $DO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "total-recall-brain",
    "region": "nyc3",
    "size": "s-8vcpu-16gb",
    "image": "ubuntu-24-04-x64",
    "ssh_keys": [YOUR_KEY_ID]
  }'
```

**RunPod** (GPU, pay-as-you-go):
1. Go to [runpod.io](https://www.runpod.io) → Secure Cloud → Deploy
2. Pick RTX 4090 (24 GB VRAM, 32 GB RAM)
3. Use `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04` template
4. Enable persistent volume at `/workspace`

---

## Step 2: SSH In and Install Node.js

```bash
ssh root@<your-server-ip>

# Install Node.js 20+ via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
```

---

## Step 3: Deploy

```bash
# With a domain (recommended — Caddy handles HTTPS automatically):
npx total-recall deploy --domain brain.yourdomain.com

# Without a domain (HTTP on port 3000):
npx total-recall deploy
```

**What `deploy` does:**
1. Detects CPU architecture (x86_64 / arm64)
2. Installs [Ollama](https://ollama.com)
3. Pulls the configured model (default: `gemma4:26b` — ~10 GB download)
4. Scaffolds `~/.agent/` vault
5. Configures Caddy for auto-TLS (if `--domain` is set)
6. Installs systemd services for the API server and Dream Daemon

---

## Step 4: Connect Your IDEs

Back on your **local machine**, wire your IDEs to the remote brain:

```bash
# Generate a PAT first (run on the server):
npx total-recall generate-pat
# → prints: sk-tr-xxxxxxxxxxxx

# Then on your local machine:
npx total-recall connect claude-code --brain https://brain.yourdomain.com --token sk-tr-xxxx
npx total-recall connect codex --brain https://brain.yourdomain.com --token sk-tr-xxxx
npx total-recall connect obsidian   # local vault only, no --brain needed
```

For UltraChat, add this in the UltraChat settings:
```
baseURL: https://brain.yourdomain.com/v1
model:   total-recall/gemma4
Authorization: Bearer sk-tr-xxxx
```

---

## Step 5: Verify

```bash
# On the server:
npx total-recall status

# From your local machine:
curl https://brain.yourdomain.com/v1/models \
  -H "Authorization: Bearer sk-tr-xxxx"
```

You should see `total-recall/gemma4` in the models list.

---

## Model Configuration

The model is set in `~/.agent/config/runtime.yml` on the server:

```yaml
runtime: "ollama"
endpoint: "http://127.0.0.1:11434/v1/chat/completions"
model: "gemma4:26b"   # change to gemma4:e4b (6GB) or gemma4:31b (32GB)
temperature: 0.2
```

After changing, restart the daemon: `npx total-recall daemon restart`

---

## Troubleshooting

### Model won't load — out of memory

Check your server RAM: `free -h`

- 8 GB RAM → use `gemma4:e4b`
- 16 GB RAM → use `gemma4:26b` (default)
- 32 GB RAM → use `gemma4:31b`

### Oracle Cloud — "Out of capacity"

Oracle free tier instances are frequently out of stock. Options:
1. **Upgrade to Pay-As-You-Go** — unlocks priority queue; the instance stays free
2. **Use Hetzner instead** — €18/mo, always available, equivalent RAM
3. **Run the sniper script** — `./bin/oci-sniper.sh` pings Oracle every 60 seconds and grabs a slot when one opens. Configure your OCIDs in the script header first (get them from the Oracle "Save as stack" → "Download Terraform config" flow).

### Caddy not serving HTTPS

Make sure port 80 and 443 are open in your firewall, and your domain's DNS A record points to the server IP. Caddy handles certificate issuance automatically once the domain resolves.

### Dashboard loads but chat returns 500

The Ollama service may still be pulling the model. Check: `ollama ps` on the server. The first request after a cold start may take 30-60 seconds while the model loads into RAM.
