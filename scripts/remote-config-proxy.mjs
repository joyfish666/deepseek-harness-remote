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

const LOGIN_PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh remote-config proxy</title>
<style>
  body { font-family: system-ui, sans-serif; background: #1f2937; color: #e5e7eb;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  form { background: #111827; padding: 24px; border-radius: 12px; width: min(320px, 86vw); }
  input { box-sizing: border-box; width: 100%; padding: 10px; margin: 8px 0 12px;
          border-radius: 8px; border: 1px solid #374151; background: #1f2937; color: #e5e7eb; }
  button { width: 100%; padding: 10px; border: none; border-radius: 8px;
           background: #3b82f6; color: white; font-size: 15px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  p { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
</style>
<form method="post" action="/login">
  <h1>dsh remote-config proxy</h1>
  <p>Enter the proxy token to unlock remote configuration.</p>
  <input type="password" name="token" placeholder="token" autofocus required>
  <button type="submit">Unlock</button>
</form>`

function serveLoginPage(res) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(LOGIN_PAGE)
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
    res.writeHead(upstream.statusCode ?? 502, upstream.headers)
    upstream.pipe(res)
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
      return text(res, 401, 'invalid token')
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
