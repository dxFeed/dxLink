import { defineConfig } from 'tsup'

import { version } from './package.json'

// The package version is read here (build time) and inlined into the bundle via
// `define`, replacing `__DXLINK_VERSION__` in src/version.ts with a string
// literal. Sourced from package.json directly so it works regardless of the
// package manager / task runner (npm_package_version is not always set).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'build',
  define: {
    __DXLINK_VERSION__: JSON.stringify(version),
  },
})
