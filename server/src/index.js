import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import './db.js' // 引入即完成建表
import chatRouter from './routes/chat.js'
import careRouter from './routes/care.js'
import arsenalRouter from './routes/arsenal.js'
import { startHeartbeat } from './services/proactive.js'
import { startAnniversaryCron } from './services/anniversary.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '2mb' }))

// ── API 路由（按模块挂载） ──
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))
app.use('/api', chatRouter)
app.use('/api', careRouter)
app.use('/api', arsenalRouter)

// ── 生产模式：托管前端构建产物（单端口全栈，手机只访问一个地址） ──
const distDir = path.join(__dirname, '..', '..', 'client', 'dist')
app.use(express.static(distDir))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(distDir, 'index.html'), (err) => err && next())
})

// 统一错误出口：业务路由 throw 的错误都在这里变成可读的 500
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || '服务器开小差了' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address
  console.log(`✅ 小手机 v2 后端已启动: http://localhost:${PORT}`)
  if (lan) console.log(`📱 手机同 WiFi 可访问: http://${lan}:${PORT}`)
  startHeartbeat()      // 主动消息心跳
  startAnniversaryCron() // 纪念日巡检
})
