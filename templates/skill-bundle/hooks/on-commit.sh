#!/usr/bin/env bash
# Total Recall: Auto-compile memory before commit
# Drop this logic into your .git/hooks/pre-commit file

echo "🧠 Total Recall: Compiling latest memory surface..."
npx total-recall compile

if [ $? -ne 0 ]; then
  echo "❌ Memory compilation failed. Check for syntax errors in your vault."
  exit 1
fi

# Dynamically fetch the instructions file target from the config
INSTRUCTIONS_FILE=$(node --input-type=module -e "import('./totalrecall.config.mjs').then(m => console.log(m.default.systemPromptFile || 'INSTRUCTIONS.md')).catch(() => console.log('INSTRUCTIONS.md'))" 2>/dev/null | tail -1)

# Add the compiled instructions back to the commit
if [ -n "$INSTRUCTIONS_FILE" ] && [ -f "$INSTRUCTIONS_FILE" ]; then
  git add "$INSTRUCTIONS_FILE"
fi

exit 0
