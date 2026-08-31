import { clone, create, toBinary, toJsonString } from '@bufbuild/protobuf'
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorSetSchema,
} from '@bufbuild/protobuf/wkt'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createRequestTemplate,
  fetchDescriptorSet,
  formatMessage,
  isMethodSupported,
  listServices,
  parseDescriptorSet,
  parseRequest,
} from './descriptors'

const field = (
  name: string,
  number: number,
  type: FieldDescriptorProto_Type,
  typeName?: string
) => ({
  name,
  jsonName: name,
  number,
  label: FieldDescriptorProto_Label.OPTIONAL,
  type,
  ...(typeName === undefined ? {} : { typeName }),
})

const descriptorSet = create(FileDescriptorSetSchema, {
  file: [
    {
      name: 'demo/v1/demo.proto',
      package: 'demo.v1',
      syntax: 'proto3',
      enumType: [
        {
          name: 'Side',
          value: [
            { name: 'BUY', number: 0 },
            { name: 'SELL', number: 1 },
          ],
        },
      ],
      messageType: [
        {
          name: 'Order',
          field: [
            field('symbol', 1, FieldDescriptorProto_Type.STRING),
            field('quantity', 2, FieldDescriptorProto_Type.INT64),
            field('live', 3, FieldDescriptorProto_Type.BOOL),
            field('price', 4, FieldDescriptorProto_Type.DOUBLE),
            field('side', 5, FieldDescriptorProto_Type.ENUM, '.demo.v1.Side'),
          ],
        },
        { name: 'Ack', field: [field('id', 1, FieldDescriptorProto_Type.STRING)] },
      ],
      service: [
        {
          name: 'OrderService',
          method: [
            { name: 'Issue', inputType: '.demo.v1.Order', outputType: '.demo.v1.Ack' },
            {
              name: 'Collect',
              inputType: '.demo.v1.Order',
              outputType: '.demo.v1.Ack',
              clientStreaming: true,
            },
          ],
        },
        {
          name: 'AccountService',
          method: [{ name: 'Get', inputType: '.demo.v1.Order', outputType: '.demo.v1.Ack' }],
        },
      ],
    },
  ],
})

const binary = () => toBinary(FileDescriptorSetSchema, descriptorSet)
const json = () => new TextEncoder().encode(toJsonString(FileDescriptorSetSchema, descriptorSet))

const orderMessage = () => {
  const service = parseDescriptorSet(binary()).getService('demo.v1.OrderService')
  const method = service?.method['issue']
  if (method === undefined) throw new Error('missing test descriptor')

  return method.input
}

describe('parseDescriptorSet', () => {
  it('reads a binary descriptor set', () => {
    expect(listServices(parseDescriptorSet(binary())).map((s) => s.typeName)).toEqual([
      'demo.v1.AccountService',
      'demo.v1.OrderService',
    ])
  })

  it('reads a protobuf-JSON descriptor set', () => {
    // Which encoding an endpoint serves is its own choice, so both are accepted and told
    // apart by the first non-whitespace byte.
    expect(listServices(parseDescriptorSet(json())).map((s) => s.typeName)).toEqual([
      'demo.v1.AccountService',
      'demo.v1.OrderService',
    ])
  })
})

describe('isMethodSupported', () => {
  it('rejects client-streaming methods, which the dxLink wire cannot carry', () => {
    const service = parseDescriptorSet(binary()).getService('demo.v1.OrderService')

    expect(service?.methods.filter(isMethodSupported).map((m) => m.name)).toEqual(['Issue'])
  })
})

describe('a descriptor set that omits json_name', () => {
  // dxLink's own /proto/docs serves one: only the bundled google/protobuf files carry
  // json_name, and protobuf-es assigns it straight through instead of deducing it.
  const stripped = () => {
    const copy = clone(FileDescriptorSetSchema, descriptorSet)
    for (const file of copy.file) {
      for (const message of file.messageType) {
        for (const f of message.field) f.jsonName = ''
      }
    }

    return toBinary(FileDescriptorSetSchema, copy)
  }

  const strippedOrderMessage = () => {
    const message = parseDescriptorSet(stripped()).getMessage('demo.v1.Order')
    if (message === undefined) throw new Error('missing test descriptor')

    return message
  }

  it('deduces the JSON name from the field name', () => {
    expect(strippedOrderMessage().fields.map((f) => f.jsonName)).toEqual([
      'symbol',
      'quantity',
      'live',
      'price',
      'side',
    ])
  })

  it('encodes a request under the deduced names, not one empty key', () => {
    // Left alone, every field of the message lands on `""` and all but the last is lost —
    // a request no server can read.
    const message = strippedOrderMessage()
    const parsed = parseRequest(message, '{"symbol":"AAPL","quantity":"10"}')
    if ('error' in parsed) throw new Error(parsed.error)

    expect(formatMessage(message, parsed.message)).toEqual({ symbol: 'AAPL', quantity: '10' })
  })

  it('keys the request template by the deduced names', () => {
    expect(Object.keys(createRequestTemplate(strippedOrderMessage()))).toEqual([
      'symbol',
      'quantity',
      'live',
      'price',
      'side',
    ])
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
      message: expect.objectContaining({ symbol: 'AAPL', quantity: 10n, side: 1 }),
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

describe('fetchDescriptorSet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the binary representation, and for nothing that matches JSON', async () => {
    // dxLink's schema endpoint negotiates on Accept and treats a wildcard as a vote for
    // JSON, so a request that carries one gets the larger representation back.
    const fetchMock = vi.fn().mockResolvedValue(new Response(binary(), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchDescriptorSet('/proto/docs')

    const accept = String(fetchMock.mock.calls[0]?.[1]?.headers?.Accept)
    expect(accept).toContain('application/protobuf')
    expect(accept).not.toContain('*')
    expect(accept).not.toContain('json')
  })

  it('reads whichever representation the endpoint actually serves', async () => {
    // The Accept header is a request, not a guarantee: an endpoint that only speaks
    // protobuf-JSON still has to work.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(json(), { status: 200 })))

    const registry = await fetchDescriptorSet('/proto/docs')

    expect(listServices(registry).map((s) => s.typeName)).toEqual([
      'demo.v1.AccountService',
      'demo.v1.OrderService',
    ])
  })

  it('reports the status when the endpoint refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' }))
    )

    await expect(fetchDescriptorSet('/proto/docs')).rejects.toThrow('404')
  })

  it('explains an opaque network failure, keeping the original as the cause', async () => {
    const cause = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause))

    await expect(fetchDescriptorSet('http://elsewhere/proto/docs')).rejects.toThrow(/cross-origin/)
    await expect(fetchDescriptorSet('http://elsewhere/proto/docs')).rejects.toMatchObject({ cause })
  })
})
