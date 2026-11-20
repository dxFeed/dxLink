import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Listbox } from '@foldkit/ui'

import { Descriptors, Summary } from '../domain'
import { binaryDescriptorSet } from '../domain/descriptors.fixture'
import {
  LoadDescriptorFile,
  LoadDescriptorUrl,
  Message,
  type Model,
  type RequestOptions,
  ValidateRequest,
  Validation,
  makeInit,
  makeUpdate,
  selectedRequest,
  selectedService,
  toConfig,
} from './index'
import { REGISTRY_NOT_RETAINED } from '../service'

const services = Summary.summarizeRegistry(Descriptors.parseDescriptorSet(binaryDescriptorSet()))

const makeRequest = (options: RequestOptions) => ({
  init: makeInit(options),
  update: makeUpdate(options),
})

const { init, update } = makeRequest({
  descriptorSetUrl: '/proto/docs',
  isUrlLocked: false,
})
const initialModel = init().model

const REGISTRY_ID = 1

const loaded = Message.SucceededLoadDescriptors({
  registryId: REGISTRY_ID,
  source: '/proto/docs',
  services,
})

/** What the service picker reports when the option of this service is picked. */
const pickedService = (typeName: string) =>
  Message.GotServiceListboxMessage({ message: Listbox.Message.SelectedItem({ item: typeName }) })

/** What the method picker reports when the option of this method is picked. */
const pickedMethod = (localName: string) =>
  Message.GotMethodListboxMessage({ message: Listbox.Message.SelectedItem({ item: localName }) })

/** What the picker of an enum field reports when the option of this value is picked. */
const pickedEnumValue = (fieldId: string, valueName: string) =>
  Message.GotEnumListboxMessage({
    fieldId,
    message: Listbox.Message.SelectedItem({ item: valueName }),
  })

/** The request as the Model holds it, named the way a validation names what it checked. */
const checkedOf = (current: Model) => {
  const definitions = Option.getOrThrow(current.maybeDefinitions)
  const request = Option.getOrThrow(selectedRequest(current))

  return {
    registryId: definitions.registryId,
    serviceName: Option.getOrThrow(selectedService(current)).typeName,
    methodName: request.methodName,
    json: request.json,
  }
}

/** The verdict a validation would return for the request as the Model holds it. */
const verdictFor = (current: Model, maybeError: Option.Option<string>) =>
  Message.SucceededValidateRequest({ ...checkedOf(current), maybeError })

const validationOf = (current: Model) =>
  Option.map(selectedRequest(current), (request) => request.validation)

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
          registryId: REGISTRY_ID,
          serviceName: 'demo.v1.AccountService',
          methodName: 'get',
          json: '{\n  "id": ""\n}',
        })
      ),
      model((next) => {
        expect(checkedOf(next)).toEqual({
          registryId: REGISTRY_ID,
          serviceName: 'demo.v1.AccountService',
          methodName: 'get',
          json: '{\n  "id": ""\n}',
        })
        expect(validationOf(next)).toEqual(Option.some(Validation.Pending()))
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
      message(pickedService('demo.v1.OrderService')),
      Command.expectExact(
        ValidateRequest({
          registryId: REGISTRY_ID,
          serviceName: 'demo.v1.OrderService',
          methodName: 'issue',
          json: ORDER_TEMPLATE,
        })
      ),
      model((next) => {
        expect(checkedOf(next)).toMatchObject({ methodName: 'issue', json: ORDER_TEMPLATE })
        expect(validationOf(next)).toEqual(Option.some(Validation.Pending()))
      }),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          registryId: REGISTRY_ID,
          serviceName: 'demo.v1.OrderService',
          methodName: 'issue',
          json: ORDER_TEMPLATE,
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(Option.getOrThrow(toConfig(next))).toMatchObject({
          registryId: REGISTRY_ID,
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
    const orderModel = update(loadedModel, pickedService('demo.v1.OrderService')).model

    story(
      update,
      given(orderModel),
      message(pickedMethod('collect')),
      Command.expectNone(),
      model((next) => {
        expect(checkedOf(next).methodName).toBe('issue')
      })
    )
  })

  test('a bidirectional method is selectable and says so in the config', () => {
    const orderModel = update(loadedModel, pickedService('demo.v1.OrderService')).model

    story(
      update,
      given(orderModel),
      message(pickedMethod('trade')),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          registryId: REGISTRY_ID,
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

describe('enum fields', () => {
  const orderModel = update(loadedModel, pickedService('demo.v1.OrderService')).model

  const enumFieldIdsOf = (current: Model) =>
    Option.getOrThrow(selectedRequest(current)).enumListboxes.map((entry) => entry.fieldId)

  test('each enum field of the selected method has a picker of its own, and no other field does', () => {
    expect(enumFieldIdsOf(loadedModel)).toEqual([])
    expect(enumFieldIdsOf(orderModel)).toEqual(['5'])
    expect(Option.getOrThrow(selectedRequest(orderModel)).enumListboxes[0]?.listbox.id).toBe(
      'dxlink-rpc-request-field-5'
    )
  })

  test('the pickers go with the method they were made for', () => {
    story(
      update,
      given(orderModel),
      message(pickedService('demo.v1.AccountService')),
      Command.resolve(ValidateRequest, verdictFor(loadedModel, Option.none())),
      model((next) => {
        expect(enumFieldIdsOf(next)).toEqual([])
      }),
      message(pickedEnumValue('5', 'SELL')),
      Command.expectNone(),
      model((next) => {
        expect(checkedOf(next).json).toBe('{\n  "id": ""\n}')
      })
    )
  })

  test('picking a value writes its name into the request and asks for a verdict', () => {
    const edited = JSON.stringify(
      { symbol: '', quantity: '0', live: false, price: 0, side: 'SELL' },
      null,
      2
    )

    story(
      update,
      given(orderModel),
      message(pickedEnumValue('5', 'SELL')),
      Command.expectExact(ValidateRequest({ ...checkedOf(orderModel), json: edited })),
      model((next) => {
        expect(checkedOf(next).json).toBe(edited)
        expect(validationOf(next)).toEqual(Option.some(Validation.Pending()))
        expect(enumFieldIdsOf(next)).toEqual(['5'])
      }),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          ...checkedOf(orderModel),
          json: edited,
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(Option.getOrThrow(toConfig(next)).requestJson).toBe(edited)
      })
    )
  })

  test('a pick leaves the text alone while it is not a JSON object', () => {
    story(
      update,
      given(orderModel),
      message(Message.UpdatedRequestJson({ value: '[' })),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          ...checkedOf(orderModel),
          json: '[',
          maybeError: Option.some('Invalid JSON'),
        })
      ),
      message(pickedEnumValue('5', 'SELL')),
      Command.expectNone(),
      model((next) => {
        expect(checkedOf(next).json).toBe('[')
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
      Command.expectExact(ValidateRequest({ ...checkedOf(loadedModel), json: edited })),
      model((next) => {
        expect(toConfig(next)).toEqual(Option.none())
      }),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          ...checkedOf(loadedModel),
          json: edited,
          maybeError: Option.some('unknown field "idd"'),
        })
      ),
      model((next) => {
        expect(validationOf(next)).toEqual(
          Option.some(Validation.Invalid({ error: 'unknown field "idd"' }))
        )
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })

  test('a verdict on text that has since changed is ignored', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedRequestJson({ value: '{"id": "1"' })),
      Command.resolve(ValidateRequest, verdictFor(loadedModel, Option.none())),
      model((next) => {
        expect(validationOf(next)).toEqual(Option.some(Validation.Pending()))
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })

  test('a request whose definitions are gone cannot be opened and says why', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedRequestJson({ value: '{"id": "1"}' })),
      Command.resolve(
        ValidateRequest,
        Message.FailedValidateRequest({
          ...checkedOf(loadedModel),
          json: '{"id": "1"}',
          reason: REGISTRY_NOT_RETAINED,
        })
      ),
      model((next) => {
        expect(validationOf(next)).toEqual(
          Option.some(Validation.Invalid({ error: REGISTRY_NOT_RETAINED }))
        )
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })

  test('a verdict against definitions that were since replaced is ignored', () => {
    story(
      update,
      given(loadedModel),
      message(Message.SucceededLoadDescriptors({ registryId: 2, source: 'set.binpb', services })),
      Command.resolve(ValidateRequest, verdictFor(loadedModel, Option.none())),
      model((next) => {
        expect(checkedOf(next).registryId).toBe(2)
        expect(validationOf(next)).toEqual(Option.some(Validation.Pending()))
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })
})

describe('definitions and selection', () => {
  test('a descriptor set with no services has nothing selected', () => {
    story(
      update,
      given(loadedModel),
      message(Message.SucceededLoadDescriptors({ registryId: 2, source: 'empty', services: [] })),
      Command.expectNone(),
      model((next) => {
        expect(Option.getOrThrow(next.maybeDefinitions).maybeSelection).toEqual(Option.none())
        expect(toConfig(next)).toEqual(Option.none())
      })
    )
  })

  test('a service with no supported method is selected without a request', () => {
    const collectOnly = services.map((service) => ({
      ...service,
      methods: service.methods.filter((method) => !method.isSupported),
    }))

    story(
      update,
      given(initialModel),
      message(
        Message.SucceededLoadDescriptors({ registryId: 3, source: 'x', services: collectOnly })
      ),
      Command.expectNone(),
      message(pickedService('demo.v1.OrderService')),
      Command.expectNone(),
      model((next) => {
        expect(Option.getOrThrow(next.maybeDefinitions).maybeSelection).toEqual(
          Option.some({ serviceName: 'demo.v1.OrderService', maybeRequest: Option.none() })
        )
        expect(toConfig(next)).toEqual(Option.none())
      }),
      message(Message.UpdatedRequestJson({ value: '{}' })),
      Command.expectNone()
    )
  })

  test('an edit with nothing loaded changes nothing', () => {
    story(
      update,
      given(initialModel),
      message(Message.UpdatedRequestJson({ value: '{}' })),
      message(pickedService('demo.v1.OrderService')),
      message(pickedMethod('issue')),
      message(pickedEnumValue('5', 'SELL')),
      Command.expectNone(),
      model((next) => {
        expect(next).toEqual(initialModel)
      })
    )
  })
})
