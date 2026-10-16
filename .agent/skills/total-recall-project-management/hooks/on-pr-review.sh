#!/usr/bin/env bash
set -euo pipefail
overlay_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
bash "$overlay_root/hooks/on-issue-update.sh" "${1:-docs/projects}"
echo "Total Recall local documentation prerequisites checked; no remote PR approval implied."
