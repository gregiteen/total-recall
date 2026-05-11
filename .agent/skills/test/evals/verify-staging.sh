#!/bin/bash
# Evaluator: verify-staging.sh
# Purpose: Ensures the Staging server is reachable and healthy before testing.

TARGET="https://staging.ultrachat.ai"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET")

if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ PASS: Staging server is healthy (HTTP 200)."
    exit 0
else
    echo "❌ FAIL: Staging server returned HTTP $HTTP_CODE."
    echo "Cannot execute Tier 2 or Tier 3 tests. Ensure the deploy-watcher-staging.sh is running."
    exit 1
fi
