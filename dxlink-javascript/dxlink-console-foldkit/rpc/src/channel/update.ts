import { Array, Match, Option, pipe } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  type ChannelStatus,
  type ChannelSummary,
  type ReportedError,
  clearErrors as clearErrorLog,
  prependError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { type Config, Validation } from '../request'
import type { RpcServices } from '../service'
import { SendRequest, ValidateSendRequest } from './command'
import { Message } from './message'
import {
  MAX_MESSAGES,
  type MessageEntry,
  type Model,
  type StampedJson,
  canSend,
  isClosed,
  openingModel,
} from './model'

type UpdateReturn = Update.Return<Model, Message, RpcServices>

/** A channel whose call is opening. The call itself is started by `connect`, from this Model. */
export const init = (input: Readonly<{ channelId: string; config: Config }>): UpdateReturn => ({
  model: openingModel(input),
})

/** Prepend messages, given oldest first, keeping the most recent {@link MAX_MESSAGES}. */
const prependEntries = (
  entries: ReadonlyArray<MessageEntry>,
  stamped: ReadonlyArray<StampedJson>,
  nextEntryId: number
): ReadonlyArray<MessageEntry> =>
  pipe(
    stamped,
    Array.map(({ time, json }, index) => ({
      id: nextEntryId + index,
      time,
      json,
    })),
    Array.reverse,
    Array.appendAll(entries),
    Array.take(MAX_MESSAGES)
  )

const recordRequest = (model: Model, sent: StampedJson): Model =>
  modifyFields(model, {
    requests: (requests) => prependEntries(requests, [sent], model.nextEntryId),
    nextEntryId: (nextEntryId) => nextEntryId + 1,
  })

const fail = (model: Model, error: ReportedError): Model =>
  modifyFields(model, {
    errorLog: (errorLog) => prependError(errorLog, error),
    callState: () => 'Failed',
  })

const validateSend = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    sendValidation: () => Validation.Pending(),
  }),
  commands: [ValidateSendRequest({ channelId: model.channelId, json: model.sendJson })],
})

/** What the call reports changes the channel only until the card is closed. */
const unlessClosed = (model: Model, next: (open: Model) => UpdateReturn): UpdateReturn =>
  isClosed(model) ? { model } : next(model)

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenCall: ({ sent }) =>
      unlessClosed(model, (open) => {
        const opened = modifyFields(recordRequest(open, sent), {
          callState: (callState) => (callState === 'Opening' ? 'Active' : callState),
        })

        return opened.callState === 'Active' && opened.config.isBidirectional
          ? validateSend(opened)
          : { model: opened }
      }),

    FailedOpenCall: ({ error }) => unlessClosed(model, (open) => ({ model: fail(open, error) })),

    ReceivedResponses: ({ responses }) =>
      unlessClosed(model, (open) => ({
        model: modifyFields(open, {
          responses: (entries) => prependEntries(entries, responses, open.nextEntryId),
          nextEntryId: (nextEntryId) => nextEntryId + responses.length,
        }),
      })),

    // NOTE: a failed call stays failed; the Observable never completes after an error, but
    // a late event must not paper over it either.
    EndedCall: () => ({
      model: modifyFields(model, {
        callState: (callState) =>
          callState === 'Opening' || callState === 'Active' ? 'Completed' : callState,
      }),
    }),

    FailedCall: ({ error }) => unlessClosed(model, (open) => ({ model: fail(open, error) })),

    // NOTE: a request can be drafted while the call is opening, but only an open call has
    // a method to check it against; SucceededOpenCall asks for the verdict then.
    UpdatedSendJson: ({ value }) => {
      if (model.callState === 'Active') {
        return validateSend(modifyFields(model, { sendJson: () => value }))
      }

      return model.callState === 'Opening'
        ? {
            model: modifyFields(model, {
              sendJson: () => value,
              sendValidation: () => Validation.Pending(),
            }),
          }
        : { model }
    },

    SucceededValidateSendRequest: ({ json, maybeError }) =>
      unlessClosed(model, (open) =>
        json === open.sendJson
          ? {
              model: modifyFields(open, {
                sendValidation: () =>
                  Option.match(maybeError, {
                    onNone: () => Validation.Valid(),
                    onSome: (error) => Validation.Invalid({ error }),
                  }),
              }),
            }
          : { model: open }
      ),

    // NOTE: a call the Model holds as active but the handles do not have is gone, so it
    // is reported and ended rather than left looking sendable.
    FailedValidateSendRequest: ({ error }) =>
      model.callState === 'Active' ? { model: fail(model, error) } : { model },

    ClickedSend: () =>
      canSend(model)
        ? {
            model,
            commands: [SendRequest({ channelId: model.channelId, json: model.sendJson })],
          }
        : { model },

    SucceededSendRequest: ({ sent }) =>
      unlessClosed(model, (open) => ({ model: recordRequest(open, sent) })),

    // NOTE: a request the channel rejects is reported on the card and ends the call, so a
    // typo in the editor cannot take anything else down.
    FailedSendRequest: ({ error }) => unlessClosed(model, (open) => ({ model: fail(open, error) })),
  })

/**
 * The channel once the user closed its card: nothing can be sent and nothing the call
 * reports is shown. The live call is released by whoever runs `connect`.
 */
export const close = (model: Model): Model => modifyFields(model, { callState: () => 'Closed' })

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })

const statusOf = (model: Model): ChannelStatus =>
  Match.value(model.callState).pipe(
    Match.withReturnType<ChannelStatus>(),
    Match.when('Failed', () => ({ label: 'failed', tone: 'Danger' })),
    Match.when('Completed', () => ({ label: 'completed', tone: 'Neutral' })),
    Match.when('Closed', () => ({ label: 'closed', tone: 'Neutral' })),
    Match.whenOr('Opening', 'Active', () =>
      Array.isReadonlyArrayEmpty(model.responses)
        ? { label: 'waiting', tone: 'Warning' }
        : { label: 'streaming', tone: 'Success' }
    ),
    Match.exhaustive
  )

/**
 * The channel is opened inside the RPC transport, so its protocol id is not exposed here;
 * the parameters are the ones the transport opens it with.
 */
export const summarize = (model: Model): ChannelSummary => ({
  subtitle: `${model.config.serviceName} · ${model.config.methodName}`,
  maybeStatus: Option.some(statusOf(model)),
  maybeChannelId: Option.none(),
  parameters: {
    service: model.config.serviceName,
    methodName: model.config.methodName,
  },
  errors: model.errorLog.errors,
})
