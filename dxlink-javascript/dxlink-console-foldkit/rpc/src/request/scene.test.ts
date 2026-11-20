import { Option } from 'effect'
import {
  Command,
  change,
  click,
  expect,
  given,
  label,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Descriptors, Summary } from '../domain'
import { binaryDescriptorSet } from '../domain/descriptors.fixture'
import {
  LoadDescriptorUrl,
  Message,
  type RequestOptions,
  ValidateRequest,
  makeInit,
  makeUpdate,
  makeView,
} from './index'
import { REGISTRY_NOT_RETAINED } from '../service'

const services = Summary.summarizeRegistry(Descriptors.parseDescriptorSet(binaryDescriptorSet()))

const makeRequest = (options: RequestOptions) => ({
  init: makeInit(options),
  update: makeUpdate(options),
  view: makeView(options),
})

const { init, update, view } = makeRequest({
  descriptorSetUrl: '/proto/docs',
  isUrlLocked: false,
})
const initialModel = init().model

const REGISTRY_ID = 1
const ACCOUNT_TEMPLATE = JSON.stringify({ id: '' }, null, 2)
const ORDER_TEMPLATE = JSON.stringify(
  { symbol: '', quantity: '0', live: false, price: 0, side: 'BUY' },
  null,
  2
)

const account = {
  registryId: REGISTRY_ID,
  serviceName: 'demo.v1.AccountService',
  methodName: 'get',
}
const order = {
  registryId: REGISTRY_ID,
  serviceName: 'demo.v1.OrderService',
  methodName: 'issue',
}

const valid = (checked: typeof account, json: string) =>
  Message.SucceededValidateRequest({ ...checked, json, maybeError: Option.none() })

/** The form after its definitions loaded and the preselected request passed its check. */
const loadedModel = (() => {
  const afterLoad = update(
    initialModel,
    Message.SucceededLoadDescriptors({ registryId: REGISTRY_ID, source: '/proto/docs', services })
  ).model

  return update(afterLoad, valid(account, ACCOUNT_TEMPLATE)).model
})()

/** The loaded form with the order service selected and its request checked. */
const orderModel = (() => {
  const selected = update(
    loadedModel,
    Message.SelectedService({ typeName: 'demo.v1.OrderService' })
  ).model

  return update(selected, valid(order, ORDER_TEMPLATE)).model
})()

describe('service definitions', () => {
  test('with nothing loaded the form offers only to load definitions', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(label('Descriptor set URL')).toHaveValue('/proto/docs'),
      expect(role('button', { name: 'Load' })).toBeEnabled(),
      expect(role('button', { name: 'Load from file' })).toBeEnabled(),
      expect(label('Service')).toBeAbsent(),
      expect(label('Method')).toBeAbsent(),
      expect(label('Request JSON')).toBeAbsent()
    )
  })

  test('a blank URL cannot be loaded', () => {
    scene(
      { update, view },
      given(initialModel),
      type(label('Descriptor set URL'), '  '),
      expect(role('button', { name: 'Load' })).toBeDisabled()
    )
  })

  test('a pinned URL is shown but cannot be edited', () => {
    const pinned = makeRequest({ descriptorSetUrl: '/proto/docs', isUrlLocked: true })

    scene(
      { update: pinned.update, view: pinned.view },
      given(pinned.init().model),
      expect(label('Descriptor set URL')).toBeDisabled(),
      expect(text('Fixed by this deployment.')).toExist(),
      expect(role('button', { name: 'Load' })).toBeEnabled()
    )
  })

  test('loading shows the pickers on the first service and the fields of its request', () => {
    scene(
      { update, view },
      given(initialModel),
      click(role('button', { name: 'Load' })),
      Command.expectExact(LoadDescriptorUrl({ url: '/proto/docs' })),
      expect(role('button', { name: 'Load' })).toBeDisabled(),
      expect(role('button', { name: 'Load from file' })).toBeDisabled(),
      Command.resolve(
        LoadDescriptorUrl,
        Message.SucceededLoadDescriptors({
          registryId: REGISTRY_ID,
          source: '/proto/docs',
          services,
        })
      ),
      Command.expectExact(ValidateRequest({ ...account, json: ACCOUNT_TEMPLATE })),
      Command.resolve(ValidateRequest, valid(account, ACCOUNT_TEMPLATE)),
      expect(text('2 services from /proto/docs')).toExist(),
      expect(label('Service')).toHaveValue('demo.v1.AccountService'),
      expect(label('Method')).toHaveValue('get'),
      expect(text('One request, one response.')).toExist(),
      expect(label('id')).toHaveValue(''),
      expect(label('Request JSON')).toHaveValue(ACCOUNT_TEMPLATE),
      expect(role('alert')).toBeAbsent()
    )
  })

  test('a failed load says so and keeps the definitions loaded before', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Load' })),
      Command.resolve(
        LoadDescriptorUrl,
        Message.FailedLoadDescriptors({ source: '/proto/docs', reason: 'HTTP 404' })
      ),
      expect(role('alert')).toHaveText('Could not load definitions from /proto/docs: HTTP 404'),
      expect(label('Service')).toHaveValue('demo.v1.AccountService')
    )
  })
})

describe('picking a call', () => {
  test('selecting a service shows its methods and a control per editable field', () => {
    scene(
      { update, view },
      given(loadedModel),
      change(label('Service'), 'demo.v1.OrderService'),
      Command.expectExact(ValidateRequest({ ...order, json: ORDER_TEMPLATE })),
      Command.resolve(ValidateRequest, valid(order, ORDER_TEMPLATE)),
      expect(label('Method')).toHaveValue('issue'),
      expect(role('option', { name: 'Issue — REQUEST_RESPONSE' })).toBeEnabled(),
      expect(label('symbol')).toHaveValue(''),
      expect(label('quantity')).toHaveValue('0'),
      expect(text('64-bit — sent as a string')).toExist(),
      expect(role('checkbox', { name: 'live' })).not.toBeChecked(),
      expect(label('price')).toHaveValue('0'),
      expect(label('side')).toHaveValue('BUY'),
      expect(role('option', { name: 'SELL' })).toExist()
    )
  })

  test('a client-streaming method is listed but disabled', () => {
    scene(
      { update, view },
      given(orderModel),
      expect(role('option', { name: 'Collect — STREAM_RESPONSE' })).toBeDisabled(),
      expect(role('option', { name: 'Trade — STREAM_STREAM' })).toBeEnabled()
    )
  })

  test('selecting a bidirectional method describes its interaction model', () => {
    scene(
      { update, view },
      given(orderModel),
      change(label('Method'), 'trade'),
      Command.resolve(ValidateRequest, valid({ ...order, methodName: 'trade' }, ORDER_TEMPLATE)),
      expect(label('Method')).toHaveValue('trade'),
      expect(text('A stream of requests, a stream of responses.')).toExist()
    )
  })
})

describe('writing the request', () => {
  test('a generated field writes into the request JSON', () => {
    const edited = JSON.stringify(
      { symbol: 'AAPL', quantity: '0', live: false, price: 0, side: 'BUY' },
      null,
      2
    )

    scene(
      { update, view },
      given(orderModel),
      type(label('symbol'), 'AAPL'),
      Command.expectExact(ValidateRequest({ ...order, json: edited })),
      Command.resolve(ValidateRequest, valid(order, edited)),
      expect(label('Request JSON')).toHaveValue(edited),
      expect(label('symbol')).toHaveValue('AAPL')
    )
  })

  test('an invalid request is shown with its error', () => {
    const edited = '{"idd": ""}'

    scene(
      { update, view },
      given(loadedModel),
      type(label('Request JSON'), edited),
      Command.expectExact(ValidateRequest({ ...account, json: edited })),
      expect(role('alert')).toBeAbsent(),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          ...account,
          json: edited,
          maybeError: Option.some(
            'cannot decode message demo.v1.Ack from JSON: key "idd" is unknown'
          ),
        })
      ),
      expect(role('alert')).toHaveText(
        'cannot decode message demo.v1.Ack from JSON: key "idd" is unknown'
      )
    )
  })

  test('text that is not a JSON object stands the generated fields down', () => {
    scene(
      { update, view },
      given(loadedModel),
      type(label('Request JSON'), '['),
      Command.resolve(
        ValidateRequest,
        Message.SucceededValidateRequest({
          ...account,
          json: '[',
          maybeError: Option.some('Invalid JSON: unexpected end of input'),
        })
      ),
      expect(label('id')).toBeAbsent(),
      expect(text('Fields are editable again once the request below is a JSON object.')).toExist(),
      expect(role('alert')).toHaveText('Invalid JSON: unexpected end of input')
    )
  })

  test('a request whose definitions are no longer loaded says to load them again', () => {
    const edited = '{"id": "1"}'

    scene(
      { update, view },
      given(loadedModel),
      type(label('Request JSON'), edited),
      Command.resolve(
        ValidateRequest,
        Message.FailedValidateRequest({ ...account, json: edited, reason: REGISTRY_NOT_RETAINED })
      ),
      expect(role('alert')).toHaveText(REGISTRY_NOT_RETAINED)
    )
  })
})
