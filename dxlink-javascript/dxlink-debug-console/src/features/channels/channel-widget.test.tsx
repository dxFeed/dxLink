import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChannelWidget } from './channel-widget'
import type { TimestampedError } from '../../shared/lib/timestamped-error'

const errors: TimestampedError[] = [
  { id: 1, type: 'INVALID_ARGUMENT', message: 'Unknown symbol', time: '10:00:01' },
  { id: 2, type: 'BAD_ACTION', message: 'Channel is not opened', time: '10:00:02' },
]

const renderWidget = (props: Partial<Parameters<typeof ChannelWidget>[0]> = {}) =>
  render(
    <ChannelWidget icon={<span />} title="Feed #1" subtitle="Feed · subscriptions" {...props}>
      <div>channel body</div>
    </ChannelWidget>
  )

describe('ChannelWidget', () => {
  it('shows the protocol channel id next to the subtitle', () => {
    renderWidget({ channelId: 7 })

    expect(screen.getByText('Feed · subscriptions · channel #7')).toBeInTheDocument()
  })

  it('omits the id until the channel is actually open', () => {
    renderWidget({ channelId: null })

    expect(screen.getByText('Feed · subscriptions')).toBeInTheDocument()
  })

  it('lists the parameters the channel was opened with', () => {
    renderWidget({ parameters: { contract: 'AUTO', feed: 'demo' } })

    expect(screen.getByText('contract: AUTO')).toBeInTheDocument()
    expect(screen.getByText('feed: demo')).toBeInTheDocument()
  })

  it('skips parameters the client left undefined', () => {
    renderWidget({ parameters: { contract: 'AUTO', space: undefined } })

    expect(screen.getByText('contract: AUTO')).toBeInTheDocument()
    expect(screen.queryByText(/space/)).not.toBeInTheDocument()
  })

  it('renders a list parameter readably', () => {
    renderWidget({ parameters: { sources: ['NTV', 'DEX'] } })

    expect(screen.getByText('sources: NTV, DEX')).toBeInTheDocument()
  })

  it('skips an empty list rather than showing a chip with nothing after the colon', () => {
    // A DOM channel opened with no order source sends `sources: []`.
    renderWidget({ parameters: { symbol: 'AAPL', sources: [] } })

    expect(screen.getByText('symbol: AAPL')).toBeInTheDocument()
    expect(screen.queryByText(/^sources:/)).not.toBeInTheDocument()
  })

  it('surfaces channel errors on the card, not the connection error center', () => {
    const onClearErrors = vi.fn()
    renderWidget({ errors, onClearErrors })

    const trigger = screen.getByRole('button', { name: /Channel/ })
    expect(screen.getByText('2')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.getByText('INVALID_ARGUMENT')).toBeInTheDocument()
    expect(screen.getByText('Unknown symbol')).toBeInTheDocument()
    expect(screen.getByText('BAD_ACTION')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClearErrors).toHaveBeenCalledOnce()
  })

  it('hides the error trigger while the channel is healthy', () => {
    renderWidget({ errors: [] })

    expect(screen.queryByRole('button', { name: /Channel/ })).not.toBeInTheDocument()
  })

  it('drops the body and the actions once closed, keeping a closed record', () => {
    const onClose = vi.fn()
    renderWidget({ onClose, errors, channelId: 7 })

    fireEvent.click(screen.getByRole('button', { name: 'Close channel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByText('closed')).toBeInTheDocument()
    expect(screen.queryByText('channel body')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Channel/ })).not.toBeInTheDocument()
  })
})
