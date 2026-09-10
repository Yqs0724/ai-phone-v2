// 对话模块路由：消息历史 / 发消息（含四层注入+LLM） / 人设设置 / 记忆查看
import { Router } from 'express'
import { db } from '../db.js'
import { chat } from '../services/llm.js'
import { buildMessages } from '../services/prompt.js'
import { extractAndStore, listMemories } from '../services/memory.js'
import { detectAndStoreTone } from '../services/tone.js'

const router = Router()

router.get('/messages', (_req, res) => {
  const rows = db
    .prepare('SELECT id, role, content, is_proactive, created_at FROM messages ORDER BY id')
    .all()
  res.json(rows)
})

router.post('/messages', async (req, res, next) => {
  try {
    const content = req.body?.content?.trim()
    if (!content) return res.status(400).json({ error: '消息不能为空' })

    // 先存用户消息：即使 LLM 失败，用户的这句话也不丢
    db.prepare('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)').run(
      'user', content, Date.now(),
    )

    const reply = await chat(buildMessages())
    const info = db
      .prepare('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)')
      .run('assistant', reply, Date.now())
    res.json({ id: info.lastInsertRowid, role: 'assistant', content: reply })

    // 响应已发出，再异步做两件"后台作业"：提炼记忆 + 检测剧情姿态
    // 都不阻塞聊天，失败各自静默记录
    extractAndStore().catch((e) => console.error('记忆提炼失败：', e.message))
    detectAndStoreTone().catch((e) => console.error('姿态检测失败：', e.message))
  } catch (err) {
    next(err)
  }
})

// 记忆查看（调试用：TA 到底记住了什么）
router.get('/memories', (_req, res) => res.json(listMemories()))

// 消息编辑 / 撤回：直接改库，AI 读的历史就是改后的版本（等于悄悄改写了 TA 的记忆）
router.put('/messages/:id', (req, res) => {
  const content = req.body?.content?.trim()
  if (!content) return res.status(400).json({ error: '消息不能为空' })
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, req.params.id)
  res.json({ ok: true })
})

router.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 重说：对某条消息不满意，剪掉这之后的剧情分支，让 TA 基于上文重新回应
// assistant 消息 → 连这条回复一起删；user 消息 → 保留这句，删掉其后所有（含旧回复）
router.post('/messages/:id/regenerate', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const msg = db.prepare('SELECT id, role FROM messages WHERE id = ?').get(id)
    if (!msg) return res.status(404).json({ error: '消息不存在' })
    db.prepare(`DELETE FROM messages WHERE id ${msg.role === 'assistant' ? '>=' : '>'} ?`).run(id)

    const reply = await chat(buildMessages())
    const info = db
      .prepare('INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)')
      .run('assistant', reply, Date.now())
    res.json({ id: info.lastInsertRowid, role: 'assistant', content: reply })

    // 和正常发消息一样，异步提炼记忆 + 检测剧情姿态
    extractAndStore().catch((e) => console.error('记忆提炼失败：', e.message))
    detectAndStoreTone().catch((e) => console.error('姿态检测失败：', e.message))
  } catch (err) {
    next(err)
  }
})

// 记忆修改 / 删除：记错了可以人工纠正，不想被记住的可以忘掉
router.put('/memories/:id', (req, res) => {
  const fact = req.body?.fact?.trim()
  if (!fact) return res.status(400).json({ error: '记忆内容不能为空' })
  db.prepare('UPDATE memories SET fact = ? WHERE id = ?').run(fact, req.params.id)
  res.json({ ok: true })
})

router.delete('/memories/:id', (req, res) => {
  db.prepare('DELETE FROM memories WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 档案读写：人设 / 世界书 / 双方名字 / 双方头像（头像为 base64，体积小直接进 settings 表）
const SETTING_KEYS = ['persona', 'worldbook', 'char_name', 'user_name', 'char_avatar', 'user_avatar']

router.get('/settings', (_req, res) => {
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? ''
  res.json(Object.fromEntries(SETTING_KEYS.map((k) => [k, get(k)])))
})

router.put('/settings', (req, res) => {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const key of SETTING_KEYS) {
    if (typeof req.body?.[key] === 'string') up.run(key, req.body[key])
  }
  res.json({ ok: true })
})

export default router
