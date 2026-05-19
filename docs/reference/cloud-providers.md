# Cloud Provider Cheat Sheet

- **Plane**: Reference
- **Last Updated**: 2026-05-18
- **Summary**: Pricing, ease-of-use, and recommendation for every major provider that can host a Total Recall brain with Ollama.

> **Default model: `gemma4:26b`** — a Mixture-of-Experts model. "26B" is total params; only ~4B are active at inference. **Needs ~16 GB RAM**, not 32 GB.  
> **Minimum for default setup:** 16 GB RAM, 4+ vCPU, 100 GB disk, persistent SSH access.  
> **Max quality (`gemma4:31b`):** 32 GB RAM (dense model). **Edge (`gemma4:e4b`):** 6 GB RAM.

---

## ⭐ Recommended by Tier

| Tier | Winner | Why |
|------|--------|-----|
| **Cheapest always-on** | Hetzner CX42 | €18/mo, 16 GB RAM — runs gemma4:26b perfectly |
| **Best value + headroom** | Hetzner AX42 | €46/mo, 64 GB RAM, Ryzen 7 — run gemma4:31b |
| **Best GPU (pay as you go)** | RunPod Secure Cloud | ~$0.29/hr RTX 4090, pause when idle |
| **Easiest setup** | DigitalOcean | $160/mo, best API + docs, instant |
| **Free (if you can get it)** | Oracle Cloud Free Tier | 4 OCPU / 24 GB ARM — perpetually out of stock |

---

## VPS / Bare Metal (Best for Ollama — always-on)

These give you a real Linux VM via SSH. `npx total-recall deploy` works out of the box.

### Hetzner ⭐ Best Value
| Instance | vCPU | RAM | Disk | Price/mo | Notes |
|----------|------|-----|------|----------|-------|
| CX32 | 4 | 8 GB | 80 GB | ~€8 | Light (8B models only) |
| CX42 | 8 | 16 GB | 160 GB | ~€18 | Medium (13B models) |
| **CX52** | **16** | **32 GB** | **320 GB** | **~€32** | **Full brain ⭐** |
| CPX62 | 16 ded. | 32 GB | 640 GB | ~€68 | Dedicated CPU |
| **AX42** | **12 ded.** | **64 GB** | **512 GB NVMe** | **~€46** | **Best value overall ⭐** |

- **Setup difficulty**: Medium (SSH + deploy script)
- **API**: Yes — Hetzner Cloud API, full provisioning
- **Docs**: [hetzner.com/cloud](https://www.hetzner.com/cloud)
- **Regions**: EU (Nuremberg, Helsinki, Falkenstein), US (Virginia) — US adds ~10%

### DigitalOcean — Easiest
| Droplet | vCPU | RAM | Disk | Price/mo |
|---------|------|-----|------|----------|
| s-4vcpu-8gb | 4 | 8 GB | 160 GB | $56 |
| s-8vcpu-16gb | 8 | 16 GB | 320 GB | $96 |
| **s-8vcpu-32gb-amd** | **8** | **32 GB** | **640 GB** | **$160** |

- **Setup difficulty**: Easy (best API + docs of any provider)
- **API**: Yes — full REST API, instant provisioning
- **Docs**: [docs.digitalocean.com](https://docs.digitalocean.com)
- **Regions**: NYC, SFO, AMS, SGP, LON, FRA, TOR, BLR, SYD

### Vultr
| Instance | vCPU | RAM | Disk | Price/mo |
|----------|------|-----|------|----------|
| Cloud Compute 32GB | 8 | 32 GB | 640 GB | ~$130 |
| Bare Metal 32GB | 4 | 32 GB | 5 TB | ~$120 |

- **Setup difficulty**: Easy (similar to DO)
- **API**: Yes
- **Docs**: [docs.vultr.com](https://docs.vultr.com)

### Linode / Akamai
| Instance | vCPU | RAM | Disk | Price/mo |
|----------|------|-----|------|----------|
| Dedicated 32GB | 8 | 32 GB | 640 GB | ~$192 |
| Shared 32GB | 6 | 32 GB | 640 GB | ~$96 |

- **Setup difficulty**: Easy
- **API**: Yes
- **Docs**: [techdocs.akamai.com](https://techdocs.akamai.com/cloud-computing/docs)

---

## GPU Cloud (Best for Fast Inference — pay as you go)

Great if you don't want a VM running 24/7. Pause when idle.

### RunPod ⭐
| GPU | VRAM | RAM | Price/hr | ~30-day cost |
|-----|------|-----|----------|-------------|
| RTX 4090 | 24 GB | 32 GB | $0.29 | $210 (always-on) |
| A100 SXM 80GB | 80 GB | 240 GB | $0.79 | $569 |
| **RTX 4090 (Secure)** | **24 GB** | **32 GB** | **$0.29** | **Pause = pay nothing** |

- **Setup difficulty**: Medium (Docker-based, persistent volumes needed for models)
- **Best use**: On-demand inference; pause when you're not using the brain
- **Docs**: [docs.runpod.io](https://docs.runpod.io)

### Vast.ai
- RTX 4090 starts at **$0.27/hr** (marketplace — prices vary by host)
- Less reliable than RunPod (community hosts, variable uptime)
- **Use if**: You want the absolute cheapest GPU and can tolerate occasional host drops

---

## PaaS Platforms (NOT recommended for Ollama)

These are for hosting web services, not persistent ML inference. They have RAM caps, sleep/timeout behaviour, and no persistent GPU access.

| Platform | Max RAM | Price/mo | Verdict |
|----------|---------|----------|---------|
| **Railway** | ~8 GB | usage-based (~$15-40) | ❌ Too little RAM for 13B+ |
| **Render** | ~32 GB | $25–$225+ | ⚠️ Can work for API-only mode |
| **Fly.io** | ~16 GB | ~$99+ (perf machines) | ⚠️ API-only mode only |
| **Google Cloud Run** | **32 GB** | per-request + min instances | ⚠️ Expensive for always-on |
| **AWS App Runner** | 4 GB | per vCPU-sec | ❌ Too little RAM |

**Exception**: If you run Ollama separately (RunPod/Vast.ai) and only deploy the Total Recall API server to Railway/Render/Fly.io, these work fine. The wizard supports this split mode.

---

## AWS EC2 (Powerful but Complex)

| Instance | vCPU | RAM | Price/mo | Notes |
|----------|------|-----|----------|-------|
| m7g.2xlarge | 8 | 32 GB | ~$170 | ARM Graviton3 — best value |
| m8g.2xlarge | 8 | 32 GB | ~$262 | ARM Graviton4 — 30% faster |
| m5.2xlarge | 8 | 32 GB | ~$280 | x86 — most compatible |
| t3.2xlarge | 8 | 32 GB | ~$243 | Burstable — avoid for LLM |

- **Setup difficulty**: Hard (IAM, VPC, security groups, keypairs)
- **Cheapest with Spot**: ~$0.05/hr for m7g.2xlarge Spot (~$36/mo) — but can be interrupted
- **Best for**: Teams already in AWS ecosystem

---

## Free / Hobbyist Options

| Provider | Offer | Catch |
|----------|-------|-------|
| **Oracle Cloud** | 4 OCPU / 24 GB ARM forever free | Almost always out of stock; requires sniper script |
| **Google Cloud** | $300 credit (90 days) | Expires; billing required |
| **AWS** | $300 credit (various) | Expires; 12-month free tier too small for LLMs |
| **Azure** | $200 credit (30 days) | Expires |

---

## Decision Guide

```
Do you want to pay monthly (always-on)?
├── Yes → Budget < €50/mo?
│   ├── Yes → Hetzner CX52 (€32) or AX42 (€46) ⭐
│   └── No  → DigitalOcean (easiest) or AWS m7g (powerful)
│
└── No → Pay only when using?
    └── Yes → RunPod RTX 4090 ($0.29/hr, pause when idle) ⭐

Are you already on AWS/GCP/Azure?
└── Yes → Stay there; use m7g.2xlarge (AWS) or n2-standard-8 (GCP)

Do you only need the API server (Ollama runs elsewhere)?
└── Yes → Railway, Render, or Fly.io work fine for the server
```

---

## API Key Security

Total Recall stores provider API keys encrypted in `~/.agent/config/secrets.enc` using AES-256-GCM. The setup wizard:
1. Prompts for the API key with masked input (no echo to terminal)
2. Encrypts and writes to `secrets.enc` immediately
3. Never logs the key
4. Uses the key only to call the provider API for provisioning

---

*Sources: [Hetzner Cloud](https://www.hetzner.com/cloud) · [DigitalOcean Pricing](https://www.digitalocean.com/pricing) · [RunPod](https://www.runpod.io) · [Vast.ai vs RunPod 2026](https://medium.com/@velinxs/vast-ai-vs-runpod-pricing-in-2026-which-gpu-cloud-is-cheaper-bd4104aa591b) · [AWS EC2 Instances](https://instances.vantage.sh/) · [Best VPS for Ollama 2026](https://1vps.com/best-vps-for-ollama) · [Hetzner AX42](https://www.hetzner.com/dedicated-rootserver/ax42/)*
