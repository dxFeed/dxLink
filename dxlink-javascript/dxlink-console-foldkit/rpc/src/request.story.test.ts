import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { binaryDescriptorSet } from './descriptors.fixture'
import { parseDescriptorSet } from './descriptors'
import {
  LoadDescriptorFile,
  LoadDescriptorUrl,
  Message,
  type Model,
  ValidateRequest,
  Validation,
  makeRequest,
  toConfig,
} from './request'
import { summarizeRegistry } from './summary'

const services = summarizeRegistry(parseDescriptorSet(binaryDescriptorSet()))

const { init, update } = makeRequest({
  descriptorSetUrl: '/proto/docs',
  isUrlLocked: false,
})
const initialModel = init().model

const loaded = Message.SucceededLoadDescriptors({
  source: '/proto/docs',
  services,
})

/** The verdict a validation would return for the request as the Model holds it. */
const verdictFor = (current: Model, maybeError: Option.Option<string>) =>
  Message.CompletedValidateRequest({
    serviceName: current.serviceName,
    methodName: current.methodName,
    json: current.json,
    maybeError,
  })

/** The form after a descriptor set loaded and its preselected request passed validation. */
const loadedModel = (() => {
  const afterLoad = update(initialModel, loaded).model

  return update(afterLoad, verdictFor(afterLoad, Option.none())).model
})()

describe('loading definitions', () => {
  test('the form starts on the configured URL with nothing loaded', () => {
    expect(initialModel.url).toBe('/proto/docs')
    expect(initialModel.maybeDefinitions).toEqual(Option.none())
    expect(toConfig(initialModel)).toEqual(Option.none())
  })

  test('Load fetches the URL as typed', () => {
    story(
      update,
      given(initialModel),
      message(Message.ClickedLoadUrl()),
      Command.expectExact(LoadDescriptorUrl({ url: '/proto/docs' })),
      model((next) => {
        expect(next.load._tag).toBe('Loading')
      }),
      Command.resolve(LoadDescriptorUrl, loaded),
      Command.resolveAll([ValidateRequest, verdictFor(loadedModel, Option.none())]),
      model((next) => {
        expect(next).toEqual(loadedModel)
      })
    )
  })

  test('a blank URL is not fetched', () => {
    story(
      update,
      given({ ...initialModel, url: '   ' }),
      message(Message.ClickedLoadUrl()),
      Command.expectNone()
    )
  })

  test('a loaded set preselects its first service and first supported method', () => {
    story(
      update,
      given(initialModel),
      message(loaded),
      Command.expectExact(
        ValidateRequest({
          serviceName: 'demo.v1.AccountService',
          methodName: 'get',
          json: '{\n  "id": ""\n}',
        })
      ),
      model((next) => {
        expect(next.serviceName).toBe('demo.v1.AccountService')
        expect(next.methodName).toBe('get')
        expect(next.validation).toEqual(Validation.Pending())
        expect(toConfig(next)).toEqual(Option.none())
      }),
      Command.resolve(ValidateRequest, verdictFor(loadedModel, Option.none()))
    )
  })

  test('a failed load names its source and keeps what was loaded before', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedLoadUrl()),
      Command.resolve(
        LoadDescriptorUrl,
        Message.FailedLoadDescriptors({
          source: '/proto/docs',
          reason: '404 Not Found',
        })
      ),
      model((next) => {
        expect(next.load).toEqual({
          _tag: 'Failed',
          error: 'Could not load definitions from /proto/docs: 404 Not Found',
        })
        expect(next.maybeDefinitions).toEqual(loadedModel.maybeDefinitions)
      })
    )
  })

  test('cancelling the file picker leaves the form idle', () => {
    story(
      update,
      given(initialModel),
      message(Message.ClickedLoadFile()),
      Command.expectExact(LoadDescriptorFile),
      Command.resolve(LoadDescriptorFile, Message.CancelledLoadDescriptorFile()),
      model((next) => {
        expect(next).toEqual(initialModel)
      })
    )
  })

  test('a pinned URL cannot be edited, and still loads', () => {
    const pinned = makeRequest({
      descriptorSetUrl: 'https://gateway.example.com/proto/docs',
      isUrlLocked: true,
    })

    story(
      pinned.update,
      given(pinned.init().model),
      message(Message.UpdatedUrl({ value: 'https://elsewhere.test' })),
      model((next) => {
        expect(next.url).toBe('https://gateway.example.com/proto/docs')
      }),
      message(Message.ClickedLoadUrl()),
      Command.expectExact(LoadDescriptorUrl({ url: 'https://gateway.example.com/proto/docs' })),
      Command.resolve(
        LoadDescriptorUrl,
        Message.FailedLoadDescriptors({ source: 'x', reason: 'y' })
      )
    )
  })
})

describe('selecting a call', () => {
  const ORDER_TEMPLATE = JSON.stringify(
    { symbol: '', quantity: '0', live: false, price: 0, side: 'BUY' },
    null,
    2
  )

  test('selecting a service rebuilds the request from its first supported method', () => {
    story(
      update,
      given(loadedModel),
      message(Message.SelectedService({ typeName: 'demo.v1.OrderService' })),
      Command.expectExact(
        ValidateRequest({
          serviceName: 'demo.v1.OrderService',
          methodName: 'issue',
          json: ORDER_TEMPLATE,
        })
      ),
      model((next) => {
        expect(next.methodName).toBe('issue')
        expect(next.json).toBe(ORDER_TEMPLATE)
        expect(next.validation).toEqual(Validation.Pending())
      }),
      Command.resolve(
        ValidateRequest,
        Message.CompletedValidateRequest({
          serviceName: 'demo.v1.OrderService',
          methodName: 'issue',
          json: ORDER_TEMPLATE,
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(Option.getOrThrow(toConfig(next))).toMatchObject({
          serviceName: 'demo.v1.OrderService',
          methodLocalName: 'issue',
          methodName: 'Issue',
          modelLabel: 'REQUEST_RESPONSE',
          isBidirectional: false,
          requestJson: ORDER_TEMPLATE,
        })
      })
    )
  })

  test('a client-streaming method is listed but cannot be selected', () => {
    const orderModel = update(
      loadedModel,
      Message.SelectedService({ typeName: 'demo.v1.OrderService' })
    ).model

    story(
      update,
      given(orderModel),
      message(Message.SelectedMethod({ localName: 'collect' })),
      Command.expectNone(),
      model((next) => {
        expect(next.methodName).toBe('issue')
      })
    )
  })

  test('a bidirectional method is selectable and says so in the config', () => {
    const orderModel = update(
      loadedModel,
      Message.SelectedService({ typeName: 'demo.v1.OrderService' })
    ).model

    story(
      update,
      given(orderModel),
      message(Message.SelectedMethod({ localName: 'trade' })),
      Command.resolve(
        ValidateRequest,
        Message.CompletedValidateRequest({
          serviceName: 'demo.v1.OrderService',
          methodName: 'trade',
          json: ORDER_TEMPLATE,
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(Option.getOrThrow(toConfig(next))).toMatchObject({
          methodName: 'Trade',
          modelLabel: 'STREAM_STREAM',
          isBidirectional: true,
          requestTemplate: ORDER_TEMPLATE,
        })
      })
    )
  })
})

describe('validating the request', () => {
  test('a request that passed can be opened', () => {
    expect(Option.isSome(toConfig(loadedModel))).toBe(true)
  })

  test('an edit closes the gate until its own verdict arrives', () => {
    const edited = '{"idd": ""}'

    story(
      update,
      given(loadedModel),
      message(Message.UpdatedRequestJson({ value: edited })),
      Command.expectExact(
        ValidateRequest({
          serviceName: loadedModel.serviceName,
          methodName: loadedModel.methodName,
          json: edited,
        })
      ),
      model((next) => {
        expect(toConfig(next)).toEqual(Option.none())
      }),
      Command.resolve(
        ValidateRequest,
        Message.CompletedValidateRequest({
          serviceName: loadedModel.serviceName,
          methodName: loadedModel.methodName,
          json: edited,
          maybeError: Option.some('unknown field "idd"'),
        })
      ),
      model((next) => {
        expect(next.validation).toEqual(Validation.Invalid({ error: 'unknown field "idd"' }))
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })

  test('a verdict on text that has since changed is ignored', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedRequestJson({ value: '{"id": "1"' })),
      Command.resolve(
        ValidateRequest,
        Message.CompletedValidateRequest({
          serviceName: loadedModel.serviceName,
          methodName: loadedModel.methodName,
          json: loadedModel.json,
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(next.validation).toEqual(Validation.Pending())
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })
})
