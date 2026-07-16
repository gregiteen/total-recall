# Cloudflare Webhook Tunnel Setup

To receive webhooks (GitHub, npm, Stripe) securely without exposing your Total Recall node to the public internet, use a Cloudflare Tunnel.

## Prerequisites
- A domain managed by Cloudflare (e.g. `webhooks.totalrecall.dev`)
- `cloudflared` installed on the leader node (`brew install cloudflare/cloudflare/cloudflared` or `apt install cloudflared`)
- Cloudflare account with Tunnel permissions

## Setup Instructions

1. **Login to Cloudflare locally**
   ```bash
   cloudflared tunnel login
   ```
   *Follow the URL to authenticate in your browser.*

2. **Create the Tunnel**
   ```bash
   cloudflared tunnel create total-recall-webhooks
   ```
   *Note the Tunnel ID output from this command.*

3. **Configure the Tunnel**
   Create a `config.yml` (e.g., in `~/.cloudflared/config.yml`):
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /Users/greg/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: webhooks.totalrecall.dev
       service: http://localhost:3100
     - service: http_status:404
   ```

4. **Route the DNS**
   ```bash
   cloudflared tunnel route dns total-recall-webhooks webhooks.totalrecall.dev
   ```

5. **Run the Tunnel**
   ```bash
   cloudflared tunnel run total-recall-webhooks
   ```
   *(Optionally, install it as a service: `cloudflared service install`)*

6. **Verify**
   ```bash
   curl -I https://webhooks.totalrecall.dev/api/health
   ```
   You should see a 200 OK from the Total Recall backend.
