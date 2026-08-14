// remote-gateway 入口：零依赖（Node ≥22 内置 http/WebSocket）。
// 对外提供受 Token 保护的 REST API 与 SSE 事件流；对内连接本机 dsh。
import { createServer } from 'node:http'
import { readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, resolve, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DshClient } from './lib/dsh.js'
import { loadEnv, makePasswordAuth, makeRateLimit } from './lib/auth.js'
import { audit } from './lib/audit.js'

// ── 配置 ────────────────────────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const env = loadEnv(join(ROOT, '.env'))
const PORT = Number(env.GATEWAY_PORT ?? 3100)
const DSH_URL = env.DSH_URL ?? 'http://127.0.0.1:3080'
const PUBLIC_DIR = join(ROOT, 'public')
// 认证：用户在 .env 设置自己的 GATEWAY_PASSWORD；手机输入密码换取会话令牌。
// 兼容旧配置：未设置密码时退回 GATEWAY_TOKEN（原实现）。
const auth = makePasswordAuth(env.GATEWAY_PASSWORD ?? env.GATEWAY_TOKEN ?? '')
const rateLimit = makeRateLimit(240, 60_000)
const loginRateLimit = makeRateLimit(10, 60_000) // 登录接口单独限流（防爆破）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
}

// ── dsh 连接与 SSE 扇出 ─────────────────────────────────────────────────
const sseClients = new Set()

/** 向一个 SSE 客户端写帧；写失败（客户端已断开）绝不影响其他客户端。 */
function sseWrite(client, event, data) {
  try {
    if (client.res.writableEnded) return
    client.res.write(`event: ${event}\ndata: ${data}\n\n`)
  } catch { /* dead client */ }
}

const dsh = new DshClient({
  url: DSH_URL,
  onEvent(kind, frame) {
    const body = JSON.stringify({ kind, frame })
    for (const client of sseClients) sseWrite(client, kind, body)
  },
  onStateChange() {
    const hello = JSON.stringify({ kind: 'hello', frame: { connected: dsh.connected } })
    for (const client of sseClients) sseWrite(client, 'hello', hello)
  },
})
dsh.start()

// SSE 心跳：每 25 秒发注释帧，防止中间层/代理掐断空闲连接。
setInterval(() => {
  for (const client of sseClients) {
    try {
      if (!client.res.writableEnded) client.res.write(': ping\n\n')
    } catch { /* ignore */ }
  }
}, 25_000).unref()

// ── 工具函数 ────────────────────────────────────────────────────────────
function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolveBody({})
      try { resolveBody(JSON.parse(raw)) } catch { reject(new Error('请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

/** 静态文件服务（防目录穿越）。 */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/') rel = '/index.html'
  const target = normalize(join(PUBLIC_DIR, rel))
  if (!target.startsWith(PUBLIC_DIR + sep) && target !== PUBLIC_DIR) {
    return sendError(res, 403, 'forbidden', 'forbidden')
  }
  try {
    if (!statSync(target).isFile()) return sendError(res, 404, 'not-found', 'not found')
    const body = readFileSync(target)
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    sendError(res, 404, 'not-found', 'not found')
  }
}

/** 工作区文件浏览的路径约束：只允许在工作区根目录内。 */
function constrainPath(wsPath, requestPath) {
  const root = resolve(wsPath)
  const target = requestPath ? resolve(root, requestPath) : root
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}

// ── 路由 ────────────────────────────────────────────────────────────────
const routes = {
  // 健康检查
  async 'GET /api/health'(req, res) {
    sendJson(res, 200, { ok: true, dsh: { url: DSH_URL, connected: dsh.connected }, time: Date.now() })
  },
  // 工作区
  async 'GET /api/workspaces'() { return dsh.rpc('workspace.list', {}) },
  async 'POST /api/workspaces'(req, res, body) {
    if (typeof body.path !== 'string' || !body.path) return sendError(res, 400, 'invalid-path', 'path 必填')
    return dsh.rpc('workspace.create', { path: body.path })
  },
  async 'GET /api/workspaces/:id/files'(req, res, body, params, url) {
    const { items } = await dsh.rpc('workspace.list', {})
    const ws = items.find((w) => w.workspaceId === params.id)
    if (!ws) return sendError(res, 404, 'workspace-not-found', '工作区不存在')
    const target = constrainPath(ws.path, url.searchParams.get('path') ?? undefined)
    if (!target) return sendError(res, 403, 'outside-workspace', '只能浏览工作区内的文件')
    return dsh.rpc('host.listDirectory', { path: target })
  },
  // 会话
  async 'GET /api/sessions'() { return dsh.rpc('session.list', {}) },
  async 'POST /api/sessions'(req, res, body) {
    return dsh.rpc('session.create', {
      workspaceId: body.workspaceId,
      cwd: body.cwd,
      agentPreset: body.agentPreset,
    })
  },
  async 'GET /api/sessions/:id/history'(req, res, body, params, url) {
    return dsh.rpc('session.history', {
      sessionId: params.id,
      beforeSeq: url.searchParams.get('beforeSeq') ? Number(url.searchParams.get('beforeSeq')) : undefined,
      maxMessages: url.searchParams.get('maxMessages') ? Number(url.searchParams.get('maxMessages')) : undefined,
    })
  },
  async 'GET /api/sessions/:id/models'(req, res, body, params) {
    return dsh.rpc('session.models', { sessionId: params.id })
  },
  async 'POST /api/sessions/:id/prompt'(req, res, body) {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return sendError(res, 400, 'empty-prompt', '消息不能为空')
    return dsh.rpc('session.prompt', {
      sessionId: paramsOf(req).id,
      mode: body.mode === 'steer' ? 'steer' : 'queue',
      content: [{ type: 'text', text }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }, { timeoutMs: 30000 })
  },
  async 'POST /api/sessions/:id/cancel'(req, res, body) {
    return dsh.rpc('session.cancel', { sessionId: paramsOf(req).id })
  },
  async 'POST /api/sessions/:id/selectModel'(req, res, body) {
    if (typeof body.provider !== 'string' || typeof body.model !== 'string') {
      return sendError(res, 400, 'invalid-model', 'provider 与 model 必填')
    }
    return dsh.rpc('session.selectModel', {
      sessionId: paramsOf(req).id,
      provider: body.provider,
      model: body.model,
      reasoningEffort: body.reasoningEffort,
    })
  },
  async 'POST /api/sessions/:id/rename'(req, res, body) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return sendError(res, 400, 'invalid-title', 'title 必填')
    }
    return dsh.rpc('session.rename', { sessionId: paramsOf(req).id, title: body.title.trim() })
  },
  async 'POST /api/sessions/:id/fork'(req, res, body) {
    return dsh.rpc('session.fork', { sessionId: paramsOf(req).id, atSeq: body.atSeq })
  },
  // 模型目录
  async 'GET /api/models'() { return dsh.rpc('llm.models', {}) },
  async 'GET /api/providers'() { return dsh.rpc('llm.providers', {}) },
  // 审批应答：rpcId 来自事件流帧，回填 dsh
  async 'POST /api/approvals/:rpcId'(req, res, body, params) {
    const { sessionId, approvalId, outcome } = body
    if (!sessionId || !approvalId) return sendError(res, 400, 'invalid-approval', 'sessionId 与 approvalId 必填')
    if (outcome !== 'allowed-once' && outcome !== 'rejected') {
      return sendError(res, 400, 'invalid-outcome', 'outcome 只能是 allowed-once 或 rejected')
    }
    await dsh.respond(params.rpcId, { sessionId, approvalId, outcome })
    return { accepted: true }
  },
}

function paramsOf(req) { return req.__params ?? {} }

/** 路径模板匹配：/api/sessions/:id/prompt → params {id}。 */
function matchRoute(pathname, method) {
  for (const key of Object.keys(routes)) {
    const [m, pattern] = key.split(' ')
    if (m !== method) continue
    const segs = pattern.split('/').filter(Boolean)
    const parts = pathname.split('/').filter(Boolean)
    if (segs.length !== parts.length) continue
    const params = {}
    let ok = true
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].startsWith(':')) params[segs[i].slice(1)] = decodeURIComponent(parts[i])
      else if (segs[i] !== parts[i]) { ok = false; break }
    }
    if (ok) return { handler: routes[key], params }
  }
  return null
}

// ── HTTP 服务 ───────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const started = Date.now()
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname
  const ip = req.socket.remoteAddress ?? '?'

  try {
    if (pathname === '/api/login' && req.method === 'POST') {
      // 登录：输入密码 → 换取会话令牌（独立限流，防爆破）
      if (!loginRateLimit(ip)) {
        audit(`429 POST /api/login ip=${ip}`)
        return sendError(res, 429, 'rate-limited', '登录尝试过于频繁，请稍后再试')
      }
      const body = await readBody(req)
      if (typeof body.password !== 'string' || !auth.check(body.password)) {
        audit(`401 POST /api/login ip=${ip}`)
        return sendError(res, 401, 'bad-password', '密码错误')
      }
      audit(`200 POST /api/login ip=${ip}`)
      return sendJson(res, 200, { ok: true, token: auth.mint() })
    }
    if (pathname.startsWith('/api/')) {
      // 认证：SSE 用 ?token=，其余用 Authorization 头；校验会话令牌
      const h = req.headers.authorization
      const token = (h && h.startsWith('Bearer ') ? h.slice(7) : null) ?? url.searchParams.get('token')
      if (!auth.verify(token)) {
        audit(`401 ${req.method} ${pathname} ip=${ip}`)
        return sendError(res, 401, 'unauthorized', '需要有效的访问令牌（请先登录）')
      }
      if (!rateLimit(ip)) {
        audit(`429 ${req.method} ${pathname} ip=${ip}`)
        return sendError(res, 429, 'rate-limited', '请求过于频繁')
      }
      // SSE 事件流
      if (pathname === '/api/stream' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        })
        res.write(`event: hello\ndata: ${JSON.stringify({ kind: 'hello', frame: { connected: dsh.connected } })}\n\n`)
        const client = { res }
        sseClients.add(client)
        req.on('close', () => sseClients.delete(client))
        return
      }
      // REST
      const route = matchRoute(pathname, req.method)
      if (!route) return sendError(res, 404, 'not-found', '接口不存在')
      req.__params = route.params
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {}
      const value = await route.handler(req, res, body, route.params, url)
      if (!res.writableEnded) sendJson(res, 200, value ?? {})
      audit(`200 ${req.method} ${pathname} ip=${ip} ${Date.now() - started}ms`)
      return
    }
    // 静态资源
    if (req.method !== 'GET') return sendError(res, 405, 'method-not-allowed', 'method not allowed')
    serveStatic(req, res, pathname)
  } catch (err) {
    const status = err.code === 'session-not-found' ? 404 : 400
    audit(`${status} ${req.method} ${pathname} ip=${ip} ${Date.now() - started}ms error=${err.message}`)
    if (!res.writableEnded) sendError(res, status, err.code ?? 'rpc-error', err.message)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  audit(`remote-gateway listening on http://127.0.0.1:${PORT} (dsh: ${DSH_URL})`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    dsh.stop()
    for (const client of sseClients) { try { client.res.end() } catch { /* ignore */ } }
    server.close(() => process.exit(0))
  })
}
