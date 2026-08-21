// Smoke test for scripts/remote-config-proxy.mjs — zero dependencies.
// Starts a mock target that echoes the received headers (and supports an
// upgrade round-trip), spawns the proxy as a child, and asserts:
//   1. Host header is rewritten to the loopback target; Origin is deleted.
//   2. Cookie passthrough survives.
//   3. Token gate: deny without cookie, login flow, allow with cookie.
//   4. WebSocket upgrade: 101 relayed verbatim, bytes echo both ways.
// Run: node scripts/test-remote-config-proxy.mjs
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function startMockTarget() {
  const target = http.createServer((req, res) => {
    if (req.url === '/') {
      // A stand-in for the dsh entry page: boot manifest with mobile-fit
      // LAST (as the profile patch appends it) plus the flag-free head.
      const manifest = {
        rev: 'mock-1',
        entries: [
          { id: '@deepseek-ai/dsh-client-modules', url: '/plugins/m.js', rev: 'a', inject: [], immediately: true },
          { id: '@deepseek-ai/dsh-client-connection', url: '/plugins/c.js', rev: 'b', inject: [], immediately: true },
          { id: '@deepseek-ai/dsh-client-ui-settings', url: '/plugins/s.js', rev: 'c', inject: ['@deepseek-ai/dsh-client-connection'] },
          { id: 'mobile-fit', url: '/plugins/mobile-fit/client.js', rev: 'd', immediately: true },
        ],
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      // Note the spaces around "=" — the real dsh template writes
      // `window.__DSH_BOOT__ = {...}`; the rewrite must match that.
      res.end(`<!doctype html><head><title>dsh</title></head><body><script>window.__DSH_BOOT__ = ${JSON.stringify(manifest)}</script></body>`)
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      host: req.headers.host ?? null,
      origin: req.headers.origin ?? null,
      cookie: req.headers.cookie ?? null,
      upgrade: req.headers.upgrade ?? null,
    }))
  })
  target.on('upgrade', (req, socket) => {
    socket.on('error', () => {}) // client-side teardown is expected
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'X-Mock-Upgrade: yes',
      '',
      '',
    ].join('\r\n'))
    socket.on('data', (chunk) => socket.write(chunk)) // echo
  })
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => resolve(target))
  })
}

function startProxy(port, targetPort, token) {
  const env = {
    ...process.env,
    DSH_PROXY_PORT: String(port),
    DSH_PROXY_TARGET: `http://127.0.0.1:${targetPort}`,
  }
  // The ambient environment may carry a real DSH_PROXY_TOKEN (setx'd for the
  // deployment); never let it leak into a token-less test scenario.
  if (token) env.DSH_PROXY_TOKEN = token
  else delete env.DSH_PROXY_TOKEN
  const child = spawn(process.execPath, [join(ROOT, 'remote-config-proxy.mjs')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { output += d })
  return { child, output: () => output }
}

async function waitReady(port, token, proxy) {
  const path = token ? '/login' : '/'
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' })
      if (res.status > 0) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('proxy did not become ready; output: ' + (typeof proxy === 'undefined' ? '?' : proxy.output().slice(0, 800)))
}

function upgradeEcho(port, path, cookie) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: desktop-joyfish.tail5a41cc.ts.net`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        ...(cookie ? [`Cookie: ${cookie}`] : []),
        '',
        '',
      ].join('\r\n'))
    })
    let buffer = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const headers = buffer.slice(0, headerEnd)
      const rest = buffer.slice(headerEnd + 4)
      if (headers.includes('101 Switching Protocols')) {
        // Upgrade accepted: expect the echoed payload round-trip.
        if (rest.length >= 4) {
          finish({ headers, echoed: rest.slice(0, 4) })
        } else if (!socket._sent) {
          socket._sent = true
          socket.write('ping')
        }
      } else {
        // Rejected: headers alone are the whole story.
        finish({ headers, echoed: '' })
      }
    })
    socket.on('error', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error('upgrade socket error'))
      }
    })
    const timer = setTimeout(() => {
      socket.destroy()
      if (!settled) {
        settled = true
        reject(new Error('upgrade test timed out'))
      }
    }, 5000)
  })
}

let failures = 0
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!cond) failures += 1
}

// ── Test 1: no token — host rewrite, origin deletion, cookie passthrough ─
{
  const target = await startMockTarget()
  const targetPort = target.address().port
  const proxyPort = await getFreePort()
  const proxy = startProxy(proxyPort, targetPort, '')
  await waitReady(proxyPort, false, proxy)
  const res = await fetch(`http://127.0.0.1:${proxyPort}/api/session.list`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://desktop-joyfish.tail5a41cc.ts.net',
      'cookie': 'session=abc123',
    },
    body: '{}',
  })
  const seen = await res.json()
  check('status 200', res.status === 200, String(res.status))
  check('host rewritten to loopback target', seen.host === `127.0.0.1:${targetPort}`, seen.host)
  check('origin deleted', seen.origin === null)
  check('cookie passthrough', seen.cookie === 'session=abc123', seen.cookie)
  check('method/url preserved', seen.method === 'POST' && seen.url === '/api/session.list', `${seen.method} ${seen.url}`)
  proxy.child.kill('SIGTERM')
  target.close()
}

// ── Test 2: token gate ──────────────────────────────────────────────────
{
  const target = await startMockTarget()
  const targetPort = target.address().port
  const proxyPort = await getFreePort()
  const proxy = startProxy(proxyPort, targetPort, 's3cret-token')
  await waitReady(proxyPort, true, proxy)

  // Unauthenticated GET / redirects to the login page.
  const root = await fetch(`http://127.0.0.1:${proxyPort}/`, { redirect: 'manual' })
  check('unauth GET / -> 302', root.status === 302, String(root.status))
  check('302 location is /login', root.headers.get('location') === '/login', root.headers.get('location'))

  // Login page served.
  const login = await fetch(`http://127.0.0.1:${proxyPort}/login`)
  const loginHtml = await login.text()
  check('login page served', login.status === 200 && loginHtml.includes('proxy token'))

  // Wrong token rejected.
  const wrong = await fetch(`http://127.0.0.1:${proxyPort}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=wrong',
    redirect: 'manual',
  })
  check('wrong token -> 401', wrong.status === 401, String(wrong.status))

  // Right token accepted: 302 + cookie.
  const right = await fetch(`http://127.0.0.1:${proxyPort}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=s3cret-token',
    redirect: 'manual',
  })
  const setCookie = right.headers.get('set-cookie') ?? ''
  check('right token -> 302', right.status === 302, String(right.status))
  check('cookie issued (HttpOnly)', setCookie.includes('dsh_remote_config_token=s3cret-token') && setCookie.includes('HttpOnly'), setCookie)

  // No cookie -> 403 for API paths.
  const denied = await fetch(`http://127.0.0.1:${proxyPort}/api/settings.describe`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', redirect: 'manual',
  })
  check('api without cookie -> 403', denied.status === 403, String(denied.status))

  // With cookie -> proxied, host still rewritten.
  const cookie = setCookie.split(';')[0]
  const allowed = await fetch(`http://127.0.0.1:${proxyPort}/api/settings.describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: '{}',
  })
  const seen = await allowed.json()
  check('api with cookie -> 200', allowed.status === 200, String(allowed.status))
  check('host rewritten with cookie too', seen.host === `127.0.0.1:${targetPort}`, seen.host)
  check('origin deleted with cookie too', seen.origin === null)

  // Upgrade without cookie -> 403.
  const deniedUpgrade = await upgradeEcho(proxyPort, '/api/events.mux', undefined)
  check('upgrade without cookie -> 403', deniedUpgrade.headers.includes('403'), deniedUpgrade.headers.split('\r\n')[0])

  proxy.child.kill('SIGTERM')
  target.close()
}

// ── Test 3: WebSocket upgrade relay (no token) ──────────────────────────
{
  const target = await startMockTarget()
  const targetPort = target.address().port
  const proxyPort = await getFreePort()
  const proxy = startProxy(proxyPort, targetPort, '')
  await waitReady(proxyPort, false, proxy)

  const result = await upgradeEcho(proxyPort, '/api/events.mux', undefined)
  check('upgrade -> 101', result.headers.includes('101'), result.headers.split('\r\n')[0])
  check('upstream upgrade headers relayed', result.headers.includes('X-Mock-Upgrade: yes'))
  check('bytes echo both ways', result.echoed === 'ping', JSON.stringify(result.echoed))

  proxy.child.kill('SIGTERM')
  target.close()
}

// ── Test 4: HTML rewriting (proxy flag + boot-manifest reorder) ─────────
{
  const target = await startMockTarget()
  const targetPort = target.address().port
  const proxyPort = await getFreePort()
  const proxy = startProxy(proxyPort, targetPort, '')
  await waitReady(proxyPort, false, proxy)

  const page = await fetch(`http://127.0.0.1:${proxyPort}/`)
  const html = await page.text()
  check('html served', page.status === 200 && html.includes('<title>dsh</title>'))
  check('proxy flag injected', html.includes('<script>window.__DSH_PROXY__=true</script>'))

  const marker = '__DSH_BOOT__'
  const assignAt = html.indexOf(marker) + marker.length
  const jsonStart = html.indexOf('{', assignAt)
  const scriptEnd = html.indexOf('</script>', jsonStart)
  const manifest = JSON.parse(html.slice(jsonStart, scriptEnd).trim())
  const entries = manifest.entries
  const connIndex = entries.findIndex((e) => e.id === '@deepseek-ai/dsh-client-connection')
  const mfIndex = entries.findIndex((e) => e.id === 'mobile-fit')
  check('mobile-fit moved right after connection', mfIndex === connIndex + 1, `mf=${mfIndex} conn=${connIndex}`)
  check('mobile-fit got the inject edge', JSON.stringify(entries[mfIndex]?.inject) === JSON.stringify(['@deepseek-ai/dsh-client-connection']))
  check('other rows untouched', entries.some((e) => e.id === '@deepseek-ai/dsh-client-ui-settings'))

  proxy.child.kill('SIGTERM')
  target.close()
}

if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s)`)
  process.exit(1)
}
console.log('OK: remote-config-proxy behaves as specified')
