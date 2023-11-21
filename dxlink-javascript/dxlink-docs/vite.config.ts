import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  server: {
    port: 4200,
    host: 'localhost',
  },
  build: {
    outDir: './build',
  },
  plugins: [react()],
})
