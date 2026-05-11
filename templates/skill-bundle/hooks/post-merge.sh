#!/usr/bin/env bash
# Total Recall: Auto-compile memory after a git pull/merge
# Drop this into your .git/hooks/post-merge file

echo "🧠 Total Recall: Upstream changes merged. Compiling new memory surface..."
npx total-recall compile

if [ $? -ne 0 ]; then
  echo "❌ Memory compilation failed. Running conflict check..."
  npx total-recall conflicts
else
  echo "✅ AI rules successfully synchronized to merged state."
fi

exit 0
