#!/usr/bin/env node
// remote-config-proxy.mjs — Host-rewriting reverse proxy that unlocks the
// dsh loopback plane (settings / credentials / llm.discoverModels) for the
// phone browser and the APK WebView.
//
// Why it works (confirmed in the dsh source, packages/client/connection):
// every /api request, the privileged-method check, and the WebSocket
// downlinks all pass isTrustedApiRequest(), which decides purely from the
// Host header string (loopback spelling or a trustedHosts entry) plus the
// absence of a mismatched Origin. Rewriting Host to the loopback target and
// deleting Origin therefore passes the fence for every path — page assets
// included, since the whole origin rides this proxy.
//
// Layout:
//   phone browser / APK WebView
//     → https://<machine>.<tailnet>.ts.net/   (tailscale serve)
//     → 127.0.0.1:DSH_PROXY_PORT              (this proxy, loopback only)
//     → 127.0.0.1:DSH_PROXY_TARGET            (dsh web, default :3080)
//
// Security posture: the fence is explicitly not an authentication layer.
// Anything that can reach this port can change configuration. The proxy
// binds loopback only; tailscale serve is the only remote path in, and the
// tailnet device identity is the authentication. DSH_PROXY_TOKEN adds an
// optional second factor: a mini login page sets an HttpOnly cookie and
// every request (upgrades included) must carry it.
//
// Env:
//   DSH_PROXY_PORT    listen port (default 3081)
//   DSH_PROXY_TARGET  upstream URL (default http://127.0.0.1:3080)
//   DSH_PROXY_TOKEN   optional shared secret for the cookie login gate

import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { URL } from 'node:url'

const PORT = Number(process.env.DSH_PROXY_PORT ?? 3081)
const TARGET = new URL(process.env.DSH_PROXY_TARGET ?? 'http://127.0.0.1:3080')
const TOKEN = process.env.DSH_PROXY_TOKEN ?? ''
const COOKIE_NAME = 'dsh_remote_config_token'
const COOKIE_MAX_AGE = 31536000 // 1 year; rotating the token invalidates it

// Hop-by-hop headers must not travel across the proxy; the Host and Origin
// headers are rewritten/dropped by the trust-fence design.
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade',
])

function log(line) {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`)
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function cookieValue(req, name) {
  const raw = req.headers.cookie ?? ''
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

function isAuthed(req) {
  if (!TOKEN) return true
  const value = cookieValue(req, COOKIE_NAME)
  return value !== undefined && safeEqual(value, TOKEN)
}

function text(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...extraHeaders })
  res.end(body)
}

// Forwarded request headers: drop hop-by-hop plus origin; Host is set
// explicitly by the caller (the loopback rewrite).
function forwardHeaders(req) {
  const headers = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(name) || name === 'host' || name === 'origin') continue
    if (value !== undefined) headers[name] = value
  }
  return headers
}

const targetHost = TARGET.port
  ? `${TARGET.hostname}:${TARGET.port}`
  : TARGET.hostname

// Login page styled after the dsh design platform (ui-theme tokens:
// neutral-bluish scale, DeepSeek brand blue, 12px cards, 8px controls).
// Light and dark follow the system; wrong tokens re-render with an error.
function loginPage(error) {
  const errorBlock = error
    ? '<div class="error">\u26a0 \u4ee4\u724c\u4e0d\u6b63\u786e\u3002Invalid token.</div>'
    : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH Remote</title>
<style>
  :root {
    --bg: #151517; --card: #232324; --input: #2c2c2e;
    --border: rgba(255,255,255,0.12); --border-strong: rgba(255,255,255,0.2);
    --label: #f9fafb; --label-2: #cfd3d6; --label-3: #adaeb2;
    --brand: rgb(65,118,230); --brand-hover: rgb(103,158,254);
    --error: rgb(248,113,113);
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f9fafb; --card: #ffffff; --input: #f3f4f6;
      --border: rgba(0,0,0,0.1); --border-strong: rgba(0,0,0,0.16);
      --label: #0f1115; --label-2: #61666b; --label-3: #81858c;
      --error: rgb(220,38,38);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); color: var(--label);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .card {
    width: min(360px, 88vw); background: var(--card);
    border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25);
    padding: 24px 24px 20px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark {
    width: 32px; height: 32px; border-radius: 8px; flex: none;
    background: linear-gradient(135deg, rgb(65,118,230), rgb(103,158,254));
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  h1 { font-size: 15px; font-weight: 600; margin: 0; }
  p.hint { font-size: 12px; line-height: 1.7; color: var(--label-3); margin: 8px 0 16px; }
  label { display: block; font-size: 12px; color: var(--label-2); margin-bottom: 6px; }
  input {
    width: 100%; height: 40px; padding: 0 12px;
    background: var(--input); color: var(--label);
    border: 1px solid var(--border); border-radius: 8px;
    font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(65,118,230,0.25); }
  input::placeholder { color: var(--label-3); }
  button {
    width: 100%; height: 40px; margin-top: 14px;
    background: var(--brand); color: #fff; border: none; border-radius: 8px;
    font-size: 14px; font-weight: 500; cursor: pointer; transition: background .15s;
  }
  button:hover { background: var(--brand-hover); }
  .error {
    margin-top: 12px; padding: 8px 10px;
    background: rgba(248,113,113,0.12); color: var(--error);
    border: 1px solid rgba(248,113,113,0.3); border-radius: 8px;
    font-size: 12px;
  }
  .foot { margin-top: 14px; font-size: 11px; color: var(--label-3); text-align: center; }
</style>
</head>
<body>
  <form class="card" method="post" action="/login">
    <div class="brand">
      <div class="mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
      <h1>DSH Remote</h1>
    </div>
    <p class="hint">\u8f93\u5165\u4ee3\u7406\u4ee4\u724c\u4ee5\u89e3\u9501\u8fdc\u7a0b\u914d\u7f6e\u3002<br>Enter the proxy token to unlock remote configuration.</p>
    <label for="token">Token</label>
    <input id="token" type="password" name="token" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autofocus autocomplete="current-password" required>
    <button type="submit">\u89e3\u9501 / Unlock</button>
    ${errorBlock}
    <div class="foot">dsh remote-config proxy</div>
  </form>
</body>
</html>`
}

// ── HTML rewriting ──────────────────────────────────────────────────────
// The dsh client gates its settings plane on the CLIENT-side loopback state
// (connection.isLoopback, read from location.hostname), which stays the
// tailnet domain behind the proxy. Two rewrites make the page cooperate:
//   1. Inject window.__DSH_PROXY__ — mobile-fit reads it and flips
//      connection.isLoopback before the settings consumers bind scopes.
//   2. Reorder the boot manifest so mobile-fit's row sits right after
//      dsh-client-connection (with an inject edge), guaranteeing its apply
//      runs before ui-settings and the scope consumers.
const PROXY_FLAG_SCRIPT = '<script>window.__DSH_PROXY__=true</script>'
const CONNECTION_ROW_ID = '@deepseek-ai/dsh-client-connection'

function rewriteHtml(body) {
  let html = body
  if (!html.includes('window.__DSH_PROXY__')) {
    html = html.replace('</head>', `${PROXY_FLAG_SCRIPT}</head>`)
  }
  const markerAt = html.indexOf('__DSH_BOOT__')
  if (markerAt < 0) return html
  const assignAt = html.indexOf('=', markerAt)
  const jsonStart = html.indexOf('{', assignAt)
  const scriptEnd = html.indexOf('</script>', jsonStart)
  if (assignAt < 0 || jsonStart < 0 || scriptEnd <= jsonStart) return html
  let raw = html.slice(jsonStart, scriptEnd).trim()
  if (raw.endsWith(';')) raw = raw.slice(0, -1)
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (error) {
    log(`boot manifest parse failed: ${error.message}`)
    return html
  }
  const entries = manifest.entries
  const mobileFit = entries.findIndex((entry) => entry.id === 'mobile-fit')
  const connection = entries.findIndex((entry) => entry.id === CONNECTION_ROW_ID)
  if (mobileFit < 0 || connection < 0 || mobileFit === connection) return html
  const row = entries.splice(mobileFit, 1)[0]
  row.inject = [CONNECTION_ROW_ID]
  entries.splice(connection + 1, 0, row)
  const patched = JSON.stringify(manifest)
  if (patched === raw) return html
  log('boot manifest patched: mobile-fit row moved after connection, inject edge added')
  return html.slice(0, jsonStart) + patched + html.slice(scriptEnd)
}

function serveLoginPage(res, error) {
  res.writeHead(error ? 401 : 200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(loginPage(error))
}

// ── Plain HTTP proxy ─────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (TOKEN && !isAuthed(req)) {
    if (req.method === 'GET' && req.url === '/login') {
      log(`login page  ${req.url}`)
      return serveLoginPage(res)
    }
    if (req.method === 'POST' && req.url === '/login') {
      return handleLogin(req, res)
    }
    if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
      log(`redirect to login  ${req.url}`)
      res.writeHead(302, { location: '/login' })
      return res.end()
    }
    log(`denied  ${req.method} ${req.url}`)
    return text(res, 403, 'forbidden')
  }

  const proxyReq = http.request({
    protocol: TARGET.protocol,
    host: TARGET.hostname,
    port: TARGET.port || undefined,
    method: req.method,
    path: req.url,
    headers: { ...forwardHeaders(req), host: targetHost },
  }, (upstream) => {
    const type = upstream.headers['content-type'] ?? ''
    // dsh serves bundles with cache-control: no-cache and no validator
    // (no ETag), so every page load re-downloads the full bundle set —
    // seconds on a slow phone link. The rev query parameter is a content
    // hash (stable per content, verified), so immutable caching is safe:
    // the URL changes whenever the content changes.
    const revQuery = req.url !== undefined && /[?&]rev=[0-9a-fA-F]+/.test(req.url)
    let headers = upstream.headers
    if (revQuery && (headers['cache-control'] ?? '') !== '') {
      headers = { ...headers, 'cache-control': 'public, max-age=31536000, immutable' }
    }
    // text/html responses are rewritten (proxy flag + boot manifest patch);
    // the body must be buffered for that, so drop the stale content-length.
    if (req.method === 'GET' && type.includes('text/html')
        && (upstream.headers['content-encoding'] ?? '') === '') {
      const chunks = []
      upstream.on('data', (chunk) => { chunks.push(chunk) })
      upstream.on('end', () => {
        const rewritten = { ...headers }
        delete rewritten['content-length']
        res.writeHead(upstream.statusCode ?? 502, rewritten)
        res.end(rewriteHtml(Buffer.concat(chunks).toString('utf8')))
        log(`req ${req.method} ${req.url} -> ${upstream.statusCode ?? 502} (html, ${chunks.length} chunks)`)
      })
      upstream.on('error', () => { res.destroy() })
      return
    }
    res.writeHead(upstream.statusCode ?? 502, headers)
    upstream.pipe(res)
    upstream.on('end', () => { log(`req ${req.method} ${req.url} -> ${upstream.statusCode ?? 502}`) })
  })
  proxyReq.on('error', (error) => {
    log(`upstream error  ${req.method} ${req.url}  ${error.message}`)
    if (!res.headersSent) text(res, 502, 'bad gateway')
    else res.destroy()
  })
  req.pipe(proxyReq)
})

function handleLogin(req, res) {
  const chunks = []
  let size = 0
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > 8192) {
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const match = /(?:^|&)token=([^&]*)/.exec(body)
    const given = match === null ? '' : decodeURIComponent(match[1].replace(/\+/g, ' '))
    if (!safeEqual(given, TOKEN)) {
      log('login rejected')
      return serveLoginPage(res, true)
    }
    log('login accepted')
    res.writeHead(302, {
      location: '/',
      'set-cookie': `${COOKIE_NAME}=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`,
    })
    res.end()
  })
  req.on('error', () => { res.destroy() })
}

// ── WebSocket upgrade proxy (dsh event downlinks) ───────────────────────
// The browser's wss:// request rides the same trust fence on the upstream
// side; forwarding the handshake with the rewritten Host and no Origin
// passes it, and the 101 + raw bytes are relayed verbatim.
server.on('upgrade', (req, socket, head) => {
  if (TOKEN && !isAuthed(req)) {
    log(`upgrade denied  ${req.url}`)
    // end() (not destroy()) so the 403 body flushes before the socket closes.
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    return
  }
  const proxyReq = http.request({
    protocol: TARGET.protocol,
    host: TARGET.hostname,
    port: TARGET.port || undefined,
    method: req.method,
    path: req.url,
    agent: false,
    headers: {
      ...forwardHeaders(req),
      host: targetHost,
      connection: 'Upgrade',
      upgrade: req.headers.upgrade ?? 'websocket',
    },
  })
  proxyReq.on('upgrade', (upstream, upstreamSocket, upstreamHead) => {
    log(`upgrade established  ${req.url}`)
    socket.write('HTTP/1.1 101 Switching Protocols\r\n')
    const raw = upstream.rawHeaders
    for (let i = 0; i + 1 < raw.length; i += 2) {
      socket.write(`${raw[i]}: ${raw[i + 1]}\r\n`)
    }
    socket.write('\r\n')
    if (head.length > 0) upstreamSocket.write(head)
    if (upstreamHead.length > 0) socket.write(upstreamHead)
    upstreamSocket.pipe(socket).pipe(upstreamSocket)
    // Either side tearing down must not crash the proxy with a stray error.
    upstreamSocket.on('error', () => { socket.destroy() })
    socket.on('error', () => { upstreamSocket.destroy() })
  })
  proxyReq.on('error', (error) => {
    log(`upgrade error  ${req.url}  ${error.message}`)
    socket.destroy()
  })
  proxyReq.end()
})

server.listen(PORT, '127.0.0.1', () => {
  log(`remote-config proxy listening on 127.0.0.1:${PORT} -> ${TARGET.href}`)
  log(`token gate: ${TOKEN ? 'enabled' : 'disabled'}`)
})

function shutdown() {
  log('shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
