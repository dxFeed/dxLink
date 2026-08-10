import type { DXLinkIndiChartIndicatorState } from '@dxfeed/dxlink-api'
import { describe, expect, it } from 'vitest'

import { describeScriptError } from './script-error'

// ScriptError is not exported from the public API, so derive it from the state union.
type DisabledState = Extract<DXLinkIndiChartIndicatorState, { enabled: false }>
type ScriptError = NonNullable<DisabledState['scriptError']>

const scriptError = (fields: Partial<ScriptError>): ScriptError => ({
  type: 'SYNTAX',
  message: 'unexpected token',
  scriptName: 'main',
  startLine: 3,
  startColumn: 7,
  endLine: 3,
  endColumn: 9,
  scriptStack: [],
  ...fields,
})

const disabled = (fields: Partial<DisabledState>): DXLinkIndiChartIndicatorState => ({
  enabled: false,
  ...fields,
})

describe('describeScriptError', () => {
  it('returns nothing for a healthy indicator, so it doubles as the presence check', () => {
    expect(describeScriptError(undefined)).toBeUndefined()
    expect(
      describeScriptError({
        enabled: true,
        inParameters: [],
        outParameters: [],
      } as DXLinkIndiChartIndicatorState)
    ).toBeUndefined()
  })

  it('locates a syntax error', () => {
    const described = describeScriptError(disabled({ scriptError: scriptError({}) }))

    expect(described).toEqual({
      title: 'Syntax error',
      message: 'unexpected token',
      location: "script 'main' at line 3, column 7",
    })
  })

  it('includes the call stack for a runtime error', () => {
    const described = describeScriptError(
      disabled({
        scriptError: scriptError({
          type: 'RUNTIME',
          message: 'division by zero',
          scriptStack: [
            { functionName: 'compute', line: 12, column: 4 },
            { functionName: 'main', line: 3, column: 1 },
          ],
        }),
      })
    )

    expect(described?.title).toBe('Runtime error')
    expect(described?.stack).toEqual([
      'at compute (line 12, column 4)',
      'at main (line 3, column 1)',
    ])
  })

  it('explains the categories that carry no message', () => {
    expect(
      describeScriptError(disabled({ scriptError: scriptError({ type: 'TIMEOUT' }) }))
    ).toEqual({ title: 'Timeout', message: 'Script execution timed out.' })
    expect(
      describeScriptError(disabled({ scriptError: scriptError({ type: 'LIMIT' }) }))?.title
    ).toBe('Limit exceeded')
    expect(
      describeScriptError(disabled({ scriptError: scriptError({ type: 'CANCELLED' }) }))?.title
    ).toBe('Cancelled')
  })

  it('wraps an explicitly unknown error', () => {
    expect(
      describeScriptError(
        disabled({ scriptError: scriptError({ type: 'UNKNOWN', message: 'boom' }) })
      )?.message
    ).toBe('Unknown script error: boom')
  })

  it('shows an error type this build does not know rather than swallowing it', () => {
    const described = describeScriptError(
      disabled({ scriptError: scriptError({ type: 'FUTURE_KIND', message: 'something new' }) })
    )

    expect(described?.title).toBe('FUTURE_KIND')
    expect(described?.message).toBe('something new')
  })

  it('reports a server-side internal failure', () => {
    expect(describeScriptError(disabled({ internalErrorMessage: 'engine unavailable' }))).toEqual({
      title: 'Internal error',
      message: 'engine unavailable',
    })
  })

  it('prefers an internal failure over a script error reported alongside it', () => {
    // dxlink-docs checked internalErrorMessage first; a scriptError sent with it may be
    // stale, and the engine failure is the actionable one.
    expect(
      describeScriptError(
        disabled({
          internalErrorMessage: 'engine unavailable',
          scriptError: scriptError({ message: 'stale' }),
        })
      )
    ).toEqual({ title: 'Internal error', message: 'engine unavailable' })
  })

  it('still says something when the server reports no detail at all', () => {
    expect(describeScriptError(disabled({}))).toEqual({
      title: 'Script error',
      message: 'Unknown error in script.',
    })
  })
})
