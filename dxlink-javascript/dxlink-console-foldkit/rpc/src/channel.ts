import {
  Array,
  Clock,
  Duration,
  Effect,
  Match,
  Option,
  Predicate,
  Schema,
  Stream,
  pipe,
} from 'effect'
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
import { type CallEvent, RpcHandles, type RpcServices, resolveMethod } from './service'

// MODEL

const CHANNEL_TAG = 'RpcChannel'

/**
 * Where the call stands. `Opening` lasts until the Command that starts the call reports
 * back. `Closed` is the user having closed the card, and it is final: whatever the call
 * still reports afterwards leaves it closed.
 */
export const CallState = Schema.Literals(['Opening', 'Active', 'Completed', 'Failed', 'Closed'])
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
  SucceededValidateSendRequest: {
    json: Schema.String,
    /** What is wrong with the request, or `None` when it fits the method's input message. */
    maybeError: Schema.Option(Schema.String),
  },
  FailedValidateSendRequest: { json: Schema.String, error: ReportedError },
  ClickedSend: {},
  SucceededSendRequest: { sent: StampedJson },
  FailedSendRequest: { error: ReportedError },
  SucceededCloseCall: {},
  FailedCloseCall: { error: ReportedError },
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

type CallFailure = Readonly<{ type: string; message: string }>

const unknownFailure = (message: string): CallFailure => ({ type: 'UNKNOWN', message })

/**
 * Resolve the call's descriptors from the registry the config names, start the call, and
 * file it under the channel's id. The request is parsed again here because the channel
 * receives it as text; a request the form let through parses.
 *
 * Everything that can fail is done before the call is started, and a started call is filed
 * without an interruption point in between, so a call that is running is always one that
 * {@link CloseCall} can find and stop.
 */
export const OpenCall = Command.define('OpenCall', {
  args: {
    channelId: Schema.String,
    registryId: Schema.Finite,
    serviceName: Schema.String,
    methodLocalName: Schema.String,
    requestJson: Schema.String,
  },
  messages: [Message.SucceededOpenCall, Message.FailedOpenCall],
  execute: ({ channelId, registryId, serviceName, methodLocalName, requestJson }) =>
    Effect.gen(function* () {
      const { service, method } = yield* Effect.mapError(
        resolveMethod({ registryId, serviceName, methodLocalName }),
        (error) => unknownFailure(error.message)
      )
      const client = yield* Effect.catchTag(DxLinkClient.get, 'ResourceNotAvailable', () =>
        Effect.fail(unknownFailure('RPC channel opened without an active connection'))
      )
      const handles = yield* RpcHandles

      const parsed = parseRequest(method.input, requestJson)
      if ('error' in parsed) {
        return yield* Effect.fail(unknownFailure(parsed.error))
      }
      const sentJson = yield* Effect.try({
        try: () => formatWireJson(method, parsed.message),
        catch: describeCallFailure,
      })

      yield* Effect.uninterruptible(
        Effect.flatMap(
          Effect.try({
            try: () =>
              startCall(client, service, method, parsed.message, (event) => {
                handles.emit(channelId, event)
              }),
            catch: describeCallFailure,
          }),
          (handle) => handles.put(channelId, handle)
        )
      )

      return Message.SucceededOpenCall({ sent: yield* stamp(sentJson) })
    }).pipe(
      Effect.catch((failure) =>
        Effect.map(reportError(failure), (error) => Message.FailedOpenCall({ error }))
      )
    ),
})

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
      const parsed = parseRequest(maybeHandle.value.method.input, json)

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

      const parsed = parseRequest(method.input, json)
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

      return Message.SucceededSendRequest({ sent: yield* stamp(sentJson) })
    }).pipe(
      Effect.catch((failure) =>
        Effect.map(reportError(failure), (error) => Message.FailedSendRequest({ error }))
      )
    ),
})

/**
 * Cancel the call, which releases its channel. The call is taken out of the handles first,
 * so it is no longer addressable whether or not stopping it throws. A channel with no call
 * filed under it has nothing left to release, which is a success: closing twice is harmless.
 */
export const CloseCall = Command.define('CloseCall', {
  args: { channelId: Schema.String },
  messages: [Message.SucceededCloseCall, Message.FailedCloseCall],
  execute: ({ channelId }) =>
    Effect.gen(function* () {
      const handles = yield* RpcHandles
      const maybeHandle = yield* handles.take(channelId)
      yield* Option.match(maybeHandle, {
        onNone: () => Effect.void,
        onSome: (handle) =>
          Effect.try({
            try: () => {
              handle.stop()
            },
            catch: describeCallFailure,
          }),
      })

      return Message.SucceededCloseCall()
    }).pipe(
      Effect.catch((failure) =>
        Effect.map(reportError(failure), (error) => Message.FailedCloseCall({ error }))
      )
    ),
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
    callState: 'Opening',
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
      registryId: config.registryId,
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

const recordError = (model: Model, error: ReportedError): Model =>
  modifyFields(model, {
    errorLog: (errorLog) => prependError(errorLog, error),
  })

const fail = (model: Model, error: ReportedError): Model =>
  modifyFields(recordError(model, error), { callState: () => 'Failed' })

const validateSend = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    sendValidation: () => Validation.Pending(),
  }),
  commands: [ValidateSendRequest({ channelId: model.channelId, json: model.sendJson })],
})

const canSend = (model: Model): boolean =>
  model.callState === 'Active' && model.sendValidation._tag === 'Valid'

const isClosed = (model: Model): boolean => model.callState === 'Closed'

/** What the call reports changes the channel only until the card is closed. */
const unlessClosed = (model: Model, next: (open: Model) => UpdateReturn): UpdateReturn =>
  isClosed(model) ? { model } : next(model)

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    // NOTE: a call that reports itself open after its card was closed was not filed yet
    // when the card's CloseCall ran, so it is stopped here rather than left running.
    SucceededOpenCall: ({ sent }) => {
      if (isClosed(model)) {
        return { model, commands: [CloseCall({ channelId: model.channelId })] }
      }
      const opened = modifyFields(recordRequest(model, sent), {
        callState: (callState) => (callState === 'Opening' ? 'Active' : callState),
      })

      return opened.callState === 'Active' && opened.config.isBidirectional
        ? validateSend(opened)
        : { model: opened }
    },

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

    SucceededCloseCall: () => ({ model }),

    FailedCloseCall: ({ error }) => ({ model: recordError(model, error) }),
  })

/**
 * End the channel's part in the call. The Model is closed here, not when the Command
 * reports back: from this point nothing can be sent and nothing the call reports is shown.
 */
export const close = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { callState: () => 'Closed' }),
  commands: [CloseCall({ channelId: model.channelId })],
})

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

// VIEW

const messageList = (
  title: string,
  entries: ReadonlyArray<MessageEntry>,
  emptyText: string,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Role('group'), h.AriaLabel(title), h.Class('flex flex-col gap-2')],
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

const canDraft = (model: Model): boolean =>
  model.callState === 'Opening' || model.callState === 'Active'

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
          isDisabled: !canDraft(model),
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

const noResponseText = (callState: CallState): string =>
  Match.value(callState).pipe(
    Match.when('Completed', () => 'The server closed the channel without a response.'),
    Match.when('Failed', () => 'The call failed without a response.'),
    Match.when('Closed', () => 'The channel was closed without a response.'),
    Match.whenOr('Opening', 'Active', () => 'Waiting for the first response…'),
    Match.exhaustive
  )

/** RPC channel — one method of a protobuf service, bound to the connection. */
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
      isClosed(model) ? Kit.notice('The channel is closed.', 'Neutral', h) : h.empty,
      model.config.isBidirectional && !isClosed(model) ? sendRequestView(model, h) : h.empty,
      messageList('Sent', model.requests, 'Nothing sent yet.', h),
      messageList('Received', model.responses, noResponseText(model.callState), h),
    ]
  )
)
