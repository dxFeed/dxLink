import type { DXLinkError } from '@dxfeed/dxlink-api'

/**
 * A protocol error captured for display, stamped with the time it arrived.
 *
 * Used by both scopes: connection errors aggregate on the `ConnectionViewModel`,
 * channel errors stay on the channel VM that owns them.
 */
export interface TimestampedError {
  /** Stable identity for React keys — errors are prepended, so an index is not stable. */
  id: number
  type: string
  message: string
  time: string
}

/**
 * How many errors one scope retains.
 *
 * A server that rejects every subscription in a large batch can produce thousands, and a
 * debug console is left open for a long time. Only the most recent are useful, and an
 * unbounded list would grow memory for the session and render one alert per entry.
 */
export const MAX_ERRORS = 200

let lastErrorId = 0

const toTimestampedError = (error: DXLinkError): TimestampedError => {
  lastErrorId += 1

  return {
    id: lastErrorId,
    type: error.type,
    message: error.message,
    time: new Date().toLocaleTimeString(),
  }
}

/** Prepend an error to a list, newest first, capped at {@link MAX_ERRORS}. */
export const prependError = (
  errors: readonly TimestampedError[],
  error: DXLinkError
): TimestampedError[] => [toTimestampedError(error), ...errors].slice(0, MAX_ERRORS)
