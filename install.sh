#!/bin/sh
# debugd installer — downloads the right prebuilt binary for this machine.
#   curl -fsSL https://debugd.dev/install.sh | sh
# Override with: REPO, VERSION (default latest), BINDIR (default /usr/local/bin).
set -eu

REPO="${REPO:-shaho/debugd}"
VERSION="${VERSION:-latest}"
BINDIR="${BINDIR:-/usr/local/bin}"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64 | amd64) arch="amd64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) echo "debugd: unsupported architecture: $arch" >&2; exit 1 ;;
esac
case "$os" in
  linux | darwin) ;;
  *) echo "debugd: unsupported OS: $os (use the Windows zip from Releases)" >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/$VERSION"
fi
archive="debugd_${os}_${arch}.tar.gz"
url="$base/$archive"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "debugd: downloading $url"
curl -fsSL "$url" -o "$tmp/$archive"
tar -xzf "$tmp/$archive" -C "$tmp"

if [ -w "$BINDIR" ]; then
  install -m 0755 "$tmp/debugd" "$BINDIR/debugd"
else
  echo "debugd: $BINDIR not writable, using sudo"
  sudo install -m 0755 "$tmp/debugd" "$BINDIR/debugd"
fi

echo "debugd: installed to $BINDIR/debugd"
"$BINDIR/debugd" --version
