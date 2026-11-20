import { Effect } from 'effect'

import { type ReportedError, reportError } from '@dxfeed/dxlink-console-foldkit-core'

export const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Run a dxLink call, which may throw, as an Effect that fails with the reason instead. */
export const attempt = <A>(act: () => A): Effect.Effect<A, string> =>
  Effect.try({ try: act, catch: describe })

/** Turn a failure reason into a `Failed*` Message, stamped with the time it was observed at. */
export const reportFailure =
  <Failed>(toMessage: (error: ReportedError) => Failed) =>
  (reason: string): Effect.Effect<Failed> =>
    Effect.map(reportError({ type: 'CONSOLE', message: reason }), toMessage)
