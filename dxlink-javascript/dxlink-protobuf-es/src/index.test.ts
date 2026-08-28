import { create, createFileRegistry, type DescService, type Message } from '@bufbuild/protobuf'
import type { GenMessage, GenService } from '@bufbuild/protobuf/codegenv2'
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorSetSchema,
} from '@bufbuild/protobuf/wkt'
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
  createDXLinkDynamicService,
  createDXLinkService,
  DXLinkUnsupportedMethodKindError,
} from './'

// --- Descriptors ---
//
// Built the way a runtime consumer would build them — from a `FileDescriptorSet` rather than from
// generated code — so the binding is exercised against real `DescService` / `DescMessage` objects
// without a codegen step.

const stringField = (name: string) => ({
  name,
  jsonName: name,
  number: 1,
  label: FieldDescriptorProto_Label.OPTIONAL,
  type: FieldDescriptorProto_Type.STRING,
})

const fileDescriptorSet = create(FileDescriptorSetSchema, {
  file: [
    {
      name: 'test/v1/test.proto',
      package: 'test.v1',
      syntax: 'proto3',
      messageType: [
        { name: 'Ping', field: [stringField('value')] },
        { name: 'Pong', field: [stringField('value')] },
      ],
      service: [
        {
          name: 'TestService',
          method: [
            { name: 'Unary', inputType: '.test.v1.Ping', outputType: '.test.v1.Pong' },
            {
              name: 'ServerStream',
              inputType: '.test.v1.Ping',
              outputType: '.test.v1.Pong',
              serverStreaming: true,
            },
            {
              name: 'BidiStream',
              inputType: '.test.v1.Ping',
              outputType: '.test.v1.Pong',
              clientStreaming: true,
              serverStreaming: true,
            },
          ],
        },
        {
          name: 'ClientStreamingService',
          method: [
            {
              name: 'Collect',
              inputType: '.test.v1.Ping',
              outputType: '.test.v1.Pong',
              clientStreaming: true,
            },
          ],
        },
      ],
    },
  ],
})

const registry = createFileRegistry(fileDescriptorSet)

const getService = (typeName: string): DescService => {
  const service = registry.getService(typeName)
  if (service === undefined) throw new Error(`Missing test descriptor for ${typeName}`)
  return service
}

export const TestService = getService('test.v1.TestService')
export const ClientStreamingService = getService('test.v1.ClientStreamingService')

export type Ping = Message<'test.v1.Ping'> & { value: string }
export type Pong = Message<'test.v1.Pong'> & { value: string }

/**
 * {@link TestService} typed the way `protoc-gen-es` would type it, so the type-level mapping from
 * method kinds to client signatures can be asserted without running codegen in the tests.
 */
export const TypedTestService = TestService as unknown as GenService<{
  unary: { methodKind: 'unary'; input: GenMessage<Ping>; output: GenMessage<Pong> }
  serverStream: {
    methodKind: 'server_streaming'
    input: GenMessage<Ping>
    output: GenMessage<Pong>
  }
  bidiStream: { methodKind: 'bidi_streaming'; input: GenMessage<Ping>; output: GenMessage<Pong> }
}>

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

  const service = createDXLinkDynamicService(mock.client, TestService)

  expect(Object.keys(service)).toEqual(['unary', 'serverStream', 'bidiStream'])
})

test('opens a channel per call, named by service type name and proto method name', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)

  const sub = service.unary!({ value: 'ping' }).subscribe()

  expect(mock.lastChannel.service).toBe('test.v1.TestService')
  expect(mock.lastChannel.parameters['methodName']).toBe('Unary')

  sub.unsubscribe()
})

test('encodes unary requests as protobuf-JSON and decodes the response', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)
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

  expect(received).toEqual([{ $typeName: 'test.v1.Pong', value: 'pong' }])
  expect(completed, 'unary call completes when the server closes the channel').toBe(true)

  sub.unsubscribe()
})

test('decodes every response of a server-streaming call', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)
  const received: unknown[] = []

  const sub = service.serverStream!({ value: 'ping' }).subscribe({
    next: (message) => received.push(message),
  })
  mock.lastChannel.simulateOpen()

  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'one' } })
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'two' } })

  expect(received).toEqual([
    { $typeName: 'test.v1.Pong', value: 'one' },
    { $typeName: 'test.v1.Pong', value: 'two' },
  ])

  sub.unsubscribe()
})

test('encodes each request of a bidirectional call', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)
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
  expect(received).toEqual([{ $typeName: 'test.v1.Pong', value: 'reply' }])

  sub.unsubscribe()
})

test('rejects a bidirectional call that is not given a stream of requests', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)

  expect(() => service.bidiStream!({ value: 'ping' })).toThrow(/expects an Observable/)
})

test('rejects client-streaming methods while binding the service', () => {
  const mock = createMockClient()

  expect(() => createDXLinkDynamicService(mock.client, ClientStreamingService)).toThrow(
    DXLinkUnsupportedMethodKindError
  )
})

test('forwards the retry option to the channel', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)

  const withRetry = service.unary!({ value: 'ping' }, { retry: true }).subscribe()
  expect(mock.lastChannel.options).toEqual({ reconnect: true })
  withRetry.unsubscribe()

  const withoutRetry = service.unary!({ value: 'ping' }).subscribe()
  expect(mock.lastChannel.options).toEqual({ reconnect: false })
  withoutRetry.unsubscribe()
})

test('reports which method failed when a response cannot be decoded', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)
  let error: unknown

  const sub = service.serverStream!({ value: 'ping' }).subscribe({
    error: (err) => {
      error = err
    },
  })
  mock.lastChannel.simulateOpen()
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 42 } })

  expect(String(error)).toContain('test.v1.TestService/ServerStream')

  sub.unsubscribe()
})

test('reports which method failed when a request cannot be encoded', () => {
  const mock = createMockClient()
  const service = createDXLinkDynamicService(mock.client, TestService)

  expect(() => service.unary!({ value: 42 })).toThrow(/test\.v1\.TestService\/Unary/)
})

test('infers request and response types from a generated service descriptor', () => {
  const mock = createMockClient()
  const service = createDXLinkService(mock.client, TypedTestService)

  // Signatures and message types come from the descriptor — `pnpm typecheck` asserts them.
  const unary: Observable<Pong> = service.unary({ value: 'ping' })
  const serverStream: Observable<Pong> = service.serverStream({ value: 'ping' }, { retry: true })
  const bidiStream: Observable<Pong> = service.bidiStream(new Subject<{ value: string }>())

  const received: Pong[] = []
  const sub = unary.subscribe((response) => received.push(response))
  mock.lastChannel.simulateOpen()
  mock.lastChannel.simulateMessage({ type: 'CHANNEL_DATA', payload: { value: 'pong' } })

  expect(received).toEqual([{ $typeName: 'test.v1.Pong', value: 'pong' }])
  expect(serverStream).toBeDefined()
  expect(bidiStream).toBeDefined()

  sub.unsubscribe()
})
