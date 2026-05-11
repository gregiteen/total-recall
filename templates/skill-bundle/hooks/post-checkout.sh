#!/usr/bin/env bash
# Total Recall: Auto-compile memory on branch switch
# Drop this into your .git/hooks/post-checkout file

# Skip if checking out a file (not a branch)
if [ "$3" == "0" ]; then
  exit 0
fi

echo "🧠 Total Recall: Branch switched. Recompiling memory surface for current branch context..."
npx total-recall compile

if [ $? -ne 0 ]; then
  echo "⚠️  Memory compilation failed on checkout. Your AI rules may be out of sync."
else
  echo "✅ AI rules successfully synchronized to branch state."
fi

exit 0
