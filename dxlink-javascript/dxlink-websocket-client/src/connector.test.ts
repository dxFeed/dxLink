import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { DefaultDXLinkWebSocketConnector } from './connector'

/**
 * Minimal stand-in for the browser WebSocket: the test dispatches its events.
 */
class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = []

  readonly send = vi.fn()
  readonly close = vi.fn()

  constructor(readonly url: string) {
    super()
    FakeWebSocket.instances.push(this)
  }

  emitOpen = () => this.dispatchEvent(new Event('open'))
  emitError = () => this.dispatchEvent(new Event('error'))
  emitClose = (code: number, reason = '') =>
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }))
}

const URL = 'wss://example.test/dxlink'

const start = () => {
  const connector = new DefaultDXLinkWebSocketConnector(URL)
  const closeListener = vi.fn()
  connector.setCloseListener(closeListener)
  connector.start()

  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  if (socket === undefined) throw new Error('WebSocket was not created')

  return { connector, closeListener, socket }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DefaultDXLinkWebSocketConnector', () => {
  test('an error before the socket opened is reported as a failed connect', () => {
    const { closeListener, socket } = start()

    socket.emitError()

    expect(closeListener).toHaveBeenCalledTimes(1)
    expect(closeListener).toHaveBeenCalledWith('Unable to connect', true, 1006)
  })

  test('an error after the socket opened is reported as a connection error', () => {
    const { closeListener, socket } = start()
    socket.emitOpen()

    socket.emitError()

    expect(closeListener).toHaveBeenCalledWith('Connection error', true, 1006)
  })

  test('the close event after an error is not reported again', () => {
    const { closeListener, socket } = start()

    socket.emitError()
    socket.emitClose(1006)

    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  test.each([1000, 1001, 1005])('close code %i is a clean close', (code) => {
    const { closeListener, socket } = start()
    socket.emitOpen()

    socket.emitClose(code, 'bye')

    expect(closeListener).toHaveBeenCalledWith('bye', false, code)
  })

  test.each([1006, 1011, 4000])('close code %i is an error', (code) => {
    const { closeListener, socket } = start()
    socket.emitOpen()

    socket.emitClose(code)

    expect(closeListener).toHaveBeenCalledWith('', true, code)
  })
})
