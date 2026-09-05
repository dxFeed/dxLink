import { expect, test } from 'vitest'

import { Logger } from './'

test(`test`, () => {
  const logger = new Logger(`test`, 0)

  expect(logger).toBeInstanceOf(Logger)
})
