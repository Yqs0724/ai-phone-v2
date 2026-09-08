import { useEffect, useRef, useState } from 'react'
import PhoneFrame from './components/PhoneFrame'
import Arsenal from './components/Arsenal'

type Msg = { id?: number; role: 'user' | 'assistant'; content: string; created_at?: number }
type Anniv = { id: number; title: string; date: string; yearly: number }

const fmt = (ts?: number) => (ts ? new Date(ts).toTimeString().slice(0, 5) : '')

export default function App() {
  const [tab, setTab] = useState<'chat' | 'arsenal'>('chat')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [persona, setPersona] = useState('')
  const [worldbook, setWorldbook] = useState('')
  const [memories, setMemories] = useState<{ id: number; fact: string; importance: number }[]>([])
  const [anniversaries, setAnniversaries] = useState<Anniv[]>([])
  const [annivTitle, setAnnivTitle] = useState('')
  const [annivDate, setAnnivDate] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/messages')
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => setError('消息加载失败，请检查后端是否启动'))
  }, [])

  // 轮询：让 TA 的主动消息/纪念日祝福能自动冒出来（只在数量变化时更新，避免抖动）
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const data = await fetch('/api/messages').then((r) => r.json())
        setMessages((prev) => (data.length !== prev.length ? data : prev))
      } catch {
        /* 轮询失败静默，下次再试 */
      }
    }, 15_000)
    return () => clearInterval(t)
  }, [])

  // 新消息或"正在输入"出现时，滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send() {
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    setError('')
    setSending(true)
    setMessages((m) => [...m, { role: 'user', content, created_at: Date.now() }]) // 乐观上屏
    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || '发送失败')
      setMessages((m) => [...m, { role: 'assistant', content: data.content, created_at: Date.now() }])
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络异常，请稍后重试')
    } finally {
      setSending(false)
    }
  }

  async function openPanel() {
    const [s, m, a] = await Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/memories').then((r) => r.json()),
      fetch('/api/anniversaries').then((r) => r.json()),
    ])
    setPersona(s.persona)
    setWorldbook(s.worldbook)
    setMemories(m)
    setAnniversaries(a)
    setShowPanel(true)
  }

  async function savePanel() {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, worldbook }),
    })
    setShowPanel(false)
  }

  async function addAnniv() {
    if (!annivTitle.trim() || !annivDate) return
    await fetch('/api/anniversaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: annivTitle.trim(), date: annivDate.slice(5), yearly: 1 }),
    })
    setAnnivTitle('')
    setAnnivDate('')
    setAnniversaries(await fetch('/api/anniversaries').then((r) => r.json()))
  }

  async function deleteAnniv(id: number) {
    await fetch(`/api/anniversaries/${id}`, { method: 'DELETE' })
    setAnniversaries((list) => list.filter((a) => a.id !== id))
  }

  return (
    <PhoneFrame>
      <div className="relative h-full flex flex-col">
        {tab === 'chat' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* 聊天头部 */}
            <header className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-mine shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-ink font-medium leading-tight">顾衍</div>
                <div className="text-xs text-accent leading-tight mt-0.5">{sending ? '正在输入…' : '在线'}</div>
              </div>
              <button className="text-ink-dim text-sm px-2 py-1" onClick={openPanel}>档案</button>
            </header>

            {/* 消息流 */}
            <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <div key={m.id ?? i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-mine text-white rounded-bubble rounded-br-md'
                        : 'bg-card text-ink rounded-bubble rounded-bl-md'
                    }`}
                  >
                    {m.content}
                    <div className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-white/60 text-right' : 'text-ink-dim'}`}>
                      {fmt(m.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-card text-ink-dim rounded-bubble rounded-bl-md px-4 py-2.5 text-sm">正在输入…</div>
                </div>
              )}
              <div ref={bottomRef} />
            </main>

            {/* 错误提示：失败原因明确可见，不静默 */}
            {error && <div className="px-4 pb-1 text-xs text-red-400">{error}</div>}

            {/* 输入栏 */}
            <footer className="px-4 pb-3 pt-2">
              <div className="flex items-center gap-2 bg-card rounded-full px-4 py-2.5">
                <input
                  className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-dim text-[15px]"
                  placeholder="说点什么……"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button
                  className="w-8 h-8 rounded-full bg-mine text-white text-sm shrink-0 disabled:opacity-40"
                  onClick={send}
                  disabled={sending || !input.trim()}
                >
                  ↑
                </button>
              </div>
            </footer>
          </div>
        ) : (
          <Arsenal />
        )}

        {/* 底部 Tab 栏 */}
        <nav className="flex border-t border-white/5 shrink-0">
          {(
            [
              ['chat', '聊天'],
              ['arsenal', '弹药库'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`flex-1 py-3 text-sm ${tab === key ? 'text-accent' : 'text-ink-dim'}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* 档案面板：人设 / 世界书 / 纪念日 / 记忆 */}
        {showPanel && (
          <div className="absolute inset-0 bg-paper/97 backdrop-blur-sm flex flex-col p-5 gap-3 z-10 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-ink font-medium">档案</h2>
              <button className="text-ink-dim text-sm" onClick={() => setShowPanel(false)}>关闭</button>
            </div>

            <label className="text-xs text-ink-dim">人设卡</label>
            <textarea
              className="min-h-32 bg-card text-ink text-sm rounded-xl p-3 outline-none resize-none"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="TA 是谁？性格、口癖、和你们的关系……"
            />

            <label className="text-xs text-ink-dim">世界书（可选）</label>
            <textarea
              className="h-24 bg-card text-ink text-sm rounded-xl p-3 outline-none resize-none"
              value={worldbook}
              onChange={(e) => setWorldbook(e.target.value)}
              placeholder="世界观、共同经历、禁忌设定……"
            />

            <label className="text-xs text-ink-dim">纪念日</label>
            <div className="space-y-1.5">
              {anniversaries.map((a) => (
                <div key={a.id} className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 text-xs text-ink">
                  <span className="flex-1">{a.title}</span>
                  <span className="text-ink-dim">{a.date}{a.yearly ? ' · 每年' : ' · 一次'}</span>
                  <button className="text-ink-dim px-1" onClick={() => deleteAnniv(a.id)}>×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 min-w-0 bg-card rounded-lg px-3 py-2 text-xs text-ink outline-none placeholder:text-ink-dim"
                placeholder="纪念日名称"
                value={annivTitle}
                onChange={(e) => setAnnivTitle(e.target.value)}
              />
              <input
                type="date"
                className="bg-card rounded-lg px-2 py-2 text-xs text-ink outline-none [color-scheme:dark]"
                value={annivDate}
                onChange={(e) => setAnnivDate(e.target.value)}
              />
              <button className="bg-mine text-white rounded-lg px-3 text-xs shrink-0" onClick={addAnniv}>＋</button>
            </div>

            <label className="text-xs text-ink-dim">TA 记得的事（{memories.length}）</label>
            <div className="space-y-1.5">
              {memories.length === 0 && <div className="text-xs text-ink-dim/60">还没有记忆，聊几句试试</div>}
              {memories.map((m) => (
                <div key={m.id} className="text-xs bg-card text-ink rounded-lg px-3 py-2 flex gap-2">
                  <span className="text-accent shrink-0">{m.importance}</span>
                  <span>{m.fact}</span>
                </div>
              ))}
            </div>

            <button className="bg-mine text-white rounded-full py-2.5 text-sm font-medium" onClick={savePanel}>
              保存
            </button>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
