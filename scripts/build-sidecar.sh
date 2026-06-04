#!/usr/bin/env bash
# Build the Go `debugd` binary and place it where Tauri expects its sidecar:
# web/src-tauri/binaries/debugd-<target-triple>[.exe]. Tauri strips the triple
# suffix at bundle time and ships the right binary per platform.
#
# The Go binary embeds web/dist (web/embed.go), so the UI must be built first.
# Run `npm run build` in web/ before this, or use `make desktop` which chains both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/build-sidecar.mjs"
