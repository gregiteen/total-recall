# DigitalOcean Production Architecture

UltraChat deploys to a DigitalOcean droplet (IP: `138.197.199.217`) using Docker Compose and PM2 cluster mode.

## Components
- **Frontend**: Nginx serving Vite Dist build (`ultrachat-frontend-1`)
- **API**: Node/Express via PM2 (`ultrachat-api-1`)
- **Cache**: Redis (`ultrachat-redis-1`)
- **Email**: Mailcow (18 Docker containers)
- **Voice**: Voice Gateway (`ultrachat-voice-1`)

## Deployment Strategy
- **Frontend changes**: Pushing to the `production` branch triggers an automated cron watcher on the droplet that rebuilds the frontend with zero downtime.
- **API changes**: We execute `pm2 reload` inside the API container to gracefully reload the worker processes without dropping active requests. Use the `api-deploy-zero-downtime.sh` script.

## SSH Verification
Verify the health of the droplet post-deployment:
```bash
ssh -o StrictHostKeyChecking=no root@138.197.199.217 "tail -5 /root/auto-deploy.log && docker compose -f /root/ultrachat/docker-compose.yml ps api frontend"
```
