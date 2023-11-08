import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 4300,
    host: 'localhost',
  },
  build: {
    outDir: './build',
  },
  plugins: [react()],
})
