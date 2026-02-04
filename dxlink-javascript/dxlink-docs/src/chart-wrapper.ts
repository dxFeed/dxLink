import {
  type DXLinkChannelStateChangeListener,
  type DXLinkIndiChartCandle,
  type DXLinkIndiChartIndicator,
  type DXLinkIndiChartIndicatorsData,
  type DXLinkIndiChartSubscription,
  type DXLinkClient,
  type DXLinkErrorListener,
  DXLinkChannelState,
  DXLinkIndiChart,
} from '@dxfeed/dxlink-api'

import type { ChannelInfo } from './debug-console/channel-widget'

// Type of data notification:
// - 'candles': snapshot of candles only (draw candles immediately)
// - 'indicators': snapshot of indicators (draw indicators after candles)
// - 'update': regular data update (update both candles and indicators)
export type ChartDataType = 'candles' | 'indicators' | 'update'

export type ChartHolderListener = (
  candles: DXLinkIndiChartCandle[],
  indicators: DXLinkIndiChartIndicatorsData[],
  dataType: ChartDataType
) => void

export class ChartHolder implements ChannelInfo {
  service = 'INDICHART'

  private closed = false
  private chart: DXLinkIndiChart | null = null
  private listener: ChartHolderListener | null = null

  private snapshot: boolean = false

  private pendingCandles: DXLinkIndiChartCandle[] = []
  private pendingIndicators: DXLinkIndiChartIndicatorsData[] = []

  // Store candles after snapshot for use with indicators
  private snapshotCandles: DXLinkIndiChartCandle[] = []

  // Track whether we're in snapshot mode and candles have been sent
  private candlesSnapshotSent: boolean = false

  private errorListeners: DXLinkErrorListener[] = []
  private stateListeners: DXLinkChannelStateChangeListener[] = []

  constructor(private readonly client: DXLinkClient) {}

  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) => {
    this.stateListeners.push(listener)

    if (this.chart !== null) {
      this.chart.getChannel().addStateChangeListener(listener)
    }
  }
  addErrorListener = (listener: DXLinkErrorListener) => {
    this.errorListeners.push(listener)

    if (this.chart !== null) {
      this.chart.getChannel().addErrorListener(listener)
    }
  }
  removeErrorListener = (listener: DXLinkErrorListener) => {
    this.errorListeners = this.errorListeners.filter((l) => l !== listener)

    if (this.chart !== null) {
      this.chart.getChannel().removeErrorListener(listener)
    }
  }
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) => {
    this.stateListeners = this.stateListeners.filter((l) => l !== listener)

    if (this.chart !== null) {
      this.chart.getChannel().removeStateChangeListener(listener)
    }
  }

  getState = (): DXLinkChannelState => {
    if (this.closed) {
      return DXLinkChannelState.CLOSED
    }

    return this.chart?.getState() ?? DXLinkChannelState.REQUESTED
  }

  update = (
    subscription: DXLinkIndiChartSubscription,
    indicator: DXLinkIndiChartIndicator,
    listener: ChartHolderListener,
    errorListener: (error: string) => void
  ): DXLinkIndiChart => {
    this.clear()
    this.listener = listener

    const chart = new DXLinkIndiChart(this.client, {
      current: indicator,
    })

    this.errorListeners.forEach((l) => chart.getChannel().addErrorListener(l))
    this.stateListeners.forEach((l) => chart.getChannel().addStateChangeListener(l))

    chart.addIndicatorsStateChangeListener((indicators) => {
      const indi = indicators.current
      if (indi === undefined) {
        return
      }

      if (!indi.enabled) {
        errorListener(indi.error ?? 'Unknown error')
      }
    })

    // Listen to candle snapshots
    chart.addCandleSnapshotListener(this.candleSnapshotListener)
    // Listen to indicator snapshots
    chart.addIndicatorsSnapshotListener(this.indicatorsSnapshotListener)
    // Listen to data updates
    chart.addUpdateListener(this.updateListener)

    chart.setSubscription(subscription, {})

    this.chart = chart

    return chart
  }

  getChart = (): DXLinkIndiChart | null => {
    return this.chart
  }

  getChannel = (): ChannelInfo => {
    return this
  }

  get id() {
    return this.chart?.id
  }

  public clear = () => {
    const chart = this.chart
    if (chart !== null) {
      this.errorListeners.forEach((l) => chart.getChannel().removeErrorListener(l))
      this.stateListeners.forEach((l) => chart.getChannel().removeStateChangeListener(l))
      chart.removeCandleSnapshotListener(this.candleSnapshotListener)
      chart.removeIndicatorsSnapshotListener(this.indicatorsSnapshotListener)
      chart.removeUpdateListener(this.updateListener)
      chart.close()
      this.listener = null
    }

    this.snapshot = false
    this.pendingCandles = []
    this.pendingIndicators = []
    this.snapshotCandles = []
    this.candlesSnapshotSent = false
  }

  close = () => {
    this.clear()

    this.closed = true

    this.stateListeners.forEach((l) => l(DXLinkChannelState.CLOSED, DXLinkChannelState.CLOSED))
  }

  // Handle candle snapshots (INDICHART_SNAPSHOT_CANDLE)
  private candleSnapshotListener = (
    candles: DXLinkIndiChartCandle[],
    reset: boolean,
    pending: boolean
  ) => {
    if (reset) {
      this.snapshot = true
      this.pendingCandles = []
      this.pendingIndicators = []
      this.snapshotCandles = []
      this.candlesSnapshotSent = false
    }

    this.pendingCandles.push(...candles)

    // When candles are ready (pending becomes false), notify immediately
    if (!pending && this.snapshot && !this.candlesSnapshotSent) {
      this.candlesSnapshotSent = true
      // Store candles for later use with indicators
      this.snapshotCandles = [...this.pendingCandles]

      if (this.listener !== null && this.pendingCandles.length > 0) {
        // Notify with candles only (no indicators yet)
        this.listener(this.pendingCandles, [], 'candles')
        this.pendingCandles = []
      }
    }
  }

  // Handle indicator snapshots (INDICHART_INDICATORS_SNAPSHOT)
  private indicatorsSnapshotListener = (
    indicators: DXLinkIndiChartIndicatorsData,
    pending: boolean
  ) => {
    this.pendingIndicators.push(indicators)

    // When indicators are ready (pending becomes false), notify with indicators
    if (!pending && this.snapshot && this.candlesSnapshotSent) {
      if (this.listener !== null && this.pendingIndicators.length > 0) {
        // Notify with stored candles (for timestamp mapping) + indicators
        this.listener(this.snapshotCandles, this.pendingIndicators, 'indicators')
        this.pendingIndicators = []
        this.snapshot = false
        this.snapshotCandles = []
        this.candlesSnapshotSent = false
      }
    }
  }

  // Handle data updates (INDICHART_UPDATE) - no reset flag, reset is only in INDICHART_CANDLE_SNAPSHOT
  private updateListener = (
    candles: DXLinkIndiChartCandle[],
    indicators: DXLinkIndiChartIndicatorsData,
    pending: boolean
  ) => {
    this.pendingCandles.push(...candles)
    this.pendingIndicators.push(indicators)

    if (pending) {
      return
    }

    // Notify as update
    if (this.listener !== null && this.pendingCandles.length > 0) {
      this.listener(this.pendingCandles, this.pendingIndicators, 'update')
      this.pendingCandles = []
      this.pendingIndicators = []
    }
  }
}
