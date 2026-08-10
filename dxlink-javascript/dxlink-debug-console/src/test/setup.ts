import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs with `globals: false`, so Testing Library's auto-cleanup does not
// self-register. Without this, components stay mounted between tests and React keeps
// scheduling work against a DOM that the next test has already replaced.
afterEach(cleanup)
