// Measure per-hop latency: direct (3080) vs proxy (3081) for the page,
// a session.list RPC, the WS handshake, and the first mux frame after a
// session event. Run: node scripts/measure-latency.mjs
import http from 'node:http'
import net from 'node:net'
import crypto from 'node:crypto'

const COOKIE = 'dsh_remote_config_token=wang2004'
const BODY = JSON.stringify({ type: 'client-request', rpcId: 'lat-' + Date.now(), method: 'session.list', payload: {} })

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', cookie: COOKIE, host: 'desktop-joyfish.tail5a41cc.ts.net' } }, (res) => {
      res.resume()
      res.on('end', () => resolve({ ms: performance.now() - start, status: res.statusCode }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

function page(port) {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const req = http.request({ host: '127.0.0.1', port, path: '/', method: 'GET', headers: { cookie: COOKIE, host: 'desktop-joyfish.tail5a41cc.ts.net' } }, (res) => {
      res.resume()
      res.on('end', () => resolve({ ms: performance.now() - start, status: res.statusCode }))
    })
    req.on('error', reject)
    req.end()
  })
}

function wsUpgrade(port, path) {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const key = crypto.randomBytes(16).toString('base64')
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: desktop-joyfish.tail5a41cc.ts.net\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nCookie: ${COOKIE}\r\n\r\n`)
    })
    let buf = ''
    socket.on('data', (d) => {
      buf += d.toString('utf8')
      if (buf.includes('\r\n\r\n')) {
        const headers = buf.slice(0, buf.indexOf('\r\n\r\n'))
        socket.destroy()
        resolve({ ms: performance.now() - start, status: headers.split('\r\n')[0] })
      }
    })
    socket.on('error', reject)
    setTimeout(() => { socket.destroy(); reject(new Error('timeout')) }, 10000)
  })
}

// WS + first frame after a session event: open mux, create a session, time the frame.
function wsWithFrame(port) {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const key = crypto.randomBytes(16).toString('base64')
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET /api/events.mux HTTP/1.1\r\nHost: desktop-joyfish.tail5a41cc.ts.net\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nCookie: ${COOKIE}\r\n\r\n`)
    })
    let buf = Buffer.alloc(0)
    let frameAt = null
    let fired = false
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d])
      const end = buf.indexOf('\r\n\r\n')
      if (end >= 0 && frameAt === null) {
        buf = buf.slice(end + 4)
        frameAt = performance.now() - start
        // trigger a session event through the SAME port
        post(port, '/api/session.create', '{}').then((r) => { /* event should arrive */ })
      }
      // crude frame scan for text frames
      while (buf.length >= 2) {
        const b0 = buf[0], b1 = buf[1]
        const opcode = b0 & 0x0f, len = b1 & 0x7f
        let offset = 2, plen = len
        if (len === 126) { if (buf.length < 4) break; plen = buf.readUInt16BE(2); offset = 4 }
        else if (len === 127) { if (buf.length < 10) break; plen = Number(buf.readBigUInt64BE(2)); offset = 10 }
        if (buf.length < offset + plen) break
        const payload = buf.slice(offset, offset + plen).toString('utf8')
        buf = buf.slice(offset + plen)
        if (opcode === 1 && !fired) {
          fired = true
          socket.destroy()
          resolve({ handshakeMs: frameAt, firstFrameMs: performance.now() - start, sample: payload.slice(0, 60) })
        }
      }
    })
    socket.on('error', reject)
    setTimeout(() => { socket.destroy(); reject(new Error('frame timeout')) }, 15000)
  })
}

for (const [label, port] of [['direct 3080', 3080], ['proxy 3081', 3081]]) {
  try {
    const p = await page(port)
    const s = await post(port, '/api/session.list', BODY)
    const w = await wsUpgrade(port, '/api/events.mux')
    console.log(`${label}: page ${p.ms.toFixed(0)}ms (${p.status}) | session.list ${s.ms.toFixed(0)}ms (${s.status}) | ws101 ${w.ms.toFixed(0)}ms`)
  } catch (e) {
    console.log(`${label}: ${e.message}`)
  }
}
try {
  const f = await wsWithFrame(3081)
  console.log(`proxy mux: handshake ${f.handshakeMs?.toFixed(0)}ms, first frame after event ${f.firstFrameMs.toFixed(0)}ms [${f.sample}]`)
} catch (e) {
  console.log(`proxy mux: ${e.message}`)
}
process.exit(0)
