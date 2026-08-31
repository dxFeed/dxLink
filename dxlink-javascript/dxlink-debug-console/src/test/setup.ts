import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with `globals: false`, so Testing Library's auto-cleanup does not
// self-register. Without this, components stay mounted between tests and React keeps
// scheduling work against a DOM that the next test has already replaced.
afterEach(cleanup)

// dxcharts-lite calls `window.matchMedia` at module load, to watch the device pixel ratio.
// jsdom does not implement it, so importing anything that reaches the chart — the channels
// area, via the feed chart channel — throws before a test can run. A stub that matches
// nothing is enough: nothing under test depends on a media query.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (media: string): MediaQueryList => ({
    media,
    matches: false,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })
}
