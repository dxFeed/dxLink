import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import {
  CloseCall,
  MAX_MESSAGES,
  Message,
  OpenCall,
  SendRequest,
  ValidateSendRequest,
  clearErrors,
  close,
  init,
  summarize,
  toChannelMessages,
  update,
} from './channel'
import { type Config, Validation } from './request'
import { REGISTRY_NOT_RETAINED } from './service'

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
  requestTemplate: '{\n  "symbol": ""\n}',
}

const bidiConfig: Config = {
  ...unaryConfig,
  methodLocalName: 'trade',
  methodName: 'Trade',
  modelLabel: 'STREAM_STREAM',
  isBidirectional: true,
}

const sent = (json: string) => ({ time: '10:00:00', json })

const unaryInit = init({ channelId: '7', config: unaryConfig })
const bidiInit = init({ channelId: '8', config: bidiConfig })

const openBidiModel = (() => {
  const opened = update(
    bidiInit.model,
    Message.SucceededOpenCall({ sent: sent('{"symbol":"AAPL"}') })
  ).model

  return update(
    opened,
    Message.SucceededValidateSendRequest({
      json: opened.sendJson,
      maybeError: Option.none(),
    })
  ).model
})()

describe('opening a call', () => {
  test('a channel opens its call as soon as it exists', () => {
    expect(unaryInit.commands).toEqual([
      expect.objectContaining({
        name: OpenCall.name,
        args: {
          channelId: '7',
          registryId: 1,
          serviceName: 'demo.v1.OrderService',
          methodLocalName: 'issue',
          requestJson: '{"symbol":"AAPL"}',
        },
      }),
    ])
    expect(summarize(unaryInit.model)).toMatchObject({
      subtitle: 'demo.v1.OrderService · Issue',
      maybeStatus: Option.some({ label: 'waiting', tone: 'Warning' }),
      maybeChannelId: Option.none(),
      parameters: { service: 'demo.v1.OrderService', methodName: 'Issue' },
    })
  })

  test('a unary call shows exactly one request sent', () => {
    story(
      update,
      given(unaryInit.model),
      message(Message.SucceededOpenCall({ sent: sent('{"symbol":"AAPL"}') })),
      Command.expectNone(),
      message(Message.ReceivedResponses({ responses: [sent('{"id":"1"}')] })),
      message(Message.EndedCall()),
      model((next) => {
        expect(next.requests).toEqual([{ id: 1, time: '10:00:00', json: '{"symbol":"AAPL"}' }])
        expect(next.responses).toEqual([{ id: 2, time: '10:00:00', json: '{"id":"1"}' }])
        expect(next.callState).toBe('Completed')
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'completed', tone: 'Neutral' })
        )
      })
    )
  })

  test('a call that cannot be made fails on its own card', () => {
    story(
      update,
      given(unaryInit.model),
      message(
        Message.FailedOpenCall({
          error: { type: 'UNKNOWN', message: 'no such method', time: '10:00' },
        })
      ),
      model((next) => {
        expect(next.callState).toBe('Failed')
        expect(summarize(next).errors).toEqual([
          { id: 1, type: 'UNKNOWN', message: 'no such method', time: '10:00' },
        ])
        expect(clearErrors(next).errorLog.errors).toEqual([])
      })
    )
  })
})

describe('responses', () => {
  test('are kept newest first and counted as streaming', () => {
    story(
      update,
      given(unaryInit.model),
      message(
        Message.ReceivedResponses({
          responses: [sent('"first"'), sent('"second"')],
        })
      ),
      message(Message.ReceivedResponses({ responses: [sent('"third"')] })),
      model((next) => {
        expect(next.responses.map((entry) => [entry.id, entry.json])).toEqual([
          [3, '"third"'],
          [2, '"second"'],
          [1, '"first"'],
        ])
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'streaming', tone: 'Success' })
        )
      })
    )
  })

  test('only the most recent are retained', () => {
    const responses = Array.from({ length: MAX_MESSAGES + 5 }, (_, index) => sent(String(index)))

    story(
      update,
      given(unaryInit.model),
      message(Message.ReceivedResponses({ responses })),
      model((next) => {
        expect(next.responses).toHaveLength(MAX_MESSAGES)
        expect(next.responses[0]?.json).toBe(String(MAX_MESSAGES + 4))
      })
    )
  })

  test('a failure after completion is still a failure, and completion does not hide one', () => {
    const error = { type: 'BAD_ACTION', message: 'rejected', time: '10:01' }

    story(
      update,
      given(unaryInit.model),
      message(Message.FailedCall({ error })),
      message(Message.EndedCall()),
      model((next) => {
        expect(next.callState).toBe('Failed')
        expect(next.errorLog.errors).toHaveLength(1)
      })
    )
  })

  test('one window of events becomes ordered Messages, responses merged per call', () => {
    expect(
      toChannelMessages(
        [
          { channelId: '1', message: { _tag: 'Response', json: 'a' } },
          { channelId: '1', message: { _tag: 'Response', json: 'b' } },
          { channelId: '2', message: { _tag: 'Response', json: 'c' } },
          { channelId: '1', message: { _tag: 'Ended' } },
          {
            channelId: '2',
            message: { _tag: 'Failed', type: 'TIMEOUT', message: 'late' },
          },
        ],
        '10:02'
      )
    ).toEqual([
      {
        channelId: '1',
        message: Message.ReceivedResponses({
          responses: [
            { time: '10:02', json: 'a' },
            { time: '10:02', json: 'b' },
          ],
        }),
      },
      {
        channelId: '2',
        message: Message.ReceivedResponses({
          responses: [{ time: '10:02', json: 'c' }],
        }),
      },
      { channelId: '1', message: Message.EndedCall() },
      {
        channelId: '2',
        message: Message.FailedCall({
          error: { type: 'TIMEOUT', message: 'late', time: '10:02' },
        }),
      },
    ])
  })
})

describe('a bidirectional call', () => {
  test('checks its next request once the call is open', () => {
    story(
      update,
      given(bidiInit.model),
      message(Message.SucceededOpenCall({ sent: sent('{"symbol":"AAPL"}') })),
      Command.expectExact(
        ValidateSendRequest({
          channelId: '8',
          json: bidiConfig.requestTemplate,
        })
      ),
      Command.resolve(
        ValidateSendRequest,
        Message.SucceededValidateSendRequest({
          json: bidiConfig.requestTemplate,
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(next).toEqual(openBidiModel)
      })
    )
  })

  test('sends another request and counts it', () => {
    story(
      update,
      given(openBidiModel),
      message(Message.ClickedSend()),
      Command.expectExact(SendRequest({ channelId: '8', json: bidiConfig.requestTemplate })),
      Command.resolve(SendRequest, Message.SucceededSendRequest({ sent: sent('{"symbol":""}') })),
      model((next) => {
        expect(next.requests.map((entry) => entry.json)).toEqual([
          '{"symbol":""}',
          '{"symbol":"AAPL"}',
        ])
        expect(next.callState).toBe('Active')
      })
    )
  })

  test('does not send a request that failed its check', () => {
    story(
      update,
      given(openBidiModel),
      message(Message.UpdatedSendJson({ value: '{"smybol":""}' })),
      Command.resolve(
        ValidateSendRequest,
        Message.SucceededValidateSendRequest({
          json: '{"smybol":""}',
          maybeError: Option.some('unknown field'),
        })
      ),
      message(Message.ClickedSend()),
      Command.expectNone(),
      model((next) => {
        expect(next.sendValidation).toEqual(Validation.Invalid({ error: 'unknown field' }))
      })
    )
  })

  test('sends nothing once the call has completed', () => {
    story(
      update,
      given(openBidiModel),
      message(Message.EndedCall()),
      message(Message.ClickedSend()),
      Command.expectNone()
    )
  })

  test('sends nothing once the call has failed', () => {
    story(
      update,
      given(openBidiModel),
      message(
        Message.FailedCall({
          error: { type: 'TIMEOUT', message: 'late', time: '10:03' },
        })
      ),
      message(Message.ClickedSend()),
      Command.expectNone()
    )
  })

  test('a rejected send is reported on the card and ends the call', () => {
    story(
      update,
      given(openBidiModel),
      message(Message.ClickedSend()),
      Command.resolve(
        SendRequest,
        Message.FailedSendRequest({
          error: { type: 'UNKNOWN', message: 'closed', time: '10:04' },
        })
      ),
      model((next) => {
        expect(next.callState).toBe('Failed')
        expect(next.errorLog.errors[0]?.message).toBe('closed')
      })
    )
  })
})

describe('a bidirectional call that is not open', () => {
  test('a request drafted while the call opens is checked once it is open', () => {
    story(
      update,
      given(bidiInit.model),
      message(Message.UpdatedSendJson({ value: '{"symbol":"MSFT"}' })),
      Command.expectNone(),
      model((next) => {
        expect(next.callState).toBe('Opening')
        expect(next.sendValidation).toEqual(Validation.Pending())
      }),
      message(Message.SucceededOpenCall({ sent: sent('{"symbol":"AAPL"}') })),
      Command.expectExact(ValidateSendRequest({ channelId: '8', json: '{"symbol":"MSFT"}' })),
      Command.resolve(
        ValidateSendRequest,
        Message.SucceededValidateSendRequest({
          json: '{"symbol":"MSFT"}',
          maybeError: Option.none(),
        })
      ),
      model((next) => {
        expect(next.callState).toBe('Active')
        expect(next.sendValidation).toEqual(Validation.Valid())
      })
    )
  })

  test('a check that finds no live call reports it and ends the call', () => {
    story(
      update,
      given(openBidiModel),
      message(Message.UpdatedSendJson({ value: '{}' })),
      Command.resolve(
        ValidateSendRequest,
        Message.FailedValidateSendRequest({
          json: '{}',
          error: { type: 'UNKNOWN', message: 'The call is no longer open.', time: '10:05' },
        })
      ),
      model((next) => {
        expect(next.callState).toBe('Failed')
        expect(summarize(next).errors).toEqual([
          { id: 1, type: 'UNKNOWN', message: 'The call is no longer open.', time: '10:05' },
        ])
      }),
      message(Message.ClickedSend()),
      Command.expectNone()
    )
  })

  test('a call whose definitions are gone fails on its own card', () => {
    story(
      update,
      given(bidiInit.model),
      message(
        Message.FailedOpenCall({
          error: { type: 'UNKNOWN', message: REGISTRY_NOT_RETAINED, time: '10:06' },
        })
      ),
      Command.expectNone(),
      model((next) => {
        expect(next.callState).toBe('Failed')
        expect(summarize(next).errors[0]?.message).toBe(REGISTRY_NOT_RETAINED)
        expect(summarize(next).maybeStatus).toEqual(
          Option.some({ label: 'failed', tone: 'Danger' })
        )
      })
    )
  })
})

describe('closing', () => {
  const closedModel = close(openBidiModel).model

  test('ends the call in the Model and cancels the one filed under the channel', () => {
    const channelClose = close(openBidiModel)

    expect(channelClose.model).toEqual({ ...openBidiModel, callState: 'Closed' })
    expect(channelClose.commands).toEqual([
      expect.objectContaining({
        name: CloseCall.name,
        args: { channelId: '8' },
      }),
    ])
    expect(summarize(channelClose.model).maybeStatus).toEqual(
      Option.some({ label: 'closed', tone: 'Neutral' })
    )
  })

  test('nothing the call reports afterwards revives it', () => {
    const error = { type: 'TIMEOUT', message: 'late', time: '10:07' }

    story(
      update,
      given(closedModel),
      message(Message.ReceivedResponses({ responses: [sent('{"id":"9"}')] })),
      message(Message.EndedCall()),
      message(Message.FailedCall({ error })),
      message(Message.FailedOpenCall({ error })),
      message(Message.FailedSendRequest({ error })),
      message(Message.SucceededSendRequest({ sent: sent('{}') })),
      message(Message.FailedValidateSendRequest({ json: closedModel.sendJson, error })),
      message(
        Message.SucceededValidateSendRequest({
          json: closedModel.sendJson,
          maybeError: Option.some('late verdict'),
        })
      ),
      message(Message.SucceededCloseCall()),
      Command.expectNone(),
      model((next) => {
        expect(next).toEqual(closedModel)
      })
    )
  })

  test('nothing can be drafted or sent on a closed channel', () => {
    story(
      update,
      given(closedModel),
      message(Message.UpdatedSendJson({ value: '{"symbol":"MSFT"}' })),
      message(Message.ClickedSend()),
      Command.expectNone(),
      model((next) => {
        expect(next).toEqual(closedModel)
      })
    )
  })

  test('a call that opens after its card was closed is stopped', () => {
    story(
      update,
      given(close(bidiInit.model).model),
      message(Message.SucceededOpenCall({ sent: sent('{"symbol":"AAPL"}') })),
      Command.expectExact(CloseCall({ channelId: '8' })),
      Command.resolve(CloseCall, Message.SucceededCloseCall()),
      model((next) => {
        expect(next.callState).toBe('Closed')
        expect(next.requests).toEqual([])
      })
    )
  })

  test('a call that could not be stopped is reported and stays closed', () => {
    story(
      update,
      given(closedModel),
      message(
        Message.FailedCloseCall({
          error: { type: 'UNKNOWN', message: 'unsubscribe failed', time: '10:08' },
        })
      ),
      Command.expectNone(),
      model((next) => {
        expect(next.callState).toBe('Closed')
        expect(summarize(next).errors).toEqual([
          { id: 1, type: 'UNKNOWN', message: 'unsubscribe failed', time: '10:08' },
        ])
      })
    )
  })
})
