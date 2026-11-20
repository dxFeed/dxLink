import { Array, Clock, DateTime, Effect, Schema } from 'effect'

/**
 * A protocol error as it left the dxLink client, stamped with the time it arrived.
 *
 * The stamp is taken where the error is observed — in the Stream that listens to the client,
 * or in a Command — so `update` stays free of clock reads.
 */
export const ReportedError = Schema.Struct({
  type: Schema.String,
  message: Schema.String,
  time: Schema.String,
})
export type ReportedError = typeof ReportedError.Type

/**
 * A reported error held for display.
 *
 * `id` is its identity in a keyed list: errors are prepended, so a position is not stable.
 */
export const TimestampedError = Schema.Struct({
  id: Schema.Finite,
  type: Schema.String,
  message: Schema.String,
  time: Schema.String,
})
export type TimestampedError = typeof TimestampedError.Type

/**
 * How many errors one scope retains.
 *
 * A server that rejects every subscription in a large batch can produce thousands, and a
 * debug console is left open for a long time. Only the most recent are useful, and an
 * unbounded list would grow memory for the session and render one entry per error.
 */
export const MAX_ERRORS = 200

/**
 * The errors of one scope — the connection, or a single channel — newest first.
 *
 * `nextId` lives beside the list so ids stay unique after the list is cleared.
 */
export const ErrorLog = Schema.Struct({
  errors: Schema.Array(TimestampedError),
  nextId: Schema.Finite,
})
export type ErrorLog = typeof ErrorLog.Type

export const emptyErrorLog = (): ErrorLog => ({ errors: [], nextId: 1 })

/** Prepend an error, keeping the most recent {@link MAX_ERRORS}. */
export const prependError = (log: ErrorLog, error: ReportedError): ErrorLog => ({
  errors: Array.take(Array.prepend(log.errors, { id: log.nextId, ...error }), MAX_ERRORS),
  nextId: log.nextId + 1,
})

/** Drop every recorded error. Ids keep counting, so a later error never reuses one. */
export const clearErrors = (log: ErrorLog): ErrorLog => ({
  errors: [],
  nextId: log.nextId,
})

/** A moment (Unix milliseconds) as a local time of day, the way every log in the console shows one. */
export const formatLocalTime = (millis: number): string =>
  DateTime.formatLocal(DateTime.makeUnsafe(millis), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** Stamp an error with the local time it is observed at. */
export const reportError = (
  error: Readonly<{ type: string; message: string }>
): Effect.Effect<ReportedError> =>
  Effect.map(Clock.currentTimeMillis, (millis) => ({
    type: error.type,
    message: error.message,
    time: formatLocalTime(millis),
  }))
