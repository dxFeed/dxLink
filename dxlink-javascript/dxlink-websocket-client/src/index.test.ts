import { DXLinkConnectionState, type DXLinkError } from '@dxfeed/dxlink-core'
import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { DXLINK_WS_PROTOCOL_VERSION, DXLinkWebSocketClient } from './client'

const DEMO_URL = 'wss://demo.dxfeed.com/market-data/dxlink-ws'
const CONNECT_TIMEOUT_MS = 15_000
const ACTION_TIMEOUT_SEC = 5

const waitForConnectionState = (
  client: DXLinkWebSocketClient,
  expectedState: DXLinkConnectionState,
  timeoutMs: number
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (client.getConnectionState() === expectedState) {
      resolve()
      return
    }

    const listener = (state: DXLinkConnectionState) => {
      if (state !== expectedState) return

      cleanup()
      resolve()
    }

    let timeoutId = 0
    const cleanup = () => {
      clearTimeout(timeoutId)
      client.removeConnectionStateChangeListener(listener)
    }

    timeoutId = setTimeout(() => {
      cleanup()
      reject(
        new Error(
          `Timeout waiting for state ${expectedState}. Current state: ${client.getConnectionState()}`
        )
      )
    }, timeoutMs)

    client.addConnectionStateChangeListener(listener)
  })


test(`Live market-data endpoint success-path`, async () => {
  const client = new DXLinkWebSocketClient({
    actionTimeout: ACTION_TIMEOUT_SEC,
    logLevel: 0,
    maxReconnectAttempts: 0,
  })
  const errors: DXLinkError[] = []
  const connectionStates: DXLinkConnectionState[] = []

  const onError = (error: DXLinkError) => {
    errors.push(error)
  }
  const onConnectionState = (state: DXLinkConnectionState) => {
    connectionStates.push(state)
  }

  client.addErrorListener(onError)
  client.addConnectionStateChangeListener(onConnectionState)

  try {
    client.connect(DEMO_URL)

    assert.is(client.getConnectionState(), DXLinkConnectionState.CONNECTING)

    await waitForConnectionState(client, DXLinkConnectionState.CONNECTED, CONNECT_TIMEOUT_MS)

    const details = client.getConnectionDetails()
    assert.is(details.protocolVersion, DXLINK_WS_PROTOCOL_VERSION)
    assert.ok(details.serverVersion !== undefined && details.serverVersion.length > 0)
    assert.is(errors.length, 0)
    assert.ok(connectionStates.includes(DXLinkConnectionState.CONNECTING))
    assert.ok(connectionStates.includes(DXLinkConnectionState.CONNECTED))
  } finally {
    client.disconnect()
    client.removeErrorListener(onError)
    client.removeConnectionStateChangeListener(onConnectionState)

    assert.is(client.getConnectionState(), DXLinkConnectionState.NOT_CONNECTED)
  }
})

test.run()
