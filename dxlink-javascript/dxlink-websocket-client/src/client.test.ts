import {
  DXLinkAuthState,
  DXLinkChannelState,
  DXLinkConnectionState,
  type DXLinkError,
  DXLinkLogLevel,
  type DXLinkScheduler,
} from '@dxfeed/dxlink-core'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { DXLinkWebSocketClient } from './client'
import type { DXLinkWebSocketClientConfig } from './config'
import type { DXLinkWebSocketCloseListener, DXLinkWebSocketConnector } from './connector'
import type { DXLinkWebSocketMessage } from './messages'

const URL = 'wss://example.test/dxlink'
const RECONNECT_KEY = 'DXLWS_RECONNECT'

/**
 * Connector that records what the client sends and lets the test play the server side.
 */
class FakeConnector implements DXLinkWebSocketConnector {
  readonly sent: DXLinkWebSocketMessage[] = []
  starts = 0

  private openListener: (() => void) | undefined
  private closeListener: DXLinkWebSocketCloseListener | undefined
  private messageListener: ((message: DXLinkWebSocketMessage) => void) | undefined

  constructor(private readonly url: string) {}

  getUrl = () => this.url
  start = () => {
    this.starts++
  }
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

  open = () => this.openListener?.()
  receive = (message: DXLinkWebSocketMessage) => this.messageListener?.(message)
  close = (reason: string, error: boolean, code?: number) =>
    this.closeListener?.(reason, error, code)

  /** Server answers SETUP and sends its first AUTH_STATE. */
  handshake = (state: 'AUTHORIZED' | 'UNAUTHORIZED') => {
    this.open()
    this.receive({ type: 'SETUP', channel: 0, version: '0.1-test', keepaliveTimeout: 60 })
    this.receive({ type: 'AUTH_STATE', channel: 0, state })
  }
}

/**
 * Scheduler that keeps tasks until the test runs them.
 */
class FakeScheduler implements DXLinkScheduler {
  readonly tasks = new Map<string, { callback: () => void; timeout: number }>()

  schedule = (callback: () => void, timeout: number, key: string) => {
    this.tasks.set(key, { callback, timeout })
    return key
  }
  cancel = (key: string) => {
    this.tasks.delete(key)
  }
  clear = () => {
    this.tasks.clear()
  }
  has = (key: string) => this.tasks.has(key)

  timeoutOf = (key: string) => this.tasks.get(key)?.timeout
  run = (key: string) => {
    const task = this.tasks.get(key)
    if (task === undefined) throw new Error(`No task scheduled for ${key}`)
    this.tasks.delete(key)
    task.callback()
  }
}

const setup = (config: Partial<DXLinkWebSocketClientConfig> = {}) => {
  const scheduler = new FakeScheduler()
  let connector: FakeConnector | undefined
  const client = new DXLinkWebSocketClient({
    logLevel: DXLinkLogLevel.ERROR,
    scheduler,
    connectorFactory: (url) => (connector = new FakeConnector(url)),
    ...config,
  })
  const errors: DXLinkError[] = []
  client.addErrorListener((error) => errors.push(error))

  const getConnector = () => {
    if (connector === undefined) throw new Error('Client has not connected yet')
    return connector
  }

  return { client, scheduler, errors, connector: getConnector }
}

const openWaitingChannel = (client: DXLinkWebSocketClient) => {
  const channel = client.openChannel('FEED', { contract: 'AUTO' })
  const errors: DXLinkError[] = []
  channel.addErrorListener((error) => errors.push(error))
  return { channel, errors }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('connection failure before authorization', () => {
  test('retries a connection that failed before it opened and keeps the token', () => {
    const { client, scheduler, errors, connector } = setup()
    client.setAuthToken('token')
    client.connect(URL)

    connector().close('Unable to connect', true, 1006)

    expect(errors).toEqual([{ type: 'UNKNOWN', message: 'Unable to connect (code 1006)' }])
    expect(client.getConnectionState()).toBe(DXLinkConnectionState.CONNECTING)
    expect(scheduler.has(RECONNECT_KEY)).toBe(true)

    scheduler.run(RECONNECT_KEY)
    connector().open()

    expect(connector().starts).toBe(2)
    expect(connector().sent).toContainEqual({ type: 'AUTH', channel: 0, token: 'token' })
  })

  test('retries when the connection drops before the server answers the token', () => {
    const { client, scheduler, connector } = setup()
    client.setAuthToken('token')
    client.connect(URL)

    // The server sends UNAUTHORIZED right after SETUP, before it has processed AUTH
    connector().handshake('UNAUTHORIZED')
    connector().close('', true, 1006)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.CONNECTING)
    expect(scheduler.has(RECONNECT_KEY)).toBe(true)

    scheduler.run(RECONNECT_KEY)
    connector().open()

    expect(connector().sent.filter((message) => message.type === 'AUTH')).toHaveLength(2)
  })

  test('stops and tells waiting channels when the server rejects the token', () => {
    const { client, scheduler, connector } = setup()
    const { errors: channelErrors } = openWaitingChannel(client)
    client.setAuthToken('token')
    client.connect(URL)

    connector().handshake('UNAUTHORIZED')
    connector().receive({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' })
    connector().receive({
      type: 'ERROR',
      channel: 0,
      error: 'UNAUTHORIZED',
      message: 'Token expired',
    })
    connector().close('', false, 1000)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(scheduler.has(RECONNECT_KEY)).toBe(false)
    expect(channelErrors).toHaveLength(1)
    expect(channelErrors[0]?.type).toBe('UNAUTHORIZED')
    expect(channelErrors[0]?.message).toContain('Token expired')
  })

  test('the refusal does not carry an error from an earlier failed attempt', () => {
    const { client, scheduler, connector } = setup()
    const { errors: channelErrors } = openWaitingChannel(client)
    client.setAuthToken('token')
    client.connect(URL)

    connector().close('Unable to connect', true, 1006)
    scheduler.run(RECONNECT_KEY)
    connector().handshake('UNAUTHORIZED')
    connector().receive({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' })
    connector().close('', false, 1000)

    expect(channelErrors).toEqual([
      { type: 'UNAUTHORIZED', message: 'Authorization refused by the server' },
    ])
  })

  test('stops and keeps the reason when the server refuses the token with an error', () => {
    const { client, scheduler, errors, connector } = setup()
    const { errors: channelErrors } = openWaitingChannel(client)
    client.setAuthToken('token')
    client.connect(URL)

    connector().handshake('UNAUTHORIZED')
    connector().receive({
      type: 'ERROR',
      channel: 0,
      error: 'UNAUTHORIZED',
      message: 'Token expired',
    })
    connector().close('', true, 1006)

    const refusal = {
      type: 'UNAUTHORIZED',
      message: 'Authorization refused by the server: Token expired',
    }
    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(scheduler.has(RECONNECT_KEY)).toBe(false)
    expect(channelErrors).toEqual([refusal])
    expect(errors[errors.length - 1]).toEqual(refusal)
  })

  test('stops when the token is rejected even if a listener sets it again', () => {
    const { client, scheduler, connector } = setup()
    client.setAuthToken('token')
    client.addAuthStateChangeListener((state) => {
      if (state === DXLinkAuthState.UNAUTHORIZED) client.setAuthToken('token')
    })
    client.connect(URL)

    connector().handshake('UNAUTHORIZED')
    connector().receive({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' })
    connector().close('', false, 1000)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(scheduler.has(RECONNECT_KEY)).toBe(false)
  })

  test('stops when the server rejects the protocol', () => {
    const { client, scheduler, errors, connector } = setup()
    client.connect(URL)

    connector().open()
    connector().receive({
      type: 'ERROR',
      channel: 0,
      error: 'UNSUPPORTED_PROTOCOL',
      message: 'Unsupported protocol version',
    })
    connector().close('', false, 1000)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(scheduler.has(RECONNECT_KEY)).toBe(false)
    expect(errors[errors.length - 1]).toEqual({
      type: 'UNSUPPORTED_PROTOCOL',
      message: 'Unsupported protocol version',
    })
  })

  test('backs off and counts attempts that fail after SETUP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const { client, scheduler, connector } = setup({ maxReconnectAttempts: 3 })
    client.setAuthToken('token')
    client.connect(URL)

    const delays: (number | undefined)[] = []
    for (let i = 0; i < 3; i++) {
      connector().handshake('UNAUTHORIZED')
      connector().close('', true, 1006)
      delays.push(scheduler.timeoutOf(RECONNECT_KEY))
      scheduler.run(RECONNECT_KEY)
    }
    connector().handshake('UNAUTHORIZED')
    connector().close('', true, 1006)

    expect(delays).toEqual([1000, 2000, 4000])
    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
  })

  test('stops when the server requires a token and none is set', () => {
    const { client, scheduler, connector } = setup()
    client.connect(URL)

    connector().handshake('UNAUTHORIZED')
    connector().close('', false, 1000)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(scheduler.has(RECONNECT_KEY)).toBe(false)
  })

  test('retries when the connection drops before a token is set', () => {
    const { client, scheduler, connector } = setup()
    client.connect(URL)

    connector().handshake('UNAUTHORIZED')
    connector().close('Service Restart', true, 1012)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.CONNECTING)
    expect(scheduler.has(RECONNECT_KEY)).toBe(true)
  })

  test('a channel opened without reconnect gets the error before it is closed', () => {
    const { client, connector } = setup()
    const channel = client.openChannel('RPC', {}, { reconnect: false })
    const events: string[] = []
    channel.addErrorListener((error) => events.push(`error: ${error.message}`))
    channel.addStateChangeListener((state) => events.push(`state: ${state}`))
    client.connect(URL)

    connector().close('Unable to connect', true, 1006)

    expect(events).toEqual(['error: Unable to connect (code 1006)', 'state: CLOSED'])
  })
})

describe('transport close', () => {
  test('a clean close is not reported as an error', () => {
    const { client, scheduler, errors, connector } = setup()
    client.connect(URL)
    connector().handshake('AUTHORIZED')

    connector().close('', false, 1000)

    expect(errors).toEqual([])
    expect(scheduler.has(RECONNECT_KEY)).toBe(true)
  })

  test('an abnormal close is reported with its code', () => {
    const { client, scheduler, errors, connector } = setup()
    client.connect(URL)
    connector().handshake('AUTHORIZED')

    connector().close('', true, 1006)

    expect(errors).toEqual([{ type: 'UNKNOWN', message: 'Connection closed (code 1006)' }])
    expect(scheduler.has(RECONNECT_KEY)).toBe(true)
  })

  test('the close reason is kept in the error', () => {
    const { client, errors, connector } = setup()
    client.connect(URL)
    connector().handshake('AUTHORIZED')

    connector().close('Server restart', true, 1012)

    expect(errors).toEqual([{ type: 'UNKNOWN', message: 'Server restart (code 1012)' }])
  })

  test('a clean close before authorization is reported', () => {
    const { client, errors, connector } = setup()
    client.connect(URL)
    connector().open()

    connector().close('', false, 1001)

    expect(errors).toEqual([{ type: 'UNKNOWN', message: 'Connection closed (code 1001)' }])
  })

  test('a clean close with a reason is reported', () => {
    const { client, errors, connector } = setup()
    client.connect(URL)
    connector().handshake('AUTHORIZED')

    connector().close('Limit Violation', false, 1000)

    expect(errors).toEqual([{ type: 'UNKNOWN', message: 'Limit Violation (code 1000)' }])
  })
})

describe('reconnect backoff', () => {
  const collectDelays = (attempts: number, config: Partial<DXLinkWebSocketClientConfig> = {}) => {
    const { client, scheduler, connector } = setup(config)
    client.connect(URL)

    const delays: (number | undefined)[] = []
    for (let i = 0; i < attempts; i++) {
      connector().close('Unable to connect', true, 1006)
      delays.push(scheduler.timeoutOf(RECONNECT_KEY))
      scheduler.run(RECONNECT_KEY)
    }
    return delays
  }

  test('doubles the delay up to the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    expect(collectDelays(8)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
  })

  test('jitter spreads the delay between half and full', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(collectDelays(7)).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000])
  })

  test('the cap is configurable', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    expect(collectDelays(4, { maxReconnectDelay: 3 })).toEqual([1000, 2000, 3000, 3000])
  })

  test.each([undefined, Number.NaN, 0, -1])('an invalid cap %s falls back to 30 seconds', (cap) => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    expect(collectDelays(7, { maxReconnectDelay: cap as number })).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ])
  })

  test('the delay stays within the timer limit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    const delays = collectDelays(40, { maxReconnectDelay: Infinity }) as number[]

    expect(Math.max(...delays)).toBe(2 ** 31 - 1)
  })
})

describe('max reconnect attempts', () => {
  test('stops and tells client listeners and waiting channels with the last error', () => {
    const { client, scheduler, errors, connector } = setup({ maxReconnectAttempts: 2 })
    const { errors: channelErrors } = openWaitingChannel(client)
    client.connect(URL)

    connector().close('Unable to connect', true, 1006)
    scheduler.run(RECONNECT_KEY)
    connector().close('Unable to connect', true, 1006)
    scheduler.run(RECONNECT_KEY)
    connector().close('Unable to connect', true, 1006)

    const stop = {
      type: 'UNKNOWN',
      message: 'Max reconnect attempts reached. Last error: Unable to connect (code 1006)',
    }
    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(scheduler.has(RECONNECT_KEY)).toBe(false)
    expect(channelErrors).toEqual([stop])
    expect(errors[errors.length - 1]).toEqual(stop)
  })

  test('opened channels are told, and re-requested on the next connect', () => {
    const { client, connector } = setup({ maxReconnectAttempts: 0 })
    client.connect(URL)
    connector().handshake('AUTHORIZED')
    const { channel, errors: channelErrors } = openWaitingChannel(client)
    const oneShot = client.openChannel('RPC', {}, { reconnect: false })
    connector().receive({ type: 'CHANNEL_OPENED', channel: channel.id, service: 'FEED' })
    connector().receive({ type: 'CHANNEL_OPENED', channel: oneShot.id, service: 'RPC' })

    connector().close('', true, 1006)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.NOT_CONNECTED)
    expect(channelErrors).toEqual([
      {
        type: 'UNKNOWN',
        message: 'Max reconnect attempts reached. Last error: Connection closed (code 1006)',
      },
    ])
    expect(channel.getState()).toBe(DXLinkChannelState.REQUESTED)
    expect(oneShot.getState()).toBe(DXLinkChannelState.CLOSED)
  })

  test('a protocol error is not given as the reason to stop', () => {
    const { client, connector } = setup({ maxReconnectAttempts: 0 })
    client.connect(URL)
    connector().handshake('AUTHORIZED')
    const { errors: channelErrors } = openWaitingChannel(client)

    connector().receive({
      type: 'ERROR',
      channel: 0,
      error: 'BAD_ACTION',
      message: 'Unknown message type',
    })
    connector().close('', false, 1000)

    expect(channelErrors).toEqual([{ type: 'UNKNOWN', message: 'Max reconnect attempts reached' }])
  })

  test('a channel closed by its error listener leaves no timers behind', () => {
    const { client, scheduler, connector } = setup({ maxReconnectAttempts: 0 })
    const channel = client.openChannel('FEED', { contract: 'AUTO' })
    channel.addErrorListener(() => channel.close())
    client.connect(URL)

    connector().close('Unable to connect', true, 1006)

    expect(channel.getState()).toBe(DXLinkChannelState.CLOSED)
    expect([...scheduler.tasks.keys()]).toEqual([])
  })

  test('a listener that connects again keeps the channels', () => {
    const { client, connector } = setup({ maxReconnectAttempts: 0 })
    const { channel, errors: channelErrors } = openWaitingChannel(client)
    client.addConnectionStateChangeListener((state) => {
      if (state === DXLinkConnectionState.NOT_CONNECTED) client.connect('wss://backup.test/dxlink')
    })
    client.connect(URL)

    connector().close('Unable to connect', true, 1006)

    expect(client.getConnectionState()).toBe(DXLinkConnectionState.CONNECTING)
    expect(channelErrors).toEqual([])

    connector().handshake('AUTHORIZED')

    expect(connector().getUrl()).toBe('wss://backup.test/dxlink')
    expect(connector().sent).toContainEqual(
      expect.objectContaining({ type: 'CHANNEL_REQUEST', channel: channel.id })
    )
  })
})

describe('logging', () => {
  test('logs an unhandled error as text, with the URL stripped of credentials and query', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scheduler = new FakeScheduler()
    let connector: FakeConnector | undefined
    const client = new DXLinkWebSocketClient({
      scheduler,
      connectorFactory: (url) => (connector = new FakeConnector(url)),
    })

    client.connect('wss://user:secret@example.test/dxlink?token=secret#fragment')
    connector?.close('Unable to connect', true, 1006)

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]).toEqual([
      '[DXLinkWebSocketClient] Unhandled dxLink error (wss://example.test/dxlink): UNKNOWN: Unable to connect (code 1006)',
    ])
  })

  test('logs a URL that cannot be parsed without credentials and query', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scheduler = new FakeScheduler()
    let connector: FakeConnector | undefined
    const client = new DXLinkWebSocketClient({
      scheduler,
      connectorFactory: (url) => (connector = new FakeConnector(url)),
    })

    client.connect('//user:secret@example.test/dxlink?token=secret')
    connector?.close('Unable to connect', true, 1006)

    expect(consoleError.mock.calls[0]).toEqual([
      '[DXLinkWebSocketClient] Unhandled dxLink error (//example.test/dxlink): UNKNOWN: Unable to connect (code 1006)',
    ])
  })

  test('logs an unhandled channel error as text', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, connector } = setup()
    client.connect(URL)
    connector().handshake('AUTHORIZED')
    const channel = client.openChannel('FEED', { contract: 'AUTO' })

    connector().receive({
      type: 'ERROR',
      channel: channel.id,
      error: 'BAD_ACTION',
      message: 'Unknown event type',
    })

    expect(consoleError.mock.calls[0]).toEqual([
      `[DXLinkWebSocketChannel#${channel.id} FEED] Unhandled error in channel#${channel.id}: BAD_ACTION: Unknown event type`,
    ])
  })
})
