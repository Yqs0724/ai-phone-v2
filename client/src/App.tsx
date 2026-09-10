import { useEffect, useRef, useState } from 'react'
import PhoneFrame from './components/PhoneFrame'
import Arsenal from './components/Arsenal'

type Msg = { id?: number; role: 'user' | 'assistant'; content: string; created_at?: number }
type Anniv = { id: number; title: string; date: string; yearly: number }

const fmt = (ts?: number) => (ts ? new Date(ts).toTimeString().slice(0, 5) : '')

// 头像：有图显示图，没图显示渐变色块（保证界面任何时候都不留空）
function Avatar({ src, size }: { src?: string; size: string }) {
  return src ? (
    <img src={src} alt="头像" className={`${size} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-gradient-to-br from-accent to-mine shrink-0`} />
  )
}

// 选图 → 居中裁成正方形 → 压缩到 128px → 转 base64
// 压缩后才十几 KB，可以直接存进数据库，不用单独搞文件上传服务
function pickAvatar(onDone: (dataUrl: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 128
        // 取原图中心最大的正方形区域，防止人脸被拉长或压扁
        const s = Math.min(img.width, img.height)
        canvas.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128)
        onDone(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

export default function App() {
  const [tab, setTab] = useState<'chat' | 'arsenal'>('chat')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [persona, setPersona] = useState('')
  const [worldbook, setWorldbook] = useState('')
  // 身份档案：名字和头像。char 是崽，user 是你自己
  const [charName, setCharName] = useState('顾衍')
  const [userName, setUserName] = useState('')
  const [charAvatar, setCharAvatar] = useState('')
  const [userAvatar, setUserAvatar] = useState('')
  const [memories, setMemories] = useState<{ id: number; fact: string; importance: number }[]>([])
  const [anniversaries, setAnniversaries] = useState<Anniv[]>([])
  const [annivTitle, setAnnivTitle] = useState('')
  const [annivDate, setAnnivDate] = useState('')
  // 消息操作：点气泡唤出「编辑/撤回」，编辑中把气泡变成输入框
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null)
  const [editingMsgText, setEditingMsgText] = useState('')
  // 记忆操作：收在档案的二级抽屉里，支持改/删
  const [showMemories, setShowMemories] = useState(false)
  // 设定抽屉：人设卡 + 世界书，收进二级页面后编辑区域可以占满整屏，不再拥挤
  const [showProfile, setShowProfile] = useState(false)
  const [editingMemId, setEditingMemId] = useState<number | null>(null)
  const [editingMemText, setEditingMemText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/messages')
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => setError('消息加载失败，请检查后端是否启动'))
    // 进页面就读取身份档案：头部名字/头像要和档案保持同一份数据
    fetch('/api/settings')
      .then((r) => r.json())
      .then(applySettings)
      .catch(() => {})
  }, [])

  // 把后端返回的档案灌进界面状态（空值不覆盖默认名字）
  function applySettings(s: Record<string, string>) {
    if (s.char_name) setCharName(s.char_name)
    setUserName(s.user_name || '')
    setCharAvatar(s.char_avatar || '')
    setUserAvatar(s.user_avatar || '')
  }

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
      // 重新拉全量消息：拿到数据库里的真实 id，之后才能编辑/撤回刚发的消息
      setMessages(await fetch('/api/messages').then((r) => r.json()))
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络异常，请稍后重试')
    } finally {
      setSending(false)
    }
  }

  // ── 消息编辑 / 撤回 ──
  async function saveMsgEdit(id: number) {
    const content = editingMsgText.trim()
    if (!content) return
    await fetch(`/api/messages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, content } : m)))
    setEditingMsgId(null)
  }

  async function recallMsg(id: number) {
    if (!confirm('撤回后，这条消息会从聊天记录里消失，TA 也不会再记得它。确定撤回？')) return
    await fetch(`/api/messages/${id}`, { method: 'DELETE' })
    setMessages((list) => list.filter((m) => m.id !== id))
    setActiveMsgId(null)
  }

  // ── 重说：剪掉这条之后的剧情分支，让 TA 重新回应 ──
  const [regenerating, setRegenerating] = useState(false)

  async function regenerateMsg(id: number) {
    if (regenerating || sending) return
    setActiveMsgId(null)
    // 重说会连累之后的剧情一起消失，先算清楚会被剪掉几条，提示里明说（危险操作给明确后果）
    const idx = messages.findIndex((m) => m.id === id)
    const after = messages.slice(idx + 1)
    // user 消息重说时，紧跟着的旧回复是被替换而不是损失，不算进提示
    const extra = messages[idx]?.role === 'user' && after[0]?.role === 'assistant' ? after.slice(1) : after
    if (extra.length > 0 && !confirm(`重说会同时剪掉这条之后的 ${extra.length} 条剧情，重新生成。确定重说？`)) return
    setRegenerating(true)
    setError('')
    try {
      const r = await fetch(`/api/messages/${id}/regenerate`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || '重说失败')
      // 重新拉全量：被剪掉的分支和新回复都以数据库为准
      setMessages(await fetch('/api/messages').then((r) => r.json()))
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络异常，请稍后重试')
    } finally {
      setRegenerating(false)
    }
  }

  // ── 记忆修改 / 删除 ──
  async function saveMemEdit(id: number) {
    const fact = editingMemText.trim()
    if (!fact) return
    await fetch(`/api/memories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact }),
    })
    setMemories((list) => list.map((m) => (m.id === id ? { ...m, fact } : m)))
    setEditingMemId(null)
  }

  async function deleteMem(id: number) {
    if (!confirm('删掉这条记忆后，TA 就真的想不起来了。确定删除？')) return
    await fetch(`/api/memories/${id}`, { method: 'DELETE' })
    setMemories((list) => list.filter((m) => m.id !== id))
  }

  async function openPanel() {
    const [s, m, a] = await Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/memories').then((r) => r.json()),
      fetch('/api/anniversaries').then((r) => r.json()),
    ])
    setPersona(s.persona)
    setWorldbook(s.worldbook)
    applySettings(s)
    setMemories(m)
    setAnniversaries(a)
    setShowPanel(true)
  }

  // 纯保存：二级抽屉里的「保存」也复用它，只是不收起主面板
  async function saveSettings() {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona,
        worldbook,
        char_name: charName.trim(),
        user_name: userName.trim(),
        char_avatar: charAvatar,
        user_avatar: userAvatar,
      }),
    })
  }

  async function savePanel() {
    await saveSettings()
    setShowPanel(false)
    setShowMemories(false)
    setShowProfile(false)
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
              <Avatar src={charAvatar} size="w-10 h-10" />
              <div className="flex-1 min-w-0">
                <div className="text-ink font-medium leading-tight">{charName}</div>
                <div className="text-xs text-accent leading-tight mt-0.5">{sending ? '正在输入…' : '在线'}</div>
              </div>
              <button className="text-ink-dim text-sm px-2 py-1" onClick={openPanel}>档案</button>
            </header>

            {/* 消息流 */}
            <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <div key={m.id ?? i} className="flex flex-col gap-1">
                  {/* 行容器占满整行，气泡的 max-w-[75%] 才有统一基准（之前套了两层对齐，你的气泡被挤窄了） */}
                  <div className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && <Avatar src={charAvatar} size="w-8 h-8" />}
                    {editingMsgId === m.id ? (
                      /* 编辑态：气泡变成输入框 */
                      <div className="max-w-[75%] bg-card rounded-bubble p-2 flex flex-col gap-1.5">
                        <textarea
                          className="w-64 bg-transparent text-ink text-[15px] leading-relaxed outline-none resize-none"
                          rows={4}
                          value={editingMsgText}
                          onChange={(e) => setEditingMsgText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-3 justify-end text-xs">
                          <button className="text-ink-dim" onClick={() => setEditingMsgId(null)}>取消</button>
                          <button className="text-accent" onClick={() => saveMsgEdit(m.id!)}>保存</button>
                        </div>
                      </div>
                    ) : (
                      /* 气泡 + 时间分离：时间戳住气泡外面，不再挤压气泡排版 */
                      <div className={`max-w-[75%] flex flex-col gap-0.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
                            m.role === 'user'
                              ? 'bg-mine text-white rounded-bubble rounded-br-md'
                              : 'bg-card text-ink rounded-bubble rounded-bl-md'
                          } ${m.id ? 'cursor-pointer' : ''}`}
                          onClick={() => m.id && setActiveMsgId(activeMsgId === m.id ? null : m.id)}
                        >
                          {m.content}
                        </div>
                        <span className="text-[10px] text-ink-dim/70 px-1">{fmt(m.created_at)}</span>
                      </div>
                    )}
                    {m.role === 'user' && <Avatar src={userAvatar} size="w-8 h-8" />}
                  </div>
                  {/* 点气泡唤出的操作条：再次点击或操作后收起 */}
                  {activeMsgId === m.id && editingMsgId !== m.id && (
                    <div className={`flex gap-3 text-[11px] text-ink-dim px-10 ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
                      <button
                        className="hover:text-accent"
                        onClick={() => { setEditingMsgId(m.id!); setEditingMsgText(m.content); setActiveMsgId(null) }}
                      >
                        编辑
                      </button>
                      <button className="hover:text-accent" onClick={() => regenerateMsg(m.id!)}>重说</button>
                      <button className="hover:text-red-400" onClick={() => recallMsg(m.id!)}>撤回</button>
                    </div>
                  )}
                </div>
              ))}
              {sending || regenerating ? (
                <div className="flex items-end gap-2 justify-start">
                  <Avatar src={charAvatar} size="w-8 h-8" />
                  <div className="bg-card text-ink-dim rounded-bubble rounded-bl-md px-4 py-2.5 text-sm">正在输入…</div>
                </div>
              ) : null}
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
              <button className="text-ink-dim text-sm" onClick={() => { setShowPanel(false); setShowMemories(false); setShowProfile(false) }}>关闭</button>
            </div>

            {/* 身份卡：崽和你，一人一张。点头像换图，名字直接输入 */}
            <div className="flex gap-3">
              {(
                [
                  { label: '崽', name: charName, setName: setCharName, avatar: charAvatar, setAvatar: setCharAvatar, placeholder: '崽的名字' },
                  { label: '我', name: userName, setName: setUserName, avatar: userAvatar, setAvatar: setUserAvatar, placeholder: '你的名字' },
                ] as const
              ).map((p) => (
                <div key={p.label} className="flex-1 bg-card rounded-xl p-3 flex flex-col items-center gap-2">
                  <button onClick={() => pickAvatar(p.setAvatar)} title="点击更换头像">
                    <Avatar src={p.avatar} size="w-16 h-16" />
                  </button>
                  <input
                    className="w-full bg-transparent text-center text-sm text-ink outline-none placeholder:text-ink-dim"
                    placeholder={p.placeholder}
                    value={p.name}
                    onChange={(e) => p.setName(e.target.value)}
                  />
                  <span className="text-[10px] text-ink-dim">{p.label} · 点头像换图</span>
                </div>
              ))}
            </div>

            {/* 设定入口：人设卡和世界书收进二级抽屉，里面有大块固定编辑区 */}
            <button
              className="flex items-center justify-between bg-card rounded-lg px-3 py-2.5 text-sm text-ink"
              onClick={() => setShowProfile(true)}
            >
              <span>设定</span>
              <span className="text-ink-dim text-xs">人设卡 · 世界书 ›</span>
            </button>

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

            {/* 记忆入口：收进二级抽屉，主面板保持清爽 */}
            <button
              className="flex items-center justify-between bg-card rounded-lg px-3 py-2.5 text-sm text-ink"
              onClick={() => setShowMemories(true)}
            >
              <span>TA 记得的事</span>
              <span className="text-ink-dim text-xs">{memories.length} 条 ›</span>
            </button>

            <button className="bg-mine text-white rounded-full py-2.5 text-sm font-medium" onClick={savePanel}>
              保存
            </button>
          </div>
        )}

        {/* 二级抽屉：设定（人设卡 + 世界书）。整屏高度给编辑区，不再拥挤、不需要内部滚动条 */}
        {showPanel && showProfile && (
          <div className="absolute inset-0 bg-paper z-20 flex flex-col p-5 gap-3">
            <div className="flex items-center justify-between shrink-0">
              <button className="text-ink-dim text-sm" onClick={() => setShowProfile(false)}>‹ 返回</button>
              <h2 className="text-ink font-medium">设定</h2>
              <span className="w-10" />
            </div>

            <label className="text-xs text-ink-dim shrink-0">人设卡</label>
            {/* flex-1：占满剩余空间，写长设定也不用滚动 */}
            <textarea
              className="flex-1 min-h-0 bg-card text-ink text-sm rounded-xl p-3 outline-none resize-none leading-relaxed"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="TA 是谁？性格、口癖、和你们的关系……"
            />

            <label className="text-xs text-ink-dim shrink-0">世界书（可选）</label>
            <textarea
              className="h-36 shrink-0 bg-card text-ink text-sm rounded-xl p-3 outline-none resize-none leading-relaxed"
              value={worldbook}
              onChange={(e) => setWorldbook(e.target.value)}
              placeholder="世界观、共同经历、禁忌设定……"
            />

            <button
              className="bg-mine text-white rounded-full py-2.5 text-sm font-medium shrink-0"
              onClick={async () => { await saveSettings(); setShowProfile(false) }}
            >
              保存
            </button>
          </div>
        )}

        {/* 二级抽屉：TA 记得的事（盖在档案面板之上，返回即回档案） */}
        {showPanel && showMemories && (
          <div className="absolute inset-0 bg-paper z-20 flex flex-col p-5 gap-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <button className="text-ink-dim text-sm" onClick={() => setShowMemories(false)}>‹ 返回</button>
              <h2 className="text-ink font-medium">TA 记得的事</h2>
              <span className="w-10" />
            </div>
            <p className="text-[11px] text-ink-dim/70 leading-relaxed">
              数字是重要性（1-10）。记错了点 ✎ 纠正，不想被记住的点 ×，TA 下次就真的想不起来了。
            </p>
            <div className="space-y-1.5">
              {memories.length === 0 && <div className="text-xs text-ink-dim/60">还没有记忆，聊几句试试</div>}
              {memories.map((m) => (
                <div key={m.id} className="text-xs bg-card text-ink rounded-lg px-3 py-2 flex gap-2 items-start">
                  <span className="text-accent shrink-0 leading-relaxed">{m.importance}</span>
                  {editingMemId === m.id ? (
                    <div className="flex-1 flex flex-col gap-1.5">
                      <textarea
                        className="w-full bg-paper/70 text-ink rounded-md p-1.5 outline-none resize-none"
                        rows={2}
                        value={editingMemText}
                        onChange={(e) => setEditingMemText(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-3 justify-end">
                        <button className="text-ink-dim" onClick={() => setEditingMemId(null)}>取消</button>
                        <button className="text-accent" onClick={() => saveMemEdit(m.id)}>保存</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 leading-relaxed">{m.fact}</span>
                      <button
                        className="text-ink-dim hover:text-accent shrink-0 px-1"
                        onClick={() => { setEditingMemId(m.id); setEditingMemText(m.fact) }}
                      >
                        ✎
                      </button>
                      <button className="text-ink-dim hover:text-red-400 shrink-0 px-1" onClick={() => deleteMem(m.id)}>×</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
