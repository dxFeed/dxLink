import {
  DefaultDXLinkScheduler,
  type DXLinkChannel,
  DXLinkChannelState,
  type DXLinkClient,
  type DXLinkError,
  type DXLinkErrorListener,
} from '@dxfeed/dxlink-core'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  DXLinkWebSocketClient,
  type DXLinkWebSocketCloseListener,
  type DXLinkWebSocketConnector,
  type DXLinkWebSocketMessage,
} from '../../dxlink-websocket-client/src'

import { DXLinkFeed, FeedContract } from './'

const UNABLE_TO_CONNECT: DXLinkError = { type: 'UNKNOWN', message: 'Unable to connect' }

/**
 * Client with a single channel that stays requested; the test emits errors on it.
 */
const createClient = () => {
  const channelErrorListeners = new Set<DXLinkErrorListener>()
  const channel = {
    id: 1,
    service: 'FEED',
    parameters: {},
    send: () => {},
    addMessageListener: () => {},
    removeMessageListener: () => {},
    getState: () => DXLinkChannelState.REQUESTED,
    addStateChangeListener: () => {},
    removeStateChangeListener: () => {},
    addErrorListener: (listener) => {
      channelErrorListeners.add(listener)
    },
    removeErrorListener: (listener) => {
      channelErrorListeners.delete(listener)
    },
    close: () => {},
  } satisfies DXLinkChannel

  const client = {
    getScheduler: () => new DefaultDXLinkScheduler(),
    openChannel: () => channel,
  } as unknown as DXLinkClient

  const emitChannelError = (error: DXLinkError) => {
    for (const listener of channelErrorListeners) listener(error)
  }

  return { client, emitChannelError }
}

/**
 * Connector that records what the client sends and lets the test play the server side.
 */
class FakeConnector implements DXLinkWebSocketConnector {
  readonly sent: DXLinkWebSocketMessage[] = []

  private openListener: (() => void) | undefined
  private closeListener: DXLinkWebSocketCloseListener | undefined
  private messageListener: ((message: DXLinkWebSocketMessage) => void) | undefined

  constructor(private readonly url: string) {}

  getUrl = () => this.url
  start = () => {}
  stop = () => {}
  sendMessage = (message: DXLinkWebSocketMessage) => {
    this.sent.push(message)
  }
  setOpenListener = (listener: () => void) => {
    this.openListener = listener
  }
  setCloseListener = (listener: DXLinkWebSocketCloseListener) => {
    this.closeListener = listener
  }
  setMessageListener = (listener: (message: DXLinkWebSocketMessage) => void) => {
    this.messageListener = listener
  }

  failToConnect = () => this.closeListener?.('Unable to connect', true, 1006)
  connectAndAuthorize = () => {
    this.openListener?.()
    this.messageListener?.({ type: 'SETUP', channel: 0, version: '0.1-test', keepaliveTimeout: 60 })
    this.messageListener?.({ type: 'AUTH_STATE', channel: 0, state: 'AUTHORIZED' })
  }
  openChannel = (channel: number) =>
    this.messageListener?.({ type: 'CHANNEL_OPENED', channel, service: 'FEED' })
}

const createConnectedFeed = (maxReconnectAttempts = -1) => {
  let connector: FakeConnector | undefined
  const client = new DXLinkWebSocketClient({
    maxReconnectAttempts,
    connectorFactory: (url) => (connector = new FakeConnector(url)),
  })
  client.addErrorListener(() => {})
  client.setAuthToken('token')

  const feed = new DXLinkFeed(client, FeedContract.AUTO)
  feed.addSubscriptions({ type: 'Candle', symbol: 'NVDA{=1m}', fromTime: 0 })
  client.connect('wss://example.test/dxlink')

  if (connector === undefined) throw new Error('Client has not connected')
  return { client, feed, connector }
}

const isCandleSubscription = (message: DXLinkWebSocketMessage) =>
  message.type === 'FEED_SUBSCRIPTION' && JSON.stringify(message).includes('NVDA{=1m}')

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DXLinkFeed when the connection fails before it opens', () => {
  test('sends the subscription once a retry connects', () => {
    vi.useFakeTimers()
    const { feed, connector } = createConnectedFeed()

    connector.failToConnect()
    vi.advanceTimersByTime(1000)
    connector.connectAndAuthorize()
    connector.openChannel(feed.id)
    vi.advanceTimersByTime(100)

    expect(connector.sent.filter(isCandleSubscription)).toHaveLength(1)
  })

  test('reports the error to the feed channel when the client stops connecting', () => {
    const { client, feed, connector } = createConnectedFeed(0)
    const errors: DXLinkError[] = []
    feed.getChannel().addErrorListener((error) => errors.push(error))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    connector.failToConnect()

    const stop = {
      type: 'UNKNOWN',
      message: 'Max reconnect attempts reached. Last error: Unable to connect (code 1006)',
    }
    expect(errors).toEqual([stop])
    expect(consoleError.mock.calls).toEqual([
      [`[DXLinkFeed#${feed.id}] Error in channel: ${stop.type}: ${stop.message}`],
    ])
    expect(connector.sent.filter(isCandleSubscription)).toHaveLength(0)
    expect(client.getConnectionState()).toBe('NOT_CONNECTED')
  })
})

describe('DXLinkFeed errors', () => {
  test('a channel error is logged as text', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, emitChannelError } = createClient()
    new DXLinkFeed(client, FeedContract.AUTO)

    emitChannelError(UNABLE_TO_CONNECT)

    expect(consoleError.mock.calls).toEqual([
      ['[DXLinkFeed#1] Error in channel: UNKNOWN: Unable to connect'],
    ])
  })
})
