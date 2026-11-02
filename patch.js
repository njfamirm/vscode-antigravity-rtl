#!/usr/bin/env node
// Patches (or with --uninstall, restores) the Antigravity extension. Works on Linux, macOS and Windows.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROXY = path.join(__dirname, 'rtl-proxy.js');
const MARK = 'agyRtl';
const OLD = 'a.search=m.toString();return a.toString()}setupFontChangeListener';
const NEW = `a.search=m.toString();try{return require(${JSON.stringify(PROXY)}).wrap(a.toString())}catch(${MARK}){return a.toString()}}setupFontChangeListener`;
const uninstall = process.argv.includes('--uninstall');
const quiet = process.argv.includes('--quiet');
const log = (...a) => quiet || console.log(...a);

const roots = ['.vscode', '.vscode-insiders', '.vscode-server', '.vscode-oss']
  .map((d) => path.join(os.homedir(), d, 'extensions'))
  .filter((d) => fs.existsSync(d));

let found = 0;
let failed = false;
for (const root of roots) {
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith('google.google-antigravity-')) continue;
    const file = path.join(root, name, 'extension.js');
    if (!fs.existsSync(file)) continue;
    found++;
    const orig = file + '.orig';
    const src = fs.readFileSync(file, 'utf8');

    if (uninstall) {
      if (fs.existsSync(orig)) { fs.copyFileSync(orig, file); fs.unlinkSync(orig); log('restored:', file); }
      continue;
    }
    if (src.includes(MARK)) { log('already patched:', file); continue; }
    if (src.split(OLD).length !== 2) { console.error('unsupported extension version (anchor not found):', file); failed = true; continue; }
    if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);
    fs.writeFileSync(file, src.replace(OLD, NEW));
    log('patched:', file);
  }
}
if (!found) log('Antigravity extension not found.');
process.exit(failed ? 1 : 0);
