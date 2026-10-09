#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: ./start.sh"
  echo ""
  echo "Runs the The Prism Agent Architecture server in watch mode with automatic restart on file changes"
  echo "and auto-recovery if the process terminates."
  echo ""
  echo "Environment variables:"
  echo "  PORT              HTTP port (default: 3000)"
  echo "  PRISM_DB    Database path (default: workspace/agents/local.sqlite)"
  exit 0
fi

# Ensure dependencies exist
if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Installing dependencies..."
  npm install
fi

# Initial build ensures dist/ is fully populated (e.g. apps/web assets)
echo "Building initial project assets..."
npm run build

TSC_PID=""
SERVER_PID=""
STOPPING=0

cleanup() {
  STOPPING=1
  echo ""
  echo "Shutting down server and watchers..."
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$TSC_PID" ] && kill -0 "$TSC_PID" 2>/dev/null; then
    kill "$TSC_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  echo "Done."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start tsc in watch mode so changes to frontend (apps/web) and packages compile continuously
echo "Starting TypeScript compiler watch..."
npx tsc --watch --preserveWatchOutput &
TSC_PID=$!

echo "Starting server with auto-restart on changes..."
echo "Press Ctrl+C to stop."
echo ""

# Supervisor loop: keeps the watch runner alive forever unless explicitly terminated
while [ "$STOPPING" -eq 0 ]; do
  npx tsx watch --clear-screen=false --include "packages/**" --include "apps/**" apps/server/src/main.ts &
  SERVER_PID=$!
  wait "$SERVER_PID" 2>/dev/null || true

  if [ "$STOPPING" -eq 1 ]; then
    break
  fi

  echo "Server process exited unexpectedly. Restarting in 1s... (Press Ctrl+C to abort)"
  sleep 1
done
