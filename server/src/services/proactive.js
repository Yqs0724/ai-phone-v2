// 主动消息服务：心跳巡检 + 触发判断 + 生成主动开口
// 阈值支持环境变量覆盖，方便测试（正常用默认值即可）
import { db } from '../db.js'
import { chat } from './llm.js'
import { buildMessages } from './prompt.js'

const SILENCE_THRESHOLD = Number(process.env.PROACTIVE_SILENCE_MS || 3 * 60_000) // 冷场多久后考虑开口
const CHECK_INTERVAL = Number(process.env.PROACTIVE_CHECK_MS || 20_000)        // 心跳间隔
const COOLDOWN = Number(process.env.PROACTIVE_COOLDOWN_MS || 10 * 60_000)      // 两次主动的最小间隔（防刷屏）

export function startHeartbeat() {
  setInterval(async () => {
    try {
      await maybeSpeak()
    } catch (e) {
      console.error('主动消息失败：', e.message)
    }
  }, CHECK_INTERVAL)
  console.log(`💗 主动消息心跳已启动（每 ${CHECK_INTERVAL / 1000}s 巡检，冷场阈值 ${SILENCE_THRESHOLD / 60000}min）`)
}

async function maybeSpeak() {
  const lastUser = db.prepare("SELECT created_at FROM messages WHERE role = 'user' ORDER BY id DESC LIMIT 1").get()
  if (!lastUser) return                                              // 还没聊过，不打扰
  if (Date.now() - lastUser.created_at < SILENCE_THRESHOLD) return   // 还在热聊中

  const lastProactive = db.prepare('SELECT created_at FROM messages WHERE is_proactive = 1 ORDER BY id DESC LIMIT 1').get()
  if (lastProactive && Date.now() - lastProactive.created_at < COOLDOWN) return // 冷却期

  const last = db.prepare('SELECT is_proactive FROM messages ORDER BY id DESC LIMIT 1').get()
  if (last?.is_proactive) return                                     // 上次主动还没被回应，保持安静

  // 用四层注入的完整上下文 + 一条系统指令，让 TA"按人设和当前姿态"主动开口
  const messages = buildMessages()
  messages.push({
    role: 'system',
    content: '【系统】用户有一会儿没说话了。现在轮到你主动开口：按当前剧情姿态发一条自然的消息，可以说你正在做的事，也可以提起你们之前聊过的事。禁止问"在吗"。',
  })
  const content = await chat(messages)
  db.prepare('INSERT INTO messages (role, content, is_proactive, created_at) VALUES (?, ?, 1, ?)').run(
    'assistant', content, Date.now(),
  )
}
