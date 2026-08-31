/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  // Empty base keeps the app relocatable under any sub-path (parity with dxlink-docs,
  // which is served from a sub-path and uses HashRouter).
  base: '',
  // Treat AsyncAPI spec files as static assets so they can be imported with `?url`.
  assetsInclude: ['**/*.yml', '**/*.yaml'],
  server: {
    // Distinct from dxlink-docs (4200) so both consoles can run side by side.
    port: 4280,
    host: 'localhost',
  },
  build: {
    outDir: './build',
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
    server: {
      deps: {
        // These packages import their own modules without a file extension —
        // DxScriptEditor its ace-builds modes/themes ('ace-builds/src-noconflict/
        // mode-javascript'), dxcharts-lite its own './chart/chart'. Vite's bundler
        // resolution handles that; Vitest's Node resolution does not. Inlining routes them
        // through Vite so tests can mount the real editor and the real chart — and so
        // anything importing them transitively, the channels area included, can be
        // rendered at all.
        inline: [
          '@devexperts/dxcharts-lite',
          '@dxscript/dxlink-dxcharts-lite',
          '@dxscript/dxlink-dxscript-editor',
        ],
      },
    },
  },
})
