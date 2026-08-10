import type { DXLinkError } from '@dxfeed/dxlink-api'

/**
 * A protocol error captured for display, stamped with the time it arrived.
 *
 * Used by both scopes: connection errors aggregate on the `ConnectionViewModel`,
 * channel errors stay on the channel VM that owns them.
 */
export interface TimestampedError {
  type: string
  message: string
  time: string
}

/** Capture a `DXLinkError` with the current wall-clock time. */
export const toTimestampedError = (error: DXLinkError): TimestampedError => ({
  type: error.type,
  message: error.message,
  time: new Date().toLocaleTimeString(),
})

/** Prepend an error to a list, newest first. */
export const prependError = (
  errors: readonly TimestampedError[],
  error: DXLinkError
): TimestampedError[] => [toTimestampedError(error), ...errors]
