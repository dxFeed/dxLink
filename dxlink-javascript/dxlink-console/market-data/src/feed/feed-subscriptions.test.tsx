import type { DXLinkClient } from '@dxfeed/dxlink-api'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SubscriptionManager } from './feed-subscriptions'
import { FeedViewModel } from './feed-view-model'

// The VM's constructor is pure — the channel only opens in start(), which these tests
// never call. So commands fall through to the store and no client is touched.
const createVM = () => new FeedViewModel({} as DXLinkClient, {})

const openListbox = (input: HTMLElement) => {
  fireEvent.mouseDown(input)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  return screen.getByRole('listbox')
}

const optionsOf = (input: HTMLElement): string[] =>
  within(openListbox(input))
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')

/**
 * Type into a field and dismiss any Autocomplete listbox it opened. The listbox is
 * portalled and would otherwise stay mounted, making a later `getByLabelText` for the
 * same field ambiguous.
 */
const setValue = (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Escape' })
}

describe('SubscriptionManager', () => {
  it('offers the event types the old console had, less the deprecated one', () => {
    render(<SubscriptionManager vm={createVM()} />)

    const options = optionsOf(screen.getByLabelText('Event type'))

    expect(options).toHaveLength(17)
    // These existed in dxlink-docs but were missing from the rebuild.
    expect(options).toContain('TradeETH')
    expect(options).toContain('Configuration')
    expect(options).toContain('Message')
    // Deprecated in the dxFeed API in favour of `Candle`, so not offered.
    expect(options).not.toContain('DailyCandle')
  })

  it('opens the event-type list from the field itself, not only by typing a prefix', () => {
    render(<SubscriptionManager vm={createVM()} />)

    const input = screen.getByLabelText('Event type')
    // The popup indicator only exists because `forcePopupIcon` is set: MUI hides it for a
    // `freeSolo` field by default, which leaves the list reachable only by guessing a prefix.
    fireEvent.click(screen.getByTitle('Open'))

    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(17)
    fireEvent.keyDown(input, { key: 'Escape' })
  })

  it('selects the current event type on click, so typing replaces it', () => {
    render(<SubscriptionManager vm={createVM()} />)

    const input = screen.getByLabelText('Event type') as HTMLInputElement
    setValue(input, 'Quote')
    // `selectOnFocus` is what makes the text replaceable, and MUI applies it on click rather
    // than on focus. Without it the next keystroke appends: typing `Trade` over `Quote` left
    // `QuoteTrade`, which matches no event type and subscribes to nothing the server knows.
    fireEvent.click(input)

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('Quote'.length)
    fireEvent.keyDown(input, { key: 'Escape' })
  })

  it('accepts an event type that is not on the list', () => {
    const vm = createVM()
    render(<SubscriptionManager vm={vm} />)

    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'FutureEvent' } })
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'AAPL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(vm.store.getState().subscriptions).toEqual([
      {
        type: 'FutureEvent',
        symbol: 'AAPL',
        kind: 'regular',
        source: undefined,
        fromTime: undefined,
      },
    ])
  })

  it('offers the predefined order sources for indexed subscriptions', () => {
    render(<SubscriptionManager vm={createVM()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Indexed' }))

    const options = optionsOf(screen.getByLabelText('Order source'))

    expect(options).toHaveLength(34)
    expect(options).toContain('NTV')
    expect(options).toContain('DEFAULT')
    expect(options).toContain('AGGREGATE_BID')
    // Case matters: these are distinct sources, not duplicates.
    expect(options).toContain('ntv')
  })

  it('keeps two sources of one symbol as separate subscriptions', () => {
    const vm = createVM()
    render(<SubscriptionManager vm={vm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Indexed' }))

    // Captured once: these inputs persist across adds, and re-querying by label would
    // be ambiguous while a portalled listbox is mounted.
    const type = screen.getByLabelText('Event type')
    const symbol = screen.getByLabelText('Symbol')
    const orderSource = screen.getByLabelText('Order source')
    const add = screen.getByRole('button', { name: 'Add' })

    for (const source of ['NTV', 'DEX']) {
      setValue(type, 'Order')
      setValue(symbol, 'AAPL')
      setValue(orderSource, source)
      fireEvent.click(add)
    }

    expect(vm.store.getState().subscriptions).toHaveLength(2)
    expect(screen.getByText('Order#NTV:AAPL')).toBeInTheDocument()
    expect(screen.getByText('Order#DEX:AAPL')).toBeInTheDocument()
  })

  it('shows the order source only for indexed, and from time only for time series', () => {
    render(<SubscriptionManager vm={createVM()} />)

    expect(screen.queryByLabelText('Order source')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('From time')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Indexed' }))
    expect(screen.getByLabelText('Order source')).toBeInTheDocument()
    expect(screen.queryByLabelText('From time')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Time series' }))
    expect(screen.getByLabelText('From time')).toBeInTheDocument()
    expect(screen.queryByLabelText('Order source')).not.toBeInTheDocument()
  })

  it('keeps the from time numeric', () => {
    const vm = createVM()
    render(<SubscriptionManager vm={vm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Time series' }))

    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'AAPL{=d}' } })
    fireEvent.change(screen.getByLabelText('From time'), { target: { value: '17e0abc99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(vm.store.getState().subscriptions[0]?.fromTime).toBe(17099)
  })

  it('links the documentation the old console linked', () => {
    render(<SubscriptionManager vm={createVM()} />)

    expect(screen.getByRole('link', { name: 'kb.dxfeed.com' })).toHaveAttribute(
      'href',
      'https://kb.dxfeed.com/en/data-model/dxfeed-api-market-events.html#event-types'
    )
  })
})
