import { createChart, Chart } from '@devexperts/dxcharts-lite'
import {
  DXLinkChannelState,
  type DXLinkIndiChartCandle,
  type DXLinkIndiChartIndicator,
  type DXLinkIndiChartIndicatorParameterMeta,
  type DXLinkIndiChartIndicatorsData,
  type DXLinkIndiChartSubscription,
} from '@dxfeed/dxlink-api'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { candleChartColors } from './candles-chart'
import { ParameterFieldContainer } from './parameter-field-container'
import { ScriptCandlesSubscription } from './script-candles-subscription'
import { SortedList } from '../candles/sorted-list'
import type { ChartDataType, ChartHolder } from '../chart-wrapper'
import { ContentTemplate } from '../common/content-template'
import type { DXLinkIndiChartSubscriptionMessage } from '../../../dxlink-indichart/build/messages'

const ChartContainer = styled.div`
  width: 100%;
  height: 600px;
  border: 1px solid ${({ theme }) => theme.palette.separator.primary};
`

const Group = styled.div`
  padding-bottom: ${unit(1.5)};
`

const ChartGroup = styled.div<{ available: boolean }>`
  display: ${(props) => (props.available ? 'block' : 'none')};
`

const Powered = styled.div`
  text-align: right;
  padding-top: ${unit(1)};
  color: ${({ theme }) => theme.palette.secondary.main};
  ${(p) => p.theme.typography.body.regular[3]}
`

interface ScriptCandlesChannelManagerProps {
  channel: ChartHolder
}

const stringToColour = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  let colour = '#'
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff
    colour += ('00' + value.toString(16)).substr(-2)
  }
  return colour
}

// Metadata cache for indicator series (title, color, offset)
interface SeriesMetadata {
  title: string
  color?: string
  offset: number
}

// Helper to extract numeric value from indicator data point
// Values can be either a number or an object with {value, title?, color?, offset?}
const extractValue = (val: unknown): number => {
  if (val && typeof val === 'object' && 'value' in val) {
    return Number((val as { value: unknown }).value)
  }
  return Number(val)
}

// Helper to extract metadata from the first element
const extractMetadata = (
  values: unknown[],
  key: string,
  cache: Record<string, SeriesMetadata>
): SeriesMetadata => {
  const first = values[0]
  if (first && typeof first === 'object') {
    const obj = first as { title?: string; color?: { value?: string } | string; offset?: number }
    if (obj.title) {
      // Color can be either {value: "green"} or just "green" string
      let colorValue: string | undefined
      if (obj.color) {
        if (typeof obj.color === 'object' && 'value' in obj.color) {
          colorValue = obj.color.value?.toLowerCase()
        } else if (typeof obj.color === 'string') {
          colorValue = obj.color.toLowerCase()
        }
      }
      cache[key] = {
        title: obj.title,
        color: colorValue,
        offset: obj.offset || 0,
      }
    }
  }
  return cache[key] || { title: key, offset: 0 }
}

// Helper to process indicators and map them to candle timestamps
const processIndicators = (
  indicators: DXLinkIndiChartIndicatorsData[],
  candles: { timestamp: number; idx: number; close: number }[],
  seriesMetadataRef: React.MutableRefObject<Record<string, SeriesMetadata>>
): Record<string, { timestamp: number; idx: number; close: number }[]> => {
  const results: Record<string, { timestamp: number; idx: number; close: number }[]> = {}

  // Structure: indicators = [{current: {output: {}, spline: {adl: [...], zero: [...]}}}]
  // Level 1: indicators array
  // Level 2: indicator object (e.g. {current: ...})
  // Level 3: output types (e.g. {output: {}, spline: {...}})
  // Level 4: actual series data (e.g. {adl: [...], zero: [...]})
  for (const data of indicators) {
    for (const outputTypes of Object.values(data)) {
      // outputTypes = {output: {}, spline: {...}}
      for (const seriesData of Object.values(outputTypes)) {
        // seriesData = {} or {adl: [...], zero: [...]}
        if (typeof seriesData !== 'object' || seriesData === null) continue

        Object.keys(seriesData).forEach((key) => {
          const values = (seriesData as unknown as Record<string, unknown[]>)[key]
          if (!Array.isArray(values) || values.length === 0) return

          // Extract metadata (title, color, offset) from first element
          const metadata = extractMetadata(values, key, seriesMetadataRef.current)
          const seriesTitle = metadata.title
          const seriesOffset = metadata.offset

          const base = results[seriesTitle] ?? []
          const offset = base.length

          results[seriesTitle] = values.reduce<{ timestamp: number; idx: number; close: number }[]>(
            (acc, value, index) => {
              const candleIndex = offset + index + seriesOffset
              const candle = candles[candleIndex]
              if (candle === undefined) {
                console.error('Illegal state, candle not found at index', candleIndex)
                return acc
              }

              acc.push({
                timestamp: candle.timestamp,
                idx: candle.idx,
                close: extractValue(value),
              })

              return acc
            },
            base
          )
        })
      }
    }
  }

  return results
}

export function ScriptCandlesChannelManager({ channel }: ScriptCandlesChannelManagerProps) {
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [inParameters, setInParameters] = useState<DXLinkIndiChartIndicatorParameterMeta[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart>()
  const seriesMetadataRef = useRef<Record<string, SeriesMetadata>>({})
  // Store candles for indicator snapshot processing
  const candlesRef = useRef<{ timestamp: number; idx: number; close: number }[]>([])

  const handleDataUpdate = (
    events: DXLinkIndiChartCandle[],
    indicators: DXLinkIndiChartIndicatorsData[],
    dataType: ChartDataType,
    chart: Chart
  ) => {
    const candles = events.map((event) => ({
      hi: Number(event.high),
      lo: Number(event.low),
      open: Number(event.open),
      close: Number(event.close),
      timestamp: event.time,
      volume: Number(event.volume),
      idx: event.index,
    }))

    // Handle candles snapshot - draw candles only
    if (dataType === 'candles') {
      // Reset metadata cache on candles snapshot
      seriesMetadataRef.current = {}
      // Store candles for later indicator processing
      candlesRef.current = candles

      const symbol = events[0]?.eventSymbol ?? 'N/A'

      chart.watermarkComponent.setWaterMarkData({
        firstRow: symbol,
      })

      chart.setData({
        candles,
        instrument: {
          symbol,
        },
      })

      // Remove existing indicator panes (except CHART)
      Object.keys(chart.paneManager.panes).forEach((pane) => {
        if (pane !== 'CHART') {
          chart.paneManager.removePane(pane)
        }
      })

      setAvailable(true)
      return
    }

    // Handle indicators snapshot - draw indicators using stored candles
    if (dataType === 'indicators') {
      const storedCandles = candlesRef.current
      if (storedCandles.length === 0) {
        console.error('No candles available for indicator processing')
        return
      }

      const results = processIndicators(indicators, storedCandles, seriesMetadataRef)
      const resultKeys = Object.keys(results)

      for (const key of resultKeys) {
        let pane = chart.paneManager.panes[key]
        if (pane === undefined) {
          pane = chart.paneManager.createPane(key, {
            cursor: key,
          })
          pane.yAxis.changeLabelsDescriptionVisibility(true)
        }

        let series = pane.dataSeries[0]
        if (series === undefined) {
          series = pane.createDataSeries()
          series.name = key

          // Find seriesInfo from metadata cache where title matches the key
          const seriesInfo = Object.values(seriesMetadataRef.current).find(
            (meta) => meta.title === key
          )

          const paintConfig = series.config.paintConfig[0]
          if (paintConfig !== undefined) {
            // Use color from metadata if available, otherwise use generated color
            paintConfig.color = seriesInfo?.color || stringToColour(key)
          }
          series.config.visible = true
          series.config.labelLastValue = 'series'
          series.config.labelMode = 'line-label'
          series.config.labelAppearanceType = 'badge'
          pane.yAxis.registerYAxisLabelsProvider(series.yAxisLabelProvider)
        } else {
          // Update color if it changed in metadata
          const seriesInfo = Object.values(seriesMetadataRef.current).find(
            (meta) => meta.title === key
          )
          const paintConfig = series.config.paintConfig[0]
          if (paintConfig !== undefined && seriesInfo?.color) {
            paintConfig.color = seriesInfo.color
          }
        }

        series.setDataPoints(results[key]!)
      }

      // Remove panes that are no longer in results
      Object.keys(chart.paneManager.panes).forEach((pane) => {
        if (!resultKeys.includes(pane) && pane !== 'CHART') {
          chart.paneManager.removePane(pane)
        }
      })

      return
    }

    // Handle regular update - update both candles and indicators
    const results = processIndicators(indicators, candles, seriesMetadataRef)
    const resultKeys = Object.keys(results)

    chart.updateData({
      candles,
    })

    for (const key of resultKeys) {
      try {
        const pane = chart.paneManager.panes[key]
        if (pane === undefined) return

        const points = pane.dataSeries[0]?.dataPoints ?? []
        const sortedPoints = SortedList.from(points, (a, b) => a.timestamp - b.timestamp)

        for (const point of results[key]!) {
          sortedPoints.insert(point)
        }

        const newPoints = Array.from(sortedPoints.toArray())

        pane.dataSeries[0]?.setDataPoints(newPoints)
        pane.yAxis.model.fancyLabelsModel.updateLabels()
      } catch (e) {
        console.error(e)
      }
    }
  }

  useEffect(() => {
    const chart = createChart(ref.current!, {
      colors: candleChartColors,
      components: {
        waterMark: {
          visible: true,
        },
      },
    })

    chartRef.current = chart

    return () => {
      chart.destroy()
    }
  }, [channel])

  const handleSet = (sub: DXLinkIndiChartSubscription, indicator: DXLinkIndiChartIndicator) => {
    setError(undefined)

    channel.update(
      sub,
      indicator,
      (candles, indicators, dataType) => {
        handleDataUpdate(candles, indicators, dataType, chartRef.current!)
      },
      (params) => setInParameters(params),
      setError
    )
  }

  const handleOnApply = (values: Record<string, any>) => {
    channel.getChart()?.updateIndicatorsParameters({ current: values })
  }

  const handleReset = () => {
    channel.clear()
    setInParameters([])
    setAvailable(false)
  }

  return (
    <>
      <Group>
        <ScriptCandlesSubscription onSet={handleSet} onReset={handleReset} error={error} />{' '}
      </Group>

      {(inParameters.length > 0 && available) && (
        <ContentTemplate title={'Input Parameters'}>
          <ParameterFieldContainer parameters={inParameters} onApply={handleOnApply} />
        </ContentTemplate>
      )}

      {inParameters.length > 0 && <div style={{ height: '16px' }} />}

      <ChartGroup available={available}>
        <ContentTemplate title={'Chart'}>
          <ChartContainer ref={ref} />
          <Powered>
            Chart powered by{' '}
            <a href="https://devexperts.com/dxcharts/" target="_blank" rel="noreferrer">
              DXCharts
            </a>
          </Powered>
        </ContentTemplate>
      </ChartGroup>
    </>
  )
}
