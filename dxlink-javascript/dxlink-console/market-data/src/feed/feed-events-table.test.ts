import { describe, expect, it } from 'vitest'

import { buildColumns } from './feed-events-table'
import type { EventRow } from './feed-events-table'

const row = (fields: Record<string, unknown>): EventRow => fields as unknown as EventRow

const fields = (negotiated: readonly string[] | undefined, rows: EventRow[]): string[] =>
  buildColumns(rows, negotiated).map((column) => column.field)

describe('buildColumns', () => {
  it('follows the server-negotiated field order instead of sorting it', () => {
    const negotiated = ['eventType', 'eventSymbol', 'bidPrice', 'askPrice']
    const rows = [row({ id: 'AAPL', eventType: 'Quote', eventSymbol: 'AAPL', bidPrice: 1 })]

    // eventSymbol hoisted, everything else left in protocol order — NOT alphabetical.
    expect(fields(negotiated, rows)).toEqual(['eventSymbol', 'eventType', 'bidPrice', 'askPrice'])
  })

  it('keeps negotiated fields that no row has yet, so the shape stays visible', () => {
    const negotiated = ['eventSymbol', 'bidPrice', 'askPrice']
    const rows = [row({ id: 'AAPL', eventSymbol: 'AAPL' })]

    expect(fields(negotiated, rows)).toEqual(['eventSymbol', 'bidPrice', 'askPrice'])
  })

  it('appends received fields missing from the negotiated list rather than hiding them', () => {
    const negotiated = ['eventSymbol', 'bidPrice']
    const rows = [row({ id: 'AAPL', eventSymbol: 'AAPL', bidPrice: 1, zzz: 9, extra: 8 })]

    expect(fields(negotiated, rows)).toEqual(['eventSymbol', 'bidPrice', 'extra', 'zzz'])
  })

  it('never emits a column for the synthetic row id', () => {
    const rows = [row({ id: 'AAPL#NTV', eventSymbol: 'AAPL' })]

    expect(fields(undefined, rows)).not.toContain('id')
  })

  it('falls back to priority-then-alphabetical before any config arrives', () => {
    const rows = [row({ id: 'AAPL', eventSymbol: 'AAPL', eventType: 'Quote', size: 1, ask: 2 })]

    expect(fields(undefined, rows)).toEqual(['eventSymbol', 'eventType', 'ask', 'size'])
    expect(fields([], rows)).toEqual(['eventSymbol', 'eventType', 'ask', 'size'])
  })
})
