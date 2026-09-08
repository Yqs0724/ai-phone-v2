// 统一 LLM 调用层：全项目唯一的 API 出口（换模型/加限流/打日志，只动这一个文件）
const BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com'
const MODEL = process.env.LLM_MODEL || 'deepseek-chat'
const API_KEY = process.env.DEEPSEEK_API_KEY

/**
 * 调一次对话补全
 * @param {Array<{role:string, content:string}>} messages
 * @param {{json?: boolean, temperature?: number}} options json=true 时强制 JSON 输出（打标/给梗用）
 */
export async function chat(messages, { json = false, temperature = 0.8 } = {}) {
  if (!API_KEY) throw new Error('未配置 DEEPSEEK_API_KEY（请检查 server/.env）')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000) // 30s 超时：宁可明确报错，也不让请求挂死
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`LLM 请求失败 ${res.status}：${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices[0].message.content
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('LLM 请求超时（30s），请检查网络后重试')
    throw err
  } finally {
    clearTimeout(timer)
  }
}
