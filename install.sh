#!/usr/bin/env bash
# One-line installer for Linux and macOS:
#   curl -fsSL https://raw.githubusercontent.com/njfamirm/vscode-antigravity-rtl/main/install.sh | bash
# Uninstall:
#   bash ~/.local/share/vscode-antigravity-rtl/install.sh --uninstall
set -euo pipefail

REPO="https://github.com/njfamirm/vscode-antigravity-rtl.git"
DIR="$HOME/.local/share/vscode-antigravity-rtl"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js is required." >&2; exit 1; }

UNIT_DIR="$HOME/.config/systemd/user"
PLIST="$HOME/Library/LaunchAgents/com.njfamirm.vscode-antigravity-rtl.plist"

if [ "${1:-}" = "--uninstall" ]; then
  "$NODE" "$DIR/patch.js" --uninstall || true
  if [ "$(uname)" = "Darwin" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true; rm -f "$PLIST"
  elif command -v systemctl >/dev/null; then
    systemctl --user disable --now vscode-antigravity-rtl.path 2>/dev/null || true
    rm -f "$UNIT_DIR"/vscode-antigravity-rtl.{path,service}
    systemctl --user daemon-reload
  fi
  rm -rf "$DIR"
  echo "Uninstalled. Restart VS Code."
  exit 0
fi

if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q --ff-only; else git clone -q "$REPO" "$DIR"; fi
"$NODE" "$DIR/patch.js"

# Re-patch automatically whenever the extension updates.
EXT_DIR="$HOME/.vscode/extensions"
if [ "$(uname)" = "Darwin" ]; then
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.njfamirm.vscode-antigravity-rtl</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/patch.js</string><string>--quiet</string></array>
  <key>WatchPaths</key><array><string>$EXT_DIR</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Auto re-patch: launchd agent installed."
elif command -v systemctl >/dev/null; then
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/vscode-antigravity-rtl.service" <<UN
[Unit]
Description=Re-apply RTL patch to the Antigravity VS Code extension

[Service]
Type=oneshot
ExecStartPre=/bin/sleep 5
ExecStart=$NODE $DIR/patch.js --quiet
UN
  cat > "$UNIT_DIR/vscode-antigravity-rtl.path" <<UN
[Unit]
Description=Watch VS Code extensions for Antigravity updates

[Path]
PathChanged=$EXT_DIR

[Install]
WantedBy=default.target
UN
  systemctl --user daemon-reload
  systemctl --user enable --now vscode-antigravity-rtl.path
  echo "Auto re-patch: systemd path unit installed."
fi

echo "Done. Fully restart VS Code."
