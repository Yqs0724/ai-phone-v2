import { useEffect, useState } from 'react'

type Tag = { personaTypes: string[]; stage: string; flavors: string[] }
type Material = { id: number; raw_text: string; type: string; title: string; tags: Tag }
type Plot = { title: string; setup: string; opener: string; whyFit: string }

const STAGES = ['全部', '开篇', '续命', '收尾']
const TYPES = ['全部', '剧情点子', '角色卡', 'prompt技巧']

// 弹药库：给梗（救场） / 素材库（管理） / 入库（收藏）三视图
export default function Arsenal() {
  const [view, setView] = useState<'plots' | 'list' | 'add'>('plots')

  // 给梗
  const [plots, setPlots] = useState<Plot[]>([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [copied, setCopied] = useState<number | null>(null)

  // 素材库
  const [materials, setMaterials] = useState<Material[]>([])
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('全部')
  const [type, setType] = useState('全部')

  // 入库
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<{ type: string; title: string; tags: Tag } | null>(null)
  const [tagging, setTagging] = useState(false)
  const [tip, setTip] = useState('')

  const loadMaterials = () => fetch('/api/materials').then((r) => r.json()).then(setMaterials)
  useEffect(() => {
    loadMaterials().catch(() => {})
  }, [])

  async function generate() {
    setGenerating(true)
    setGenError('')
    try {
      const r = await fetch('/api/plots', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || '生成失败')
      setPlots(data.plots)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '网络异常，请重试')
    } finally {
      setGenerating(false)
    }
  }

  async function doTag() {
    if (!raw.trim() || tagging) return
    setTagging(true)
    setTip('')
    try {
      const r = await fetch('/api/materials/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: raw }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || '打标失败')
      setPreview(data)
    } catch (e) {
      setTip(e instanceof Error ? e.message : '网络异常')
    } finally {
      setTagging(false)
    }
  }

  async function saveMaterial() {
    if (!preview) return
    await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: raw, ...preview }),
    })
    setRaw('')
    setPreview(null)
    setTip('已入库 ✓')
    loadMaterials()
  }

  async function removeMaterial(id: number) {
    await fetch(`/api/materials/${id}`, { method: 'DELETE' })
    setMaterials((list) => list.filter((m) => m.id !== id))
  }

  async function copy(text: string, i: number) {
    await navigator.clipboard.writeText(text)
    setCopied(i)
    setTimeout(() => setCopied(null), 1500)
  }

  const filtered = materials.filter(
    (m) =>
      (stage === '全部' || m.tags.stage === stage) &&
      (type === '全部' || m.type === type) &&
      (!q || (m.title + m.raw_text).includes(q)),
  )

  const Chip = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
    <button
      className={`px-2.5 py-1 rounded-full text-xs ${active ? 'bg-mine text-white' : 'bg-card text-ink-dim'}`}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 子 Tab */}
      <div className="flex gap-2 px-4 py-3">
        {(
          [
            ['plots', '给梗'],
            ['list', `素材库(${materials.length})`],
            ['add', '入库'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1.5 rounded-full text-sm ${view === key ? 'bg-mine text-white' : 'bg-card text-ink-dim'}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {/* ── 给梗 ── */}
        {view === 'plots' && (
          <div className="space-y-3">
            <button
              className="w-full bg-mine text-white rounded-full py-3 text-sm font-medium disabled:opacity-50"
              onClick={generate}
              disabled={generating}
            >
              {generating ? '编剧思考中…' : '剧情卡住了？按当前人设给 3 个梗'}
            </button>
            {genError && <div className="text-xs text-red-400">{genError}</div>}
            {plots.map((p, i) => (
              <div key={i} className="bg-card rounded-xl p-4 space-y-2">
                <div className="text-ink font-medium">{p.title}</div>
                <div className="text-sm text-ink/80 leading-relaxed">{p.setup}</div>
                <div className="bg-night/60 rounded-lg p-3 text-sm text-ink italic">“{p.opener}”</div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-xs text-ink-dim flex-1">为什么适合 TA：{p.whyFit}</div>
                  <button className="text-xs text-accent shrink-0" onClick={() => copy(p.opener, i)}>
                    {copied === i ? '已复制 ✓' : '复制开场白'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 素材库 ── */}
        {view === 'list' && (
          <div className="space-y-3">
            <input
              className="w-full bg-card rounded-full px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-dim"
              placeholder="搜索素材……"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="flex gap-1.5 flex-wrap">
              {STAGES.map((s) => (
                <Chip key={s} label={s} active={stage === s} onClick={() => setStage(s)} />
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {TYPES.map((t) => (
                <Chip key={t} label={t} active={type === t} onClick={() => setType(t)} />
              ))}
            </div>
            {filtered.length === 0 && <div className="text-xs text-ink-dim/60 text-center py-6">没有匹配的素材，去「入库」存几条？</div>}
            {filtered.map((m) => (
              <div key={m.id} className="bg-card rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-night/60 text-accent rounded-full px-2 py-0.5">{m.type}</span>
                  <span className="text-[10px] bg-night/60 text-ink-dim rounded-full px-2 py-0.5">{m.tags.stage}</span>
                  {m.tags.flavors?.map((f) => (
                    <span key={f} className="text-[10px] bg-night/60 text-ink-dim rounded-full px-2 py-0.5">{f}</span>
                  ))}
                  <button className="ml-auto text-ink-dim text-xs px-1" onClick={() => removeMaterial(m.id)}>×</button>
                </div>
                <div className="text-sm text-ink font-medium">{m.title}</div>
                <div className="text-xs text-ink-dim leading-relaxed line-clamp-3">{m.raw_text}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 入库 ── */}
        {view === 'add' && (
          <div className="space-y-3">
            <textarea
              className="w-full h-40 bg-card text-ink text-sm rounded-xl p-3 outline-none resize-none placeholder:text-ink-dim"
              placeholder="把收藏的剧情点子 / 角色卡 / prompt 技巧粘贴到这里……"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value)
                setPreview(null)
              }}
            />
            <button
              className="w-full bg-card text-ink rounded-full py-2.5 text-sm disabled:opacity-50"
              onClick={doTag}
              disabled={!raw.trim() || tagging}
            >
              {tagging ? 'AI 打标中…' : 'AI 打标预览'}
            </button>
            {preview && (
              <div className="bg-card rounded-xl p-4 space-y-2">
                <div className="text-sm text-ink font-medium">{preview.title}</div>
                <div className="flex gap-1.5 flex-wrap">
                  <span className="text-[10px] bg-night/60 text-accent rounded-full px-2 py-0.5">{preview.type}</span>
                  <span className="text-[10px] bg-night/60 text-ink-dim rounded-full px-2 py-0.5">{preview.tags.stage}</span>
                  {preview.tags.flavors.map((f) => (
                    <span key={f} className="text-[10px] bg-night/60 text-ink-dim rounded-full px-2 py-0.5">{f}</span>
                  ))}
                  {preview.tags.personaTypes.map((p) => (
                    <span key={p} className="text-[10px] bg-night/60 text-ink-dim rounded-full px-2 py-0.5">适:{p}</span>
                  ))}
                </div>
                <button className="w-full bg-mine text-white rounded-full py-2.5 text-sm font-medium" onClick={saveMaterial}>
                  确认入库
                </button>
              </div>
            )}
            {tip && <div className="text-xs text-accent text-center">{tip}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
