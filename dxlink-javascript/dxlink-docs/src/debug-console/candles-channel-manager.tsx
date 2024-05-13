import { createChart, Chart } from '@devexperts/dxcharts-lite'
import { unit } from '@dxfeed/ui-kit/utils'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { candleChartColors } from './candles-chart'
import { CandlesSubscription } from './candles-subscription'
import type { DXLinkCandleSnapshot, DXLinkCandles } from '../candles/candles'
import { ContentTemplate } from '../common/content-template'

const ChartContainer = styled.div`
  width: 100%;
  height: 400px;
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

interface CandlesChannelManagerProps {
  channel: DXLinkCandles
}

export function CandlesChannelManager({ channel }: CandlesChannelManagerProps) {
  const [snapshot, setSnapshot] = useState<DXLinkCandleSnapshot>()
  const [chart, setChart] = useState<Chart>()

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chartInstance = createChart(ref.current!, {
      colors: candleChartColors,
      components: {
        waterMark: {
          visible: true,
        },
      },
    })

    const listener = (snapshot: DXLinkCandleSnapshot) => {
      setSnapshot(snapshot)
    }
    channel.addListener(listener)

    setChart(chartInstance)

    return () => {
      chartInstance.destroy()
      channel.removeListener(listener)
    }
  }, [channel])

  useEffect(() => {
    if (!snapshot || !chart) {
      return
    }

    const symbol = snapshot?.events[0]?.eventSymbol ?? 'N/A'
    console.log('Candles snapshot:', symbol)
    const candles = snapshot.events.map((event) => ({
      hi: Number(event.high),
      lo: Number(event.low),
      open: Number(event.open),
      close: Number(event.close),
      timestamp: event.time,
      volume: Number(event.volume),
      idx: event.index,
    }))

    chart.watermarkComponent.setWaterMarkData({
      firstRow: symbol,
    })

    if (snapshot.isFirst) {
      chart.setData({
        candles,
        instrument: {
          symbol,
        },
      })
      return
    }

    chart.updateData({
      candles,
      instrument: {
        symbol,
      },
    })
  }, [snapshot, chart])

  return (
    <>
      <Group>
        <CandlesSubscription onSet={channel.setSubscription} />{' '}
      </Group>

      <ChartGroup available={snapshot !== undefined}>
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
