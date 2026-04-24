#!/usr/bin/env bash
# Start the FastAPI backend (port 3001) and the Vite frontend (port 5173) together.
# Vite proxies /api/* to localhost:3001, so the frontend talks to the backend
# through relative URLs. Ctrl-C cleanly stops both processes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

# Activate a virtualenv if one exists; otherwise fall back to system python.
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

echo "Starting backend on http://localhost:$BACKEND_PORT ..."
"$PYTHON_BIN" -m uvicorn app:app \
  --host 0.0.0.0 \
  --port "$BACKEND_PORT" \
  --reload \
  > >(tee "$LOG_DIR/backend.log") 2>&1 &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:$FRONTEND_PORT ..."
(cd "$ROOT/frontend" && npm run dev -- --port "$FRONTEND_PORT") \
  > >(tee "$LOG_DIR/frontend.log") 2>&1 &
FRONTEND_PID=$!

echo
echo "  backend:  http://localhost:$BACKEND_PORT  (pid $BACKEND_PID)"
echo "  frontend: http://localhost:$FRONTEND_PORT (pid $FRONTEND_PID)"
echo "  logs:     $LOG_DIR/"
echo
echo "Press Ctrl-C to stop both."

# Exit as soon as either process dies so we don't leave the other orphaned.
# (macOS ships bash 3.2 with no `wait -n`, so poll instead.)
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
