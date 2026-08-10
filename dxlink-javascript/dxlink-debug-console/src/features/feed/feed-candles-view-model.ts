import { DXLinkChannelState, DXLinkLogLevel } from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkError, DXLinkIndiChartCandle } from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import { DXLinkCandles } from './candles'
import type { DXLinkCandleData, DXLinkCandleEvent } from './candles'
import { prependError } from '../../shared/lib/timestamped-error'
import type { TimestampedError } from '../../shared/lib/timestamped-error'
import type { ViewModel } from '../../shared/view-model'

/** How the chart consumes a batch of candles: a fresh snapshot or an incremental update. */
export type CandleChartListener = (
  candles: DXLinkIndiChartCandle[],
  dataType: 'candles' | 'update'
) => void

export interface CandlesVMState {
  channelState: DXLinkChannelState
  subscription: { symbol: string; fromTime: number } | null
  candleCount: number
  lastUpdate: number | null
  /** Protocol channel id, for correlating with a protocol log. Null until opened. */
  channelId: number | null
  /** Parameters this channel was actually opened with. Null until opened. */
  channelParameters: Readonly<Record<string, unknown>> | null
  /** Errors scoped to THIS channel — connection errors live on the connection VM. */
  errors: TimestampedError[]
}

const toChartCandle = (event: DXLinkCandleEvent): DXLinkIndiChartCandle => ({
  eventSymbol: event.eventSymbol,
  index: event.index,
  time: event.time,
  open: event.open,
  high: event.high,
  low: event.low,
  close: event.close,
  volume: event.volume,
})

/**
 * ViewModel for the Feed candle-chart view — wraps {@link DXLinkCandles}.
 *
 * Construction is PURE (StrictMode-safe); the candle channel is opened in
 * {@link start} and released in {@link stop} via the view's `useEffect`. Candle
 * batches are forwarded to the chart through an imperative {@link CandleChartListener}
 * (the chart consumes data via a ref), while channel state / counts go to the store.
 */
export class FeedCandlesViewModel implements ViewModel<CandlesVMState> {
  readonly store = createStore<CandlesVMState>(() => ({
    channelState: DXLinkChannelState.REQUESTED,
    subscription: null,
    candleCount: 0,
    lastUpdate: null,
    channelId: null,
    channelParameters: null,
    errors: [],
  }))

  private readonly client: DXLinkClient
  private readonly params: { feed?: string; space?: string }
  private candles: DXLinkCandles | null = null
  private chartListener: CandleChartListener | null = null

  constructor(client: DXLinkClient, params: { feed?: string; space?: string } = {}) {
    this.client = client
    this.params = params
  }

  /** Register the chart sink (the view wires this to `chartRef.pushData`). */
  setChartListener = (listener: CandleChartListener | null): void => {
    this.chartListener = listener
  }

  start = (): void => {
    if (this.candles !== null) return
    const candles = new DXLinkCandles(this.client, {
      feed: this.params.feed,
      space: this.params.space,
      // A debug console wants the protocol traffic in the browser log.
      logLevel: DXLinkLogLevel.DEBUG,
    })
    candles.addListener(this.handleData)
    const channel = candles.getChannel()
    channel.addStateChangeListener(this.handleState)
    channel.addErrorListener(this.handleError)
    this.candles = candles
    this.store.setState({
      channelState: channel.getState(),
      channelId: channel.id,
      channelParameters: channel.parameters,
    })
    // Re-apply an existing subscription after a StrictMode restart.
    const { subscription } = this.store.getState()
    if (subscription !== null) {
      candles.setSubscription(subscription)
    }
  }

  stop = (): void => {
    const candles = this.candles
    if (candles === null) return
    this.candles = null
    candles.removeListener(this.handleData)
    const channel = candles.getChannel()
    channel.removeStateChangeListener(this.handleState)
    channel.removeErrorListener(this.handleError)
    candles.close()
  }

  setSubscription = (symbol: string, fromTime: number): void => {
    const subscription = { symbol, fromTime }
    this.store.setState({ subscription, candleCount: 0, lastUpdate: null })
    this.candles?.setSubscription(subscription)
  }

  clearErrors = (): void => {
    this.store.setState({ errors: [] })
  }

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private handleData = (data: DXLinkCandleData): void => {
    if (this.candles === null) return
    const candles = data.events.map(toChartCandle)
    this.store.setState({ candleCount: candles.length, lastUpdate: Date.now() })
    this.chartListener?.(candles, data.isSnapshot ? 'candles' : 'update')
  }

  private handleState = (state: DXLinkChannelState): void => {
    this.store.setState({ channelState: state })
  }

  private handleError = (error: DXLinkError): void => {
    this.store.setState((s) => ({ errors: prependError(s.errors, error) }))
  }
}
