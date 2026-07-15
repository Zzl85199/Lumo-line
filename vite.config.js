import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 只有 VITE_ 開頭的環境變數會被打包進前端,
// LINE_CHANNEL_SECRET 等後端金鑰絕不會進到瀏覽器端程式碼。
export default defineConfig({
  plugins: [react()],
})
