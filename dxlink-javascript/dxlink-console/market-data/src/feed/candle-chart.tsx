import { createChart } from '@devexperts/dxcharts-lite'
import type { Chart } from '@devexperts/dxcharts-lite'
import type { DXLinkIndiChartCandle, JSONNumber } from '@dxfeed/dxlink-api'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { useResolvedColorScheme } from '../lib/color-scheme'
import type { ResolvedColorScheme } from '../lib/color-scheme'

/** How a batch of candles reaches the chart: a fresh snapshot, or an incremental update. */
export type CandleBatchKind = 'candles' | 'update'

export interface CandleChartHandle {
  /** Draw a batch. `'candles'` replaces what is on screen; `'update'` merges into it. */
  push: (candles: readonly DXLinkIndiChartCandle[], kind: CandleBatchKind) => void
  /** Drop everything drawn so far. */
  reset: () => void
}

/**
 * The shape dxcharts-lite takes. Built structurally rather than against the library's
 * `PartialCandle`, which is only reachable through a deep `dist/` path — naming it here
 * would put that path in this package's published declarations.
 */
interface ChartCandle {
  id: string
  timestamp: number
  open: number
  close: number
  hi: number
  lo: number
  volume: number
}

/**
 * A protocol candle carries a `JSONNumber`, which encodes the three non-finite doubles as
 * strings because JSON has no literal for them. The chart wants a real number, and the
 * string forms map onto exactly the values they name.
 */
const num = (value: JSONNumber): number => {
  if (typeof value === 'number') return value
  if (value === 'Infinity') return Number.POSITIVE_INFINITY
  if (value === '-Infinity') return Number.NEGATIVE_INFINITY
  return Number.NaN
}

const toChartCandle = (candle: DXLinkIndiChartCandle): ChartCandle => ({
  // `index` is the candle's identity in the protocol, and is what an update re-sends to
  // replace an earlier candle. Handing it to the chart as `id` is what makes `updateData`
  // overwrite in place instead of appending a duplicate.
  id: String(candle.index),
  timestamp: candle.time,
  open: num(candle.open),
  close: num(candle.close),
  hi: num(candle.high),
  lo: num(candle.low),
  volume: num(candle.volume),
})

/**
 * The palette values the chart needs, as literal colours canvas can paint with.
 *
 * Structural rather than MUI's `Palette`, because it is satisfied by both `theme.palette` and
 * a `theme.colorSchemes[...].palette`, and those are different types.
 */
interface ChartPalette {
  background: { paper: string; default: string }
  text: { primary: string; secondary: string }
  divider: string
  success: { main: string }
  error: { main: string }
}

/**
 * The palette of the scheme actually on screen.
 *
 * `useTheme().palette` is **not** it. The theme is built with `cssVariables` + `colorSchemes`,
 * so the palette exposed in JS is the default scheme's — the dark values live under
 * `colorSchemes.dark` and, at runtime, in the `--mui-palette-*` custom properties. Anything
 * styled through CSS therefore follows the scheme for free, and anything painting to a canvas
 * has to ask for the right scheme by name. This is the same trap as `palette.mode`, one level
 * down: the values lie, not just the label.
 *
 * Falls back to `theme.palette` for a host whose theme declares no color schemes. The cast is
 * the price of asking: `useTheme()` is typed as the base `Theme`, which does not declare
 * `colorSchemes` — only a theme built with `cssVariables` carries it, and MUI offers no
 * narrowing for that. `theme.vars` is not an alternative, since it yields `var(...)` strings
 * and canvas needs a literal colour.
 */
const schemePalette = (theme: Theme, scheme: ResolvedColorScheme): ChartPalette => {
  const { colorSchemes } = theme as unknown as {
    colorSchemes?: Partial<Record<ResolvedColorScheme, { palette: ChartPalette }>>
  }
  return colorSchemes?.[scheme]?.palette ?? theme.palette
}

/**
 * Chart colours, from the MUI theme.
 *
 * The `@dxscript` wrapper this replaced read `--dx-chart-*` custom properties off the
 * document root, which is why the app had to map them onto the MUI palette in a global
 * `CssBaseline`. Vanilla dxcharts-lite takes its colours as config instead, so the mapping
 * happens here and a host embedding this package needs no global stylesheet of its own.
 */
const chartColors = (palette: ChartPalette) => {
  const up = palette.success.main
  const down = palette.error.main
  const candleTheme = {
    upColor: up,
    downColor: down,
    noneColor: palette.text.secondary,
    upWickColor: up,
    downWickColor: down,
    noneWickColor: palette.text.secondary,
  }
  return {
    candleTheme,
    activeCandleTheme: candleTheme,
    chartAreaTheme: {
      backgroundMode: 'regular' as const,
      backgroundColor: palette.background.paper,
      backgroundGradientTopColor: palette.background.paper,
      backgroundGradientBottomColor: palette.background.paper,
      gridColor: palette.divider,
    },
    yAxis: {
      backgroundColor: palette.background.paper,
      zeroPercentLine: palette.divider,
      labelTextColor: palette.text.secondary,
      labelInvertedTextColor: palette.background.paper,
      labelBoxColor: palette.text.secondary,
      rectLabelTextColor: palette.text.primary,
      rectLabelInvertedTextColor: palette.background.paper,
    },
    xAxis: {
      backgroundColor: palette.background.paper,
      labelTextColor: palette.text.secondary,
    },
    crossTool: {
      lineColor: palette.text.secondary,
      labelBoxColor: palette.background.default,
      labelTextColor: palette.text.primary,
    },
    waterMarkTheme: {
      firstRowColor: 'transparent',
      secondRowColor: 'transparent',
      thirdRowColor: 'transparent',
    },
  }
}

/**
 * Candle chart over vanilla dxcharts-lite.
 *
 * The library is imperative and owns its own canvas, so the chart is created once against a
 * container `div` and driven through a ref rather than re-rendered. Candles are kept here as
 * well as in the chart, for one reason: a colour scheme is fixed at creation, so following a
 * light/dark switch means creating a new chart, and a new chart starts empty.
 */
export const CandleChart = forwardRef<CandleChartHandle, { height?: number }>(
  ({ height = 360 }, ref) => {
    const container = useRef<HTMLDivElement>(null)
    const chart = useRef<Chart | null>(null)
    // Insertion-ordered by candle id, which is the order the chart draws them in.
    const drawn = useRef(new Map<string, ChartCandle>())

    const theme = useTheme()
    const scheme = useResolvedColorScheme()
    const colors = chartColors(schemePalette(theme, scheme))

    useEffect(() => {
      const element = container.current
      if (element === null) return
      const instance = createChart(element, { colors })
      chart.current = instance
      // Restore what a previous instance was showing — this effect re-runs on a scheme
      // change, and the candles are not re-sent by the server.
      if (drawn.current.size > 0) {
        instance.setData({ candles: [...drawn.current.values()] })
      }
      return () => {
        chart.current = null
        instance.destroy()
      }
      // Deliberately keyed on the scheme alone, not on `colors`: that object is rebuilt on
      // every render and would thrash a chart that owns a canvas and a resize observer. The
      // palette only actually changes when the scheme does.
    }, [scheme])

    useImperativeHandle(ref, () => ({
      push: (candles, kind) => {
        const mapped = candles.map(toChartCandle)
        if (kind === 'candles') {
          drawn.current = new Map(mapped.map((candle) => [candle.id, candle]))
          chart.current?.setData({ candles: mapped })
          return
        }
        for (const candle of mapped) {
          drawn.current.set(candle.id, candle)
        }
        chart.current?.updateData({ candles: mapped })
      },
      reset: () => {
        drawn.current = new Map()
        chart.current?.setData({ candles: [] })
      },
    }))

    return <Box ref={container} sx={{ height, width: '100%' }} />
  }
)

CandleChart.displayName = 'CandleChart'
