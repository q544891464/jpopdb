import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/health': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
  },
})
