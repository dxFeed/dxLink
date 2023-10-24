import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { Logger } from './'

test(`test`, () => {
  const logger = new Logger(`test`, 0)

  assert.instance(logger, Logger)
  ;`👍` //?
})

test.run()
