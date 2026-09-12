#!/bin/sh
# Remainder macOS one-line installer (Apple Silicon):
#   curl -fsSL https://raw.githubusercontent.com/taiyuexiao/remainder/master/install.sh | sh
set -e

REPO="taiyuexiao/remainder"
INSTALL_BASE="$HOME/Applications"
APP_DIR="$INSTALL_BASE/Remainder"

ARCH="$(uname -m)"
if [ "$ARCH" != "arm64" ]; then
  echo "error: only Apple Silicon (arm64) build is available; got: $ARCH" >&2
  exit 1
fi

echo ">> Resolving latest release of $REPO ..."
URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep browser_download_url | grep 'mac-arm64\.zip' | cut -d '"' -f 4)"
if [ -z "$URL" ]; then
  echo "error: mac-arm64 package not found in the latest release" >&2
  exit 1
fi

echo ">> Downloading: $URL"
TMP_ZIP="$(mktemp /tmp/remainder-mac.XXXXXX.zip)"
curl -fSL "$URL" -o "$TMP_ZIP"

echo ">> Installing to $APP_DIR"
mkdir -p "$INSTALL_BASE"
rm -rf "$APP_DIR"
unzip -q -o "$TMP_ZIP" -d "$INSTALL_BASE"
rm -f "$TMP_ZIP"

# unsigned app: drop quarantine attr, make launcher executable
xattr -dr com.apple.quarantine "$APP_DIR/app/Remainder.app" 2>/dev/null || true
chmod +x "$APP_DIR/start.sh"

echo ""
echo "Installed: $APP_DIR"
echo "Start now: $APP_DIR/start.sh"
