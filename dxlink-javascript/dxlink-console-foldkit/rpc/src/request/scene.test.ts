import { Option } from 'effect'
import {
  Command,
  Mount,
  all,
  click,
  expect,
  expectAll,
  given,
  label,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Listbox } from '@foldkit/ui'

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
    Message.GotServiceListboxMessage({
      message: Listbox.Message.SelectedItem({ item: 'demo.v1.OrderService' }),
    })
  ).model

  return update(selected, valid(order, ORDER_TEMPLATE)).model
})()

const serviceTrigger = role('button', { name: 'Service' })
const methodTrigger = role('button', { name: 'Method' })
const sideTrigger = role('button', { name: 'side' })

/** What a Listbox asks for once its button is clicked and its list is on screen. */
const listOpened = [
  Command.resolve(Listbox.FocusItems, Listbox.Message.CompletedFocusItems()),
  Mount.resolveAll(
    [Listbox.AnchorListbox, Listbox.Message.CompletedAnchorListbox()],
    [Listbox.PortalListboxBackdrop, Listbox.Message.CompletedPortalListboxBackdrop()]
  ),
]

const focusReturned = Listbox.Message.CompletedFocusButton()

describe('service definitions', () => {
  test('with nothing loaded the form offers only to load definitions', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(label('Descriptor set URL')).toHaveValue('/proto/docs'),
      expect(role('button', { name: 'Load' })).toBeEnabled(),
      expect(role('button', { name: 'Load from file' })).toBeEnabled(),
      expect(serviceTrigger).toBeAbsent(),
      expect(methodTrigger).toBeAbsent(),
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
      expect(serviceTrigger).toHaveText('demo.v1.AccountService'),
      expect(methodTrigger).toHaveText('Get — REQUEST_RESPONSE'),
      expect(text('One request, one response.')).toExist(),
      expect(methodTrigger).toHaveAccessibleDescription('One request, one response.'),
      expect(role('listbox')).toBeAbsent(),
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
      expect(serviceTrigger).toHaveText('demo.v1.AccountService')
    )
  })
})

describe('picking a call', () => {
  test('the service list offers every loaded service and marks the selected one', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(serviceTrigger),
      ...listOpened,
      expectAll(all.role('option')).toHaveCount(2),
      expect(role('option', { name: 'demo.v1.AccountService' })).toHaveAttr('data-selected'),
      expect(role('option', { name: 'demo.v1.OrderService' })).not.toHaveAttr('data-selected')
    )
  })

  test('selecting a service shows its methods and a control per editable field', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(serviceTrigger),
      ...listOpened,
      click(role('option', { name: 'demo.v1.OrderService' })),
      Command.expectExact(
        Listbox.FocusButton({ id: 'dxlink-rpc-service' }),
        ValidateRequest({ ...order, json: ORDER_TEMPLATE })
      ),
      Command.resolveAll(
        [Listbox.FocusButton, focusReturned],
        [ValidateRequest, valid(order, ORDER_TEMPLATE)]
      ),
      Mount.expectEnded(Listbox.AnchorListbox, Listbox.PortalListboxBackdrop),
      expect(role('listbox')).toBeAbsent(),
      expect(serviceTrigger).toHaveText('demo.v1.OrderService'),
      expect(methodTrigger).toHaveText('Issue — REQUEST_RESPONSE'),
      expect(label('symbol')).toHaveValue(''),
      expect(label('quantity')).toHaveValue('0'),
      expect(text('64-bit — sent as a string')).toExist(),
      expect(role('checkbox', { name: 'live' })).not.toBeChecked(),
      expect(label('price')).toHaveValue('0'),
      expect(sideTrigger).toHaveText('BUY'),
      expect(sideTrigger).toHaveAccessibleDescription('demo.v1.Side'),
      click(sideTrigger),
      ...listOpened,
      expectAll(all.role('option')).toHaveCount(2),
      expect(role('option', { name: 'BUY' })).toHaveAttr('data-selected'),
      expect(role('option', { name: 'SELL' })).toExist()
    )
  })

  test('a client-streaming method is listed but disabled', () => {
    scene(
      { update, view },
      given(orderModel),
      click(methodTrigger),
      ...listOpened,
      expectAll(all.role('option')).toHaveCount(3),
      expect(role('option', { name: 'Collect — STREAM_RESPONSE' })).toHaveAttr(
        'aria-disabled',
        'true'
      ),
      expect(role('option', { name: 'Issue — REQUEST_RESPONSE' })).not.toHaveAttr(
        'aria-disabled',
        'true'
      ),
      expect(role('option', { name: 'Trade — STREAM_STREAM' })).not.toHaveAttr(
        'aria-disabled',
        'true'
      )
    )
  })

  test('selecting a bidirectional method describes its interaction model', () => {
    scene(
      { update, view },
      given(orderModel),
      click(methodTrigger),
      ...listOpened,
      click(role('option', { name: 'Trade — STREAM_STREAM' })),
      Command.resolveAll(
        [Listbox.FocusButton, focusReturned],
        [ValidateRequest, valid({ ...order, methodName: 'trade' }, ORDER_TEMPLATE)]
      ),
      Mount.expectEnded(Listbox.AnchorListbox, Listbox.PortalListboxBackdrop),
      expect(methodTrigger).toHaveText('Trade — STREAM_STREAM'),
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

  test('picking an enum value writes its name into the request JSON', () => {
    const edited = JSON.stringify(
      { symbol: '', quantity: '0', live: false, price: 0, side: 'SELL' },
      null,
      2
    )

    scene(
      { update, view },
      given(orderModel),
      click(sideTrigger),
      ...listOpened,
      click(role('option', { name: 'SELL' })),
      Command.expectExact(
        Listbox.FocusButton({ id: 'dxlink-rpc-request-field-5' }),
        ValidateRequest({ ...order, json: edited })
      ),
      Command.resolveAll(
        [Listbox.FocusButton, focusReturned],
        [ValidateRequest, valid(order, edited)]
      ),
      Mount.expectEnded(Listbox.AnchorListbox, Listbox.PortalListboxBackdrop),
      expect(role('listbox')).toBeAbsent(),
      expect(label('Request JSON')).toHaveValue(edited),
      expect(sideTrigger).toHaveText('SELL')
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
      expect(serviceTrigger).toExist(),
      expect(methodTrigger).toExist(),
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
