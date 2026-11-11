import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Il worker della Scrittura rapida è un file a sé (.mjs: nell'app installata sta fuori da
        // asar, dove non c'è il package.json con "type": "module").
        input: {
          index: resolve('src/main/index.ts'),
          'quick-worker': resolve('src/main/services/quick/quick-worker.ts'),
          'quick-python-worker': resolve('src/main/services/quick/quick-python-worker.ts')
        },
        output: { entryFileNames: (chunk) => (chunk.name.startsWith('quick-') ? '[name].mjs' : '[name].js') }
      }
    }
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
