import { type Chart, createChart } from '@devexperts/dxcharts-lite'

import type { DXLinkCandleEvent } from './candles'

/** The shape dxcharts-lite draws. */
type ChartCandle = Readonly<{
  id: string
  timestamp: number
  open: number
  close: number
  hi: number
  lo: number
  volume: number
}>

/**
 * A protocol candle encodes non-finite doubles as strings, because JSON has no literal for
 * them. The chart wants a real number.
 */
const toNumber = (value: number | string): number => {
  if (typeof value === 'number') {
    return value
  }
  if (value === 'Infinity') {
    return Number.POSITIVE_INFINITY
  }

  return value === '-Infinity' ? Number.NEGATIVE_INFINITY : Number.NaN
}

const toChartCandle = (candle: Readonly<DXLinkCandleEvent>): ChartCandle => ({
  // NOTE: `index` is the candle's identity in the protocol, and is what an update re-sends
  // to replace an earlier candle. As the chart's `id` it makes `updateData` overwrite in
  // place instead of appending a duplicate.
  id: String(candle.index),
  timestamp: candle.time,
  open: toNumber(candle.open),
  close: toNumber(candle.close),
  hi: toNumber(candle.high),
  lo: toNumber(candle.low),
  volume: toNumber(candle.volume),
})

type Scheme = 'Light' | 'Dark'

type Palette = Readonly<{
  paper: string
  background: string
  textPrimary: string
  textSecondary: string
  divider: string
  up: string
  down: string
}>

/** Literal colours matching the console's surfaces: a canvas cannot paint with a class. */
const PALETTES: Readonly<Record<Scheme, Palette>> = {
  Light: {
    paper: '#ffffff',
    background: '#fafafa',
    textPrimary: '#18181b',
    textSecondary: '#71717a',
    divider: '#e4e4e7',
    up: '#059669',
    down: '#dc2626',
  },
  Dark: {
    paper: '#18181b',
    background: '#09090b',
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    divider: '#27272a',
    up: '#10b981',
    down: '#f87171',
  },
}

const chartColors = (palette: Palette) => {
  const candleTheme = {
    upColor: palette.up,
    downColor: palette.down,
    noneColor: palette.textSecondary,
    upWickColor: palette.up,
    downWickColor: palette.down,
    noneWickColor: palette.textSecondary,
  }
  const backgroundMode: 'regular' = 'regular'

  return {
    candleTheme,
    activeCandleTheme: candleTheme,
    chartAreaTheme: {
      backgroundMode,
      backgroundColor: palette.paper,
      backgroundGradientTopColor: palette.paper,
      backgroundGradientBottomColor: palette.paper,
      gridColor: palette.divider,
    },
    yAxis: {
      backgroundColor: palette.paper,
      zeroPercentLine: palette.divider,
      labelTextColor: palette.textSecondary,
      labelInvertedTextColor: palette.paper,
      labelBoxColor: palette.textSecondary,
      rectLabelTextColor: palette.textPrimary,
      rectLabelInvertedTextColor: palette.paper,
    },
    xAxis: {
      backgroundColor: palette.paper,
      labelTextColor: palette.textSecondary,
    },
    crossTool: {
      lineColor: palette.textSecondary,
      labelBoxColor: palette.background,
      labelTextColor: palette.textPrimary,
    },
    waterMarkTheme: {
      firstRowColor: 'transparent',
      secondRowColor: 'transparent',
      thirdRowColor: 'transparent',
    },
  }
}

/** The scheme on screen: dark exactly when an ancestor carries the `dark` class. */
const schemeOf = (element: Element): Scheme =>
  element.closest('.dark') === null ? 'Light' : 'Dark'

/**
 * Where a channel's candles are drawn.
 *
 * It outlives the chart it draws on: candles can arrive before the chart's element is in the
 * DOM, and a chart fixes its colours at creation, so following a light/dark switch means
 * building a new chart, which starts empty. The sink therefore keeps what was drawn and
 * replays it into whichever chart is attached.
 */
export class CandleChartSink {
  // NOTE: insertion-ordered by candle id, which is the order the chart draws them in.
  private drawn = new Map<string, ChartCandle>()
  private maybeChart: Chart | undefined = undefined

  /** Draw a batch. A snapshot replaces what is on screen; an update merges into it. */
  push(candles: ReadonlyArray<Readonly<DXLinkCandleEvent>>, isSnapshot: boolean): void {
    const mapped = candles.map(toChartCandle)
    if (isSnapshot) {
      this.drawn = new Map(mapped.map((candle) => [candle.id, candle]))
      this.maybeChart?.setData({ candles: mapped })

      return
    }
    mapped.forEach((candle) => {
      this.drawn.set(candle.id, candle)
    })
    this.maybeChart?.updateData({ candles: mapped })
  }

  /** Drop everything drawn so far. */
  reset(): void {
    this.drawn = new Map()
    this.maybeChart?.setData({ candles: [] })
  }

  /**
   * Build a chart in the element and keep it in step with the scheme of the page around it.
   * Returns the detach function, which destroys the chart and stops watching.
   */
  attach(element: HTMLElement): () => void {
    const build = (scheme: Scheme): Scheme => {
      this.maybeChart?.destroy()
      const chart = createChart(element, {
        colors: chartColors(PALETTES[scheme]),
      })
      this.maybeChart = chart
      if (this.drawn.size > 0) {
        chart.setData({ candles: [...this.drawn.values()] })
      }

      return scheme
    }

    const current = { scheme: build(schemeOf(element)) }
    const observer = new MutationObserver(() => {
      const next = schemeOf(element)
      if (next !== current.scheme) {
        current.scheme = build(next)
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    })

    return () => {
      observer.disconnect()
      this.maybeChart?.destroy()
      this.maybeChart = undefined
    }
  }
}

const sinksByChannelId = new Map<string, CandleChartSink>()

/**
 * The chart sink of a channel, created on first use.
 *
 * A registry at module scope rather than a service: the Mount that builds the chart can
 * require nothing but its own scope, and it and the Command that opens the candle feed both
 * need the sink without either being guaranteed to run first.
 */
export const sinkFor = (channelId: string): CandleChartSink => {
  const existing = sinksByChannelId.get(channelId)
  if (existing !== undefined) {
    return existing
  }
  const sink = new CandleChartSink()
  sinksByChannelId.set(channelId, sink)

  return sink
}

export const dropSink = (channelId: string): void => {
  sinksByChannelId.delete(channelId)
}
