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
})
