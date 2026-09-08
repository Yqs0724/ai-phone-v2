import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 开发时把 /api 转发给后端，前后端分离开发但不用操心跨域
      '/api': 'http://localhost:3001',
    },
  },
})
