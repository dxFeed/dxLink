import { createChart, Chart } from '@devexperts/dxcharts-lite'
import type {
  DXLinkChart,
  DXLinkChartCandle,
  DXLinkChartIndicatorsData,
  DXLinkChartSubscription,
} from '@dxfeed/dxlink-api'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { candleChartColors } from './candles-chart'
import { ScriptCandlesSubscription } from './script-candles-subscription'
import type { DXLinkCandleSubscription } from '../candles/candles'
import { SortedList } from '../candles/sorted-list'
import type { ChartHolder } from '../chart-wrapper'
import { ContentTemplate } from '../common/content-template'

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

export function ScriptCandlesChannelManager({ channel }: ScriptCandlesChannelManagerProps) {
  const [available, setAvailable] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart>()

  const handleDataUpdate = (
    events: DXLinkChartCandle[],
    indicators: DXLinkChartIndicatorsData[],
    snapshot: boolean,
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

    const results: Record<string, { timestamp: number; idx: number; close: number }[]> = {}
    for (const data of indicators) {
      for (const outs of Object.values(data)) {
        Object.keys(outs).forEach((key) => {
          const values = outs[key]!

          const base = results[key] ?? []
          const offset = base.length

          results[key] = values.reduce<{ timestamp: number; idx: number; close: number }[]>(
            (values, value, index) => {
              const candle = candles[offset + index]
              if (candle === undefined) {
                console.error('Illegal state, candle not found')
                return values
              }

              values.push({ timestamp: candle.timestamp, idx: candle.idx, close: Number(value) })

              return values
            },
            base
          )
        })
      }
    }

    console.log('Candles', candles, 'Indicators', results)

    const resultKeys = Object.keys(results)

    // If it's a snapshot, we need to set data instead of updating it
    if (snapshot) {
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

      for (const key of resultKeys) {
        let pane = chart.paneManager.panes[key]
        if (pane === undefined) {
          pane = chart.paneManager.createPane(key, {
            cursor: key,
          })
          pane.yAxis.changeLabelsDescriptionVisibility(true)
          console.log('Create pane', key, pane)
        }

        let series = pane.dataSeries[0]
        if (series === undefined) {
          series = pane.createDataSeries()
          series.name = key
          const paintConfig = series.config.paintConfig[0]
          if (paintConfig !== undefined) {
            paintConfig.color = stringToColour(key)
          }
          series.config.visible = true
          series.config.labelLastValue = 'series'
          series.config.labelMode = 'line-label'
          series.config.labelAppearanceType = 'badge'
          pane.yAxis.registerYAxisLabelsProvider(series.yAxisLabelProvider)
          console.log('Create series', key, series)
        }

        series.setDataPoints(results[key]!)
      }

      chart.paneManager.panesOrder.forEach((pane) => {
        if (!resultKeys.includes(pane) && pane !== 'CHART') {
          chart.paneManager.removePane(pane)
          console.log('Remove pane', pane)
        }
      })

      setAvailable(true)

      return
    }

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
        console.log('last indicator value', key, newPoints[newPoints.length - 1])
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
      console.log('Destroy chart')
      chart.destroy()
    }
  }, [channel])

  const handleSet = (sub: DXLinkChartSubscription, indicator: string) => {
    channel.update(sub, indicator, (candles, indicators, snapshot) => {
      handleDataUpdate(candles, indicators, snapshot, chartRef.current!)
    })
  }

  return (
    <>
      <Group>
        <ScriptCandlesSubscription onSet={handleSet} />{' '}
      </Group>

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
