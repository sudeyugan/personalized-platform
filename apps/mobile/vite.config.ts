import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1' },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        chat: resolve(import.meta.dirname, 'chat.html'),
        pet: resolve(import.meta.dirname, 'pet.html'),
      },
    },
  },
})
