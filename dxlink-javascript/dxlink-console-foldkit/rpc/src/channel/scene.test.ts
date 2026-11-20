import { Option } from 'effect'
import {
  Command,
  Subscription,
  click,
  expect,
  given,
  label,
  role,
  scene,
  text,
  type,
  within,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import type { Config } from '../request'
import {
  Message,
  type Model,
  SendRequest,
  ValidateSendRequest,
  close,
  init,
  update,
  view,
} from './index'

const unaryConfig: Config = {
  registryId: 1,
  serviceName: 'demo.v1.OrderService',
  methodLocalName: 'issue',
  methodName: 'Issue',
  modelLabel: 'REQUEST_RESPONSE',
  isBidirectional: false,
  inputTypeName: 'demo.v1.Order',
  outputTypeName: 'demo.v1.Ack',
  requestJson: '{"symbol":"AAPL"}',
  requestTemplate: '{"symbol":""}',
}

const bidiConfig: Config = {
  ...unaryConfig,
  methodLocalName: 'trade',
  methodName: 'Trade',
  modelLabel: 'STREAM_STREAM',
  isBidirectional: true,
}

const at = (json: string) => ({ time: '10:00:00', json })

const opened = Message.SucceededOpenCall({ sent: at('{"symbol":"AAPL"}') })

const openingUnary = init({ channelId: '7', config: unaryConfig }).model
const openUnary = update(openingUnary, opened).model

const openingBidi = init({ channelId: '8', config: bidiConfig }).model

/** A bidirectional call that is open and whose next request passed its check. */
const openBidi: Model = (() => {
  const active = update(openingBidi, opened).model

  return update(
    active,
    Message.SucceededValidateSendRequest({ json: active.sendJson, maybeError: Option.none() })
  ).model
})()

const sent = role('group', { name: 'Sent' })
const received = role('group', { name: 'Received' })

describe('a unary call', () => {
  test('shows what it calls and waits while it opens', () => {
    scene(
      { update, view },
      given(openingUnary),
      expect(text('REQUEST_RESPONSE')).toExist(),
      expect(text('in: demo.v1.Order')).toExist(),
      expect(text('out: demo.v1.Ack')).toExist(),
      expect(within(sent, text('0'))).toExist(),
      expect(text('Nothing sent yet.')).toExist(),
      expect(within(received, text('0'))).toExist(),
      expect(text('Waiting for the first response…')).toExist()
    )
  })

  test('counts the request it sent and the response it received', () => {
    scene(
      { update, view },
      given(openUnary),
      expect(within(sent, text('1'))).toExist(),
      expect(within(sent, text('{"symbol":"AAPL"}'))).toExist(),
      expect(within(received, text('0'))).toExist(),
      Subscription.emit(Message.ReceivedResponses({ responses: [at('{"id":"42"}')] })),
      Subscription.emit(Message.EndedCall()),
      expect(within(sent, text('1'))).toExist(),
      expect(within(received, text('1'))).toExist(),
      expect(within(received, text('{"id":"42"}'))).toExist(),
      expect(text('Waiting for the first response…')).toBeAbsent()
    )
  })

  test('a call the server ends without a response says so', () => {
    scene(
      { update, view },
      given(openUnary),
      Subscription.emit(Message.EndedCall()),
      expect(text('The server closed the channel without a response.')).toExist()
    )
  })

  test('a failed call stops waiting for a response', () => {
    scene(
      { update, view },
      given(openUnary),
      Subscription.emit(
        Message.FailedCall({ error: { type: 'TIMEOUT', message: 'late', time: '10:01:00' } })
      ),
      expect(text('The call failed without a response.')).toExist(),
      expect(text('Waiting for the first response…')).toBeAbsent(),
      expect(within(sent, text('1'))).toExist()
    )
  })

  test('has no way to send another request', () => {
    scene(
      { update, view },
      given(openUnary),
      expect(label('Send another request')).toBeAbsent(),
      expect(role('button', { name: 'Send' })).toBeAbsent()
    )
  })
})

describe('a bidirectional call', () => {
  test('offers to send another request once its draft passed the check', () => {
    scene(
      { update, view },
      given(openBidi),
      expect(label('Send another request')).toHaveValue('{"symbol":""}'),
      expect(label('Send another request')).toBeEnabled(),
      click(role('button', { name: 'Send' })),
      Command.expectExact(SendRequest({ channelId: '8', json: '{"symbol":""}' })),
      Command.resolve(SendRequest, Message.SucceededSendRequest({ sent: at('{"symbol":""}') })),
      expect(within(sent, text('2'))).toExist()
    )
  })

  test('a draft that fails its check is shown with its error and cannot be sent', () => {
    scene(
      { update, view },
      given(openBidi),
      type(label('Send another request'), '{"smybol":""}'),
      Command.expectExact(ValidateSendRequest({ channelId: '8', json: '{"smybol":""}' })),
      expect(role('button', { name: 'Send' })).toBeDisabled(),
      Command.resolve(
        ValidateSendRequest,
        Message.SucceededValidateSendRequest({
          json: '{"smybol":""}',
          maybeError: Option.some('key "smybol" is unknown'),
        })
      ),
      expect(role('alert')).toHaveText('key "smybol" is unknown'),
      expect(role('button', { name: 'Send' })).toBeDisabled()
    )
  })

  test('a draft can be written while the call opens but not sent', () => {
    scene(
      { update, view },
      given(openingBidi),
      type(label('Send another request'), '{"symbol":"MSFT"}'),
      Command.expectNone(),
      expect(label('Send another request')).toHaveValue('{"symbol":"MSFT"}'),
      expect(role('button', { name: 'Send' })).toBeDisabled()
    )
  })

  test('sending is disabled once the call completed', () => {
    scene(
      { update, view },
      given(openBidi),
      expect(role('button', { name: 'Send' })).toBeEnabled(),
      Subscription.emit(Message.EndedCall()),
      expect(label('Send another request')).toBeDisabled(),
      expect(role('button', { name: 'Send' })).toBeDisabled()
    )
  })

  test('sending is disabled once the call failed', () => {
    scene(
      { update, view },
      given(openBidi),
      Subscription.emit(
        Message.FailedCall({ error: { type: 'BAD_ACTION', message: 'no', time: '10:02:00' } })
      ),
      expect(label('Send another request')).toBeDisabled(),
      expect(role('button', { name: 'Send' })).toBeDisabled()
    )
  })
})

describe('a closed channel', () => {
  const closedBidi = close(
    update(openBidi, Message.ReceivedResponses({ responses: [at('{"id":"1"}')] })).model
  )

  test('says it is closed, keeps what was exchanged and offers nothing to send', () => {
    scene(
      { update, view },
      given(closedBidi),
      expect(role('note')).toHaveText('The channel is closed.'),
      expect(label('Send another request')).toBeAbsent(),
      expect(role('button', { name: 'Send' })).toBeAbsent(),
      expect(within(sent, text('1'))).toExist(),
      expect(within(received, text('{"id":"1"}'))).toExist()
    )
  })

  test('a response that arrives afterwards is not shown', () => {
    scene(
      { update, view },
      given(closedBidi),
      Subscription.emit(Message.ReceivedResponses({ responses: [at('{"id":"2"}')] })),
      Subscription.emit(Message.EndedCall()),
      expect(within(received, text('1'))).toExist(),
      expect(text('{"id":"2"}')).toBeAbsent(),
      expect(role('note')).toHaveText('The channel is closed.')
    )
  })

  test('a channel closed before any response says so', () => {
    scene(
      { update, view },
      given(close(openUnary)),
      expect(text('The channel was closed without a response.')).toExist()
    )
  })
})
