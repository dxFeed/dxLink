/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    tsconfigPaths({
      root: './',
      projects: [],
    }),
  ],
  resolve: {
    alias: {
      '@dxfeed/dxlink-websocket-client': '@dxfeed/dxlink-websocket-client/src/index.ts',
    },
  },
  test: {
    globals: true,
    cache: {
      dir: './node_modules/.vitest',
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
})
