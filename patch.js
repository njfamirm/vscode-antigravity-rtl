#!/usr/bin/env node
// Patches (or with --uninstall, restores) the Antigravity extension. Works on Linux, macOS and Windows.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROXY = path.join(__dirname, 'rtl-proxy.js');
// Bump when the patch changes, so older patched installs get re-patched from the backup.
const MARK = 'agyRtlV2';
const OLD = 'a.search=m.toString();return a.toString()}setupFontChangeListener';
const NEW = `a.search=m.toString();try{return require(${JSON.stringify(PROXY)}).wrap(a.toString())}catch(${MARK}){return a.toString()}}setupFontChangeListener`;
// Load the proxy as soon as the extension loads, so the Explorer command exists right away.
const PRELOAD = `\n;try{require(${JSON.stringify(PROXY)})}catch(${MARK}){}\n`;

const COMMAND = { command: 'antigravityRtl.addToChat', title: 'Add to Antigravity Chat' };
const MENUS = {
  'explorer/context': { command: COMMAND.command, group: 'antigravity@1' },
  'editor/title/context': { command: COMMAND.command, group: 'antigravity@1' },
};

const uninstall = process.argv.includes('--uninstall');
const quiet = process.argv.includes('--quiet');
const log = (...a) => quiet || console.log(...a);

const roots = ['.vscode', '.vscode-insiders', '.vscode-server', '.vscode-oss']
  .map((d) => path.join(os.homedir(), d, 'extensions'))
  .filter((d) => fs.existsSync(d));

function restore(file) {
  const orig = file + '.orig';
  if (!fs.existsSync(orig)) return false;
  fs.copyFileSync(orig, file);
  fs.unlinkSync(orig);
  return true;
}

function patchExtensionJs(file) {
  const orig = file + '.orig';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARK)) return 'already patched';
  if (fs.existsSync(orig)) src = fs.readFileSync(orig, 'utf8'); // upgrade an older patch
  if (src.split(OLD).length !== 2) throw new Error('unsupported extension version (anchor not found)');
  if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);
  fs.writeFileSync(file, src.replace(OLD, NEW) + PRELOAD);
  return 'patched';
}

function patchPackageJson(file) {
  const orig = file + '.orig';
  const pkg = JSON.parse(fs.readFileSync(fs.existsSync(orig) ? orig : file, 'utf8'));
  const c = (pkg.contributes = pkg.contributes || {});
  c.commands = (c.commands || []).concat(COMMAND);
  c.menus = c.menus || {};
  for (const [where, item] of Object.entries(MENUS)) c.menus[where] = (c.menus[where] || []).concat(item);
  if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
}

let found = 0;
let failed = false;
for (const root of roots) {
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith('google.google-antigravity-')) continue;
    const dir = path.join(root, name);
    const js = path.join(dir, 'extension.js');
    const pkg = path.join(dir, 'package.json');
    if (!fs.existsSync(js)) continue;
    found++;

    if (uninstall) {
      const a = restore(js);
      const b = restore(pkg);
      if (a || b) log('restored:', dir);
      continue;
    }
    try {
      const state = patchExtensionJs(js);
      if (state === 'patched') patchPackageJson(pkg);
      log(state + ':', dir);
    } catch (e) {
      console.error(e.message + ':', dir);
      failed = true;
    }
  }
}
if (!found) log('Antigravity extension not found.');
process.exit(failed ? 1 : 0);
