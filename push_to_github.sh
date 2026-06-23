#!/bin/bash
# CommHub → GitHub push script
# Run this once from inside the commhub-repo folder:
#   chmod +x push_to_github.sh && ./push_to_github.sh

set -e
REMOTE="https://github.com/bhaskarm-dotcom/slack.git"

echo "🔧  Setting remote to $REMOTE"
git remote add origin "$REMOTE" 2>/dev/null || git remote set-url origin "$REMOTE"

echo "🌿  Renaming branch to main"
git branch -M main

echo "🚀  Pushing to GitHub…"
git push -u origin main

echo ""
echo "✅  Done! Your code is live at:"
echo "    https://github.com/bhaskarm-dotcom/slack"
