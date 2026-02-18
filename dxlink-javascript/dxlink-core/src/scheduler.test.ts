import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { Scheduler } from './scheduler'

test('schedule invokes callback after timeout', async () => {
  const scheduler = new Scheduler()
  let called = false
  scheduler.schedule(
    () => {
      called = true
    },
    10,
    'key'
  )
  await new Promise((r) => setTimeout(r, 50))
  assert.is(called, true)
  scheduler.clear()
})

test('cancel prevents callback from running', async () => {
  const scheduler = new Scheduler()
  let called = false
  scheduler.schedule(
    () => {
      called = true
    },
    50,
    'key'
  )
  scheduler.cancel('key')
  await new Promise((r) => setTimeout(r, 100))
  assert.is(called, false)
})

test('schedule with same key replaces previous', async () => {
  const scheduler = new Scheduler()
  let lastCall = 0
  scheduler.schedule(
    () => {
      lastCall = 1
    },
    30,
    'key'
  )
  scheduler.schedule(
    () => {
      lastCall = 2
    },
    30,
    'key'
  )
  await new Promise((r) => setTimeout(r, 80))
  assert.is(lastCall, 2)
  scheduler.clear()
})

test('has returns true when scheduled, false otherwise', () => {
  const scheduler = new Scheduler()
  assert.is(scheduler.has('key'), false)
  scheduler.schedule(() => {}, 1000, 'key')
  assert.is(scheduler.has('key'), true)
  scheduler.cancel('key')
  assert.is(scheduler.has('key'), false)
})

test('clear cancels all scheduled tasks', async () => {
  const scheduler = new Scheduler()
  let a = false
  let b = false
  scheduler.schedule(
    () => {
      a = true
    },
    20,
    'a'
  )
  scheduler.schedule(
    () => {
      b = true
    },
    20,
    'b'
  )
  scheduler.clear()
  await new Promise((r) => setTimeout(r, 50))
  assert.is(a, false)
  assert.is(b, false)
})

test('many schedule calls with same key create only one timer', () => {
  let setTimeoutCalls = 0
  const originalSetTimeout = globalThis.setTimeout
  const wrapper = (...args: Parameters<typeof setTimeout>): ReturnType<typeof setTimeout> => {
    setTimeoutCalls++
    return originalSetTimeout.apply(globalThis, args)
  }
  globalThis.setTimeout = wrapper as typeof setTimeout
  try {
    const scheduler = new Scheduler()
    for (let i = 0; i < 100; i++) {
      scheduler.schedule(() => {}, 100, 'sameKey')
    }
    assert.is(
      setTimeoutCalls,
      1,
      'expected exactly one setTimeout for many schedule() calls with same key'
    )
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
})

test.run()
