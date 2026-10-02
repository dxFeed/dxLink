import { create, fromJson, toBinary } from '@bufbuild/protobuf'
import type { DescMethod, DescService, Message } from '@bufbuild/protobuf'
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorSetSchema,
} from '@bufbuild/protobuf/wkt'
import type { DXLinkClient } from '@dxfeed/dxlink-api'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { Subject } from 'rxjs'
import type { Observable } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseDescriptorSet } from './descriptors'
import { makeRpcModel } from './rpc-model'
import type { RpcModel } from './rpc-model'

/** What the binding was asked for, and the response stream the test drives. */
const calls = vi.hoisted(
  () => [] as Array<{ method: string; argument: unknown; responses: Subject<unknown> }>
)

vi.mock('@dxfeed/dxlink-protobuf-es', () => ({
  createDXLinkDynamicService: (_client: unknown, service: { methods: { localName: string }[] }) =>
    Object.fromEntries(
      service.methods.map((method) => [
        method.localName,
        (argument: unknown) => {
          const responses = new Subject<unknown>()
          calls.push({ method: method.localName, argument, responses })
          return responses
        },
      ])
    ),
}))

const text = (name: string, number: number) => ({
  name,
  jsonName: name,
  number,
  label: FieldDescriptorProto_Label.OPTIONAL,
  type: FieldDescriptorProto_Type.STRING,
})

const registry = parseDescriptorSet(
  toBinary(
    FileDescriptorSetSchema,
    create(FileDescriptorSetSchema, {
      file: [
        {
          name: 'echo.proto',
          package: 'echo.v1',
          syntax: 'proto3',
          messageType: [{ name: 'Text', field: [text('value', 1)] }],
          service: [
            {
              name: 'EchoService',
              method: [
                { name: 'Say', inputType: '.echo.v1.Text', outputType: '.echo.v1.Text' },
                {
                  name: 'Chat',
                  inputType: '.echo.v1.Text',
                  outputType: '.echo.v1.Text',
                  clientStreaming: true,
                  serverStreaming: true,
                },
              ],
            },
          ],
        },
      ],
    })
  )
)

const service = registry.getService('echo.v1.EchoService') as DescService
const say = service.method['say'] as DescMethod
const chat = service.method['chat'] as DescMethod
const textOf = (value: string): Message => fromJson(say.input, { value })

let atoms: AtomRegistry.AtomRegistry
let release: () => void

const open = (method: DescMethod, request = textOf('hello')): RpcModel => {
  const model = makeRpcModel({} as DXLinkClient, { service, method, request })
  release = atoms.mount(model.session.atom)
  return model
}

const lastCall = () => {
  const call = calls[calls.length - 1]
  if (call === undefined) throw new Error('no call made')
  return call
}

const json = (model: RpcModel, key: 'requests' | 'responses') =>
  atoms.get(model[key]).map((entry) => entry.json)

beforeEach(() => {
  calls.length = 0
  atoms = AtomRegistry.make()
  release = () => undefined
})

afterEach(() => {
  release()
  atoms.dispose()
})

describe('RPC model session', () => {
  it('makes a unary call once, logging the request it sent', async () => {
    const model = open(say)

    expect(calls).toHaveLength(1)
    expect(json(model, 'requests')).toEqual([{ value: 'hello' }])

    lastCall().responses.next(textOf('hi'))
    lastCall().responses.complete()

    await vi.waitFor(() => expect(atoms.get(model.callState)).toBe('completed'))
    expect(json(model, 'responses')).toEqual([{ value: 'hi' }])
  })

  it('keeps the responses that arrived before a failure, newest first', async () => {
    const model = open(say)

    lastCall().responses.next(textOf('one'))
    lastCall().responses.next(textOf('two'))
    lastCall().responses.error({ type: 'BAD_ACTION', message: 'Unsupported service' })

    await vi.waitFor(() => expect(atoms.get(model.callState)).toBe('failed'))
    expect(json(model, 'responses')).toEqual([{ value: 'two' }, { value: 'one' }])
    expect(atoms.get(model.channel.errors)).toMatchObject([
      { type: 'BAD_ACTION', message: 'Unsupported service' },
    ])
  })

  it('sends further requests on a bidirectional call, and stops at close', () => {
    const model = open(chat)
    const input = lastCall().argument as Observable<unknown>
    const sent: unknown[] = []
    input.subscribe((message) => sent.push(message))

    atoms.set(model.send, textOf('again'))
    expect(sent).toHaveLength(2)
    expect(json(model, 'requests')).toEqual([{ value: 'again' }, { value: 'hello' }])

    atoms.set(model.channel.close, undefined)
    expect(lastCall().responses.observed).toBe(false)

    atoms.set(model.send, textOf('too late'))
    expect(sent).toHaveLength(2)
  })

  it('ignores send on a call that is not bidirectional', () => {
    const model = open(say)

    atoms.set(model.send, textOf('more'))

    expect(json(model, 'requests')).toEqual([{ value: 'hello' }])
  })

  it('cancels the call when the user closes the channel', () => {
    const model = open(say)

    atoms.set(model.channel.close, undefined)

    expect(lastCall().responses.observed).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
