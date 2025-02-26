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

export type ChartHolderListener = (
  candles: DXLinkIndiChartCandle[],
  indicators: DXLinkIndiChartIndicatorsData[],
  snapshot: boolean
) => void

export class ChartHolder implements ChannelInfo {
  service = 'INDICHART'

  private closed = false
  private chart: DXLinkIndiChart | null = null
  private listener: ChartHolderListener | null = null

  private snapshot: boolean = false

  private pendingCandles: DXLinkIndiChartCandle[] = []
  private pendingIndicators: DXLinkIndiChartIndicatorsData[] = []

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

    chart.addDataListener(this.dataListener)
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
      chart.removeDataListener(this.dataListener)
      chart.close()
      this.listener = null
    }

    this.snapshot = false
    this.pendingCandles = []
    this.pendingIndicators = []
  }

  close = () => {
    this.clear()

    this.closed = true

    this.stateListeners.forEach((l) => l(DXLinkChannelState.CLOSED, DXLinkChannelState.CLOSED))
  }

  private dataListener = (
    candles: DXLinkIndiChartCandle[],
    indicators: DXLinkIndiChartIndicatorsData,
    reset: boolean,
    pending: boolean
  ) => {
    if (reset) {
      this.snapshot = true
    }

    // add candles to pending at the end
    this.pendingCandles.push(...candles)
    this.pendingIndicators.push(indicators)

    if (pending) {
      return
    }

    if (this.listener !== null) {
      this.listener(this.pendingCandles, this.pendingIndicators, this.snapshot)

      this.pendingCandles = []
      this.pendingIndicators = []
      this.snapshot = false
    }
  }
}
