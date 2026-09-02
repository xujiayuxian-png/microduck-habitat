import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('web'),
  base: '/microduck-habitat/play/',
  publicDir: false,
  build: {
    outDir: resolve('docs/play'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve('web/index.html'),
    },
  },
})
