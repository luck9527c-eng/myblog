import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 开发期代理：/api 与 /health 转发到本地 FastAPI 后端（见 docs/DEVELOPMENT_SPEC.md §7.1）
const BACKEND_ORIGIN = 'http://127.0.0.1:8005'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': BACKEND_ORIGIN,
      '/health': BACKEND_ORIGIN,
    },
  },
})
