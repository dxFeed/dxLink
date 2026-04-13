import {
  type DXLinkChannel,
  type DXLinkChannelMessage,
  type DXLinkChannelMessageListener,
  DXLinkChannelState,
  type DXLinkChannelStateChangeListener,
  type DXLinkClient,
  type DXLinkError,
  type DXLinkErrorListener,
} from '@dxfeed/dxlink-core'
import { ReplaySubject, Subject } from 'rxjs'
import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { DxLinkRpcService } from './'

// --- Mock helpers ---

interface MockChannel extends DXLinkChannel {
  simulateOpen(): void
  simulateMessage(message: DXLinkChannelMessage): void
  simulateClose(): void
  simulateError(error: DXLinkError): void
  simulateRequested(): void
  readonly sentMessages: DXLinkChannelMessage[]
  readonly closed: boolean
}

function createMockChannel(
  id: number,
  service: string,
  parameters: Record<string, unknown>
): MockChannel {
  let state = DXLinkChannelState.REQUESTED
  const messageListeners = new Set<DXLinkChannelMessageListener>()
  const stateListeners = new Set<DXLinkChannelStateChangeListener>()
  const errorListeners = new Set<DXLinkErrorListener>()
  const sentMessages: DXLinkChannelMessage[] = []
  let closed = false

  const setState = (newState: DXLinkChannelState) => {
    const prev = state
    state = newState
    for (const listener of stateListeners) {
      listener(newState, prev)
    }
  }

  return {
    id,
    service,
    parameters,
    get sentMessages() {
      return sentMessages
    },
    get closed() {
      return closed
    },
    send(message: DXLinkChannelMessage) {
      if (state !== DXLinkChannelState.OPENED) {
        throw new Error('Channel is not ready')
      }
      sentMessages.push(message)
    },
    addMessageListener: (l) => {
      messageListeners.add(l)
    },
    removeMessageListener: (l) => {
      messageListeners.delete(l)
    },
    getState: () => state,
    addStateChangeListener: (l) => {
      stateListeners.add(l)
    },
    removeStateChangeListener: (l) => {
      stateListeners.delete(l)
    },
    addErrorListener: (l) => {
      errorListeners.add(l)
    },
    removeErrorListener: (l) => {
      errorListeners.delete(l)
    },
    close() {
      closed = true
      setState(DXLinkChannelState.CLOSED)
    },
    simulateOpen() {
      setState(DXLinkChannelState.OPENED)
    },
    simulateMessage(message: DXLinkChannelMessage) {
      for (const listener of messageListeners) {
        listener(message)
      }
    },
    simulateClose() {
      setState(DXLinkChannelState.CLOSED)
    },
    simulateError(error: DXLinkError) {
      for (const listener of errorListeners) {
        listener(error)
      }
    },
    simulateRequested() {
      setState(DXLinkChannelState.REQUESTED)
    },
  }
}

function createMockClient(): {
  client: DXLinkClient
  lastChannel: MockChannel | undefined
} {
  const state = { lastChannel: undefined as MockChannel | undefined }

  const client = {
    openChannel(service: string, parameters: Record<string, unknown>): DXLinkChannel {
      const channel = createMockChannel(1, service, parameters)
      state.lastChannel = channel
      return channel
    },
  } as DXLinkClient

  return {
    client,
    get lastChannel() {
      return state.lastChannel
    },
  }
}

// --- Tests ---

test('opens channel with service and method on subscribe', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'myService')
  const input$ = new Subject<{ query: string }>()

  const sub = rpc.streamStream('GetData', input$).subscribe()

  assert.ok(mock.lastChannel, 'channel should be created')
  assert.is(mock.lastChannel!.service, 'myService')
  assert.is(mock.lastChannel!.parameters['methodName'], 'GetData')

  sub.unsubscribe()
})

test('sends input values as CHANNEL_DATA when channel is opened', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject<{ query: string }>()

  const sub = rpc.streamStream('Method', input$).subscribe()
  mock.lastChannel!.simulateOpen()

  input$.next({ query: 'AAPL' })
  input$.next({ query: 'GOOGL' })

  assert.is(mock.lastChannel!.sentMessages.length, 2)
  assert.is(mock.lastChannel!.sentMessages[0]!.type, 'CHANNEL_DATA')
  assert.equal(mock.lastChannel!.sentMessages[0]!['payload'], { query: 'AAPL' })
  assert.is(mock.lastChannel!.sentMessages[1]!.type, 'CHANNEL_DATA')
  assert.equal(mock.lastChannel!.sentMessages[1]!['payload'], { query: 'GOOGL' })

  sub.unsubscribe()
})

test('emits CHANNEL_DATA payload on output observable', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()
  const received: unknown[] = []

  const sub = rpc.streamStream('Method', input$).subscribe({
    next: (val) => received.push(val),
  })
  mock.lastChannel!.simulateOpen()

  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { price: 150 } })
  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { price: 151 } })

  assert.is(received.length, 2)
  assert.equal(received[0], { price: 150 })
  assert.equal(received[1], { price: 151 })

  sub.unsubscribe()
})

test('ignores non-CHANNEL_DATA messages', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()
  const received: unknown[] = []

  const sub = rpc.streamStream('Method', input$).subscribe({
    next: (val) => received.push(val),
  })
  mock.lastChannel!.simulateOpen()

  mock.lastChannel!.simulateMessage({ type: 'SOME_OTHER_TYPE', data: 'hello' })
  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 1 } })

  assert.is(received.length, 1)
  assert.equal(received[0], { value: 1 })

  sub.unsubscribe()
})

test('closes channel on unsubscribe', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()

  const sub = rpc.streamStream('Method', input$).subscribe()
  mock.lastChannel!.simulateOpen()

  assert.is(mock.lastChannel!.closed, false)
  sub.unsubscribe()
  assert.is(mock.lastChannel!.closed, true)
})

test('completes output when channel is closed by server', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()
  let completed = false

  const sub = rpc.streamStream('Method', input$).subscribe({
    complete: () => {
      completed = true
    },
  })
  mock.lastChannel!.simulateOpen()
  mock.lastChannel!.simulateClose()

  assert.is(completed, true)

  sub.unsubscribe()
})

test('errors output when channel receives error', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()
  let receivedError: DXLinkError | undefined

  const sub = rpc.streamStream('Method', input$).subscribe({
    error: (err) => {
      receivedError = err
    },
  })
  mock.lastChannel!.simulateOpen()
  mock.lastChannel!.simulateError({ type: 'UNAUTHORIZED', message: 'Not authorized' })

  assert.ok(receivedError)
  assert.is(receivedError!.type, 'UNAUTHORIZED')
  assert.is(receivedError!.message, 'Not authorized')

  sub.unsubscribe()
})

test('errors output when input$ errors', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()
  let receivedError: unknown

  const sub = rpc.streamStream('Method', input$).subscribe({
    error: (err) => {
      receivedError = err
    },
  })
  mock.lastChannel!.simulateOpen()
  input$.error(new Error('input failed'))

  assert.ok(receivedError)
  assert.instance(receivedError, Error)

  sub.unsubscribe()
})

test('input$ completing does not close the channel', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject()
  let completed = false

  const sub = rpc.streamStream('Method', input$).subscribe({
    complete: () => {
      completed = true
    },
  })
  mock.lastChannel!.simulateOpen()
  input$.complete()

  assert.is(mock.lastChannel!.closed, false)
  assert.is(completed, false)

  sub.unsubscribe()
})

test('resubscribes to input$ on channel reconnect', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject<string>()

  const sub = rpc.streamStream('Method', input$).subscribe()
  mock.lastChannel!.simulateOpen()

  input$.next('msg1')
  assert.is(mock.lastChannel!.sentMessages.length, 1)

  // Simulate reconnect
  mock.lastChannel!.simulateRequested()
  mock.lastChannel!.simulateOpen()

  input$.next('msg2')
  assert.is(mock.lastChannel!.sentMessages.length, 2)
  assert.equal(mock.lastChannel!.sentMessages[1]!['payload'], 'msg2')

  sub.unsubscribe()
})

test('does not subscribe to input until channel is OPENED', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new Subject<string>()

  const sub = rpc.streamStream('Method', input$).subscribe()

  // Channel is REQUESTED, not yet OPENED — input is not subscribed yet.
  // Subject values emitted now are lost (caller should use ReplaySubject for buffering).
  input$.next('early-1')
  assert.is(mock.lastChannel!.sentMessages.length, 0)

  // Once OPENED, input is subscribed; subsequent values are sent.
  mock.lastChannel!.simulateOpen()
  input$.next('after-open')
  assert.is(mock.lastChannel!.sentMessages.length, 1)
  assert.equal(mock.lastChannel!.sentMessages[0]!['payload'], 'after-open')

  sub.unsubscribe()
})

test('ReplaySubject input drains buffered values once channel is OPENED', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new ReplaySubject<string>()

  const sub = rpc.streamStream('Method', input$).subscribe()

  // Values emitted before OPENED — ReplaySubject buffers them
  input$.next('early-1')
  input$.next('early-2')
  assert.is(mock.lastChannel!.sentMessages.length, 0)

  // Once OPENED, ReplaySubject replays its buffer
  mock.lastChannel!.simulateOpen()
  assert.is(mock.lastChannel!.sentMessages.length, 2)
  assert.equal(mock.lastChannel!.sentMessages[0]!['payload'], 'early-1')
  assert.equal(mock.lastChannel!.sentMessages[1]!['payload'], 'early-2')

  sub.unsubscribe()
})

test('ReplaySubject input is replayed after reconnect', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const input$ = new ReplaySubject<string>()

  const sub = rpc.streamStream('Method', input$).subscribe()
  mock.lastChannel!.simulateOpen()

  input$.next('before')
  assert.is(mock.lastChannel!.sentMessages.length, 1)

  // Simulate connection drop — channel goes back to REQUESTED, input is unsubscribed
  mock.lastChannel!.simulateRequested()

  // New value during REQUESTED — buffered by ReplaySubject
  input$.next('during-requested')
  assert.is(mock.lastChannel!.sentMessages.length, 1)

  // Reconnect succeeds — input is re-subscribed, ReplaySubject replays both values
  mock.lastChannel!.simulateOpen()
  assert.is(mock.lastChannel!.sentMessages.length, 3)
  assert.equal(mock.lastChannel!.sentMessages[1]!['payload'], 'before')
  assert.equal(mock.lastChannel!.sentMessages[2]!['payload'], 'during-requested')

  sub.unsubscribe()
})

// --- requestResponse tests ---

test('requestResponse sends one request and emits response', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const received: unknown[] = []
  let completed = false

  const sub = rpc.requestResponse('Method', { query: 'AAPL' }).subscribe({
    next: (val) => received.push(val),
    complete: () => {
      completed = true
    },
  })
  mock.lastChannel!.simulateOpen()

  assert.is(mock.lastChannel!.sentMessages.length, 1)
  assert.equal(mock.lastChannel!.sentMessages[0]!['payload'], { query: 'AAPL' })

  // Server sends one response then closes the channel
  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { price: 150 } })
  mock.lastChannel!.simulateClose()

  assert.is(received.length, 1)
  assert.equal(received[0], { price: 150 })
  assert.is(completed, true)

  sub.unsubscribe()
})

// --- requestStream tests ---

test('requestStream sends one request and emits multiple responses', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  const received: unknown[] = []

  const sub = rpc.requestStream('Method', { query: 'AAPL' }).subscribe({
    next: (val) => received.push(val),
  })
  mock.lastChannel!.simulateOpen()

  assert.is(mock.lastChannel!.sentMessages.length, 1)
  assert.equal(mock.lastChannel!.sentMessages[0]!['payload'], { query: 'AAPL' })

  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { price: 150 } })
  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { price: 151 } })
  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { price: 152 } })

  assert.is(received.length, 3)

  sub.unsubscribe()
})

test('requestStream completes when server closes channel', () => {
  const mock = createMockClient()
  const rpc = new DxLinkRpcService(mock.client, 'svc')
  let completed = false

  const sub = rpc.requestStream('Method', {}).subscribe({
    complete: () => {
      completed = true
    },
  })
  mock.lastChannel!.simulateOpen()
  mock.lastChannel!.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 1 } })
  mock.lastChannel!.simulateClose()

  assert.is(completed, true)

  sub.unsubscribe()
})

test.run()
