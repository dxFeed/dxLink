import { Effect, Option, Schema } from 'effect'
import { Command } from 'foldkit'

import { reportError } from '@dxfeed/dxlink-console-foldkit-core'

import { describeCallFailure, formatWireJson, unknownFailure } from '../call'
import { Descriptors } from '../domain'
import { RpcHandles } from '../service'
import { Message } from './message'
import { stampJson } from './model'

const CALL_NOT_OPEN = 'The call is no longer open.'

/**
 * Check the next request of a bidirectional call against the method's input message.
 * Succeeds with a verdict; fails when no live call is filed under the channel, since there
 * is then nothing to check against. Either result carries the text it is about, so one
 * about text that has since changed is recognisable.
 */
export const ValidateSendRequest = Command.define('ValidateSendRequest', {
  args: { channelId: Schema.String, json: Schema.String },
  messages: [Message.SucceededValidateSendRequest, Message.FailedValidateSendRequest],
  execute: ({ channelId, json }) =>
    Effect.gen(function* () {
      const handles = yield* RpcHandles
      const maybeHandle = yield* handles.get(channelId)
      if (Option.isNone(maybeHandle)) {
        const error = yield* reportError(unknownFailure(CALL_NOT_OPEN))

        return Message.FailedValidateSendRequest({ json, error })
      }
      const parsed = Descriptors.parseRequest(maybeHandle.value.method.input, json)

      return Message.SucceededValidateSendRequest({
        json,
        maybeError: 'error' in parsed ? Option.some(parsed.error) : Option.none(),
      })
    }),
})

/** Send another request on a bidirectional call. */
export const SendRequest = Command.define('SendRequest', {
  args: { channelId: Schema.String, json: Schema.String },
  messages: [Message.SucceededSendRequest, Message.FailedSendRequest],
  execute: ({ channelId, json }) =>
    Effect.gen(function* () {
      const handles = yield* RpcHandles
      const maybeHandle = yield* handles.get(channelId)
      const maybeSend = Option.flatMap(maybeHandle, ({ maybeSend }) => maybeSend)
      if (Option.isNone(maybeHandle) || Option.isNone(maybeSend)) {
        return yield* Effect.fail(unknownFailure(CALL_NOT_OPEN))
      }
      const { method } = maybeHandle.value
      const send = maybeSend.value

      const parsed = Descriptors.parseRequest(method.input, json)
      if ('error' in parsed) {
        return yield* Effect.fail(unknownFailure(parsed.error))
      }
      const sentJson = yield* Effect.try({
        try: () => {
          send(parsed.message)

          return formatWireJson(method, parsed.message)
        },
        catch: describeCallFailure,
      })

      return Message.SucceededSendRequest({ sent: yield* stampJson(sentJson) })
    }).pipe(
      Effect.catch((failure) =>
        Effect.map(reportError(failure), (error) => Message.FailedSendRequest({ error }))
      )
    ),
})
