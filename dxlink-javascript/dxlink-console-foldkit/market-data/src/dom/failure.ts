import type { Effect } from 'effect'

import { type ReportedError, reportError } from '@dxfeed/dxlink-console-foldkit-core'

/** What a thrown value says about itself. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : globalThis.String(error)

/**
 * A failure of the console's own making — one the server did not report — stamped with the
 * time it is observed at.
 */
export const reportFailure = (message: string): Effect.Effect<ReportedError> =>
  reportError({ type: 'UNKNOWN', message })
