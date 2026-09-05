import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
    server: {
      deps: {
        // DxScriptEditor imports its ace-builds modes/themes without a file extension
        // ('ace-builds/src-noconflict/mode-javascript'). Vite's bundler resolution handles
        // that; Vitest's Node resolution does not. Inlining routes the package through Vite
        // so tests can mount the real editor.
        inline: ['@dxscript/dxlink-dxscript-editor'],
      },
    },
  },
})
