import { Cause, Effect } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { describe, expect, it, vi } from 'vitest'

import { clone, toBinary } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'

import { binaryDescriptorSet, descriptorSet, jsonDescriptorSet } from './descriptors.fixture'
import {
  createRequestTemplate,
  fetchDescriptorSet,
  formatMessage,
  isMethodSupported,
  listServices,
  parseDescriptorSet,
  parseRequest,
} from './descriptors'
import { summarizeRegistry } from './summary'

const orderMessage = () => {
  const service = parseDescriptorSet(binaryDescriptorSet()).getService('demo.v1.OrderService')
  const method = service?.method['issue']
  if (method === undefined) {
    throw new Error('missing test descriptor')
  }

  return method.input
}

const SERVICE_NAMES = ['demo.v1.AccountService', 'demo.v1.OrderService']

describe('parseDescriptorSet', () => {
  it('reads a binary descriptor set', () => {
    expect(
      listServices(parseDescriptorSet(binaryDescriptorSet())).map((service) => service.typeName)
    ).toEqual(SERVICE_NAMES)
  })

  it('reads a protobuf-JSON descriptor set', () => {
    // Which encoding an endpoint serves is its own choice, so both are accepted and told
    // apart by the first non-whitespace byte.
    expect(
      listServices(parseDescriptorSet(jsonDescriptorSet())).map((service) => service.typeName)
    ).toEqual(SERVICE_NAMES)
  })
})

describe('isMethodSupported', () => {
  it('rejects client-streaming methods, which the dxLink wire cannot carry', () => {
    const service = parseDescriptorSet(binaryDescriptorSet()).getService('demo.v1.OrderService')

    expect(service?.methods.filter(isMethodSupported).map((method) => method.name)).toEqual([
      'Issue',
      'Trade',
    ])
  })
})

describe('a descriptor set that omits json_name', () => {
  // dxLink's own /proto/docs serves one: only the bundled google/protobuf files carry
  // json_name, and protobuf-es assigns it straight through instead of deducing it.
  const stripped = () => {
    const copy = clone(FileDescriptorSetSchema, descriptorSet)
    copy.file.forEach((file) => {
      file.messageType.forEach((message) => {
        message.field.forEach((field) => {
          field.jsonName = ''
        })
      })
    })

    return toBinary(FileDescriptorSetSchema, copy)
  }

  const strippedOrderMessage = () => {
    const message = parseDescriptorSet(stripped()).getMessage('demo.v1.Order')
    if (message === undefined) {
      throw new Error('missing test descriptor')
    }

    return message
  }

  const FIELD_NAMES = ['symbol', 'quantity', 'live', 'price', 'side']

  it('deduces the JSON name from the field name', () => {
    expect(strippedOrderMessage().fields.map((field) => field.jsonName)).toEqual(FIELD_NAMES)
  })

  it('encodes a request under the deduced names, not one empty key', () => {
    // Left alone, every field of the message lands on `""` and all but the last is lost —
    // a request no server can read.
    const message = strippedOrderMessage()
    const parsed = parseRequest(message, '{"symbol":"AAPL","quantity":"10"}')
    if ('error' in parsed) {
      throw new Error(parsed.error)
    }

    expect(formatMessage(message, parsed.message)).toEqual({
      symbol: 'AAPL',
      quantity: '10',
    })
  })

  it('keys the request template by the deduced names', () => {
    expect(Object.keys(createRequestTemplate(strippedOrderMessage()))).toEqual(FIELD_NAMES)
  })
})

describe('createRequestTemplate', () => {
  it('opens the editor on the shape of the message, in protobuf-JSON terms', () => {
    // 64-bit integers are strings in protobuf-JSON and enums are their value names — a
    // template that used the ECMAScript shapes instead would not survive a round trip.
    expect(createRequestTemplate(orderMessage())).toEqual({
      symbol: '',
      quantity: '0',
      live: false,
      price: 0,
      side: 'BUY',
    })
  })
})

describe('parseRequest', () => {
  it('accepts a request that matches the descriptor', () => {
    const result = parseRequest(orderMessage(), '{"symbol":"AAPL","quantity":"10","side":"SELL"}')

    expect(result).toEqual({
      message: expect.objectContaining({
        symbol: 'AAPL',
        quantity: 10n,
        side: 1,
      }),
    })
  })

  it('reports malformed JSON before anything reaches the wire', () => {
    const result = parseRequest(orderMessage(), '{"symbol":')

    expect(result).toHaveProperty('error', expect.stringContaining('Invalid JSON'))
  })

  it('reports a field the message does not declare', () => {
    // A silently dropped typo is the failure mode this form exists to prevent.
    const result = parseRequest(orderMessage(), '{"smybol":"AAPL"}')

    expect(result).toHaveProperty('error', expect.stringContaining('smybol'))
  })

  it('reports a value of the wrong type', () => {
    const result = parseRequest(orderMessage(), '{"live":"yes"}')

    expect(result).toHaveProperty('error', expect.stringContaining('live'))
  })
})

describe('summarizeRegistry', () => {
  const services = summarizeRegistry(parseDescriptorSet(binaryDescriptorSet()))
  const orderService = services.find((service) => service.typeName === 'demo.v1.OrderService')

  it('lists every method with its dxLink interaction model', () => {
    expect(
      orderService?.methods.map((method) => [
        method.name,
        method.localName,
        method.modelLabel,
        method.isSupported,
        method.isBidirectional,
      ])
    ).toEqual([
      ['Issue', 'issue', 'REQUEST_RESPONSE', true, false],
      ['Collect', 'collect', 'STREAM_RESPONSE', false, false],
      ['Trade', 'trade', 'STREAM_STREAM', true, true],
    ])
  })

  it('describes the request fields a generated control can edit', () => {
    expect(orderService?.methods[0]?.fields.map((field) => [field._tag, field.name])).toEqual([
      ['Text', 'symbol'],
      ['Text', 'quantity'],
      ['Bool', 'live'],
      ['Number', 'price'],
      ['Enum', 'side'],
    ])
  })

  it('carries the request template as canonical protobuf-JSON text', () => {
    expect(JSON.parse(orderService?.methods[0]?.requestTemplate ?? '')).toEqual({
      symbol: '',
      quantity: '0',
      live: false,
      price: 0,
      side: 'BUY',
    })
  })
})

describe('fetchDescriptorSet', () => {
  /** Run the fetch against a stand-in for the browser's `fetch`. */
  const runWith = <A, E>(fetchStub: typeof fetch, effect: Effect.Effect<A, E>) =>
    Effect.runPromise(Effect.provideService(effect, FetchHttpClient.Fetch, fetchStub))

  it('asks for the binary representation, and for nothing that matches JSON', async () => {
    // dxLink's schema endpoint negotiates on Accept and treats a wildcard as a vote for
    // JSON, so a request that carries one gets the larger representation back.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(binaryDescriptorSet(), { status: 200 }))

    await runWith(fetchMock, fetchDescriptorSet('/proto/docs'))

    const accept = String(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('accept'))
    expect(accept).toContain('application/protobuf')
    expect(accept).not.toContain('*')
    expect(accept).not.toContain('json')
  })

  it('reads whichever representation the endpoint actually serves', async () => {
    // The Accept header is a request, not a guarantee: an endpoint that only speaks
    // protobuf-JSON still has to work.
    const registry = await runWith(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(jsonDescriptorSet(), { status: 200 })),
      fetchDescriptorSet('/proto/docs')
    )

    expect(listServices(registry).map((service) => service.typeName)).toEqual(SERVICE_NAMES)
  })

  it('reports the status when the endpoint refuses', async () => {
    const error = await runWith(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' })),
      Effect.flip(fetchDescriptorSet('/proto/docs'))
    )

    expect(error.message).toContain('404')
  })

  it('explains an opaque network failure, keeping the original as the cause', async () => {
    const cause = new TypeError('Failed to fetch')
    const error = await runWith(
      vi.fn<typeof fetch>().mockRejectedValue(cause),
      Effect.flip(fetchDescriptorSet('http://elsewhere/proto/docs'))
    )

    expect(error.message).toMatch(/cross-origin/)
    expect(Cause.pretty(Cause.fail(error.cause))).toContain('Failed to fetch')
  })

  it('reports bytes that are not a descriptor set', async () => {
    const error = await runWith(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{"file":', { status: 200 })),
      Effect.flip(fetchDescriptorSet('/proto/docs'))
    )

    expect(error._tag).toBe('DescriptorSetError')
  })
})
