import { test } from 'uvu'
import * as assert from 'uvu/assert'

test(`test`, () => {
  assert.is('test', 'test')
  ;`👍` //?
})

test.run()
