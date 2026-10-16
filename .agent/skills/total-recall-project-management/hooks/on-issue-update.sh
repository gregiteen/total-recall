#!/usr/bin/env bash
set -euo pipefail
skills_root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
shared_hook="$skills_root/project-management/hooks/on-issue-update.sh"
if [ ! -f "$shared_hook" ]; then
  echo "Shared project-management hook unavailable; resolve/install the shared package before validation." >&2
  exit 1
fi
bash "$shared_hook" "${1:-docs/projects}"
