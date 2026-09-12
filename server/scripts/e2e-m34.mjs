// M34 HTTP e2e: plan mode (A4) + write/undo (A2) + agent_runs trace (A4)
// Prereq: server on PORT=3399 (node dist/index.js), LLM configured in settings.
// Run from repo root: node server/scripts/e2e-m34.mjs
const API = 'http://127.0.0.1:3399'
let failed = 0
function check(name, ok, extra = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' -- ' + extra : ''}`)
}
async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'content-type': 'application/json' }, ...opts })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const conv = (await api('/api/conversations', { method: 'POST', body: '{}' })).body
console.log('conv:', conv.id)

try {
  // ---- A4 plan mode: only plans, no execution ----
  const need = '帮我记一个想法：E2E34 计划模式验证想法'
  const p1 = await api(`/api/conversations/${conv.id}/messages`, {
    method: 'POST', body: JSON.stringify({ content: need, planMode: true }),
  })
  check('planMode returns 201', p1.status === 201, String(p1.status))
  const planAction = p1.body.applied?.[0]
  check('plan action present', planAction?.tool === 'plan' && planAction?.planStatus === 'pending', JSON.stringify(planAction).slice(0, 120))
  check('plan text is a plan or "无需计划"', /1[.、]/.test(p1.body.content ?? '') || (p1.body.content ?? '').includes('无需计划'), (p1.body.content ?? '').slice(0, 80))
  // plan mode must not have created the task yet
  const s0 = await api('/api/tasks?x=1')
  const existsBefore = JSON.stringify(s0.body).includes('E2E34')
  check('plan mode does NOT execute', !existsBefore)

  // ---- execute the confirmed plan ----
  const p2 = await api(`/api/conversations/${conv.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: need, executePlan: planAction.text, planMsgId: p1.body.id }),
  })
  check('executePlan returns 201', p2.status === 201, String(p2.status))
  const writeAction = (p2.body.applied ?? []).find((a) => a.undoable)
  check('execution produced a write action', !!writeAction, JSON.stringify(p2.body.applied ?? []).slice(0, 200))
  check('clientActions field present (array)', Array.isArray(p2.body.clientActions))

  // plan message marked executed
  const detail = await api(`/api/conversations/${conv.id}`)
  const planMsg = detail.body.messages.find((m) => m.id === p1.body.id)
  check('plan message marked executed', planMsg?.actions?.[0]?.planStatus === 'executed', planMsg?.actions?.[0]?.planStatus)

  // ---- A4 trace: agent_runs by message ----
  const run = await api(`/api/agent-runs/by-message/${p2.body.id}`)
  check('agent_runs recorded', run.status === 200 && Array.isArray(run.body.rounds), String(run.status))
  check('trace has tool calls', (run.body.rounds ?? []).some((r) => (r.calls ?? []).length > 0), JSON.stringify(run.body.rounds ?? []).slice(0, 200))

  // ---- A2 undo: the created idea disappears; double undo rejected ----
  if (writeAction) {
    const u1 = await api(`/api/agent-actions/${writeAction.id}/undo`, { method: 'POST', body: '{}' })
    check('undo returns 200', u1.status === 200, JSON.stringify(u1.body))
    const tasksAfter = await api('/api/tasks')
    check('undo removed the idea', !JSON.stringify(tasksAfter.body).includes('E2E34'))
    const u2 = await api(`/api/agent-actions/${writeAction.id}/undo`, { method: 'POST', body: '{}' })
    check('double undo rejected (400)', u2.status === 400, String(u2.status))
  }
} finally {
  await api(`/api/conversations/${conv.id}`, { method: 'DELETE' }).catch(() => {})
  console.log('cleanup done (conv deleted)')
}
process.exit(failed ? 1 : 0)
