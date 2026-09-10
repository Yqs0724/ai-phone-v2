// 四层注入组装器：把"TA 该怎么回你"所需的全部上下文按层拼进 system prompt
// 层的顺序即逻辑：越上层越稳定（人设几乎不变），越下层越贴近当下（记忆实时生长）
import { db } from '../db.js'
import { getMemoriesForInjection } from './memory.js'
import { TONE_MAP } from './tone.js'

// 第 2 层 · 演法规范：固定不变的"怎么演"，防 OOC 的第一道防线
const ACTING_RULES = [
  '全程保持角色人设的语气、性格和说话习惯，绝不跳出角色。',
  '动作、神态、心理活动写在（）内，与台词自然穿插。',
  '不要代替用户说话或决定用户的反应。',
  '每次回复 1-3 个自然段，像真实聊天一样有呼吸感，不总结、不说教。',
].join('\n')

// 默认人设：开箱即聊（用户随时可在「档案」里改掉；姓名单独由 char_name 字段管理，不写在这里）
export const DEFAULT_PERSONA = `27 岁，投行副总裁。表面毒舌挑剔，实则心思极细，记得住对方所有小习惯。
不擅长直白表达关心，好意总用嫌弃的语气包装。熟了之后话会变多。`

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 组装一次对话所需的完整 messages */
export function buildMessages() {
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
  const persona = get('persona') || DEFAULT_PERSONA
  const worldbook = get('worldbook')
  const charName = get('char_name') || '顾衍'
  const userName = get('user_name') || ''

  // 第 1 层：人设 / 世界书（名字从档案独立注入，界面显示和 AI 认知用同一个数据源，不会各叫各的）
  const identity = [`你叫${charName}。`]
  if (userName) identity.push(`对方叫${userName}，是你正在聊天的人。`)
  const layers = [`# 角色设定\n${identity.join('')}\n${persona}`]
  if (worldbook) layers[0] += `\n\n# 世界观\n${worldbook}`

  // 第 2 层：演法规范
  layers.push(`# 演法规范\n${ACTING_RULES}`)

  // 第 3 层：现实世界锚点——AI 本身没有日历，今天几号必须由我们告诉它，否则它只会瞎编
  const now = new Date()
  const timeLines = [
    `今天是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日，星期${WEEKDAYS[now.getDay()]}，现在 ${now.toTimeString().slice(0, 5)}。`,
    '剧情中一切日期、节日、时间感都以此为准，被问到时如实回答。',
  ]
  const todayMmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const annivs = db.prepare('SELECT title, date, yearly FROM anniversaries ORDER BY date').all()
  if (annivs.length) {
    timeLines.push('你们之间的重要日子：')
    for (const a of annivs) {
      timeLines.push(`- ${a.title}：${a.date}${a.yearly ? '（每年）' : '（仅一次）'}${a.date === todayMmdd ? ' ← 就是今天，记得主动提起' : ''}`)
    }
  }
  layers.push(`# 现实世界\n${timeLines.join('\n')}`)

  // 第 4 层：剧情姿态（tone.js 每次对话后异步检测，这里读最新结果）
  const tone = get('tone')
  layers.push(`# 当前剧情姿态\n${TONE_MAP[tone] || TONE_MAP['热聊']}`)

  // 第 5 层：长期记忆（记忆服务负责提炼/衰减/取舍，这里只拿"当下最值得想起"的注入）
  const memories = getMemoriesForInjection()
  if (memories.length) {
    layers.push(`# 你记得的事\n${memories.map((f) => `- ${f}`).join('\n')}`)
  }

  // 历史取最近 20 条，防上下文超长
  const history = db
    .prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT 20')
    .all()
    .reverse()

  return [{ role: 'system', content: layers.join('\n\n') }, ...history]
}
