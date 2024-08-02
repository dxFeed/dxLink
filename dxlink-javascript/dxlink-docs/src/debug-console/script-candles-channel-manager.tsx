import { createChart, Chart } from '@devexperts/dxcharts-lite'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { candleChartColors } from './candles-chart'
import { ScriptCandlesSubscription } from './script-candles-subscription'
import type { DXLinkScriptCandles, DXLinkCandleData } from '../candles/script-candles'
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
  channel: DXLinkScriptCandles
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

  const handleDataUpdate = (data: DXLinkCandleData, chart: Chart) => {
    const candles = data.events.map((event) => ({
      hi: Number(event.high),
      lo: Number(event.low),
      open: Number(event.open),
      close: Number(event.close),
      timestamp: event.time,
      volume: Number(event.volume),
      idx: event.index,
    }))

    const results = data.events.reduce<Record<string, { timestamp: number; close: number }[]>>(
      (result, event) => {
        const timestamp = event.time

        Object.keys(event.result).forEach((key) => {
          const value = Number(event.result[key])
          if (value !== undefined) {
            result[key] = result[key] ?? []
            const prevResult = result[key][result[key].length - 1]
            if (Number.isNaN(value)) {
              console.warn('NaN value', timestamp, key)
              result[key].push({ timestamp, close: prevResult?.close ?? 0 })
              return
            }
            result[key].push({ timestamp, close: value })
          }
        })

        return result
      },
      {}
    )
    const resultKeys = Object.keys(results)

    // If it's a snapshot, we need to set data instead of updating it
    if (data.isSnapshot) {
      const symbol = data?.events[0]?.eventSymbol ?? 'N/A'

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

        pane.dataSeries[0]?.setDataPoints(results[key]!)
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

    const listener = (data: DXLinkCandleData) => handleDataUpdate(data, chart)
    channel.addListener(listener)

    return () => {
      channel.removeListener(listener)
      chart.destroy()
    }
  }, [channel])

  return (
    <>
      <Group>
        <ScriptCandlesSubscription onSet={channel.set} />{' '}
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
