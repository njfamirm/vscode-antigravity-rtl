#!/usr/bin/env bash
# Re-run after every Antigravity extension update.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
for EXT in ~/.vscode/extensions/google.google-antigravity-*/; do
  F="$EXT/extension.js"
  if grep -q 'agyRtl' "$F"; then echo "already patched: $EXT"; continue; fi
  cp -n "$F" "$F.orig"
  OLD='a.search=m.toString();return a.toString()}setupFontChangeListener'
  NEW="a.search=m.toString();try{return require(\"$HERE/rtl-proxy.js\").wrap(a.toString())}catch(agyRtl){return a.toString()}}setupFontChangeListener"
  python3 - "$F" "$OLD" "$NEW" <<'PY'
import sys
f, old, new = sys.argv[1:]
s = open(f).read()
assert s.count(old) == 1, "anchor not found - extension changed"
open(f, 'w').write(s.replace(old, new))
PY
  echo "patched: $EXT"
done
