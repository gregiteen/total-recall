#!/bin/bash

# Refactor Audit Script
# Finds files over 1000 lines and classifies them:
#   ✅ CANDIDATE  — complex files worth splitting
#   ⏭️  SKIP       — route files, tests, catalogs, migrations (never split these)

MIN_LINES=1000
SEARCH_DIRS=("src" "server")

echo "🔍 Auditing for files with more than $MIN_LINES lines..."
echo "========================================================"

CANDIDATES=()
SKIPS=()

classify_file() {
  local file="$1"
  local lines="$2"

  # Never-split patterns
  if [[ "$file" == *"/routes/"* && "$file" == *.ts && "$file" != *.test.ts ]]; then
    echo "SKIP:route-handler:$lines:$file"
    return
  fi
  if [[ "$file" == *.test.ts || "$file" == *.spec.ts || "$file" == *.test.tsx || "$file" == *.spec.tsx ]]; then
    echo "SKIP:test-file:$lines:$file"
    return
  fi
  if [[ "$file" == *"/migrations/"* ]]; then
    echo "SKIP:migration:$lines:$file"
    return
  fi
  if [[ "$file" == *"catalog.ts" || "$file" == *"catalog.tsx" || "$file" == *"config.ts" ]]; then
    echo "SKIP:catalog-or-config:$lines:$file"
    return
  fi
  # Check if already modular (has sibling imports suggesting prior refactor)
  if grep -q "Refactored to use:" "$file" 2>/dev/null; then
    echo "SKIP:already-modular:$lines:$file"
    return
  fi

  echo "CANDIDATE:$lines:$file"
}

# Collect all results
all_results=()
for dir in "${SEARCH_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    while IFS= read -r file; do
      lines=$(wc -l < "$file")
      if [ "$lines" -gt "$MIN_LINES" ]; then
        all_results+=("$(classify_file "$file" "$lines")")
      fi
    done < <(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) \
      -not -path "*/node_modules/*" \
      -not -path "*/dist/*" \
      -not -path "*/.git/*")
  fi
done

# Print CANDIDATES first
echo ""
echo "✅ REFACTOR CANDIDATES (complex files — good split targets):"
echo "------------------------------------------------------------"
found_candidates=0
for result in "${all_results[@]}"; do
  if [[ "$result" == CANDIDATE:* ]]; then
    IFS=':' read -r _ lines file <<< "$result"
    printf "  %6s lines  %s\n" "$lines" "$file"
    found_candidates=1
  fi
done
if [ "$found_candidates" -eq 0 ]; then
  echo "  (none — all large files are already appropriately structured)"
fi

# Print SKIPS grouped by reason
echo ""
echo "⏭️  SKIP — DO NOT SPLIT (route handlers, tests, catalogs, already modular):"
echo "----------------------------------------------------------------------------"
for result in "${all_results[@]}"; do
  if [[ "$result" == SKIP:* ]]; then
    IFS=':' read -r _ reason lines file <<< "$result"
    printf "  %6s lines  %-20s %s\n" "$lines" "[$reason]" "$file"
  fi
done

echo ""
echo "========================================================"
echo "✅ Audit complete. Tackle CANDIDATES only — ask user which one first."
