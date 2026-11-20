import { Clock, Effect, Predicate, Schema } from 'effect'

import { ErrorLog, emptyErrorLog, formatLocalTime } from '@dxfeed/dxlink-console-foldkit-core'

import { Config, Validation } from '../request'

const CHANNEL_TAG = 'RpcChannel'

/**
 * Where the call stands. `Opening` lasts until the live call reports whether it opened.
 * `Closed` is the user having closed the card, and it is final: whatever the call still
 * reports afterwards leaves it closed.
 */
export const CallState = Schema.Literals(['Opening', 'Active', 'Completed', 'Failed', 'Closed'])
export type CallState = typeof CallState.Type

/** A message with the local time it was observed at, kept as the protobuf-JSON text. */
export const StampedJson = Schema.Struct({
  time: Schema.String,
  json: Schema.String,
})
export type StampedJson = typeof StampedJson.Type

/** Stamp a message with the local time it is observed at. */
export const stampJson = (json: string): Effect.Effect<StampedJson> =>
  Effect.map(Clock.currentTimeMillis, (millis) => ({
    time: formatLocalTime(millis),
    json,
  }))

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

/** A channel whose call is opening, its send box on the shape of the method's request. */
export const openingModel = ({
  channelId,
  config,
}: Readonly<{ channelId: string; config: Config }>): Model => ({
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
})

export const isClosed = (model: Model): boolean => model.callState === 'Closed'

/** The next request can be edited while the call may still take one. */
export const canDraft = (model: Model): boolean =>
  model.callState === 'Opening' || model.callState === 'Active'

/** The next request can be sent: the call is open and the request, as it reads, passed its check. */
export const canSend = (model: Model): boolean =>
  model.callState === 'Active' && model.sendValidation._tag === 'Valid'
