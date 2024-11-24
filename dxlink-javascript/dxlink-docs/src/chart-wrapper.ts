import {
  type DXLinkChannelStateChangeListener,
  type DXLinkChartCandle,
  type DXLinkChartIndicatorsData,
  type DXLinkChartSubscription,
  type DXLinkClient,
  type DXLinkErrorListener,
  DXLinkChannelState,
  DXLinkChart,
} from '@dxfeed/dxlink-api'

import type { ChannelInfo } from './debug-console/channel-widget'

export type ChartHolderListener = (
  candles: DXLinkChartCandle[],
  indicators: DXLinkChartIndicatorsData[],
  snapshot: boolean
) => void

export class ChartHolder implements ChannelInfo {
  service = 'CHART'

  private closed = false
  private chart: DXLinkChart | null = null
  private listener: ChartHolderListener | null = null

  private snapshot: boolean = false

  private pendingCandles: DXLinkChartCandle[] = []
  private pendingIndicators: DXLinkChartIndicatorsData[] = []

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
    subscription: DXLinkChartSubscription,
    indicator: string,
    listener: ChartHolderListener
  ): DXLinkChart => {
    this.clear()
    this.listener = listener

    const chart = new DXLinkChart(this.client, {
      current: {
        lang: 'dxScript',
        content: indicator,
      },
    })

    this.errorListeners.forEach((l) => chart.getChannel().addErrorListener(l))
    this.stateListeners.forEach((l) => chart.getChannel().addStateChangeListener(l))

    chart.addDataListener(this.dataListener)
    chart.setSubscription(subscription, {})

    this.chart = chart

    return chart
  }

  getChart = (): DXLinkChart | null => {
    return this.chart
  }

  getChannel = (): ChannelInfo => {
    return this
  }

  get id() {
    return this.chart?.id
  }

  private clear = () => {
    const chart = this.chart
    if (chart !== null) {
      this.errorListeners.forEach((l) => chart.getChannel().removeErrorListener(l))
      this.stateListeners.forEach((l) => chart.getChannel().removeStateChangeListener(l))
      chart.removeDataListener(this.dataListener)
      chart.close()
      this.chart = null
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
    candles: DXLinkChartCandle[],
    indicators: DXLinkChartIndicatorsData,
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
