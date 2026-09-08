// 关怀域路由：纪念日的增删查（主动消息由心跳自动生成，无手动接口）
import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

router.get('/anniversaries', (_req, res) => {
  res.json(db.prepare('SELECT * FROM anniversaries ORDER BY date').all())
})

router.post('/anniversaries', (req, res) => {
  const { title, date, yearly } = req.body ?? {}
  if (!title?.trim() || !/^\d{2}-\d{2}$/.test(date ?? '')) {
    return res.status(400).json({ error: '需要 title 和 MM-DD 格式的 date' })
  }
  const info = db
    .prepare('INSERT INTO anniversaries (title, date, yearly, created_at) VALUES (?, ?, ?, ?)')
    .run(title.trim(), date, yearly ? 1 : 0, Date.now())
  res.json({ id: info.lastInsertRowid })
})

router.delete('/anniversaries/:id', (req, res) => {
  db.prepare('DELETE FROM anniversaries WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
