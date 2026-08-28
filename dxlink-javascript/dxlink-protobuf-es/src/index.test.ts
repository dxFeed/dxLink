import { readFileSync } from 'node:fs'

import {
  createFileRegistry,
  type DescService,
  fromBinary,
  type MessageInitShape,
} from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'
import type {
  DXLinkChannel,
  DXLinkChannelMessage,
  DXLinkChannelMessageListener,
  DXLinkChannelOptions,
  DXLinkChannelStateChangeListener,
  DXLinkClient,
} from '@dxfeed/dxlink-core'
import { DXLinkChannelState } from '@dxfeed/dxlink-core'
import { type Observable, Subject } from 'rxjs'
import { expect, test } from 'vitest'

import {
  Flavour,
  MixedService,
  NamingService,
  type PingSchema,
  type Pong,
  TestService,
} from './gen/test/gen/v1/test_service_pb'

import {
  createDXLinkDynamicService,
  createDXLinkService,
  type DXLinkServiceClient,
  DXLinkUnsupportedMethodKindError,
} from './'

// --- Descriptors ---
//
// Two views of one fixture, `proto/test/gen/v1/test_service.proto`. The generated code under
// `src/gen/test/` is what a consumer with a codegen step binds; `src/gen/test_service.binpb` is
// the `FileDescriptorSet` buf builds from the same file, which is what a consumer that resolves
// descriptors from a server gets — the debug console, for one. Both must bind the same way, and
// generating them from one source is what makes that comparison mean anything.

const descriptorSet = fromBinary(
  FileDescriptorSetSchema,
  readFileSync(new URL('./gen/test_service.binpb', import.meta.url))
)

const registry = createFileRegistry(descriptorSet)

const getService = (typeName: string): DescService => {
  const service = registry.getService(typeName)
  if (service === undefined) throw new Error(`Missing test descriptor for ${typeName}`)
  return service
}

const RuntimeTestService = getService('test.gen.v1.TestService')
const RuntimeMixedService = getService('test.gen.v1.MixedService')

/**
 * A decoded `Pong` carrying only `value` — proto3 fills the rest of the message with defaults,
 * whether the descriptor came from generated code or from the descriptor set.
 */
const pong = (value: string) => ({
  $typeName: 'test.gen.v1.Pong',
  value,
  flavour: Flavour.UNSPECIFIED,
  nested: [],
  extra: {},
})

// --- Mock client ---

interface MockChannel extends DXLinkChannel {
  readonly options: DXLinkChannelOptions | undefined
  readonly sent: DXLinkChannelMessage[]
  simulateOpen(): void
  simulateMessage(message: DXLinkChannelMessage): void
  simulateClose(): void
}

const createMockChannel = (
  service: string,
  parameters: Record<string, unknown>,
  options: DXLinkChannelOptions | undefined
): MockChannel => {
  let state = DXLinkChannelState.REQUESTED
  const messageListeners = new Set<DXLinkChannelMessageListener>()
  const stateListeners = new Set<DXLinkChannelStateChangeListener>()
  const sent: DXLinkChannelMessage[] = []

  const setState = (next: DXLinkChannelState) => {
    const prev = state
    state = next
    for (const listener of stateListeners) listener(next, prev)
  }

  return {
    id: 1,
    service,
    parameters,
    options,
    sent,
    send: (message) => {
      sent.push(message)
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
    addErrorListener: () => {},
    removeErrorListener: () => {},
    close: () => setState(DXLinkChannelState.CLOSED),
    simulateOpen: () => setState(DXLinkChannelState.OPENED),
    simulateMessage: (message) => {
      for (const listener of messageListeners) listener(message)
    },
    simulateClose: () => setState(DXLinkChannelState.CLOSED),
  }
}

const createMockClient = () => {
  const channels: MockChannel[] = []

  const client = {
    openChannel(
      service: string,
      parameters: Record<string, unknown>,
      options: DXLinkChannelOptions | undefined
    ) {
      const channel = createMockChannel(service, parameters, options)
      channels.push(channel)
      return channel
    },
  } as unknown as DXLinkClient

  return {
    client,
    channels,
    get lastChannel(): MockChannel {
      const channel = channels[channels.length - 1]
      if (channel === undefined) throw new Error('No channel was opened')
      return channel
    },
  }
}

const payloadsOf = (channel: MockChannel) => channel.sent.map((message) => message['payload'])

// --- Tests ---

test('binds one client method per rpc, keyed by its ECMAScript name', () => {
  const mock = createMockClient()

  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)

  expect(Object.keys(service)).toEqual(['unary', 'serverStream', 'bidiStream'])
})

test('opens a channel per call, named by service type name and proto method name', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)

  const sub = service.unary!({ value: 'ping' }).subscribe()

  expect(mock.lastChannel.service).toBe('test.gen.v1.TestService')
  expect(mock.lastChannel.parameters['methodName']).toBe('Unary')

  sub.unsubscribe()
})

test('encodes unary requests as protobuf-JSON and decodes the response', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)
  const received: unknown[] = []
  let completed = false

  const sub = service.unary!({ value: 'ping' }).subscribe({
    next: (message) => received.push(message),
    complete: () => {
      completed = true
    },
  })
  mock.lastChannel.simulateOpen()

  expect(payloadsOf(mock.lastChannel)).toEqual([{ value: 'ping' }])

  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'pong' } })
  mock.lastChannel.simulateClose()

  expect(received).toEqual([pong('pong')])
  expect(completed, 'unary call completes when the server closes the channel').toBe(true)

  sub.unsubscribe()
})

test('decodes every response of a server-streaming call', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)
  const received: unknown[] = []

  const sub = service.serverStream!({ value: 'ping' }).subscribe({
    next: (message) => received.push(message),
  })
  mock.lastChannel.simulateOpen()

  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'one' } })
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'two' } })

  expect(received).toEqual([pong('one'), pong('two')])

  sub.unsubscribe()
})

test('encodes each request of a bidirectional call', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)
  const requests = new Subject<Record<string, unknown>>()
  const received: unknown[] = []

  const sub = service.bidiStream!(requests).subscribe({
    next: (message) => received.push(message),
  })
  mock.lastChannel.simulateOpen()

  requests.next({ value: 'first' })
  requests.next({ value: 'second' })
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'reply' } })

  expect(payloadsOf(mock.lastChannel)).toEqual([{ value: 'first' }, { value: 'second' }])
  expect(received).toEqual([pong('reply')])

  sub.unsubscribe()
})

test('rejects a bidirectional call that is not given a stream of requests', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)

  expect(() => service.bidiStream!({ value: 'ping' })).toThrow(/expects an Observable/)
})

test('rejects client-streaming methods while binding the service', () => {
  const mock = createMockClient()

  expect(() => createDXLinkDynamicService(mock.client, RuntimeMixedService)).toThrow(
    DXLinkUnsupportedMethodKindError
  )
})

test('leaves unsupported methods out of the client when asked to skip them', () => {
  const mock = createMockClient()

  const service = createDXLinkDynamicService(mock.client, RuntimeMixedService, {
    skipUnsupportedMethods: true,
  })

  expect(Object.keys(service)).toEqual(['echo'])
})

test('forwards the retry option to the channel', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)

  const withRetry = service.unary!({ value: 'ping' }, { retry: true }).subscribe()
  expect(mock.lastChannel.options).toEqual({ reconnect: true })
  withRetry.unsubscribe()

  const withoutRetry = service.unary!({ value: 'ping' }).subscribe()
  expect(mock.lastChannel.options).toEqual({ reconnect: false })
  withoutRetry.unsubscribe()
})

test('reports which method failed when a response cannot be decoded', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)
  let error: unknown

  const sub = service.serverStream!({ value: 'ping' }).subscribe({
    error: (err) => {
      error = err
    },
  })
  mock.lastChannel.simulateOpen()
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 42 } })

  expect(String(error)).toContain('test.gen.v1.TestService/ServerStream')

  sub.unsubscribe()
})

test('reports which method failed when a request cannot be encoded', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, RuntimeTestService)

  expect(() => service.unary!({ value: 42 })).toThrow(/test\.gen\.v1\.TestService\/Unary/)
})

// --- The typed path ---
//
// Everything below binds `src/gen/`, which is real `protoc-gen-es` output rather than a
// hand-written approximation of it, so that the type mapping is asserted against what the
// generator actually emits. `pnpm typecheck` is half of these tests: the annotations and the
// `@ts-expect-error` comments fail the build if inference drifts.

type Expect<T extends true> = T
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

// Taken from an actual binding rather than rebuilt from the descriptor, so the assertions below
// describe what a caller really gets back.
const _typedClient = createDXLinkService(createMockClient().client, TestService)
type TypedClient = typeof _typedClient

// Requests are init shapes of the descriptor's input; responses are its output.
type _Unary = Expect<Equal<ReturnType<TypedClient['unary']>, Observable<Pong>>>
type _ServerStream = Expect<Equal<ReturnType<TypedClient['serverStream']>, Observable<Pong>>>
type _BidiStream = Expect<Equal<ReturnType<TypedClient['bidiStream']>, Observable<Pong>>>
type _Request = Expect<
  Equal<Parameters<TypedClient['unary']>[0], MessageInitShape<typeof PingSchema>>
>

// Bidirectional methods take a stream and nothing else; the rest take a request and options.
type _BidiArity = Expect<Equal<Parameters<TypedClient['bidiStream']>['length'], 1>>
type _UnaryArity = Expect<Equal<Parameters<TypedClient['unary']>['length'], 1 | 2>>

// A client-streaming method is `never`, so calling it cannot compile.
type _ClientStreaming = Expect<
  Equal<DXLinkServiceClient<typeof MixedService.method>['collect'], never>
>

test('infers request and response types from generated code', () => {
  const mock = createMockClient()
  // No cast: the generated `GenService` is passed straight in.
  const service = createDXLinkService(mock.client, TestService)

  const unary: Observable<Pong> = service.unary({ value: 'ping' })
  const serverStream: Observable<Pong> = service.serverStream({ value: 'ping' }, { retry: true })
  const bidiStream: Observable<Pong> = service.bidiStream(
    new Subject<MessageInitShape<typeof PingSchema>>()
  )

  const received: Pong[] = []
  const sub = unary.subscribe((response) => received.push(response))
  mock.lastChannel.simulateOpen()
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'pong' } })

  expect(received).toEqual([pong('pong')])
  expect(serverStream).toBeDefined()
  expect(bidiStream).toBeDefined()

  sub.unsubscribe()
})

test('leaves undeclared request fields to the compiler, not to the runtime', () => {
  const mock = createMockClient()
  const service = createDXLinkService(mock.client, TestService)

  // Requests are built from an init shape, and protobuf-es drops init keys it does not
  // recognise — so an undeclared field is a compile error and a silent omission on the wire,
  // not a thrown one. The console's request form is the place that rejects them, because it
  // goes through `fromJson` instead.
  // @ts-expect-error `nope` is not a field of test.gen.v1.Ping
  const sub = service.unary({ value: 'ping', nope: 'dropped' }).subscribe()
  mock.lastChannel.simulateOpen()

  expect(payloadsOf(mock.lastChannel)).toEqual([{ value: 'ping' }])

  sub.unsubscribe()
})

test('rejects a generated bidirectional call that is not given a stream', () => {
  const mock = createMockClient()
  const service = createDXLinkService(mock.client, TestService)

  // @ts-expect-error a bidirectional method needs a stream of requests
  expect(() => service.bidiStream({ value: 'ping' })).toThrow(/expects an Observable/)
})

test('encodes every field kind of a generated message as protobuf-JSON', () => {
  const mock = createMockClient()
  const service = createDXLinkService(mock.client, TestService)

  const sub = service
    .unary({
      value: 'ping',
      sentAtMillis: 1n,
      flavour: Flavour.SALTED,
      nested: [{ label: 'first' }],
      extra: { key: 'value' },
    })
    .subscribe()
  mock.lastChannel.simulateOpen()

  // int64 as a string, the enum by its proto name, the snake_case field by its deduced json_name.
  expect(payloadsOf(mock.lastChannel)).toEqual([
    {
      value: 'ping',
      sentAtMillis: '1',
      flavour: 'FLAVOUR_SALTED',
      nested: [{ label: 'first' }],
      extra: { key: 'value' },
    },
  ])

  sub.unsubscribe()
})

test('keys generated methods by their ECMAScript name and calls them by their proto name', () => {
  const mock = createMockClient()
  const service = createDXLinkService(mock.client, NamingService)

  // `RPCPing` and `ping_pong` are what the wire carries; the client is keyed by what
  // protoc-gen-es named them, which is neither camelCase nor unchanged in general.
  expect(Object.keys(service)).toEqual(['rPCPing', 'ping_pong'])

  const first = service.rPCPing({ value: 'ping' }).subscribe()
  expect(mock.lastChannel.parameters['methodName']).toBe('RPCPing')
  first.unsubscribe()

  const second = service.ping_pong({ value: 'ping' }).subscribe()
  expect(mock.lastChannel.parameters['methodName']).toBe('ping_pong')
  second.unsubscribe()
})

test('rejects client-streaming methods declared by generated code', () => {
  const mock = createMockClient()

  expect(() => createDXLinkService(mock.client, MixedService)).toThrow(
    DXLinkUnsupportedMethodKindError
  )
  expect(
    Object.keys(createDXLinkService(mock.client, MixedService, { skipUnsupportedMethods: true }))
  ).toEqual(['echo'])
})
