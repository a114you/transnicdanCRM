#!/usr/bin/env bash
# Free Chrome-TLS curl for request-level anti-bot (no Playwright).
# https://github.com/lexiforest/curl-impersonate
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/bin/curl-impersonate"
mkdir -p "$DIR"
ARCH="$(uname -m)"
VER="v1.5.6"
if [ "$ARCH" = "arm64" ]; then
  FILE="curl-impersonate-${VER}.arm64-macos.tar.gz"
else
  FILE="curl-impersonate-${VER}.x86_64-macos.tar.gz"
fi
URL="https://github.com/lexiforest/curl-impersonate/releases/download/${VER}/${FILE}"
echo "Downloading $URL"
curl -sL "$URL" -o "$DIR/ci.tgz"
tar xzf "$DIR/ci.tgz" -C "$DIR"
rm -f "$DIR/ci.tgz"
chmod +x "$DIR"/curl_* "$DIR"/curl-impersonate 2>/dev/null || true
echo "OK: $DIR/curl_chrome131"
ls -la "$DIR/curl_chrome131"
