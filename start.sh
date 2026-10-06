#!/usr/bin/env bash
#
# start.sh — top-level launcher for the Repo Analysis Tool submission.
#
# The application lives in the repo-analysis-tool/ subdirectory. This wrapper
# simply forwards to that directory's own start.sh so the run instructions work
# no matter which directory is treated as the submission root.
#
# Usage:
#   ./start.sh          Install dependencies (if needed) and start the dev server.
#   ./start.sh build    Install dependencies and run a production build + start.
#
set -euo pipefail

cd "$(dirname "$0")/repo-analysis-tool"

if [ ! -f start.sh ]; then
  echo "Error: repo-analysis-tool/start.sh not found." >&2
  exit 1
fi

chmod +x start.sh 2>/dev/null || true
exec ./start.sh "$@"
