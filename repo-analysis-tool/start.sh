#!/usr/bin/env bash
#
# start.sh — one-command launcher for the Repo Analysis Tool.
#
# Usage:
#   ./start.sh          Install dependencies (if needed) and start the dev server.
#   ./start.sh build    Install dependencies and run a production build + start.
#
set -euo pipefail

# Always run from the directory containing this script (the app root).
cd "$(dirname "$0")"

MODE="${1:-dev}"

# --- Sanity checks -----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on PATH." >&2
  echo "This app requires Node.js 20.9 or newer (Node 22 recommended)." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20.9+ is required (found $(node -v))." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not on PATH." >&2
  exit 1
fi

# --- Install dependencies ----------------------------------------------------
if [ ! -d node_modules ]; then
  echo "Installing dependencies (npm install)..."
  npm install
else
  echo "Dependencies already installed. Run 'npm install' manually to refresh."
fi

# --- Launch ------------------------------------------------------------------
PORT="${PORT:-3000}"
export PORT

if [ "$MODE" = "build" ]; then
  echo "Building for production (npm run build)..."
  npm run build
  echo "Starting production server on http://localhost:${PORT} ..."
  npm run start
else
  echo "Starting development server on http://localhost:${PORT} ..."
  npm run dev
fi
