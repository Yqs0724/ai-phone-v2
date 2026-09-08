import { useEffect, useState, type ReactNode } from 'react'

// 手机外壳：桌面端显示带边框/灵动岛/状态栏的"一部手机"；手机端自动退化为全屏
// 所有页面都套在这个壳里 —— 沉浸感的来源
export default function PhoneFrame({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000) // 状态栏时钟每 10s 刷新
    return () => clearInterval(t)
  }, [])
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-night flex items-center justify-center sm:p-6">
      {/* 手机机身：sm 以下全屏，sm 以上收成带边框的机身 */}
      <div className="relative w-full h-screen sm:h-[820px] sm:max-h-[92vh] sm:w-[400px] bg-paper flex flex-col overflow-hidden sm:rounded-[3rem] sm:border-[10px] sm:border-zinc-800 sm:shadow-[0_25px_80px_-20px_rgba(0,0,0,0.9)]">
        {/* 灵动岛（仅桌面端机身模式可见） */}
        <div className="hidden sm:block absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-20" />

        {/* 状态栏 */}
        <div className="flex items-center justify-between px-7 pt-3 sm:pt-4 pb-1 text-xs text-ink-dim select-none z-10">
          <span className="font-medium tracking-wide">{hhmm}</span>
          <div className="flex items-center gap-1.5">
            {/* 信号 */}
            <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden>
              <rect x="0" y="7" width="3" height="4" rx="0.5" />
              <rect x="4.5" y="5" width="3" height="6" rx="0.5" />
              <rect x="9" y="2.5" width="3" height="8.5" rx="0.5" />
              <rect x="13" y="0" width="3" height="11" rx="0.5" opacity="0.35" />
            </svg>
            {/* 电池 */}
            <svg width="22" height="11" viewBox="0 0 25 12" fill="none" aria-hidden>
              <rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke="currentColor" opacity="0.4" />
              <rect x="2.5" y="2.5" width="13" height="7" rx="1.5" fill="currentColor" />
              <path d="M23 4v4c1-.3 1.8-1 1.8-2S24 4.3 23 4z" fill="currentColor" opacity="0.4" />
            </svg>
          </div>
        </div>

        {/* 屏幕内容区：页面塞这里 */}
        <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  )
}
