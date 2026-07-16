#!/bin/bash
# .agent/skills/push/scripts/api-deploy-zero-downtime.sh
# Idempotent ZERO DOWNTIME API deploy

ssh -o StrictHostKeyChecking=no root@138.197.199.217 << 'EOF'
cd /root/ultrachat
git fetch origin production
git reset --hard origin/production
API_CONTAINER=$(docker compose ps -q api | head -1)
docker cp server/. ${API_CONTAINER}:/app/server/
docker exec -u node ${API_CONTAINER} pm2 reload ultrachat-api --wait-ready --listen-timeout 15000
EOF
