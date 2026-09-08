// 纪念日服务：每分钟巡检，到了当天的纪念日就由角色主动发起庆祝（当天只庆祝一次）
import { db } from '../db.js'
import { chat } from './llm.js'
import { buildMessages } from './prompt.js'

export function startAnniversaryCron() {
  setInterval(() => {
    checkAnniversaries().catch((e) => console.error('纪念日检查失败：', e.message))
  }, 60_000)
  console.log('🎉 纪念日检查已启动（每分钟巡检）')
}

async function checkAnniversaries() {
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const today = now.toISOString().slice(0, 10)

  const list = db.prepare('SELECT * FROM anniversaries WHERE date = ?').all(mmdd)
  for (const a of list) {
    const flag = `anniv_${a.id}_${today}` // 用 settings 做"今日已庆祝"标记，免去改表结构
    if (db.prepare('SELECT value FROM settings WHERE key = ?').get(flag)) continue

    const messages = buildMessages()
    messages.push({
      role: 'system',
      content: `【系统】今天是「${a.title}」。请以角色身份主动发起庆祝或提及这个日子，语气符合人设和当前剧情姿态。`,
    })
    const content = await chat(messages)
    db.prepare('INSERT INTO messages (role, content, is_proactive, created_at) VALUES (?, ?, 1, ?)').run(
      'assistant', content, Date.now(),
    )
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING').run(flag, '1')
  }
}
