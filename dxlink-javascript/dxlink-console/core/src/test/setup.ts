import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with `globals: false`, so Testing Library auto-cleanup does not self-register.
// Without this, components stay mounted between tests and React keeps scheduling work against
// a DOM that the next test has already replaced.
afterEach(cleanup)

// jsdom implements no layout, so it has no `scrollIntoView`. The channels area scrolls a
// freshly opened channel into view, which makes this a hard requirement for any test that
// opens one. Scrolling is not what those tests are about, so a no-op is enough.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined
}
