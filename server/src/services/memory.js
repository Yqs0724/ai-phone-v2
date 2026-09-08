// 长期记忆服务：提炼 / 注入 / 衰减 / 取舍
import { db } from '../db.js'
import { chat } from './llm.js'

const MAX_MEMORIES = 50     // 记忆上限：超出按有效分淘汰（取舍）
const INJECT_LIMIT = 10     // 每次对话最多注入 10 条
const MIN_SCORE = 0.5       // 衰减地板：再旧也留一丝痕迹，去留交给「取舍」

// 有效分 = 重要性 - 时间衰减（闲置每 3 天降 1 分）
const effScore = (m) => {
  const idleDays = (Date.now() - m.last_used_at) / 86_400_000
  return Math.max(MIN_SCORE, m.importance - idleDays / 3)
}

// ── 注入：按有效分选出最值得记起的记忆，并刷新其"最近被想起"时间 ──
export function getMemoriesForInjection() {
  const all = db.prepare('SELECT * FROM memories').all()
  const chosen = all
    .map((m) => ({ ...m, eff: effScore(m) }))
    .sort((a, b) => b.eff - a.eff)
    .slice(0, INJECT_LIMIT)
  const bump = db.prepare('UPDATE memories SET last_used_at = ? WHERE id = ?')
  const now = Date.now()
  chosen.forEach((m) => bump.run(now, m.id)) // 被想起的记忆衰减清零，越用越牢
  return chosen.map((m) => m.fact)
}

// ── 提炼：对话后异步调用，从最近聊天中抽取关于用户的新事实 ──
export async function extractAndStore() {
  const recent = db
    .prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT 10')
    .all()
    .reverse()
  if (recent.length < 2) return

  const existing = db.prepare('SELECT fact FROM memories').all().map((r) => r.fact)
  const prompt = `你在为一款 AI 陪伴应用整理「长期记忆」。请从最近对话中提取值得长期记住的、关于【用户】的事实。

规则：
- 只记关于用户的事实（喜好、经历、约定、重要日期、当前状态），不记 AI 角色的设定
- 每条是一句独立完整的话（脱离上下文也能看懂），用第三人称"用户"
- importance 打分 1-10：重要约定/强烈情绪/关键个人信息 8-10；偏好习惯 5-7；随口一提 1-4
- 已有记忆（附后）不要重复提取
- 没有值得记的新事实，就返回空数组

已有记忆：
${existing.length ? existing.map((f) => `- ${f}`).join('\n') : '（空）'}

最近对话：
${recent.map((m) => `${m.role === 'user' ? '用户' : '角色'}：${m.content}`).join('\n')}

输出 JSON：{"facts": [{"fact": "...", "importance": 7}]}`

  const raw = await chat([{ role: 'user', content: prompt }], { json: true, temperature: 0 })
  let facts = []
  try {
    facts = JSON.parse(raw).facts ?? []
  } catch {
    return // LLM 返回了非法 JSON，本次提炼放弃，不阻塞聊天
  }

  const insert = db.prepare(
    'INSERT INTO memories (fact, importance, last_used_at, created_at) VALUES (?, ?, ?, ?)',
  )
  const now = Date.now()
  for (const f of facts.slice(0, 5)) {
    const text = typeof f?.fact === 'string' ? f.fact.trim() : ''
    if (!text) continue
    const score = Math.min(10, Math.max(1, Number(f.importance) || 5))
    insert.run(text, score, now, now)
  }

  // 取舍：超出上限时，淘汰有效分最低的记忆
  const all = db.prepare('SELECT * FROM memories').all()
  if (all.length > MAX_MEMORIES) {
    const sorted = all.map((m) => ({ ...m, eff: effScore(m) })).sort((a, b) => a.eff - b.eff)
    const del = db.prepare('DELETE FROM memories WHERE id = ?')
    sorted.slice(0, all.length - MAX_MEMORIES).forEach((m) => del.run(m.id))
  }
}

export function listMemories() {
  return db
    .prepare('SELECT id, fact, importance, last_used_at, created_at FROM memories ORDER BY importance DESC')
    .all()
}
