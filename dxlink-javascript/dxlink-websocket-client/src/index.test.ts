import { DXLinkConnectionState, type DXLinkError, type DXLinkScheduler } from '@dxfeed/dxlink-core'
import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { DXLINK_WS_PROTOCOL_VERSION, DXLinkWebSocketClient } from './client'
import type { DXLinkWebSocketConnector } from './connector'
import type { DXLinkWebSocketMessage } from './messages'

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

class MockDXLinkScheduler implements DXLinkScheduler {
  private readonly scheduledKeys = new Set<string>()

  schedule = (_callback: () => void, _timeout: number, key: string): string => {
    this.scheduledKeys.add(key)
    return key
  }

  cancel = (key: string): void => {
    this.scheduledKeys.delete(key)
  }

  clear = (): void => {
    this.scheduledKeys.clear()
  }

  has = (key: string): boolean => this.scheduledKeys.has(key)
}

class MockDXLinkWebSocketConnector implements DXLinkWebSocketConnector {
  private openListener: (() => void) | undefined
  private closeListener: ((reason: string, error: boolean) => void) | undefined
  private messageListener: ((message: DXLinkWebSocketMessage) => void) | undefined

  constructor(private readonly url: string) {}

  readonly sentMessages: DXLinkWebSocketMessage[] = []

  getUrl = (): string => this.url

  start = (): void => {
    this.openListener?.()
  }

  stop = (): void => {}

  sendMessage = (message: DXLinkWebSocketMessage): void => {
    this.sentMessages.push(message)
  }

  setOpenListener = (listener: () => void): void => {
    this.openListener = listener
  }

  setCloseListener = (listener: (reason: string, error: boolean) => void): void => {
    this.closeListener = listener
  }

  setMessageListener = (listener: (message: DXLinkWebSocketMessage) => void): void => {
    this.messageListener = listener
  }

  emitMessage = (message: DXLinkWebSocketMessage): void => {
    this.messageListener?.(message)
  }

  emitClose = (reason: string, error: boolean): void => {
    this.closeListener?.(reason, error)
  }
}

test('Connection and channel error listeners receive server error payload metadata', () => {
  const connector = new MockDXLinkWebSocketConnector('wss://mock')
  const scheduler = new MockDXLinkScheduler()
  const client = new DXLinkWebSocketClient({
    scheduler,
    connectorFactory: () => connector,
  })

  const channel = client.openChannel('SERVICE', {})

  let clientError: DXLinkError | undefined
  let channelError: DXLinkError | undefined

  client.addErrorListener((error) => {
    clientError = error
  })
  channel.addErrorListener((error) => {
    channelError = error
  })

  client.connect('wss://mock')

  connector.emitMessage({
    type: 'SETUP',
    channel: 0,
    version: '0.1-TEST',
  })
  connector.emitMessage({
    type: 'AUTH_STATE',
    channel: 0,
    state: 'AUTHORIZED',
  })
  connector.emitMessage({
    type: 'CHANNEL_OPENED',
    channel: channel.id,
    service: 'SERVICE',
  })

  connector.emitMessage({
    type: 'ERROR',
    channel: 0,
    error: 'BAD_ACTION',
    message: 'Connection-level error',
  })

  connector.emitMessage({
    type: 'ERROR',
    channel: channel.id,
    error: 'INVALID_MESSAGE',
    message: 'Some text',
  })

  assert.ok(clientError)
  assert.is(clientError!.type, 'BAD_ACTION')
  assert.is(clientError!.channel, 0)

  assert.ok(channelError)
  assert.is(channelError!.type, 'INVALID_MESSAGE')
  assert.is(channelError!.channel, channel.id)
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
