#!/usr/bin/env bash
# Build the Go `debugd` binary and place it where Tauri expects its sidecar:
# web/src-tauri/binaries/debugd-<target-triple>[.exe]. Tauri strips the triple
# suffix at bundle time and ships the right binary per platform.
#
# The Go binary embeds web/dist (web/embed.go), so the UI must be built first.
# Run `npm run build` in web/ before this, or use `make desktop` which chains both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/web/src-tauri/binaries"

# Tauri matches the binary by Rust's target triple. Override TARGET_TRIPLE to
# cross-compile (also set GOOS/GOARCH to match). Prefer Tauri's hook-provided
# target when available, then fall back to rustc's host triple.
TRIPLE="${TARGET_TRIPLE:-${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV | awk '/^host: / {print $2}')}}"

EXT=""
case "$TRIPLE" in
  *windows*) EXT=".exe" ;;
esac

mkdir -p "$OUT_DIR"
echo "building debugd sidecar -> binaries/debugd-$TRIPLE$EXT"
( cd "$ROOT" && go build -ldflags "-s -w" -o "$OUT_DIR/debugd-$TRIPLE$EXT" ./cmd/debugd )
