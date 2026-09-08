// 最小可用 Service Worker：网络优先 + 运行时缓存兜底
// 策略 deliberately 简单：静态资源永远拿最新的，断网时才用缓存；API 一律不缓存
const CACHE = 'ai-phone-v2-runtime'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // 非 GET 与 API 请求直接走网络：聊天/记忆数据绝不许读到旧缓存
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api')) return

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(e.request).then((r) => r || Response.error())),
  )
})
