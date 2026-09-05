import type { DXLinkIndiChartIndicatorState } from '@dxfeed/dxlink-api'

/**
 * A compilation/execution failure, described for display.
 *
 * The server reports `ScriptError.type` as an open string, so every known category is
 * handled explicitly and anything unrecognised still produces something useful.
 * Ported from the legacy dxlink-docs `chart-wrapper.ts`, which formatted all of this
 * into a single string; here it stays structured so the UI can lay it out.
 */
export interface ScriptErrorDescription {
  /** Short category heading, e.g. `Syntax error`. */
  title: string
  /** The server's message, or a fixed explanation for categories that carry none. */
  message: string
  /** `script 'name' at line L, column C`, when the error is located. */
  location?: string
  /** Formatted call frames, innermost first. Only RUNTIME errors carry a stack. */
  stack?: string[]
}

const UNKNOWN: ScriptErrorDescription = {
  title: 'Script error',
  message: 'Unknown error in script.',
}

/**
 * Describe why an indicator is disabled.
 *
 * Returns `undefined` for an enabled indicator, so callers can use it as the presence
 * check for an error panel.
 */
export const describeScriptError = (
  state: DXLinkIndiChartIndicatorState | undefined
): ScriptErrorDescription | undefined => {
  if (state === undefined || state.enabled) {
    return undefined
  }

  // An internal failure takes precedence over any script error, as it did in
  // dxlink-docs (chart-wrapper.ts returned early on it): the server failing to run the
  // engine is the actionable fact, and a scriptError alongside it may be stale.
  if (state.internalErrorMessage !== undefined) {
    return { title: 'Internal error', message: state.internalErrorMessage }
  }

  if (state.scriptError === undefined) {
    return UNKNOWN
  }

  const error = state.scriptError
  const location = `script '${error.scriptName}' at line ${error.startLine}, column ${error.startColumn}`

  switch (error.type) {
    case 'SYNTAX':
      return { title: 'Syntax error', message: error.message, location }
    case 'RUNTIME':
      return {
        title: 'Runtime error',
        message: error.message,
        location,
        stack: error.scriptStack.map(
          (frame) => `at ${frame.functionName} (line ${frame.line}, column ${frame.column})`
        ),
      }
    case 'TIMEOUT':
      return { title: 'Timeout', message: 'Script execution timed out.' }
    case 'LIMIT':
      return { title: 'Limit exceeded', message: 'Script exceeded resource limits.' }
    case 'CANCELLED':
      return { title: 'Cancelled', message: 'Script execution was cancelled.' }
    case 'UNKNOWN':
      return { title: 'Script error', message: `Unknown script error: ${error.message}` }
    default:
      // An error type this build does not know about — show it rather than swallow it.
      return { title: error.type, message: error.message, location }
  }
}
