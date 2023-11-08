import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { DXLinkWebSocketChannel } from './channel'
import type { Message } from './messages'

test(`Channel`, () => {
  let requestCalled = false
  const sendMessage = (message: Message) => {
    if (message.type === 'CHANNEL_REQUEST') {
      requestCalled = true
    }
  }

  const channel = new DXLinkWebSocketChannel(1, 'service', {}, sendMessage, {
    logLevel: 0,
    keepaliveInterval: 0,
    keepaliveTimeout: 0,
    acceptKeepaliveTimeout: 0,
    actionTimeout: 0,
    maxReconnectAttempts: 0,
  })

  channel.request()

  assert.is(requestCalled, true)
  ;`👍` //?
})

test.run()
