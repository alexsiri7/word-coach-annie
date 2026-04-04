#!/bin/bash
# Minimal CLI agent that uses Requesty.ai OpenAI-compatible API
# Usage: requesty-agent.sh [-m model] [-p prompt]
#
# As interactive agent: reads from stdin, sends to API, prints response
# With -p: one-shot mode

set -euo pipefail

MODEL="${REQUESTY_MODEL:-google/gemini-2.0-flash-001}"
API_KEY="${REQUESTY_API_KEY:-}"
API_URL="https://router.requesty.ai/v1/chat/completions"

if [ -z "$API_KEY" ] && [ -f "$(dirname "$0")/../.env" ]; then
  source "$(dirname "$0")/../.env"
fi

if [ -z "$API_KEY" ]; then
  echo "Error: REQUESTY_API_KEY not set" >&2
  exit 1
fi

# Parse args
PROMPT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model) MODEL="$2"; shift 2;;
    -p|--prompt) PROMPT="$2"; shift 2;;
    *) PROMPT="$1"; shift;;
  esac
done

send_message() {
  local msg="$1"
  local escaped=$(echo "$msg" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

  curl -s "$API_URL" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":$escaped}],\"max_tokens\":4096}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('choices',[{}])[0].get('message',{}).get('content','ERROR: '+json.dumps(r)))"
}

if [ -n "$PROMPT" ]; then
  send_message "$PROMPT"
else
  # Interactive mode - read lines from stdin
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    send_message "$line"
  done
fi
