// DSH 远程控制 - 移动端客户端（零依赖，双语：默认跟随系统语言，可手动切换）
'use strict'

// ── 国际化 ──────────────────────────────────────────────────────────────
const I18N = {
  zh: {
    appName: 'DSH 远程控制', tokenHint: '请输入访问令牌（电脑端 remote-gateway/.env 中的 GATEWAY_TOKEN）',
    connect: '连接', logout: '退出', tabSessions: '会话', tabWorkspaces: '工作区',
    newSession: '新建会话', workspace: '工作区', cwd: '工作目录（留空用工作区路径）', create: '创建',
    send: '发送', inputPlaceholder: '消息（/ 开头为命令）', selectModel: '选择模型',
    sessionActions: '会话操作', rename: '重命名', fork: '派生副本', cancelRun: '停止运行',
    noSessions: '暂无会话，点击右下角 ＋ 新建', noWorkspaces: '暂无工作区，点击 ＋ 添加',
    addWorkspace: '添加工作区', workspacePath: '工作区目录路径', browsing: '文件浏览', up: '上级',
    running: '运行中', idle: '空闲', blank: '空白', archived: '已归档',
    approvalTitle: '需要审批', allowOnce: '允许一次', reject: '拒绝',
    questionTitle: '电脑端有待处理的提问', tokenSaved: '令牌已保存', tokenBad: '令牌无效，请检查',
    connected: '已连接', disconnected: '未连接', sent: '已发送', cancelled: '已停止',
    modelChanged: '模型已切换', renamed: '已重命名', forked: '已创建副本', created: '会话已创建',
    error: '出错了', tools: '工具', emptyMsg: '还没有消息',
  },
  en: {
    appName: 'DSH Remote', tokenHint: 'Enter the access token (GATEWAY_TOKEN in remote-gateway/.env on the PC)',
    connect: 'Connect', logout: 'Log out', tabSessions: 'Sessions', tabWorkspaces: 'Workspaces',
    newSession: 'New session', workspace: 'Workspace', cwd: 'Working dir (blank = workspace path)', create: 'Create',
    send: 'Send', inputPlaceholder: 'Message (starts with / for commands)', selectModel: 'Select model',
    sessionActions: 'Session actions', rename: 'Rename', fork: 'Fork copy', cancelRun: 'Stop',
    noSessions: 'No sessions. Tap + to create one', noWorkspaces: 'No workspaces. Tap + to add one',
    addWorkspace: 'Add workspace', workspacePath: 'Workspace directory path', browsing: 'Files', up: 'Up',
    running: 'running', idle: 'idle', blank: 'blank', archived: 'archived',
    approvalTitle: 'Approval required', allowOnce: 'Allow once', reject: 'Reject',
    questionTitle: 'There is a pending question on the PC', tokenSaved: 'Token saved', tokenBad: 'Invalid token',
    connected: 'Connected', disconnected: 'Disconnected', sent: 'Sent', cancelled: 'Stopped',
    modelChanged: 'Model changed', renamed: 'Renamed', forked: 'Forked', created: 'Session created',
    error: 'Error', tools: 'tools', emptyMsg: 'No messages yet',
  },
}
let lang = localStorage.getItem('gw-lang') || (navigator.language || '').startsWith('zh') ? 'zh' : 'en'
const t = (k) => I18N[lang][k] ?? k

// ── 全局状态 ────────────────────────────────────────────────────────────
let token = localStorage.getItem('gw-token') || ''
const state = {
  workspaces: [], sessions: [], activeWs: null,
  detail: null,           // { sessionId, title, cwd, running }
  history: new Map(),     // sessionId -> HistoryEntry[]
  pendingAssistant: new Map(), // sessionId -> { messageId, el }
  approvals: [],          // { rpcId, sessionId, approvalId, toolName, reason }
  models: null,           // llm.models
  sessionModels: null,    // session.models for active session
  files: null,            // { wsId, path, listing }
  es: null,
}

// ── DOM 助手 ────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel)
function el(tag, cls, text) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}
function toast(msg) {
  const node = $('#toast')
  node.textContent = msg
  node.classList.remove('hidden')
  clearTimeout(node._timer)
  node._timer = setTimeout(() => node.classList.add('hidden'), 2200)
}
function contentText(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks.map((b) => (b && b.type === 'text' ? b.text : '')).join('')
}

// ── API ─────────────────────────────────────────────────────────────────
// 全部使用相对路径：网关可能挂在子路径（如 /m/）下，绝对路径会解析到错误位置。
async function api(path, opts = {}) {
  const res = await fetch(path.replace(/^\//, ''), {
    method: opts.method || 'GET',
    headers: { authorization: `Bearer ${token}`, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`)
  return data
}

// ── SSE 事件流 ──────────────────────────────────────────────────────────
function connectSSE() {
  if (state.es) state.es.close()
  const es = new EventSource(`api/stream?token=${encodeURIComponent(token)}`)
  state.es = es
  es.addEventListener('hello', (ev) => {
    const { frame } = JSON.parse(ev.data)
    $('#status-dot').classList.toggle('on', !!frame.connected)
  })
  es.addEventListener('mux', (ev) => handleMux(JSON.parse(ev.data).frame))
  es.addEventListener('host', (ev) => handleHost(JSON.parse(ev.data).frame))
  es.onerror = () => $('#status-dot').classList.remove('on')
}

function handleMux(env) {
  if (env.type !== 'server-request') return
  const p = env.payload || {}
  switch (env.method) {
    case 'session/event':
      if (state.detail && p.sessionId === state.detail.sessionId) appendLiveEvent(p.event)
      break
    case 'session/projection':
      if (state.detail && p.sessionId === state.detail.sessionId) applyProjection(p)
      refreshSessionBadge(p.sessionId)
      break
    case 'approval/requested':
      state.approvals.push({ rpcId: env.rpcId, sessionId: p.sessionId, approvalId: p.approvalId, toolName: p.toolName, reason: p.reason })
      renderApprovals()
      break
    case 'approval/resolved':
      state.approvals = state.approvals.filter((a) => a.approvalId !== p.approvalId)
      renderApprovals()
      break
    case 'question/requested':
      toast(t('questionTitle'))
      break
    case 'stream/error':
      if (state.detail) $('#messages').appendChild(el('div', 'msg error', `${t('error')}: ${p.error?.message || ''}`))
      break
  }
}

function handleHost(env) {
  if (env.type !== 'server-request') return
  const p = env.payload || {}
  switch (env.method) {
    case 'host/session-added':
    case 'host/session-removed':
    case 'host/archived-sessions-changed':
      refreshSessions()
      break
    case 'host/session-status':
      refreshSessionBadge(p.sessionId)
      break
    case 'host/workspace-changed':
    case 'host/workspace-removed':
    case 'host/workspace-order-changed':
      refreshWorkspaces()
      break
  }
}

// ── 数据加载 ────────────────────────────────────────────────────────────
async function refreshSessions() {
  try {
    const data = await api('/api/sessions')
    state.sessions = data.items || []
    renderSessions()
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

async function refreshWorkspaces() {
  try {
    const data = await api('/api/workspaces')
    state.workspaces = data.items || []
    renderWorkspaces()
    renderWorkspaceChips()
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

function refreshSessionBadge(sessionId) {
  const card = document.querySelector(`[data-sid="${CSS.escape(sessionId)}"] .badge`)
  if (!card) return
  const s = state.sessions.find((x) => x.sessionId === sessionId)
  if (!s) return
  card.textContent = s.running ? t('running') : t('idle')
  card.className = 'badge' + (s.running ? ' running' : '')
}

// ── 渲染：会话列表 ──────────────────────────────────────────────────────
function renderWorkspaceChips() {
  const box = $('#workspace-chips')
  box.innerHTML = ''
  const all = el('button', 'chip' + (state.activeWs === null ? ' active' : ''), lang === 'zh' ? '全部' : 'All')
  all.onclick = () => { state.activeWs = null; renderSessions() }
  box.appendChild(all)
  for (const ws of state.workspaces) {
    const chip = el('button', 'chip' + (state.activeWs === ws.workspaceId ? ' active' : ''), ws.title)
    chip.onclick = () => { state.activeWs = ws.workspaceId; renderSessions() }
    box.appendChild(chip)
  }
}

function renderSessions() {
  const list = $('#session-list')
  list.innerHTML = ''
  const items = state.activeWs
    ? state.sessions.filter((s) => state.workspaces.find((w) => w.workspaceId === state.activeWs)?.sessionIds.includes(s.sessionId))
    : state.sessions
  if (!items.length) {
    list.appendChild(el('div', 'empty', t('noSessions')))
    return
  }
  for (const s of items) {
    const card = el('div', 'card')
    card.dataset.sid = s.sessionId
    const title = el('div', 'card-title')
    title.textContent = s.projections?.values?.title || (s.blank ? `(${t('blank')})` : s.sessionId.slice(0, 8))
    const badge = el('span', 'badge' + (s.running ? ' running' : '') + (s.blank ? ' blank' : ''))
    badge.textContent = s.running ? t('running') : t('idle')
    title.appendChild(badge)
    const sub = el('div', 'card-sub')
    sub.textContent = `${s.cwd || ''} · ${fmtTime(s.updatedAt)}`
    card.append(title, sub)
    card.onclick = () => openDetail(s)
    list.appendChild(card)
  }
}

// ── 渲染：工作区 ────────────────────────────────────────────────────────
function renderWorkspaces() {
  const list = $('#workspace-list')
  list.innerHTML = ''
  if (!state.workspaces.length) {
    list.appendChild(el('div', 'empty', t('noWorkspaces')))
    return
  }
  for (const ws of state.workspaces) {
    const card = el('div', 'card')
    const title = el('div', 'card-title')
    title.textContent = ws.title
    const badge = el('span', 'badge', `${ws.sessionIds.length}`)
    title.appendChild(badge)
    const sub = el('div', 'card-sub', ws.path)
    const browse = el('button', 'chip', t('browsing'))
    browse.onclick = (e) => { e.stopPropagation(); openFileBrowser(ws) }
    card.append(title, sub, browse)
    list.appendChild(card)
  }
}

// ── 渲染：会话详情 ──────────────────────────────────────────────────────
async function openDetail(s) {
  state.detail = { sessionId: s.sessionId, title: s.projections?.values?.title || s.sessionId.slice(0, 8), cwd: s.cwd, running: !!s.running }
  state.history.set(s.sessionId, [])
  state.pendingAssistant.set(s.sessionId, null)
  state.approvals = []
  $('#detail').classList.remove('hidden')
  $('#view-sessions').classList.add('hidden')
  renderDetailHeader()
  $('#messages').innerHTML = ''
  renderApprovals()
  loadHistory(s.sessionId)
}

function renderDetailHeader() {
  const d = state.detail
  $('#detail-title').textContent = d.title
  $('#detail-sub').textContent = `${d.cwd || ''} · ${d.running ? t('running') : t('idle')}`
}

function applyProjection(p) {
  const d = state.detail
  if (p.key === 'title' && typeof p.value === 'string') { d.title = p.value; renderDetailHeader() }
  if (p.key === 'sessionStats' && p.value) {
    d.running = !!p.value.running
    if (typeof p.value.running === 'boolean') { d.running = p.value.running; renderDetailHeader() }
  }
}

async function loadHistory(sessionId) {
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(sessionId)}/history?maxMessages=200`)
    const entries = data.events || []
    state.history.set(sessionId, entries)
    const box = $('#messages')
    box.innerHTML = ''
    for (const entry of entries) appendLiveEvent(entry.event || entry)
    box.scrollTop = box.scrollHeight
  } catch (err) {
    toast(`${t('error')}: ${err.message}`)
  }
}

/** 追加一条会话事件（历史与实时共用）。 */
function appendLiveEvent(ev) {
  const box = $('#messages')
  const d = state.detail
  if (!d) return
  const pending = state.pendingAssistant.get(d.sessionId)
  switch (ev.type) {
    case 'user/message':
      box.appendChild(el('div', 'msg user', contentText(ev.content)))
      break
    case 'assistant/chunk': {
      const text = ev.delta && ev.delta.type === 'text' ? ev.delta.text : (typeof ev.delta?.text === 'string' ? ev.delta.text : '')
      if (!text) break
      let node = pending && pending.messageId === ev.messageId ? pending.el : null
      if (!node) {
        node = el('div', 'msg assistant cursor')
        box.appendChild(node)
        state.pendingAssistant.set(d.sessionId, { messageId: ev.messageId, el: node })
      }
      node.textContent += text
      box.scrollTop = box.scrollHeight
      break
    }
    case 'assistant/message': {
      const node = pending && pending.messageId === ev.messageId ? pending.el : null
      if (node) { node.textContent = contentText(ev.content); node.classList.remove('cursor') }
      else if (contentText(ev.content)) box.appendChild(el('div', 'msg assistant', contentText(ev.content)))
      state.pendingAssistant.set(d.sessionId, null)
      box.scrollTop = box.scrollHeight
      break
    }
    case 'tool/call': {
      let args = ''
      try { args = JSON.stringify(ev.args).slice(0, 160) } catch { /* ignore */ }
      box.appendChild(el('div', 'msg tool', `🔧 ${ev.toolName}${args ? `  ${args}` : ''}`))
      box.scrollTop = box.scrollHeight
      break
    }
    case 'tool/result':
      box.appendChild(el('div', 'msg tool', `✔ ${ev.ok ? 'ok' : 'error'}`))
      box.scrollTop = box.scrollHeight
      break
    case 'stream/error':
      box.appendChild(el('div', 'msg error', `${t('error')}: ${ev.error?.message || ''}`))
      break
  }
}

function renderApprovals() {
  const area = $('#approval-area')
  area.innerHTML = ''
  for (const a of state.approvals) {
    if (state.detail && a.sessionId !== state.detail.sessionId) continue
    const card = el('div', 'approval')
    card.appendChild(el('div', 'a-title', `${t('approvalTitle')} · ${a.toolName}`))
    if (a.reason) card.appendChild(el('div', 'a-reason', a.reason))
    const btns = el('div', 'a-btns')
    const allow = el('button', 'btn allow', t('allowOnce'))
    allow.onclick = () => answerApproval(a, 'allowed-once')
    const reject = el('button', 'btn reject', t('reject'))
    reject.onclick = () => answerApproval(a, 'rejected')
    btns.append(allow, reject)
    card.appendChild(btns)
    area.appendChild(card)
  }
}

async function answerApproval(a, outcome) {
  try {
    await api(`/api/approvals/${encodeURIComponent(a.rpcId)}`, {
      method: 'POST',
      body: { sessionId: a.sessionId, approvalId: a.approvalId, outcome },
    })
    state.approvals = state.approvals.filter((x) => x !== a)
    renderApprovals()
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

// ── 文件浏览 ────────────────────────────────────────────────────────────
async function openFileBrowser(ws) {
  state.files = { wsId: ws.workspaceId, path: '' }
  $('#file-browser').classList.remove('hidden')
  await loadFiles()
}

async function loadFiles() {
  const f = state.files
  try {
    const data = await api(`/api/workspaces/${encodeURIComponent(f.wsId)}/files?path=${encodeURIComponent(f.path)}`)
    f.listing = data
    $('#fb-path').textContent = data.path
    const list = $('#fb-list')
    list.innerHTML = ''
    if (f.path) {
      const up = el('button', 'card', `↑ ${t('up')}`)
      up.onclick = () => { f.path = f.path.split(/[\\/]/).slice(0, -1).join('/'); loadFiles() }
      list.appendChild(up)
    }
    for (const entry of data.entries || []) {
      const card = el('div', 'card')
      const title = el('div', 'card-title', `${entry.kind === 'directory' ? '📁' : '📄'} ${entry.name}`)
      card.appendChild(title)
      if (entry.kind === 'directory') {
        card.onclick = () => { f.path = entry.path; loadFiles() }
      }
      list.appendChild(card)
    }
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

// ── 模型选择 ────────────────────────────────────────────────────────────
async function openModelPicker() {
  const d = state.detail
  if (!d) return
  try {
    if (!state.models) state.models = await api('/api/models')
    state.sessionModels = await api(`/api/sessions/${encodeURIComponent(d.sessionId)}/models`)
    const groups = state.models.groups || []
    const current = state.sessionModels.selection || {}
    const list = $('#mp-list')
    list.innerHTML = ''
    for (const g of groups) {
      const group = el('div', 'mp-group')
      group.appendChild(el('div', 'mp-provider', g.name))
      for (const m of g.models || []) {
        const btn = el('button', 'mp-model' + (current.provider === g.id && current.model === m.id ? ' active' : ''), m.name || m.id)
        btn.onclick = async () => {
          try {
            await api(`/api/sessions/${encodeURIComponent(d.sessionId)}/selectModel`, {
              method: 'POST', body: { provider: g.id, model: m.id, reasoningEffort: m.reasoning?.defaultEffort },
            })
            $('#model-picker').classList.add('hidden')
            toast(t('modelChanged'))
          } catch (err) { toast(`${t('error')}: ${err.message}`) }
        }
        group.appendChild(btn)
      }
      list.appendChild(group)
    }
    $('#model-picker').classList.remove('hidden')
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

// ── 动作 ────────────────────────────────────────────────────────────────
async function sendMessage() {
  const d = state.detail
  const input = $('#input')
  const text = input.value.trim()
  if (!d || !text) return
  input.value = ''
  input.style.height = 'auto'
  try {
    await api(`/api/sessions/${encodeURIComponent(d.sessionId)}/prompt`, { method: 'POST', body: { text, mode: 'queue' } })
    toast(t('sent'))
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

async function cancelSession() {
  const d = state.detail
  if (!d) return
  try {
    await api(`/api/sessions/${encodeURIComponent(d.sessionId)}/cancel`, { method: 'POST' })
    toast(t('cancelled'))
    $('#session-menu').classList.add('hidden')
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

async function renameSession() {
  const d = state.detail
  const title = prompt(t('rename'), d.title)
  if (!title) return
  try {
    await api(`/api/sessions/${encodeURIComponent(d.sessionId)}/rename`, { method: 'POST', body: { title } })
    d.title = title
    renderDetailHeader()
    $('#session-menu').classList.add('hidden')
    toast(t('renamed'))
    refreshSessions()
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

async function forkSession() {
  const d = state.detail
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(d.sessionId)}/fork`, { method: 'POST', body: {} })
    $('#session-menu').classList.add('hidden')
    toast(t('forked'))
    refreshSessions()
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

async function createSession() {
  const wsId = $('#ns-workspace').value || undefined
  const cwd = $('#ns-cwd').value.trim() || undefined
  try {
    const data = await api('/api/sessions', { method: 'POST', body: { workspaceId: wsId, cwd } })
    $('#new-session-modal').classList.add('hidden')
    toast(t('created'))
    refreshSessions()
    const s = state.sessions.find((x) => x.sessionId === data.sessionId)
    if (s) openDetail(s)
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

async function addWorkspace() {
  const path = prompt(t('addWorkspace') + ':\n' + t('workspacePath'))
  if (!path) return
  try {
    await api('/api/workspaces', { method: 'POST', body: { path } })
    toast(t('created'))
    refreshWorkspaces()
  } catch (err) { toast(`${t('error')}: ${err.message}`) }
}

// ── 界面切换 ────────────────────────────────────────────────────────────
function setLang(next) {
  lang = next
  localStorage.setItem('gw-lang', lang)
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  $('#lang-toggle').textContent = lang === 'zh' ? 'EN' : '中文'
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n) })
  $('#input').placeholder = t('inputPlaceholder')
  renderSessions(); renderWorkspaces(); renderApprovals()
  if (state.detail) renderDetailHeader()
}

function showLogin() {
  $('#login').classList.remove('hidden')
  $('#app').classList.add('hidden')
}

function enterApp() {
  $('#login').classList.add('hidden')
  $('#app').classList.remove('hidden')
  setLang(lang)
  connectSSE()
  refreshWorkspaces()
  refreshSessions()
}

// ── 事件绑定 ────────────────────────────────────────────────────────────
$('#token-submit').onclick = async () => {
  const value = $('#token-input').value.trim()
  if (!value) return
  const saved = token
  token = value
  try {
    const data = await api('/api/health')
    if (!data.ok) throw new Error('bad response')
    localStorage.setItem('gw-token', value)
    $('#login-error').textContent = ''
    enterApp()
  } catch (err) {
    token = saved
    $('#login-error').textContent = t('tokenBad')
  }
}
$('#logout-btn').onclick = () => {
  token = ''
  localStorage.removeItem('gw-token')
  state.es?.close()
  showLogin()
}
$('#lang-toggle').onclick = () => setLang(lang === 'zh' ? 'en' : 'zh')
$('#tab-sessions').onclick = () => {
  $('#tab-sessions').classList.add('active'); $('#tab-workspaces').classList.remove('active')
  $('#view-sessions').classList.remove('hidden'); $('#view-workspaces').classList.add('hidden')
}
$('#tab-workspaces').onclick = () => {
  $('#tab-workspaces').classList.add('active'); $('#tab-sessions').classList.remove('active')
  $('#view-workspaces').classList.remove('hidden'); $('#view-sessions').classList.add('hidden')
}
$('#new-session-btn').onclick = () => {
  const sel = $('#ns-workspace')
  sel.innerHTML = ''
  const none = el('option', '', lang === 'zh' ? '（不指定）' : '(none)')
  none.value = ''
  sel.appendChild(none)
  for (const ws of state.workspaces) {
    const opt = el('option', '', `${ws.title} — ${ws.path}`)
    opt.value = ws.workspaceId
    sel.appendChild(opt)
  }
  $('#new-session-modal').classList.remove('hidden')
}
$('#ns-close').onclick = () => $('#new-session-modal').classList.add('hidden')
$('#ns-create').onclick = createSession
$('#add-workspace-btn').onclick = addWorkspace
$('#detail-back').onclick = () => {
  $('#detail').classList.add('hidden')
  $('#view-sessions').classList.remove('hidden')
  state.detail = null
  refreshSessions()
}
$('#detail-menu').onclick = () => $('#session-menu').classList.remove('hidden')
$('#sm-close').onclick = () => $('#session-menu').classList.add('hidden')
$('#sm-rename').onclick = renameSession
$('#sm-fork').onclick = forkSession
$('#sm-model').onclick = () => { $('#session-menu').classList.add('hidden'); openModelPicker() }
$('#sm-cancel').onclick = cancelSession
$('#mp-close').onclick = () => $('#model-picker').classList.add('hidden')
$('#fb-back').onclick = () => $('#file-browser').classList.add('hidden')
$('#send-btn').onclick = sendMessage
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
})
$('#input').addEventListener('input', (e) => {
  e.target.style.height = 'auto'
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
})

// ── 启动 ────────────────────────────────────────────────────────────────
setLang(lang)
if (token) { enterApp() } else { showLogin() }
