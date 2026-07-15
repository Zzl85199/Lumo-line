import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本機開發:vite (5173) 服務前端,/api/* 代理到 wrangler dev (8787)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
  },
});
