import type { DXLinkIndiChartCandle } from '@dxfeed/dxlink-api'
import { unit } from '@dxfeed/ui-kit/utils'
import { IndiChart, type IndiChartHandle } from '@dxscript/dxlink-dxcharts-lite'
import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { CandlesSubscription } from './candles-subscription'
import type { DXLinkCandleData, DXLinkCandleEvent, DXLinkCandles } from '../candles/candles'
import { ContentTemplate } from '../common/content-template'

const ChartContainer = styled(IndiChart)`
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

const toIndiChartCandle = (event: Readonly<DXLinkCandleEvent>): DXLinkIndiChartCandle => ({
  eventSymbol: event.eventSymbol,
  index: event.index,
  time: event.time,
  open: event.open,
  high: event.high,
  low: event.low,
  close: event.close,
  volume: event.volume,
})

export function CandlesChannelManager({ channel }: CandlesChannelManagerProps) {
  const [data, setData] = useState<DXLinkCandleData>()
  const ref = useRef<IndiChartHandle>(null)

  useEffect(() => {
    channel.addListener(setData)

    return () => {
      channel.removeListener(setData)
    }
  }, [channel])

  useEffect(() => {
    if (!data) {
      return
    }

    const candles = data.events.map(toIndiChartCandle)
    ref.current?.pushData(candles, [], data.isSnapshot ? 'candles' : 'update')
  }, [data])

  return (
    <>
      <Group>
        <CandlesSubscription onSet={channel.setSubscription} />{' '}
      </Group>

      <ChartGroup available={data !== undefined}>
        <ContentTemplate title={'Chart'}>
          <ChartContainer
            ref={ref}
            onIndicatorError={(chartError) => {
              if (chartError) {
                console.error(chartError)
              }
            }}
          />
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
