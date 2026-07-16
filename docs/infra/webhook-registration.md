# Webhook Registration Guide

To receive webhooks in Total Recall, you must register the endpoint with the corresponding provider.

## Prerequisites
- A publicly accessible endpoint configured via Cloudflare Tunnel (e.g. `https://webhooks.totalrecall.dev/api/webhooks/<provider>`)
- The secret stored in your `secrets.enc` file (or `GITHUB_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET` / `NPM_WEBHOOK_SECRET` env variable)
- Ensure the corresponding VFS config document is present in `.agent/skills/total-recall/memory-vault/system/webhook-configs/`

## GitHub Registration

1. Go to your GitHub repository -> **Settings** -> **Webhooks**.
2. Click **Add webhook**.
3. **Payload URL**: `https://webhooks.totalrecall.dev/api/webhooks/github`
4. **Content type**: `application/json`
5. **Secret**: Enter your GitHub webhook secret.
6. **Which events**: Select **Let me select individual events**, and choose **Pushes** and **Releases**.
7. Ensure **Active** is checked.
8. Click **Add webhook**.

## npm Registration

Note: npm requires the CLI to add webhooks.

1. Obtain an npm access token and ensure it's in your environment or `secrets.enc`.
2. Run the npm webhook add command:
   ```bash
   npm hook add <package-name> https://webhooks.totalrecall.dev/api/webhooks/npm <your-npm-webhook-secret>
   ```
3. Test by publishing a new version of the package.

## Stripe Registration

1. Go to your Stripe Dashboard -> **Developers** -> **Webhooks**.
2. Click **Add endpoint**.
3. **Endpoint URL**: `https://webhooks.totalrecall.dev/api/webhooks/stripe`
4. **Events to send**: Select the events you want to track.
5. Click **Add endpoint**.
6. Reveal the **Signing secret** and store it as `STRIPE_WEBHOOK_SECRET`.
