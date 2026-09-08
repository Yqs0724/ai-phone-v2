// 弹药库路由：打标预览 / 入库 / 列表 / 删除 / 给梗
import { Router } from 'express'
import { db } from '../db.js'
import { tagMaterial, generatePlots } from '../services/arsenal.js'

const router = Router()
const parse = (m) => ({ ...m, tags: JSON.parse(m.tags || '{}') })

// 打标预览：只返回标签，不落库（用户确认后才入库）
router.post('/materials/tag', async (req, res, next) => {
  try {
    const rawText = req.body?.rawText?.trim()
    if (!rawText) return res.status(400).json({ error: '素材内容不能为空' })
    res.json(await tagMaterial(rawText))
  } catch (err) {
    next(err)
  }
})

// 确认入库
router.post('/materials', (req, res) => {
  const { rawText, type, title, tags } = req.body ?? {}
  if (!rawText?.trim() || !type || !tags) return res.status(400).json({ error: '缺少必要字段' })
  const info = db
    .prepare('INSERT INTO materials (raw_text, type, title, tags, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(rawText.trim(), type, title ?? '', JSON.stringify(tags), Date.now())
  res.json({ id: info.lastInsertRowid })
})

// 列表（数据量小，筛选放前端）
router.get('/materials', (_req, res) => {
  res.json(db.prepare('SELECT * FROM materials ORDER BY created_at DESC').all().map(parse))
})

router.delete('/materials/:id', (req, res) => {
  db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 给梗：按当前人设生成 3 个桥段
router.post('/plots', async (_req, res, next) => {
  try {
    res.json({ plots: await generatePlots() })
  } catch (err) {
    next(err)
  }
})

export default router
