#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR/../data"
cd "$PROJECT_DIR" || exit

# Add changes and commit if there are any
git add .
if ! git diff-index --quiet HEAD --; then
    git commit -m "Auto-backup: $(date '+%Y-%m-%d %H:%M:%S')"
    if git push local-backup master; then
        echo "Backup successful: $(date)"
    else
        echo "ERROR: Backup push failed: $(date)" >&2
        if [ -n "$NTFY_URL" ]; then
            curl -s \
              -H "Priority: urgent" \
              -H "Tags: warning,floppy_disk" \
              -H "Title: Annie Backup Failed" \
              -d "Auto-backup git push failed at $(date). Check server." \
              "$NTFY_URL"
        fi
        exit 1
    fi
else
    echo "No changes to backup: $(date)"
fi
