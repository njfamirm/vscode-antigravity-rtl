# vscode-antigravity-rtl

RTL (Persian / Arabic / Hebrew) support for the chat panel of the **Google Antigravity** extension in VS Code.

## Install

```bash
git clone https://github.com/njfamirm/vscode-antigravity-rtl.git ~/.local/share/vscode-antigravity-rtl
~/.local/share/vscode-antigravity-rtl/patch.sh
```

Fully restart VS Code. Re-run `patch.sh` after each extension update.

## How it works

The chat UI is an iframe served by the `agy` binary (UI embedded, cross-origin), so custom CSS tricks can't reach it. `patch.sh` changes one line in the extension's `extension.js` so the iframe goes through `rtl-proxy.js`, a tiny local proxy that injects `dir="auto"` + `unicode-bidi: plaintext` into the page. Code blocks stay LTR. If the proxy fails, the original URL is used.

## Uninstall

```bash
for d in ~/.vscode/extensions/google.google-antigravity-*/; do cp "$d/extension.js.orig" "$d/extension.js"; done
```

## DIY with an AI agent

Patch broke after an update, or you're on another OS? Give this prompt to Claude Code (or any coding agent):

> The chat panel of the Google Antigravity extension in VS Code has no RTL support. Find the extension in `~/.vscode/extensions`, figure out how the chat UI is loaded, and patch it so Persian/Arabic text renders right-to-left (`dir="auto"`, code blocks stay LTR). Keep a backup of anything you change.

## License

MIT
