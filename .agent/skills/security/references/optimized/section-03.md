### The three crown jewels

| Asset | Location | Why it matters |
| --- | --- | --- |
| `secrets.enc` | `<brain>/config/secrets.enc` (a bare `.agent` dir uses `.agent/secrets.enc`) | AES-256-GCM. Every provider key the operator owns. |
| Browser profile | `<brainDir>/browser-profile/` | **Live, logged-in provider sessions.** Bypasses the API keys entirely — a stolen profile is a stolen Stripe/GitHub/cloud console. |
| Memory vault | `<brainDir>/memory-vault/` | Plaintext markdown. Business context, infrastructure, personal history. |

The browser profile is the **highest-value target in the repo** and the one
people forget. It is not a cache. Treat it as credential material.

---

