// 弹药库服务：素材打标 + 按人设给梗（v2 核心差异点）
import { db } from '../db.js'
import { chat } from './llm.js'
import { getMemoriesForInjection } from './memory.js'

const TYPES = ['剧情点子', '角色卡', 'prompt技巧']
const STAGES = ['开篇', '续命', '收尾']
const arr = (v) => (Array.isArray(v) ? v.map(String).slice(0, 3) : [])

// ── 打标：原始文本 → 结构化标签（词表兜底校验，防 LLM 自由发挥） ──
export async function tagMaterial(rawText) {
  const raw = await chat(
    [
      {
        role: 'user',
        content: `你是内容整理助手，给一条角色扮演素材打标签。

要求：
- type 三选一：${TYPES.join(' / ')}
- title：一句话概括，不超过 15 字
- tags.personaTypes：适用的人设类型 1-3 个（如 病娇、年上、宿敌、青梅竹马）
- tags.stage 三选一：${STAGES.join(' / ')}（"续命"指剧情平淡期用来救场的梗）
- tags.flavors：从 甜/虐/冲突/日常/悬疑/搞笑 中选 1-3 个

输出 JSON：{"type":"...","title":"...","tags":{"personaTypes":["..."],"stage":"...","flavors":["..."]}}

素材原文：
${rawText.slice(0, 2000)}`,
      },
    ],
    { json: true, temperature: 0 },
  )
  const parsed = JSON.parse(raw)
  return {
    type: TYPES.includes(parsed.type) ? parsed.type : '剧情点子',
    title: String(parsed.title || rawText.slice(0, 15)),
    tags: {
      personaTypes: arr(parsed?.tags?.personaTypes),
      stage: STAGES.includes(parsed?.tags?.stage) ? parsed.tags.stage : '续命',
      flavors: arr(parsed?.tags?.flavors),
    },
  }
}

// ── 给梗：人设 + 命中素材 + 记忆去重 + 反同质化约束 → 3 个可粘贴的桥段 ──
export async function generatePlots() {
  const persona =
    db.prepare("SELECT value FROM settings WHERE key = 'persona'").get()?.value ||
    '顾衍：27 岁投行副总裁，表面毒舌挑剔，实则心细，好意总用嫌弃包装'

  // 选材：优先"续命"阶段素材，其余按入库时间倒序，共取 6 条
  const all = db.prepare('SELECT * FROM materials').all()
  const ranked = all
    .sort((a, b) => Number((b.tags || '').includes('续命')) - Number((a.tags || '').includes('续命')) || b.created_at - a.created_at)
    .slice(0, 6)

  // 记忆去重：已聊过的事/已用过的梗，不再推荐
  const memories = getMemoriesForInjection()

  const prompt = `你是一名角色扮演编剧，任务是帮用户给当前角色「续命」剧情。

【当前人设】
${persona}

【素材库：可借鉴的梗】
${ranked.length ? ranked.map((m, i) => `${i + 1}.（${m.type}）${m.raw_text.slice(0, 300)}`).join('\n') : '（素材库为空，自由发挥，但仍须遵守下方反同质化要求）'}

【已发生/已用过的，禁止重复】
${memories.length ? memories.map((f) => `- ${f}`).join('\n') : '（无）'}

【反同质化要求，必须全部满足】
1. 禁止泛泛的恋爱日常（吃饭/看电影/逛街/早安晚安）——那是用户最痛恨的"无聊恋爱期"
2. 每个桥段必须利用人设里的独有设定，换一个普通恋人就讲不通
3. 每个桥段必须制造新冲突或信息差（秘密、误会、意外、立场对立、 deadline），让剧情有前进的动力
4. 素材只是灵感来源，要改写成人设风格，不许照抄

输出 JSON：{"plots":[{"title":"桥段名","setup":"2-3 句剧情说明","opener":"用户可直接粘贴发给角色的开场白（以用户视角写，含动作）","whyFit":"一句话：为什么这个梗专属于这个人设"}]}
恰好 3 个桥段。`

  const raw = await chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.9 })
  return (JSON.parse(raw).plots ?? []).slice(0, 3)
}
