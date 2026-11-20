import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // An empty base keeps the build relocatable under any sub-path a gateway serves it from.
  base: '',
  server: {
    // Distinct from the React console (4280) so both can run side by side.
    port: 4281,
    host: 'localhost',
  },
  build: {
    outDir: './build',
  },
  plugins: [tailwindcss(), foldkit()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
