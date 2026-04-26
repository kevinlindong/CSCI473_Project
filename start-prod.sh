#!/usr/bin/env bash
# Start FastAPI (port 3001) + Vite preview (port 5173) in production mode.
# Vite preview serves the pre-built bundle from frontend/dist/, so React runs
# in production mode (no StrictMode double-invoke, no dev warnings, fully
# minified). The backend runs without --reload so the stack matches what a
# real deployment would do. Ctrl-C cleanly stops both.
#
# Usage:
#   ./start-prod.sh                # incremental — rebuild only if dist/ is missing or stale
#   ./start-prod.sh --rebuild      # force a fresh `vite build`

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

# Activate a virtualenv if one exists.
if [[ -f "$ROOT/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.venv/bin/activate"
elif [[ -f "$ROOT/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/venv/bin/activate"
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "error: $PYTHON_BIN not found on PATH" >&2
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT/frontend" && npm install)
fi

# Decide whether to rebuild.
NEED_BUILD=false
if [[ "${1:-}" == "--rebuild" ]]; then
  NEED_BUILD=true
elif [[ ! -d "$ROOT/frontend/dist" ]]; then
  NEED_BUILD=true
elif [[ ! -f "$ROOT/frontend/dist/index.html" ]]; then
  NEED_BUILD=true
fi

if [[ "$NEED_BUILD" == "true" ]]; then
  echo "Building frontend (vite build) — this takes ~30-40s..."
  (cd "$ROOT/frontend" && node_modules/.bin/vite build) \
    > >(tee "$LOG_DIR/frontend-build.log") 2>&1
fi

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Shutting down..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:$BACKEND_PORT (no --reload) ..."
"$PYTHON_BIN" -m uvicorn app:app \
  --host 0.0.0.0 \
  --port "$BACKEND_PORT" \
  > >(tee "$LOG_DIR/backend.log") 2>&1 &
BACKEND_PID=$!

echo "Starting frontend (vite preview) on http://localhost:$FRONTEND_PORT ..."
(cd "$ROOT/frontend" && node_modules/.bin/vite preview --port "$FRONTEND_PORT" --strictPort) \
  > >(tee "$LOG_DIR/frontend.log") 2>&1 &
FRONTEND_PID=$!

echo
echo "  backend:  http://localhost:$BACKEND_PORT  (pid $BACKEND_PID, prod mode, no reload)"
echo "  frontend: http://localhost:$FRONTEND_PORT (pid $FRONTEND_PID, vite preview)"
echo "  logs:     $LOG_DIR/"
echo
echo "  Re-run with --rebuild after editing frontend code."
echo "  Press Ctrl-C to stop both."

# Exit as soon as either dies so we don't leave the other orphaned.
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
