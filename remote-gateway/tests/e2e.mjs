// M2 端到端验收脚本：真实调用 remote-gateway（含 SSE 事件流）。
// 用法：node tests/e2e.mjs
// 覆盖：认证（密码登录）、健康、SSE 流、建会话、发消息（实时事件）、取消、历史、工作区文件浏览。
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadEnv } from '../lib/auth.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const env = loadEnv(join(ROOT, '..', '.env'))
const BASE = `http://127.0.0.1:${env.GATEWAY_PORT ?? 3100}`
const PASSWORD = env.GATEWAY_PASSWORD ?? env.GATEWAY_TOKEN ?? ''
let TOKEN = '' // 登录后签发
const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: { authorization: `Bearer ${TOKEN}`, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

/** 打开 SSE 并收集事件。返回 { events, close } */
async function openSSE() {
  const res = await fetch(`${BASE}/api/stream?token=${encodeURIComponent(TOKEN)}`)
  if (!res.ok || !res.body) throw new Error(`SSE open failed: ${res.status}`)
  const events = []
  let buf = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const evLine = raw.split('\n').find((l) => l.startsWith('event: '))
        const dataLine = raw.split('\n').find((l) => l.startsWith('data: '))
        if (evLine && dataLine) {
          try {
            const payload = JSON.parse(dataLine.slice(6)) // {kind, frame}；frame 才是 dsh 信封
            events.push({ event: evLine.slice(7), frame: payload.frame })
          } catch { /* skip */ }
        }
      }
    }
  }
  pump()
  return { events, close: () => reader.cancel().catch(() => {}) }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 1. 认证（密码登录）与健康 ──────────────────────────────────────────
{
  const noAuth = await fetch(`${BASE}/api/health`)
  check('无令牌被拒 (401)', noAuth.status === 401, `status=${noAuth.status}`)
  const bad = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'definitely-wrong' }),
  })
  check('错误密码被拒 (401)', bad.status === 401, `status=${bad.status}`)
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const loginData = await login.json().catch(() => null)
  TOKEN = loginData?.token ?? ''
  check('密码登录成功并签发令牌', login.status === 200 && !!TOKEN)
  const health = await api('/api/health')
  check('健康检查（会话令牌有效）', health.status === 200 && health.data?.ok === true && health.data?.dsh?.connected === true,
    `dsh connected=${health.data?.dsh?.connected}`)
}

// ── 2. 工作区与文件浏览 ────────────────────────────────────────────────
let wsId = null
{
  const ws = await api('/api/workspaces')
  check('工作区列表', ws.status === 200 && Array.isArray(ws.data?.items) && ws.data.items.length > 0,
    `${ws.data?.items?.length} 个工作区`)
  wsId = ws.data.items[0]?.workspaceId
  if (wsId) {
    const files = await api(`/api/workspaces/${encodeURIComponent(wsId)}/files`)
    check('工作区文件浏览', files.status === 200 && Array.isArray(files.data?.entries), `path=${files.data?.path}`)
    const esc = await api(`/api/workspaces/${encodeURIComponent(wsId)}/files?path=${encodeURIComponent('../../..')}`)
    check('越界浏览被拒 (403)', esc.status === 403, `status=${esc.status}`)
  }
}

// ── 3. SSE + 建会话 + 发消息（实时事件）────────────────────────────────
let sessionId = null
{
  const sse = await openSSE()
  // 工作目录用系统临时目录：测试会话的 agent 若写文件（如计数任务），产物不污染仓库
  const created = await api('/api/sessions', { method: 'POST', body: { cwd: join(tmpdir(), 'dsh-e2e') } })
  check('新建会话', created.status === 200 && !!created.data?.sessionId, created.data?.sessionId)
  sessionId = created.data?.sessionId

  const prompt = await api(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: 'POST', body: { text: '请只回复两个字：收到', mode: 'queue' },
  })
  check('发送消息', prompt.status === 200 && prompt.data?.accepted === true)

  // 等待 assistant 消息出现在事件流（最多 90s）
  const deadline = Date.now() + 90_000
  let sawUser = false, sawChunk = false, sawAssistant = false, sawTool = false
  while (Date.now() < deadline) {
    for (const { frame } of sse.events) {
      const p = frame.payload || {}
      if (frame.method === 'session/event' && p.sessionId === sessionId) {
        if (p.event?.type === 'user/message') sawUser = true
        if (p.event?.type === 'assistant/chunk') sawChunk = true
        if (p.event?.type === 'assistant/message') sawAssistant = true
        if (p.event?.type === 'tool/call') sawTool = true
      }
    }
    if (sawAssistant) break
    await wait(1000)
  }
  check('SSE 收到 user/message', sawUser)
  check('SSE 收到 assistant/chunk（流式）', sawChunk)
  check('SSE 收到 assistant/message（完成）', sawAssistant)
  const dist = {}
  for (const { frame } of sse.events) dist[frame.method ?? '(hello)'] = (dist[frame.method ?? '(hello)'] ?? 0) + 1
  console.log(`      SSE 共收到 ${sse.events.length} 个事件帧：${JSON.stringify(dist)}`)

  // ── 4. 取消 ──────────────────────────────────────────────────────────
  const long = await api(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: 'POST', body: { text: '请持续输出数字，从 1 数到 100000，不要停', mode: 'queue' },
  })
  check('发送长任务', long.status === 200)
  await wait(4000)
  const cancel = await api(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' })
  check('取消运行', cancel.status === 200 && cancel.data?.accepted === true)

  sse.close()

  // ── 5. 历史 ──────────────────────────────────────────────────────────
  const hist = await api(`/api/sessions/${encodeURIComponent(sessionId)}/history?maxMessages=50`)
  const events = (hist.data?.events || []).map((e) => e.event ?? e)
  const types = events.map((e) => e.type)
  check('历史包含 user/message', types.includes('user/message'))
  check('历史包含 assistant/message', types.includes('assistant/message'))
  const userEv = events.find((e) => e.type === 'user/message')
  const asstEv = events.find((e) => e.type === 'assistant/message')
  check('user/message 载荷在 data.content（渲染字段）', Array.isArray(userEv?.data?.content))
  check('assistant/message 载荷在 data.message.content（渲染字段）', Array.isArray(asstEv?.data?.message?.content))
  console.log(`      历史事件类型：${[...new Set(types)].join(', ')}（工具调用与否取决于模型是否用工具）`)

  // ── 6. 写操作（重命名） ──────────────────────────────────────────────
  const renamed = await api(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
    method: 'POST', body: { title: '[E2E] 网关验收测试' },
  })
  check('重命名会话（写操作）', renamed.status === 200 && renamed.data?.title === '[E2E] 网关验收测试')
}

// ── 7. 新功能：预设 / 搜索 / 目标 / 归档 ────────────────────────────────
{
  const presets = await api('/api/presets')
  check('预设列表', presets.status === 200 && Array.isArray(presets.data?.items))

  const search = await api('/api/search?q=' + encodeURIComponent('收到'))
  check('会话内容搜索', search.status === 200 && Array.isArray(search.data?.items),
    `${search.data?.items?.length} 条结果`)

  const goal = await api(`/api/sessions/${encodeURIComponent(sessionId)}/goals`, {
    method: 'POST', body: { objective: '[E2E] 验收测试目标' },
  })
  check('设置目标', goal.status === 200, goal.data?.error?.message ?? '')

  const arch = await api(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, { method: 'POST' })
  check('归档会话（删除）', arch.status === 200)
  console.log('      （测试会话已自动归档，不污染列表）')
}

// ── 汇总 ────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
process.exit(failed.length ? 1 : 0)
