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

// 人设 / 世界书读写
router.get('/settings', (_req, res) => {
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? ''
  res.json({ persona: get('persona'), worldbook: get('worldbook') })
})

router.put('/settings', (req, res) => {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const key of ['persona', 'worldbook']) {
    if (typeof req.body?.[key] === 'string') up.run(key, req.body[key])
  }
  res.json({ ok: true })
})

export default router
