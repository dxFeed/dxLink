import { Array, Clock, Duration, Effect, Option, Predicate, Schema, Stream, pipe } from 'effect'
import { Command, Submodel, type Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import {
  type ChannelEvent,
  type ChannelStatus,
  type ChannelSummary,
  DxLinkClient,
  ErrorLog,
  Kit,
  ReportedError,
  clearErrors as clearErrorLog,
  emptyErrorLog,
  formatLocalTime,
  prependError,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { describeCallFailure, formatWireJson, startCall } from './call'
import { parseRequest } from './descriptors'
import { Config, Validation } from './request'
import { type CallEvent, RpcHandles, RpcRegistry, type RpcServices } from './service'

// MODEL

const CHANNEL_TAG = 'RpcChannel'

export const CallState = Schema.Literals(['Active', 'Completed', 'Failed'])
export type CallState = typeof CallState.Type

/** A message with the local time it was observed at, kept as the protobuf-JSON text. */
export const StampedJson = Schema.Struct({
  time: Schema.String,
  json: Schema.String,
})
export type StampedJson = typeof StampedJson.Type

/** One message exchanged on the call. `id` is its identity in a keyed list. */
export const MessageEntry = Schema.Struct({
  id: Schema.Finite,
  time: Schema.String,
  json: Schema.String,
})
export type MessageEntry = typeof MessageEntry.Type

/**
 * How many messages one call retains in each direction. A streaming RPC left open produces
 * an unbounded number of them, and only the most recent are useful in a console.
 */
export const MAX_MESSAGES = 200

export const Model = Schema.Struct({
  _tag: Schema.Literal(CHANNEL_TAG),
  /** The id of the channel's card, which is what the live call is filed under. */
  channelId: Schema.String,
  config: Config,
  callState: CallState,
  /** Requests sent, newest first. More than one only for a bidirectional method. */
  requests: Schema.Array(MessageEntry),
  /** Responses received, newest first. */
  responses: Schema.Array(MessageEntry),
  nextEntryId: Schema.Finite,
  errorLog: ErrorLog,
  /** The next request of a bidirectional call, as it is being edited. */
  sendJson: Schema.String,
  sendValidation: Validation,
})
export type Model = typeof Model.Type

export const isModel = (value: unknown): value is Model => Predicate.isTagged(value, CHANNEL_TAG)

// MESSAGE

export const Message = defineMessageUnion({
  SucceededOpenCall: { sent: StampedJson },
  FailedOpenCall: { error: ReportedError },
  ReceivedResponses: { responses: Schema.Array(StampedJson) },
  EndedCall: {},
  FailedCall: { error: ReportedError },
  UpdatedSendJson: { value: Schema.String },
  CompletedValidateSendRequest: {
    json: Schema.String,
    maybeError: Schema.Option(Schema.String),
  },
  ClickedSend: {},
  SucceededSendRequest: { sent: StampedJson },
  FailedSendRequest: { error: ReportedError },
  CompletedCloseCall: {},
})
export type Message = typeof Message.Type

export const isMessage = Schema.is(Message)

const isReceivedResponses = Schema.is(Message.ReceivedResponses)

// COMMAND

const stamp = (json: string): Effect.Effect<StampedJson> =>
  Effect.map(Clock.currentTimeMillis, (millis) => ({
    time: formatLocalTime(millis),
    json,
  }))

const CALL_NOT_OPEN = 'The call is no longer open.'

/**
 * Resolve the call's descriptors from the loaded registry, start it, and file the live call
 * under the channel's id. The request is parsed again here because the channel receives it
 * as text; a request the form let through parses.
 */
export const OpenCall = Command.define('OpenCall', {
  args: {
    channelId: Schema.String,
    serviceName: Schema.String,
    methodLocalName: Schema.String,
    requestJson: Schema.String,
  },
  messages: [Message.SucceededOpenCall, Message.FailedOpenCall],
  execute: ({ channelId, serviceName, methodLocalName, requestJson }) =>
    Effect.gen(function* () {
      const client = yield* DxLinkClient.get
      const store = yield* RpcRegistry
      const handles = yield* RpcHandles
      const maybeRegistry = yield* store.get

      const sent = yield* Effect.try({
        try: () => {
          const service = Option.getOrUndefined(maybeRegistry)?.getService(serviceName)
          const method = service?.method[methodLocalName]
          if (service === undefined || method === undefined) {
            throw new Error(
              `The loaded definitions do not declare ${serviceName}/${methodLocalName}`
            )
          }
          const parsed = parseRequest(method.input, requestJson)
          if ('error' in parsed) {
            throw new Error(parsed.error)
          }
          const handle = startCall(client, service, method, parsed.message, (event) => {
            handles.emit(channelId, event)
          })

          return { handle, json: formatWireJson(method, parsed.message) }
        },
        catch: describeCallFailure,
      })
      yield* handles.put(channelId, sent.handle)

      return Message.SucceededOpenCall({ sent: yield* stamp(sent.json) })
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        Effect.fail({
          type: 'UNKNOWN',
          message: 'RPC channel opened without an active connection',
        })
      ),
      Effect.catch((failure) =>
        Effect.map(reportError(failure), (error) => Message.FailedOpenCall({ error }))
      )
    ),
})

/**
 * Check the next request of a bidirectional call against the method's input message. The
 * result carries the text that was checked, so a verdict on text that has since changed is
 * recognisable.
 */
export const ValidateSendRequest = Command.define('ValidateSendRequest', {
  args: { channelId: Schema.String, json: Schema.String },
  messages: [Message.CompletedValidateSendRequest],
  execute: ({ channelId, json }) =>
    Effect.gen(function* () {
      const handles = yield* RpcHandles
      const maybeHandle = yield* handles.get(channelId)

      return Message.CompletedValidateSendRequest({
        json,
        maybeError: Option.match(maybeHandle, {
          onNone: () => Option.some(CALL_NOT_OPEN),
          onSome: (handle) => {
            const parsed = parseRequest(handle.method.input, json)

            return 'error' in parsed ? Option.some(parsed.error) : Option.none()
          },
        }),
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

      const sentJson = yield* Effect.try({
        try: () => {
          const handle = Option.getOrUndefined(maybeHandle)
          const send = Option.getOrUndefined(
            Option.flatMap(maybeHandle, ({ maybeSend }) => maybeSend)
          )
          if (handle === undefined || send === undefined) {
            throw new Error(CALL_NOT_OPEN)
          }
          const parsed = parseRequest(handle.method.input, json)
          if ('error' in parsed) {
            throw new Error(parsed.error)
          }
          send(parsed.message)

          return formatWireJson(handle.method, parsed.message)
        },
        catch: describeCallFailure,
      })

      return Message.SucceededSendRequest({ sent: yield* stamp(sentJson) })
    }).pipe(
      Effect.catch((failure) =>
        Effect.map(reportError(failure), (error) => Message.FailedSendRequest({ error }))
      )
    ),
})

/** Cancel the call, which releases its channel. Closing twice is harmless. */
export const CloseCall = Command.define('CloseCall', {
  args: { channelId: Schema.String },
  messages: [Message.CompletedCloseCall],
  execute: ({ channelId }) =>
    Effect.gen(function* () {
      const handles = yield* RpcHandles
      const maybeHandle = yield* handles.take(channelId)
      yield* Effect.sync(() => {
        Option.match(maybeHandle, {
          onNone: () => undefined,
          onSome: (handle) => {
            handle.stop()
          },
        })
      })

      return Message.CompletedCloseCall()
    }),
})

// EVENTS

const EVENT_WINDOW = Duration.millis(100)
const EVENT_WINDOW_SIZE = 512

/**
 * Turn what the live calls reported within one window into Messages, in order. Consecutive
 * responses of the same call become one Message, so a fast stream costs one update per
 * window rather than one per response.
 */
export const toChannelMessages = (
  events: ReadonlyArray<ChannelEvent<CallEvent>>,
  time: string
): ReadonlyArray<ChannelEvent<Message>> =>
  Array.reduce(
    events,
    Array.empty<ChannelEvent<Message>>(),
    (messages, { channelId, message: event }) => {
      if (event._tag === 'Ended') {
        return Array.append(messages, {
          channelId,
          message: Message.EndedCall(),
        })
      }
      if (event._tag === 'Failed') {
        return Array.append(messages, {
          channelId,
          message: Message.FailedCall({
            error: { type: event.type, message: event.message, time },
          }),
        })
      }
      const response = { time, json: event.json }

      return pipe(
        Array.last(messages),
        Option.filter((last) => last.channelId === channelId),
        Option.map((last) => last.message),
        Option.filter(isReceivedResponses),
        Option.match({
          onNone: () =>
            Array.append(messages, {
              channelId,
              message: Message.ReceivedResponses({ responses: [response] }),
            }),
          onSome: (last) =>
            Array.append(Array.dropRight(messages, 1), {
              channelId,
              message: Message.ReceivedResponses({
                responses: Array.append(last.responses, response),
              }),
            }),
        })
      )
    }
  )

/** Everything the plugin's live calls produce on their own, addressed to their channels. */
export const events: Stream.Stream<ChannelEvent<Message>, never, RpcServices> = Stream.unwrap(
  Effect.gen(function* () {
    const handles = yield* RpcHandles

    return handles.events
  })
).pipe(
  Stream.groupedWithin(EVENT_WINDOW_SIZE, EVENT_WINDOW),
  Stream.mapEffect((window) =>
    Effect.map(Clock.currentTimeMillis, (millis) =>
      toChannelMessages(window, formatLocalTime(millis))
    )
  ),
  Stream.flattenIterable
)

// UPDATE

type UpdateReturn = Update.Return<Model, Message, RpcServices>

export const init = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: Config }>): UpdateReturn => ({
  model: {
    _tag: CHANNEL_TAG,
    channelId,
    config,
    callState: 'Active',
    requests: [],
    responses: [],
    nextEntryId: 1,
    errorLog: emptyErrorLog(),
    sendJson: config.requestTemplate,
    sendValidation: Validation.Pending(),
  },
  commands: [
    OpenCall({
      channelId,
      serviceName: config.serviceName,
      methodLocalName: config.methodLocalName,
      requestJson: config.requestJson,
    }),
  ],
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
    callState: () => 'Failed',
    errorLog: (errorLog) => prependError(errorLog, error),
  })

const validateSend = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    sendValidation: () => Validation.Pending(),
  }),
  commands: [ValidateSendRequest({ channelId: model.channelId, json: model.sendJson })],
})

const canSend = (model: Model): boolean =>
  model.callState === 'Active' && model.sendValidation._tag === 'Valid'

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SucceededOpenCall: ({ sent }) => {
      const recorded = recordRequest(model, sent)

      return model.config.isBidirectional ? validateSend(recorded) : { model: recorded }
    },

    FailedOpenCall: ({ error }) => ({ model: fail(model, error) }),

    ReceivedResponses: ({ responses }) => ({
      model: modifyFields(model, {
        responses: (entries) => prependEntries(entries, responses, model.nextEntryId),
        nextEntryId: (nextEntryId) => nextEntryId + responses.length,
      }),
    }),

    // NOTE: a failed call stays failed; the Observable never completes after an error, but
    // a late event must not paper over it either.
    EndedCall: () => ({
      model: modifyFields(model, {
        callState: (callState) => (callState === 'Failed' ? callState : 'Completed'),
      }),
    }),

    FailedCall: ({ error }) => ({ model: fail(model, error) }),

    UpdatedSendJson: ({ value }) => validateSend(modifyFields(model, { sendJson: () => value })),

    CompletedValidateSendRequest: ({ json, maybeError }) =>
      json === model.sendJson
        ? {
            model: modifyFields(model, {
              sendValidation: () =>
                Option.match(maybeError, {
                  onNone: () => Validation.Valid(),
                  onSome: (error) => Validation.Invalid({ error }),
                }),
            }),
          }
        : { model },

    ClickedSend: () =>
      canSend(model)
        ? {
            model,
            commands: [SendRequest({ channelId: model.channelId, json: model.sendJson })],
          }
        : { model },

    SucceededSendRequest: ({ sent }) => ({ model: recordRequest(model, sent) }),

    // NOTE: a request the channel rejects is reported on the card and ends the call, so a
    // typo in the editor cannot take anything else down.
    FailedSendRequest: ({ error }) => ({ model: fail(model, error) }),

    CompletedCloseCall: () => ({ model }),
  })

export const close = (model: Model): UpdateReturn => ({
  model,
  commands: [CloseCall({ channelId: model.channelId })],
})

export const clearErrors = (model: Model): Model => modifyFields(model, { errorLog: clearErrorLog })

const statusOf = (model: Model): ChannelStatus => {
  if (model.callState === 'Failed') {
    return { label: 'failed', tone: 'Danger' }
  }
  if (model.callState === 'Completed') {
    return { label: 'completed', tone: 'Neutral' }
  }

  return Array.isReadonlyArrayEmpty(model.responses)
    ? { label: 'waiting', tone: 'Warning' }
    : { label: 'streaming', tone: 'Success' }
}

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

// VIEW

const messageList = (
  title: string,
  entries: ReadonlyArray<MessageEntry>,
  emptyText: string,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Class('flex flex-col gap-2')],
    [
      h.div(
        [h.Class('flex items-baseline gap-2')],
        [
          h.h4([h.Class('text-sm font-semibold')], [title]),
          h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], [globalThis.String(entries.length)]),
        ]
      ),
      Array.match(entries, {
        onEmpty: () => h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], [emptyText]),
        onNonEmpty: (nonEmptyEntries) =>
          h.ul(
            [h.Class('flex flex-col gap-2')],
            Array.map(nonEmptyEntries, (entry) =>
              h.keyed('li')(
                globalThis.String(entry.id),
                [h.Class('flex flex-col gap-1')],
                [
                  h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], [entry.time]),
                  Kit.jsonBlock(entry.json, h),
                ]
              )
            )
          ),
      }),
    ]
  )

/**
 * Send box of a bidirectional call — the only model where the client keeps talking after
 * the channel is open. Nothing can be sent once the call has completed or failed: the
 * channel is gone.
 */
const sendRequestView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-2')],
    [
      Kit.textArea(
        {
          id: `dxlink-rpc-send-${model.channelId}`,
          label: 'Send another request',
          value: model.sendJson,
          rows: 4,
          onInput: (value) => Message.UpdatedSendJson({ value }),
        },
        h
      ),
      Validation.match(model.sendValidation, {
        Pending: () => h.empty,
        Valid: () => h.empty,
        Invalid: ({ error }) => Kit.notice(error, 'Danger', h),
      }),
      h.div(
        [],
        [
          Kit.button(
            {
              label: 'Send',
              onClick: Message.ClickedSend(),
              variant: 'Primary',
              isDisabled: !canSend(model),
            },
            h
          ),
        ]
      ),
    ]
  )

/** Live RPC channel — one method of a protobuf service, bound to the connection. */
export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      h.div(
        [h.Class('flex flex-wrap gap-1')],
        [
          Kit.chip(model.config.modelLabel, 'Neutral', h),
          Kit.chip(`in: ${model.config.inputTypeName}`, 'Neutral', h),
          Kit.chip(`out: ${model.config.outputTypeName}`, 'Neutral', h),
        ]
      ),
      model.config.isBidirectional ? sendRequestView(model, h) : h.empty,
      messageList('Sent', model.requests, 'Nothing sent yet.', h),
      messageList(
        'Received',
        model.responses,
        model.callState === 'Completed'
          ? 'The server closed the channel without a response.'
          : 'Waiting for the first response…',
        h
      ),
    ]
  )
)
