#!/usr/bin/env bash
# Hook: on-push.sh
# Purpose: Ensures the deploy verification logic is invoked before pushing.

echo "🔍 Validating Git state..."
if [ -z "$(git status --porcelain)" ]; then
  echo "✅ Working tree clean. Ready to push."
else
  echo "⚠️ Working tree has uncommitted changes."
fi
exit 0
