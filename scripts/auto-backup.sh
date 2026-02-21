#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR/../data"
cd "$PROJECT_DIR" || exit

# Add changes and commit if there are any
git add .
if ! git diff-index --quiet HEAD --; then
    git commit -m "Auto-backup: $(date '+%Y-%m-%d %H:%M:%S')"
    git push local-backup master
    echo "Backup successful: $(date)"
else
    echo "No changes to backup: $(date)"
fi
