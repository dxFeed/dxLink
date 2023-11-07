import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

// https://astro.build/config
export default defineConfig({
  output: 'static',
  outDir: 'build',
  integrations: [react()],
  vite: {
    optimizeDeps: {
      include: ['prop-types'],
    },
  },
})
