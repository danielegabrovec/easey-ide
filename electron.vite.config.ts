import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: { alias: shared },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@renderer': resolve('src/renderer') }
    },
    plugins: [react()],
    build: { minify: 'esbuild', chunkSizeWarningLimit: 6000 },
    worker: { format: 'es' }
  }
})
