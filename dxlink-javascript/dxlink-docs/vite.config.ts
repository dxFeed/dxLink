import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 4200,
    host: 'localhost',
  },
  build: {
    outDir: './build',
  },
  plugins: [react()],
})
