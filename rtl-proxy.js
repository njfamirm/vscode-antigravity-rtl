// Local proxy that injects RTL support into the Antigravity chat iframe.
'use strict';
const http = require('http');
const net = require('net');

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
  var es = new EventSource('/__agy_rtl/events');
  es.onmessage = function (e) {
    if (document.visibilityState !== 'visible') return;
    try { attach(JSON.parse(e.data)); } catch (err) {}
  };
})();
</script>`;

// Open chat iframes listening for files to attach (server-sent events).
const clients = new Set();
let pending = null; // files sent before any chat iframe was connected

function sendToChat(uris) {
  if (!clients.size) { pending = uris; return; }
  for (const res of clients) res.write('data: ' + JSON.stringify(uris) + '\n\n');
}

function handleEvents(req, res) {
  // Only the proxied chat page itself (same origin, no Origin header) may listen.
  if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
    res.writeHead(403); return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.write(': ok\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
  if (pending) { const u = pending; pending = null; setTimeout(() => sendToChat(u), 1500); }
}

function registerCommand() {
  let vscode;
  try { vscode = require('vscode'); } catch (e) { return; }
  vscode.commands.registerCommand('antigravityRtl.addToChat', async (uri, uris) => {
    const list = (uris && uris.length ? uris : [uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri)])
      .filter(Boolean).map((u) => u.toString());
    if (!list.length) return;
    try { await vscode.commands.executeCommand('antigravity.toggleChatFocus', 'focus'); } catch (e) {}
    setTimeout(() => sendToChat(list), 300);
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
    if (req.url === '/__agy_rtl/events') return handleEvents(req, res);
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
