import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  // The main process, and the background host that keeps sessions running after the app quits.
  main: { build: { rollupOptions: { input: { index: 'src/main/index.ts', host: 'src/host/index.ts' } } } },
  // A sandboxed window can only load a CommonJS preload script.
  preload: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { plugins: [react()] }
})
