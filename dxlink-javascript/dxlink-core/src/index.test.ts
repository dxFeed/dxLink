import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { DXLINK_CORE } from './'

test(`test`, () => {
  assert.is(DXLINK_CORE, 'DXLINK_CORE')
  ;`👍` //?
})

test.run()
