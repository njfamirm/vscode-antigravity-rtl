// Local proxy that injects RTL support into the Antigravity chat iframe.
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const INJECT = `
<style id="agy-rtl">
  @font-face {
    font-family: 'AgyVazirmatn';
    src: url('https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/webfonts/Vazirmatn%5Bwght%5D.woff2') format('woff2');
    font-weight: 100 900;
    font-display: swap;
    /* Only Arabic-script glyphs; Latin text keeps the original font. */
    unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F;
  }
  p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, textarea, input,
  [contenteditable]:not([contenteditable="false"]), .whitespace-pre-wrap {
    unicode-bidi: plaintext;
    text-align: start;
  }
  pre, code, pre *, code * { unicode-bidi: isolate !important; direction: ltr !important; text-align: left !important; }
</style>
<script>
(function () {
  var EDITABLE = 'textarea,input,[contenteditable]:not([contenteditable="false"])';
  var SEL = 'p,li,ul,ol,h1,h2,h3,h4,h5,h6,blockquote,td,th,.whitespace-pre-wrap,' + EDITABLE;
  function addFont(el) {
    if (el.dataset.agyFont) return;
    el.dataset.agyFont = '1';
    var current = getComputedStyle(el).fontFamily;
    if (current.indexOf('AgyVazirmatn') === -1) el.style.fontFamily = "'AgyVazirmatn', " + current;
  }
  function fix(root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll(EDITABLE).forEach(addFont);
    if (root.matches && root.matches(SEL) && !root.closest('pre,code')) root.setAttribute('dir', 'auto');
    root.querySelectorAll(SEL).forEach(function (el) {
      if (!el.closest('pre,code') && !el.hasAttribute('dir')) el.setAttribute('dir', 'auto');
    });
  }
  function start() {
    addFont(document.body);
    fix(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) fix(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // Files sent from the VS Code Explorer ("Add to Antigravity Chat") arrive here and are
  // dropped into the message input, exactly like a real drag & drop.
  function attach(uris) {
    var input = document.querySelector('[aria-label="Message input"]') ||
      document.querySelector('[contenteditable="true"]');
    if (!input) return false;
    var dt = new DataTransfer();
    dt.setData('application/vnd.code.uri-list', uris.join('\\r\\n'));
    dt.setData('text/uri-list', uris.join('\\r\\n'));
    dt.setData('ResourceURLs', JSON.stringify(uris));
    input.focus();
    ['dragenter', 'dragover', 'drop'].forEach(function (t) {
      input.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    return true;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function paste(text) {
    var input = document.querySelector('[aria-label="Message input"]');
    var dt = new DataTransfer();
    dt.setData('text/plain', text);
    input.focus();
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }
  function isRunning() { return !!document.querySelector('button[aria-label="Stop execution"]'); }
  function pageText() { return (document.querySelector('main') || document.body).innerText; }
  function post(path, body) {
    return fetch(path, { method: 'POST', body: JSON.stringify(body) }).catch(function () {});
  }

  // Text the agent added after our prompt: everything after the last occurrence of the
  // prompt (or attached file name), minus the message input at the bottom.
  function replyText(marker) {
    var text = pageText();
    var i = marker ? text.lastIndexOf(marker) : -1;
    if (i !== -1) text = text.slice(i + marker.length);
    var end = text.lastIndexOf('Ask anything');
    if (end !== -1) text = text.slice(0, end);
    return text.trim();
  }

  function currentConv() { var m = location.pathname.match(/\\/c\\/([\\w-]+)/); return m ? m[1] : null; }
  function title() { return document.title.replace(/ - [^-]* - Antigravity$/, '').replace(/ - Antigravity$/, ''); }

  // A prompt from Telegram (the extension already opened the right conversation):
  // attach files, type, send, and report which conversation it went to.
  function input() { return document.querySelector('[aria-label="Message input"]'); }
  function sendButton() { return document.querySelector('button[aria-label="Send message"]'); }
  function enabled(b) { return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'; }
  function pressEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(function (t) {
      el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    });
  }
  // Fill the input if the view lost it (e.g. it re-rendered for a new conversation).
  function fill(p) {
    var el = input();
    if (p.uris.length && !el.querySelector('[data-uri]')) attach(p.uris);
    if (p.text && el.innerText.indexOf(p.text.split('\\n')[0].trim()) === -1) paste(p.text);
  }

  async function runPrompt(p) {
    for (var w = 0; w < 30 && !input(); w++) await sleep(500);
    if (!input()) return post('/__agy_rtl/reply', { id: p.id, kind: 'error', text: '⚠️ Chat input not found.' });
    await sleep(500); // a freshly created conversation needs a moment before it accepts input

    // Send, and retry until the agent actually starts (or the conversation URL appears).
    var startConv = currentConv();
    var sent = false;
    for (var attempt = 0; attempt < 8 && !sent; attempt++) {
      fill(p);
      await sleep(400);
      var b = sendButton();
      for (var e = 0; e < 10 && !enabled(b); e++) { await sleep(300); b = sendButton(); }
      if (enabled(b)) b.click(); else pressEnter(input());
      for (var c = 0; c < 8 && !sent; c++) {
        await sleep(250);
        sent = isRunning() || currentConv() !== startConv;
      }
    }
    if (!sent) return post('/__agy_rtl/reply', { id: p.id, kind: 'error', text: '⚠️ Could not send the message (Send button stayed disabled).' });
    // A new conversation gets its URL a moment after sending.
    for (var u = 0; u < 12 && !currentConv(); u++) await sleep(250);
    var marker = p.text ? p.text.split('\\n').pop().trim() : decodeURIComponent(p.uris[p.uris.length - 1].split('/').pop());
    post('/__agy_rtl/reply', { id: p.id, kind: 'sent', conv: currentConv(), marker: marker });
  }

  // Is the reply in this conversation ready? Done once "Stop execution" is gone for 3 seconds.
  async function checkReply(m) {
    if (m.conv && m.conv !== currentConv()) return post('/__agy_rtl/reply', { id: m.id, kind: 'elsewhere' });
    for (var q = 0; q < 6; q++) {
      if (isRunning()) return post('/__agy_rtl/reply', { id: m.id, kind: 'running' });
      await sleep(500);
    }
    post('/__agy_rtl/reply', { id: m.id, kind: 'done', text: replyText(m.marker), title: title() });
  }

  var clientId = Math.random().toString(36).slice(2);
  function reportVisibility() {
    post('/__agy_rtl/visible?id=' + clientId, { visible: document.visibilityState === 'visible' });
  }
  document.addEventListener('visibilitychange', reportVisibility);
  window.addEventListener('focus', reportVisibility);
  var es = new EventSource('/__agy_rtl/events?id=' + clientId);
  es.onopen = reportVisibility;
  es.onmessage = function (e) {
    try {
      var m = JSON.parse(e.data);
      if (m.type === 'attach') attach(m.uris);
      else if (m.type === 'prompt') runPrompt(m);
      else if (m.type === 'check') checkReply(m);
      else if (m.type === 'stop') { var b = document.querySelector('button[aria-label="Stop execution"]'); if (b) b.click(); }
    } catch (err) {}
  };
})();
</script>`;

// Open chat iframes (server-sent events), by client id. Messages go to one of them only:
// the one most recently visible, else the one most recently connected.
const clients = new Map(); // id -> { res, connected, visibleAt }
const replyHandlers = new Map(); // prompt id -> callback(text)
let pending = null; // message sent before any chat iframe was connected

function pickClient() {
  let best = null;
  for (const c of clients.values()) {
    if (!best || (c.visibleAt || 0) > (best.visibleAt || 0) ||
        ((c.visibleAt || 0) === (best.visibleAt || 0) && c.connected > best.connected)) best = c;
  }
  return best;
}

function sendMessage(msg) {
  const c = pickClient();
  if (!c) { pending = msg; return false; }
  c.res.write('data: ' + JSON.stringify(msg) + '\n\n');
  return true;
}

function sendToChat(uris) { return sendMessage({ type: 'attach', uris }); }

function sameOrigin(req) {
  return !req.headers.origin || req.headers.origin === 'http://' + req.headers.host;
}

function readJson(req, cb) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(body)); } catch (e) {} });
}

function handleChannel(req, res) {
  // Only the proxied chat page itself (same origin) may use the channel.
  if (!sameOrigin(req)) { res.writeHead(403); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const id = u.searchParams.get('id') || String(Math.random());

  if (u.pathname === '/__agy_rtl/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': ok\n\n');
    clients.set(id, { res, connected: Date.now(), visibleAt: 0 });
    req.on('close', () => clients.delete(id));
    if (pending) { const m = pending; pending = null; setTimeout(() => sendMessage(m), 1500); }
    return;
  }
  if (u.pathname === '/__agy_rtl/visible') {
    readJson(req, (b) => { const c = clients.get(id); if (c && b.visible) c.visibleAt = Date.now(); });
  } else if (u.pathname === '/__agy_rtl/reply') {
    readJson(req, (b) => {
      const cb = replyHandlers.get(b.id);
      if (cb) { replyHandlers.delete(b.id); cb(b); }
    });
  }
  res.writeHead(204);
  res.end();
}

function registerCommand() {
  let vscode;
  try { vscode = require('vscode'); } catch (e) { return; }
  const focusChat = () => vscode.commands.executeCommand('antigravity.toggleChatFocus', 'focus').then(undefined, () => {});

  vscode.commands.registerCommand('antigravityRtl.addToChat', async (uri, uris) => {
    const list = (uris && uris.length ? uris : [uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri)])
      .filter(Boolean).map((u) => u.toString());
    if (!list.length) return;
    await focusChat();
    setTimeout(() => sendToChat(list), 300);
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const exec = (...a) => vscode.commands.executeCommand(...a).then(undefined, () => {});

  // The chat view shows one conversation at a time, so anything that switches it runs
  // one after another. Sending is quick; replies are collected in the background.
  let chain = Promise.resolve();
  let waiting = 0; // view actions queued on the chain
  const withView = (fn) => {
    waiting++;
    const r = chain.then(fn).finally(() => { waiting--; });
    chain = r.catch(() => {});
    return r;
  };

  let shownConv = null;
  let lastSwitch = 0;
  async function show(conv) {
    if (conv === 'new') { await exec('antigravity.startNewConversation'); shownConv = null; }
    else if (conv && conv !== shownConv) { await exec('antigravity.openConversation', conv); shownConv = conv; }
    else { await focusChat(); return; }
    lastSwitch = Date.now();
    await sleep(2000);
  }

  // Ask the page something and wait for its answer (null on timeout).
  function ask(msg, ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { replyHandlers.delete(msg.id); resolve(null); }, ms);
      replyHandlers.set(msg.id, (b) => { clearTimeout(t); resolve(b); });
      sendMessage(msg);
    });
  }

  const outstanding = []; // prompts sent and waiting for a reply: { id, conv, marker, since, resolve }
  let checking = false;
  setInterval(() => {
    if (checking || !outstanding.length || !clients.size) return;
    checking = true;
    withView(async () => {
      // Prefer the conversation on screen; switch to others only when nothing else is
      // waiting for the view, and not more often than every 8 seconds.
      let item = outstanding.find((o) => !o.conv || o.conv === shownConv);
      if (!item) {
        if (waiting > 1 || Date.now() - lastSwitch < 8000) return;
        item = outstanding[0];
        await show(item.conv);
      }
      const r = await ask({ type: 'check', id: 'check-' + Math.random(), conv: item.conv, marker: item.marker }, 20000);
      const i = outstanding.indexOf(item);
      if (r && r.kind === 'done') {
        outstanding.splice(i, 1);
        item.resolve({ text: r.text, conv: item.conv, title: r.title });
      } else if (Date.now() - item.since > 35 * 60 * 1000) {
        outstanding.splice(i, 1);
        item.resolve({ text: '⌛ No reply after 35 minutes.', conv: item.conv });
      } else {
        outstanding.push(outstanding.splice(i, 1)[0]); // round robin
      }
    }).finally(() => { checking = false; });
  }, 4000).unref();

  const host = {
    // Sends right away (onSent(conv) once it is in), resolves with { text, conv, title }
    // when the agent is done, or null if no chat is open.
    run: (p, onSent) => new Promise((resolve) => {
      if (!clients.size) return resolve(null);
      withView(async () => {
        await show(p.conv);
        const r = await ask(Object.assign({ type: 'prompt' }, p), 60000);
        if (!r || r.kind !== 'sent') return resolve({ text: r ? r.text : '⚠️ The chat did not respond.' });
        shownConv = r.conv || shownConv;
        if (onSent) onSent(r.conv);
        outstanding.push({ id: p.id, conv: r.conv, marker: r.marker, since: Date.now(), resolve });
      });
    }),
    stop: () => sendMessage({ type: 'stop' }),
  };
  loadPlugins(vscode, host);
}

// Plugins: every .js file (or folder with index.js) in PLUGINS_DIR is loaded once.
// A plugin exports { activate(ctx), commands: [{ title, run(ctx) }] } where
// ctx = { vscode, host }. host.run(prompt, onSent) sends a prompt to the chat
// ({ id, text, uris, conv }) and resolves with { text, conv, title } when the agent is
// done; host.stop() stops the agent. Plugin commands show up in "Antigravity: Plugins".
const PLUGINS_DIR = path.join(os.homedir(), '.config', 'vscode-antigravity-rtl', 'plugins');

function loadPlugins(vscode, host) {
  const ctx = { vscode, host };
  const commands = [];
  let names = [];
  try { names = fs.readdirSync(PLUGINS_DIR); } catch (e) {}
  for (const name of names) {
    try {
      const plugin = require(path.join(PLUGINS_DIR, name));
      if (plugin.activate) plugin.activate(ctx);
      for (const c of plugin.commands || []) commands.push(c);
    } catch (e) { console.error('[antigravity-rtl] plugin ' + name + ' failed:', e); }
  }
  vscode.commands.registerCommand('antigravityRtl.plugins', async () => {
    if (!commands.length) {
      return vscode.window.showInformationMessage('No Antigravity RTL plugins installed.');
    }
    const pick = await vscode.window.showQuickPick(commands.map((c) => ({ label: c.title, c })));
    if (pick) pick.c.run(ctx);
  });
}

let target = null; // { host, port, origin }
let server = null;
let port = 0;

function rewriteHeaders(h) {
  const out = Object.assign({}, h);
  out.host = target.host + ':' + target.port;
  if (out.origin) out.origin = target.origin;
  if (out.referer) out.referer = out.referer.replace(/^https?:\/\/[^/]+/, target.origin);
  return out;
}

function ensureServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/__agy_rtl/')) return handleChannel(req, res);
    if (!target) { res.writeHead(502); return res.end(); }
    const headers = rewriteHeaders(req.headers);
    headers['accept-encoding'] = 'identity';
    const up = http.request({ host: target.host, port: target.port, method: req.method, path: req.url, headers }, (ur) => {
      const h = Object.assign({}, ur.headers);
      const isHtml = /text\/html/.test(h['content-type'] || '');
      if (!isHtml) { res.writeHead(ur.statusCode, h); return ur.pipe(res); }
      const chunks = [];
      ur.on('data', (c) => chunks.push(c));
      ur.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        body = body.includes('</head>') ? body.replace('</head>', INJECT + '</head>') : INJECT + body;
        delete h['content-length'];
        delete h['content-encoding'];
        res.writeHead(ur.statusCode, h);
        res.end(body);
      });
    });
    up.on('error', () => { try { res.writeHead(502); res.end(); } catch (e) {} });
    req.pipe(up);
  });
  server.on('upgrade', (req, sock, head) => {
    if (!target) return sock.destroy();
    const up = net.connect(target.port, target.host, () => {
      const h = rewriteHeaders(req.headers);
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const k in h) raw += `${k}: ${h[k]}\r\n`;
      up.write(raw + '\r\n');
      if (head && head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
  });
  // Known port up front so the very first iframe load can already use it.
  const want = 30000 + (process.pid % 20000);
  port = want;
  server.on('error', () => { server = null; port = 0; });
  server.listen(want, '127.0.0.1');
  server.unref();
}

// Called synchronously with the iframe URL; returns the proxied URL when ready.
function wrap(urlStr) {
  try {
    ensureServer();
    const u = new URL(urlStr);
    if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || u.protocol !== 'http:') return urlStr;
    target = { host: u.hostname, port: Number(u.port || 80), origin: u.origin };
    if (!port) return urlStr;
    u.host = '127.0.0.1:' + port;
    return u.toString();
  } catch (e) {
    return urlStr;
  }
}

ensureServer();
registerCommand();
module.exports = { wrap, sendToChat };
