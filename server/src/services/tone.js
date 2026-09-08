// 剧情姿态服务：检测当前对话氛围（热聊/平淡/冷战），结果供四层注入的第 3 层使用
import { db } from '../db.js'
import { chat } from './llm.js'

// 姿态 → 注入指令：同一个人设，在不同氛围下"演法"不同
export const TONE_MAP = {
  '热聊': '热聊期：气氛正好，回复可以放肆鲜活，主动延伸话题。',
  '平淡': '平淡期：对话在变短变少，带一点想被关心的慵懒，轻轻撩起一个新话题。',
  '冷战': '冷战期：气氛有点僵，语气克制、带试探性的示好，别假装无事发生。',
}

const upsert = () =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

export async function detectAndStoreTone() {
  const recent = db
    .prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT 8')
    .all()
    .reverse()
  if (recent.length < 3) return // 对话太短，判不出氛围

  const raw = await chat(
    [
      {
        role: 'user',
        content: `根据以下对话，判断当前氛围属于哪一类：热聊 / 平淡 / 冷战。
判断依据：回复长度与情绪浓度下降=平淡；有争执或明显敷衍、客气=冷战；你来我往情绪饱满=热聊。
只输出 JSON：{"tone":"三类之一"}

${recent.map((m) => `${m.role === 'user' ? '用户' : '角色'}：${m.content}`).join('\n')}`,
      },
    ],
    { json: true, temperature: 0 },
  )
  try {
    const { tone } = JSON.parse(raw)
    if (TONE_MAP[tone]) upsert().run('tone', tone)
  } catch {
    /* 本次检测失败就沿用旧姿态，不影响聊天 */
  }
}
